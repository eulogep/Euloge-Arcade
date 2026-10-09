import {gameInputSchema, type GameInput} from '@/lib/gameSchema';

const valid: GameInput = {
  slug: 'my-game',
  title: 'My Game',
  tagline: '',
  description: 'A perfectly fine description.',
  instructions: '',
  genre: ['arcade'],
  cover_url: '/covers/x.jpg',
  banner_url: null,
  launch_mode: 'external',
  launch_url: 'https://example.com/',
  source_url: 'https://example.com/',
  developer: null,
  license_status: 'link_only',
  license_notes: null,
  compatibility: {keyboard: true, mouse: false, gamepad: false, touch: false, verified: false},
  controls: [],
  orientation: 'any',
  featured: false,
  featured_rank: null,
  supports_scores: false,
  status: 'published',
};

const errorsOf = (input: GameInput) => {
  const r = gameInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('gameInputSchema', () => {
  it('accepts a valid external game', () => {
    expect(errorsOf(valid)).toEqual([]);
  });

  it('rejects bad slugs and empty genres', () => {
    expect(errorsOf({...valid, slug: 'Bad Slug'})).toContain('slug');
    expect(errorsOf({...valid, genre: []})).toContain('genre');
  });

  it('never allows publishing unverified rights', () => {
    expect(errorsOf({...valid, license_status: 'unverified'})).toContain('status');
    expect(errorsOf({...valid, license_status: 'unverified', status: 'draft'})).toEqual([]);
  });

  it('requires distribution rights to host', () => {
    expect(errorsOf({...valid, launch_mode: 'hosted', launch_url: '/games/my-game/index.html'})).toContain('license_status');
    expect(errorsOf({...valid, launch_mode: 'hosted', launch_url: '/games/my-game/index.html', license_status: 'owned'})).toEqual([]);
  });

  it('restricts hosted paths and URL schemes', () => {
    expect(errorsOf({...valid, launch_mode: 'hosted', license_status: 'owned', launch_url: '/games/x/../../etc'})).toContain('launch_url');
    expect(errorsOf({...valid, launch_mode: 'hosted', license_status: 'owned', launch_url: 'https://cdn.example/game'})).toContain('launch_url');
    expect(errorsOf({...valid, launch_url: 'http://example.com'})).toContain('launch_url');
    expect(errorsOf({...valid, cover_url: 'javascript:alert(1)'})).toContain('cover_url');
    expect(errorsOf({...valid, cover_url: '//evil.example/x.png'})).toContain('cover_url');
  });

  it('requires embed permission for iframes', () => {
    expect(errorsOf({...valid, launch_mode: 'embed'})).toContain('license_status');
    expect(errorsOf({...valid, launch_mode: 'embed', license_status: 'embed_permitted'})).toEqual([]);
  });

  it('every seed game passes validation', async () => {
    const seed = (await import('@/data/games.seed.json')).default as unknown as GameInput[];
    for (const g of seed) {
      const r = gameInputSchema.safeParse(g);
      expect(r.success, `${(g as {slug: string}).slug}: ${r.success ? '' : r.error.message}`).toBe(true);
    }
  });
});
