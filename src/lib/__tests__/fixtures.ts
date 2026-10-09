import gamesSeed from '@/data/games.seed.json';
import {rowToGame} from '@/services/mappers';
import type {Game, GameRow} from '@/types/game';

export const seedGames: Game[] = (gamesSeed as GameRow[]).map(rowToGame);

export function makeGame(overrides: Partial<Game> = {}): Game {
  return {...seedGames[0], ...overrides};
}

export const bySlug = (slug: string) => seedGames.find((g) => g.slug === slug)!;
