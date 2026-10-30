import {Cpu, Play} from 'lucide-react';
import {useRef, type PointerEvent} from 'react';
import {Link} from 'react-router-dom';
import {
  AvailabilityBadge,
  CompatibilityIcons,
  CoverImage,
  FavoriteButton,
  GenreBadges,
} from '@/components/gaming/GameBits';
import {QuickInspectButton} from '@/components/gaming/GameQuickViewModal';
import {useReducedMotion} from '@/hooks/useReducedMotion';
import {cn} from '@/lib/cn';
import {getCartridgeCode} from '@/lib/prestige';
import {playHoverTick} from '@/lib/sound';
import type {Game} from '@/types/game';

/**
 * Interactive Holo-Cartridge game card:
 * - Hardware cartridge header strip with serial code (`EA-XXX`) and live status LED
 * - 3D tilt + holographic foil glare that follow the pointer (written to CSS variables)
 * - Quick actions + 1-click Cartridge Inspector revealed on hover/focus
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
  const onEnter = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') playHoverTick();
  };
  const onLeave = () => {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  };

  const unavailable = game.linkStatus === 'broken';
  const detailsHref = `/jeux/${game.slug}`;
  const cartridgeCode = getCartridgeCode(game);

  return (
    <article
      ref={ref}
      onPointerEnter={onEnter}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cn('group relative [perspective:950px]', className)}
      style={{['--rx' as string]: '0deg', ['--ry' as string]: '0deg'}}>
      <div
        className={cn(
          'game-card-shell relative overflow-hidden rounded-2xl border bg-surface shadow-card transition-[transform,box-shadow,border-color] duration-300 ease-out border-line-soft',
          '[transform:rotateX(var(--rx))_rotateY(var(--ry))] [transform-style:preserve-3d]',
          'group-hover:-translate-y-1.5 group-hover:shadow-glow group-focus-within:shadow-glow',
        )}>
        {/* Top Cartridge Hardware Notch */}
        <div
          aria-hidden
          className="flex items-center justify-between border-b bg-surface-2/70 px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] text-ink-faint border-line-soft">
          <span className="inline-flex items-center gap-1.5 font-bold text-ink-muted">
            <Cpu size={11} className="text-accent-3" /> {cartridgeCode}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                unavailable ? 'bg-danger' : game.launchMode === 'external' ? 'bg-accent-3' : 'bg-success',
              )}
            />
            <span>{game.launchMode === 'hosted' ? 'SLOT-A' : game.launchMode === 'embed' ? 'SLOT-B' : 'EXT-LINK'}</span>
          </span>
        </div>

        <Link to={detailsHref} className="block focus-visible:outline-none" aria-label={`${game.title} — voir la fiche`}>
          <div className="relative">
            <CoverImage game={game} eager={eager} className="aspect-[16/10] w-full" sizes="(min-width: 1024px) 25vw, 50vw" />
            {/* Pointer-following holographic foil sheen */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{
                background:
                  'radial-gradient(26rem circle at var(--mx, 50%) var(--my, 0%), rgb(var(--accent-3) / 0.26), rgb(var(--accent-2) / 0.1) 35%, transparent 55%)',
              }}
            />
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-surface via-surface/55 to-transparent" />
            <AvailabilityBadge game={game} className="absolute left-3 top-3 backdrop-blur-md" />
          </div>
          <div className="relative -mt-7 px-4 pb-4">
            <h3 className="truncate font-display text-lg font-bold group-hover:text-accent-3 transition-colors">{game.title}</h3>
            <p className="mt-0.5 line-clamp-1 text-sm text-ink-muted">{game.tagline}</p>
            <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5 border-line-soft">
              <GenreBadges game={game} />
              <CompatibilityIcons game={game} />
            </div>
          </div>
        </Link>

        {/* Hover/focus revealed quick actions */}
        <div
          className={cn(
            'pointer-events-none absolute inset-x-3 top-[calc(62.5%-2.25rem)] flex translate-y-2 gap-1.5 opacity-0 transition duration-300',
            'group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100',
            'group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100',
          )}>
          <Link to={`${detailsHref}?jouer=1`} className="btn-primary h-9 min-h-0 flex-1 text-xs">
            <Play size={14} className="fill-current" /> Jouer
          </Link>
          <QuickInspectButton game={game} className="btn-secondary h-9 min-h-0 w-9 shrink-0 px-0" />
        </div>
      </div>
      <FavoriteButton game={game} className="absolute right-3 top-10 z-10" />
    </article>
  );
}
