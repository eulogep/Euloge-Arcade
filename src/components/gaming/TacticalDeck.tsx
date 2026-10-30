import {
  Award,
  CheckCircle2,
  Command,
  Cpu,
  Crosshair,
  Dices,
  Eye,
  Flame,
  Play,
  Radio,
  Sparkles,
  Zap,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {AvailabilityBadge, CoverImage, FavoriteButton} from '@/components/gaming/GameBits';
import {pickRandom} from '@/lib/catalog';
import {computePlayerPrestige, getCartridgeCode, getDailyProtocol} from '@/lib/prestige';
import {playClickPulse, playHoverTick} from '@/lib/sound';
import {cn} from '@/lib/cn';
import type {Game, Genre} from '@/types/game';

interface MoodOption {
  id: string;
  label: string;
  subtitle: string;
  genres: Genre[];
}

const MOODS: MoodOption[] = [
  {id: 'all', label: 'Toutes fréquences', subtitle: 'Catalogue complet', genres: []},
  {id: 'express', label: 'Pause Express', subtitle: 'Arcade & score immédiat', genres: ['arcade', 'platformer']},
  {id: 'adrenaline', label: 'Adrénaline Pure', subtitle: 'FPS, réflexes & combat', genres: ['fps', 'action']},
  {id: 'brain', label: 'Esprit Tactique', subtitle: 'Réflexion & stratégie', genres: ['puzzle', 'strategy', 'board']},
  {id: 'retro', label: 'Onde Rétro', subtitle: 'Classiques & nostalgie', genres: ['retro', 'sports', 'racing']},
];

export function TacticalDeck() {
  const {games, history, favorites, unlocked, runs, catalog, setInspectGame, setCommandPaletteOpen, setReflexLabOpen} =
    usePlatform();

  const totalAchievements = catalog.status === 'ready' ? catalog.achievements.length : 6;
  const validUnlockedCount =
    catalog.status === 'ready'
      ? unlocked.filter((u) => catalog.achievements.some((a) => a.id === u.id)).length
      : unlocked.length;

  const uniqueLaunched = useMemo(() => new Set(history.map((h) => h.gameId)), [history]);

  const prestige = useMemo(
    () =>
      computePlayerPrestige({
        uniqueGamesLaunched: uniqueLaunched.size,
        totalLaunches: history.length,
        favoriteCount: favorites.size,
        unlockedAchievements: validUnlockedCount,
        runs,
      }),
    [uniqueLaunched.size, history.length, favorites.size, validUnlockedCount, runs],
  );

  const daily = useMemo(
    () => getDailyProtocol(games, new Date(), uniqueLaunched, favorites),
    [games, uniqueLaunched, favorites],
  );

  const [selectedMood, setSelectedMood] = useState<string>('all');
  const [drawnGame, setDrawnGame] = useState<Game | null>(null);
  const [spinning, setSpinning] = useState(false);

  const playableGames = useMemo(() => games.filter((g) => g.linkStatus !== 'broken'), [games]);

  const spinRoulette = (moodId = selectedMood) => {
    const mood = MOODS.find((m) => m.id === moodId) ?? MOODS[0];
    const pool =
      mood.genres.length === 0
        ? playableGames
        : playableGames.filter((g) => g.genre.some((genre) => mood.genres.includes(genre)));
    const effectivePool = pool.length > 0 ? pool : playableGames;
    if (effectivePool.length === 0) return;

    playClickPulse();
    setSpinning(true);
    let ticks = 0;
    const interval = window.setInterval(() => {
      ticks++;
      playHoverTick();
      const temp = pickRandom(effectivePool);
      if (temp) setDrawnGame(temp);
      if (ticks >= 6) {
        window.clearInterval(interval);
        const finalPick = pickRandom(effectivePool.filter((g) => g.id !== drawnGame?.id)) ?? pickRandom(effectivePool);
        if (finalPick) setDrawnGame(finalPick);
        setSpinning(false);
      }
    }, 65);
  };

  const activeRouletteGame = drawnGame ?? daily?.spotlight ?? playableGames[0] ?? null;

  return (
    <section aria-label="Console de télémétrie et atelier tactique" className="container-page space-y-6">
      {/* Top Console Telemetry Bar */}
      <div className="holo-panel reticle-frame flex flex-col justify-between gap-4 rounded-2xl px-4 py-3.5 sm:flex-row sm:items-center sm:px-6">
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
          <Link
            to="/profil"
            onClick={() => playClickPulse()}
            className="group flex items-center gap-3 rounded-xl pr-2 transition hover:opacity-90">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient font-mono text-xs font-black text-white shadow-glow">
              N.{prestige.level}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-accent-3">
                  {prestige.rankBadge}
                </span>
                <span className="font-display text-sm font-bold text-ink group-hover:text-accent-3 transition-colors">
                  {prestige.rankTitle}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-brand-gradient transition-all duration-500"
                    style={{width: `${Math.max(8, prestige.progressPercent)}%`}}
                  />
                </div>
                <span className="font-mono text-[10px] text-ink-faint">{prestige.xp} XP</span>
              </div>
            </div>
          </Link>

          <div className="hidden h-7 w-px bg-ink/10 lg:block" aria-hidden />

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="hud-tag">
              <Cpu size={12} className="text-accent-3" /> {games.length} CARTOUCHES
            </span>
            <span className="hud-tag">
              <Award size={12} className="text-warning" /> {validUnlockedCount}/{totalAchievements} SUCCÈS
            </span>
            <span className="hud-tag hidden xl:inline-flex">
              <Flame size={12} className="text-success" /> {uniqueLaunched.size} EXPLORÉS
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              playClickPulse();
              setReflexLabOpen(true);
            }}
            className="btn-secondary h-9 min-h-0 px-3 text-xs">
            <Crosshair size={14} className="text-accent-3" /> Calibrer mes réflexes
          </button>
          <button
            type="button"
            onClick={() => {
              playClickPulse();
              setCommandPaletteOpen(true);
            }}
            className="btn-ghost h-9 min-h-0 border px-3 text-xs border-line-soft">
            <Command size={14} className="text-accent-3" /> Console <kbd className="ml-1 font-mono text-[10px] text-ink-faint">⌘K</kbd>
          </button>
        </div>
      </div>

      {/* Dual Interactive Deck: Daily Protocol + Mood Roulette */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Card 1: Daily Protocol */}
        {daily && (
          <div className="holo-panel reticle-frame flex min-w-0 flex-col justify-between rounded-3xl p-5 sm:p-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="hud-tag text-accent-3">
                  <Radio size={12} className="animate-pulse" /> FRÉQUENCE DU JOUR // {daily.dateKey}
                </span>
                {daily.completed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-bold text-success ring-1 ring-success/30">
                    <CheckCircle2 size={12} /> Protocole validé
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-bold text-accent-3">
                    <Zap size={12} /> +45 XP à la clé
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  to={`/jeux/${daily.spotlight.slug}`}
                  className="group relative block w-full shrink-0 overflow-hidden rounded-2xl border border-line-soft sm:w-44">
                  <CoverImage game={daily.spotlight} className="aspect-[16/10] w-full" />
                  <span className="absolute left-2 top-2 rounded bg-bg/85 px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent-3 backdrop-blur">
                    {getCartridgeCode(daily.spotlight)}
                  </span>
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <AvailabilityBadge game={daily.spotlight} />
                  </div>
                  <h2 className="font-display text-xl font-black leading-snug">
                    <Link to={`/jeux/${daily.spotlight.slug}`} className="hover:text-accent-3 transition-colors">
                      {daily.spotlight.title}
                    </Link>
                  </h2>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">{daily.missionDetail}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t pt-4 border-line-soft">
              <Link to={`/jeux/${daily.spotlight.slug}?jouer=1`} className="btn-primary h-10 min-h-0 px-4 text-xs">
                <Play size={14} className="fill-current" /> Lancer la mission
              </Link>
              <button
                type="button"
                onClick={() => {
                  playClickPulse();
                  setInspectGame(daily.spotlight);
                }}
                className="btn-secondary h-10 min-h-0 px-3 text-xs">
                <Eye size={14} /> Inspecter
              </button>
              <FavoriteButton game={daily.spotlight} />
            </div>
          </div>
        )}

        {/* Card 2: Tactical Mood Roulette */}
        <div className="holo-panel reticle-frame flex min-w-0 flex-col justify-between rounded-3xl p-5 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="hud-tag text-accent-3">
                <Sparkles size={12} /> TIRAGE TACTIQUE // SÉLECTEUR D'HUMEUR
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                SANS ALGORITHME OPAQUE
              </span>
            </div>

            {/* Mood Selector Chips */}
            <div className="mt-3.5 flex flex-wrap gap-1.5" role="group" aria-label="Choisir une humeur de jeu">
              {MOODS.map((m) => {
                const active = selectedMood === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedMood(m.id);
                      spinRoulette(m.id);
                    }}
                    className={cn(
                      'rounded-xl border px-2.5 py-1.5 text-left text-xs font-semibold transition border-line-soft',
                      active
                        ? 'border-accent-3/60 bg-accent/20 text-ink shadow-glow'
                        : 'bg-surface/60 text-ink-muted hover:bg-surface-2 hover:text-ink',
                    )}>
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Drawn Cartridge Display */}
            {activeRouletteGame && (
              <div
                className={cn(
                  'mt-4 flex items-center gap-3.5 rounded-2xl border bg-surface/65 p-3 transition border-line-soft',
                  spinning && 'scale-[0.99] opacity-80',
                )}>
                <CoverImage game={activeRouletteGame} className="h-16 w-24 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-accent-3">
                      {getCartridgeCode(activeRouletteGame)}
                    </span>
                    <AvailabilityBadge game={activeRouletteGame} />
                  </div>
                  <h3 className="mt-0.5 truncate font-display text-base font-bold text-ink">
                    {activeRouletteGame.title}
                  </h3>
                  <p className="truncate text-xs text-ink-muted">{activeRouletteGame.tagline}</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t pt-4 border-line-soft">
            <button
              type="button"
              onClick={() => spinRoulette(selectedMood)}
              disabled={spinning}
              className="btn-secondary h-10 min-h-0 px-4 text-xs">
              <Dices size={15} className={cn('text-accent-3', spinning && 'animate-spin')} />
              {spinning ? 'Calibrage…' : 'Tirer une autre cartouche'}
            </button>
            {activeRouletteGame && (
              <>
                <Link to={`/jeux/${activeRouletteGame.slug}?jouer=1`} className="btn-primary h-10 min-h-0 px-4 text-xs">
                  <Play size={14} className="fill-current" /> Jouer maintenant
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    playClickPulse();
                    setInspectGame(activeRouletteGame);
                  }}
                  className="btn-ghost h-10 min-h-0 px-2.5 text-xs"
                  aria-label={`Aperçu rapide de ${activeRouletteGame.title}`}>
                  <Eye size={15} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

