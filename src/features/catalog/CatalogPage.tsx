import {Cpu, Dices, LayoutGrid, List, SearchX, SlidersHorizontal, Sparkles, X} from 'lucide-react';
import {useMemo, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {GameGrid} from '@/components/gaming/GameRail';
import {EmptyState, ErrorState, Skeleton} from '@/components/ui/feedback';
import {useDocumentTitle} from '@/hooks/useDocumentTitle';
import {cn} from '@/lib/cn';
import {
  availableGenres,
  FEATURE_LABELS,
  GENRE_LABELS,
  pickRandom,
  queryCatalog,
  queryFromParams,
  queryToParams,
  type CatalogQuery,
  type Feature,
  type SortKey,
} from '@/lib/catalog';
import {playClickPulse} from '@/lib/sound';
import type {Genre} from '@/types/game';

const SORT_LABELS: Record<SortKey, string> = {
  new: 'Nouveautés',
  popular: 'Popularité (30 j)',
  az: 'Ordre alphabétique',
};

function Chip({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) {
  return (
    <button
      type="button"
      onClick={() => {
        playClickPulse();
        onClick();
      }}
      aria-pressed={active}
      className={cn(
        'chip',
        active ? 'border-accent/60 bg-accent/15 text-ink shadow-glow' : 'bg-surface/60 text-ink-muted hover:text-ink',
      )}>
      {children}
    </button>
  );
}

export default function CatalogPage() {
  useDocumentTitle('Tous les jeux');
  const {catalog, games, popularity, reloadCatalog} = usePlatform();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'grid' | 'deck'>('grid');

  const query = queryFromParams(params);
  const popularityAvailable = Boolean(popularity && Object.keys(popularity).length > 0);
  const effectiveQuery: CatalogQuery =
    query.sort === 'popular' && !popularityAvailable ? {...query, sort: 'new'} : query;

  const update = (patch: Partial<CatalogQuery>) => setParams(queryToParams({...query, ...patch}), {replace: true});
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const genres = useMemo(() => availableGenres(games), [games]);
  const results = useMemo(() => queryCatalog(games, effectiveQuery, popularity), [games, effectiveQuery, popularity]);
  const activeFilters = query.genres.length + query.features.length + (query.q ? 1 : 0);

  const inBrowserCount = useMemo(() => games.filter((g) => g.launchMode !== 'external').length, [games]);
  const verifiedCount = useMemo(() => games.filter((g) => g.compatibility.verified).length, [games]);

  const pickFromResults = () => {
    playClickPulse();
    const playable = results.filter((g) => g.linkStatus !== 'broken');
    const chosen = pickRandom(playable.length > 0 ? playable : results);
    if (chosen) navigate(`/jeux/${chosen.slug}`);
  };

  return (
    <div className="container-page pt-8">
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="hud-tag text-accent-3">
              <Cpu size={12} /> INDEX HOLOGRAPHIQUE // {games.length} TITRES
            </span>
            <span className="hud-tag">
              <Sparkles size={12} className="text-success" /> {inBrowserCount} IN-BROWSER
            </span>
            <span className="hud-tag hidden sm:inline-flex">{verifiedCount} CONTRÔLES VÉRIFIÉS</span>
          </div>
          <h1 className="font-display text-3xl font-black sm:text-4xl">
            Tous les <span className="text-gradient">jeux</span>
          </h1>
          <p className="mt-2 text-ink-muted">Cherche, filtre et lance un jeu en un clic.</p>
        </div>

        <div className="flex items-center gap-2">
          {results.length > 1 && (
            <button type="button" onClick={pickFromResults} className="btn-secondary h-10 min-h-0 px-3.5 text-xs">
              <Dices size={15} className="text-accent-3" /> Tirer parmi ces {results.length} jeux
            </button>
          )}
          <div className="flex rounded-xl border bg-surface/70 p-1 border-line-soft" role="group" aria-label="Affichage du catalogue">
            <button
              type="button"
              onClick={() => {
                playClickPulse();
                setViewMode('grid');
              }}
              aria-pressed={viewMode === 'grid'}
              aria-label="Vue en grille 3D"
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg transition',
                viewMode === 'grid' ? 'bg-accent/20 text-accent-3' : 'text-ink-muted hover:text-ink',
              )}>
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => {
                playClickPulse();
                setViewMode('deck');
              }}
              aria-pressed={viewMode === 'deck'}
              aria-label="Vue en liste technique"
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg transition',
                viewMode === 'deck' ? 'bg-accent/20 text-accent-3' : 'text-ink-muted hover:text-ink',
              )}>
              <List size={15} />
            </button>
          </div>
        </div>
      </header>

      <div className="holo-panel reticle-frame sticky top-[4.5rem] z-30 mb-6 rounded-2xl p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Rechercher dans le catalogue</span>
            <input
              type="search"
              value={query.q}
              onChange={(e) => update({q: e.target.value})}
              placeholder="Titre, genre, éditeur…"
              className="input"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <SlidersHorizontal size={16} aria-hidden />
            <span className="sr-only sm:not-sr-only">Trier par</span>
            <select
              value={effectiveQuery.sort}
              onChange={(e) => update({sort: e.target.value as SortKey})}
              className="input h-11 w-auto pr-8">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <option key={key} value={key} disabled={key === 'popular' && !popularityAvailable}>
                  {SORT_LABELS[key]}
                  {key === 'popular' && !popularityAvailable ? ' — indisponible' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtrer par genre">
          {genres.map((g: Genre) => (
            <Chip key={g} active={query.genres.includes(g)} onClick={() => update({genres: toggle(query.genres, g)})}>
              {GENRE_LABELS[g]}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filtrer par caractéristique">
          {(Object.keys(FEATURE_LABELS) as Feature[]).map((f) => (
            <Chip key={f} active={query.features.includes(f)} onClick={() => update({features: toggle(query.features, f)})}>
              {FEATURE_LABELS[f]}
            </Chip>
          ))}
          {activeFilters > 0 && (
            <button type="button" onClick={() => setParams({}, {replace: true})} className="chip text-ink-muted hover:text-ink">
              <X size={14} /> Réinitialiser
            </button>
          )}
        </div>
      </div>

      {catalog.status === 'loading' && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true">
          {Array.from({length: 8}).map((_, i) => (
            <Skeleton key={i} className="aspect-[16/12]" />
          ))}
        </div>
      )}
      {catalog.status === 'error' && <ErrorState title="Le catalogue est indisponible" message={catalog.message} onRetry={reloadCatalog} />}
      {catalog.status === 'ready' && (
        <>
          <p className="mb-4 text-sm text-ink-muted" aria-live="polite">
            {results.length} jeu{results.length > 1 ? 'x' : ''} {activeFilters > 0 ? 'correspondant' + (results.length > 1 ? 's' : '') : 'au catalogue'}
          </p>
          {results.length === 0 ? (
            <EmptyState
              icon={<SearchX size={32} />}
              title="Aucun jeu ne correspond"
              action={
                <button type="button" className="btn-secondary" onClick={() => setParams({}, {replace: true})}>
                  Effacer les filtres
                </button>
              }>
              Essaie un autre mot-clé ou retire quelques filtres. La compatibilité n'est filtrée que lorsqu'elle a été vérifiée.
            </EmptyState>
          ) : (
            <GameGrid games={results} viewMode={viewMode} />
          )}
        </>
      )}
    </div>
  );
}
