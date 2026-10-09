/**
 * Achievement rules. Definitions (title, description, icon) live in the database
 * (`public.achievements`, bootstrapped from src/data/achievements.seed.json);
 * the unlock conditions live here, keyed by id. Only platform activity and runs
 * reported by first-party games are used — never third-party game progress.
 */

export interface RunRecord {
  gameId: string;
  gameSlug: string;
  score: number;
  durationSeconds: number | null;
  victory: boolean;
  startLevel: number | null;
  deaths: number | null;
  createdAt: string;
}

export interface ActivitySnapshot {
  launchedGameIds: string[];
  favoriteCount: number;
  runs: RunRecord[];
}

type Rule = (s: ActivitySnapshot) => boolean;

const sbRuns = (s: ActivitySnapshot) => s.runs.filter((r) => r.gameSlug === 'system-breach');

export const ACHIEVEMENT_RULES: Record<string, Rule> = {
  'first-launch': (s) => s.launchedGameIds.length >= 1,
  explorer: (s) => new Set(s.launchedGameIds).size >= 3,
  curator: (s) => s.favoriteCount >= 3,
  'system-breach-clear': (s) => sbRuns(s).some((r) => r.victory),
  'system-breach-flawless': (s) =>
    sbRuns(s).some((r) => r.victory && r.startLevel === 1 && r.deaths === 0),
  'system-breach-5k': (s) => sbRuns(s).some((r) => r.score >= 5000),
};

/** Ids of achievements whose condition is met and that aren't unlocked yet. */
export function newlyEarned(snapshot: ActivitySnapshot, alreadyUnlocked: Iterable<string>): string[] {
  const owned = new Set(alreadyUnlocked);
  return Object.entries(ACHIEVEMENT_RULES)
    .filter(([id, rule]) => !owned.has(id) && rule(snapshot))
    .map(([id]) => id);
}
