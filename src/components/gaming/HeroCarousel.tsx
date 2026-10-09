import {Info, Pause, Play, PlayCircle} from 'lucide-react';
import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {
  AvailabilityBadge,
  CompatibilityIcons,
  CoverImage,
  ExternalPlayLink,
  FavoriteButton,
  GenreBadges,
} from '@/components/gaming/GameBits';
import {useReducedMotion} from '@/hooks/useReducedMotion';
import {cn} from '@/lib/cn';
import type {Game} from '@/types/game';

const AUTOPLAY_MS = 7000;

/**
 * Immersive featured-games hero: crossfading slides with a slow Ken Burns drift,
 * staggered text reveal and thumbnail navigation. Autoplay pauses on hover/focus,
 * can be paused explicitly, and is off under reduced motion.
 */
export function HeroCarousel({games}: {games: Game[]}) {
  const reduced = useReducedMotion();
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

  return (
    <section
      aria-roledescription="carrousel"
      aria-label="Jeux à la une"
      className="relative isolate overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}>
      {/* Slides (backgrounds) */}
      <div className="absolute inset-0 -z-10">
        {games.map((g, i) => {
          // Only the current and next banners are mounted: no hidden slide downloads.
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
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/80 to-bg/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-bg/40" />
      </div>

      <div className="container-page flex min-h-[520px] flex-col justify-end pb-10 pt-24 sm:min-h-[600px] lg:min-h-[640px]">
        <div key={active.id} className="max-w-2xl" aria-live={autoplay ? 'off' : 'polite'}>
          <div className="mb-4 flex animate-fade-up flex-wrap items-center gap-2">
            <span className="rounded-md bg-brand-gradient px-2 py-0.5 text-[11px] font-black uppercase tracking-widest text-white">
              À la une
            </span>
            <AvailabilityBadge game={active} />
            <GenreBadges game={active} max={3} />
          </div>
          <h1
            className="animate-fade-up font-display text-4xl font-black leading-[1.05] sm:text-6xl lg:text-7xl"
            style={{animationDelay: '80ms'}}>
            {active.title}
          </h1>
          <p className="mt-4 max-w-xl animate-fade-up text-base text-ink-muted sm:text-lg" style={{animationDelay: '160ms'}}>
            {active.tagline}
          </p>
          <div className="mt-6 flex animate-fade-up flex-wrap items-center gap-3" style={{animationDelay: '240ms'}}>
            {active.launchMode === 'external' ? (
              <ExternalPlayLink game={active} className="btn-primary h-12 px-6 text-base">
                <PlayCircle size={20} /> Jouer maintenant
              </ExternalPlayLink>
            ) : (
              <Link to={`/jeux/${active.slug}?jouer=1`} className="btn-primary h-12 px-6 text-base">
                <Play size={20} className="fill-current" /> Jouer maintenant
              </Link>
            )}
            <Link to={`/jeux/${active.slug}`} className="btn-secondary h-12 px-5">
              <Info size={18} /> Détails
            </Link>
            <FavoriteButton game={active} size="lg" />
            <div className="ml-1">
              <CompatibilityIcons game={active} withLabels />
            </div>
          </div>
        </div>

        {/* Thumbnails / pagination */}
        {games.length > 1 && (
          <div className="mt-10 flex items-center gap-3">
            <div className="flex gap-3 overflow-x-auto pb-1" role="tablist" aria-label="Choisir un jeu à la une">
              {games.map((g, i) => (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`${g.title} (${i + 1} sur ${games.length})`}
                  onClick={() => setIndex(i)}
                  className={cn(
                    'group relative h-14 w-24 shrink-0 overflow-hidden rounded-lg ring-2 transition sm:h-16 sm:w-28',
                    i === index ? 'ring-accent-3' : 'opacity-60 ring-transparent hover:opacity-100',
                  )}>
                  <CoverImage game={g} className="h-full w-full" />
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
