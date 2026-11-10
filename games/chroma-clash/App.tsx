import {ArrowLeftRight, Bot, Layers, Megaphone, Minus, Plus, RotateCcw, RotateCw, Trophy} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {Handoff, PlayerSetup, Shell} from '../_party/ui';
import {
  announce,
  botMove,
  canPlay,
  cardLabel,
  COLOR_LABELS,
  COLORS,
  drawTurn,
  isWild,
  MAX_SEATS,
  MIN_SEATS,
  newGame,
  pass,
  play,
  top,
  validSelection,
  type Card,
  type Color,
  type GameState,
  type Rules,
} from './logic';

const COLOR_HEX: Record<Color, string> = {cyan: '#38e1ff', rose: '#ff4f9a', ambre: '#ffb020', vert: '#34d399'};
/** Shape per color, so cards stay readable without relying on color alone. */
const COLOR_GLYPH: Record<Color, string> = {cyan: '●', rose: '▲', ambre: '■', vert: '◆'};
const WILD_BORDER = `conic-gradient(${COLOR_HEX.cyan} 0 25%, ${COLOR_HEX.rose} 0 50%, ${COLOR_HEX.ambre} 0 75%, ${COLOR_HEX.vert} 0)`;
const BOT_DELAY_MS = 900;

function symbol(c: Card) {
  switch (c.kind) {
    case 'num':
      return String(c.value);
    case 'bond':
      return '⊘';
    case 'retour':
      return '⇄';
    case 'plus2':
      return '+2';
    case 'prisme':
      return '◈';
    case 'surcharge':
      return '+3';
  }
}

function CardView({
  card,
  large = false,
  selected = false,
  disabled = false,
  onClick,
}: {
  card: Card;
  large?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const hex = card.color ? COLOR_HEX[card.color] : '#eef2ff';
  const size = large ? 'h-36 w-24 text-5xl' : 'h-24 w-16 text-3xl';
  const face = (
    <span
      className={`relative flex ${size} flex-col items-center justify-center rounded-[14px] bg-surface font-display font-bold`}
      style={{color: hex, boxShadow: selected ? `0 0 24px ${hex}` : `0 0 14px ${hex}33`}}>
      <span className="absolute left-1.5 top-1 text-[11px] leading-none">{card.color ? COLOR_GLYPH[card.color] : '✦'}</span>
      <span className="absolute bottom-1 right-1.5 text-[11px] leading-none">{card.color ? COLOR_GLYPH[card.color] : '✦'}</span>
      {symbol(card)}
    </span>
  );
  const frame = {background: isWild(card) ? WILD_BORDER : hex};
  if (!onClick) {
    return (
      <span className="inline-block rounded-2xl p-[3px]" style={frame} role="img" aria-label={cardLabel(card)}>
        {face}
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
      className={`rounded-2xl p-[3px] transition ${selected ? '-translate-y-3' : ''} ${disabled ? 'opacity-35' : 'hover:-translate-y-1'}`}
      style={frame}>
      {face}
    </button>
  );
}

function Stepper({label, value, min, max, onChange}: {label: string; value: number; min: number; max: number; onChange: (v: number) => void}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface2/50 px-3 py-2">
      <span className="flex items-center gap-2 font-semibold"><Bot size={16} aria-hidden /> {label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost min-h-[40px] px-2" aria-label={`Moins de ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus size={16} aria-hidden />
        </button>
        <span className="w-6 text-center font-mono text-lg">{value}</span>
        <button type="button" className="btn-ghost min-h-[40px] px-2" aria-label={`Plus de ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [humans, setHumans] = useState<string[]>([]);
  const [humansError, setHumansError] = useState<string | null>(null);
  const [bots, setBots] = useState(1);
  const [rules, setRules] = useState<Rules>({combos: true, stacking: true});

  const [game, setGame] = useState<GameState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [colorPick, setColorPick] = useState<number[] | null>(null);
  /** Seat whose hand is currently revealed on screen (hot-seat privacy). */
  const [revealedFor, setRevealedFor] = useState<number | null>(null);

  const total = humans.length + bots;
  const setupError = humansError ?? (total < MIN_SEATS ? 'Il faut au moins 2 joueurs (ajoute un bot).' : total > MAX_SEATS ? `${MAX_SEATS} joueurs maximum.` : null);
  const humanCount = game ? game.seats.filter((s) => !s.bot).length : 0;

  function start() {
    const seats = [
      ...humans.map((name) => ({name, bot: false})),
      ...Array.from({length: bots}, (_, i) => ({name: `Bot ${['Ion', 'Néon', 'Volt', 'Flux', 'Arc', 'Delta', 'Quark'][i]}`, bot: true})),
    ];
    setGame(newGame(seats, rules));
    setSelected([]);
    setRevealedFor(null);
  }

  // Bots play on their own after a short, readable pause.
  useEffect(() => {
    if (!game || game.winner !== null || !game.seats[game.current].bot || colorPick) return;
    const t = window.setTimeout(() => {
      setGame((g) => {
        if (!g || g.winner !== null || !g.seats[g.current].bot) return g;
        const m = botMove(g);
        if (m.type === 'play') return play(announce(g), m.ids, m.color);
        if (m.type === 'draw') return drawTurn(g);
        return pass(g);
      });
    }, BOT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [game, colorPick]);

  // A new human turn starts with nothing selected.
  useEffect(() => setSelected([]), [game?.current, game?.drawnCardId]);

  const me = game ? game.seats[game.current] : null;
  const viewer = useMemo(() => {
    if (!game) return null;
    if (humanCount === 1) return game.seats.findIndex((s) => !s.bot);
    return !game.seats[game.current].bot && revealedFor === game.current ? game.current : null;
  }, [game, humanCount, revealedFor]);

  if (!game) {
    return (
      <Shell title="Chroma Clash" kicker="Jeu de cartes · même appareil">
        <section className="panel p-5">
          <h2 className="mb-1 text-xl font-bold">Joueurs humains</h2>
          <p className="mb-4 text-sm text-muted">Sur un seul appareil, on se le passe à chaque tour : ta main reste cachée aux autres.</p>
          <PlayerSetup min={1} max={MAX_SEATS} onChange={(n, err) => { setHumans(n); setHumansError(err); }} />
        </section>
        <section className="panel mt-4 space-y-2 p-5">
          <h2 className="mb-2 text-xl font-bold">Bots et règles</h2>
          <Stepper label="Bots" value={bots} min={0} max={Math.max(0, MAX_SEATS - humans.length)} onChange={setBots} />
          <label className="flex items-center gap-3 rounded-xl border border-line bg-surface2/50 px-3 py-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-cyan" checked={rules.combos} onChange={(e) => setRules((r) => ({...r, combos: e.target.checked}))} />
            <span><strong>Combos</strong> : poser en une fois plusieurs cartes du même chiffre</span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-line bg-surface2/50 px-3 py-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-cyan" checked={rules.stacking} onChange={(e) => setRules((r) => ({...r, stacking: e.target.checked}))} />
            <span><strong>Cumul</strong> : répondre à un +2 ou +3 par un autre pour passer la pénalité</span>
          </label>
        </section>
        <details className="panel mt-4 p-5 text-sm text-muted">
          <summary className="cursor-pointer font-semibold text-ink">Règles</summary>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>Pose une carte de la même couleur, du même chiffre ou du même symbole que la carte du dessus.</li>
            <li>Bond ⊘ : le suivant passe son tour · Retour ⇄ : le sens s’inverse · +2 : le suivant pioche 2.</li>
            <li>Prisme ◈ : choisis la couleur · Surcharge +3 : le suivant pioche 3 et tu choisis la couleur.</li>
            <li>Sans carte jouable, pioche-en une : si elle est jouable, tu peux la poser.</li>
            <li>Avant de poser ton avant-dernière carte, touche « Dernière carte ! », sinon tu pioches 2.</li>
            <li>Le premier qui vide sa main gagne.</li>
          </ul>
        </details>
        {setupError && <p role="alert" className="mt-4 text-center text-sm text-warning">{setupError}</p>}
        <button type="button" className="btn-primary mt-4 w-full" disabled={!!setupError} onClick={start}>
          <Layers size={18} aria-hidden /> Distribuer les cartes
        </button>
      </Shell>
    );
  }

  const quit = () => {
    if (game.winner !== null || window.confirm('Quitter la partie en cours ?')) setGame(null);
  };

  if (game.winner !== null) {
    const ranking = game.seats.map((s, i) => ({...s, i})).sort((a, b) => a.hand.length - b.hand.length);
    return (
      <Shell title="Fin de partie" kicker="Chroma Clash" onBack={() => setGame(null)}>
        <div className="space-y-5 text-center">
          <Trophy size={56} className="mx-auto text-warning" aria-hidden />
          <p className="font-display text-4xl font-bold">{game.seats[game.winner].name} gagne !</p>
          <ol className="panel divide-y divide-line text-left">
            {ranking.map((s, rank) => (
              <li key={s.i} className="flex items-center justify-between px-4 py-3">
                <span>{rank + 1}. {s.name}{s.bot && <Bot size={14} className="ml-1 inline text-muted" aria-label="bot" />}</span>
                <span className="font-mono text-muted">{s.hand.length} carte{s.hand.length > 1 ? 's' : ''}</span>
              </li>
            ))}
          </ol>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn-primary" onClick={start}><RotateCcw size={18} aria-hidden /> Rejouer</button>
            <button type="button" className="btn-secondary" onClick={() => setGame(null)}>Changer les joueurs</button>
          </div>
        </div>
      </Shell>
    );
  }

  const needsHandoff = !me!.bot && humanCount > 1 && revealedFor !== game.current;
  const topCard = top(game);
  const hand = viewer !== null ? game.seats[viewer].hand : [];
  const myTurn = viewer === game.current && !me!.bot;

  const toggle = (c: Card) => {
    if (!myTurn) return;
    setSelected((sel) => (sel.includes(c.id) ? sel.filter((id) => id !== c.id) : [...sel, c.id]));
  };
  const selectable = (c: Card) =>
    myTurn && (selected.includes(c.id) || (selected.length === 0 ? canPlay(c, game) : validSelection([...selected, c.id], game)));
  const canSubmit = myTurn && validSelection(selected, game);
  const submit = (ids = selected) => {
    const last = hand.find((c) => c.id === ids[ids.length - 1])!;
    if (isWild(last)) {
      setColorPick(ids);
      return;
    }
    setGame(play(game, ids));
  };
  const showAnnounce = myTurn && !game.announced && hand.length >= 2 && hand.length <= 4;

  return (
    <Shell
      title="Chroma Clash"
      kicker={`Au tour de ${me!.name}`}
      onBack={quit}
      backLabel="Quitter la partie"
      right={
        <span className="tag" title="Sens du jeu">
          {game.direction === 1 ? <RotateCw size={14} aria-hidden /> : <RotateCcw size={14} aria-hidden />}
          <span className="sr-only">{game.direction === 1 ? 'Sens horaire' : 'Sens inverse'}</span>
        </span>
      }>
      {needsHandoff ? (
        <Handoff name={me!.name} hint="Ta main va s’afficher." onReady={() => setRevealedFor(game.current)} />
      ) : (
        <div className="space-y-5">
          <ul className="flex flex-wrap justify-center gap-2" aria-label="Joueurs">
            {game.seats.map((s, i) => (
              <li
                key={i}
                aria-current={i === game.current ? 'true' : undefined}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${i === game.current ? 'border-cyan bg-cyan/15' : 'border-line bg-surface2/50'}`}>
                {s.bot && <Bot size={14} className="text-muted" aria-label="bot" />}
                <span className="font-semibold">{s.name}</span>
                <span className={`font-mono ${s.hand.length === 1 ? 'text-warning' : 'text-muted'}`}>{s.hand.length}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              className="flex h-36 w-24 flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface2 text-sm font-semibold text-muted disabled:opacity-40"
              disabled={!myTurn || game.drawnCardId !== null}
              onClick={() => setGame(drawTurn(game))}
              aria-label={game.pendingDraw > 0 ? `Piocher ${game.pendingDraw} cartes` : 'Piocher une carte'}>
              <Layers size={28} aria-hidden />
              {game.pendingDraw > 0 ? `+${game.pendingDraw}` : 'Pioche'}
              <span className="font-mono text-xs">{game.draw.length}</span>
            </button>
            <div className="flex flex-col items-center gap-2">
              <CardView card={topCard} large />
              <span className="tag" style={{color: COLOR_HEX[game.activeColor], borderColor: COLOR_HEX[game.activeColor]}}>
                {COLOR_GLYPH[game.activeColor]} {COLOR_LABELS[game.activeColor]}
              </span>
            </div>
          </div>

          <p className="min-h-[1.5rem] text-center text-sm text-muted" aria-live="polite">
            {game.lastEvent}
            {game.pendingDraw > 0 && myTurn && <strong className="ml-1 text-warning">Pioche {game.pendingDraw} ou réponds par un +2/+3.</strong>}
          </p>

          {viewer !== null ? (
            <section aria-label={`Main de ${game.seats[viewer].name}`}>
              {!myTurn && <p className="mb-2 text-center text-sm text-muted">Ta main (en attente de {me!.name}…)</p>}
              <div className="flex flex-wrap justify-center gap-2 pt-3">
                {hand.map((c) => (
                  <CardView key={c.id} card={c} selected={selected.includes(c.id)} disabled={!selectable(c)} onClick={() => toggle(c)} />
                ))}
              </div>
            </section>
          ) : (
            <p className="flex items-center justify-center gap-2 text-center text-muted"><Bot size={18} aria-hidden /> {me!.name} réfléchit…</p>
          )}

          {myTurn && (
            <div className="sticky bottom-2 grid gap-2 sm:grid-cols-3">
              <button type="button" className="btn-primary sm:col-span-1" disabled={!canSubmit} onClick={() => submit()}>
                Poser{selected.length > 1 ? ` ${selected.length} cartes` : ''}
              </button>
              {game.drawnCardId !== null ? (
                <button type="button" className="btn-secondary" onClick={() => setGame(pass(game))}>
                  <ArrowLeftRight size={18} aria-hidden /> Garder et passer
                </button>
              ) : (
                <button type="button" className="btn-secondary" onClick={() => setGame(drawTurn(game))}>
                  <Layers size={18} aria-hidden /> {game.pendingDraw > 0 ? `Piocher ${game.pendingDraw}` : 'Piocher'}
                </button>
              )}
              {showAnnounce ? (
                <button type="button" className="btn-secondary border-warning/60 text-warning" onClick={() => setGame(announce(game))}>
                  <Megaphone size={18} aria-hidden /> Dernière carte !
                </button>
              ) : game.announced ? (
                <p className="tag justify-center text-warning">Annoncé</p>
              ) : null}
            </div>
          )}
        </div>
      )}

      {colorPick && (
        <div role="dialog" aria-modal="true" aria-labelledby="pick-title" className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="panel w-full max-w-sm p-5">
            <h2 id="pick-title" className="mb-4 text-center text-xl font-bold">Choisis la couleur</h2>
            <div className="grid grid-cols-2 gap-3">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="btn border-2 bg-surface2 text-lg"
                  style={{borderColor: COLOR_HEX[c], color: COLOR_HEX[c]}}
                  onClick={() => {
                    setGame(play(game, colorPick, c));
                    setColorPick(null);
                  }}>
                  {COLOR_GLYPH[c]} {COLOR_LABELS[c]}
                </button>
              ))}
            </div>
            <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setColorPick(null)}>Annuler</button>
          </div>
        </div>
      )}
    </Shell>
  );
}
