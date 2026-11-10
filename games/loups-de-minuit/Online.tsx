import {Check, Copy, Crown, Eye, LogIn, LogOut, Moon, Plus, RotateCcw, Share2, Shield, Skull, Sun, Users, Vote, Wifi} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {codeFromUrl, CODE_PATTERN, ensureSession, lastRoom, rememberRoom, roomLink, rpc, watchRoom} from '../_party/online';
import {cleanName, loadPlayers} from '../_party/players';
import {Shell} from '../_party/ui';
import {formatClock, PickList, Stepper} from './App';
import {defaultRoleCounts, MAX_PLAYERS, MIN_PLAYERS, ROLE_INFO, type Player, type Role} from './logic';

const GAME = 'loups-de-minuit';

interface Member {
  id: string;
  name: string;
  seat: number;
  alive: boolean;
  host: boolean;
  me: boolean;
  role: Role | null;
  voted: boolean | null;
}

interface RoomState {
  room: {
    id: string;
    code: string;
    status: 'lobby' | 'playing' | 'ended';
    phase: 'lobby' | 'night' | 'day' | 'vote' | 'verdict' | 'ended';
    round: number;
    settings: {loup?: number; voyante?: number; protecteur?: number; day_seconds?: number; reveal_dead?: boolean};
    phase_ends_at: string | null;
    last_event: {
      type?: string;
      victim?: string | null;
      victim_role?: Role | null;
      saved?: boolean;
      eliminated?: string | null;
      eliminated_role?: Role | null;
      tally?: {name: string; votes: number}[];
      roles?: Record<Role, number>;
    };
    winner: 'loups' | 'village' | null;
    host_id: string;
    version: number;
    server_now: string;
  };
  members: Member[];
  me: {
    id: string;
    role: Role | null;
    action_target: string | null;
    vote_target: string | null;
    voted: boolean;
    last_protected: string | null;
    inspections: {round: number; target: string; is_wolf: boolean}[] | null;
    pack_votes: {wolf: string; target: string}[] | null;
  };
}

/** Seconds left on the server timer, corrected for this device's clock offset. */
function useCountdown(endsAt: string | null, offsetMs: number) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!endsAt) {
      setLeft(null);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((Date.parse(endsAt) - (Date.now() + offsetMs)) / 1000)));
    tick();
    const t = window.setInterval(tick, 500);
    return () => window.clearInterval(t);
  }, [endsAt, offsetMs]);
  return left;
}

function ErrorBanner({error, onClose}: {error: string | null; onClose: () => void}) {
  if (!error) return null;
  return (
    <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
      <span>{error}</span>
      <button type="button" className="font-semibold underline" onClick={onClose}>OK</button>
    </div>
  );
}

/** Entry: pick a name, then create a room or join one with its code. */
function Entry({onEnter, onExit}: {onEnter: (roomId: string) => void; onExit: () => void}) {
  const [name, setName] = useState(() => loadPlayers([''])[0] ?? '');
  const [code, setCode] = useState(() => codeFromUrl() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleaned = cleanName(name);
  const codeOk = CODE_PATTERN.test(code);
  const invited = codeFromUrl() !== null;

  async function go(action: 'create' | 'join') {
    setBusy(true);
    setError(null);
    try {
      await ensureSession();
      const res =
        action === 'create'
          ? await rpc<{room_id: string}>('party_create_room', {p_game: GAME, p_name: cleaned})
          : await rpc<{room_id: string}>('party_join_room', {p_code: code, p_name: cleaned});
      onEnter(res.room_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Loups de Minuit en ligne" kicker="Chacun sur son appareil" onBack={onExit} backLabel="Changer de mode">
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <section className="panel space-y-4 p-5">
        <label className="block">
          <span className="mb-1 block font-semibold">Ton prénom</span>
          <input className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        </label>
        <div className={`grid gap-4 ${invited ? '' : 'sm:grid-cols-2'}`}>
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block font-semibold">Code du salon</span>
              <input
                className="input text-center font-mono text-2xl uppercase tracking-[0.3em]"
                value={code}
                maxLength={6}
                inputMode="text"
                autoCapitalize="characters"
                placeholder="ABC234"
                aria-describedby="code-help"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
            </label>
            <p id="code-help" className="text-xs text-muted">6 caractères, donnés par l’hôte.</p>
            <button type="button" className="btn-primary w-full" disabled={busy || !cleaned || !codeOk} onClick={() => go('join')}>
              <LogIn size={18} aria-hidden /> Rejoindre
            </button>
          </div>
          {!invited && (
            <div className="flex flex-col justify-end gap-2 sm:border-l sm:border-line sm:pl-4">
              <p className="text-sm text-muted">Ou deviens l’hôte : tu obtiens un code à partager.</p>
              <button type="button" className="btn-secondary w-full" disabled={busy || !cleaned} onClick={() => go('create')}>
                <Plus size={18} aria-hidden /> Créer un salon
              </button>
            </div>
          )}
        </div>
      </section>
      <p className="mt-4 text-center text-xs text-muted">
        Sans compte : une connexion anonyme est créée sur cet appareil. Ton rôle n’est jamais envoyé aux autres joueurs.
      </p>
    </Shell>
  );
}

export function OnlineGame({onExit}: {onExit: () => void}) {
  const [roomId, setRoomId] = useState<string | null>(() => (codeFromUrl() ? null : lastRoom(GAME)));
  const [state, setState] = useState<RoomState | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const fetching = useRef(false);
  const dirty = useRef(false);

  const load = useCallback(async () => {
    if (!roomId) return;
    if (fetching.current) {
      dirty.current = true;
      return;
    }
    fetching.current = true;
    try {
      do {
        dirty.current = false;
        const s = await rpc<RoomState>('party_state', {p_room: roomId});
        setOffset(Date.parse(s.room.server_now) - Date.now());
        setState((prev) => (prev && prev.room.version > s.room.version ? prev : s));
      } while (dirty.current);
    } catch (e) {
      // The room is gone or we are no longer a member: back to the entry screen.
      setRoomId(null);
      setState(null);
      rememberRoom(GAME, null);
      setError((e as Error).message);
    } finally {
      fetching.current = false;
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    rememberRoom(GAME, roomId);
    let stop = () => {};
    void ensureSession()
      .then(() => {
        void load();
        stop = watchRoom(roomId, () => void load());
      })
      .catch((e) => setError((e as Error).message));
    return () => stop();
  }, [roomId, load]);

  const phaseKey = state ? `${state.room.phase}-${state.room.round}` : '';
  useEffect(() => setPick(null), [phaseKey]);

  const left = useCountdown(state?.room.phase_ends_at ?? null, offset);
  const advancedFor = useRef('');
  // When a server timer runs out, any device may move the game on (the server re-checks).
  useEffect(() => {
    if (!roomId || left !== 0 || advancedFor.current === phaseKey) return;
    advancedFor.current = phaseKey;
    void rpc('party_advance', {p_room: roomId}).catch(() => {});
  }, [left, phaseKey, roomId]);

  async function act(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await rpc(fn, {p_room: roomId, ...args});
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (!window.confirm('Quitter le salon ?')) return;
    if (roomId) await rpc('party_leave_room', {p_room: roomId}).catch(() => {});
    rememberRoom(GAME, null);
    setRoomId(null);
    setState(null);
  }

  if (!roomId) {
    return (
      <>
        {error && (
          <div className="px-4 pt-4">
            <ErrorBanner error={error} onClose={() => setError(null)} />
          </div>
        )}
        <Entry onEnter={setRoomId} onExit={onExit} />
      </>
    );
  }
  if (!state) {
    return (
      <Shell title="Loups de Minuit en ligne" kicker="Connexion au salon" onBack={onExit}>
        <p className="py-20 text-center text-muted">Connexion…</p>
      </Shell>
    );
  }

  const {room, members, me} = state;
  const isHost = room.host_id === me.id;
  const meMember = members.find((m) => m.me)!;
  const alive = members.filter((m) => m.alive);
  // PickList works with indices into a Player list.
  const asPlayers: Player[] = members.map((m) => ({name: m.name, role: m.role ?? 'villageois', alive: m.alive}));
  const idx = (id: string | null) => members.findIndex((m) => m.id === id);
  const indicesOf = (list: Member[]) => list.map((m) => idx(m.id));
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? '?';
  const header = {
    onBack: leave,
    backLabel: 'Quitter le salon',
    right: (
      <span className="tag" title="Connecté au salon">
        <Wifi size={12} aria-hidden /> {room.code}
      </span>
    ),
  };

  // ---------------------------------------------------------------------------
  if (room.phase === 'lobby') {
    const n = members.length;
    const defaults = defaultRoleCounts(Math.max(n, MIN_PLAYERS));
    const counts = {
      loup: room.settings.loup ?? defaults.loup,
      voyante: room.settings.voyante ?? defaults.voyante,
      protecteur: room.settings.protecteur ?? defaults.protecteur,
    };
    const daySeconds = room.settings.day_seconds ?? 180;
    const set = (patch: Record<string, unknown>) => act('party_update_settings', {p_settings: {...room.settings, ...patch}});
    const link = roomLink(GAME, room.code);
    return (
      <Shell title="Salle d’attente" kicker="Loups de Minuit en ligne" {...header}>
        <ErrorBanner error={error} onClose={() => setError(null)} />
        <section className="panel p-5 text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-muted">Code du salon</p>
          <p className="my-2 font-mono text-5xl font-bold tracking-[0.25em] text-cyan" aria-label={`Code ${room.code.split('').join(' ')}`}>{room.code}</p>
          <ShareButton link={link} code={room.code} />
        </section>

        <section className="panel mt-4 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold"><Users size={18} aria-hidden /> Joueurs ({n}/{MAX_PLAYERS})</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface2/50 px-3 py-2">
                {m.host && <Crown size={16} className="text-warning" aria-label="hôte" />}
                <span className="font-semibold">{m.name}</span>
                {m.me && <span className="tag ml-auto">toi</span>}
              </li>
            ))}
          </ul>
          {n < MIN_PLAYERS && <p className="mt-3 text-sm text-muted">En attente de joueurs : il en faut au moins {MIN_PLAYERS}.</p>}
        </section>

        <section className="panel mt-4 space-y-2 p-5">
          <h2 className="mb-1 text-xl font-bold">Rôles</h2>
          {isHost ? (
            <>
              <Stepper label="Loups-garous" value={counts.loup} min={1} max={Math.max(1, Math.floor((n - 1) / 2))} onChange={(v) => set({loup: v})} />
              <Stepper label="Voyante" value={counts.voyante} min={0} max={1} onChange={(v) => set({voyante: v})} />
              <Stepper label="Protecteur" value={counts.protecteur} min={0} max={1} onChange={(v) => set({protecteur: v})} />
              <label className="block pt-2 text-sm">
                <span className="mb-1 block font-semibold">Durée du débat</span>
                <select className="input" value={daySeconds} onChange={(e) => set({day_seconds: Number(e.target.value)})}>
                  {[120, 180, 300].map((d) => <option key={d} value={d}>{d / 60} minutes</option>)}
                </select>
              </label>
            </>
          ) : (
            <p className="text-sm text-muted">
              {counts.loup} loup{counts.loup > 1 ? 's' : ''}, {counts.voyante ? 'une voyante, ' : ''}{counts.protecteur ? 'un protecteur, ' : ''}débat de {daySeconds / 60} min. L’hôte règle la partie.
            </p>
          )}
        </section>

        {isHost ? (
          <button type="button" className="btn-primary mt-4 w-full" disabled={busy || n < MIN_PLAYERS} onClick={() => act('party_start', {})}>
            <Moon size={18} aria-hidden /> Lancer la partie
          </button>
        ) : (
          <p className="mt-4 text-center text-muted">L’hôte lancera la partie quand tout le monde sera là.</p>
        )}
      </Shell>
    );
  }

  const roleCard = me.role && (
    <p className="tag">
      {meMember.name} · <span className={me.role === 'loup' ? 'text-danger' : 'text-cyan'}>{ROLE_INFO[me.role].label}</span>
      {!meMember.alive && ' · éliminé·e'}
    </p>
  );

  if (room.phase === 'night') {
    const pack = members.filter((m) => m.role === 'loup' && !m.me);
    let body;
    if (!meMember.alive) {
      body = <p className="text-muted">Tu as été éliminé·e : observe la partie en silence, sans rien révéler.</p>;
    } else if (me.role === 'loup') {
      const targets = alive.filter((m) => m.role !== 'loup');
      body = (
        <>
          <p className="text-muted">
            Choisis la victime avec ta meute{pack.length ? ` (${pack.map((m) => m.name).join(', ')})` : ''}. Tu peux changer d’avis jusqu’à la fin de la nuit.
          </p>
          {me.pack_votes && me.pack_votes.length > 0 && (
            <ul className="panel space-y-1 p-3 text-sm">
              {me.pack_votes.map((v) => (
                <li key={v.wolf}>{nameOf(v.wolf)} → <strong className="text-danger">{nameOf(v.target)}</strong></li>
              ))}
            </ul>
          )}
          <PickList players={asPlayers} indices={indicesOf(targets)} selected={idx(pick ?? me.action_target)} onPick={(i) => setPick(members[i].id)} />
          <button type="button" className="btn-danger w-full" disabled={busy || !pick || pick === me.action_target} onClick={() => act('party_night_action', {p_target: pick})}>
            <Skull size={18} aria-hidden /> {me.action_target ? 'Changer de cible' : 'Attaquer'}
          </button>
        </>
      );
    } else if (me.role === 'voyante') {
      const tonight = me.inspections?.find((x) => x.round === room.round);
      body = tonight ? (
        <p className="panel px-4 py-6 text-center text-xl">
          <strong>{nameOf(tonight.target)}</strong>{' '}
          {tonight.is_wolf ? <span className="text-danger">est un loup-garou.</span> : <span className="text-success">n’est pas un loup-garou.</span>}
        </p>
      ) : (
        <>
          <p className="text-muted">Choisis un joueur dont tu veux découvrir la nature.</p>
          <PickList players={asPlayers} indices={indicesOf(alive.filter((m) => !m.me))} selected={idx(pick)} onPick={(i) => setPick(members[i].id)} />
          <button type="button" className="btn-primary w-full" disabled={busy || !pick} onClick={() => act('party_night_action', {p_target: pick})}>
            <Eye size={18} aria-hidden /> Sonder
          </button>
        </>
      );
    } else if (me.role === 'protecteur') {
      body = me.action_target ? (
        <p className="panel px-4 py-6 text-center text-lg">Tu protèges <strong>{nameOf(me.action_target)}</strong> cette nuit.</p>
      ) : (
        <>
          <p className="text-muted">Qui protèges-tu ? Pas la même personne que la nuit dernière.</p>
          <PickList players={asPlayers} indices={indicesOf(alive.filter((m) => m.id !== me.last_protected))} selected={idx(pick)} onPick={(i) => setPick(members[i].id)} />
          <button type="button" className="btn-primary w-full" disabled={busy || !pick} onClick={() => act('party_night_action', {p_target: pick})}>
            <Shield size={18} aria-hidden /> Protéger
          </button>
        </>
      );
    } else {
      body = <p className="text-muted">Tu dors. Le jour se lèvera quand les rôles de la nuit auront joué.</p>;
    }
    return (
      <Shell title={`Nuit ${room.round}`} kicker="Loups de Minuit en ligne" {...header}>
        <ErrorBanner error={error} onClose={() => setError(null)} />
        <div className="space-y-4">
          <Moon size={40} className="text-violet" aria-hidden />
          {roleCard}
          {me.role === 'voyante' && me.inspections && me.inspections.length > 0 && (
            <details className="panel p-3 text-sm">
              <summary className="cursor-pointer font-semibold">Tes visions</summary>
              <ul className="mt-2 space-y-1">
                {me.inspections.map((x) => (
                  <li key={x.round}>Nuit {x.round} : {nameOf(x.target)} {x.is_wolf ? 'est un loup' : 'n’est pas un loup'}</li>
                ))}
              </ul>
            </details>
          )}
          {body}
          {isHost && (
            <button type="button" className="btn-ghost w-full" onClick={() => window.confirm('Terminer la nuit sans attendre les joueurs qui n’ont pas agi ?') && act('party_advance', {})}>
              Terminer la nuit maintenant (hôte)
            </button>
          )}
        </div>
      </Shell>
    );
  }

  const ev = room.last_event;
  const dawn =
    ev.type === 'dawn' ? (
      ev.victim ? (
        <p className="text-lg"><strong>{ev.victim}</strong> a été attaqué·e cette nuit.{ev.victim_role && <> C’était <strong>{ROLE_INFO[ev.victim_role].label.toLowerCase()}</strong>.</>}</p>
      ) : ev.saved ? (
        <p className="text-lg">Les loups ont attaqué… mais leur cible a été protégée.</p>
      ) : (
        <p className="text-lg">La nuit a été calme. Personne n’est mort.</p>
      )
    ) : null;

  if (room.phase === 'day') {
    return (
      <Shell title={`Jour ${room.round}`} kicker="Débat du village" {...header}>
        <ErrorBanner error={error} onClose={() => setError(null)} />
        <div className="space-y-5 text-center">
          <Sun size={44} className="mx-auto text-warning" aria-hidden />
          {dawn}
          {roleCard}
          <p className="font-mono text-6xl font-bold">{left === null ? '—' : formatClock(left)}</p>
          <p className="text-sm text-muted">En vie : {alive.map((m) => m.name).join(' · ')}</p>
          {isHost && (
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => act('party_advance', {})}>
              <Vote size={18} aria-hidden /> Passer au vote (hôte)
            </button>
          )}
        </div>
      </Shell>
    );
  }

  if (room.phase === 'vote') {
    const voted = members.filter((m) => m.alive && m.voted).length;
    return (
      <Shell title={`Jour ${room.round}`} kicker="Vote du village" {...header}>
        <ErrorBanner error={error} onClose={() => setError(null)} />
        <div className="space-y-4">
          {roleCard}
          <p className="text-muted">{voted} / {alive.length} votes. Le résultat tombe quand tout le monde a voté.</p>
          {meMember.alive ? (
            <>
              <PickList players={asPlayers} indices={indicesOf(alive.filter((m) => !m.me))} selected={idx(pick ?? me.vote_target)} onPick={(i) => setPick(members[i].id)} />
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" className="btn-danger" disabled={busy || !pick} onClick={() => act('party_vote', {p_target: pick})}>
                  <Vote size={18} aria-hidden /> {me.voted ? 'Changer mon vote' : `Voter contre ${pick ? nameOf(pick) : '…'}`}
                </button>
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => act('party_vote', {p_target: null})}>
                  S’abstenir
                </button>
              </div>
              {me.voted && <p className="flex items-center gap-2 text-sm text-success"><Check size={16} aria-hidden /> Vote enregistré{me.vote_target ? ` : ${nameOf(me.vote_target)}` : ' : abstention'}.</p>}
            </>
          ) : (
            <p className="text-muted">Tu as été éliminé·e : tu ne votes plus.</p>
          )}
          <ul className="flex flex-wrap gap-2 text-sm" aria-label="Qui a voté">
            {alive.map((m) => (
              <li key={m.id} className={`tag ${m.voted ? 'border-success/50 text-success' : ''}`}>{m.voted && <Check size={12} aria-hidden />} {m.name}</li>
            ))}
          </ul>
          {isHost && (
            <button type="button" className="btn-ghost w-full" onClick={() => window.confirm('Clore le vote maintenant ?') && act('party_advance', {})}>
              Clore le vote (hôte)
            </button>
          )}
        </div>
      </Shell>
    );
  }

  const verdict =
    ev.type === 'verdict' ? (
      <>
        {ev.eliminated ? (
          <p className="text-xl">Le village élimine <strong>{ev.eliminated}</strong>.{ev.eliminated_role && <> C’était <strong>{ROLE_INFO[ev.eliminated_role].label.toLowerCase()}</strong>.</>}</p>
        ) : (
          <p className="text-xl">Égalité ou abstention : personne n’est éliminé.</p>
        )}
        {ev.tally && ev.tally.length > 0 && (
          <ul className="panel mx-auto max-w-sm divide-y divide-line text-left text-sm">
            {ev.tally.map((t) => (
              <li key={t.name} className="flex justify-between px-4 py-2"><span>{t.name}</span><span className="font-mono">{t.votes}</span></li>
            ))}
          </ul>
        )}
      </>
    ) : null;

  if (room.phase === 'verdict') {
    return (
      <Shell title={`Jour ${room.round}`} kicker="Verdict" {...header}>
        <div className="space-y-5 text-center">
          {verdict}
          <p className="text-muted">La nuit tombe dans {left ?? '…'} s.</p>
          {isHost && (
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => act('party_advance', {})}>
              <Moon size={18} aria-hidden /> La nuit tombe
            </button>
          )}
        </div>
      </Shell>
    );
  }

  // Ended
  return (
    <Shell title="Fin de partie" kicker={`Salon ${room.code}`} {...header}>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <div className="space-y-5 text-center">
        {verdict ?? dawn}
        <p className={`font-display text-4xl font-bold ${room.winner === 'loups' ? 'text-danger' : 'text-success'}`}>
          {room.winner === 'loups' ? 'Les loups-garous gagnent !' : 'Le village gagne !'}
        </p>
        <ul className="panel divide-y divide-line text-left">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-4 py-3">
              <span className={m.alive ? '' : 'text-muted line-through'}>{m.name}{m.me && ' (toi)'}</span>
              <span className={m.role === 'loup' ? 'font-semibold text-danger' : 'text-cyan'}>{m.role ? ROLE_INFO[m.role].label : '—'}</span>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2">
          {isHost ? (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => act('party_advance', {})}>
              <RotateCcw size={18} aria-hidden /> Rejouer avec ce salon
            </button>
          ) : (
            <p className="text-sm text-muted">L’hôte peut relancer une partie.</p>
          )}
          <button type="button" className="btn-secondary" onClick={leave}>
            <LogOut size={18} aria-hidden /> Quitter le salon
          </button>
        </div>
      </div>
    </Shell>
  );
}

function ShareButton({link, code}: {link: string; code: string}) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === 'function';
  const share = async () => {
    try {
      if (canShare) {
        await navigator.share({title: 'Loups de Minuit', text: `Rejoins ma partie de Loups de Minuit (code ${code})`, url: link});
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* share sheet dismissed */
    }
  };
  return (
    <button type="button" className="btn-secondary mx-auto" onClick={share}>
      {canShare ? <Share2 size={18} aria-hidden /> : copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
      {canShare ? 'Inviter' : copied ? 'Lien copié' : 'Copier le lien d’invitation'}
    </button>
  );
}

