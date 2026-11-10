import {readdirSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {ACHIEVEMENT_RULES} from '@/features/achievements/evaluate';

const events: string[] = [];
let releaseFavorite: () => void = () => {};

const fakeClient = {
  from: () => ({
    upsert: () =>
      new Promise<{error: null}>((done) => {
        releaseFavorite = () => {
          events.push('favorite written');
          done({error: null});
        };
      }),
  }),
  rpc: vi.fn(async (_fn: string, args: {p_ids: string[]}) => {
    events.push('claim sent');
    return {data: args.p_ids.filter((id) => id !== 'refused'), error: null};
  }),
};

vi.mock('@/services/supabase', () => ({getSupabase: async () => fakeClient}));

describe('RemoteUserDataStore.unlockAchievements', () => {
  it('waits for in-flight writes, then returns only what the server granted', async () => {
    const {RemoteUserDataStore} = await import('@/services/userDataService');
    const store = new RemoteUserDataStore(new Map());

    void store.setFavorite('game-1', true);
    const claim = store.unlockAchievements(['curator', 'refused']);
    await new Promise((r) => setTimeout(r, 10));
    expect(events).toEqual([]); // the claim is held back while the favorite is pending

    releaseFavorite();
    await expect(claim).resolves.toEqual(['curator']);
    expect(events).toEqual(['favorite written', 'claim sent']);
    expect(fakeClient.rpc).toHaveBeenCalledWith('claim_achievements', {p_ids: ['curator', 'refused']});
  });
});

describe('server-side achievement conditions', () => {
  it('handles every client rule in the latest achievement_condition_met()', () => {
    const dir = resolve(process.cwd(), 'supabase/migrations');
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(resolve(dir, f), 'utf8'))
      .join('\n');
    const start = sql.lastIndexOf('create or replace function public.achievement_condition_met');
    expect(start).toBeGreaterThan(-1);
    const body = sql.slice(start, sql.indexOf('$$;', start));
    for (const id of Object.keys(ACHIEVEMENT_RULES)) {
      expect(body, `missing SQL condition for "${id}"`).toContain(`when '${id}'`);
    }
  });
});
