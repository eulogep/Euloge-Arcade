import {describe, expect, it} from 'vitest';
import {seeded} from '../_party/rng';
import {
  botMove,
  canPlay,
  createDeck,
  drawTurn,
  FORGOT_PENALTY,
  HAND_SIZE,
  newGame,
  play,
  validSelection,
  type Card,
  type GameState,
} from './logic';

const RULES = {combos: true, stacking: true};
const seats = (n: number, bot = false) => Array.from({length: n}, (_, i) => ({name: `J${i + 1}`, bot}));

/** Builds a controlled state: hands and top card chosen by the test. */
function rigged(hands: Card[][], topCard: Card, extra: Partial<GameState> = {}): GameState {
  const base = newGame(seats(hands.length), RULES, seeded(1));
  return {
    ...base,
    seats: base.seats.map((s, i) => ({...s, hand: hands[i]})),
    discard: [topCard],
    activeColor: topCard.color ?? 'cyan',
    ...extra,
  };
}
let nextId = 1000;
const num = (value: number, color: Card['color'] = 'cyan'): Card => ({id: nextId++, kind: 'num', color, value});
const card = (kind: Card['kind'], color: Card['color'] = 'cyan'): Card => ({id: nextId++, kind, color});

describe('Chroma Clash deck', () => {
  it('has 102 unique cards with the documented composition', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(102);
    expect(new Set(deck.map((c) => c.id)).size).toBe(102);
    expect(deck.filter((c) => c.kind === 'num')).toHaveLength(72);
    expect(deck.filter((c) => c.kind === 'prisme')).toHaveLength(4);
    expect(deck.filter((c) => c.kind === 'surcharge')).toHaveLength(2);
  });

  it('deals 7 cards each and starts on a number card', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = newGame(seats(4), RULES, seeded(seed));
      expect(s.seats.every((p) => p.hand.length === HAND_SIZE)).toBe(true);
      expect(s.discard[0].kind).toBe('num');
      expect(s.draw.length + s.discard.length + 4 * HAND_SIZE).toBe(102);
    }
  });
});

describe('Chroma Clash rules', () => {
  it('matches on color, number or symbol; wild cards always', () => {
    const s = rigged([[], []], num(5, 'rose'));
    expect(canPlay(num(5, 'vert'), s)).toBe(true);
    expect(canPlay(num(2, 'rose'), s)).toBe(true);
    expect(canPlay(num(2, 'vert'), s)).toBe(false);
    expect(canPlay(card('prisme', null), s)).toBe(true);
    expect(canPlay(card('bond', 'vert'), rigged([[], []], card('bond', 'rose')))).toBe(true);
  });

  it('plays a same-number combo, the last card setting the color', () => {
    const a = num(4, 'cyan');
    const b = num(4, 'vert');
    const c = num(4, 'ambre');
    const s = rigged([[a, b, c, num(9, 'rose')], [num(1)]], num(4, 'rose'), {announced: false});
    expect(validSelection([a.id, b.id, c.id], s)).toBe(true);
    expect(validSelection([a.id, num(9).id], s)).toBe(false);
    const after = play(s, [a.id, b.id, c.id]);
    expect(after.seats[0].hand).toHaveLength(1 + FORGOT_PENALTY); // forgot to announce
    expect(after.activeColor).toBe('ambre');
    expect(after.current).toBe(1);
  });

  it('announcing avoids the last-card penalty', () => {
    const a = num(3, 'cyan');
    const s = rigged([[a, num(8, 'vert')], [num(1)]], num(3, 'rose'));
    expect(play({...s, announced: true}, [a.id]).seats[0].hand).toHaveLength(1);
  });

  it('stacks +2 and +3, then the next player draws the total', () => {
    const p2 = card('plus2', 'cyan');
    const p3 = card('surcharge', null);
    let s = rigged([[p2, num(1), num(2)], [p3, num(5), num(6)], [num(7), num(8)]], num(9, 'cyan'));
    s = play(s, [p2.id]);
    expect(s.pendingDraw).toBe(2);
    expect(canPlay(num(9, 'cyan'), s)).toBe(false);
    s = play(s, [p3.id], 'vert');
    expect(s.pendingDraw).toBe(5);
    const before = s.seats[2].hand.length;
    s = drawTurn(s);
    expect(s.seats[2].hand.length).toBe(before + 5);
    expect(s.pendingDraw).toBe(0);
    expect(s.current).toBe(0);
  });

  it('Bond skips, Retour reverses (or replays with two players)', () => {
    const bond = card('bond', 'cyan');
    let s = rigged([[bond, num(1), num(2)], [num(3)], [num(4)]], num(9, 'cyan'));
    expect(play(s, [bond.id]).current).toBe(2);
    const ret = card('retour', 'cyan');
    s = rigged([[ret, num(1), num(2)], [num(3)], [num(4)]], num(9, 'cyan'));
    const r = play(s, [ret.id]);
    expect([r.direction, r.current]).toEqual([-1, 2]);
    const duo = rigged([[ret, num(1), num(2)], [num(3)]], num(9, 'cyan'));
    expect(play(duo, [ret.id]).current).toBe(0);
  });

  it('requires a color for wild cards and rejects invalid moves', () => {
    const w = card('prisme', null);
    const s = rigged([[w, num(1), num(2)], [num(3)]], num(9, 'rose'));
    expect(() => play(s, [w.id])).toThrow(/Couleur/);
    expect(() => play(s, [num(5, 'vert').id])).toThrow(/invalide/);
  });

  it('bots always finish a game with a winner and the deck conserved', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = seeded(seed);
      let s = newGame(seats(2 + (seed % 7), true), {combos: seed % 2 === 0, stacking: seed % 3 !== 0}, rng);
      let turns = 0;
      while (s.winner === null && turns < 5000) {
        const m = botMove(s, rng);
        s = m.type === 'play' ? play({...s, announced: true}, m.ids, m.color, rng) : m.type === 'draw' ? drawTurn(s, rng) : (() => {
          throw new Error('bots never hold a drawn playable card');
        })();
        turns++;
      }
      expect(s.winner, `seed ${seed}`).not.toBeNull();
      const total = s.draw.length + s.discard.length + s.seats.reduce((n, p) => n + p.hand.length, 0);
      expect(total).toBe(102);
    }
  });
});
