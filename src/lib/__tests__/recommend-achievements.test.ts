import {newlyEarned, type RunRecord} from '@/features/achievements/evaluate';
import {recommendGames} from '@/lib/recommend';
import {bySlug, seedGames} from './fixtures';

describe('recommendGames', () => {
  it('returns nothing without activity', () => {
    expect(recommendGames(seedGames, [], [])).toEqual([]);
  });

  it('suggests unseen games sharing genres, favorites weighing more', () => {
    const r = recommendGames(seedGames, [bySlug('lichess').id], []).map((g) => g.slug);
    expect(r[0]).toBe('lichess-daily-puzzle');
    expect(r).not.toContain('lichess');
  });

  it('excludes games already played', () => {
    const r = recommendGames(seedGames, [], [bySlug('2048').id, bySlug('lichess-daily-puzzle').id]).map((g) => g.slug);
    expect(r).not.toContain('2048');
    expect(r).not.toContain('lichess-daily-puzzle');
  });
});

describe('achievements', () => {
  const run = (o: Partial<RunRecord>): RunRecord => ({
    gameId: 'x',
    gameSlug: 'system-breach',
    score: 0,
    durationSeconds: 100,
    victory: false,
    startLevel: 1,
    deaths: 2,
    createdAt: '2026-10-10T00:00:00Z',
    ...o,
  });

  it('unlocks launch-based achievements', () => {
    expect(newlyEarned({launchedGameIds: ['a'], favoriteCount: 0, runs: []}, [])).toEqual(['first-launch']);
    expect(newlyEarned({launchedGameIds: ['a', 'b', 'a', 'c'], favoriteCount: 3, runs: []}, ['first-launch'])).toEqual(['explorer', 'curator']);
  });

  it('flawless requires a full run from sector 1 with zero deaths', () => {
    const snap = (r: RunRecord) => ({launchedGameIds: [], favoriteCount: 0, runs: [r]});
    expect(newlyEarned(snap(run({victory: true, deaths: 0, startLevel: 2})), [])).not.toContain('system-breach-flawless');
    expect(newlyEarned(snap(run({victory: true, deaths: 0})), [])).toContain('system-breach-flawless');
  });

  it('ignores runs from other games and already unlocked ids', () => {
    const r = run({gameSlug: 'other', victory: true, score: 99999});
    expect(newlyEarned({launchedGameIds: [], favoriteCount: 0, runs: [r]}, [])).toEqual([]);
    expect(newlyEarned({launchedGameIds: ['a'], favoriteCount: 0, runs: []}, ['first-launch'])).toEqual([]);
  });
});
