import {Cpu, Eye, Info, Keyboard, Pause, Play, Sparkles} from 'lucide-react';
import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {
  AvailabilityBadge,
  CompatibilityIcons,
  CoverImage,
  FavoriteButton,
  GenreBadges,
} from '@/components/gaming/GameBits';
import {useReducedMotion} from '@/hooks/useReducedMotion';
import {cn} from '@/lib/cn';
import {LAUNCH_MODE_LABELS} from '@/lib/catalog';
import {getCartridgeCode} from '@/lib/prestige';
import {playClickPulse} from '@/lib/sound';
import type {Game} from '@/types/game';

const AUTOPLAY_MS = 7000;

/**
 * Holo-Stage Hero Carousel:
 * - Crossfading atmospheric banners with slow Ken Burns drift
 * - Dual-zone layout on desktop: Editorial Briefing (left) + 3D Floating Cartridge HUD Card (right)
 * - Numbered Cartridge Dock pagination (`01`, `02`, `03`) with laser progress bar
 */
export function HeroCarousel({games}: {games: Game[]}) {
  const reduced = useReducedMotion();
  const {setInspectGame} = usePlatform();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const autoplay = !reduced && !paused && !hovered && games.length > 1;
  // Slides already shown stay mounted so going back doesn't flash.
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
  useEffect(() => setVisited((v) => (v.has(index) ? v : new Set(v).add(index))), [index]);

  useEffect(() => {
    if (!autoplay) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % games.length), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [autoplay, index, games.length]);

  if (games.length === 0) return null;
  const active = games[Math.min(index, games.length - 1)];
  const code = getCartridgeCode(active);

  return (
    <section
      aria-roledescription="carrousel"
      aria-label="Jeux à la une"
      className="hero-carousel relative isolate overflow-hidden border-b border-line-soft"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}>
      {/* Slides (backgrounds) */}
      <div className="absolute inset-0 -z-10">
        {games.map((g, i) => {
          const near = i === index || i === (index + 1) % games.length;
          if (!near && !visited.has(i)) return null;
          return (
            <div
              key={g.id}
              aria-hidden={i !== index}
              className={cn('absolute inset-0 transition-opacity duration-1000', i === index ? 'opacity-100' : 'opacity-0')}>
              <CoverImage
                game={g}
                src={g.bannerUrl ?? g.coverUrl}
                eager={i === 0}
                className={cn('h-full w-full', i === index && !reduced && 'animate-ken-burns')}
              />
            </div>
          );
        })}
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-bg/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/20 to-bg/50" />
      </div>

      <div className="container-page flex min-h-[540px] flex-col justify-end pb-10 pt-24 sm:min-h-[610px] lg:min-h-[660px]">
        <div className="grid items-end gap-8 lg:grid-cols-[1fr_360px]">
          {/* Left: Featured Editorial & Launch Controls */}
          <div key={active.id} className="min-w-0 max-w-2xl" aria-live={autoplay ? 'off' : 'polite'}>
            <div className="mb-4 flex animate-fade-up flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-gradient px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-white shadow-glow">
                <Sparkles size={12} aria-hidden /> À la une
              </span>
              <span className="hud-tag">
                <Cpu size={11} className="text-accent-3" aria-hidden /> {code} // SLOT 0{index + 1}
              </span>
              <AvailabilityBadge game={active} />
              <GenreBadges game={active} max={3} />
            </div>
            <h1
              className="animate-fade-up font-display text-4xl font-black leading-[1.03] sm:text-6xl lg:text-7xl"
              style={{animationDelay: '80ms'}}>
              {active.title}
            </h1>
            <p
              className="mt-4 max-w-xl animate-fade-up text-base leading-relaxed text-ink-muted sm:text-lg"
              style={{animationDelay: '160ms'}}>
              {active.tagline}
            </p>
            <div className="mt-6 flex animate-fade-up flex-wrap items-center gap-3" style={{animationDelay: '240ms'}}>
              <Link to={`/jeux/${active.slug}?jouer=1`} className="btn-primary h-12 px-6 text-base">
                <Play size={20} className="fill-current" /> Jouer maintenant
              </Link>
              <Link to={`/jeux/${active.slug}`} className="btn-secondary h-12 px-5">
                <Info size={18} /> Détails
              </Link>
              <button
                type="button"
                onClick={() => {
                  playClickPulse();
                  setInspectGame(active);
                }}
                className="btn-secondary h-12 px-4"
                aria-label={`Inspecter la cartouche ${active.title}`}>
                <Eye size={18} /> <span className="hidden sm:inline">Inspecter</span>
              </button>
              <FavoriteButton game={active} size="lg" />
              <div className="ml-1">
                <CompatibilityIcons game={active} withLabels />
              </div>
            </div>
          </div>

          {/* Right: Floating 3D Holo-Cartridge Telemetry Card (Desktop) */}
          <div key={`telemetry-${active.id}`} className="hidden animate-fade-up lg:block" style={{animationDelay: '200ms'}}>
            <div className="holo-panel reticle-frame rounded-3xl p-4 shadow-card">
              <div className="mb-2.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-ink-faint">
                <span className="text-accent-3 font-bold">CARTOUCHE ACTIVE // {code}</span>
                <span>{LAUNCH_MODE_LABELS[active.launchMode]}</span>
              </div>
              <div className="relative overflow-hidden rounded-2xl border border-line-soft">
                <CoverImage game={active} eager className="aspect-[16/10] w-full" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-surface via-surface/70 to-transparent p-3">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-accent-3">
                    {active.developer ?? 'Création originale / Officiel'}
                  </p>
                  <p className="truncate font-display text-sm font-bold text-ink">{active.title}</p>
                </div>
              </div>

              {active.controls.length > 0 && (
                <div className="mt-3 space-y-1.5 rounded-xl bg-surface/65 p-3 text-xs border border-line-soft">
                  <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                    <Keyboard size={12} className="text-accent-3" /> Commandes rapides
                  </p>
                  {active.controls.slice(0, 3).map((c) => (
                    <div key={c.input + c.action} className="flex items-center justify-between gap-2 text-[11px]">
                      <kbd className="rounded border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink border-line-soft">
                        {c.input}
                      </kbd>
                      <span className="truncate text-ink-muted">{c.action}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Numbered Cartridge Dock / Pagination */}
        {games.length > 1 && (
          <div className="mt-10 flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto pb-1" role="tablist" aria-label="Choisir un jeu à la une">
              {games.map((g, i) => (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`${g.title} (${i + 1} sur ${games.length})`}
                  onClick={() => {
                    playClickPulse();
                    setIndex(i);
                  }}
                  className={cn(
                    'group relative flex h-16 w-44 shrink-0 items-center gap-2.5 overflow-hidden rounded-xl border p-1.5 text-left transition sm:w-52',
                    i === index
                      ? 'border-accent-3 bg-surface/90 shadow-glow'
                      : 'border-line-soft bg-surface/50 opacity-70 hover:opacity-100',
                  )}>
                  <CoverImage game={g} className="h-full w-16 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 pr-1">
                    <span className="block font-mono text-[10px] font-bold text-accent-3">
                      SLOT 0{i + 1}
                    </span>
                    <span className="block truncate font-display text-xs font-bold text-ink">
                      {g.title}
                    </span>
                  </div>
                  {i === index && autoplay && (
                    <span
                      key={`p-${index}`}
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-1 origin-left bg-accent-3"
                      style={{animation: `progress ${AUTOPLAY_MS}ms linear both`}}
                    />
                  )}
                </button>
              ))}
            </div>
            {!reduced && (
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                className="btn-ghost h-10 min-h-0 w-10 px-0"
                aria-label={paused ? 'Reprendre le défilement' : 'Mettre en pause le défilement'}>
                {paused ? <Play size={16} /> : <Pause size={16} />}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
