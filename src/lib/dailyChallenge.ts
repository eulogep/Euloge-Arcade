/**
 * System Breach daily challenge, shared by the game (games/system-breach) and the
 * platform. Pure and dependency-free on purpose: both bundles import it.
 *
 * Everyone gets the same challenge on a given UTC day: the day key seeds a small
 * deterministic PRNG that picks the starting sector and two modifiers.
 */

/** Tunable game settings a modifier may scale (keys of the game's CONFIG). */
export type TunableSetting =
  | 'startingLives'
  | 'maxIntegrity'
  | 'hazardDamage'
  | 'playerSpeed'
  | 'playerJumpForce'
  | 'gravityFalling'
  | 'blasterCooldown'
  | 'blasterDamage'
  | 'fragmentScoreValue';

export interface ChallengeModifier {
  id: string;
  /** Platform (French) */
  label: string;
  description: string;
  /** In-game (English, like the rest of the game UI) */
  labelEn: string;
  /** Absolute values (`set`) or multipliers (`scale`) applied to the game settings. */
  set?: Partial<Record<TunableSetting, number>>;
  scale?: Partial<Record<TunableSetting, number>>;
}

export const CHALLENGE_MODIFIERS: readonly ChallengeModifier[] = [
  {
    id: 'one-life',
    label: 'Une seule vie',
    description: "Aucune vie de réserve : la moindre chute met fin à l'infiltration.",
    labelEn: 'ONE LIFE',
    set: {startingLives: 1},
  },
  {
    id: 'glass-cannon',
    label: 'Canon de verre',
    description: 'Tes tirs font deux fois plus de dégâts, ceux que tu subis aussi.',
    labelEn: 'GLASS CANNON',
    scale: {blasterDamage: 2, hazardDamage: 2},
  },
  {
    id: 'low-gravity',
    label: 'Gravité réduite',
    description: 'Tu retombes plus lentement : sauts longs, atterrissages délicats.',
    labelEn: 'LOW GRAVITY',
    scale: {gravityFalling: 0.7, playerJumpForce: 0.92},
  },
  {
    id: 'overclock',
    label: 'Overclock',
    description: 'Déplacements 25 % plus rapides.',
    labelEn: 'OVERCLOCK',
    scale: {playerSpeed: 1.25},
  },
  {
    id: 'rapid-fire',
    label: 'Tir rapide',
    description: 'Le Cyber Blaster se recharge deux fois plus vite.',
    labelEn: 'RAPID FIRE',
    scale: {blasterCooldown: 0.5},
  },
  {
    id: 'data-rush',
    label: 'Ruée de données',
    description: 'Chaque fragment rapporte trois fois plus de points.',
    labelEn: 'DATA RUSH',
    scale: {fragmentScoreValue: 3},
  },
  {
    id: 'heavy-armor',
    label: 'Blindage lourd',
    description: "50 % d'intégrité en plus, mais 15 % de vitesse en moins.",
    labelEn: 'HEAVY ARMOR',
    scale: {maxIntegrity: 1.5, playerSpeed: 0.85},
  },
];

export const MODIFIERS_PER_CHALLENGE = 2;
export const SECTOR_COUNT = 3;

export interface DailyChallenge {
  /** UTC day key, `YYYY-MM-DD`. Stored with the run as `meta.challenge`. */
  day: string;
  startSector: number;
  modifiers: ChallengeModifier[];
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isChallengeDay(value: unknown): value is string {
  return typeof value === 'string' && DAY_KEY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** UTC day key of a date: the challenge changes at 00:00 UTC for everyone. */
export function challengeDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Milliseconds until the next challenge (next 00:00 UTC). */
export function msUntilNextChallenge(date = new Date()): number {
  const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return next - date.getTime();
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getDailyChallenge(dayOrDate: string | Date = new Date()): DailyChallenge {
  const day = typeof dayOrDate === 'string' ? dayOrDate : challengeDayKey(dayOrDate);
  if (!isChallengeDay(day)) throw new Error(`Invalid challenge day: ${day}`);
  const rand = mulberry32(fnv1a(`system-breach:${day}`));
  const startSector = 1 + Math.floor(rand() * SECTOR_COUNT);
  const pool = [...CHALLENGE_MODIFIERS];
  const modifiers: ChallengeModifier[] = [];
  while (modifiers.length < MODIFIERS_PER_CHALLENGE && pool.length > 0) {
    modifiers.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  return {day, startSector, modifiers};
}

/**
 * Final setting values for a challenge, given the game's base values.
 * `set` replaces a value, `scale` multiplies it; several modifiers compose.
 */
export function challengeSettings(
  challenge: DailyChallenge,
  base: Record<TunableSetting, number>,
): Partial<Record<TunableSetting, number>> {
  const out: Partial<Record<TunableSetting, number>> = {};
  for (const mod of challenge.modifiers) {
    for (const [key, value] of Object.entries(mod.set ?? {}) as [TunableSetting, number][]) {
      out[key] = value;
    }
    for (const [key, factor] of Object.entries(mod.scale ?? {}) as [TunableSetting, number][]) {
      out[key] = (out[key] ?? base[key]) * factor;
    }
  }
  if (out.startingLives !== undefined) out.startingLives = Math.max(1, Math.round(out.startingLives));
  if (out.maxIntegrity !== undefined) out.maxIntegrity = Math.round(out.maxIntegrity);
  return out;
}
