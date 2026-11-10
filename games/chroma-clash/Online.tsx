/**
 * Chroma Clash Online — Server-Authoritative Multiplayer Rooms (Supabase + RLS).
 *
 * Security model:
 * - All hands and the draw pile stay inside `public.chroma_secrets` on PostgreSQL
 *   (RLS enabled, all privileges revoked from `anon` and `authenticated`).
 * - Every move (`chroma_play`, `chroma_draw`, `chroma_pass`, `chroma_announce`,
 *   `chroma_counter_uno`, `chroma_bot_step`) is validated by a `SECURITY DEFINER`
 *   RPC that checks `auth.uid()`, turn order, and card ownership.
 * - Each client reads its view via `chroma_state(p_room)`, which returns ONLY
 *   the caller's `my_hand`, `top_card`, `draw_count`, and each seat's `hand_count`.
 * - Room updates use `watchRoom` (`postgres_changes` on `public.party_rooms`,
 *   protected by the `party_is_member(id)` RLS policy).
 */
import {
  ArrowLeftRight,
  Bot,
  Check,
  Copy,
  Crown,
  Layers,
  LogOut,
  Megaphone,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Siren,
  Sparkles,
  Trophy,
  Users,
  Wifi,
} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  CODE_PATTERN,
  ensureSession,
  lastRoom,
  ONLINE_AVAILABLE,
  rememberRoom,
  roomLink,
  rpc,
  watchRoom,
} from '../_party/online';
import {Shell} from '../_party/ui';
import {
  cardLabel,
  COLOR_LABELS,
  COLORS,
  GAME_SCORE_WIN,
  isPenalty,
  isWild,
  MAX_SEATS,
  MIN_SEATS,
  type Card,
  type Color,
  type Rules,
} from './logic';
import {sfxCardDraw, sfxCardPlay, sfxPenalty, sfxUnoCall, sfxWinRound} from './sound';

/** Keeps ?salon=CODE in the address bar so a refresh rejoins the same room. */
function setUrlCode(code: string | null) {
  try {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set('salon', code);
    else url.searchParams.delete('salon');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* ignore (sandboxed iframe) */
  }
}

interface ServerMember {
  user_id: string;
  name: string;
  seat: number;
  is_host: boolean;
  is_me: boolean;
}

interface ServerSeat {
  seat: number;
  name: string;
  bot: boolean;
  is_me: boolean;
  hand_count: number;
  score: number;
}

interface ServerTable {
  top_card: Card;
  draw_count: number;
  current_seat: number;
  direction: 1 | -1;
  active_color: Color;
  pending_draw: number;
  drawn_card_id: number | null;
  announced: boolean;
  vulnerable_seat: number | null;
  winner_seat: number | null;
  round_points: number;
  last_event: string;
  my_seat: number | null;
  my_hand: Card[];
  seats: ServerSeat[];
}

interface ChromaServerState {
  room: {
    id: string;
    code: string;
    status: 'lobby' | 'playing' | 'ended';
    phase: 'lobby' | 'playing' | 'ended';
    round: number;
    settings: {
      bots?: number;
      combos?: boolean;
      stacking?: boolean;
      sevenZero?: boolean;
    };
    host_id: string;
    version: number;
    server_now: string;
  };
  me: {
    user_id: string;
    is_host: boolean;
  };
  members: ServerMember[];
  table: ServerTable | null;
}

/** Client-side legality check for highlighting the caller's own cards (server re-verifies on play). */
function canPlayOnTable(card: Card, table: ServerTable, rules: Rules): boolean {
  if (table.drawn_card_id !== null && card.id !== table.drawn_card_id) return false;
  if (table.pending_draw > 0) return rules.stacking && isPenalty(card);
  if (isWild(card)) return true;
  if (card.color === table.active_color) return true;
  const t = table.top_card;
  if (card.kind === 'num') return t.kind === 'num' && t.value === card.value;
  return card.kind === t.kind;
}

function validSelectionOnTable(ids: number[], myHand: Card[], table: ServerTable, rules: Rules): boolean {
  if (ids.length === 0 || table.winner_seat !== null) return false;
  const cards = ids.map((id) => myHand.find((c) => c.id === id));
  if (cards.some((c) => !c) || new Set(ids).size !== ids.length) return false;
  const [first, ...rest] = cards as Card[];
  if (!canPlayOnTable(first, table, rules)) return false;
  if (rest.length === 0) return true;
  if (!rules.combos || table.drawn_card_id !== null || first.kind !== 'num') return false;
  return rest.every((c) => c.kind === 'num' && c.value === first.value);
}

const SUIT_BADGE: Record<Color, {bg: string; text: string; glyph: string}> = {
  cyan: {bg: 'linear-gradient(145deg, #1cb5ff 0%, #0089d0 60%, #005b94 100%)', text: '#38e1ff', glyph: '●'},
  rose: {bg: 'linear-gradient(145deg, #ff4b55 0%, #ef1c24 60%, #a80710 100%)', text: '#ff6b78', glyph: '▲'},
  ambre: {bg: 'linear-gradient(145deg, #ffe047 0%, #ffc619 60%, #d98200 100%)', text: '#ffd13b', glyph: '■'},
  vert: {bg: 'linear-gradient(145deg, #5ce63c 0%, #38b61a 60%, #1d7509 100%)', text: '#5ce63c', glyph: '◆'},
};

function OnlineCardButton({
  card,
  selected,
  disabled,
  onClick,
}: {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const wild = isWild(card);
  const suit = card.color ? SUIT_BADGE[card.color] : null;
  const sym =
    card.kind === 'num'
      ? String(card.value)
      : card.kind === 'bond'
        ? '⊘'
        : card.kind === 'retour'
          ? '⇄'
          : card.kind === 'plus2'
            ? '+2'
            : card.kind === 'prisme'
              ? '◈'
              : '+3';

  const content = (
    <span
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[0.65rem] border border-black/30"
      style={{
        background: wild ? 'linear-gradient(135deg, #1b2234 0%, #090c14 100%)' : suit!.bg,
      }}>
      <span
        aria-hidden
        className="absolute left-1.5 top-1 font-display text-xs font-black text-white"
        style={{textShadow: '0 1.5px 0 #000'}}>
        {sym}
      </span>
      <span
        aria-hidden
        className="flex h-11 w-11 rotate-45 items-center justify-center rounded-lg bg-white shadow-inner">
        <span
          className="-rotate-45 font-display text-xl font-black"
          style={{color: wild ? '#ef1c24' : suit?.text ?? '#fff', textShadow: '1px 1px 0 #000'}}>
          {sym}
        </span>
      </span>
      <span
        aria-hidden
        className="absolute bottom-1 right-1.5 rotate-180 font-display text-xs font-black text-white"
        style={{textShadow: '0 1.5px 0 #000'}}>
        {sym}
      </span>
    </span>
  );

  if (!onClick) {
    return (
      <span
        role="img"
        aria-label={cardLabel(card)}
        className="inline-block h-[6.8rem] w-[4.8rem] rounded-2xl bg-white p-[3px] shadow-xl">
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={cardLabel(card)}
      className={`h-[6.8rem] w-[4.8rem] rounded-2xl bg-white p-[3px] transition-all ${
        selected
          ? '-translate-y-3 scale-105 ring-4 ring-[#38e1ff] shadow-xl'
          : disabled
            ? 'opacity-40 saturate-75'
            : 'hover:-translate-y-2 shadow-lg'
      }`}>
      {content}
    </button>
  );
}

const GAME_SLUG = 'chroma-clash';

export function OnlineGame({initialCode, onExit}: {initialCode: string | null; onExit: () => void}) {
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState(initialCode ?? '');
  const [roomId, setRoomId] = useState<string | null>(() => (initialCode ? null : lastRoom(GAME_SLUG)));
  const [state, setState] = useState<ChromaServerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [selected, setSelected] = useState<number[]>([]);
  const [colorPick, setColorPick] = useState<number[] | null>(null);
  const [swapPick, setSwapPick] = useState<{ids: number[]; color: Color | null} | null>(null);

  const prevWinnerRef = useRef<number | null>(null);

  const refresh = useCallback(async (id: string) => {
    try {
      const next = await rpc<ChromaServerState>('chroma_state', {p_room: id});
      setState(next);
      setUrlCode(next.room.code);
    } catch {
      rememberRoom(GAME_SLUG, null);
      setUrlCode(null);
      setRoomId(null);
      setState(null);
    }
  }, []);

  // Reconnect & subscribe to RLS-protected `party_rooms` Postgres changes
  useEffect(() => {
    if (!roomId || !ONLINE_AVAILABLE) return;
    let active = true;
    void ensureSession()
      .then(() => {
        if (active) return refresh(roomId);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    const stop = watchRoom(roomId, () => {
      if (active) void refresh(roomId);
    });
    return () => {
      active = false;
      stop();
    };
  }, [roomId, refresh]);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (roomId) await refresh(roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action refusée par le serveur');
    } finally {
      setBusy(false);
    }
  }

  function handleCreate() {
    const clean = name.trim();
    if (!clean) {
      setError('Entre ton prénom pour créer un salon.');
      return;
    }
    void act(async () => {
      await ensureSession();
      const res = await rpc<{room_id: string; code: string}>('party_create_room', {
        p_game: GAME_SLUG,
        p_name: clean,
      });
      rememberRoom(GAME_SLUG, res.room_id);
      setUrlCode(res.code);
      setRoomId(res.room_id);
      await refresh(res.room_id);
    });
  }

  function handleJoin() {
    const clean = name.trim();
    const code = joinCode.trim().toUpperCase();
    if (!clean) {
      setError('Entre ton prénom pour rejoindre.');
      return;
    }
    if (!CODE_PATTERN.test(code)) {
      setError('Le code du salon doit contenir 6 caractères (ex : K7M4P9).');
      return;
    }
    void act(async () => {
      await ensureSession();
      const res = await rpc<{room_id: string; code: string}>('party_join_room', {
        p_code: code,
        p_name: clean,
      });
      rememberRoom(GAME_SLUG, res.room_id);
      setUrlCode(res.code);
      setRoomId(res.room_id);
      await refresh(res.room_id);
    });
  }

  function handleLeave() {
    const id = roomId;
    rememberRoom(GAME_SLUG, null);
    setUrlCode(null);
    setRoomId(null);
    setState(null);
    if (id) {
      void rpc('party_leave_room', {p_room: id}).catch(() => {});
    }
    onExit();
  }

  const isHost = state?.me.is_host ?? false;
  const table = state?.table ?? null;

  // Play win sound once when a round finishes
  useEffect(() => {
    const w = table?.winner_seat ?? null;
    if (w !== null && prevWinnerRef.current === null) {
      sfxWinRound();
    }
    prevWinnerRef.current = w;
  }, [table?.winner_seat]);

  // Host triggers server-side bot moves when a bot seat is on turn
  useEffect(() => {
    if (!roomId || !state || !table || !isHost) return;
    if (table.winner_seat !== null) return;
    const currentSeat = table.seats[table.current_seat];
    if (!currentSeat?.bot) return;

    const timer = window.setTimeout(() => {
      void rpc('chroma_bot_step', {p_room: roomId})
        .then(() => refresh(roomId))
        .catch(() => {});
    }, 850);
    return () => window.clearTimeout(timer);
  }, [roomId, state?.room.version, table?.current_seat, table?.winner_seat, isHost, refresh, state, table]);

  // Clear card selection whenever turn or drawn card changes
  useEffect(() => {
    setSelected([]);
  }, [table?.current_seat, table?.drawn_card_id, state?.room.round]);

  if (!ONLINE_AVAILABLE) {
    return (
      <Shell title="Chroma Clash · En ligne" kicker="Configuration requise" onBack={onExit}>
        <section className="panel space-y-3 p-5">
          <p className="text-sm text-muted">
            Le mode multijoueur en ligne nécessite la connexion au serveur Supabase. Tu peux jouer immédiatement en mode
            Solo &amp; IA sur cet appareil.
          </p>
        </section>
      </Shell>
    );
  }

  // ---------------- 1. ENTRY SCREEN (CREATE OR JOIN ROOM) ----------------
  if (!roomId || !state) {
    return (
      <Shell title="Chroma Clash · En ligne" kicker="Salons Multijoueurs Sécurisés" onBack={onExit}>
        <section className="panel space-y-3 p-5">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#38e1ff]">
            <Wifi size={14} aria-hidden /> Serveur autoritaire · Mains secrètes isolées par joueur
          </div>
          <label className="block text-sm font-semibold" htmlFor="chroma-online-name">
            Ton prénom
          </label>
          <input
            id="chroma-online-name"
            className="input"
            placeholder="Ex. : Camille"
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </section>

        {!initialCode && (
          <section className="panel mt-4 space-y-3 p-5">
            <h2 className="text-lg font-bold">Nouvelle table en ligne</h2>
            <p className="text-sm text-muted">
              Crée un salon privé à 6 lettres et partage le code ou le lien d’invitation avec tes amis.
            </p>
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={handleCreate}>
              <Sparkles size={18} aria-hidden /> Créer un salon
            </button>
          </section>
        )}

        <section className="panel mt-4 space-y-3 p-5">
          <h2 className="text-lg font-bold">Rejoindre avec un code</h2>
          <div className="flex gap-2">
            <input
              className="input font-mono uppercase tracking-widest"
              placeholder="ABCDEF"
              aria-label="Code du salon"
              maxLength={6}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button type="button" className="btn-primary shrink-0" disabled={busy} onClick={handleJoin}>
              Rejoindre
            </button>
          </div>
          {initialCode && (
            <button type="button" className="btn-ghost w-full text-xs" disabled={busy} onClick={handleCreate}>
              Ou créer un nouveau salon
            </button>
          )}
        </section>

        {error && (
          <p role="alert" className="mt-4 text-center text-sm text-warning">
            {error}
          </p>
        )}
      </Shell>
    );
  }

  const bots = state.room.settings.bots ?? 1;
  const rules: Rules = {
    combos: state.room.settings.combos ?? true,
    stacking: state.room.settings.stacking ?? true,
    sevenZero: state.room.settings.sevenZero ?? true,
  };

  function updateSettings(patch: Partial<{bots: number; combos: boolean; stacking: boolean; sevenZero: boolean}>) {
    if (!roomId) return;
    void act(() =>
      rpc('chroma_update_settings', {
        p_room: roomId,
        p_settings: {
          bots,
          combos: rules.combos,
          stacking: rules.stacking,
          sevenZero: Boolean(rules.sevenZero),
          ...patch,
        },
      }),
    );
  }

  // ---------------- 2. LOBBY SCREEN (WAITING FOR PLAYERS) ----------------
  if (state.room.status === 'lobby' || !table) {
    const totalSeats = state.members.length + bots;
    const canStart = isHost && totalSeats >= MIN_SEATS && totalSeats <= MAX_SEATS && !busy;

    const copyInvite = async () => {
      try {
        await navigator.clipboard.writeText(roomLink(GAME_SLUG, state.room.code));
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        /* ignore clipboard failure */
      }
    };

    return (
      <Shell
        title={`Salon ${state.room.code}`}
        kicker="Salle d’attente · Chroma Clash 4 Colors"
        onBack={handleLeave}
        backLabel="Quitter le salon">
        <section className="panel space-y-3 p-5 text-center">
          <p className="text-xs uppercase tracking-widest text-muted">Code du salon</p>
          <p className="font-mono text-4xl font-black tracking-[0.25em] text-[#38e1ff]">{state.room.code}</p>
          <p className="text-xs text-muted">
            Chaque joueur ouvre Chroma Clash sur son téléphone ou son PC et saisit ce code.
          </p>
          <button type="button" className="btn-secondary mx-auto" onClick={copyInvite}>
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied ? 'Lien copié' : 'Copier le lien d’invitation'}
          </button>
        </section>

        <section className="panel mt-4 space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">
              Joueurs connectés ({state.members.length} humain{state.members.length > 1 ? 's' : ''} + {bots} bot
              {bots > 1 ? 's' : ''})
            </h2>
            <span className="font-mono text-xs text-[#38e1ff]">
              {totalSeats} / {MAX_SEATS} sièges
            </span>
          </div>
          <ul className="space-y-2" aria-label="Joueurs dans le salon">
            {state.members.map((m) => (
              <li
                key={m.user_id}
                className="flex items-center justify-between rounded-xl border border-line bg-surface2/60 px-3.5 py-2.5">
                <span className="flex items-center gap-2 font-semibold">
                  <Users size={15} className="text-[#5ce63c]" aria-hidden />
                  {m.name}
                  {m.is_me && <span className="text-xs text-muted">(toi)</span>}
                </span>
                {m.is_host && (
                  <span className="tag border-[#ffc619]/40 text-[#ffc619]" title="Hôte de la partie">
                    <Crown size={12} aria-hidden /> Hôte
                  </span>
                )}
              </li>
            ))}
          </ul>

          {isHost && (
            <div className="mt-3 space-y-2 border-t border-line pt-3">
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface2/50 px-3 py-2">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Bot size={16} aria-hidden /> Bots IA pour compléter la table
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-ghost min-h-[36px] px-2"
                    aria-label="Moins de bots"
                    disabled={busy || bots <= 0}
                    onClick={() => updateSettings({bots: Math.max(0, bots - 1)})}>
                    <Minus size={15} />
                  </button>
                  <span className="w-6 text-center font-mono">{bots}</span>
                  <button
                    type="button"
                    className="btn-ghost min-h-[36px] px-2"
                    aria-label="Plus de bots"
                    disabled={busy || state.members.length + bots >= MAX_SEATS}
                    onClick={() => updateSettings({bots: Math.min(MAX_SEATS - state.members.length, bots + 1)})}>
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-line bg-surface2/50 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-cyan"
                  checked={rules.combos}
                  disabled={busy}
                  onChange={(e) => updateSettings({combos: e.target.checked})}
                />
                <span>
                  <strong>Combos</strong> : jouer plusieurs cartes du même chiffre
                </span>
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-line bg-surface2/50 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-cyan"
                  checked={rules.stacking}
                  disabled={busy}
                  onChange={(e) => updateSettings({stacking: e.target.checked})}
                />
                <span>
                  <strong>Cumul</strong> : empiler les +2 et +3
                </span>
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-line bg-surface2/50 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-cyan"
                  checked={Boolean(rules.sevenZero)}
                  disabled={busy}
                  onChange={(e) => updateSettings({sevenZero: e.target.checked})}
                />
                <span>
                  <strong>Règle 7–1</strong> : le 7 échange deux mains · le 1 fait tourner toutes les mains
                </span>
              </label>
            </div>
          )}
        </section>

        {error && (
          <p role="alert" className="mt-3 text-center text-sm text-warning">
            {error}
          </p>
        )}

        {isHost ? (
          <button
            type="button"
            className="btn-primary mt-4 w-full text-base"
            disabled={!canStart}
            onClick={() => {
              sfxCardDraw();
              void act(() => rpc('chroma_start', {p_room: roomId, p_keep_scores: false}));
            }}>
            <Layers size={18} aria-hidden /> Lancer la partie ({totalSeats} joueurs)
          </button>
        ) : (
          <p className="mt-4 text-center text-sm text-muted">En attente que l’hôte lance la partie…</p>
        )}
      </Shell>
    );
  }

  // ---------------- 3. LIVE MULTIPLAYER GAME TABLE ----------------
  const mySeatIdx = table.my_seat ?? 0;
  const mySeatInfo = table.seats[mySeatIdx];
  const myHand = table.my_hand;
  const myTurn =
    table.winner_seat === null &&
    table.my_seat !== null &&
    table.current_seat === table.my_seat &&
    !mySeatInfo?.bot;
  const topCard = table.top_card;
  const activeSuit = SUIT_BADGE[table.active_color];

  const selectable = (c: Card) =>
    myTurn &&
    !busy &&
    (selected.includes(c.id) ||
      (selected.length === 0
        ? canPlayOnTable(c, table, rules)
        : validSelectionOnTable([...selected, c.id], myHand, table, rules)));

  function executeOnlinePlay(ids: number[], chosenColor: Color | null, swapTarget?: number) {
    sfxCardPlay();
    setSelected([]);
    void act(() =>
      rpc('chroma_play', {
        p_room: roomId,
        p_card_ids: ids,
        p_color: chosenColor,
        p_swap_target: swapTarget ?? null,
      }),
    );
  }

  function submitPlay(ids = selected) {
    if (!validSelectionOnTable(ids, myHand, table, rules)) return;
    const last = myHand.find((c) => c.id === ids[ids.length - 1])!;
    if (isWild(last)) {
      setColorPick(ids);
      return;
    }
    if (
      rules.sevenZero &&
      last.kind === 'num' &&
      last.value === 7 &&
      myHand.length - ids.length > 0 &&
      table.seats.length > 2
    ) {
      setSwapPick({ids, color: null});
      return;
    }
    executeOnlinePlay(ids, null);
  }

  return (
    <Shell
      title={`Salon ${state.room.code}`}
      kicker={
        table.winner_seat !== null
          ? `Victoire de ${table.seats[table.winner_seat]?.name} !`
          : `Tour de ${table.seats[table.current_seat]?.name}`
      }
      onBack={handleLeave}
      backLabel="Quitter le salon"
      right={
        <span className="tag font-mono text-xs">
          {table.direction === 1 ? <RotateCw size={14} aria-hidden /> : <RotateCcw size={14} aria-hidden />}
          {state.room.code}
        </span>
      }>
      <div
        className="space-y-4 rounded-3xl border-2 border-[#1f5fa8]/60 p-4 sm:p-6 shadow-2xl"
        style={{
          background: 'radial-gradient(circle at 50% 45%, #0c4d91 0%, #062852 58%, #021229 100%)',
        }}>
        {/* Players Strip (shows only hand_count for opponents — hands stay secret on server) */}
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Joueurs">
          {table.seats.map((s) => (
            <li
              key={s.seat}
              aria-current={s.seat === table.current_seat ? 'true' : undefined}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs sm:text-sm ${
                s.seat === table.current_seat
                  ? 'border-[#38e1ff] bg-[#38e1ff]/20 text-white shadow-md'
                  : 'border-white/15 bg-black/35 text-white/85'
              }`}>
              {s.bot ? <Bot size={13} className="text-[#38e1ff]" /> : <Users size={13} className="text-[#5ce63c]" />}
              <span className="font-semibold">
                {s.name}
                {s.is_me ? ' (toi)' : ''}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-xs font-bold">
                {s.hand_count} c.
              </span>
              <span className="font-mono text-[11px] text-[#38e1ff]">
                {s.score}/{GAME_SCORE_WIN}
              </span>
            </li>
          ))}
        </ul>

        {/* Live Counter-UNO Alert Button if someone forgot to announce */}
        {table.vulnerable_seat !== null && table.winner_seat === null && (
          <div className="flex justify-center">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                sfxPenalty();
                void act(() => rpc('chroma_counter_uno', {p_room: roomId}));
              }}
              className="inline-flex animate-bounce items-center gap-2 rounded-full border-2 border-[#ef1c24] bg-[#ef1c24] px-4 py-2 font-display text-xs font-black uppercase tracking-wider text-white shadow-lg">
              <Siren size={16} aria-hidden /> 🚨 Contre-1 contre {table.seats[table.vulnerable_seat]?.name} (+2 cartes) !
            </button>
          </div>
        )}

        {/* Center Arena */}
        <div className="mx-auto flex flex-wrap items-center justify-center gap-6 rounded-2xl border border-white/15 bg-black/30 p-4">
          <button
            type="button"
            disabled={!myTurn || busy || table.drawn_card_id !== null}
            onClick={() => {
              sfxCardDraw();
              void act(() => rpc('chroma_draw', {p_room: roomId}));
            }}
            className="flex h-[6.8rem] w-[4.8rem] flex-col items-center justify-center rounded-2xl border-2 border-white bg-[#141824] p-2 text-center shadow-xl disabled:opacity-50">
            <span className="font-display text-xs font-black uppercase text-white">
              {table.pending_draw > 0 ? `+${table.pending_draw}` : 'Pioche'}
            </span>
            <span className="mt-1 font-mono text-sm font-bold text-[#38e1ff]">{table.draw_count}</span>
          </button>

          <OnlineCardButton card={topCard} />

          <div className="flex flex-col items-center gap-2">
            <span
              className="rounded-full border px-3 py-1 font-display text-xs font-black uppercase"
              style={{borderColor: activeSuit.text, color: activeSuit.text, background: 'rgba(0,0,0,0.55)'}}>
              {activeSuit.glyph} {COLOR_LABELS[table.active_color]}
            </span>
            <button
              type="button"
              disabled={!myTurn || busy || table.announced}
              onClick={() => {
                sfxUnoCall();
                void act(() => rpc('chroma_announce', {p_room: roomId}));
              }}
              className="rounded-xl border border-[#ffc619] bg-[#ffc619]/20 px-3 py-1.5 font-display text-xs font-black uppercase text-[#ffc619] disabled:opacity-50">
              {table.announced ? 'Annoncé ✓' : 'UNO · 1 !'}
            </button>
          </div>
        </div>

        <p className="rounded-xl bg-black/40 px-3 py-2 text-center text-sm text-white/90" aria-live="polite">
          {table.last_event}
        </p>

        {error && (
          <p role="alert" className="text-center text-sm text-warning">
            {error}
          </p>
        )}

        {/* Winner Banner */}
        {table.winner_seat !== null && (
          <div className="space-y-3 rounded-2xl border border-[#ffc619]/50 bg-black/55 p-4 text-center">
            <Trophy size={36} className="mx-auto text-[#ffc619]" aria-hidden />
            <p className="font-display text-2xl font-black text-white">
              {table.seats[table.winner_seat]?.name} remporte la manche (+{table.round_points} pts) !
            </p>
            {isHost && (
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => {
                    sfxCardDraw();
                    void act(() => rpc('chroma_start', {p_room: roomId, p_keep_scores: true}));
                  }}>
                  <RotateCcw size={16} aria-hidden /> Manche suivante
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void act(() => rpc('chroma_back_to_lobby', {p_room: roomId}))}>
                  Retour au salon
                </button>
              </div>
            )}
          </div>
        )}

        {/* Viewer's Secret Hand */}
        <section
          aria-label={`Main de ${mySeatInfo?.name ?? 'Joueur'}`}
          className="rounded-2xl border border-white/15 bg-black/30 p-3.5">
          <div className="mb-2 flex items-center justify-between text-xs text-white/80">
            <span className="font-bold text-white">
              Ta main ({mySeatInfo?.name}) · {myHand.length} carte{myHand.length > 1 ? 's' : ''}
            </span>
            <span>
              {myTurn ? 'À ton tour de jouer !' : `En attente de ${table.seats[table.current_seat]?.name}…`}
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {myHand.map((c) => (
              <OnlineCardButton
                key={c.id}
                card={c}
                selected={selected.includes(c.id)}
                disabled={!selectable(c)}
                onClick={() => {
                  if (!myTurn || busy) return;
                  if (
                    selected.length === 1 &&
                    selected[0] === c.id &&
                    validSelectionOnTable([c.id], myHand, table, rules)
                  ) {
                    submitPlay([c.id]);
                    return;
                  }
                  setSelected((sel) => (sel.includes(c.id) ? sel.filter((id) => id !== c.id) : [...sel, c.id]));
                }}
              />
            ))}
          </div>
        </section>

        {myTurn && (
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !validSelectionOnTable(selected, myHand, table, rules)}
              onClick={() => submitPlay()}>
              Poser{selected.length > 1 ? ` ${selected.length} cartes` : ''}
            </button>
            {table.drawn_card_id !== null ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => void act(() => rpc('chroma_pass', {p_room: roomId}))}>
                <ArrowLeftRight size={16} aria-hidden /> Garder et passer
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => {
                  sfxCardDraw();
                  void act(() => rpc('chroma_draw', {p_room: roomId}));
                }}>
                <Layers size={16} aria-hidden /> {table.pending_draw > 0 ? `Piocher ${table.pending_draw}` : 'Piocher'}
              </button>
            )}
            <button
              type="button"
              className="btn-secondary border-[#ffc619] text-[#ffc619]"
              disabled={busy || table.announced}
              onClick={() => {
                sfxUnoCall();
                void act(() => rpc('chroma_announce', {p_room: roomId}));
              }}>
              <Megaphone size={16} aria-hidden /> Dernière carte !
            </button>
          </div>
        )}
      </div>

      {/* Wild Suit Modal */}
      {colorPick && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/25 bg-[#111622] p-5">
            <h2 className="mb-4 text-center font-display text-xl font-black text-white">Choisis la couleur</h2>
            <div className="grid grid-cols-2 gap-3">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="btn rounded-2xl border border-white py-3 font-display font-black text-white"
                  style={{background: SUIT_BADGE[c].bg}}
                  onClick={() => {
                    executeOnlinePlay(colorPick, c);
                    setColorPick(null);
                  }}>
                  {SUIT_BADGE[c].glyph} {COLOR_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7 Hand-Swap Target Modal */}
      {swapPick && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/25 bg-[#111622] p-5">
            <h2 className="mb-2 text-center font-display text-xl font-black text-white">
              Règle du 7 · Échanger ta main
            </h2>
            <p className="mb-4 text-center text-xs text-muted">
              Choisis l’adversaire avec qui échanger toutes tes cartes :
            </p>
            <div className="space-y-2">
              {table.seats.map((s) =>
                s.seat === mySeatIdx ? null : (
                  <button
                    key={s.seat}
                    type="button"
                    className="btn-secondary w-full justify-between"
                    onClick={() => {
                      executeOnlinePlay(swapPick.ids, swapPick.color, s.seat);
                      setSwapPick(null);
                    }}>
                    <span>{s.name}</span>
                    <span className="font-mono text-xs text-[#38e1ff]">{s.hand_count} carte(s)</span>
                  </button>
                ),
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button type="button" className="btn-ghost text-xs text-muted" onClick={handleLeave}>
          <LogOut size={14} aria-hidden /> Quitter le salon en ligne
        </button>
      </div>
    </Shell>
  );
}
