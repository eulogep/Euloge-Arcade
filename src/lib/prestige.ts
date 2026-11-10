import {GENRE_LABELS} from '@/lib/catalog';
import type {Game, Genre} from '@/types/game';
import type {RunRecord} from '@/features/achievements/evaluate';

export interface PrestigeInput {
  uniqueGamesLaunched: number;
  totalLaunches: number;
  favoriteCount: number;
  unlockedAchievements: number;
  runs: RunRecord[];
}

export interface PlayerPrestige {
  xp: number;
  level: number;
  rankTitle: string;
  rankBadge: string;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
}

const RANKS = [
  {minLevel: 1, title: 'Initié du Réseau', badge: 'RANG I'},
  {minLevel: 2, title: 'Éclaireur Holo', badge: 'RANG II'},
  {minLevel: 4, title: 'Opérateur Tactique', badge: 'RANG III'},
  {minLevel: 7, title: 'Conservateur Cyber', badge: 'RANG IV'},
  {minLevel: 10, title: 'Architecte Système', badge: 'RANG Ω'},
] as const;

/**
 * Computes an honest, local player prestige profile from real platform activity:
 * - Each unique game launched: +45 XP
 * - Each session launch (up to 30 counted): +10 XP
 * - Each favorite in collection (up to 15 counted): +25 XP
 * - Each unlocked achievement: +120 XP
 * - Each completed game run: +60 XP (+90 bonus on victory)
 */
export function computePlayerPrestige(input: PrestigeInput): PlayerPrestige {
  const victoryRuns = input.runs.filter((r) => r.victory).length;
  const xp =
    input.uniqueGamesLaunched * 45 +
    Math.min(input.totalLaunches, 30) * 10 +
    Math.min(input.favoriteCount, 15) * 25 +
    input.unlockedAchievements * 120 +
    input.runs.length * 60 +
    victoryRuns * 90;

  const step = 150;
  const level = Math.floor(xp / step) + 1;
  const currentLevelXp = xp % step;
  const nextLevelXp = step;
  const progressPercent = Math.min(100, Math.round((currentLevelXp / nextLevelXp) * 100));

  let rank: (typeof RANKS)[number] = RANKS[0];
  for (const r of RANKS) {
    if (level >= r.minLevel) rank = r;
  }

  return {
    xp,
    level,
    rankTitle: rank.title,
    rankBadge: rank.badge,
    currentLevelXp,
    nextLevelXp,
    progressPercent,
  };
}

export interface GenreAffinity {
  genre: Genre;
  label: string;
  score: number;
  percent: number;
}

/**
 * Computes the player's Genre DNA radar from favorites (weight 3) and launch history (weight 1).
 */
export function computeGenreAffinity(
  games: Game[],
  favoriteIds: Iterable<string>,
  historyGameIds: Iterable<string>,
): GenreAffinity[] {
  const byId = new Map(games.map((g) => [g.id, g]));
  const scores = new Map<Genre, number>();

  for (const id of favoriteIds) {
    const g = byId.get(id);
    if (!g) continue;
    for (const genre of g.genre) {
      scores.set(genre, (scores.get(genre) ?? 0) + 3);
    }
  }
  for (const id of historyGameIds) {
    const g = byId.get(id);
    if (!g) continue;
    for (const genre of g.genre) {
      scores.set(genre, (scores.get(genre) ?? 0) + 1);
    }
  }

  const maxScore = Math.max(1, ...scores.values());
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([genre, score]) => ({
      genre,
      label: GENRE_LABELS[genre],
      score,
      percent: Math.round((score / maxScore) * 100),
    }));
}

export interface DailyProtocol {
  dateKey: string;
  spotlight: Game;
  missionTitle: string;
  missionDetail: string;
  completed: boolean;
}

/**
 * Deterministic daily game spotlight & micro-objective based on the calendar day.
 */
export function getDailyProtocol(
  games: Game[],
  date = new Date(),
  launchedGameIds: Iterable<string> = [],
  favoriteIds: Iterable<string> = [],
): DailyProtocol | null {
  const playable = games.filter((g) => g.linkStatus !== 'broken');
  if (playable.length === 0) return null;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const dateKey = `${y}-${m}-${d}`;

  // Simple deterministic hash from YYYY-MM-DD
  let hash = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const idx = Math.abs(hash) % playable.length;
  const spotlight = playable[idx];

  const launchedSet = new Set(launchedGameIds);
  const favSet = new Set(favoriteIds);
  const completed = launchedSet.has(spotlight.id) || favSet.has(spotlight.id);

  return {
    dateKey,
    spotlight,
    missionTitle: `Protocole ${m}.${d} : ${spotlight.title}`,
    missionDetail: `Lance « ${spotlight.title} » ou épingle cette cartouche dans tes favoris pour valider la fréquence du jour.`,
    completed,
  };
}

/**
 * Generates a short hardware cartridge code for any game (e.g. "EA-SYS" or "EA-204").
 */
export function getCartridgeCode(game: Game): string {
  const clean = game.slug.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return `EA-${clean.slice(0, 3).padEnd(3, '0')}`;
}

export type CardBackCosmeticId = 'classic' | 'obsidian' | 'phosphor' | 'gold' | 'prisme';
export type TableFeltCosmeticId = 'royal' | 'emerald' | 'nebula' | 'cyber_gold';

export interface CosmeticItem<T extends string = string> {
  id: T;
  label: string;
  description: string;
  minLevel: number;
  previewGradient: string;
  accentHex: string;
}

export const CARD_BACK_COSMETICS: CosmeticItem<CardBackCosmeticId>[] = [
  {
    id: 'classic',
    label: 'Carbone 4 Colors',
    description: 'Dos fibre de carbone officiel avec losange 4 couleurs.',
    minLevel: 1,
    previewGradient: 'linear-gradient(135deg, #181c29 0%, #090c14 100%)',
    accentHex: '#ef1c24',
  },
  {
    id: 'obsidian',
    label: 'Obsidian Pulse',
    description: 'Saphir électrique et circuits plasma haute fréquence.',
    minLevel: 1,
    previewGradient: 'linear-gradient(135deg, #0b396e 0%, #1d1042 55%, #070a14 100%)',
    accentHex: '#38e1ff',
  },
  {
    id: 'phosphor',
    label: 'Matrice Phosphore',
    description: 'Grille bio-émeraude inspirée des terminaux CRT.',
    minLevel: 2,
    previewGradient: 'linear-gradient(135deg, #064e3b 0%, #022c22 65%, #03120e 100%)',
    accentHex: '#34d399',
  },
  {
    id: 'gold',
    label: 'Atelier Cyber-Or',
    description: 'Filigranes d’or solaire sur alliage d’obsidienne.',
    minLevel: 3,
    previewGradient: 'linear-gradient(135deg, #78350f 0%, #3b1704 60%, #140802 100%)',
    accentHex: '#fbbf24',
  },
  {
    id: 'prisme',
    label: 'Prisme Holographique Ω',
    description: 'Réfraction spectrale réservée aux vétérans de l’Arche.',
    minLevel: 5,
    previewGradient: 'linear-gradient(135deg, #2563eb 0%, #9333ea 50%, #ec4899 100%)',
    accentHex: '#f472b6',
  },
];

export const TABLE_FELT_COSMETICS: CosmeticItem<TableFeltCosmeticId>[] = [
  {
    id: 'royal',
    label: 'Casino Bleu Royal',
    description: 'Le tapis feutré bleu profond iconique de Four Colors.',
    minLevel: 1,
    previewGradient: 'radial-gradient(circle at 50% 45%, #0c4d91 0%, #062852 58%, #021229 100%)',
    accentHex: '#38e1ff',
  },
  {
    id: 'emerald',
    label: 'Velours Émeraude',
    description: 'Tapis de grand tournoi vert impérial et filets dorés.',
    minLevel: 1,
    previewGradient: 'radial-gradient(circle at 50% 45%, #0d6e4c 0%, #063d2a 58%, #021c13 100%)',
    accentHex: '#34d399',
  },
  {
    id: 'nebula',
    label: 'Nébuleuse Cyber-Violette',
    description: 'Arène synthwave aux reflets améthyste et magenta.',
    minLevel: 2,
    previewGradient: 'radial-gradient(circle at 50% 45%, #4c1d95 0%, #271052 58%, #0f0524 100%)',
    accentHex: '#c084fc',
  },
  {
    id: 'cyber_gold',
    label: 'Forge Carbone & Or',
    description: 'Table prestige anthracite rehaussée d’or incandescent.',
    minLevel: 3,
    previewGradient: 'radial-gradient(circle at 50% 45%, #5c3a09 0%, #2b1a04 58%, #120a01 100%)',
    accentHex: '#fbbf24',
  },
];

export interface CosmeticLoadout {
  cardBack: CardBackCosmeticId;
  tableFelt: TableFeltCosmeticId;
  unlockedLevel: number;
}

const COSMETICS_STORAGE_KEY = 'euloge-arcade:cosmetics';
let memoryCosmeticsFallback: string | null = null;

function readCosmeticsRaw(): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
      return window.localStorage.getItem(COSMETICS_STORAGE_KEY);
    }
  } catch {
    /* ignore storage errors */
  }
  return memoryCosmeticsFallback;
}

function writeCosmeticsRaw(value: string): void {
  memoryCosmeticsFallback = value;
  try {
    if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.setItem === 'function') {
      window.localStorage.setItem(COSMETICS_STORAGE_KEY, value);
    }
  } catch {
    /* ignore storage errors */
  }
}

export function loadCosmeticLoadout(): CosmeticLoadout {
  try {
    const raw = readCosmeticsRaw();
    if (!raw) return {cardBack: 'classic', tableFelt: 'royal', unlockedLevel: 1};
    const parsed = JSON.parse(raw) as Partial<CosmeticLoadout>;
    const cardBack = CARD_BACK_COSMETICS.some((c) => c.id === parsed.cardBack) ? parsed.cardBack! : 'classic';
    const tableFelt = TABLE_FELT_COSMETICS.some((t) => t.id === parsed.tableFelt) ? parsed.tableFelt! : 'royal';
    const unlockedLevel = typeof parsed.unlockedLevel === 'number' && parsed.unlockedLevel >= 1 ? parsed.unlockedLevel : 1;
    return {cardBack, tableFelt, unlockedLevel};
  } catch {
    return {cardBack: 'classic', tableFelt: 'royal', unlockedLevel: 1};
  }
}

export function saveCosmeticLoadout(next: Partial<CosmeticLoadout>): CosmeticLoadout {
  const current = loadCosmeticLoadout();
  const merged: CosmeticLoadout = {
    cardBack: next.cardBack ?? current.cardBack,
    tableFelt: next.tableFelt ?? current.tableFelt,
    unlockedLevel: Math.max(current.unlockedLevel, next.unlockedLevel ?? 1),
  };
  writeCosmeticsRaw(JSON.stringify(merged));
  return merged;
}


