import {Cpu, Eye, Info, Keyboard, Play, ShieldCheck, Trophy, X} from 'lucide-react';
import {useEffect} from 'react';
import {Link} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {
  AvailabilityBadge,
  CompatibilityIcons,
  CoverImage,
  FavoriteButton,
  GenreBadges,
} from '@/components/gaming/GameBits';
import {ControlsList} from '@/features/game/ControlsList';
import {LAUNCH_MODE_LABELS} from '@/lib/catalog';
import {getCartridgeCode} from '@/lib/prestige';
import {playClickPulse} from '@/lib/sound';
import type {Game} from '@/types/game';

export function GameQuickViewModal() {
  const {inspectGame, setInspectGame, history, runs} = usePlatform();

  useEffect(() => {
    if (!inspectGame) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInspectGame(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inspectGame, setInspectGame]);

  if (!inspectGame) return null;

  const game = inspectGame;
  const code = getCartridgeCode(game);
  const playCount = history.filter((h) => h.gameId === game.id).length;
  const myRuns = runs.filter((r) => r.gameId === game.id);
  const bestRun = myRuns.reduce<(typeof myRuns)[number] | null>((b, r) => (!b || r.score > b.score ? r : b), null);

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-bg/80 p-4 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quickview-title"
      onClick={() => setInspectGame(null)}>
      <div
        className="holo-panel reticle-frame relative max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-3xl p-5 sm:p-7"
        onClick={(e) => e.stopPropagation()}>
        {/* Top Console Header */}
        <div className="mb-4 flex items-center justify-between gap-3 border-b pb-3 border-line-soft">
          <div className="flex flex-wrap items-center gap-2">
            <span className="hud-tag text-accent-3">
              <Cpu size={12} aria-hidden /> CARTOUCHE // {code}
            </span>
            <AvailabilityBadge game={game} />
            <span className="hud-tag">{LAUNCH_MODE_LABELS[game.launchMode]}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              playClickPulse();
              setInspectGame(null);
            }}
            className="btn-ghost h-9 min-h-0 w-9 rounded-full px-0"
            aria-label="Fermer l'inspecteur de cartouche">
            <X size={18} />
          </button>
        </div>

        {/* Main Grid */}
        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          {/* Left: Cartridge Visual & Telemetry */}
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl border border-line-soft shadow-card">
              <CoverImage game={game} eager className="aspect-[16/10] w-full" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-surface via-surface/60 to-transparent p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-accent-3">
                  {game.developer ?? 'Éditeur officiel'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border bg-surface/60 p-3.5 border-line-soft space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Sessions lancées</span>
                <span className="font-mono font-bold text-ink">{playCount}</span>
              </div>
              {game.supportsScores && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-ink-muted">
                    <Trophy size={13} className="text-warning" /> Record personnel
                  </span>
                  <span className="font-mono font-bold text-ink">
                    {bestRun ? `${bestRun.score.toLocaleString('fr-FR')} pts` : 'Aucun'}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-ink-muted">
                  <ShieldCheck size={13} className="text-success" /> Format
                </span>
                <span className="font-mono text-ink">
                  {game.orientation === 'portrait' ? 'Portrait' : game.orientation === 'landscape' ? 'Paysage' : ' Universel'}
                </span>
              </div>
              <div className="pt-1 border-t border-line-soft">
                <CompatibilityIcons game={game} withLabels />
              </div>
            </div>
          </div>

          {/* Right: Details & Controls */}
          <div className="flex flex-col justify-between space-y-5">
            <div>
              <GenreBadges game={game} max={5} className="mb-2" />
              <h2 id="quickview-title" className="font-display text-2xl font-black sm:text-3xl">
                {game.title}
              </h2>
              <p className="mt-1 text-sm font-medium text-accent-3">{game.tagline}</p>
              <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-ink-muted">{game.description}</p>

              {game.controls.length > 0 && (
                <div className="mt-5 rounded-2xl border bg-surface-2/40 p-4 border-line-soft">
                  <h3 className="mb-3 flex items-center gap-2 font-display text-xs font-bold uppercase tracking-wider text-ink">
                    <Keyboard size={14} className="text-accent-3" /> Schéma des commandes vérifiées
                  </h3>
                  <ControlsList controls={game.controls.slice(0, 6)} compact />
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-line-soft">
              <Link
                to={`/jeux/${game.slug}?jouer=1`}
                onClick={() => setInspectGame(null)}
                className="btn-primary h-11 flex-1 px-5">
                <Play size={18} className="fill-current" /> Insérer &amp; Jouer
              </Link>
              <Link
                to={`/jeux/${game.slug}`}
                onClick={() => setInspectGame(null)}
                className="btn-secondary h-11 px-4">
                <Info size={16} /> Fiche complète
              </Link>
              <FavoriteButton game={game} size="lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Button to trigger the holographic cartridge quick-inspector. */
export function QuickInspectButton({game, className}: {game: Game; className?: string}) {
  const {setInspectGame} = usePlatform();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        playClickPulse();
        setInspectGame(game);
      }}
      title={`Inspecter la cartouche ${game.title}`}
      aria-label={`Aperçu rapide de ${game.title}`}
      className={className}>
      <Eye size={15} aria-hidden />
    </button>
  );
}
