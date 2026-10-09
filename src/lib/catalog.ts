import type {Game, Genre, LaunchMode} from '@/types/game';

export const GENRE_LABELS: Record<Genre, string> = {
  action: 'Action',
  fps: 'FPS',
  platformer: 'Plateforme',
  arcade: 'Arcade',
  puzzle: 'Réflexion',
  strategy: 'Stratégie',
  board: 'Plateau',
  retro: 'Rétro',
  racing: 'Course',
  sports: 'Sport',
};

export const LAUNCH_MODE_LABELS: Record<LaunchMode, string> = {
  hosted: 'Jouable ici',
  embed: 'Intégré',
  external: 'Site officiel',
};

export type Feature = 'keyboard' | 'mouse' | 'gamepad' | 'touch' | 'in-browser';

export const FEATURE_LABELS: Record<Feature, string> = {
  'in-browser': 'Jouable sur la plateforme',
  keyboard: 'Clavier',
  mouse: 'Souris',
  gamepad: 'Manette',
  touch: 'Mobile / tactile',
};

export type SortKey = 'new' | 'popular' | 'az';

export interface CatalogQuery {
  q: string;
  genres: Genre[];
  features: Feature[];
  sort: SortKey;
}

export const EMPTY_QUERY: CatalogQuery = {q: '', genres: [], features: [], sort: 'new'};

/** Lowercase + strip accents so "reflexion" matches "Réflexion". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function haystack(game: Game): string {
  return normalize(
    [game.title, game.tagline, game.description, game.developer ?? '', ...game.genre.map((g) => GENRE_LABELS[g] + ' ' + g)].join(' '),
  );
}

/** Every whitespace-separated term must appear somewhere in the game's text. */
export function matchesSearch(game: Game, q: string): boolean {
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = haystack(game);
  return terms.every((t) => text.includes(t));
}

/** A compatibility flag only counts when it has been verified. */
export function hasFeature(game: Game, feature: Feature): boolean {
  if (feature === 'in-browser') return game.launchMode !== 'external';
  return game.compatibility.verified && game.compatibility[feature];
}

export function sortGames(games: Game[], sort: SortKey, popularity?: Record<string, number> | null): Game[] {
  const copy = [...games];
  if (sort === 'az') {
    return copy.sort((a, b) => a.title.localeCompare(b.title, 'fr', {sensitivity: 'base'}));
  }
  if (sort === 'popular' && popularity) {
    return copy.sort(
      (a, b) =>
        (popularity[b.id] ?? 0) - (popularity[a.id] ?? 0) ||
        a.title.localeCompare(b.title, 'fr', {sensitivity: 'base'}),
    );
  }
  return copy.sort(
    (a, b) =>
      (Date.parse(b.publishedAt ?? b.createdAt) || 0) - (Date.parse(a.publishedAt ?? a.createdAt) || 0) ||
      a.title.localeCompare(b.title, 'fr', {sensitivity: 'base'}),
  );
}

export function queryCatalog(
  games: Game[],
  query: CatalogQuery,
  popularity?: Record<string, number> | null,
): Game[] {
  const filtered = games.filter(
    (g) =>
      matchesSearch(g, query.q) &&
      query.genres.every((genre) => g.genre.includes(genre)) &&
      query.features.every((f) => hasFeature(g, f)),
  );
  return sortGames(filtered, query.sort, popularity);
}

/** Genres that actually appear in the catalog, in canonical order. */
export function availableGenres(games: Game[]): Genre[] {
  const present = new Set(games.flatMap((g) => g.genre));
  return (Object.keys(GENRE_LABELS) as Genre[]).filter((g) => present.has(g));
}

export function featuredGames(games: Game[]): Game[] {
  return games
    .filter((g) => g.featured)
    .sort((a, b) => (a.featuredRank ?? 99) - (b.featuredRank ?? 99));
}

/** Games sharing the most genres with `game` (excluding itself). */
export function similarGames(game: Game, games: Game[], limit = 6): Game[] {
  return games
    .filter((g) => g.id !== game.id)
    .map((g) => ({g, shared: g.genre.filter((x) => game.genre.includes(x)).length}))
    .filter((x) => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.g.title.localeCompare(b.g.title, 'fr'))
    .slice(0, limit)
    .map((x) => x.g);
}

export function pickRandom<T>(items: T[], random: () => number = Math.random): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(random() * items.length)];
}

/** Parse catalog query from URL search params (and back), so filters are shareable. */
export function queryFromParams(params: URLSearchParams): CatalogQuery {
  const genres = (params.get('genre') ?? '').split(',').filter((g): g is Genre => g in GENRE_LABELS);
  const features = (params.get('features') ?? '').split(',').filter((f): f is Feature => f in FEATURE_LABELS);
  const sortParam = params.get('sort');
  const sort: SortKey = sortParam === 'popular' || sortParam === 'az' ? sortParam : 'new';
  return {q: params.get('q') ?? '', genres, features, sort};
}

export function queryToParams(query: CatalogQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (query.q) p.set('q', query.q);
  if (query.genres.length) p.set('genre', query.genres.join(','));
  if (query.features.length) p.set('features', query.features.join(','));
  if (query.sort !== 'new') p.set('sort', query.sort);
  return p;
}
