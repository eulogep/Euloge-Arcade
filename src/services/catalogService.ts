import {ENV} from '@/config/env';
import achievementsSeed from '@/data/achievements.seed.json';
import embedSeed from '@/data/embed-domains.seed.json';
import gamesSeed from '@/data/games.seed.json';
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
 * Public, read-only REST call. Avoids waiting for supabase-js (lazy-loaded for
 * auth) on the critical rendering path. Uses only the public anon key; RLS applies.
 */
async function publicRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ENV.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ENV.supabaseAnonKey,
      Authorization: `Bearer ${ENV.supabaseAnonKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`REST ${path.split('?')[0]}: HTTP ${res.status}`);
  return (await res.json()) as T;
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
  const cols = GAME_COLUMNS.replace(/\s+/g, '');
  const [games, domains, achievements] = await Promise.all([
    publicRest<GameRow[]>(`games?select=${cols}&status=eq.published`),
    publicRest<Array<{domain: string}>>('embed_domains?select=domain'),
    publicRest<AchievementDef[]>('achievements?select=id,title,description,icon,sort&order=sort'),
  ]);
  return {
    games: games.map(rowToGame),
    embedDomains: domains.map((d) => d.domain),
    achievements,
  };
}

/** Distinct players per game over the last 30 days. Null when no real data source exists. */
export async function loadPopularity(): Promise<Record<string, number> | null> {
  if (!ENV.backendEnabled) return null;
  const data = await publicRest<Array<{game_id: string; players: number}>>('rpc/game_popularity', {
    method: 'POST',
    body: JSON.stringify({days: 30}),
  });
  const out: Record<string, number> = {};
  for (const row of data) {
    out[row.game_id] = Number(row.players);
  }
  return out;
}

export async function loadLeaderboard(gameId: string): Promise<LeaderboardRow[] | null> {
  if (!ENV.backendEnabled) return null;
  const data = await publicRest<unknown[]>('rpc/game_leaderboard', {
    method: 'POST',
    body: JSON.stringify({p_game_id: gameId, p_limit: 10}),
  });
  return (data as Array<{rank: number; display_name: string; score: number; achieved_at: string}>).map((r) => ({
    rank: Number(r.rank),
    displayName: r.display_name,
    score: r.score,
    achievedAt: r.achieved_at,
  }));
}
