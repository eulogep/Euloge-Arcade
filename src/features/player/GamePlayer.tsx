import {
  ArrowLeft,
  ExternalLink,
  Keyboard,
  Maximize,
  Minimize,
  Play,
  RefreshCw,
  RotateCcw,
  Smartphone,
  TriangleAlert,
  X,
} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {CoverImage, ExternalPlayLink} from '@/components/gaming/GameBits';
import {BrandLoader} from '@/components/ui/feedback';
import {cn} from '@/lib/cn';
import {decideLaunch} from '@/lib/embed';
import {ControlsList} from '@/features/game/ControlsList';
import {useHostedScoreBridge} from '@/features/player/useHostedScoreBridge';
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

/**
 * Universal game player.
 *  - Mode A (hosted): first-party HTML5 game served from /games/… on our origin.
 *  - Mode B (embed): iframe, only for providers in the embed allowlist.
 *  - Mode C (external): never framed; a clear button opens the official site.
 */
export function GamePlayer({game, autoStart = false}: {game: Game; autoStart?: boolean}) {
  const {catalog, recordLaunch} = usePlatform();
  const allowlist = catalog.status === 'ready' ? catalog.embedDomains : [];
  const decision = decideLaunch(game, allowlist);

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<PlayerState>({phase: 'idle'});
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [ignoreOrientation, setIgnoreOrientation] = useState(false);
  const portraitPhone = useIsPortraitPhone();
  const launchedRef = useRef(false);

  useHostedScoreBridge(game, iframeRef, decision.kind === 'hosted');

  const start = useCallback(() => {
    setState({phase: 'loading'});
    setAttempt((a) => a + 1);
    if (!launchedRef.current) {
      launchedRef.current = true;
      recordLaunch(game);
    }
  }, [game, recordLaunch]);

  // Autostart (from a "Jouer" button elsewhere) for in-platform modes only.
  useEffect(() => {
    if (autoStart && (decision.kind === 'hosted' || decision.kind === 'embed') && state.phase === 'idle') start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, decision.kind]);

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

  const onIframeLoad = () => {
    if (state.phase !== 'loading') return;
    if (decision.kind === 'hosted') {
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

  // ---- Mode C / blocked: no iframe at all ---------------------------------
  if (decision.kind === 'external' || decision.kind === 'blocked') {
    const blocked = decision.kind === 'blocked';
    return (
      <div className="relative overflow-hidden rounded-2xl border border-line-soft">
        <CoverImage game={game} src={game.bannerUrl ?? game.coverUrl} className="aspect-video w-full opacity-40 sm:aspect-[21/9]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg/60 p-6 text-center backdrop-blur-sm">
          {blocked ? (
            <>
              <TriangleAlert size={36} className="text-warning" />
              <p className="max-w-md font-semibold">{decision.reason}</p>
              <Link to="/jeux" className="btn-secondary">
                <ArrowLeft size={16} /> Retour au catalogue
              </Link>
            </>
          ) : (
            <>
              <p className="max-w-lg text-sm text-ink-muted">
                {game.launchMode === 'embed'
                  ? "Ce jeu ne peut pas être affiché ici pour le moment. Il s'ouvre sur son site officiel."
                  : "L'éditeur de ce jeu n'autorise pas son intégration sur d'autres sites. Il s'ouvre dans un nouvel onglet, sur son site officiel."}
              </p>
              <ExternalPlayLink game={{...game, launchUrl: decision.href}} className="btn-primary h-12 px-6 text-base" />
            </>
          )}
        </div>
      </div>
    );
  }

  // ---- Modes A & B ----------------------------------------------------------
  const isFull = fullscreen || pseudoFullscreen;
  const needsRotate = game.orientation === 'landscape' && portraitPhone && !ignoreOrientation && state.phase !== 'idle';

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden bg-black',
        isFull ? 'fixed inset-0 z-[90] h-[100dvh] w-screen rounded-none' : 'rounded-2xl border border-line-soft shadow-card',
        // Portrait games (e.g. the 10:11 Lichess widget) get a centered, height-bounded frame.
        !isFull && game.orientation === 'portrait' && 'mx-auto max-w-[min(100%,calc(78vh*10/11))]',
      )}>
      <div className={cn('relative w-full', isFull ? 'h-full' : game.orientation === 'portrait' ? 'aspect-[10/11]' : 'aspect-video')}>
        {state.phase === 'idle' ? (
          <button type="button" onClick={start} className="group absolute inset-0 block w-full" aria-label={`Lancer ${game.title}`}>
            <CoverImage game={game} src={game.bannerUrl ?? game.coverUrl} className="absolute inset-0 h-full w-full" eager />
            <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-gradient shadow-glow transition group-hover:scale-110 group-focus-visible:scale-110">
                <Play size={34} className="ml-1 fill-white text-white" />
              </span>
              <span className="font-display text-lg font-bold text-white">Jouer à {game.title}</span>
            </span>
          </button>
        ) : (
          <iframe
            key={attempt}
            ref={iframeRef}
            src={decision.src}
            title={`${game.title} — jeu`}
            className={cn('absolute inset-0 h-full w-full border-0 transition-opacity duration-500', state.phase === 'ready' ? 'opacity-100' : 'opacity-0')}
            sandbox={decision.kind === 'hosted' ? SANDBOX_HOSTED : SANDBOX_EMBED}
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
              <button type="button" className="btn-primary" onClick={start}>
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
        <div className={cn('flex items-center justify-between gap-2 bg-surface/95 px-3 py-2', isFull && 'absolute inset-x-0 bottom-0 z-30 bg-bg/80 backdrop-blur')}>
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={exit} className="btn-ghost h-9 min-h-0 px-2.5 text-xs" aria-label="Quitter le jeu">
              <X size={16} /> <span className="hidden sm:inline">Quitter</span>
            </button>
            <button type="button" onClick={start} className="btn-ghost h-9 min-h-0 px-2.5 text-xs" aria-label="Redémarrer le jeu">
              <RotateCcw size={16} /> <span className="hidden sm:inline">Redémarrer</span>
            </button>
            <p className={cn('hidden truncate text-xs text-ink-faint', game.orientation !== 'portrait' && 'md:block')}>
              Clique dans le jeu pour le contrôler au clavier{isFull ? ' · Échap pour quitter le plein écran' : ''}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {game.controls.length > 0 && (
              <button
                type="button"
                onClick={() => setShowControls((s) => !s)}
                aria-expanded={showControls}
                className="btn-ghost h-9 min-h-0 px-2.5 text-xs">
                <Keyboard size={16} /> <span className="hidden sm:inline">Commandes</span>
              </button>
            )}
            {decision.kind === 'embed' && game.sourceUrl && (
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
  );
}
