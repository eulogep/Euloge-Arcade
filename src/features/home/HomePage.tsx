import {Clock, Crosshair, Dices, Flame, Joystick, LayoutGrid, Sparkles, Star, Wand2} from 'lucide-react';
import {useMemo} from 'react';
import {Link} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {GameGrid, GameRail} from '@/components/gaming/GameRail';
import {HeroCarousel} from '@/components/gaming/HeroCarousel';
import {useSurprise} from '@/components/layout/Header';
import {ErrorState, Skeleton} from '@/components/ui/feedback';
import {useDocumentTitle} from '@/hooks/useDocumentTitle';
import {featuredGames, sortGames} from '@/lib/catalog';
import {recommendGames} from '@/lib/recommend';
import type {Game} from '@/types/game';

const NEW_WINDOW_DAYS = 60;

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Chargement des jeux">
      <Skeleton className="h-[520px] rounded-none sm:h-[600px]" />
      <div className="container-page mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({length: 4}).map((_, i) => (
          <Skeleton key={i} className="aspect-[16/12]" />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  useDocumentTitle();
  const {catalog, games, gameById, history, favorites, popularity, recommendationsConsent, setRecommendationsConsent, reloadCatalog, user} =
    usePlatform();
  const surprise = useSurprise();

  const sections = useMemo(() => {
    const continuePlaying: Game[] = [];
    const seen = new Set<string>();
    for (const h of history) {
      const g = gameById.get(h.gameId);
      if (g && !seen.has(g.id)) {
        seen.add(g.id);
        continuePlaying.push(g);
      }
      if (continuePlaying.length >= 10) break;
    }

    const popular =
      popularity && Object.values(popularity).some((n) => n > 0)
        ? sortGames(games.filter((g) => (popularity[g.id] ?? 0) > 0), 'popular', popularity).slice(0, 10)
        : [];

    const cutoff = Date.now() - NEW_WINDOW_DAYS * 86_400_000;
    const fresh = sortGames(
      games.filter((g) => Date.parse(g.publishedAt ?? g.createdAt) >= cutoff),
      'new',
    ).slice(0, 10);

    const byGenre = (pred: (g: Game) => boolean) => sortGames(games.filter(pred), 'az');

    return {
      featured: featuredGames(games),
      continuePlaying,
      popular,
      fresh,
      retro: byGenre((g) => g.genre.includes('retro')),
      action: byGenre((g) => g.genre.includes('fps') || g.genre.includes('action')),
      arcade: byGenre((g) => g.genre.includes('arcade')),
      recommended: recommendationsConsent
        ? recommendGames(games, [...favorites], history.map((h) => h.gameId))
        : [],
      all: sortGames(games, 'az'),
    };
  }, [games, gameById, history, favorites, popularity, recommendationsConsent]);

  if (catalog.status === 'loading') return <HomeSkeleton />;
  if (catalog.status === 'error') {
    return (
      <div className="container-page py-24">
        <ErrorState title="Le catalogue est indisponible" message={catalog.message} onRetry={reloadCatalog} />
      </div>
    );
  }

  const hasActivity = favorites.size > 0 || history.length > 0;

  return (
    <div className="-mt-16 space-y-14">
      <HeroCarousel games={sections.featured.length ? sections.featured : sections.all.slice(0, 3)} />

      <GameRail
        title={user ? 'Reprendre où tu en étais' : 'Continuer à jouer'}
        subtitle="Tes derniers lancements"
        icon={<Clock size={20} />}
        games={sections.continuePlaying}
      />
      <GameRail
        title="Jeux populaires"
        subtitle="Classés par nombre de joueurs distincts sur les 30 derniers jours"
        icon={<Flame size={20} />}
        games={sections.popular}
        seeAllHref="/jeux?sort=popular"
      />
      <GameRail title="Nouveautés" subtitle="Ajoutés récemment au catalogue" icon={<Sparkles size={20} />} games={sections.fresh} seeAllHref="/jeux" />

      {/* Recommendations: opt-in, computed on-device from favorites & history */}
      {recommendationsConsent ? (
        <GameRail
          title="Recommandés pour toi"
          subtitle="D'après les genres de tes favoris et de tes parties récentes"
          icon={<Wand2 size={20} />}
          games={sections.recommended}
        />
      ) : (
        hasActivity && (
          <section className="container-page">
            <div className="glass flex flex-col items-start gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                  <Wand2 size={18} className="text-accent-2" /> Des recommandations personnalisées ?
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-ink-muted">
                  Nous pouvons te suggérer des jeux à partir des genres de tes favoris et de ton historique. Le calcul est fait sur ton
                  appareil et tu peux le désactiver à tout moment dans ton profil.
                </p>
              </div>
              <button type="button" className="btn-secondary shrink-0" onClick={() => void setRecommendationsConsent(true)}>
                Activer les recommandations
              </button>
            </div>
          </section>
        )
      )}

      <GameRail title="Jeux rétro" icon={<Joystick size={20} />} games={sections.retro} seeAllHref="/jeux?genre=retro" />
      <GameRail title="FPS & action" icon={<Crosshair size={20} />} games={sections.action} seeAllHref="/jeux?genre=action" />
      <GameRail title="Arcade" icon={<Star size={20} />} games={sections.arcade} seeAllHref="/jeux?genre=arcade" />

      <section className="container-page" aria-labelledby="all-games">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <h2 id="all-games" className="section-title flex items-center gap-2">
            <LayoutGrid size={20} className="text-accent-3" /> Tous les jeux
          </h2>
          <div className="flex gap-2">
            <button type="button" onClick={surprise} className="btn-secondary">
              <Dices size={16} /> Surprends-moi
            </button>
            <Link to="/jeux" className="btn-ghost">
              Explorer le catalogue
            </Link>
          </div>
        </div>
        <GameGrid games={sections.all} />
      </section>
    </div>
  );
}
