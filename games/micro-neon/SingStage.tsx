import {Square} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import {readFrame, scheduleClicks, scheduleMelody, type MicInput} from './audio';
import {detectPitch, foldToTarget, freqToMidi, noteScore} from './pitch';
import {timeline, type Song, type TimedNote} from './songs';

export type StageMode = 'score' | 'listen' | 'free';

const COUNT_IN_BEATS = 4;
const WINDOW_PAST = 1.5;
const WINDOW_FUTURE = 4;
const DETECT_EVERY_MS = 40;

interface TrailPoint {
  t: number;
  midi: number | null;
}

/**
 * One performance. `score` mode: metronome only (no guide melody the mic could pick
 * up) and live pitch scoring. `listen` / `free`: guide melody, no scoring.
 */
export function SingStage({
  ctx,
  mic,
  song,
  transpose,
  mode,
  onDone,
  onCancel,
}: {
  ctx: AudioContext;
  mic: MicInput | null;
  song: Song;
  transpose: number;
  mode: StageMode;
  onDone: (noteScores: number[] | null, notes: TimedNote[]) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cursor, setCursor] = useState(-1);
  const [countdown, setCountdown] = useState<number | null>(COUNT_IN_BEATS);
  const [liveNote, setLiveNote] = useState<number | null>(null);

  useEffect(() => {
    const notes = timeline(song, transpose);
    const spb = 60 / song.bpm;
    const duration = notes[notes.length - 1].end;
    const samples: (number | null)[][] = notes.map(() => []);
    const trail: TrailPoint[] = [];
    const scoring = mode === 'score' && mic !== null;
    let raf = 0;
    let lastDetect = 0;
    let lastCursor = -1;
    let lastCount: number | null = COUNT_IN_BEATS;
    let finished = false;

    void ctx.resume();
    const t0 = ctx.currentTime + 0.25;
    const songStart = t0 + COUNT_IN_BEATS * spb;
    const totalBeats = COUNT_IN_BEATS + Math.ceil(duration / spb);
    const stops = [scheduleClicks(ctx, t0, mode === 'score' ? totalBeats : COUNT_IN_BEATS, spb)];
    if (mode !== 'score') stops.push(scheduleMelody(ctx, notes, songStart));

    const lo = Math.min(...notes.map((n) => n.midi)) - 3;
    const hi = Math.max(...notes.map((n) => n.midi)) + 3;

    const draw = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const g = canvas.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const span = WINDOW_PAST + WINDOW_FUTURE;
      const x = (t: number) => ((t - (now - WINDOW_PAST)) / span) * w;
      const row = h / (hi - lo + 1);
      const y = (m: number) => h - (m - lo + 0.5) * row;
      /** Sung pitches outside the lane stay visible on its edge. */
      const yVoice = (m: number) => Math.min(h - 4, Math.max(4, y(m)));

      g.strokeStyle = 'rgba(255,255,255,0.05)';
      for (let m = lo; m <= hi; m++) {
        g.beginPath();
        g.moveTo(0, y(m));
        g.lineTo(w, y(m));
        g.stroke();
      }
      notes.forEach((n, i) => {
        if (n.end < now - WINDOW_PAST || n.start > now + WINDOW_FUTURE) return;
        const past = n.end < now;
        const s = scoring && past ? noteScore(samples[i], n.midi) : null;
        g.fillStyle = s === null ? (now >= n.start && now <= n.end ? '#38e1ff' : 'rgba(56,225,255,0.45)') : s >= 0.7 ? '#34d399' : s >= 0.35 ? '#fbbf24' : '#fb4c6e';
        const bx = x(n.start) + 1;
        const bw = Math.max(4, x(n.end) - x(n.start) - 2);
        g.beginPath();
        g.roundRect(bx, y(n.midi) - row * 0.38, bw, row * 0.76, row * 0.38);
        g.fill();
      });
      g.fillStyle = '#ff4f9a';
      for (const p of trail) {
        if (p.midi === null || p.t < now - WINDOW_PAST) continue;
        g.beginPath();
        g.arc(x(p.t), yVoice(p.midi), 3.5, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x(now), 0);
      g.lineTo(x(now), h);
      g.stroke();
      g.lineWidth = 1;
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      onDone(scoring ? notes.map((n, i) => noteScore(samples[i], n.midi)) : null, notes);
    };

    const frame = () => {
      const now = ctx.currentTime - songStart;
      const count = now < 0 ? Math.ceil(-now / spb) : null;
      if (count !== lastCount) {
        lastCount = count;
        setCountdown(count);
      }
      const idx = notes.findIndex((n) => now >= n.start && now < n.end);
      const shown = idx >= 0 ? idx : lastCursor;
      if (shown !== lastCursor) {
        lastCursor = shown;
        setCursor(shown);
      }

      if (mic && performance.now() - lastDetect >= DETECT_EVERY_MS) {
        lastDetect = performance.now();
        const {samples: frameData, sampleRate} = readFrame(mic);
        const f = detectPitch(frameData, sampleRate);
        const sung = f === null ? null : freqToMidi(f);
        const ref = notes[idx >= 0 ? idx : Math.max(0, lastCursor)] ?? notes[0];
        trail.push({t: now, midi: sung === null ? null : foldToTarget(sung, ref.midi)});
        if (trail.length > 400) trail.shift();
        setLiveNote(sung);
        if (scoring && idx >= 0) {
          const n = notes[idx];
          // Ignore the attack and the very end of each note.
          if (now >= n.start + 0.07 && now <= n.end - 0.04) samples[idx].push(sung);
        }
      }

      draw(now);
      if (now > duration + 0.6) finish();
      else raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      finished = true;
      cancelAnimationFrame(raf);
      stops.forEach((s) => s());
    };
    // The stage runs once per performance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notes = timeline(song, transpose);
  const current = cursor >= 0 ? notes[cursor] : null;
  const lineIdx = current ? current.line : 0;
  const lineNotes = notes.filter((n) => n.line === lineIdx);
  const nextLine = song.lines[lineIdx + 1];

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface">
        <canvas ref={canvasRef} className="block h-56 w-full sm:h-72" aria-hidden />
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/50">
            <span className="font-display text-7xl font-bold text-cyan" aria-live="assertive">{countdown}</span>
          </div>
        )}
        {mic && (
          <span className="tag absolute right-2 top-2 bg-bg/70">
            <span className={`h-2 w-2 rounded-full ${liveNote === null ? 'bg-muted' : 'bg-[#ff4f9a]'}`} aria-hidden />
            {mode === 'score' ? 'Notation en direct' : 'Micro'}
          </span>
        )}
      </div>

      <div className="panel min-h-[7.5rem] px-4 py-5 text-center" aria-live="off">
        <p className="font-display text-2xl font-bold leading-snug sm:text-3xl">
          {lineNotes.map((n) => {
            const state = !current ? 'future' : n.index < current.index ? 'past' : n.index === current.index ? 'now' : 'future';
            return (
              <span key={n.index} className={state === 'past' ? 'text-cyan' : state === 'now' ? 'text-white underline decoration-[#ff4f9a] decoration-4 underline-offset-8' : 'text-muted'}>
                {n.syllable}
              </span>
            );
          })}
        </p>
        {nextLine && <p className="mt-3 text-base text-muted/80">{nextLine.map(([s]) => s).join('')}</p>}
      </div>

      <button type="button" className="btn-secondary w-full" onClick={onCancel}>
        <Square size={16} aria-hidden /> Arrêter
      </button>
    </div>
  );
}
