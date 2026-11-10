import type {RunRecord} from '@/features/achievements/evaluate';
import {readJson, removeKey, STORAGE_KEYS, writeJson} from '@/lib/storage';
import {getSupabase} from '@/services/supabase';

export interface HistoryEntry {
  gameId: string;
  playedAt: string;
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: string;
}

/**
 * Per-player data. Guests (and local mode) use the browser; signed-in players use
 * their account. Both expose the same interface so the UI doesn't care.
 */
export interface UserDataStore {
  readonly kind: 'local' | 'remote';
  getFavorites(): Promise<string[]>;
  setFavorite(gameId: string, on: boolean): Promise<void>;
  getHistory(): Promise<HistoryEntry[]>;
  recordLaunch(gameId: string): Promise<void>;
  clearHistory(): Promise<void>;
  getRuns(): Promise<RunRecord[]>;
  submitRun(run: RunRecord): Promise<void>;
  getAchievements(): Promise<UnlockedAchievement[]>;
  /** Unlocks the given achievements and resolves with the ids the player now owns. */
  unlockAchievements(ids: string[]): Promise<string[]>;
}

const MAX_LOCAL_HISTORY = 100;
const MAX_LOCAL_RUNS = 200;

export class LocalUserDataStore implements UserDataStore {
  readonly kind = 'local' as const;

  async getFavorites() {
    return readJson<string[]>(STORAGE_KEYS.favorites, []);
  }

  async setFavorite(gameId: string, on: boolean) {
    const current = new Set(await this.getFavorites());
    if (on) current.add(gameId);
    else current.delete(gameId);
    writeJson(STORAGE_KEYS.favorites, [...current]);
  }

  async getHistory() {
    return readJson<HistoryEntry[]>(STORAGE_KEYS.history, []);
  }

  async recordLaunch(gameId: string) {
    const history = await this.getHistory();
    history.unshift({gameId, playedAt: new Date().toISOString()});
    writeJson(STORAGE_KEYS.history, history.slice(0, MAX_LOCAL_HISTORY));
  }

  async clearHistory() {
    removeKey(STORAGE_KEYS.history);
  }

  async getRuns() {
    return readJson<RunRecord[]>(STORAGE_KEYS.runs, []);
  }

  async submitRun(run: RunRecord) {
    const runs = await this.getRuns();
    runs.unshift(run);
    writeJson(STORAGE_KEYS.runs, runs.slice(0, MAX_LOCAL_RUNS));
  }

  async getAchievements() {
    return readJson<UnlockedAchievement[]>(STORAGE_KEYS.achievements, []);
  }

  async unlockAchievements(ids: string[]) {
    const current = await this.getAchievements();
    const owned = new Set(current.map((a) => a.id));
    const now = new Date().toISOString();
    for (const id of ids) if (!owned.has(id)) current.push({id, unlockedAt: now});
    writeJson(STORAGE_KEYS.achievements, current);
    return ids;
  }

  /** Remove everything (after it has been merged into an account). */
  clearAll() {
    for (const key of [STORAGE_KEYS.favorites, STORAGE_KEYS.history, STORAGE_KEYS.runs, STORAGE_KEYS.achievements]) {
      removeKey(key);
    }
  }
}

export class RemoteUserDataStore implements UserDataStore {
  readonly kind = 'remote' as const;

  /** Maps game id -> slug, needed to rebuild RunRecords from the scores table. */
  constructor(private readonly slugById: Map<string, string>) {}

  /**
   * Writes still in flight. The server re-checks achievement conditions against
   * stored rows, so a claim must wait until the favorite, launch or score that
   * earned it has been written.
   */
  private readonly pendingWrites = new Set<Promise<unknown>>();

  private track<T>(write: Promise<T>): Promise<T> {
    this.pendingWrites.add(write);
    const done = () => this.pendingWrites.delete(write);
    write.then(done, done);
    return write;
  }

  async getFavorites() {
    const sb = await getSupabase();
    const {data, error} = await sb.from('favorites').select('game_id').order('created_at', {ascending: false});
    if (error) throw error;
    return data.map((r) => r.game_id as string);
  }

  setFavorite(gameId: string, on: boolean) {
    return this.track(this.writeFavorite(gameId, on));
  }

  private async writeFavorite(gameId: string, on: boolean) {
    const sb = await getSupabase();
    const {error} = on
      ? await sb.from('favorites').upsert({game_id: gameId}, {onConflict: 'user_id,game_id', ignoreDuplicates: true})
      : await sb.from('favorites').delete().eq('game_id', gameId);
    if (error) throw error;
  }

  async getHistory() {
    const sb = await getSupabase();
    const {data, error} = await sb
      .from('play_events')
      .select('game_id, created_at')
      .order('created_at', {ascending: false})
      .limit(100);
    if (error) throw error;
    return data.map((r) => ({gameId: r.game_id as string, playedAt: r.created_at as string}));
  }

  recordLaunch(gameId: string) {
    return this.track(this.writeLaunch(gameId));
  }

  private async writeLaunch(gameId: string) {
    const sb = await getSupabase();
    const {error} = await sb.from('play_events').insert({game_id: gameId});
    if (error) throw error;
  }

  async clearHistory() {
    const sb = await getSupabase();
    const {data} = await sb.auth.getUser();
    if (!data.user) return;
    const {error} = await sb.from('play_events').delete().eq('user_id', data.user.id);
    if (error) throw error;
  }

  async getRuns() {
    const sb = await getSupabase();
    const {data, error} = await sb
      .from('scores')
      .select('game_id, score, duration_seconds, meta, created_at')
      .order('created_at', {ascending: false})
      .limit(200);
    if (error) throw error;
    return data.map((r) => {
      const meta = (r.meta ?? {}) as {victory?: boolean; startLevel?: number; deaths?: number; challenge?: string};
      return {
        gameId: r.game_id as string,
        gameSlug: this.slugById.get(r.game_id as string) ?? '',
        score: r.score as number,
        durationSeconds: r.duration_seconds === null ? null : Number(r.duration_seconds),
        victory: Boolean(meta.victory),
        startLevel: meta.startLevel ?? null,
        deaths: meta.deaths ?? null,
        createdAt: r.created_at as string,
        challenge: meta.challenge ?? null,
      } satisfies RunRecord;
    });
  }

  submitRun(run: RunRecord) {
    return this.track(this.writeRun(run));
  }

  private async writeRun(run: RunRecord) {
    const sb = await getSupabase();
    const {error} = await sb.from('scores').insert({
      game_id: run.gameId,
      score: Math.max(0, Math.min(10_000_000, Math.round(run.score))),
      duration_seconds: run.durationSeconds === null ? null : Math.min(86400, Math.max(0, run.durationSeconds)),
      meta: {
        victory: run.victory,
        startLevel: run.startLevel,
        deaths: run.deaths,
        ...(run.challenge ? {challenge: run.challenge} : {}),
      },
    });
    if (error) throw error;
  }

  async getAchievements() {
    const sb = await getSupabase();
    const {data, error} = await sb.from('user_achievements').select('achievement_id, unlocked_at');
    if (error) throw error;
    return data.map((r) => ({id: r.achievement_id as string, unlockedAt: r.unlocked_at as string}));
  }

  /** The server grants only the achievements whose condition it can verify. */
  async unlockAchievements(ids: string[]) {
    if (ids.length === 0) return [];
    await Promise.allSettled([...this.pendingWrites]);
    const sb = await getSupabase();
    const {data, error} = await sb.rpc('claim_achievements', {p_ids: ids});
    if (error) throw error;
    return (data ?? []) as string[];
  }
}

/**
 * Moves guest data into the freshly signed-in account, then clears it locally.
 * Best effort: individual failures (e.g. a game that no longer exists) are skipped.
 */
export async function mergeLocalIntoRemote(local: LocalUserDataStore, remote: RemoteUserDataStore, knownGameIds: Set<string>) {
  const [favorites, history, runs, achievements] = await Promise.all([
    local.getFavorites(),
    local.getHistory(),
    local.getRuns(),
    local.getAchievements(),
  ]);
  if (!favorites.length && !history.length && !runs.length && !achievements.length) return;

  const tasks: Promise<unknown>[] = [];
  for (const id of favorites) if (knownGameIds.has(id)) tasks.push(remote.setFavorite(id, true));
  // Only the most recent launches are worth carrying over.
  for (const h of history.slice(0, 20).reverse()) if (knownGameIds.has(h.gameId)) tasks.push(remote.recordLaunch(h.gameId));
  for (const r of runs.slice(0, 20)) if (knownGameIds.has(r.gameId)) tasks.push(remote.submitRun(r));
  await Promise.allSettled(tasks);
  // Claimed last: the server only grants what the merged data proves.
  await remote.unlockAchievements(achievements.map((a) => a.id)).catch(() => []);
  local.clearAll();
}
