import {Info, Play} from 'lucide-react';
import {useRef, type PointerEvent} from 'react';
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

/**
 * Interactive game card: 3D tilt + light sheen that follow the pointer (written
 * to CSS variables, no React re-render), actions revealed on hover/focus.
 * Tilt is disabled under reduced motion and on touch devices.
 */
export function GameCard({game, className, eager = false}: {game: Game; className?: string; eager?: boolean}) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  const onMove = (e: PointerEvent<HTMLElement>) => {
    if (reduced || e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    ref.current.style.setProperty('--rx', `${(0.5 - y) * 9}deg`);
    ref.current.style.setProperty('--ry', `${(x - 0.5) * 11}deg`);
    ref.current.style.setProperty('--mx', `${x * 100}%`);
    ref.current.style.setProperty('--my', `${y * 100}%`);
  };
  const onLeave = () => {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  };

  const unavailable = game.linkStatus === 'broken';
  const detailsHref = `/jeux/${game.slug}`;

  return (
    <article
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cn('group relative [perspective:900px]', className)}
      style={{['--rx' as string]: '0deg', ['--ry' as string]: '0deg'}}>
      <div
        className={cn(
          'game-card-shell relative overflow-hidden rounded-2xl border bg-surface shadow-card transition-[transform,box-shadow] duration-300 ease-out border-line-soft',
          '[transform:rotateX(var(--rx))_rotateY(var(--ry))] [transform-style:preserve-3d]',
          'group-hover:-translate-y-1 group-hover:shadow-glow group-focus-within:shadow-glow',
        )}>
        <Link to={detailsHref} className="block focus-visible:outline-none" aria-label={`${game.title} — voir la fiche`}>
          <div className="relative">
            <CoverImage game={game} eager={eager} className="aspect-[16/10] w-full" sizes="(min-width: 1024px) 25vw, 50vw" />
            {/* Pointer-following light sheen */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{
                background:
                  'radial-gradient(28rem circle at var(--mx, 50%) var(--my, 0%), rgb(var(--accent-3) / 0.22), transparent 45%)',
              }}
            />
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-surface via-surface/50 to-transparent" />
            <AvailabilityBadge game={game} className="absolute left-3 top-3 backdrop-blur" />
          </div>
          <div className="relative -mt-8 px-4 pb-4">
            <h3 className="truncate font-display text-lg font-bold">{game.title}</h3>
            <p className="mt-0.5 line-clamp-1 text-sm text-ink-muted">{game.tagline}</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <GenreBadges game={game} />
              <CompatibilityIcons game={game} />
            </div>
          </div>
        </Link>

        {/* Hover/focus revealed quick actions */}
        <div
          className={cn(
            'pointer-events-none absolute inset-x-3 top-[calc(62.5%-3.25rem)] flex translate-y-2 gap-2 opacity-0 transition duration-300',
            'group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100',
            'group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100',
          )}>
          {unavailable ? (
            <Link to={detailsHref} className="btn-secondary h-10 min-h-0 flex-1 text-xs">
              <Info size={15} /> Détails
            </Link>
          ) : game.launchMode === 'external' ? (
            <ExternalPlayLink game={game} className="btn-primary h-10 min-h-0 flex-1 text-xs" />
          ) : (
            <Link to={`${detailsHref}?jouer=1`} className="btn-primary h-10 min-h-0 flex-1 text-xs">
              <Play size={15} className="fill-current" /> Jouer
            </Link>
          )}
        </div>
      </div>
      <FavoriteButton game={game} className="absolute right-3 top-3 z-10" />
    </article>
  );
}
