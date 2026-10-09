import {useId} from 'react';
import {BRAND} from '@/config/brand';
import {cn} from '@/lib/cn';

/**
 * The "E" monogram: a chamfered frame with a geometric E whose middle bar is
 * detached from the spine (a data pulse). Same geometry as public/brand/*.svg.
 */
export function LogoMark({
  className,
  variant = 'color',
  glow = true,
  title = BRAND.name,
}: {
  className?: string;
  variant?: 'color' | 'mono';
  glow?: boolean;
  title?: string | null;
}) {
  const uid = useId().replace(/:/g, '');
  const grad = `ea-grad-${uid}`;
  const blur = `ea-glow-${uid}`;
  const fill = variant === 'mono' ? 'currentColor' : `url(#${grad})`;
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}>
      {variant === 'color' && (
        <defs>
          <linearGradient id={grad} x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="rgb(var(--accent-3))" />
            <stop offset=".5" stopColor="rgb(var(--accent))" />
            <stop offset="1" stopColor="rgb(var(--accent-2))" />
          </linearGradient>
          {glow && (
            <filter id={blur} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
        </defs>
      )}
      <path
        className="ea-logo-frame"
        d="M15 3.5H60.5V49L49 60.5H3.5V15Z"
        fill={variant === 'color' ? 'rgb(var(--surface))' : 'none'}
        stroke={fill}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <g fill={fill} filter={variant === 'color' && glow ? `url(#${blur})` : undefined}>
        <path className="ea-logo-e" d="M17 14H47L43 20.5H24V43.5H43L47 50H17Z" />
        <path className="ea-logo-pulse" d="M28 28.75H43.5L40 35.25H28Z" />
      </g>
    </svg>
  );
}

/** Mark + wordmark lockup used in the header, footer and admin. */
export function Logo({className, compact = false}: {className?: string; compact?: boolean}) {
  const [first, ...rest] = BRAND.wordmark.split(' ');
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className="h-9 w-9 shrink-0" title={null} />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-[15px] font-bold tracking-[0.18em] text-ink">
            {first} <span className="text-gradient">{rest.join(' ')}</span>
          </span>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-faint">
            {BRAND.signature}
          </span>
        </span>
      )}
      <span className="sr-only">{BRAND.name}</span>
    </span>
  );
}
