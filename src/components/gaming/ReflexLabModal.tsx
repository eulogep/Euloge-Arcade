import {Activity, Crosshair, Flame, Play, RotateCcw, Trophy, X, Zap} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {usePlatform} from '@/app/PlatformProvider';
import {readJson, writeJson} from '@/lib/storage';
import {playAchievementFanfare, playClickPulse, playHoverTick} from '@/lib/sound';
import {cn} from '@/lib/cn';

const LAB_SCORE_KEY = 'ea:reflex-lab-best';
const DURATION_SEC = 20;
const GRID_SIZE = 16;

interface ReflexStats {
  bestScore: number;
  bestAvgMs: number | null;
}

export function ReflexLabModal() {
  const {reflexLabOpen, setReflexLabOpen} = usePlatform();
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [timeLeft, setTimeLeft] = useState(DURATION_SEC);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [activeCell, setActiveCell] = useState<number>(5);
  const [bonusCell, setBonusCell] = useState<number | null>(null);
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  const spawnTimeRef = useRef<number>(performance.now());

  const [saved, setSaved] = useState<ReflexStats>(() =>
    readJson<ReflexStats>(LAB_SCORE_KEY, {bestScore: 0, bestAvgMs: null}),
  );

  const pickNextCell = useCallback((exclude: number) => {
    let next = Math.floor(Math.random() * GRID_SIZE);
    if (next === exclude) next = (next + 1) % GRID_SIZE;
    return next;
  }, []);

  const startGame = () => {
    playClickPulse();
    setScore(0);
    setCombo(0);
    setHits(0);
    setMisses(0);
    setReactionTimes([]);
    setTimeLeft(DURATION_SEC);
    const first = Math.floor(Math.random() * GRID_SIZE);
    setActiveCell(first);
    setBonusCell(null);
    spawnTimeRef.current = performance.now();
    setPhase('playing');
  };

  useEffect(() => {
    if (!reflexLabOpen) {
      setPhase('idle');
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReflexLabOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reflexLabOpen, setReflexLabOpen]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const interval = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setPhase('done');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  const avgMs =
    reactionTimes.length > 0
      ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
      : null;

  useEffect(() => {
    if (phase !== 'done') return;
    playAchievementFanfare();
    setSaved((prev) => {
      const nextBestScore = Math.max(prev.bestScore, score);
      const nextBestMs =
        avgMs !== null && (prev.bestAvgMs === null || avgMs < prev.bestAvgMs) ? avgMs : prev.bestAvgMs;
      const updated = {bestScore: nextBestScore, bestAvgMs: nextBestMs};
      writeJson(LAB_SCORE_KEY, updated);
      return updated;
    });
  }, [phase, score, avgMs]);

  if (!reflexLabOpen) return null;

  const onCellClick = (index: number) => {
    if (phase !== 'playing') return;
    const now = performance.now();
    if (index === activeCell || index === bonusCell) {
      const delta = Math.max(80, Math.round(now - spawnTimeRef.current));
      const isBonus = index === bonusCell;
      const nextCombo = combo + 1;
      const speedBonus = Math.max(10, Math.round((700 - Math.min(600, delta)) / 6));
      const gain = (isBonus ? 180 : 100 + speedBonus) * Math.min(5, 1 + Math.floor(nextCombo / 4));

      playClickPulse();
      setScore((s) => s + gain);
      setCombo(nextCombo);
      setHits((h) => h + 1);
      setReactionTimes((r) => [...r, delta]);

      const next = pickNextCell(index);
      setActiveCell(next);
      if (Math.random() < 0.25) {
        setBonusCell(pickNextCell(next));
      } else {
        setBonusCell(null);
      }
      spawnTimeRef.current = now;
    } else {
      playHoverTick();
      setCombo(0);
      setMisses((m) => m + 1);
      setScore((s) => Math.max(0, s - 40));
    }
  };

  const accuracy = hits + misses > 0 ? Math.round((hits / (hits + misses)) * 100) : 100;
  const rank =
    score >= 4500 ? 'RANG S+ // ARCHITECTE' : score >= 3000 ? 'RANG A // OPÉRATEUR' : score >= 1800 ? 'RANG B // ÉCLAIREUR' : 'RANG C // INITIÉ';

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-bg/85 p-4 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reflex-lab-title"
      onClick={() => setReflexLabOpen(false)}>
      <div
        className="holo-panel reticle-frame w-full max-w-xl overflow-hidden rounded-3xl p-5 sm:p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between border-b pb-3 border-line-soft">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow">
              <Crosshair size={18} />
            </span>
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent-3">
                ATELIER EULOGE // MINI-MODULE
              </span>
              <h2 id="reflex-lab-title" className="font-display text-lg font-black leading-tight">
                Cyber-Pulse : Calibrateur de Réflexes
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReflexLabOpen(false)}
            className="btn-ghost h-9 min-h-0 w-9 rounded-full px-0"
            aria-label="Fermer le calibrateur de réflexes">
            <X size={18} />
          </button>
        </div>

        {/* Live Telemetry Bar */}
        <div className="mb-5 grid grid-cols-4 gap-2 text-center">
          <div className="rounded-2xl border bg-surface/70 p-2.5 border-line-soft">
            <p className="font-mono text-[10px] uppercase text-ink-faint">Chrono</p>
            <p className={cn('font-display text-xl font-black', timeLeft <= 5 && phase === 'playing' ? 'text-danger' : 'text-ink')}>
              {timeLeft}s
            </p>
          </div>
          <div className="rounded-2xl border bg-surface/70 p-2.5 border-line-soft">
            <p className="font-mono text-[10px] uppercase text-ink-faint">Score</p>
            <p className="font-display text-xl font-black text-accent-3">{score.toLocaleString('fr-FR')}</p>
          </div>
          <div className="rounded-2xl border bg-surface/70 p-2.5 border-line-soft">
            <p className="font-mono text-[10px] uppercase text-ink-faint">Combo</p>
            <p className="font-display text-xl font-black text-warning">×{Math.min(5, 1 + Math.floor(combo / 4))}</p>
          </div>
          <div className="rounded-2xl border bg-surface/70 p-2.5 border-line-soft">
            <p className="font-mono text-[10px] uppercase text-ink-faint">Réaction</p>
            <p className="font-display text-xl font-black text-ink">{avgMs ? `${avgMs}ms` : '—'}</p>
          </div>
        </div>

        {/* Interactive 4x4 Holo Matrix */}
        {phase === 'playing' ? (
          <div className="grid grid-cols-4 gap-2.5 sm:gap-3" role="group" aria-label="Matrice de cibles holographiques">
            {Array.from({length: GRID_SIZE}).map((_, idx) => {
              const isTarget = idx === activeCell;
              const isBonus = idx === bonusCell;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onCellClick(idx)}
                  aria-label={isTarget ? 'Cible active' : isBonus ? 'Cible bonus' : `Cellule ${idx + 1}`}
                  className={cn(
                    'relative aspect-square rounded-2xl border transition-all duration-150 flex items-center justify-center',
                    isTarget
                      ? 'border-accent-3 bg-brand-gradient text-white shadow-glow scale-[1.03]'
                      : isBonus
                        ? 'border-warning bg-warning/25 text-warning shadow-glow scale-[1.02]'
                        : 'border-line-soft bg-surface-2/50 hover:bg-surface-2',
                  )}>
                  {isTarget && <Crosshair size={26} className="animate-pulse" />}
                  {isBonus && <Zap size={24} className="animate-bounce" />}
                  {!isTarget && !isBonus && (
                    <span className="font-mono text-[10px] text-ink-faint/40">{String(idx + 1).padStart(2, '0')}</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : phase === 'done' ? (
          <div className="rounded-2xl border bg-surface/60 p-6 text-center space-y-4 border-line-soft">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-3 py-1 font-mono text-xs font-black text-white">
              <Trophy size={14} /> {rank}
            </span>
            <div>
              <p className="font-display text-3xl font-black">{score.toLocaleString('fr-FR')} points</p>
              <p className="mt-1 text-xs text-ink-muted">
                Précision : <strong>{accuracy}%</strong> ({hits} cibles touchées) · Temps moyen :{' '}
                <strong>{avgMs ? `${avgMs} ms` : '—'}</strong>
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button type="button" onClick={startGame} className="btn-primary">
                <RotateCcw size={16} /> Rejouer la calibration
              </button>
              <button type="button" onClick={() => setReflexLabOpen(false)} className="btn-secondary">
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border bg-surface/60 p-6 text-center space-y-4 border-line-soft">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent-3 ring-1 ring-accent-3/30">
              <Activity size={28} />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold">Échauffe tes réflexes avant de lancer un jeu</h3>
              <p className="mt-1 mx-auto max-w-md text-xs leading-relaxed text-ink-muted">
                Touche les nœuds holographiques dès qu'ils s'illuminent pendant <strong>20 secondes</strong>. Enchaîne sans erreur pour
                monter le multiplicateur jusqu'à <strong>×5</strong>.
              </p>
            </div>
            {saved.bestScore > 0 && (
              <p className="inline-flex items-center gap-2 rounded-full border bg-surface-2/80 px-3.5 py-1 text-xs font-semibold text-ink border-line-soft">
                <Flame size={14} className="text-warning" /> Record local : {saved.bestScore.toLocaleString('fr-FR')} pts
                {saved.bestAvgMs && <span className="text-ink-muted">({saved.bestAvgMs} ms)</span>}
              </p>
            )}
            <div className="pt-1">
              <button type="button" onClick={startGame} className="btn-primary px-6">
                <Play size={17} className="fill-current" /> Démarrer la séquence (20s)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

