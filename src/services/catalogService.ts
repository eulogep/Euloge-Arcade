import {ENV} from '@/config/env';
import achievementsSeed from '@/data/achievements.seed.json';
import embedSeed from '@/data/embed-domains.seed.json';
import gamesSeed from '@/data/games.seed.json';
import {getSupabase} from '@/services/supabase';
import {GAME_COLUMNS, rowToGame} from '@/services/mappers';
import type {Game, GameRow} from '@/types/game';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  sort: number;
}

export interface CatalogData {
  games: Game[];
  embedDomains: string[];
  achievements: AchievementDef[];
}

export interface LeaderboardRow {
  rank: number;
  displayName: string;
  score: number;
  achievedAt: string;
}

/**
 * Loads the published catalog. With a backend, the database is the only source;
 * the seed JSON is used solely in local mode (no backend configured).
 */
export async function loadCatalog(): Promise<CatalogData> {
  if (!ENV.backendEnabled) {
    return {
      games: (gamesSeed as GameRow[]).filter((g) => g.status === 'published').map(rowToGame),
      embedDomains: embedSeed.map((d) => d.domain),
      achievements: achievementsSeed.map(({id, title, description, icon, sort}) => ({id, title, description, icon, sort})),
    };
  }
  const sb = await getSupabase();
  const [games, domains, achievements] = await Promise.all([
    sb.from('games').select(GAME_COLUMNS).eq('status', 'published'),
    sb.from('embed_domains').select('domain'),
    sb.from('achievements').select('id, title, description, icon, sort').order('sort'),
  ]);
  if (games.error) throw games.error;
  if (domains.error) throw domains.error;
  if (achievements.error) throw achievements.error;
  return {
    games: (games.data as unknown as GameRow[]).map(rowToGame),
    embedDomains: domains.data.map((d) => d.domain as string),
    achievements: achievements.data as AchievementDef[],
  };
}

/** Distinct players per game over the last 30 days. Null when no real data source exists. */
export async function loadPopularity(): Promise<Record<string, number> | null> {
  if (!ENV.backendEnabled) return null;
  const sb = await getSupabase();
  const {data, error} = await sb.rpc('game_popularity', {days: 30});
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const row of data as Array<{game_id: string; players: number}>) {
    out[row.game_id] = Number(row.players);
  }
  return out;
}

export async function loadLeaderboard(gameId: string): Promise<LeaderboardRow[] | null> {
  if (!ENV.backendEnabled) return null;
  const sb = await getSupabase();
  const {data, error} = await sb.rpc('game_leaderboard', {p_game_id: gameId, p_limit: 10});
  if (error) throw error;
  return (data as Array<{rank: number; display_name: string; score: number; achieved_at: string}>).map((r) => ({
    rank: Number(r.rank),
    displayName: r.display_name,
    score: r.score,
    achievedAt: r.achieved_at,
  }));
}
