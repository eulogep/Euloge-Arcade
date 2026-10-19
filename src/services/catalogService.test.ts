import {afterEach, describe, expect, it, vi} from 'vitest';

describe('loadCatalog resilience', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses the bundled public snapshot when the configured backend is unreachable', async () => {
    // A backend must be configured for this path, whatever the local .env says (CI has none).
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test-project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    vi.resetModules();
    const {loadCatalog} = await import('@/services/catalogService');
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network unavailable'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const catalog = await loadCatalog();

    expect(catalog.games.length).toBeGreaterThanOrEqual(39);
    expect(fetchMock).toHaveBeenCalled();
    expect(catalog.games.some((game) => game.slug === 'budokai-tenkaichi-3-web-online')).toBe(true);
    expect(catalog.embedDomains).toContain('lichess.org');
  });
});
