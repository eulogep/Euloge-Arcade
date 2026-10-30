import {useEffect, type RefObject} from 'react';
import {usePlatform} from '@/app/PlatformProvider';
import type {Game} from '@/types/game';

interface RunMessage {
  source: 'euloge-arcade-game';
  version: 1;
  type: 'run-finished';
  payload: {score: number; timeElapsed: number; victory: boolean; startLevel: number; deaths: number};
}

function isRunMessage(data: unknown): data is RunMessage {
  const d = data as RunMessage;
  return (
    !!d &&
    d.source === 'euloge-arcade-game' &&
    d.version === 1 &&
    d.type === 'run-finished' &&
    typeof d.payload?.score === 'number' &&
    Number.isFinite(d.payload.score)
  );
}

/**
 * Receives "run finished" messages from first-party hosted games. Messages are
 * accepted only from our own origin AND from this exact iframe, and only for games
 * flagged `supportsScores`. Third-party games never report scores.
 */
export function useHostedScoreBridge(game: Game, iframeRef: RefObject<HTMLIFrameElement>, enabled: boolean) {
  const {submitRun, notify} = usePlatform();

  useEffect(() => {
    if (!enabled) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      if (!isRunMessage(event.data)) return;
      const p = event.data.payload;
      void submitRun({
        gameId: game.id,
        gameSlug: game.slug,
        score: Math.max(0, Math.round(p.score)),
        durationSeconds: Number.isFinite(p.timeElapsed) ? Math.max(0, p.timeElapsed) : null,
        victory: Boolean(p.victory),
        startLevel: Number.isInteger(p.startLevel) ? p.startLevel : null,
        deaths: Number.isInteger(p.deaths) ? p.deaths : null,
        createdAt: new Date().toISOString(),
      });
      notify({tone: 'info', title: 'Partie enregistrée', body: `${game.title} · ${Math.round(p.score)} pts`});
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [enabled, game, iframeRef, submitRun, notify]);
}
