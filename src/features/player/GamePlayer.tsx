import {
  ArrowLeft,
  Clock,
  Cpu,
  ExternalLink,
  Globe,
  Keyboard,
  Maximize,
  Minimize,
  Play,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {CoverImage, ExternalPlayLink} from '@/components/gaming/GameBits';
import {BrandLoader} from '@/components/ui/feedback';
import {cn} from '@/lib/cn';
import {LAUNCH_MODE_LABELS} from '@/lib/catalog';
import {decideLaunch} from '@/lib/embed';
import {ControlsList} from '@/features/game/ControlsList';
import {useHostedScoreBridge} from '@/features/player/useHostedScoreBridge';
import {getCartridgeCode} from '@/lib/prestige';
import {playClickPulse} from '@/lib/sound';
import type {Game} from '@/types/game';

/** Hosted games are first-party code from this repository (never user uploads). */
const SANDBOX_HOSTED = 'allow-scripts allow-same-origin allow-pointer-lock allow-modals';
/** Third-party embeds keep their own origin; popups only to open the provider's site. */
const SANDBOX_EMBED = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-pointer-lock';
const LOAD_TIMEOUT_MS = 20_000;
const HOSTED_MARKER = 'meta[name="euloge-arcade-game"]';

type PlayerState =
  | {phase: 'idle'}
  | {phase: 'loading'}
  | {phase: 'ready'}
  | {phase: 'error'; title: string; message: string};

function useIsPortraitPhone() {
  const query = '(orientation: portrait) and (max-width: 900px)';
  const [match, setMatch] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return match;
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Universal Holo-Deck Game Player.
 *  - Mode A (hosted): first-party HTML5 game served from /games/… on our origin.
 *  - Mode B (embed): iframe, for providers in the embed allowlist.
 *  - Mode C (external / console suite): can be played directly inside the platform via the
 *    built-in Holo-Cartridge Arcade Suite (/games/arcade-suite/index.html) or streamed via iframe,
 *    while also preserving the official external link.
 */
export function GamePlayer({game, autoStart = false}: {game: Game; autoStart?: boolean}) {
  const {catalog, recordLaunch} = usePlatform();
  const allowlist = catalog.status === 'ready' ? catalog.embedDomains : [];
  const decision = decideLaunch(game, allowlist);
  const cartridgeCode = getCartridgeCode(game);

  const arcadeSuiteUrl = `/games/arcade-suite/index.html?slug=${encodeURIComponent(game.slug)}&title=${encodeURIComponent(game.title)}&code=${encodeURIComponent(cartridgeCode)}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<PlayerState>({phase: 'idle'});
  const [engineMode, setEngineMode] = useState<'native' | 'stream'>('native');
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [ambilight, setAmbilight] = useState(true);
  const [sessionSec, setSessionSec] = useState(0);
  const [ignoreOrientation, setIgnoreOrientation] = useState(false);
  const portraitPhone = useIsPortraitPhone();
  const launchedRef = useRef(false);

  const isRunningFirstParty =
    decision.kind === 'hosted' ||
    ((decision.kind === 'external' || decision.kind === 'blocked') && engineMode === 'native');

  useHostedScoreBridge(game, iframeRef, isRunningFirstParty);

  const start = useCallback(
    (mode?: 'native' | 'stream') => {
      if (mode) setEngineMode(mode);
      setState({phase: 'loading'});
      setSessionSec(0);
      setAttempt((a) => a + 1);
      if (!launchedRef.current) {
        launchedRef.current = true;
        recordLaunch(game);
      }
    },
    [game, recordLaunch],
  );

  // Autostart when arriving from a "Jouer" button (?jouer=1)
  useEffect(() => {
    if (autoStart && decision.kind !== 'blocked' && state.phase === 'idle') {
      start('native');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, decision.kind]);

  // Live session timer while playing
  useEffect(() => {
    if (state.phase !== 'ready') return;
    const t = window.setInterval(() => setSessionSec((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [state.phase]);

  // Load timeout
  useEffect(() => {
    if (state.phase !== 'loading') return;
    const t = window.setTimeout(
      () =>
        setState({
          phase: 'error',
          title: 'Le jeu met trop de temps à répondre',
          message: 'Ta connexion est peut-être lente, ou le serveur du jeu ne répond pas. Tu peux réessayer.',
        }),
      LOAD_TIMEOUT_MS,
    );
    return () => window.clearTimeout(t);
  }, [state.phase, attempt]);

  const activeIframeSrc =
    decision.kind === 'hosted' || decision.kind === 'embed'
      ? decision.src
      : engineMode === 'stream' && decision.kind === 'external'
        ? decision.href
        : arcadeSuiteUrl;

  const onIframeLoad = () => {
    if (state.phase !== 'loading') return;
    if (isRunningFirstParty) {
      // With an SPA fallback, a missing game would silently load our own index.html.
      let found = false;
      try {
        found = Boolean(iframeRef.current?.contentDocument?.querySelector(HOSTED_MARKER));
      } catch {
        found = false;
      }
      if (!found) {
        setState({
          phase: 'error',
          title: 'Jeu introuvable',
          message: 'Les fichiers de ce jeu sont introuvables sur le serveur. Réessaie plus tard.',
        });
        return;
      }
    }
    setState({phase: 'ready'});
    // Give keyboard focus to the game right away.
    window.setTimeout(() => iframeRef.current?.focus(), 50);
  };

  // Fullscreen (real API, with a CSS "theater" fallback where it's unsupported, e.g. iPhone)
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => {
    if (!pseudoFullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPseudoFullscreen(false);
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [pseudoFullscreen]);

  const toggleFullscreen = async () => {
    if (fullscreen) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    if (pseudoFullscreen) {
      setPseudoFullscreen(false);
      return;
    }
    const el = containerRef.current;
    if (el && document.fullscreenEnabled && el.requestFullscreen) {
      try {
        await el.requestFullscreen({navigationUI: 'hide'});
        if (game.orientation === 'landscape') {
          const orientation = screen.orientation as ScreenOrientation & {lock?: (o: string) => Promise<void>};
          await orientation.lock?.('landscape').catch(() => {});
        }
        iframeRef.current?.focus();
        return;
      } catch {
        // fall through to pseudo fullscreen
      }
    }
    setPseudoFullscreen(true);
  };

  const exit = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setPseudoFullscreen(false);
    setState({phase: 'idle'});
  };

  // ---- Mode C / blocked while idle: no iframe until the player clicks Launch ----
  if ((decision.kind === 'external' || decision.kind === 'blocked') && state.phase === 'idle') {
    const blocked = decision.kind === 'blocked';
    return (
      <div className="holo-panel reticle-frame relative overflow-hidden rounded-3xl border border-line-soft">
        <CoverImage game={game} src={game.bannerUrl ?? game.coverUrl} className="aspect-video w-full opacity-35 sm:aspect-[21/9]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg/65 p-6 text-center backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="hud-tag text-accent-3">
              <Cpu size={12} /> CARTOUCHE // {cartridgeCode}
            </span>
            <span className="hud-tag">{LAUNCH_MODE_LABELS[game.launchMode]}</span>
          </div>
          {blocked ? (
            <>
              <TriangleAlert size={36} className="text-warning" />
              <p className="max-w-md font-semibold">{decision.reason}</p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => start('native')}
                  className="btn-primary h-12 px-6 text-base"
                  aria-label={`Lancer ${game.title}`}>
                  <Play size={18} className="fill-current" /> Jouer sur la plateforme (Console locale)
                </button>
                <Link to="/jeux" className="btn-secondary h-12 px-5">
                  <ArrowLeft size={16} /> Retour au catalogue
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="max-w-xl text-sm text-ink-muted">
                {game.launchMode === 'embed'
                  ? "Ce jeu peut être lancé directement dans la console Euloge Arcade ou ouvert sur son site officiel."
                  : "L'éditeur de ce jeu n'autorise pas son intégration directe, mais tu peux lancer sa cartouche Arcade directement dans la plateforme ou ouvrir son site officiel."}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => start('native')}
                  className="btn-primary h-12 px-6 text-base"
                  aria-label={`Lancer ${game.title}`}>
                  <Play size={20} className="fill-current" /> Jouer sur la plateforme
                </button>
                <button
                  type="button"
                  onClick={() => start('stream')}
                  className="btn-secondary h-12 px-4 text-sm"
                  title="Tenter d'intégrer le flux web externe dans le lecteur">
                  <Globe size={16} className="text-accent-3" /> Flux Web intégré
                </button>
                <ExternalPlayLink game={{...game, launchUrl: decision.href}} className="btn-secondary h-12 px-5 text-sm" />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---- Active Player (Modes A, B, and In-Platform Console for C) -----------
  const isFull = fullscreen || pseudoFullscreen;
  const needsRotate = game.orientation === 'landscape' && portraitPhone && !ignoreOrientation && state.phase !== 'idle';

  return (
    <div className="relative">
      {/* Dynamic Ambilight Halo behind the player frame */}
      {ambilight && !isFull && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] opacity-65 blur-2xl transition-opacity duration-700"
          style={{
            background:
              'radial-gradient(60% 60% at 25% 30%, rgb(var(--accent-3) / 0.32), transparent 70%), radial-gradient(60% 60% at 75% 70%, rgb(var(--accent-2) / 0.32), transparent 70%)',
          }}
        />
      )}

      <div
        ref={containerRef}
        className={cn(
          'relative overflow-hidden bg-black transition-shadow duration-500',
          isFull
            ? 'fixed inset-0 z-[90] h-[100dvh] w-screen rounded-none'
            : cn('rounded-3xl border border-line-soft shadow-card', ambilight && 'shadow-glow'),
          !isFull && game.orientation === 'portrait' && decision.kind === 'embed' && 'mx-auto max-w-[min(100%,calc(78vh*10/11))]',
        )}>
        <div
          className={cn(
            'relative w-full',
            isFull ? 'h-full' : game.orientation === 'portrait' && decision.kind === 'embed' ? 'aspect-[10/11]' : 'aspect-video',
          )}>
          {state.phase === 'idle' ? (
            <button type="button" onClick={() => start('native')} className="group absolute inset-0 block w-full" aria-label={`Lancer ${game.title}`}>
              <CoverImage game={game} src={game.bannerUrl ?? game.coverUrl} className="absolute inset-0 h-full w-full" eager />
              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />
              <span className="absolute left-4 top-4 hidden items-center gap-2 sm:flex">
                <span className="rounded-md border border-white/15 bg-black/60 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-accent-3 backdrop-blur">
                  SLOT PRÊT // {cartridgeCode}
                </span>
                <span className="rounded-md border border-white/15 bg-black/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-white/80 backdrop-blur">
                  {LAUNCH_MODE_LABELS[game.launchMode]}
                </span>
              </span>
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-3.5">
                <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-brand-gradient shadow-glow transition duration-300 group-hover:scale-110 group-focus-visible:scale-110">
                  <span className="absolute -inset-2 rounded-full border border-accent-3/40 opacity-0 transition group-hover:scale-110 group-hover:opacity-100" />
                  <Play size={34} className="ml-1 fill-white text-white" />
                </span>
                <span className="font-display text-lg font-bold text-white sm:text-xl">Jouer à {game.title}</span>
                <span className="font-mono text-[11px] uppercase tracking-widest text-white/70">
                  Cliquer pour insérer et démarrer la session
                </span>
              </span>
            </button>
          ) : (
            <iframe
              key={`${attempt}-${engineMode}`}
              ref={iframeRef}
              src={activeIframeSrc}
              title={`${game.title} — jeu`}
              className={cn('absolute inset-0 h-full w-full border-0 transition-opacity duration-500', state.phase === 'ready' ? 'opacity-100' : 'opacity-0')}
              sandbox={isRunningFirstParty ? SANDBOX_HOSTED : SANDBOX_EMBED}
              allow="fullscreen; gamepad; autoplay"
              referrerPolicy="strict-origin-when-cross-origin"
              loading="eager"
              onLoad={onIframeLoad}
            />
          )}

          {state.phase === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg">
              <BrandLoader label={`Chargement de ${game.title}…`} />
            </div>
          )}

          {state.phase === 'error' && (
            <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/95 p-6 text-center">
              <TriangleAlert size={36} className="text-warning" />
              <h3 className="font-display text-lg font-bold">{state.title}</h3>
              <p className="max-w-md text-sm text-ink-muted">{state.message}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button type="button" className="btn-primary" onClick={() => start(engineMode)}>
                  <RefreshCw size={16} /> Réessayer
                </button>
                {game.sourceUrl && (
                  <a href={game.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                    Site officiel <ExternalLink size={14} />
                  </a>
                )}
                <Link to="/jeux" className="btn-ghost">
                  <ArrowLeft size={16} /> Catalogue
                </Link>
              </div>
            </div>
          )}

          {needsRotate && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-bg/95 p-6 text-center">
              <Smartphone size={40} className="rotate-90 text-accent-3" />
              <p className="font-semibold">Tourne ton téléphone à l'horizontale</p>
              <p className="text-sm text-ink-muted">Ce jeu est conçu pour le format paysage.</p>
              <button type="button" className="btn-ghost" onClick={() => setIgnoreOrientation(true)}>
                Jouer quand même
              </button>
            </div>
          )}

          {showControls && game.controls.length > 0 && (
            <div className="glass absolute bottom-14 right-3 z-20 max-h-[70%] w-72 overflow-auto rounded-xl p-4">
              <ControlsList controls={game.controls} compact />
            </div>
          )}
        </div>

        {/* Toolbar */}
        {state.phase !== 'idle' && (
          <div className={cn('flex items-center justify-between gap-2 bg-surface/95 px-3 py-2 border-t border-line-soft', isFull && 'absolute inset-x-0 bottom-0 z-30 bg-bg/80 backdrop-blur')}>
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" onClick={exit} className="btn-ghost h-9 min-h-0 px-2.5 text-xs" aria-label="Quitter le jeu">
                <X size={16} /> <span className="hidden sm:inline">Quitter</span>
              </button>
              <button type="button" onClick={() => start(engineMode)} className="btn-ghost h-9 min-h-0 px-2.5 text-xs" aria-label="Redémarrer le jeu">
                <RotateCcw size={16} /> <span className="hidden sm:inline">Redémarrer</span>
              </button>
              {state.phase === 'ready' && (
                <span className="hud-tag hidden sm:inline-flex" title="Durée de la session en cours">
                  <Clock size={11} className="text-accent-3" /> {formatClock(sessionSec)}
                </span>
              )}
              <p className={cn('hidden truncate text-xs text-ink-faint', game.orientation !== 'portrait' && 'lg:block')}>
                Clique dans le jeu pour le contrôler au clavier{isFull ? ' · Échap pour quitter le plein écran' : ''}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {decision.kind === 'external' && (
                <button
                  type="button"
                  onClick={() => {
                    playClickPulse();
                    start(engineMode === 'native' ? 'stream' : 'native');
                  }}
                  className="btn-ghost h-9 min-h-0 px-2.5 text-xs text-accent-3"
                  title="Basculer entre la Cartouche Console Native et le Flux Web Direct">
                  <Cpu size={14} />
                  <span className="hidden md:inline">
                    {engineMode === 'native' ? 'Mode : Console Native' : 'Mode : Flux Web'}
                  </span>
                </button>
              )}
              {!isFull && (
                <button
                  type="button"
                  onClick={() => {
                    playClickPulse();
                    setAmbilight((a) => !a);
                  }}
                  aria-pressed={ambilight}
                  className={cn('btn-ghost hidden h-9 min-h-0 px-2.5 text-xs md:inline-flex', ambilight && 'text-accent-3')}
                  title="Basculer le rétroéclairage Halo Ambilight">
                  <Sparkles size={15} /> <span className="hidden lg:inline">Halo</span>
                </button>
              )}
              {game.controls.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowControls((s) => !s)}
                  aria-expanded={showControls}
                  className="btn-ghost h-9 min-h-0 px-2.5 text-xs">
                  <Keyboard size={16} /> <span className="hidden sm:inline">Commandes</span>
                </button>
              )}
              {(decision.kind === 'embed' || decision.kind === 'external') && game.sourceUrl && (
                <a href={game.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost h-9 min-h-0 px-2.5 text-xs">
                  <ExternalLink size={16} /> <span className="hidden sm:inline">Site officiel</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                className="btn-secondary h-9 min-h-0 px-3 text-xs"
                aria-label={isFull ? 'Quitter le plein écran' : 'Plein écran'}>
                {isFull ? <Minimize size={16} /> : <Maximize size={16} />}
                <span className="hidden sm:inline">{isFull ? 'Réduire' : 'Plein écran'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
