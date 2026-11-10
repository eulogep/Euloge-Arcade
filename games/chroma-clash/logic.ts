/**
 * Chroma Clash — an original color-matching shedding card game (Crazy Eights family).
 * Pure state transitions; the UI in App.tsx and the bots use them.
 *
 * Deck (102 cards): 4 colors × (1–9 twice + Bond ×2 + Retour ×2 + +2 ×2)
 *                   + 4 Prisme (choose the color) + 2 Surcharge (+3, choose the color).
 * Twists: several cards of the same number can be played at once (combo), and
 * +2 / +3 can be stacked to pass the penalty on.
 */
import {shuffle, type Rng} from '../_party/rng';

export const COLORS = ['cyan', 'rose', 'ambre', 'vert'] as const;
export type Color = (typeof COLORS)[number];
export type Kind = 'num' | 'bond' | 'retour' | 'plus2' | 'prisme' | 'surcharge';

export interface Card {
  id: number;
  kind: Kind;
  /** null for wild cards (prisme, surcharge) */
  color: Color | null;
  /** 1–9 for number cards */
  value?: number;
}

export interface Seat {
  name: string;
  bot: boolean;
  hand: Card[];
}

export interface Rules {
  /** Play several number cards of the same value at once. */
  combos: boolean;
  /** Answer a +2 / +3 with another one to pass the accumulated penalty. */
  stacking: boolean;
  /** UNO 7-1 variant: playing a 7 swaps hands with a chosen player; playing a 1 rotates all hands in play direction. */
  sevenZero?: boolean;
}

export interface PlayOptions {
  /** Seat index to swap hands with when playing a 7 under rules.sevenZero. */
  swapTarget?: number;
  /** When true, forgetting to announce on 1 card marks the player vulnerable to a live Counter-UNO instead of auto-drawing. */
  keepVulnerable?: boolean;
}

export interface GameState {
  seats: Seat[];
  draw: Card[];
  discard: Card[];
  current: number;
  direction: 1 | -1;
  activeColor: Color;
  /** Cards the current player must draw unless they stack. */
  pendingDraw: number;
  /** Id of the card drawn this turn (only that card may then be played). */
  drawnCardId: number | null;
  /** The current player announced "Dernière carte !" before playing. */
  announced: boolean;
  /** Seat index currently vulnerable to a "Contre-1 !" call (forgot to announce UNO). */
  vulnerableSeat?: number | null;
  winner: number | null;
  rules: Rules;
  /** Human-readable summary of the last move. */
  lastEvent: string;
}

export const HAND_SIZE = 7;
export const MIN_SEATS = 2;
export const MAX_SEATS = 8;
export const FORGOT_PENALTY = 2;
export const GAME_SCORE_WIN = 250;

export const COLOR_LABELS: Record<Color, string> = {cyan: 'Cyan', rose: 'Rose', ambre: 'Ambre', vert: 'Vert'};

/**
 * Official Four-Colors / UNO point value of a single card remaining in an opponent's hand:
 * - Number cards (1–9): face value (1–9 pts)
 * - Action cards (Bond, Retour, +2): 20 pts
 * - Wild cards (Prisme, Surcharge +3): 50 pts
 */
export function cardPoints(c: Card): number {
  switch (c.kind) {
    case 'num':
      return c.value ?? 0;
    case 'bond':
    case 'retour':
    case 'plus2':
      return 20;
    case 'prisme':
    case 'surcharge':
      return 50;
  }
}

export function handPoints(hand: Card[]): number {
  return hand.reduce((sum, c) => sum + cardPoints(c), 0);
}

/** Total points awarded to the round winner from all opponents' remaining hands. */
export function winnerRoundPoints(s: GameState): number {
  return s.seats.reduce((sum, seat, idx) => (idx === s.winner ? sum : sum + handPoints(seat.hand)), 0);
}

export function createDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (const color of COLORS) {
    for (let v = 1; v <= 9; v++) {
      cards.push({id: id++, kind: 'num', color, value: v}, {id: id++, kind: 'num', color, value: v});
    }
    for (const kind of ['bond', 'retour', 'plus2'] as const) {
      cards.push({id: id++, kind, color}, {id: id++, kind, color});
    }
  }
  for (let i = 0; i < 4; i++) cards.push({id: id++, kind: 'prisme', color: null});
  for (let i = 0; i < 2; i++) cards.push({id: id++, kind: 'surcharge', color: null});
  return cards;
}

export const isWild = (c: Card) => c.kind === 'prisme' || c.kind === 'surcharge';
export const isPenalty = (c: Card) => c.kind === 'plus2' || c.kind === 'surcharge';

export function cardLabel(c: Card): string {
  switch (c.kind) {
    case 'num':
      return `${c.value} ${COLOR_LABELS[c.color!]}`;
    case 'bond':
      return `Bond ${COLOR_LABELS[c.color!]}`;
    case 'retour':
      return `Retour ${COLOR_LABELS[c.color!]}`;
    case 'plus2':
      return `+2 ${COLOR_LABELS[c.color!]}`;
    case 'prisme':
      return 'Prisme';
    case 'surcharge':
      return 'Surcharge +3';
  }
}

export const top = (s: GameState) => s.discard[s.discard.length - 1];

export function nextIndex(s: GameState, steps = 1): number {
  const n = s.seats.length;
  return (((s.current + s.direction * steps) % n) + n) % n;
}

export function newGame(seats: {name: string; bot: boolean}[], rules: Rules, rng: Rng = Math.random): GameState {
  let draw = shuffle(createDeck(), rng);
  const hands: Card[][] = seats.map(() => []);
  for (let r = 0; r < HAND_SIZE; r++) for (const h of hands) h.push(draw.pop()!);
  // The first face-up card is always a number card.
  let first = draw.pop()!;
  while (first.kind !== 'num') {
    draw = shuffle([first, ...draw], rng);
    first = draw.pop()!;
  }
  return {
    seats: seats.map((s, i) => ({...s, hand: hands[i]})),
    draw,
    discard: [first],
    current: 0,
    direction: 1,
    activeColor: first.color!,
    pendingDraw: 0,
    drawnCardId: null,
    announced: false,
    vulnerableSeat: null,
    winner: null,
    rules,
    lastEvent: `La partie commence sur ${cardLabel(first)}.`,
  };
}

/** Can this card be the first card played this turn? */
export function canPlay(card: Card, s: GameState): boolean {
  if (s.drawnCardId !== null && card.id !== s.drawnCardId) return false;
  if (s.pendingDraw > 0) return s.rules.stacking && isPenalty(card);
  if (isWild(card)) return true;
  if (card.color === s.activeColor) return true;
  const t = top(s);
  if (card.kind === 'num') return t.kind === 'num' && t.value === card.value;
  return card.kind === t.kind;
}

/** Validates a selection (in play order): playable first card, then same-number combo. */
export function validSelection(ids: number[], s: GameState): boolean {
  if (ids.length === 0 || s.winner !== null) return false;
  const hand = s.seats[s.current].hand;
  const cards = ids.map((id) => hand.find((c) => c.id === id));
  if (cards.some((c) => !c) || new Set(ids).size !== ids.length) return false;
  const [first, ...rest] = cards as Card[];
  if (!canPlay(first, s)) return false;
  if (rest.length === 0) return true;
  if (!s.rules.combos || s.drawnCardId !== null || first.kind !== 'num') return false;
  return rest.every((c) => c.kind === 'num' && c.value === first.value);
}

function refill(s: GameState, rng: Rng): GameState {
  if (s.draw.length > 0 || s.discard.length <= 1) return s;
  const keep = top(s);
  return {...s, draw: shuffle(s.discard.slice(0, -1), rng), discard: [keep]};
}

function drawCards(s: GameState, seat: number, count: number, rng: Rng): {state: GameState; drawn: Card[]} {
  let state = s;
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    state = refill(state, rng);
    if (state.draw.length === 0) break; // every card is in someone's hand
    const draw = state.draw.slice(0, -1);
    drawn.push(state.draw[state.draw.length - 1]);
    state = {...state, draw};
  }
  const seats = state.seats.map((p, i) => (i === seat ? {...p, hand: [...p.hand, ...drawn]} : p));
  return {state: {...state, seats}, drawn};
}

function endTurn(s: GameState, steps: number): GameState {
  return {...s, current: nextIndex(s, steps), drawnCardId: null, announced: false};
}

export function announce(s: GameState): GameState {
  return {...s, announced: true};
}

/** Pick the opponent seat with the fewest cards (default target for playing a 7 under rules.sevenZero). */
export function bestSwapTarget(s: GameState, fromSeat = s.current): number {
  let best = -1;
  let bestCount = Infinity;
  for (let i = 0; i < s.seats.length; i++) {
    if (i === fromSeat) continue;
    if (s.seats[i].hand.length < bestCount) {
      bestCount = s.seats[i].hand.length;
      best = i;
    }
  }
  return best >= 0 ? best : (fromSeat + 1) % s.seats.length;
}

/** Call "Contre-1 !" against a player who dropped to 1 card without announcing UNO. */
export function counterUno(s: GameState, rng: Rng = Math.random): GameState {
  if (s.vulnerableSeat === null || s.vulnerableSeat === undefined) return s;
  const target = s.vulnerableSeat;
  const drawnState = drawCards({...s, vulnerableSeat: null}, target, FORGOT_PENALTY, rng).state;
  return {
    ...drawnState,
    vulnerableSeat: null,
    lastEvent: `Contre-1 ! ${s.seats[target].name} pioche +${FORGOT_PENALTY} cartes pour oubli d’annonce.`,
  };
}

/** Plays the selected cards. `color` is required when the last card is wild. */
export function play(
  s: GameState,
  ids: number[],
  color: Color | null = null,
  rng: Rng = Math.random,
  options?: PlayOptions,
): GameState {
  if (!validSelection(ids, s)) throw new Error('Coup invalide');
  const me = s.current;
  const seat = s.seats[me];
  const played = ids.map((id) => seat.hand.find((c) => c.id === id)!);
  const last = played[played.length - 1];
  if (isWild(last) && !color) throw new Error('Couleur à choisir');

  const hand = seat.hand.filter((c) => !ids.includes(c.id));
  let state: GameState = {
    ...s,
    seats: s.seats.map((p, i) => (i === me ? {...p, hand} : p)),
    discard: [...s.discard, ...played],
    activeColor: isWild(last) ? color! : last.color!,
    vulnerableSeat: null,
  };
  const name = seat.name;
  const what = played.length > 1 ? `${played.length} × ${last.value}` : cardLabel(last);
  let event = `${name} joue ${what}${isWild(last) ? ` et choisit ${COLOR_LABELS[color!]}` : ''}.`;

  if (hand.length === 0) {
    return {...state, winner: me, drawnCardId: null, vulnerableSeat: null, lastEvent: `${name} pose sa dernière carte et gagne !`};
  }

  // UNO 7–1 rule: 7 swaps hands with a chosen player; 1 rotates all hands in play direction
  if (state.rules.sevenZero && last.kind === 'num') {
    if (last.value === 7 && state.seats.length >= 2) {
      const rawTarget = options?.swapTarget;
      const target =
        rawTarget !== undefined && rawTarget !== me && rawTarget >= 0 && rawTarget < state.seats.length
          ? rawTarget
          : bestSwapTarget(state, me);
      const myHand = state.seats[me].hand;
      const targetHand = state.seats[target].hand;
      state = {
        ...state,
        seats: state.seats.map((p, i) => (i === me ? {...p, hand: targetHand} : i === target ? {...p, hand: myHand} : p)),
      };
      event += ` Échange de mains avec ${state.seats[target].name} (Règle du 7) !`;
    } else if (last.value === 1 && state.seats.length >= 2) {
      const n = state.seats.length;
      const dir = state.direction;
      state = {
        ...state,
        seats: state.seats.map((p, i) => {
          const fromIdx = (((i - dir) % n) + n) % n;
          return {...p, hand: state.seats[fromIdx].hand};
        }),
      };
      event += ' Rotation de toutes les mains (Règle du 1) !';
    }
  }

  if (state.seats[me].hand.length === 1 && !s.announced) {
    if (options?.keepVulnerable) {
      state = {...state, vulnerableSeat: me};
      event += ' Attention : « 1 ! » non annoncé (Contre-1 disponible) !';
    } else {
      state = drawCards(state, me, FORGOT_PENALTY, rng).state;
      event += ` Oubli de « Dernière carte ! » : +${FORGOT_PENALTY}.`;
    }
  }

  let steps = 1;
  switch (last.kind) {
    case 'bond':
      steps = 2;
      event += ` ${state.seats[nextIndex(state)].name} passe son tour.`;
      break;
    case 'retour':
      if (state.seats.length === 2) {
        steps = 2;
      } else {
        state = {...state, direction: state.direction === 1 ? -1 : 1};
      }
      event += state.seats.length === 2 ? ` ${name} rejoue.` : ' Le sens du jeu s’inverse.';
      break;
    case 'plus2':
      state = {...state, pendingDraw: state.pendingDraw + 2};
      break;
    case 'surcharge':
      state = {...state, pendingDraw: state.pendingDraw + 3};
      break;
  }
  return {...endTurn(state, steps), lastEvent: event};
}

/**
 * Draws for the current player. With a pending penalty, they draw it all and lose
 * their turn. Otherwise they draw one card and may play it (or pass).
 */
export function drawTurn(s: GameState, rng: Rng = Math.random): GameState {
  const me = s.current;
  const name = s.seats[me].name;
  const base = {...s, vulnerableSeat: null};
  if (base.pendingDraw > 0) {
    const {state, drawn} = drawCards(base, me, base.pendingDraw, rng);
    return {...endTurn({...state, pendingDraw: 0}, 1), lastEvent: `${name} pioche ${drawn.length} cartes.`};
  }
  if (base.drawnCardId !== null) throw new Error('Déjà pioché');
  const {state, drawn} = drawCards(base, me, 1, rng);
  if (drawn.length === 0) return {...endTurn(state, 1), lastEvent: `${name} ne peut pas piocher et passe.`};
  const next = {...state, drawnCardId: drawn[0].id};
  if (!canPlay(drawn[0], next)) return {...endTurn(state, 1), lastEvent: `${name} pioche et passe.`};
  return {...next, lastEvent: `${name} pioche une carte jouable.`};
}

export function pass(s: GameState): GameState {
  if (s.drawnCardId === null) throw new Error('Pioche d’abord');
  return {...endTurn({...s, vulnerableSeat: null}, 1), lastEvent: `${s.seats[s.current].name} garde sa carte et passe.`};
}

export const playableCards = (s: GameState) => s.seats[s.current].hand.filter((c) => canPlay(c, s));

export function bestColor(hand: Card[], rng: Rng = Math.random): Color {
  const counts = new Map<Color, number>();
  for (const c of hand) if (c.color) counts.set(c.color, (counts.get(c.color) ?? 0) + 1);
  if (counts.size === 0) return COLORS[Math.floor(rng() * COLORS.length)];
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export type BotMove = {type: 'play'; ids: number[]; color: Color | null} | {type: 'draw'} | {type: 'pass'};

/** A simple, readable strategy: attack a near-winning neighbour, keep wild cards for last. */
export function botMove(s: GameState, rng: Rng = Math.random): BotMove {
  const hand = s.seats[s.current].hand;
  const options = playableCards(s);
  if (options.length === 0) return s.drawnCardId !== null ? {type: 'pass'} : {type: 'draw'};

  const nextCount = s.seats[nextIndex(s)].hand.length;
  const score = (c: Card) => {
    if (isWild(c)) return c.kind === 'surcharge' && nextCount <= 2 ? 90 : 5;
    if (c.kind !== 'num') return nextCount <= 2 ? 80 : 30;
    return 40 + (c.value ?? 0);
  };
  const first = [...options].sort((a, b) => score(b) - score(a))[0];
  const ids = [first.id];
  if (s.rules.combos && s.drawnCardId === null && first.kind === 'num') {
    for (const c of hand) if (c.id !== first.id && c.kind === 'num' && c.value === first.value) ids.push(c.id);
  }
  const remaining = hand.filter((c) => !ids.includes(c.id));
  return {type: 'play', ids, color: isWild(first) ? bestColor(remaining, rng) : null};
}
