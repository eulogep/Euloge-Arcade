import {
  CHALLENGE_MODIFIERS,
  challengeDayKey,
  challengeSettings,
  getDailyChallenge,
  isChallengeDay,
  msUntilNextChallenge,
  type TunableSetting,
} from '@/lib/dailyChallenge';

const BASE: Record<TunableSetting, number> = {
  startingLives: 3,
  maxIntegrity: 100,
  hazardDamage: 25,
  playerSpeed: 6.2,
  playerJumpForce: -12.4,
  gravityFalling: 1.15,
  blasterCooldown: 0.22,
  blasterDamage: 25,
  fragmentScoreValue: 100,
};

describe('daily challenge', () => {
  it('is the same for everyone on a given UTC day', () => {
    const a = getDailyChallenge('2026-11-10');
    const b = getDailyChallenge(new Date('2026-11-10T23:59:59Z'));
    expect(b).toEqual(a);
    expect(a.day).toBe('2026-11-10');
  });

  it('changes at 00:00 UTC, not at local midnight', () => {
    expect(challengeDayKey(new Date('2026-11-10T23:30:00-02:00'))).toBe('2026-11-11');
    expect(msUntilNextChallenge(new Date('2026-11-10T22:00:00Z'))).toBe(2 * 3600 * 1000);
  });

  it('picks a valid sector and two distinct modifiers, with variety over a month', () => {
    const sectors = new Set<number>();
    const combos = new Set<string>();
    for (let d = 1; d <= 30; d++) {
      const c = getDailyChallenge(`2026-11-${String(d).padStart(2, '0')}`);
      expect(c.startSector).toBeGreaterThanOrEqual(1);
      expect(c.startSector).toBeLessThanOrEqual(3);
      expect(c.modifiers).toHaveLength(2);
      expect(new Set(c.modifiers.map((m) => m.id)).size).toBe(2);
      sectors.add(c.startSector);
      combos.add(c.modifiers.map((m) => m.id).sort().join('+'));
    }
    expect(sectors.size).toBe(3);
    expect(combos.size).toBeGreaterThan(10);
  });

  it('composes set and scale modifiers on top of base values', () => {
    const byId = (id: string) => CHALLENGE_MODIFIERS.find((m) => m.id === id)!;
    const settings = challengeSettings(
      {day: '2026-11-10', startSector: 1, modifiers: [byId('overclock'), byId('heavy-armor')]},
      BASE,
    );
    expect(settings.playerSpeed).toBeCloseTo(6.2 * 1.25 * 0.85);
    expect(settings.maxIntegrity).toBe(150);
    expect(settings).not.toHaveProperty('startingLives');

    const oneLife = challengeSettings({day: '2026-11-10', startSector: 1, modifiers: [byId('one-life')]}, BASE);
    expect(oneLife.startingLives).toBe(1);
  });

  it('never produces a zero or negative setting the game would misread', () => {
    for (let d = 1; d <= 60; d++) {
      const day = new Date(Date.UTC(2026, 0, d));
      const settings = challengeSettings(getDailyChallenge(day), BASE);
      for (const [key, value] of Object.entries(settings)) {
        expect(Math.sign(value), key).toBe(Math.sign(BASE[key as TunableSetting]));
      }
    }
  });

  it('validates day keys', () => {
    expect(isChallengeDay('2026-11-10')).toBe(true);
    expect(isChallengeDay('2026-13-40')).toBe(false);
    expect(isChallengeDay('hier')).toBe(false);
    expect(() => getDailyChallenge('nope')).toThrow();
  });
});
