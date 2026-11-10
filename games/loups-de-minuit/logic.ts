/**
 * Loups de Minuit — rules of the classic social deduction party game
 * (werewolves vs. villagers), played on a single shared device.
 * Pure functions only: the UI in App.tsx drives them.
 */
import {shuffle, type Rng} from '../_party/rng';

export type Role = 'loup' | 'voyante' | 'protecteur' | 'villageois';
export type Team = 'loups' | 'village';

export interface Player {
  name: string;
  role: Role;
  alive: boolean;
}

export const ROLE_INFO: Record<Role, {label: string; team: Team; goal: string; night: string}> = {
  loup: {
    label: 'Loup-garou',
    team: 'loups',
    goal: 'Élimine les villageois sans te faire démasquer.',
    night: 'Chaque nuit, la meute choisit une victime.',
  },
  voyante: {
    label: 'Voyante',
    team: 'village',
    goal: 'Aide le village à trouver les loups.',
    night: 'Chaque nuit, tu découvres si un joueur est un loup.',
  },
  protecteur: {
    label: 'Protecteur',
    team: 'village',
    goal: 'Aide le village à trouver les loups.',
    night: 'Chaque nuit, tu protèges un joueur de l’attaque des loups (pas deux nuits de suite le même).',
  },
  villageois: {
    label: 'Villageois',
    team: 'village',
    goal: 'Démasque et élimine tous les loups au vote du jour.',
    night: 'La nuit, tu dors : désigne simplement un suspect pour brouiller les pistes.',
  },
};

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 16;

export interface RoleCounts {
  loup: number;
  voyante: number;
  protecteur: number;
}

/** Balanced default: about one wolf per four players, seer from 4, protector from 6. */
export function defaultRoleCounts(n: number): RoleCounts {
  return {
    loup: Math.max(1, Math.round(n / 4)),
    voyante: n >= MIN_PLAYERS ? 1 : 0,
    protecteur: n >= 6 ? 1 : 0,
  };
}

/** Wolves must stay a strict minority, and at least one villager-side player exists. */
export function validateRoleCounts(n: number, c: RoleCounts): string | null {
  if (c.loup < 1) return 'Il faut au moins un loup.';
  if (c.loup * 2 >= n) return 'Trop de loups : ils doivent être moins nombreux que le village.';
  if (c.loup + c.voyante + c.protecteur > n) return 'Plus de rôles que de joueurs.';
  return null;
}

export function assignRoles(names: string[], counts: RoleCounts, rng: Rng = Math.random): Player[] {
  const roles: Role[] = [
    ...Array<Role>(counts.loup).fill('loup'),
    ...Array<Role>(counts.voyante).fill('voyante'),
    ...Array<Role>(counts.protecteur).fill('protecteur'),
  ];
  while (roles.length < names.length) roles.push('villageois');
  const dealt = shuffle(roles, rng);
  return names.map((name, i) => ({name, role: dealt[i], alive: true}));
}

export const isWolf = (p: Player) => p.role === 'loup';

/** Indices of living players, in seat order. */
export const aliveIndices = (players: Player[]) =>
  players.flatMap((p, i) => (p.alive ? [i] : []));

/** Valid targets for the pack: living non-wolves. */
export const wolfTargets = (players: Player[]) =>
  aliveIndices(players).filter((i) => !isWolf(players[i]));

/** Valid protections: any living player except last night's protégé. */
export const protectTargets = (players: Player[], lastProtected: number | null) =>
  aliveIndices(players).filter((i) => i !== lastProtected);

/**
 * Pack decision from wolf votes given in turn order: most votes wins, ties go to
 * the target that was proposed first.
 */
export function resolveWolfVotes(votes: number[]): number | null {
  if (votes.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = votes[0];
  for (const v of votes) if ((counts.get(v) ?? 0) > (counts.get(best) ?? 0)) best = v;
  return best;
}

export interface NightResult {
  /** Player killed during the night, if any. */
  victim: number | null;
  /** The pack attacked someone, but the protector saved them. */
  saved: boolean;
}

export function resolveNight(wolfVotes: number[], protectedIdx: number | null): NightResult {
  const target = resolveWolfVotes(wolfVotes);
  if (target === null) return {victim: null, saved: false};
  if (target === protectedIdx) return {victim: null, saved: true};
  return {victim: target, saved: false};
}

export function eliminate(players: Player[], idx: number | null): Player[] {
  if (idx === null) return players;
  return players.map((p, i) => (i === idx ? {...p, alive: false} : p));
}

/** Village wins when no wolf is left; wolves win once they match the village in number. */
export function winner(players: Player[]): Team | null {
  const alive = players.filter((p) => p.alive);
  const wolves = alive.filter(isWolf).length;
  if (wolves === 0) return 'village';
  if (wolves >= alive.length - wolves) return 'loups';
  return null;
}
