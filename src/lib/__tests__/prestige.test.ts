import {computeGenreAffinity, computePlayerPrestige, getCartridgeCode, getDailyProtocol} from '@/lib/prestige';
import {bySlug, seedGames} from './fixtures';

describe('prestige & daily protocol', () => {
  it('computes level 1 Initié du Réseau for a brand new player', () => {
    const p = computePlayerPrestige({
      uniqueGamesLaunched: 0,
      totalLaunches: 0,
      favoriteCount: 0,
      unlockedAchievements: 0,
      runs: [],
    });
    expect(p.level).toBe(1);
    expect(p.xp).toBe(0);
    expect(p.rankTitle).toBe('Initié du Réseau');
  });

  it('scales XP and rank title with activity and victories', () => {
    const p = computePlayerPrestige({
      uniqueGamesLaunched: 5,
      totalLaunches: 12,
      favoriteCount: 4,
      unlockedAchievements: 4,
      runs: [
        {
          gameId: '1',
          gameSlug: 'system-breach',
          score: 8200,
          durationSeconds: 180,
          victory: true,
          startLevel: 1,
          deaths: 0,
          createdAt: '2026-10-10T00:00:00Z',
        },
      ],
    });
    expect(p.xp).toBeGreaterThan(900);
    expect(p.level).toBeGreaterThanOrEqual(7);
    expect(p.rankTitle).toBe('Conservateur Cyber');
  });

  it('computes genre affinity weighted by favorites and history', () => {
    const sb = bySlug('system-breach');
    const affinity = computeGenreAffinity(seedGames, [sb.id], [sb.id]);
    expect(affinity.length).toBeGreaterThan(0);
    expect(affinity[0].percent).toBe(100);
    expect(affinity.map((a) => a.genre)).toContain('action');
  });

  it('produces a deterministic daily protocol and marks completion', () => {
    const date = new Date(2026, 9, 30);
    const p1 = getDailyProtocol(seedGames, date);
    const p2 = getDailyProtocol(seedGames, date);
    expect(p1).not.toBeNull();
    expect(p1?.spotlight.id).toBe(p2?.spotlight.id);
    expect(p1?.completed).toBe(false);

    const pDone = getDailyProtocol(seedGames, date, [p1!.spotlight.id]);
    expect(pDone?.completed).toBe(true);
  });

  it('formats a hardware cartridge code', () => {
    expect(getCartridgeCode(bySlug('system-breach'))).toBe('EA-SYS');
    expect(getCartridgeCode(bySlug('2048'))).toBe('EA-204');
  });
});

