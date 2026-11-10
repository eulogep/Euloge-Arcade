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
  /** UTC day key when played as that day's challenge (modified rules), else null/absent. */
  challenge?: string | null;
}

export interface ActivitySnapshot {
  launchedGameIds: string[];
  favoriteCount: number;
  runs: RunRecord[];
}

type Rule = (s: ActivitySnapshot) => boolean;

// Challenge runs use modified rules (e.g. ×3 fragment points): they don't count here.
const sbRuns = (s: ActivitySnapshot) => s.runs.filter((r) => r.gameSlug === 'system-breach' && !r.challenge);

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
