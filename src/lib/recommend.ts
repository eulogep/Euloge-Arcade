import type {Game, Genre} from '@/types/game';

/**
 * Transparent, on-device recommendations: genres of favorites weigh 3, genres of
 * recently launched games weigh 1. Games already favorited or played recently are
 * excluded so suggestions are actually new. Only used with the user's consent.
 */
export function recommendGames(
  games: Game[],
  favoriteIds: string[],
  recentIds: string[],
  limit = 8,
): Game[] {
  const byId = new Map(games.map((g) => [g.id, g]));
  const weights = new Map<Genre, number>();
  const add = (id: string, w: number) => {
    for (const genre of byId.get(id)?.genre ?? []) {
      weights.set(genre, (weights.get(genre) ?? 0) + w);
    }
  };
  favoriteIds.forEach((id) => add(id, 3));
  recentIds.forEach((id) => add(id, 1));
  if (weights.size === 0) return [];

  const seen = new Set([...favoriteIds, ...recentIds]);
  return games
    .filter((g) => !seen.has(g.id))
    .map((g) => ({g, score: g.genre.reduce((s, genre) => s + (weights.get(genre) ?? 0), 0)}))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.g.title.localeCompare(b.g.title, 'fr'))
    .slice(0, limit)
    .map((x) => x.g);
}
