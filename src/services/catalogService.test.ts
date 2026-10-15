import {afterEach, describe, expect, it, vi} from 'vitest';
import {loadCatalog} from '@/services/catalogService';

describe('loadCatalog resilience', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the bundled public snapshot when the configured backend is unreachable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network unavailable'));
    vi.stubGlobal('fetch', fetchMock);

    const catalog = await loadCatalog();

    expect(catalog.games.length).toBeGreaterThanOrEqual(39);
    expect(fetchMock).toHaveBeenCalled();
    expect(catalog.games.some((game) => game.slug === 'budokai-tenkaichi-3-web-online')).toBe(true);
    expect(catalog.embedDomains).toContain('lichess.org');
  });
});
