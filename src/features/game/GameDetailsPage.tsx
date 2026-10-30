import {ArrowLeft, BookOpen, Clock, Cpu, ExternalLink, Gamepad2, Info, Medal, Scale, Trophy} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {Link, useParams, useSearchParams} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {
  AvailabilityBadge,
  CompatibilityIcons,
  CoverImage,
  FavoriteButton,
  GenreBadges,
} from '@/components/gaming/GameBits';
import {GameRail} from '@/components/gaming/GameRail';
import {EmptyState, ErrorState, Skeleton} from '@/components/ui/feedback';
import {ControlsList} from '@/features/game/ControlsList';
import {GamePlayer} from '@/features/player/GamePlayer';
import {useDocumentTitle} from '@/hooks/useDocumentTitle';
import {LAUNCH_MODE_LABELS, similarGames} from '@/lib/catalog';
import {getCartridgeCode} from '@/lib/prestige';
import {loadLeaderboard, type LeaderboardRow} from '@/services/catalogService';
import type {Game, LicenseStatus} from '@/types/game';

const LICENSE_LABELS: Record<LicenseStatus, string> = {
  owned: 'Création originale Euloge Arcade',
  open_source: 'Logiciel libre (licence open source)',
  embed_permitted: "Intégration autorisée par l'éditeur",
  link_only: "Lien vers le site officiel de l'éditeur",
  unverified: 'Droits en cours de vérification',
};

function formatDuration(s: number | null) {
  if (s === null) return '—';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function Scores({game}: {game: Game}) {
  const {runs, backendEnabled, user} = usePlatform();
  const mine = runs.filter((r) => r.gameId === game.id);
  const best = mine.reduce<(typeof mine)[number] | null>((b, r) => (!b || r.score > b.score ? r : b), null);
  const [board, setBoard] = useState<LeaderboardRow[] | null>(null);
  const [boardError, setBoardError] = useState(false);

  useEffect(() => {
    if (!backendEnabled || !game.supportsScores) return;
    loadLeaderboard(game.id)
      .then(setBoard)
      .catch(() => setBoardError(true));
  }, [game.id, game.supportsScores, backendEnabled, runs.length]);

  return (
    <section className="holo-panel reticle-frame rounded-2xl p-5" aria-labelledby="scores-title">
      <h2 id="scores-title" className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
        <Trophy size={18} className="text-warning" /> Scores
      </h2>
      <div className="mb-4 rounded-xl bg-surface-2/60 p-4 border border-line-soft">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Ton record</p>
        {best ? (
          <p className="mt-1 font-display text-2xl font-black">
            {best.score.toLocaleString('fr-FR')} <span className="text-sm font-semibold text-ink-muted">pts</span>
            <span className="ml-2 text-xs font-medium text-ink-muted">
              {best.victory ? 'victoire' : 'partie terminée'} · {formatDuration(best.durationSeconds)}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">Termine une partie pour enregistrer ton premier score.</p>
        )}
        {!user && backendEnabled && (
          <p className="mt-2 text-xs text-ink-faint">
            <Link to="/connexion" className="underline">Connecte-toi</Link> pour apparaître au classement.
          </p>
        )}
      </div>
      {backendEnabled && game.supportsScores && (
        <>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
            <Medal size={16} className="text-accent-3" /> Classement
          </h3>
          {boardError ? (
            <p className="text-sm text-ink-muted">Classement indisponible pour le moment.</p>
          ) : !board ? (
            <Skeleton className="h-24" />
          ) : board.length === 0 ? (
            <p className="text-sm text-ink-muted">Aucun score pour l'instant. Sois le premier !</p>
          ) : (
            <ol className="space-y-1.5">
              {board.map((r) => (
                <li key={r.rank} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm odd:bg-surface-2/40">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-6 text-right font-mono text-xs text-ink-faint">#{r.rank}</span>
                    <span className="truncate font-semibold">{r.displayName}</span>
                  </span>
                  <span className="font-mono">{r.score.toLocaleString('fr-FR')}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-[11px] text-ink-faint">Classement indicatif : les scores sont transmis par le jeu depuis ton navigateur.</p>
        </>
      )}
    </section>
  );
}

export default function GameDetailsPage() {
  const {slug} = useParams();
  const [params] = useSearchParams();
  const {catalog, games, history, reloadCatalog} = usePlatform();
  const game = useMemo(() => games.find((g) => g.slug === slug), [games, slug]);
  useDocumentTitle(game?.title ?? 'Jeu');
  const similar = useMemo(() => (game ? similarGames(game, games) : []), [game, games]);
  const autoStart = params.get('jouer') === '1';

  const myLaunches = useMemo(
    () => (game ? history.filter((h) => h.gameId === game.id) : []),
    [history, game],
  );

  if (catalog.status === 'loading') {
    return (
      <div className="container-page pt-24">
        <Skeleton className="aspect-video w-full" />
      </div>
    );
  }
  if (catalog.status === 'error') {
    return (
      <div className="container-page py-24">
        <ErrorState title="Impossible de charger ce jeu" message={catalog.message} onRetry={reloadCatalog} />
      </div>
    );
  }
  if (!game) {
    return (
      <div className="container-page py-24">
        <EmptyState
          icon={<Gamepad2 size={32} />}
          title="Ce jeu n'existe pas ou n'est plus disponible"
          action={
            <Link to="/jeux" className="btn-primary">
              Voir tous les jeux
            </Link>
          }>
          Il a peut-être été retiré du catalogue.
        </EmptyState>
      </div>
    );
  }

  const isThirdParty = game.licenseStatus !== 'owned';
  const cartridgeCode = getCartridgeCode(game);

  return (
    <div>
      {/* Banner */}
      <div className="relative h-[260px] overflow-hidden sm:h-[340px]">
        <CoverImage game={game} src={game.bannerUrl ?? game.coverUrl} eager className="h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/75 to-bg/20" />
      </div>

      <div className="container-page relative -mt-40 sm:-mt-44">
        <Link to="/jeux" className="btn-ghost mb-3 h-9 min-h-0 px-2 text-xs">
          <ArrowLeft size={16} /> Catalogue
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="animate-fade-up">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="hud-tag text-accent-3">
                <Cpu size={11} /> {cartridgeCode}
              </span>
              <AvailabilityBadge game={game} />
              <GenreBadges game={game} max={5} />
              {myLaunches.length > 0 && (
                <span className="hud-tag">
                  <Clock size={11} className="text-success" /> {myLaunches.length} SESSION{myLaunches.length > 1 ? 'S' : ''}
                </span>
              )}
            </div>
            <h1 className="font-display text-4xl font-black sm:text-5xl">{game.title}</h1>
            <p className="mt-2 max-w-2xl text-ink-muted">{game.tagline}</p>
          </div>
          <div className="flex items-center gap-3">
            <CompatibilityIcons game={game} withLabels />
            <FavoriteButton game={game} size="lg" />
          </div>
        </div>

        <div className="mt-8">
          <GamePlayer game={game} autoStart={autoStart} />
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-8">
            <section aria-labelledby="about-game" className="holo-panel rounded-2xl p-6">
              <h2 id="about-game" className="section-title mb-3 flex items-center gap-2">
                <Info size={20} className="text-accent-3" /> À propos du jeu
              </h2>
              <p className="whitespace-pre-line leading-relaxed text-ink-muted">{game.description}</p>
            </section>
            {game.instructions && (
              <section aria-labelledby="how-to" className="holo-panel rounded-2xl p-6">
                <h2 id="how-to" className="section-title mb-3 flex items-center gap-2">
                  <BookOpen size={20} className="text-accent-3" /> Comment jouer
                </h2>
                <p className="whitespace-pre-line leading-relaxed text-ink-muted">{game.instructions}</p>
              </section>
            )}
            {game.controls.length > 0 && (
              <section aria-labelledby="controls" className="holo-panel reticle-frame rounded-2xl p-5 sm:p-6">
                <h2 id="controls" className="mb-4 font-display text-lg font-bold">
                  Commandes
                </h2>
                <ControlsList controls={game.controls} />
                {!game.controls.some((c) => c.device === 'gamepad') && (
                  <p className="mt-4 text-xs text-ink-faint">Manette : non prise en charge ou non vérifiée pour ce jeu.</p>
                )}
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <Scores game={game} />
            <section className="holo-panel reticle-frame rounded-2xl p-5" aria-labelledby="credits-title">
              <h2 id="credits-title" className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
                <Scale size={18} className="text-accent-2" /> Informations &amp; droits
              </h2>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Code Cartouche</dt>
                  <dd className="font-mono text-xs text-accent-3">{cartridgeCode}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Développeur / éditeur</dt>
                  <dd>{game.developer ?? 'Voir le site officiel'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Lancement</dt>
                  <dd>{LAUNCH_MODE_LABELS[game.launchMode]}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Statut des droits</dt>
                  <dd>{LICENSE_LABELS[game.licenseStatus]}</dd>
                  {game.licenseNotes && <dd className="mt-1 text-xs leading-relaxed text-ink-muted">{game.licenseNotes}</dd>}
                </div>
              </dl>
              {game.sourceUrl && (
                <a href={game.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-accent-3 hover:underline">
                  Site officiel <ExternalLink size={14} />
                </a>
              )}
              {isThirdParty && (
                <p className="mt-4 border-t pt-4 text-xs text-ink-faint border-line-soft">
                  Ce jeu, son nom et ses contenus appartiennent à leurs auteurs. Euloge Arcade n'en revendique aucun droit et n'est pas affilié à
                  son éditeur.
                </p>
              )}
            </section>
          </aside>
        </div>
      </div>

      <div className="mt-14">
        <GameRail title="Jeux similaires" subtitle="Mêmes genres" games={similar} />
      </div>
    </div>
  );
}
