import {
  ArrowLeftRight,
  Bot,
  Clock,
  Eye,
  EyeOff,
  HelpCircle,
  Layers,
  Megaphone,
  Minus,
  Palette,
  Plus,
  RotateCcw,
  RotateCw,
  Siren,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import {useEffect, useMemo, useRef, useState} from 'react';
import {codeFromUrl} from '../_party/online';
import {Handoff, PlayerSetup, Shell} from '../_party/ui';
import {
  announce,
  botMove,
  canPlay,
  cardLabel,
  COLOR_LABELS,
  COLORS,
  counterUno,
  drawTurn,
  FORGOT_PENALTY,
  GAME_SCORE_WIN,
  handPoints,
  isWild,
  MAX_SEATS,
  MIN_SEATS,
  newGame,
  pass,
  play,
  playableCards,
  top,
  validSelection,
  winnerRoundPoints,
  type Card,
  type Color,
  type GameState,
  type Rules,
} from './logic';
import {OnlineGame} from './Online';
import {
  isSoundMuted,
  sfxCardDraw,
  sfxCardPlay,
  sfxPenalty,
  sfxSpecial,
  sfxUnoCall,
  sfxWinRound,
  toggleSoundMuted,
} from './sound';

/**
 * Authentic Four-Colors (UNO Online) palette mapped to Chroma Clash suits:
 * - cyan  -> Electric Sky Blue (#0089d0)
 * - rose  -> Crimson Red (#ef1c24)
 * - ambre -> Golden Yellow (#f59e0b / #ffc619)
 * - vert  -> Vivid Emerald Green (#38b61a)
 */
const SUIT_THEME: Record<
  Color,
  {
    bg: string;
    hex: string;
    textHex: string;
    darkHex: string;
    glyph: string;
    unoName: string;
  }
> = {
  cyan: {
    bg: 'linear-gradient(145deg, #1cb5ff 0%, #0089d0 55%, #005b94 100%)',
    hex: '#0089d0',
    textHex: '#38e1ff',
    darkHex: '#005b94',
    glyph: '●',
    unoName: 'Bleu Cyan',
  },
  rose: {
    bg: 'linear-gradient(145deg, #ff4b55 0%, #ef1c24 55%, #a80710 100%)',
    hex: '#ef1c24',
    textHex: '#ff6b78',
    darkHex: '#a80710',
    glyph: '▲',
    unoName: 'Rouge Rose',
  },
  ambre: {
    bg: 'linear-gradient(145deg, #ffe047 0%, #ffc619 55%, #d98200 100%)',
    hex: '#d98200',
    textHex: '#ffd13b',
    darkHex: '#945200',
    glyph: '■',
    unoName: 'Jaune Ambre',
  },
  vert: {
    bg: 'linear-gradient(145deg, #5ce63c 0%, #38b61a 55%, #1d7509 100%)',
    hex: '#38b61a',
    textHex: '#5ce63c',
    darkHex: '#1d7509',
    glyph: '◆',
    unoName: 'Vert Émeraude',
  },
};

const CARBON_BG =
  'repeating-linear-gradient(-45deg, #141824 0px, #141824 5px, #090c14 5px, #090c14 10px)';

type CardBackId = 'classic' | 'obsidian' | 'phosphor' | 'gold' | 'prisme';
type TableFeltId = 'royal' | 'emerald' | 'nebula' | 'cyber_gold';

const CARD_BACK_THEMES: Record<CardBackId, {label: string; bg: string; badge: string; minLevel: number}> = {
  classic: {
    minLevel: 1,
    label: 'Carbone 4 Colors',
    bg: CARBON_BG,
    badge: '4',
  },
  obsidian: {
    minLevel: 1,
    label: 'Obsidian Pulse',
    bg: 'linear-gradient(135deg, #0b396e 0%, #1d1042 55%, #070a14 100%)',
    badge: '⚡',
  },
  phosphor: {
    minLevel: 2,
    label: 'Matrice Phosphore',
    bg: 'linear-gradient(135deg, #064e3b 0%, #022c22 65%, #03120e 100%)',
    badge: '◈',
  },
  gold: {
    minLevel: 3,
    label: 'Atelier Cyber-Or',
    bg: 'linear-gradient(135deg, #78350f 0%, #3b1704 60%, #140802 100%)',
    badge: '★',
  },
  prisme: {
    minLevel: 5,
    label: 'Prisme Holographique Ω',
    bg: 'linear-gradient(135deg, #2563eb 0%, #9333ea 50%, #ec4899 100%)',
    badge: 'Ω',
  },
};

const TABLE_FELT_THEMES: Record<TableFeltId, {label: string; bg: string; border: string; minLevel: number}> = {
  royal: {
    minLevel: 1,
    label: 'Casino Bleu Royal',
    bg: 'repeating-linear-gradient(-45deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 3px, transparent 3px, transparent 9px), radial-gradient(circle at 50% 45%, #0c4d91 0%, #062852 58%, #021229 100%)',
    border: '#1f5fa8',
  },
  emerald: {
    minLevel: 1,
    label: 'Velours Émeraude',
    bg: 'repeating-linear-gradient(-45deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 3px, transparent 3px, transparent 9px), radial-gradient(circle at 50% 45%, #0d6e4c 0%, #063d2a 58%, #021c13 100%)',
    border: '#10b981',
  },
  nebula: {
    minLevel: 2,
    label: 'Nébuleuse Cyber-Violette',
    bg: 'repeating-linear-gradient(-45deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 3px, transparent 3px, transparent 9px), radial-gradient(circle at 50% 45%, #4c1d95 0%, #271052 58%, #0f0524 100%)',
    border: '#a855f7',
  },
  cyber_gold: {
    minLevel: 3,
    label: 'Forge Carbone & Or',
    bg: 'repeating-linear-gradient(-45deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 3px, transparent 3px, transparent 9px), radial-gradient(circle at 50% 45%, #5c3a09 0%, #2b1a04 58%, #120a01 100%)',
    border: '#f59e0b',
  },
};

function readEquippedCosmetics(): {cardBack: CardBackId; tableFelt: TableFeltId; unlockedLevel: number} {
  try {
    const raw = window.localStorage.getItem('euloge-arcade:cosmetics');
    if (!raw) return {cardBack: 'classic', tableFelt: 'royal', unlockedLevel: 1};
    const parsed = JSON.parse(raw) as {cardBack?: CardBackId; tableFelt?: TableFeltId; unlockedLevel?: number};
    return {
      cardBack: parsed.cardBack && parsed.cardBack in CARD_BACK_THEMES ? parsed.cardBack : 'classic',
      tableFelt: parsed.tableFelt && parsed.tableFelt in TABLE_FELT_THEMES ? parsed.tableFelt : 'royal',
      unlockedLevel: typeof parsed.unlockedLevel === 'number' ? Math.max(1, parsed.unlockedLevel) : 1,
    };
  } catch {
    return {cardBack: 'classic', tableFelt: 'royal', unlockedLevel: 1};
  }
}

function saveEquippedCosmetics(cardBack: CardBackId, tableFelt: TableFeltId) {
  try {
    const raw = window.localStorage.getItem('euloge-arcade:cosmetics');
    const prev = raw ? JSON.parse(raw) : {};
    window.localStorage.setItem(
      'euloge-arcade:cosmetics',
      JSON.stringify({...prev, cardBack, tableFelt}),
    );
  } catch {
    /* ignore */
  }
}

const BOT_DELAY_MS = 850;
const BOT_NAMES = ['Ion', 'Néon', 'Volt', 'Flux', 'Arc', 'Delta', 'Quark'];

function cornerSymbol(c: Card) {
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

/** 4-quadrant diamond icon used on Wild cards, card backs, and the "1" UNO button. */
function FourColorsDiamond({size = 'md', label}: {size?: 'sm' | 'md' | 'lg'; label?: string}) {
  const dim = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-5 w-5' : 'h-9 w-9';
  return (
    <span
      aria-hidden
      className={`relative inline-grid ${dim} rotate-45 grid-cols-2 grid-rows-2 overflow-hidden rounded-md border-2 border-white shadow-md`}>
      <span style={{background: '#ef1c24'}} />
      <span style={{background: '#ffc619'}} />
      <span style={{background: '#38b61a'}} />
      <span style={{background: '#0089d0'}} />
      {label && (
        <span
          className="absolute inset-0 flex -rotate-45 items-center justify-center font-display font-black text-white"
          style={{
            fontSize: size === 'lg' ? '1.35rem' : size === 'sm' ? '0.65rem' : '0.95rem',
            textShadow: '0 2px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000',
          }}>
          {label}
        </span>
      )}
    </span>
  );
}

/** Face-down "4 COLORS" carbon-fiber or holographic prestige card back for the draw deck and opponent hands. */
function CardBack({
  size = 'md',
  side = 'bottom',
  cosmetic = 'classic',
  className = '',
}: {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  side?: 'bottom' | 'left' | 'top' | 'right';
  cosmetic?: CardBackId;
  className?: string;
}) {
  const dims =
    size === 'lg'
      ? 'h-36 w-24 rounded-2xl p-[3px]'
      : size === 'md'
        ? 'h-28 w-20 rounded-xl p-[2.5px]'
        : size === 'sm'
          ? 'h-16 w-11 rounded-lg p-[2px]'
          : 'h-12 w-8 rounded-md p-[1.5px]';
  const rot =
    side === 'left' ? 'rotate-90' : side === 'top' ? 'rotate-180' : side === 'right' ? '-rotate-90' : '';
  const theme = CARD_BACK_THEMES[cosmetic] ?? CARD_BACK_THEMES.classic;
  return (
    <span
      aria-hidden
      className={`inline-block select-none bg-white shadow-[0_6px_16px_rgba(0,0,0,0.6)] ${dims} ${rot} ${className}`}>
      <span
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit] border border-black/80"
        style={{background: theme.bg}}>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/40" />
        <FourColorsDiamond size={size === 'lg' ? 'md' : 'sm'} label={theme.badge} />
      </span>
    </span>
  );
}

/**
 * Authentic Four-Colors / UNO Online card face:
 * - Crisp white rounded frame + saturated suit background (or carbon-fiber for Wilds)
 * - Rotated white center diamond with 3D-stroked numeral or action graphic
 * - Top-left upright + Bottom-right inverted corner indices + color-blind glyph
 */
function CardView({
  card,
  large = false,
  compact = false,
  selected = false,
  disabled = false,
  onClick,
}: {
  card: Card;
  large?: boolean;
  compact?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const wild = isWild(card);
  const suit = card.color ? SUIT_THEME[card.color] : null;
  const dims = large
    ? 'h-36 w-24 sm:h-40 sm:w-28 rounded-2xl p-[3.5px]'
    : compact
      ? 'h-20 w-14 rounded-xl p-[2px]'
      : 'h-28 w-20 sm:h-32 sm:w-[5.4rem] rounded-2xl p-[3px]';
  const diamondSize = large
    ? 'h-16 w-16 sm:h-[4.4rem] sm:w-[4.4rem] rounded-xl'
    : compact
      ? 'h-9 w-9 rounded-md'
      : 'h-12 w-12 sm:h-14 sm:w-14 rounded-lg';
  const centerFontSize = large ? 'text-4xl sm:text-5xl' : compact ? 'text-xl' : 'text-3xl sm:text-4xl';
  const cornerFontSize = large ? 'text-xs sm:text-sm' : compact ? 'text-[9px]' : 'text-[11px] sm:text-xs';
  const sym = cornerSymbol(card);
  const glyph = suit ? suit.glyph : '✦';

  const face = (
    <span
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[inherit] border border-black/50 font-display font-black select-none"
      style={{
        background: wild ? CARBON_BG : suit!.bg,
      }}>
      {/* Glossy diagonal card sheen */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/30 via-white/5 to-black/25"
      />

      {/* Top-Left Corner Index + Accessibility Shape */}
      <span
        aria-hidden
        className={`absolute left-1.5 top-1 flex flex-col items-center leading-none text-white ${cornerFontSize}`}
        style={{textShadow: '0 1.5px 0 rgba(0,0,0,0.85)'}}>
        <span>{sym}</span>
        <span className="text-[8px] opacity-95">{glyph}</span>
      </span>

      {/* Bottom-Right Inverted Corner Index */}
      <span
        aria-hidden
        className={`absolute bottom-1 right-1.5 flex rotate-180 flex-col items-center leading-none text-white ${cornerFontSize}`}
        style={{textShadow: '0 1.5px 0 rgba(0,0,0,0.85)'}}>
        <span>{sym}</span>
        <span className="text-[8px] opacity-95">{glyph}</span>
      </span>

      {/* Rotated White Center Diamond (Four Colors signature style) */}
      <span
        aria-hidden
        className={`relative flex rotate-45 items-center justify-center bg-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.25),0_3px_8px_rgba(0,0,0,0.4)] ${diamondSize}`}>
        <span className="flex -rotate-45 items-center justify-center">
          {card.kind === 'prisme' ? (
            <FourColorsDiamond size={large ? 'md' : 'sm'} />
          ) : card.kind === 'surcharge' ? (
            <span className="relative flex items-center justify-center">
              <FourColorsDiamond size={large ? 'md' : 'sm'} label="+3" />
            </span>
          ) : (
            <span
              className={`${centerFontSize} font-black tracking-tighter ${
                card.value === 6 || card.value === 9 ? 'underline decoration-2 underline-offset-2' : ''
              }`}
              style={{
                color: suit!.hex,
                textShadow: '1.5px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
              }}>
              {sym}
            </span>
          )}
        </span>
      </span>
    </span>
  );

  if (!onClick) {
    return (
      <span
        className={`inline-block bg-white shadow-[0_10px_24px_rgba(0,0,0,0.65)] ${dims}`}
        role="img"
        aria-label={cardLabel(card)}>
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
      className={`group relative bg-white transition-all duration-200 ${dims} ${
        selected
          ? '-translate-y-4 scale-105 ring-4 ring-[#38e1ff] shadow-[0_16px_32px_rgba(56,225,255,0.55)] z-20'
          : disabled
            ? 'opacity-40 saturate-75'
            : 'hover:-translate-y-2.5 hover:scale-[1.03] hover:z-10 shadow-[0_8px_20px_rgba(0,0,0,0.6)] hover:shadow-[0_14px_26px_rgba(56,225,255,0.35)]'
      }`}>
      {face}
    </button>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface2/50 px-3 py-2">
      <span className="flex items-center gap-2 font-semibold">
        <Bot size={16} aria-hidden /> {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-ghost min-h-[40px] px-2"
          aria-label={`Moins de ${label}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}>
          <Minus size={16} aria-hidden />
        </button>
        <span className="w-6 text-center font-mono text-lg">{value}</span>
        <button
          type="button"
          className="btn-ghost min-h-[40px] px-2"
          aria-label={`Plus de ${label}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}>
          <Plus size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Opponent seat rendered on TOP, LEFT, or RIGHT of the Four-Colors casino table. */
function OpponentTableSeat({
  seat,
  seatIndex,
  isCurrent,
  score,
  side,
  revealCards = false,
  cardBack = 'classic',
}: {
  seat: GameState['seats'][number];
  seatIndex: number;
  isCurrent: boolean;
  score: number;
  side: 'top' | 'left' | 'right';
  revealCards?: boolean;
  cardBack?: CardBackId;
}) {
  const visibleBackCount = Math.min(seat.hand.length, 8);
  const extraCount = Math.max(0, seat.hand.length - visibleBackCount);
  const isVertical = side === 'left' || side === 'right';

  return (
    <div
      data-seat={seatIndex}
      className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-2 transition-all duration-300 ${
        isCurrent
          ? 'border-[#38e1ff] bg-[#072a52]/95 shadow-[0_0_24px_rgba(56,225,255,0.4)] scale-[1.02]'
          : 'border-white/15 bg-[#04152d]/80'
      }`}>
      {/* Player Nameplate & Score */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
        {seat.bot ? (
          <Bot size={13} className="text-[#38e1ff]" aria-label="bot" />
        ) : (
          <Users size={13} className="text-[#5ce63c]" aria-hidden />
        )}
        <span className="max-w-[7.5rem] truncate font-display font-bold text-white">{seat.name}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 font-mono text-[11px] font-bold ${
            seat.hand.length === 1
              ? 'bg-[#ffc619] text-black animate-pulse'
              : 'bg-white/10 text-white/90'
          }`}>
          {seat.hand.length} {seat.hand.length === 1 ? '· UNO!' : ''}
        </span>
      </div>

      {/* Tournament Score Pill (Four Colors 0 / 250 pts) */}
      <div className="flex items-center gap-1 font-mono text-[10px] text-[#38e1ff]">
        <Trophy size={10} className="text-[#ffc619]" aria-hidden />
        <span>
          {score} / {GAME_SCORE_WIN} pts
        </span>
      </div>

      {/* Fanned Cards (Face-down during play, or Face-up when inspecting at round end) */}
      {revealCards ? (
        <div className="mt-1 flex flex-wrap justify-center gap-1">
          {seat.hand.map((c) => (
            <CardView key={c.id} card={c} compact />
          ))}
        </div>
      ) : (
        <div
          aria-hidden
          className={`flex items-center justify-center ${
            isVertical ? 'my-1 -space-x-4 sm:-space-x-3' : 'my-0.5 -space-x-4'
          }`}>
          {Array.from({length: visibleBackCount}, (_, idx) => (
            <CardBack key={idx} size="xs" side={side} cosmetic={cardBack} />
          ))}
          {extraCount > 0 && (
            <span className="ml-1 rounded-full bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
              +{extraCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const BLITZ_TURN_SECONDS = 15;

export default function App() {
  const initialOnlineCode = useMemo(codeFromUrl, []);
  const [onlineMode, setOnlineMode] = useState(() => Boolean(initialOnlineCode));

  const [humans, setHumans] = useState<string[]>([]);
  const [humansError, setHumansError] = useState<string | null>(null);
  const [bots, setBots] = useState(1);
  const [rules, setRules] = useState<Rules>({combos: true, stacking: true, sevenZero: false});
  const [blitzMode, setBlitzMode] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const [cosmetics, setCosmetics] = useState(readEquippedCosmetics);
  const [game, setGame] = useState<GameState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [colorPick, setColorPick] = useState<number[] | null>(null);
  const [swapPick, setSwapPick] = useState<{ids: number[]; color: Color | null} | null>(null);
  /** Seat whose hand is currently revealed on screen (hot-seat privacy). */
  const [revealedFor, setRevealedFor] = useState<number | null>(null);
  /** Cumulative tournament scores toward 250 pts (Four Colors style). */
  const [scores, setScores] = useState<number[]>([]);
  /** Whether the player is inspecting the table hands at the end of a round (`but_show`). */
  const [inspectTableOnWin, setInspectTableOnWin] = useState(false);
  /** Sound mute state. */
  const [muted, setMuted] = useState(() => isSoundMuted());
  /** Animated action splash banner at the center of the table. */
  const [actionSplash, setActionSplash] = useState<{text: string; color: string} | null>(null);
  /** Animated flying card when a card is played onto the discard pile. */
  const [flyingCard, setFlyingCard] = useState<Card | null>(null);
  /** Countdown seconds left when blitzMode is enabled. */
  const [turnSecondsLeft, setTurnSecondsLeft] = useState(BLITZ_TURN_SECONDS);
  const matchStartedAtRef = useRef<number>(Date.now());
  const scoredRoundRef = useRef<GameState | null>(null);

  const total = humans.length + bots;
  const setupError =
    humansError ??
    (total < MIN_SEATS
      ? 'Il faut au moins 2 joueurs (ajoute un bot).'
      : total > MAX_SEATS
        ? `${MAX_SEATS} joueurs maximum.`
        : null);
  const humanCount = game ? game.seats.filter((s) => !s.bot).length : 0;

  function triggerSplash(text: string, color = '#38e1ff') {
    setActionSplash({text, color});
  }

  useEffect(() => {
    if (!actionSplash) return;
    const t = window.setTimeout(() => setActionSplash(null), 1600);
    return () => window.clearTimeout(t);
  }, [actionSplash]);

  useEffect(() => {
    if (!flyingCard) return;
    const t = window.setTimeout(() => setFlyingCard(null), 420);
    return () => window.clearTimeout(t);
  }, [flyingCard]);

  function startWithConfig(humanNames: string[], botCount: number, keepTournamentScores = false) {
    const effectiveHumans = humanNames.length > 0 ? humanNames : ['Joueur 1'];
    const seats = [
      ...effectiveHumans.map((name) => ({name, bot: false})),
      ...Array.from({length: botCount}, (_, i) => ({
        name: `Bot ${BOT_NAMES[i % BOT_NAMES.length]}`,
        bot: true,
      })),
    ];
    const next = newGame(seats, rules);
    matchStartedAtRef.current = Date.now();
    scoredRoundRef.current = null;
    setInspectTableOnWin(false);
    if (!keepTournamentScores || scores.length !== seats.length || scores.some((sc) => sc >= GAME_SCORE_WIN)) {
      setScores(seats.map(() => 0));
    }
    setGame(next);
    setSelected([]);
    setRevealedFor(null);
    setTurnSecondsLeft(BLITZ_TURN_SECONDS);
    sfxCardDraw();
  }

  function start() {
    startWithConfig(humans, bots, false);
  }

  function applyPlayTransition(
    currentGame: GameState,
    ids: number[],
    chosenColor: Color | null = null,
    swapTarget?: number,
    keepVulnerable = false,
  ): GameState {
    const seat = currentGame.seats[currentGame.current];
    const played = ids.map((id) => seat.hand.find((c) => c.id === id)!).filter(Boolean);
    const last = played[played.length - 1];
    if (last) setFlyingCard(last);
    const forgotUno = seat.hand.length - played.length === 1 && !currentGame.announced;
    const nextState = play(currentGame, ids, chosenColor, Math.random, {
      swapTarget,
      keepVulnerable,
    });

    if (nextState.winner !== null) {
      sfxWinRound();
    } else if (forgotUno && !keepVulnerable) {
      sfxPenalty();
      triggerSplash(`OUBLI DU « 1 » ! +${FORGOT_PENALTY} CARTES`, '#ffc619');
    } else if (forgotUno && keepVulnerable) {
      triggerSplash(`⚠️ ${seat.name.toUpperCase()} N'A PAS DIT « 1 » !`, '#ef1c24');
    } else if (currentGame.rules.sevenZero && last?.kind === 'num' && last.value === 7) {
      sfxSpecial('retour');
      triggerSplash('⇄ RÈGLE DU 7 : MAINS ÉCHANGÉES !', '#38e1ff');
    } else if (currentGame.rules.sevenZero && last?.kind === 'num' && last.value === 1) {
      sfxSpecial('retour');
      triggerSplash('↻ RÈGLE DU 1 : ROTATION DES MAINS !', '#ffc619');
    } else if (last && last.kind !== 'num') {
      sfxSpecial(last.kind);
      const splashMap: Record<Exclude<Card['kind'], 'num'>, string> = {
        bond: '⊘ TOUR PASSÉ !',
        retour: '⇄ SENS INVERSÉ !',
        plus2: '+2 CARTES !',
        prisme: `◈ COULEUR ${COLOR_LABELS[nextState.activeColor].toUpperCase()} !`,
        surcharge: `+3 SURCHARGE (${COLOR_LABELS[nextState.activeColor].toUpperCase()}) !`,
      };
      triggerSplash(splashMap[last.kind], SUIT_THEME[nextState.activeColor].textHex);
    } else {
      sfxCardPlay();
    }
    return nextState;
  }

  // Record round points toward 250 pts and bridge score to Euloge Arcade when a round finishes.
  useEffect(() => {
    if (!game || game.winner === null || scoredRoundRef.current === game) return;
    scoredRoundRef.current = game;
    const winIdx = game.winner;
    const pts = winnerRoundPoints(game);
    setScores((prev) => {
      const base = prev.length === game.seats.length ? prev : game.seats.map(() => 0);
      return base.map((sc, idx) => (idx === winIdx ? sc + pts : sc));
    });

    // If a human won, send score to the platform leaderboard bridge
    if (!game.seats[winIdx].bot && typeof window !== 'undefined' && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          {
            source: 'euloge-arcade-game',
            version: 1,
            type: 'run-finished',
            gameSlug: 'chroma-clash',
            score: Math.max(15, pts),
            durationMs: Math.max(1000, Date.now() - matchStartedAtRef.current),
          },
          window.location.origin,
        );
      } catch {
        // Ignore cross-origin postMessage errors in standalone mode
      }
    }
  }, [game]);

  // Bots play on their own after a short, readable pause.
  // They occasionally "forget" to announce their last card, opening a Contre-1 window for humans.
  useEffect(() => {
    if (!game || game.winner !== null || !game.seats[game.current].bot || colorPick || swapPick) return;
    const delay = game.vulnerableSeat !== null && game.vulnerableSeat !== undefined ? BOT_DELAY_MS * 2 : BOT_DELAY_MS;
    const t = window.setTimeout(() => {
      setGame((g) => {
        if (!g || g.winner !== null || !g.seats[g.current].bot) return g;
        const m = botMove(g);
        if (m.type === 'play') {
          const forgets = Math.random() < 0.18;
          return applyPlayTransition(forgets ? g : announce(g), m.ids, m.color, undefined, forgets);
        }
        if (m.type === 'draw') {
          sfxCardDraw();
          return drawTurn(g);
        }
        return pass(g);
      });
    }, delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, colorPick, swapPick]);

  // Bots catch a human who forgot to announce « 1 ! » (Contre-1) after a short reaction time.
  useEffect(() => {
    if (!game || game.winner !== null) return;
    const v = game.vulnerableSeat;
    if (v === null || v === undefined || game.seats[v].bot || !game.seats.some((s) => s.bot)) return;
    const t = window.setTimeout(() => {
      setGame((g) => {
        if (!g || g.vulnerableSeat !== v) return g;
        sfxPenalty();
        triggerSplash(`🚨 CONTRE-1 ! ${g.seats[v].name.toUpperCase()} PIOCHE +${FORGOT_PENALTY}`, '#ef1c24');
        return counterUno(g);
      });
    }, 1300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.vulnerableSeat, game?.winner]);

  // Blitz chrono: 15 s per human turn, then the turn is played automatically (draw, then pass).
  useEffect(() => {
    setTurnSecondsLeft(BLITZ_TURN_SECONDS);
  }, [game?.current, game?.drawnCardId, game?.discard.length]);

  useEffect(() => {
    if (!blitzMode || !game || game.winner !== null || game.seats[game.current].bot) return;
    if (colorPick || swapPick) return;
    const humansAtTable = game.seats.filter((s) => !s.bot).length;
    if (humansAtTable > 1 && revealedFor !== game.current) return; // waiting for the hand-off screen
    if (turnSecondsLeft <= 0) {
      sfxPenalty();
      triggerSplash('⏱ TEMPS ÉCOULÉ !', '#ef1c24');
      setGame((g) => {
        if (!g || g.winner !== null || g.seats[g.current].bot) return g;
        return g.drawnCardId !== null ? pass(g) : drawTurn(g);
      });
      return;
    }
    const t = window.setTimeout(() => setTurnSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blitzMode, game, turnSecondsLeft, colorPick, swapPick, revealedFor]);

  // A new human turn starts with nothing selected.
  useEffect(() => setSelected([]), [game?.current, game?.drawnCardId]);

  const me = game ? game.seats[game.current] : null;
  const viewer = useMemo(() => {
    if (!game) return null;
    if (humanCount === 1) return game.seats.findIndex((s) => !s.bot);
    return !game.seats[game.current].bot && revealedFor === game.current ? game.current : null;
  }, [game, humanCount, revealedFor]);

  //Arrange opponents around the 3 upper sides of the table (LEFT, TOP, RIGHT) relative to the viewer.
  const opponentsBySide = useMemo(() => {
    if (!game) return {left: [], top: [], right: []};
    const pivot = viewer ?? 0;
    const totalSeats = game.seats.length;
    const ordered: {seat: GameState['seats'][number]; index: number}[] = [];
    for (let offset = 1; offset < totalSeats; offset++) {
      const idx = (pivot + offset) % totalSeats;
      ordered.push({seat: game.seats[idx], index: idx});
    }
    if (ordered.length === 1) {
      return {left: [], top: [ordered[0]], right: []};
    }
    if (ordered.length === 2) {
      return {left: [ordered[0]], top: [], right: [ordered[1]]};
    }
    if (ordered.length === 3) {
      return {left: [ordered[0]], top: [ordered[1]], right: [ordered[2]]};
    }
    return {
      left: [ordered[0]],
      top: ordered.slice(1, ordered.length - 1),
      right: [ordered[ordered.length - 1]],
    };
  }, [game, viewer]);

  const equipCosmetics = (next: Partial<{cardBack: CardBackId; tableFelt: TableFeltId}>) => {
    setCosmetics((prev) => {
      const merged = {...prev, ...next};
      saveEquippedCosmetics(merged.cardBack, merged.tableFelt);
      return merged;
    });
  };
  const felt = TABLE_FELT_THEMES[cosmetics.tableFelt];

  // ---------------- ONLINE ROOMS (code à 6 lettres, multi-appareils) ----------------
  if (onlineMode) {
    return <OnlineGame initialCode={initialOnlineCode} onExit={() => setOnlineMode(false)} />;
  }

  // ---------------- SETUP SCREEN (Four Colors Mode Selector + Party Setup) ----------------
  if (!game) {
    return (
      <Shell
        title="Chroma Clash · 4 Colors"
        kicker="Table UNO Arcade · Solo vs IA ou Entre Amis"
        right={
          <button
            type="button"
            onClick={() => setShowTutorial((v) => !v)}
            className="btn-ghost min-h-[38px] px-2.5 text-xs">
            <HelpCircle size={16} aria-hidden /> Guide 250 pts
          </button>
        }>
        {/* Quick Four-Colors Table Presets (2P / 3P / 4P like CrazyGames UNO Online) */}
        <section
          aria-label="Sélection rapide du nombre de joueurs"
          className="relative overflow-hidden rounded-3xl border border-[#38e1ff]/35 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
          style={{
            background:
              'radial-gradient(circle at 50% 35%, #0c4a8a 0%, #052247 60%, #021024 100%)',
          }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-widest text-[#38e1ff]">
                <Sparkles size={12} aria-hidden /> Mode Arcade 4 Colors
              </span>
              <h2 className="mt-2 font-display text-2xl font-black text-white sm:text-3xl">
                Choisis ta table de jeu
              </h2>
              <p className="mt-1 text-sm text-white/80">
                Atteins <strong>{GAME_SCORE_WIN} points</strong> en vidant ta main avant tes adversaires !
              </p>
            </div>
            <FourColorsDiamond size="lg" label="4" />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              {players: 2, botCount: 1, label: '2 Joueurs', sub: 'Duel rapide', color: '#38b61a'},
              {players: 3, botCount: 2, label: '3 Joueurs', sub: 'Table tactique', color: '#ffc619'},
              {players: 4, botCount: 3, label: '4 Joueurs', sub: 'Classique UNO', color: '#ef1c24'},
            ].map((preset) => {
              const isSelected = humans.length === 1 && bots === preset.botCount;
              return (
                <button
                  key={preset.players}
                  type="button"
                  onClick={() => {
                    setBots(preset.botCount);
                    if (humans.length === 1 && !humansError) {
                      startWithConfig(humans, preset.botCount, false);
                    }
                  }}
                  className={`group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3.5 text-center transition-all ${
                    isSelected
                      ? 'border-white bg-white/15 shadow-[0_0_25px_rgba(56,225,255,0.45)] scale-[1.02]'
                      : 'border-white/20 bg-black/30 hover:border-white/60 hover:bg-white/10'
                  }`}>
                  <span
                    aria-hidden
                    className="flex h-12 w-12 rotate-45 items-center justify-center rounded-xl border-2 border-white shadow-md transition-transform group-hover:scale-110"
                    style={{background: preset.color}}>
                    <span
                      className="-rotate-45 font-display text-xl font-black text-white"
                      style={{textShadow: '0 2px 0 rgba(0,0,0,0.85)'}}>
                      {preset.players}P
                    </span>
                  </span>
                  <div>
                    <span className="block font-display text-sm font-bold text-white sm:text-base">
                      {preset.label}
                    </span>
                    <span className="block text-[11px] text-white/75">{preset.sub}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setOnlineMode(true)}
            className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-[#5ce63c]/60 bg-[#5ce63c]/10 px-4 py-3 text-left transition hover:bg-[#5ce63c]/20">
            <span className="flex items-center gap-3">
              <Wifi size={22} className="text-[#5ce63c]" aria-hidden />
              <span>
                <span className="block font-display text-base font-black text-white">Jouer en ligne</span>
                <span className="block text-xs text-white/75">
                  Salon privé avec code à 6 lettres · chacun sur son téléphone ou son PC
                </span>
              </span>
            </span>
            <span className="rounded-full bg-[#5ce63c] px-3 py-1 font-display text-xs font-black uppercase text-black">
              Salons
            </span>
          </button>
        </section>

        {/* Illustrated Tutorial Panel (from Four Colors CPanelTutorial) */}
        {showTutorial && (
          <section className="panel mt-4 space-y-3 border-[#38e1ff]/40 p-5 text-sm">
            <h2 className="font-display text-lg font-bold text-white">
              Guide officiel · Valeur des cartes &amp; Objectif {GAME_SCORE_WIN} pts
            </h2>
            <p className="text-muted">
              Le premier joueur à vider sa main remporte la manche et gagne les points de toutes les cartes
              restantes dans les mains adverses :
            </p>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <div className="rounded-xl border border-line bg-surface2/60 p-3">
                <p className="font-bold text-white">Cartes Numéros (1–9)</p>
                <p className="mt-1 text-xs text-muted">Valent leur chiffre en points (1 à 9 pts).</p>
              </div>
              <div className="rounded-xl border border-line bg-surface2/60 p-3">
                <p className="font-bold text-[#38e1ff]">Cartes Action (⊘, ⇄, +2)</p>
                <p className="mt-1 text-xs text-muted">
                  Bond, Retour et +2 valent <strong>+20 pts</strong> chacune.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface2/60 p-3">
                <p className="font-bold text-[#ffc619]">Jokers (◈ Prisme, +3)</p>
                <p className="mt-1 text-xs text-muted">
                  Changent la couleur active et valent <strong>+50 pts</strong>.
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="panel mt-4 p-5">
          <h2 className="mb-1 text-xl font-bold">Joueurs humains</h2>
          <p className="mb-4 text-sm text-muted">
            En solo contre les bots ou à plusieurs sur le même appareil (mains cachées entre chaque tour).
          </p>
          <PlayerSetup
            min={1}
            max={MAX_SEATS}
            onChange={(n, err) => {
              setHumans(n);
              setHumansError(err);
            }}
          />
        </section>

        <section className="panel mt-4 space-y-2 p-5">
          <h2 className="mb-2 text-xl font-bold">Bots et règles</h2>
          <Stepper
            label="Bots"
            value={bots}
            min={0}
            max={Math.max(0, MAX_SEATS - humans.length)}
            onChange={setBots}
          />
          <label className="flex items-center gap-3 rounded-xl border border-line bg-surface2/50 px-3 py-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-cyan"
              checked={rules.combos}
              onChange={(e) => setRules((r) => ({...r, combos: e.target.checked}))}
            />
            <span>
              <strong>Combos</strong> : poser en une fois plusieurs cartes du même chiffre
            </span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-line bg-surface2/50 px-3 py-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-cyan"
              checked={rules.stacking}
              onChange={(e) => setRules((r) => ({...r, stacking: e.target.checked}))}
            />
            <span>
              <strong>Cumul</strong> : répondre à un +2 ou +3 par un autre pour passer la pénalité
            </span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-line bg-surface2/50 px-3 py-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-cyan"
              checked={Boolean(rules.sevenZero)}
              onChange={(e) => setRules((r) => ({...r, sevenZero: e.target.checked}))}
            />
            <span>
              <strong>Règle 7–1</strong> : le 7 échange ta main avec un adversaire · le 1 fait tourner toutes les
              mains
            </span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-line bg-surface2/50 px-3 py-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-cyan"
              checked={blitzMode}
              onChange={(e) => setBlitzMode(e.target.checked)}
            />
            <span className="flex items-center gap-1.5">
              <Clock size={15} className="text-[#ffc619]" aria-hidden />
              <span>
                <strong>Chrono Blitz</strong> : {BLITZ_TURN_SECONDS} s par tour, sinon pioche automatique
              </span>
            </span>
          </label>
        </section>

        {/* Prestige cosmetics (unlocked in the Passeport Joueur) */}
        <section className="panel mt-4 space-y-3 p-5" aria-label="Apparence de la table">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Palette size={18} className="text-[#38e1ff]" aria-hidden /> Apparence de la table
          </h2>
          <div>
            <p className="mb-2 text-xs uppercase tracking-widest text-muted">Dos de cartes</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CARD_BACK_THEMES) as CardBackId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={cosmetics.cardBack === id}
                  disabled={CARD_BACK_THEMES[id].minLevel > cosmetics.unlockedLevel}
                  title={
                    CARD_BACK_THEMES[id].minLevel > cosmetics.unlockedLevel
                      ? `${CARD_BACK_THEMES[id].label} · niveau ${CARD_BACK_THEMES[id].minLevel} requis`
                      : CARD_BACK_THEMES[id].label
                  }
                  onClick={() => equipCosmetics({cardBack: id})}
                  className={`rounded-xl p-1 transition disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale ${
                    cosmetics.cardBack === id ? 'ring-2 ring-[#38e1ff]' : 'opacity-75 hover:opacity-100'
                  }`}>
                  <CardBack size="sm" cosmetic={id} />
                  <span className="sr-only">{CARD_BACK_THEMES[id].label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-widest text-muted">Tapis</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(TABLE_FELT_THEMES) as TableFeltId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={cosmetics.tableFelt === id}
                  disabled={TABLE_FELT_THEMES[id].minLevel > cosmetics.unlockedLevel}
                  onClick={() => equipCosmetics({tableFelt: id})}
                  className={`h-14 rounded-xl border-2 px-2 text-left text-[11px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-35 disabled:grayscale ${
                    cosmetics.tableFelt === id ? 'border-white' : 'border-white/15 opacity-80 hover:opacity-100'
                  }`}
                  style={{background: TABLE_FELT_THEMES[id].bg}}>
                  {TABLE_FELT_THEMES[id].label}
                  {TABLE_FELT_THEMES[id].minLevel > cosmetics.unlockedLevel && (
                    <span className="block font-mono text-[10px] text-white/70">🔒 Niveau {TABLE_FELT_THEMES[id].minLevel}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted">
            Débloque d’autres dos holographiques et tapis en montant de niveau dans ton Passeport Joueur.
          </p>
        </section>

        <details className="panel mt-4 p-5 text-sm text-muted">
          <summary className="cursor-pointer font-semibold text-ink">Règles complètes</summary>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>Pose une carte de la même couleur, du même chiffre ou du même symbole que la carte du dessus.</li>
            <li>Bond ⊘ : le suivant passe son tour · Retour ⇄ : le sens s’inverse · +2 : le suivant pioche 2.</li>
            <li>Prisme ◈ : choisis la couleur · Surcharge +3 : le suivant pioche 3 et tu choisis la couleur.</li>
            <li>Sans carte jouable, pioche-en une : si elle est jouable, tu peux la poser immédiatement.</li>
            <li>
              Avant de poser ton avant-dernière carte, appuie sur le bouton « 1 / Dernière carte ! », sinon tu
              pioches 2 cartes de pénalité.
            </li>
            <li>
              Le premier qui vide sa main remporte les points des cartes adverses (objectif : {GAME_SCORE_WIN} pts).
            </li>
          </ul>
        </details>

        {setupError && (
          <p role="alert" className="mt-4 text-center text-sm text-warning">
            {setupError}
          </p>
        )}
        <button type="button" className="btn-primary mt-4 w-full text-base" disabled={!!setupError} onClick={start}>
          <Layers size={18} aria-hidden /> Distribuer les cartes
        </button>
      </Shell>
    );
  }

  const quit = () => {
    if (game.winner !== null || window.confirm('Quitter la partie en cours ?')) setGame(null);
  };

  // ---------------- ROUND / TOURNAMENT SUMMARY SCREEN (Four Colors CSummaryPanel) ----------------
  if (game.winner !== null && !inspectTableOnWin) {
    const roundPts = winnerRoundPoints(game);
    const ranking = game.seats
      .map((s, i) => ({
        ...s,
        i,
        handPts: handPoints(s.hand),
        totalScore: scores[i] ?? (i === game.winner ? roundPts : 0),
      }))
      .sort((a, b) => a.hand.length - b.hand.length || b.totalScore - a.totalScore);
    const tournamentChampion = ranking.find((r) => r.totalScore >= GAME_SCORE_WIN);

    return (
      <Shell title="Fin de partie" kicker="Chroma Clash · 4 Colors" onBack={() => setGame(null)}>
        <div
          className="space-y-5 rounded-3xl border border-[#38e1ff]/40 p-6 text-center shadow-[0_24px_60px_rgba(0,0,0,0.75)]"
          style={{
            background:
              'radial-gradient(circle at 50% 20%, #0d4b8c 0%, #062246 65%, #031024 100%)',
          }}>
          <Trophy size={56} className="mx-auto text-[#ffc619] drop-shadow-[0_0_16px_rgba(255,198,25,0.6)]" aria-hidden />
          <p className="font-display text-4xl font-black text-white">{game.seats[game.winner].name} gagne !</p>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#5ce63c]/50 bg-[#5ce63c]/15 px-4 py-1.5 font-mono text-sm font-bold text-[#5ce63c]">
            +{roundPts} pts gagnés sur cette manche (Objectif : {GAME_SCORE_WIN} pts)
          </div>
          {tournamentChampion && (
            <p className="font-display text-lg font-bold text-[#ffc619]">
              🏆 {tournamentChampion.name} remporte la Coupe des {GAME_SCORE_WIN} points !
            </p>
          )}

          <ol className="panel divide-y divide-line text-left">
            {ranking.map((s, rank) => (
              <li key={s.i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">
                    {rank + 1}. {s.name}
                    {s.bot && <Bot size={14} className="ml-1 inline text-muted" aria-label="bot" />}
                  </span>
                  {s.i === game.winner && (
                    <span className="rounded bg-[#5ce63c]/20 px-2 py-0.5 font-mono text-xs font-bold text-[#5ce63c]">
                      +{roundPts} pts
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 font-mono text-sm">
                  <span className="text-muted">
                    {s.hand.length} carte{s.hand.length > 1 ? 's' : ''}
                  </span>
                  <span className="rounded-lg bg-white/10 px-2.5 py-1 font-bold text-[#38e1ff]">
                    {s.totalScore} / {GAME_SCORE_WIN} pts
                  </span>
                </div>
              </li>
            ))}
          </ol>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <button
              type="button"
              className="btn-primary"
              onClick={() => startWithConfig(humans, bots, !tournamentChampion)}>
              <RotateCcw size={18} aria-hidden /> Rejouer
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setInspectTableOnWin(true)}>
              <Eye size={18} aria-hidden /> Voir les cartes
            </button>
            <button type="button" className="btn-secondary" onClick={() => setGame(null)}>
              Changer les joueurs
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------------- ACTIVE 4-COLORS CASINO TABLE ----------------
  const needsHandoff = !me!.bot && humanCount > 1 && revealedFor !== game.current && game.winner === null;
  const topCard = top(game);
  const hand = viewer !== null ? game.seats[viewer].hand : [];
  const myTurn = viewer === game.current && !me!.bot && game.winner === null;
  const hasAnyPlayable = myTurn && playableCards(game).length > 0;
  const needsDrawHelp = myTurn && !hasAnyPlayable && game.drawnCardId === null;

  const selectable = (c: Card) =>
    myTurn &&
    (selected.includes(c.id) ||
      (selected.length === 0 ? canPlay(c, game) : validSelection([...selected, c.id], game)));

  const canSubmit = myTurn && validSelection(selected, game);

  const submit = (ids = selected) => {
    if (!validSelection(ids, game)) return;
    const last = hand.find((c) => c.id === ids[ids.length - 1])!;
    if (isWild(last)) {
      setColorPick(ids);
      return;
    }
    if (
      game.rules.sevenZero &&
      last.kind === 'num' &&
      last.value === 7 &&
      hand.length - ids.length > 0 &&
      game.seats.length > 2
    ) {
      setSwapPick({ids, color: null});
      return;
    }
    setGame(applyPlayTransition(game, ids, null, undefined, true));
  };

  const onCardClick = (c: Card) => {
    if (!myTurn) return;
    // If clicking the only already-selected card a second time, play it immediately!
    if (selected.length === 1 && selected[0] === c.id && validSelection([c.id], game)) {
      submit([c.id]);
      return;
    }
    setSelected((sel) => (sel.includes(c.id) ? sel.filter((id) => id !== c.id) : [...sel, c.id]));
  };

  const showAnnounce = myTurn && !game.announced && hand.length >= 2 && hand.length <= 4;
  const activeTheme = SUIT_THEME[game.activeColor];

  return (
    <Shell
      title="Chroma Clash"
      kicker={game.winner !== null ? `Victoire de ${game.seats[game.winner].name}` : `Au tour de ${me!.name}`}
      onBack={quit}
      backLabel="Quitter la partie"
      right={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted(toggleSoundMuted())}
            className="btn-ghost min-h-[36px] px-2"
            aria-label={muted ? 'Activer le son' : 'Couper le son'}>
            {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
          </button>
          <span className="tag" title="Sens du jeu">
            {game.direction === 1 ? <RotateCw size={14} aria-hidden /> : <RotateCcw size={14} aria-hidden />}
            <span className="sr-only">{game.direction === 1 ? 'Sens horaire' : 'Sens inverse'}</span>
          </span>
        </div>
      }>
      {needsHandoff ? (
        <Handoff name={me!.name} hint="Ta main va s’afficher." onReady={() => setRevealedFor(game.current)} />
      ) : (
        <div
          data-felt={cosmetics.tableFelt}
          className="relative overflow-hidden rounded-3xl border-2 p-3.5 sm:p-6 shadow-[0_24px_65px_rgba(0,0,0,0.8)]"
          style={{background: felt.bg, borderColor: `${felt.border}99`}}>
          <style>{`@keyframes chroma-fly{0%{transform:translate(-50%,260px) scale(.75) rotate(-14deg);opacity:0}60%{opacity:1}100%{transform:translate(-50%,0) scale(1) rotate(0);opacity:0}}`}</style>
          {/* Center Table "4 COLORS" Watermark Emblem (like bg_game.jpg) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.09]">
            <div className="flex h-52 w-52 rotate-45 items-center justify-center rounded-3xl border-4 border-[#38e1ff]">
              <span className="-rotate-45 font-display text-6xl font-black tracking-tighter text-[#38e1ff]">
                4 COLORS
              </span>
            </div>
          </div>

          <div className="relative z-10 space-y-4">
            {/* Accessible Players Strip (preserves screen-reader & E2E visibility) */}
            <ul className="flex flex-wrap justify-center gap-2" aria-label="Joueurs">
              {game.seats.map((s, i) => (
                <li
                  key={i}
                  aria-current={i === game.current ? 'true' : undefined}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs sm:text-sm transition ${
                    i === game.current
                      ? 'border-[#38e1ff] bg-[#38e1ff]/20 text-white shadow-[0_0_16px_rgba(56,225,255,0.35)]'
                      : 'border-white/15 bg-black/35 text-white/85'
                  }`}>
                  {s.bot && <Bot size={13} className="text-[#38e1ff]" aria-label="bot" />}
                  <span className="font-semibold">{s.name}</span>
                  <span
                    className={`font-mono font-bold ${
                      s.hand.length === 1 ? 'text-[#ffc619]' : 'text-white/75'
                    }`}>
                    {s.hand.length}
                  </span>
                </li>
              ))}
            </ul>

            {/* TOP Opponent(s) Seat */}
            {opponentsBySide.top.length > 0 && (
              <div className="flex flex-wrap justify-center gap-3">
                {opponentsBySide.top.map(({seat, index}) => (
                  <OpponentTableSeat
                    key={index}
                    seat={seat}
                    seatIndex={index}
                    isCurrent={index === game.current}
                    score={scores[index] ?? 0}
                    side="top"
                    revealCards={inspectTableOnWin}
                    cardBack={cosmetics.cardBack}
                  />
                ))}
              </div>
            )}

            {/* MIDDLE ROW: LEFT Opponent · CENTER DECK/DISCARD/UNO ARENA · RIGHT Opponent */}
            <div className="grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
              {/* Left Opponent */}
              <div className="hidden justify-start lg:flex">
                {opponentsBySide.left.map(({seat, index}) => (
                  <OpponentTableSeat
                    key={index}
                    seat={seat}
                    seatIndex={index}
                    isCurrent={index === game.current}
                    score={scores[index] ?? 0}
                    side="left"
                    revealCards={inspectTableOnWin}
                    cardBack={cosmetics.cardBack}
                  />
                ))}
              </div>

              {/* Center Table Arena: Draw Deck + Discard Pile + Active Suit Diamond + "1" UNO Button */}
              <div className="relative mx-auto flex flex-wrap items-center justify-center gap-5 sm:gap-7 rounded-3xl border border-white/15 bg-black/25 px-5 py-5 backdrop-blur-sm">
                {/* Animated Action Splash Overlay */}
                {actionSplash && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -top-5 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-white bg-black/90 px-4 py-1 font-display text-xs font-black uppercase tracking-wider shadow-lg animate-bounce"
                    style={{color: actionSplash.color}}>
                    {actionSplash.text}
                  </div>
                )}

                {/* 1. 3D Stacked Draw Pile (CDeckDisplayer) */}
                <div className="relative flex flex-col items-center gap-1.5">
                  {needsDrawHelp && (
                    <span
                      aria-hidden
                      className=" -top-8 z-20 inline-flex animate-bounce items-center gap-1 rounded-full bg-[#ffc619] px-2.5 py-0.5 font-display text-[11px] font-black uppercase text-black shadow-md">
                      👇 Pioche !
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={!myTurn || game.drawnCardId !== null}
                    onClick={() => {
                      sfxCardDraw();
                      setGame(drawTurn(game));
                    }}
                    aria-label={
                      game.pendingDraw > 0 ? `Piocher ${game.pendingDraw} cartes` : 'Piocher une carte'
                    }
                    className={`group relative transition-transform ${
                      needsDrawHelp
                        ? 'ring-4 ring-[#ffc619] rounded-2xl scale-105'
                        : 'hover:scale-105 disabled:opacity-55'
                    }`}>
                    {/* 3D Stack Depth Layers */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -left-1.5 -top-1.5 h-full w-full rounded-2xl bg-white/30"
                    />
                    <CardBack size="lg" cosmetic={cosmetics.cardBack} />
                    {/* Overlay Badge on Deck */}
                    <span className="absolute inset-x-1 bottom-2 flex items-center justify-between rounded-lg bg-black/80 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      <span>{game.pendingDraw > 0 ? `+${game.pendingDraw}` : 'Pioche'}</span>
                      <span className="text-[#38e1ff]">{game.draw.length}</span>
                    </span>
                  </button>
                </div>

                {/* Direction Ring Indicator */}
                <div
                  aria-hidden
                  className="flex flex-col items-center justify-center gap-1 text-white/80"
                  title={game.direction === 1 ? 'Sens horaire' : 'Sens anti-horaire'}>
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-white/10"
                    style={{color: activeTheme.textHex}}>
                    {game.direction === 1 ? <RotateCw size={20} /> : <RotateCcw size={20} />}
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-white/70">
                    {game.direction === 1 ? 'Horaire' : 'Inverse'}
                  </span>
                </div>

                {/* 2. Layered Discard Pile */}
                <div className="relative flex flex-col items-center gap-2">
                  <div className="relative">
                    {game.discard.slice(-3, -1).map((prevCard, idx) => (
                      <span
                        key={prevCard.id}
                        aria-hidden
                        className="pointer-events-none absolute inset-0 opacity-65"
                        style={{
                          transform: `rotate(${idx === 0 ? -8 : 6}deg) translate(${idx === 0 ? -4 : 4}px, 2px)`,
                        }}>
                        <CardView card={prevCard} large />
                      </span>
                    ))}
                    <div key={topCard.id} className="relative z-10">
                      <CardView card={topCard} large />
                    </div>
                    {flyingCard && (
                      <span
                        key={`fly-${flyingCard.id}`}
                        aria-hidden
                        className="pointer-events-none absolute left-1/2 top-0 z-20"
                        style={{animation: 'chroma-fly 420ms cubic-bezier(.2,.8,.3,1) forwards'}}>
                        <CardView card={flyingCard} large />
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. Right Side Column: Active Color Diamond + Iconic "1" UNO Button (CUnoController) */}
                <div className="flex flex-col items-center justify-between gap-3">
                  {/* Active Suit Diamond (colors.png equivalent) */}
                  <div className="flex flex-col items-center gap-1">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 rotate-45 items-center justify-center rounded-lg border-2 border-white shadow-lg transition-colors duration-300"
                      style={{background: activeTheme.bg}}>
                      <span className="-rotate-45 text-sm font-black text-white">{activeTheme.glyph}</span>
                    </span>
                    <span
                      className="rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider"
                      style={{
                        color: activeTheme.textHex,
                        borderColor: activeTheme.textHex,
                        backgroundColor: 'rgba(0,0,0,0.55)',
                      }}>
                      { activeTheme.glyph } { COLOR_LABELS[game.activeColor] }
                    </span>
                  </div>

                  {/* Iconic 4-Color Diamond "1" Button (but_uno.png equivalent) */}
                  <button
                    type="button"
                    disabled={!myTurn || game.announced}
                    onClick={() => {
                      sfxUnoCall();
                      triggerSplash('« 1 ! » DERNIÈRE CARTE ANNONCÉE !', '#ffc619');
                      setGame(announce(game));
                    }}
                    title="Annoncer « 1 / Dernière carte ! » avant de poser ton avant-dernière carte"
                    className={`group relative flex flex-col items-center gap-1 rounded-2xl p-1.5 transition ${
                      showAnnounce
                        ? 'animate-bounce ring-2 ring-[#ffc619] bg-[#ffc619]/20 shadow-[0_0_24px_rgba(255,198,25,0.65)]'
                        : game.announced
                          ? 'opacity-90'
                          : 'opacity-70 hover:opacity-100'
                    }`}>
                    <FourColorsDiamond size="md" label="1" />
                    <span className="rounded bg-black/75 px-1.5 py-0.5 font-display text-[10px] font-black uppercase tracking-wider text-[#ffc619]">
                      {game.announced ? 'Annoncé ✓' : 'UNO · 1 !'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Right Opponent */}
              <div className="hidden justify-end lg:flex">
                {opponentsBySide.right.map(({seat, index}) => (
                  <OpponentTableSeat
                    key={index}
                    seat={seat}
                    seatIndex={index}
                    isCurrent={index === game.current}
                    score={scores[index] ?? 0}
                    side="right"
                    revealCards={inspectTableOnWin}
                    cardBack={cosmetics.cardBack}
                  />
                ))}
              </div>
            </div>

            {/* Compact Left/Right Opponents Row on Mobile/Tablet */}
            {(opponentsBySide.left.length > 0 || opponentsBySide.right.length > 0) && (
              <div className="flex flex-wrap justify-center gap-3 lg:hidden">
                {[...opponentsBySide.left, ...opponentsBySide.right].map(({seat, index}) => (
                  <OpponentTableSeat
                    key={index}
                    seat={seat}
                    seatIndex={index}
                    isCurrent={index === game.current}
                    score={scores[index] ?? 0}
                    side="top"
                    revealCards={inspectTableOnWin}
                    cardBack={cosmetics.cardBack}
                  />
                ))}
              </div>
            )}

            {/* Live Contre-1 call: someone forgot to announce their last card */}
            {game.vulnerableSeat !== null &&
              game.vulnerableSeat !== undefined &&
              game.winner === null &&
              viewer !== null &&
              viewer !== game.vulnerableSeat && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      sfxPenalty();
                      triggerSplash(
                        `🚨 CONTRE-1 ! ${game.seats[game.vulnerableSeat!].name.toUpperCase()} PIOCHE +${FORGOT_PENALTY}`,
                        '#ef1c24',
                      );
                      setGame(counterUno(game));
                    }}
                    className="inline-flex animate-bounce items-center gap-2 rounded-full border-2 border-white bg-[#ef1c24] px-5 py-2 font-display text-sm font-black uppercase tracking-wider text-white shadow-[0_0_28px_rgba(239,28,36,0.7)]">
                    <Siren size={18} aria-hidden /> Contre-1 ! {game.seats[game.vulnerableSeat].name} n’a pas annoncé
                  </button>
                </div>
              )}

            {/* Blitz chrono */}
            {blitzMode && game.winner === null && !me!.bot && (
              <div className="mx-auto flex max-w-md items-center gap-3" aria-label="Chrono Blitz">
                <Clock size={16} className={turnSecondsLeft <= 5 ? 'text-[#ef1c24]' : 'text-[#ffc619]'} aria-hidden />
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/50">
                  <div
                    className="h-full rounded-full transition-all duration-1000 ease-linear"
                    style={{
                      width: `${(Math.max(0, turnSecondsLeft) / BLITZ_TURN_SECONDS) * 100}%`,
                      background: turnSecondsLeft <= 5 ? '#ef1c24' : '#ffc619',
                    }}
                  />
                </div>
                <span
                  className={`w-8 text-right font-mono text-sm font-bold ${
                    turnSecondsLeft <= 5 ? 'text-[#ef1c24] animate-pulse' : 'text-white'
                  }`}>
                  {Math.max(0, turnSecondsLeft)}s
                </span>
              </div>
            )}

            {/* Live Table Event Feed */}
            <p
              className="min-h-[1.75rem] rounded-xl bg-black/40 px-3 py-1.5 text-center text-sm font-medium text-white/90"
              aria-live="polite">
              {game.lastEvent}
              {game.pendingDraw > 0 && myTurn && (
                <strong className="ml-1.5 text-[#ffc619]">
                  Pioche {game.pendingDraw} ou réponds par un +2/+3.
                </strong>
              )}
            </p>

            {/* Return to Summary Bar when inspecting the table after a win */}
            {game.winner !== null && inspectTableOnWin && (
              <div className="flex justify-center">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setInspectTableOnWin(false)}>
                  <EyeOff size={18} aria-hidden /> Retour au tableau des scores
                </button>
              </div>
            )}

            {/* BOTTOM: Human Player's Fanned Hand */}
            {viewer !== null ? (
              <section
                aria-label={`Main de ${game.seats[viewer].name}`}
                className="rounded-2xl border border-white/15 bg-black/30 px-3 py-3.5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
                  <span className="font-display font-bold text-white">
                    {game.seats[viewer].name} ·{' '}
                    <span className="text-[#38e1ff]">
                      {scores[viewer] ?? 0} / {GAME_SCORE_WIN} pts
                    </span>
                  </span>
                  {!myTurn ? (
                    <span className="text-white/75">En attente de {me!.name}…</span>
                  ) : (
                    <span className="text-white/80">
                      {selected.length > 0
                        ? 'Re-clique sur la carte ou sur « Poser » pour jouer'
                        : 'Sélectionne une carte brillante à poser'}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {hand.map((c) => (
                    <CardView
                      key={c.id}
                      card={c}
                      selected={selected.includes(c.id)}
                      disabled={!selectable(c)}
                      onClick={() => onCardClick(c)}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <p className="flex items-center justify-center gap-2 py-4 text-center text-white/85">
                <Bot size={18} className="text-[#38e1ff]" aria-hidden /> {me!.name} réfléchit…
              </p>
            )}

            {/* Bottom Tactical Action Bar */}
            {myTurn && (
              <div className="sticky bottom-2 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  className="btn-primary sm:col-span-1"
                  disabled={!canSubmit}
                  onClick={() => submit()}>
                  Poser{selected.length > 1 ? ` ${selected.length} cartes` : ''}
                </button>
                {game.drawnCardId !== null ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setGame(pass(game))}>
                    <ArrowLeftRight size={18} aria-hidden /> Garder et passer
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      sfxCardDraw();
                      setGame(drawTurn(game));
                    }}>
                    <Layers size={18} aria-hidden />{' '}
                    {game.pendingDraw > 0 ? `Piocher ${game.pendingDraw}` : 'Piocher'}
                  </button>
                )}
                {showAnnounce ? (
                  <button
                    type="button"
                    className="btn-secondary border-[#ffc619] bg-[#ffc619]/15 text-[#ffc619]"
                    onClick={() => {
                      sfxUnoCall();
                      triggerSplash('« 1 ! » DERNIÈRE CARTE ANNONCÉE !', '#ffc619');
                      setGame(announce(game));
                    }}>
                    <Megaphone size={18} aria-hidden /> Dernière carte !
                  </button>
                ) : game.announced ? (
                  <p className="tag justify-center border-[#ffc619]/60 text-[#ffc619]">Annoncé ✓</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4-Colors Carbon-Fiber Suit Selector Modal (CSelectColorPanel) */}
      {colorPick && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pick-title"
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center">
          <div
            className="w-full max-w-sm rounded-3xl border-2 border-white/30 p-6 shadow-2xl"
            style={{background: CARBON_BG}}>
            <h2 id="pick-title" className="mb-5 text-center font-display text-2xl font-black text-white">
              Choisis la couleur
            </h2>
            <div className="grid grid-cols-2 gap-3.5">
              {COLORS.map((c) => {
                const theme = SUIT_THEME[c];
                return (
                  <button
                    key={c}
                    type="button"
                    className="btn flex-col gap-2 rounded-2xl border-2 border-white py-4 font-display text-base font-black text-white shadow-lg transition hover:scale-105"
                    style={{
                      background: theme.bg,
                      textShadow: '0 1.5px 0 rgba(0,0,0,0.85)',
                    }}
                    onClick={() => {
                      setGame(applyPlayTransition(game, colorPick, c, undefined, true));
                      setColorPick(null);
                    }}>
                    <span className="text-2xl">{theme.glyph}</span>
                    <span>{COLOR_LABELS[c]}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="btn-ghost mt-4 w-full text-white/80"
              onClick={() => setColorPick(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Règle du 7 : choose who to swap hands with */}
      {swapPick && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="swap-title"
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl border-2 border-white/30 p-6 shadow-2xl" style={{background: CARBON_BG}}>
            <h2 id="swap-title" className="mb-1 text-center font-display text-2xl font-black text-white">
              Règle du 7
            </h2>
            <p className="mb-4 text-center text-sm text-white/75">Avec qui échanges-tu ta main ?</p>
            <div className="space-y-2">
              {game.seats.map((s, idx) =>
                idx === game.current ? null : (
                  <button
                    key={idx}
                    type="button"
                    className="btn-secondary w-full justify-between"
                    onClick={() => {
                      setGame(applyPlayTransition(game, swapPick.ids, swapPick.color, idx, true));
                      setSwapPick(null);
                    }}>
                    <span className="flex items-center gap-2">
                      {s.bot ? <Bot size={15} aria-hidden /> : <Users size={15} aria-hidden />} {s.name}
                    </span>
                    <span className="font-mono text-xs text-[#38e1ff]">
                      {s.hand.length} carte{s.hand.length > 1 ? 's' : ''}
                    </span>
                  </button>
                ),
              )}
            </div>
            <button type="button" className="btn-ghost mt-4 w-full text-white/80" onClick={() => setSwapPick(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}
