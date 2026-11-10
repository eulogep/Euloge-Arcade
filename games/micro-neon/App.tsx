import {Crown, FileAudio, Headphones, Mic, MicOff, Music, Play, RotateCcw, Star, Trophy, Upload} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import {PlayerSetup, Shell} from '../_party/ui';
import {createContext, micErrorMessage, openMic, readFrame, type MicInput} from './audio';
import {currentLrcLine, parseLrc, type LrcLine} from './lrc';
import {detectPitch, freqToMidi, songResult, type SongResult} from './pitch';
import {SingStage, type StageMode} from './SingStage';
import {noteName, SONGS, type Song, type TimedNote} from './songs';

type Screen =
  | {k: 'setup'}
  | {k: 'turn'}
  | {k: 'song'; song: Song}
  | {k: 'stage'; song: Song; mode: StageMode; run: number}
  | {k: 'result'; song: Song; result: SongResult; lines: number[]}
  | {k: 'import'}
  | {k: 'importPlay'; title: string; lines: LrcLine[]; audioUrl: string}
  | {k: 'board'};

interface Performance {
  player: string;
  song: string;
  points: number;
  accuracy: number;
}

function MicCheck({mic}: {mic: MicInput}) {
  const [note, setNote] = useState<number | null>(null);
  const [level, setLevel] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = () => {
      if (performance.now() - last > 60) {
        last = performance.now();
        const {samples, sampleRate} = readFrame(mic);
        let e = 0;
        for (const s of samples) e += s * s;
        setLevel(Math.min(1, Math.sqrt(e / samples.length) * 8));
        const f = detectPitch(samples, sampleRate);
        setNote(f === null ? null : freqToMidi(f));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mic]);
  return (
    <div className="flex items-center gap-4 rounded-xl border border-line bg-surface2/50 px-4 py-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10" role="meter" aria-label="Niveau du micro" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
        <div className="h-full rounded-full bg-gradient-to-r from-cyan to-violet transition-[width]" style={{width: `${level * 100}%`}} />
      </div>
      <span className="w-20 text-right font-display text-xl font-bold">{note === null ? '—' : noteName(note)}</span>
    </div>
  );
}

function lineAccuracies(scores: number[], notes: TimedNote[]): number[] {
  const out: number[] = [];
  notes.forEach((n, i) => {
    out[n.line] = (out[n.line] ?? 0) + scores[i];
  });
  return out.map((sum, l) => Math.round((sum / notes.filter((n) => n.line === l).length) * 100));
}

export default function App() {
  const [players, setPlayers] = useState<string[]>([]);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [turn, setTurn] = useState(0);
  const [transpose, setTranspose] = useState(0);
  const [history, setHistory] = useState<Performance[]>([]);
  const [screen, setScreen] = useState<Screen>({k: 'setup'});

  const ctxRef = useRef<AudioContext | null>(null);
  const [mic, setMic] = useState<MicInput | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [micPending, setMicPending] = useState(false);

  const ctx = () => (ctxRef.current ??= createContext());
  const singer = players[turn % Math.max(1, players.length)] ?? 'Chanteur';

  async function enableMic() {
    setMicPending(true);
    setMicError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('unsupported'), {name: 'NotFoundError'});
      await ctx().resume();
      setMic(await openMic(ctx()));
    } catch (err) {
      setMicError(micErrorMessage(err));
    } finally {
      setMicPending(false);
    }
  }

  function disableMic() {
    mic?.stop();
    setMic(null);
  }

  useEffect(() => () => mic?.stop(), [mic]);
  useEffect(() => () => void ctxRef.current?.close(), []);

  const micBadge = mic ? (
    <button type="button" className="tag border-[#ff4f9a]/60 text-[#ff4f9a]" onClick={disableMic} title="Couper le micro">
      <Mic size={14} aria-hidden /> Micro actif
    </button>
  ) : null;

  const best = new Map<string, Performance>();
  for (const p of history) if (!best.has(p.player) || best.get(p.player)!.points < p.points) best.set(p.player, p);
  const ranking = [...best.values()].sort((a, b) => b.points - a.points);

  // ---------------------------------------------------------------------------
  if (screen.k === 'setup') {
    return (
      <Shell title="Micro Néon" kicker="Karaoké · même appareil" right={micBadge}>
        <section className="panel p-5">
          <h2 className="mb-1 text-xl font-bold">Les chanteurs</h2>
          <p className="mb-4 text-sm text-muted">Chacun son tour au micro. Le meilleur score de chacun compte pour le classement de la soirée.</p>
          <PlayerSetup min={1} max={12} onChange={(n, err) => { setPlayers(n); setPlayersError(err); }} />
        </section>

        <section className="panel mt-4 space-y-3 p-5">
          <h2 className="text-xl font-bold">Le micro</h2>
          <p className="text-sm text-muted">
            Le micro sert uniquement à mesurer la justesse, en direct sur cet appareil. Rien n’est enregistré ni envoyé.
            L’octave n’est pas pénalisée : voix graves et aiguës jouent à égalité.
          </p>
          {mic ? (
            <>
              <MicCheck mic={mic} />
              <p className="text-xs text-muted">Chante un « laaa » : la note détectée s’affiche à droite.</p>
            </>
          ) : (
            <button type="button" className="btn-secondary w-full" onClick={enableMic} disabled={micPending}>
              <Mic size={18} aria-hidden /> {micPending ? 'Autorisation…' : 'Activer le micro'}
            </button>
          )}
          {micError && <p role="alert" className="flex items-start gap-2 text-sm text-warning"><MicOff size={16} className="mt-0.5 shrink-0" aria-hidden /> {micError}</p>}
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Tonalité</span>
            <select className="input" value={transpose} onChange={(e) => setTranspose(Number(e.target.value))}>
              {[-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((t) => (
                <option key={t} value={t}>{t === 0 ? 'Originale' : `${t > 0 ? '+' : ''}${t} demi-ton${Math.abs(t) > 1 ? 's' : ''}`}</option>
              ))}
            </select>
          </label>
          <p className="flex items-center gap-2 text-xs text-muted"><Headphones size={14} aria-hidden /> Pendant la notation, seul le métronome joue, pour que le micro n’entende que ta voix.</p>
        </section>

        {playersError && <p role="alert" className="mt-4 text-center text-sm text-warning">{playersError}</p>}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-primary" disabled={!!playersError} onClick={() => { setTurn(0); setHistory([]); setScreen({k: 'turn'}); }}>
            <Music size={18} aria-hidden /> Commencer la soirée
          </button>
          <button type="button" className="btn-secondary" onClick={() => setScreen({k: 'import'})}>
            <Upload size={18} aria-hidden /> Importer ma chanson
          </button>
        </div>
      </Shell>
    );
  }

  const back = () => setScreen({k: 'turn'});

  if (screen.k === 'turn') {
    return (
      <Shell title={`Au tour de ${singer}`} kicker={`Passage ${history.length + 1}`} onBack={() => setScreen({k: 'setup'})} right={micBadge}>
        <p className="mb-4 text-muted">Choisis ta chanson.</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {SONGS.map((song) => (
            <li key={song.id}>
              <button type="button" className="panel w-full p-4 text-left transition hover:border-cyan/60" onClick={() => setScreen({k: 'song', song})}>
                <p className="font-display text-lg font-bold">{song.title}</p>
                <p className="mt-1 text-xs text-muted">{song.credit}</p>
              </button>
            </li>
          ))}
        </ul>
        {ranking.length > 0 && (
          <button type="button" className="btn-ghost mt-4 w-full" onClick={() => setScreen({k: 'board'})}>
            <Trophy size={18} aria-hidden /> Classement de la soirée
          </button>
        )}
      </Shell>
    );
  }

  if (screen.k === 'song') {
    const {song} = screen;
    return (
      <Shell title={song.title} kicker={`${singer} au micro`} onBack={back} right={micBadge}>
        <div className="space-y-3">
          <div className="panel p-4 text-center text-lg leading-relaxed text-muted">
            {song.lines.map((l, i) => <p key={i}>{l.map(([s]) => s).join('')}</p>)}
          </div>
          <button type="button" className="btn-secondary w-full" onClick={() => setScreen({k: 'stage', song, mode: 'listen', run: Date.now()})}>
            <Headphones size={18} aria-hidden /> Écouter la mélodie
          </button>
          {mic ? (
            <button type="button" className="btn-primary w-full" onClick={() => setScreen({k: 'stage', song, mode: 'score', run: Date.now()})}>
              <Mic size={18} aria-hidden /> Chanter et être noté
            </button>
          ) : (
            <>
              <button type="button" className="btn-primary w-full" onClick={enableMic} disabled={micPending}>
                <Mic size={18} aria-hidden /> Activer le micro pour être noté
              </button>
              {micError && <p role="alert" className="text-sm text-warning">{micError}</p>}
            </>
          )}
          <button type="button" className="btn-ghost w-full" onClick={() => setScreen({k: 'stage', song, mode: 'free', run: Date.now()})}>
            <Play size={18} aria-hidden /> Mode libre (mélodie, sans note)
          </button>
        </div>
      </Shell>
    );
  }

  if (screen.k === 'stage') {
    const {song, mode} = screen;
    return (
      <Shell title={song.title} kicker={mode === 'score' ? `${singer} · notation` : mode === 'listen' ? 'Écoute' : `${singer} · mode libre`} onBack={() => setScreen({k: 'song', song})} right={micBadge}>
        <SingStage
          key={screen.run}
          ctx={ctx()}
          mic={mode === 'listen' ? null : mic}
          song={song}
          transpose={transpose}
          mode={mode}
          onCancel={() => setScreen({k: 'song', song})}
          onDone={(scores, notes) => {
            if (!scores) {
              setScreen(mode === 'listen' ? {k: 'song', song} : (setTurn((t) => t + 1), {k: 'turn'}));
              return;
            }
            const result = songResult(scores);
            setHistory((h) => [...h, {player: singer, song: song.title, points: result.points, accuracy: result.accuracy}]);
            setScreen({k: 'result', song, result, lines: lineAccuracies(scores, notes)});
          }}
        />
      </Shell>
    );
  }

  if (screen.k === 'result') {
    const {result, song, lines} = screen;
    return (
      <Shell title="Résultat" kicker={`${singer} · ${song.title}`} right={micBadge}>
        <div className="space-y-5 text-center">
          <p className="font-display text-6xl font-bold">{result.points.toLocaleString('fr-FR')}</p>
          <p className="flex justify-center gap-1 text-warning" aria-label={`${result.stars} étoiles sur 5`}>
            {Array.from({length: 5}, (_, i) => <Star key={i} size={28} className={i < result.stars ? 'fill-current' : 'opacity-25'} aria-hidden />)}
          </p>
          <p className="text-xl font-semibold">{result.title}</p>
          <p className="text-muted">Justesse : {result.accuracy} %</p>
          <ul className="panel space-y-2 p-4 text-left">
            {lines.map((acc, i) => (
              <li key={i} className="text-sm">
                <p className="truncate text-muted">{song.lines[i].map(([s]) => s).join('')}</p>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full rounded-full ${acc >= 70 ? 'bg-success' : acc >= 35 ? 'bg-warning' : 'bg-danger'}`} style={{width: `${acc}%`}} />
                </div>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn-primary" onClick={() => { setTurn((t) => t + 1); setScreen({k: 'turn'}); }}>
              Chanteur suivant
            </button>
            <button type="button" className="btn-secondary" onClick={() => setScreen({k: 'board'})}>
              <Trophy size={18} aria-hidden /> Classement
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (screen.k === 'board') {
    return (
      <Shell title="Classement de la soirée" kicker="Micro Néon" onBack={back} right={micBadge}>
        <ol className="panel divide-y divide-line">
          {ranking.map((p, i) => (
            <li key={p.player} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-2 font-semibold">
                {i === 0 ? <Crown size={18} className="text-warning" aria-label="1er" /> : <span className="w-[18px] text-center font-mono text-muted">{i + 1}</span>}
                {p.player}
              </span>
              <span className="text-right text-sm">
                <span className="font-mono text-base">{p.points.toLocaleString('fr-FR')}</span>
                <span className="block text-xs text-muted">{p.song} · {p.accuracy} %</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-primary" onClick={back}>Continuer la soirée</button>
          <button type="button" className="btn-secondary" onClick={() => { setHistory([]); setTurn(0); setScreen({k: 'setup'}); }}>
            <RotateCcw size={18} aria-hidden /> Nouvelle soirée
          </button>
        </div>
      </Shell>
    );
  }

  if (screen.k === 'import') return <ImportScreen onBack={() => setScreen({k: 'setup'})} onReady={(s) => setScreen(s)} />;

  return <ImportPlayer title={screen.title} lines={screen.lines} audioUrl={screen.audioUrl} onBack={() => { URL.revokeObjectURL(screen.audioUrl); setScreen({k: 'import'}); }} />;
}

/** Your own song: synced lyrics (.lrc) + audio file, read locally, never uploaded. */
function ImportScreen({onBack, onReady}: {onBack: () => void; onReady: (s: Extract<Screen, {k: 'importPlay'}>) => void}) {
  const [lrc, setLrc] = useState<LrcLine[] | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Shell title="Importer ma chanson" kicker="Micro Néon" onBack={onBack}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Choisis des paroles synchronisées (fichier <code>.lrc</code>) et le fichier audio correspondant. Ils restent sur cet appareil : rien n’est envoyé.
          Sans mélodie de référence, une chanson importée se chante en mode libre, sans note. Utilise uniquement des fichiers que tu as le droit d’utiliser.
        </p>
        <label className="panel block cursor-pointer p-4">
          <span className="flex items-center gap-2 font-semibold"><FileAudio size={18} aria-hidden /> Paroles (.lrc)</span>
          <input
            type="file"
            accept=".lrc,text/plain"
            className="mt-2 block w-full text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 200_000) return setError('Fichier de paroles trop volumineux.');
              const lines = parseLrc(await f.text());
              if (lines.length === 0) return setError('Aucune ligne horodatée trouvée (format attendu : [mm:ss.xx] paroles).');
              setError(null);
              setLrc(lines);
            }}
          />
          {lrc && <span className="mt-1 block text-xs text-success">{lrc.length} lignes</span>}
        </label>
        <label className="panel block cursor-pointer p-4">
          <span className="flex items-center gap-2 font-semibold"><Music size={18} aria-hidden /> Audio (mp3, ogg, m4a…)</span>
          <input type="file" accept="audio/*" className="mt-2 block w-full text-sm" onChange={(e) => setAudio(e.target.files?.[0] ?? null)} />
        </label>
        {error && <p role="alert" className="text-sm text-warning">{error}</p>}
        <button
          type="button"
          className="btn-primary w-full"
          disabled={!lrc || !audio}
          onClick={() => onReady({k: 'importPlay', title: audio!.name.replace(/\.[^.]+$/, ''), lines: lrc!, audioUrl: URL.createObjectURL(audio!)})}>
          <Play size={18} aria-hidden /> Lancer
        </button>
      </div>
    </Shell>
  );
}

function ImportPlayer({title, lines, audioUrl, onBack}: {title: string; lines: LrcLine[]; audioUrl: string; onBack: () => void}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [idx, setIdx] = useState(-1);
  return (
    <Shell title={title} kicker="Chanson importée · mode libre" onBack={onBack}>
      <div className="space-y-4">
        <div className="panel min-h-[12rem] px-4 py-6 text-center">
          <p className="text-base text-muted">{lines[idx - 1]?.text ?? ''}</p>
          <p className="my-3 font-display text-3xl font-bold text-ink">{lines[idx]?.text ?? '♪'}</p>
          <p className="text-base text-muted">{lines[idx + 1]?.text ?? ''}</p>
        </div>
        <audio ref={audioRef} src={audioUrl} controls className="w-full" onTimeUpdate={(e) => setIdx(currentLrcLine(lines, e.currentTarget.currentTime))} />
      </div>
    </Shell>
  );
}
