import {Heart} from 'lucide-react';
import {Link} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {GameGrid} from '@/components/gaming/GameRail';
import {EmptyState, Skeleton} from '@/components/ui/feedback';
import {useDocumentTitle} from '@/hooks/useDocumentTitle';

export default function FavoritesPage() {
  useDocumentTitle('Mes favoris');
  const {favorites, gameById, catalog, user, backendEnabled} = usePlatform();
  const list = [...favorites].map((id) => gameById.get(id)).filter((g) => g !== undefined);

  return (
    <div className="container-page pt-8">
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
          <GameGrid games={list} />
        )}
      </div>
    </div>
  );
}
