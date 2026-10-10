import {
  availableGenres,
  featuredGames,
  hasFeature,
  matchesSearch,
  pickRandom,
  queryCatalog,
  queryFromParams,
  queryToParams,
  similarGames,
  sortGames,
  EMPTY_QUERY,
} from '@/lib/catalog';
import {bySlug, makeGame, seedGames} from './fixtures';

describe('search', () => {
  it('matches title, genre label and is accent/case insensitive', () => {
    expect(matchesSearch(bySlug('2048'), '2048')).toBe(true);
    expect(matchesSearch(bySlug('2048'), 'REFLEXION')).toBe(true); // genre label "Réflexion"
    expect(matchesSearch(bySlug('lichess'), 'echecs')).toBe(true);
    expect(matchesSearch(bySlug('krunker'), 'echecs')).toBe(false);
  });

  it('requires every term', () => {
    expect(matchesSearch(bySlug('system-breach'), 'cyberpunk boss')).toBe(true);
    expect(matchesSearch(bySlug('system-breach'), 'cyberpunk chess')).toBe(false);
  });

  it('empty query matches everything', () => {
    expect(queryCatalog(seedGames, EMPTY_QUERY)).toHaveLength(seedGames.length);
  });
});

describe('filters', () => {
  it('filters by genre (AND)', () => {
    const r = queryCatalog(seedGames, {...EMPTY_QUERY, genres: ['puzzle', 'arcade']});
    expect(r.map((g) => g.slug)).toEqual(['2048']);
  });

  it('only counts verified compatibility', () => {
    const unverified = makeGame({compatibility: {keyboard: true, mouse: true, gamepad: true, touch: true, verified: false}});
    expect(hasFeature(unverified, 'gamepad')).toBe(false);
    expect(hasFeature(bySlug('system-breach'), 'touch')).toBe(true);
  });

  it('"in-browser" excludes external games', () => {
    const r = queryCatalog(seedGames, {...EMPTY_QUERY, features: ['in-browser']});
    expect(r.every((g) => g.launchMode !== 'external')).toBe(true);
    expect(r.map((g) => g.slug).sort()).toEqual(['lichess-daily-puzzle', 'system-breach']);
  });
});

describe('sorting', () => {
  it('sorts alphabetically with French collation', () => {
    expect(sortGames(seedGames, 'az').map((g) => g.title)[0]).toBe('2048');
  });

  it('sorts by real popularity and falls back to title', () => {
    const pop = {[bySlug('krunker').id]: 5, [bySlug('2048').id]: 9};
    const r = sortGames(seedGames, 'popular', pop).map((g) => g.slug);
    expect(r.slice(0, 2)).toEqual(['2048', 'krunker']);
  });

  it('sorts newest first', () => {
    const r = sortGames(seedGames, 'new');
    expect(r[r.length - 1].slug).toBe('lichess'); // published one day earlier
  });
});

describe('helpers', () => {
  it('featured games are ordered by rank', () => {
    expect(featuredGames(seedGames).map((g) => g.slug)).toEqual(['system-breach', 'lichess-daily-puzzle', 'krunker']);
  });

  it('similar games share a genre and exclude the game itself', () => {
    const sim = similarGames(bySlug('lichess'), seedGames).map((g) => g.slug);
    expect(sim).toContain('lichess-daily-puzzle');
    expect(sim).not.toContain('lichess');
    expect(sim).not.toContain('krunker');
  });

  it('available genres only lists present genres', () => {
    expect(availableGenres([makeGame({genre: ['action']})])).toEqual(['action']);
  });

  it('pickRandom is deterministic with an injected RNG and safe on empty input', () => {
    expect(pickRandom([1, 2, 3], () => 0.99)).toBe(3);
    expect(pickRandom([], Math.random)).toBeUndefined();
  });

  it('round-trips the query through URL params and ignores junk', () => {
    const q = {q: 'boss', genres: ['action' as const], features: ['touch' as const], sort: 'az' as const};
    expect(queryFromParams(queryToParams(q))).toEqual(q);
    expect(queryFromParams(new URLSearchParams('genre=hack,action&sort=evil'))).toEqual({
      q: '',
      genres: ['action'],
      features: [],
      sort: 'new',
    });
  });
});
