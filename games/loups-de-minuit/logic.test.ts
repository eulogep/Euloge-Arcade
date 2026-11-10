import {describe, expect, it} from 'vitest';
import {seeded} from '../_party/rng';
import {
  assignRoles,
  defaultRoleCounts,
  eliminate,
  protectTargets,
  resolveNight,
  resolveWolfVotes,
  validateRoleCounts,
  winner,
  wolfTargets,
  type Player,
} from './logic';

const names = (n: number) => Array.from({length: n}, (_, i) => `J${i + 1}`);
const P = (role: Player['role'], alive = true, name: string = role): Player => ({name, role, alive});

describe('Loups de Minuit', () => {
  it('suggests a balanced distribution', () => {
    expect(defaultRoleCounts(4)).toEqual({loup: 1, voyante: 1, protecteur: 0});
    expect(defaultRoleCounts(8)).toEqual({loup: 2, voyante: 1, protecteur: 1});
    expect(defaultRoleCounts(16)).toEqual({loup: 4, voyante: 1, protecteur: 1});
    for (let n = 4; n <= 16; n++) expect(validateRoleCounts(n, defaultRoleCounts(n))).toBeNull();
  });

  it('keeps wolves a strict minority', () => {
    expect(validateRoleCounts(6, {loup: 3, voyante: 1, protecteur: 0})).toMatch(/Trop de loups/);
    expect(validateRoleCounts(6, {loup: 0, voyante: 1, protecteur: 0})).toMatch(/au moins un loup/);
  });

  it('deals exactly the requested roles, filling with villagers', () => {
    const players = assignRoles(names(9), {loup: 2, voyante: 1, protecteur: 1}, seeded(3));
    const count = (r: string) => players.filter((p) => p.role === r).length;
    expect([count('loup'), count('voyante'), count('protecteur'), count('villageois')]).toEqual([2, 1, 1, 5]);
    expect(players.every((p) => p.alive)).toBe(true);
    expect(players.map((p) => p.name)).toEqual(names(9));
  });

  it('resolves the pack vote by majority, ties to the first proposal', () => {
    expect(resolveWolfVotes([])).toBeNull();
    expect(resolveWolfVotes([4, 2, 2])).toBe(2);
    expect(resolveWolfVotes([4, 2])).toBe(4);
  });

  it('lets the protector save the target, never the same player twice in a row', () => {
    expect(resolveNight([3], 3)).toEqual({victim: null, saved: true});
    expect(resolveNight([3], 1)).toEqual({victim: 3, saved: false});
    const players = [P('loup'), P('protecteur'), P('villageois', true, 'a'), P('villageois', false, 'b')];
    expect(protectTargets(players, 2)).toEqual([0, 1]);
    expect(wolfTargets(players)).toEqual([1, 2]);
  });

  it('declares the winner', () => {
    const start = [P('loup'), P('voyante'), P('villageois', true, 'a'), P('villageois', true, 'b')];
    expect(winner(start)).toBeNull();
    expect(winner(eliminate(start, 0))).toBe('village');
    expect(winner(eliminate(eliminate(start, 2), 3))).toBe('loups'); // 1 wolf vs 1 villager
  });
});
