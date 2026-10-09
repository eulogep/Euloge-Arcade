import {ExternalLink, Gamepad2, Heart, Keyboard, MonitorPlay, Mouse, Smartphone, SquareArrowOutUpRight, TriangleAlert} from 'lucide-react';
import {useState} from 'react';
import {usePlatform} from '@/app/PlatformProvider';
import {cn} from '@/lib/cn';
import {GENRE_LABELS, LAUNCH_MODE_LABELS} from '@/lib/catalog';
import type {Game} from '@/types/game';

/** Lazy cover with a branded placeholder, fade-in on load and a graceful fallback. */
export function CoverImage({
  game,
  src,
  className,
  eager = false,
  sizes,
}: {
  game: Game;
  src?: string | null;
  className?: string;
  eager?: boolean;
  sizes?: string;
}) {
  const url = src === undefined ? game.coverUrl : src;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn('relative overflow-hidden bg-surface-2', className)}>
      {/* Placeholder: brand gradient + initial, visible until the image is decoded */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 flex items-center justify-center bg-gradient-to-br from-accent/30 via-surface-2 to-accent-2/30 transition-opacity duration-500',
          loaded && !failed ? 'opacity-0' : 'opacity-100',
        )}>
        <span className="font-display text-5xl font-black text-ink/20">{game.title.slice(0, 1)}</span>
      </div>
      {url && !failed && (
        <img
          src={url}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          sizes={sizes}
          // @ts-expect-error fetchpriority is valid HTML but missing from React 18 types
          fetchpriority={eager ? 'high' : 'auto'}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition duration-700',
            loaded ? 'scale-100 opacity-100' : 'scale-105 opacity-0',
          )}
        />
      )}
    </div>
  );
}

export function GenreBadges({game, max = 2, className}: {game: Game; max?: number; className?: string}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {game.genre.slice(0, max).map((g) => (
        <span key={g} className="rounded-md bg-ink/5 px-2 py-0.5 text-[11px] font-semibold text-ink-muted ring-1 ring-ink/10">
          {GENRE_LABELS[g]}
        </span>
      ))}
    </div>
  );
}

export function AvailabilityBadge({game, className}: {game: Game; className?: string}) {
  if (game.linkStatus === 'broken') {
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-md bg-danger/15 px-2 py-0.5 text-[11px] font-bold text-danger', className)}>
        <TriangleAlert size={12} /> Indisponible
      </span>
    );
  }
  const Icon = game.launchMode === 'external' ? SquareArrowOutUpRight : MonitorPlay;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold',
        game.launchMode === 'external' ? 'bg-ink/10 text-ink-muted' : 'bg-success/15 text-success',
        className,
      )}>
      <Icon size={12} /> {LAUNCH_MODE_LABELS[game.launchMode]}
    </span>
  );
}

const COMPAT = [
  {key: 'keyboard', label: 'Clavier', Icon: Keyboard},
  {key: 'mouse', label: 'Souris', Icon: Mouse},
  {key: 'gamepad', label: 'Manette', Icon: Gamepad2},
  {key: 'touch', label: 'Mobile', Icon: Smartphone},
] as const;

/** Only rendered when compatibility has been verified — no guessing. */
export function CompatibilityIcons({game, withLabels = false}: {game: Game; withLabels?: boolean}) {
  if (!game.compatibility.verified) return null;
  const supported = COMPAT.filter((c) => game.compatibility[c.key]);
  if (supported.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Compatibilité vérifiée">
      {supported.map(({key, label, Icon}) => (
        <li key={key} className="inline-flex items-center gap-1 text-ink-muted" title={`${label} (vérifié)`}>
          <Icon size={15} aria-hidden />
          <span className={withLabels ? 'text-xs font-medium' : 'sr-only'}>{label}</span>
        </li>
      ))}
    </ul>
  );
}

export function FavoriteButton({game, className, size = 'md'}: {game: Game; className?: string; size?: 'md' | 'lg'}) {
  const {favorites, toggleFavorite} = usePlatform();
  const active = favorites.has(game.id);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggleFavorite(game);
      }}
      aria-pressed={active}
      aria-label={active ? `Retirer ${game.title} des favoris` : `Ajouter ${game.title} aux favoris`}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition active:scale-90',
        size === 'lg' ? 'h-11 w-11' : 'h-9 w-9',
        active
          ? 'bg-danger/20 text-danger ring-1 ring-danger/50'
          : 'glass text-ink-muted hover:text-ink',
        className,
      )}>
      <Heart size={size === 'lg' ? 20 : 16} className={cn(active && 'fill-current')} />
    </button>
  );
}

/** External launch link: always a new tab, never passes our referrer or window handle. */
export function ExternalPlayLink({
  game,
  className,
  children,
  onLaunch,
}: {
  game: Game;
  className?: string;
  children?: React.ReactNode;
  onLaunch?: () => void;
}) {
  const {recordLaunch} = usePlatform();
  return (
    <a
      href={game.launchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        recordLaunch(game);
        onLaunch?.();
      }}>
      {children ?? (
        <>
          Ouvrir le jeu <ExternalLink size={16} aria-hidden />
        </>
      )}
      <span className="sr-only"> (ouvre le site officiel dans un nouvel onglet)</span>
    </a>
  );
}
