import {ChevronLeft, ChevronRight} from 'lucide-react';
import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {GameCard} from '@/components/gaming/GameCard';
import type {Game} from '@/types/game';

/** Horizontally scrollable shelf of game cards with snap + arrow controls. */
export function GameRail({
  title,
  subtitle,
  games,
  icon,
  seeAllHref,
}: {
  title: string;
  subtitle?: string;
  games: Game[];
  icon?: ReactNode;
  seeAllHref?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({start: true, end: true});

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4});
  }, []);

  useEffect(() => {
    update();
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, games.length]);

  if (games.length === 0) return null;

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({left: dir * el.clientWidth * 0.85, behavior: 'smooth'});
  };
  const headingId = `rail-${title.replace(/\W+/g, '-').toLowerCase()}`;

  return (
    <section aria-labelledby={headingId} className="container-page">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id={headingId} className="section-title flex items-center gap-2">
            {icon && <span className="text-accent-3">{icon}</span>}
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {seeAllHref && (
            <Link to={seeAllHref} className="btn-ghost h-9 min-h-0 px-3 text-xs">
              Tout voir
            </Link>
          )}
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            disabled={edges.start}
            className="btn-secondary hidden h-9 min-h-0 w-9 px-0 sm:inline-flex"
            aria-label={`Défiler ${title} vers la gauche`}>
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            disabled={edges.end}
            className="btn-secondary hidden h-9 min-h-0 w-9 px-0 sm:inline-flex"
            aria-label={`Défiler ${title} vers la droite`}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div
        ref={scroller}
        onScroll={update}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto scroll-smooth px-4 pb-4 pt-1 sm:scroll-px-6 lg:scroll-px-10 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 [&::-webkit-scrollbar]:hidden">
        {games.map((g) => (
          <GameCard key={g.id} game={g} className="w-[78%] shrink-0 snap-start sm:w-[45%] md:w-[31%] xl:w-[23.5%]" />
        ))}
      </div>
    </section>
  );
}

export function GameGrid({games}: {games: Game[]}) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {games.map((g, i) => (
        <GameCard key={g.id} game={g} eager={i < 4} className="animate-fade-up" />
      ))}
    </div>
  );
}
