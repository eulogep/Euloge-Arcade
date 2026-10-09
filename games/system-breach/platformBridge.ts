/**
 * Reports finished runs to the Euloge Arcade host page.
 *
 * Hosted games are served from the same origin as the platform, so messages are
 * only ever posted to that exact origin (never '*'). Outside an iframe this is a no-op.
 */
export interface FinishedRun {
  score: number;
  timeElapsed: number;
  victory: boolean;
  startLevel: number;
  deaths: number;
}

export function reportRunToPlatform(run: FinishedRun) {
  if (window.parent === window) return;
  window.parent.postMessage(
    {
      source: 'euloge-arcade-game',
      version: 1,
      game: 'system-breach',
      type: 'run-finished',
      payload: run,
    },
    window.location.origin,
  );
}
