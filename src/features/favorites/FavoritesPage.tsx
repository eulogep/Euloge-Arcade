import {Cpu, Dices, Heart, LayoutGrid, List} from 'lucide-react';
import {useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {GameGrid} from '@/components/gaming/GameRail';
import {EmptyState, Skeleton} from '@/components/ui/feedback';
import {useDocumentTitle} from '@/hooks/useDocumentTitle';
import {pickRandom} from '@/lib/catalog';
import {playClickPulse} from '@/lib/sound';
import {cn} from '@/lib/cn';

export default function FavoritesPage() {
  useDocumentTitle('Mes favoris');
  const {favorites, gameById, catalog, user, backendEnabled} = usePlatform();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'grid' | 'deck'>('grid');
  const list = [...favorites].map((id) => gameById.get(id)).filter((g) => g !== undefined);

  const launchRandomFavorite = () => {
    playClickPulse();
    const playable = list.filter((g) => g.linkStatus !== 'broken');
    const chosen = pickRandom(playable.length > 0 ? playable : list);
    if (chosen) navigate(`/jeux/${chosen.slug}`);
  };

  return (
    <div className="container-page pt-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="hud-tag text-accent-3 mb-2">
            <Cpu size={12} /> COLLECTION PERSONNELLE // {list.length} CARTOUCHE{list.length > 1 ? 'S' : ''}
          </span>
          <h1 className="font-display text-3xl font-black sm:text-4xl">
            Mes <span className="text-gradient">favoris</span>
          </h1>
          <p className="mt-2 text-ink-muted">
            {user
              ? 'Synchronisés avec ton compte, sur tous tes appareils.'
              : backendEnabled
                ? 'Enregistrés dans ce navigateur. Connecte-toi pour les retrouver partout : ils seront ajoutés à ton compte.'
                : 'Enregistrés dans ce navigateur.'}
          </p>
        </div>

        {list.length > 0 && (
          <div className="flex items-center gap-2">
            {list.length > 1 && (
              <button type="button" onClick={launchRandomFavorite} className="btn-secondary h-10 min-h-0 px-3.5 text-xs">
                <Dices size={15} className="text-accent-3" /> Tirer un favori au hasard
              </button>
            )}
            <div className="flex rounded-xl border bg-surface/70 p-1 border-line-soft" role="group" aria-label="Affichage des favoris">
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
        )}
      </div>

      <div className="mt-8">
        {catalog.status === 'loading' ? (
          <Skeleton className="h-64" />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Heart size={32} />}
            title="Aucun favori pour l'instant"
            action={
              <Link to="/jeux" className="btn-primary">
                Découvrir des jeux
              </Link>
            }>
            Touche le cœur sur un jeu pour le retrouver ici.
          </EmptyState>
        ) : (
          <GameGrid games={list} viewMode={viewMode} />
        )}
      </div>
    </div>
  );
}
