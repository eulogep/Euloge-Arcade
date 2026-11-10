import {CalendarDays, Flag, Medal, Play, Timer} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {Skeleton} from '@/components/ui/feedback';
import {challengeDayKey, getDailyChallenge, msUntilNextChallenge} from '@/lib/dailyChallenge';
import {loadDailyLeaderboard, type LeaderboardRow} from '@/services/catalogService';
import type {Game} from '@/types/game';

/** Games that ship a daily challenge (the generator lives in lib/dailyChallenge.ts). */
export const DAILY_CHALLENGE_GAMES = new Set(['system-breach']);

function formatCountdown(ms: number) {
  const totalMin = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

function formatDay(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** Re-renders every 30 s so the countdown and the day roll over without a reload. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function DailyChallengePanel({game, onStart}: {game: Game; onStart?: () => void}) {
  const {runs, backendEnabled, user} = usePlatform();
  const now = useNow();
  const day = challengeDayKey(now);
  const challenge = useMemo(() => getDailyChallenge(day), [day]);

  const myBest = useMemo(
    () =>
      runs
        .filter((r) => r.gameId === game.id && r.challenge === day)
        .reduce<number | null>((best, r) => (best === null || r.score > best ? r.score : best), null),
    [runs, game.id, day],
  );

  const [board, setBoard] = useState<LeaderboardRow[] | null>(null);
  const [boardError, setBoardError] = useState(false);
  useEffect(() => {
    if (!backendEnabled) return;
    let cancelled = false;
    setBoardError(false);
    loadDailyLeaderboard(game.id, day)
      .then((rows) => !cancelled && setBoard(rows))
      .catch(() => !cancelled && setBoardError(true));
    return () => {
      cancelled = true;
    };
  }, [backendEnabled, game.id, day, runs.length]);

  return (
    <section aria-labelledby="daily-challenge-title" className="holo-panel reticle-frame rounded-2xl p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="daily-challenge-title" className="section-title flex items-center gap-2">
            <CalendarDays size={20} className="text-warning" /> Défi du jour
          </h2>
          <p className="mt-1 text-sm text-ink-muted first-letter:uppercase">{formatDay(day)}</p>
        </div>
        <p className="hud-tag" title="Le défi change à minuit UTC, pour tout le monde en même temps.">
          <Timer size={12} aria-hidden /> Nouveau défi dans {formatCountdown(msUntilNextChallenge(now))}
        </p>
      </div>

      <p className="mb-3 text-sm text-ink-muted">
        Mêmes conditions pour tous les joueurs aujourd'hui. Départ :{' '}
        <strong className="text-ink">secteur 0{challenge.startSector}</strong>.
      </p>
      <ul className="mb-5 grid gap-2 sm:grid-cols-2">
        {challenge.modifiers.map((m) => (
          <li key={m.id} className="rounded-xl border border-line-soft bg-surface-2/60 p-3">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Flag size={14} className="text-accent-3" aria-hidden /> {m.label}
            </p>
            <p className="mt-1 text-xs text-ink-muted">{m.description}</p>
          </li>
        ))}
      </ul>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link
          to={`/jeux/${game.slug}?jouer=1&defi=1`}
          onClick={onStart}
          className="btn-primary h-11 px-5">
          <Play size={18} className="fill-current" aria-hidden /> Relever le défi
        </Link>
        <p className="text-sm text-ink-muted">
          {myBest === null ? (
            "Tu n'as pas encore joué le défi aujourd'hui."
          ) : (
            <>
              Ton meilleur score du jour :{' '}
              <strong className="font-mono text-ink">{myBest.toLocaleString('fr-FR')}</strong> pts
            </>
          )}
        </p>
      </div>

      {backendEnabled && (
        <>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
            <Medal size={16} className="text-accent-3" aria-hidden /> Classement du jour
          </h3>
          {boardError ? (
            <p className="text-sm text-ink-muted">Classement du jour indisponible pour le moment.</p>
          ) : !board ? (
            <Skeleton className="h-20" />
          ) : board.length === 0 ? (
            <p className="text-sm text-ink-muted">Personne n'a encore relevé le défi aujourd'hui. À toi de jouer !</p>
          ) : (
            <ol className="space-y-1.5" aria-label="Classement du défi du jour">
              {board.map((r) => (
                <li
                  key={r.rank}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm odd:bg-surface-2/40">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-6 text-right font-mono text-xs text-ink-faint">#{r.rank}</span>
                    <span className="truncate font-semibold">{r.displayName}</span>
                  </span>
                  <span className="font-mono">{r.score.toLocaleString('fr-FR')}</span>
                </li>
              ))}
            </ol>
          )}
          {!user && (
            <p className="mt-2 text-xs text-ink-faint">
              <Link to="/connexion" className="underline">Connecte-toi</Link> pour apparaître au classement du jour.
            </p>
          )}
        </>
      )}
      <p className="mt-3 text-[11px] text-ink-faint">
        Les parties du défi suivent des règles modifiées : elles ne comptent ni pour le classement général ni pour les
        succès. Classement indicatif, scores transmis par le jeu depuis ton navigateur.
      </p>
    </section>
  );
}
