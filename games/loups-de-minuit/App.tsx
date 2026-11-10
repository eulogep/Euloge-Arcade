import {Eye, Minus, Moon, Pause, Play, Plus, RotateCcw, Shield, Skull, Sun, Users, Vote} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import {Handoff, PlayerSetup, Shell} from '../_party/ui';
import {
  aliveIndices,
  assignRoles,
  defaultRoleCounts,
  eliminate,
  isWolf,
  MAX_PLAYERS,
  MIN_PLAYERS,
  protectTargets,
  resolveNight,
  resolveWolfVotes,
  ROLE_INFO,
  validateRoleCounts,
  winner,
  wolfTargets,
  type NightResult,
  type Player,
  type RoleCounts,
  type Team,
} from './logic';

type Phase =
  | {k: 'setup'}
  | {k: 'reveal'; idx: number; shown: boolean}
  | {k: 'nightIntro'}
  | {k: 'night'; order: number[]; pos: number; shown: boolean; seerPick: number | null}
  | {k: 'dawn'; result: NightResult}
  | {k: 'day'}
  | {k: 'vote'; selected: number | null}
  | {k: 'verdict'; eliminated: number | null}
  | {k: 'end'; team: Team};

const DAY_DURATIONS = [120, 180, 300];

export function formatClock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Stepper({label, value, min, max, onChange}: {label: string; value: number; min: number; max: number; onChange: (v: number) => void}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface2/50 px-3 py-2">
      <span className="font-semibold">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost min-h-[40px] px-2" aria-label={`Moins de ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus size={16} aria-hidden />
        </button>
        <span className="w-6 text-center font-mono text-lg" aria-live="polite">{value}</span>
        <button type="button" className="btn-ghost min-h-[40px] px-2" aria-label={`Plus de ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function PickList({players, indices, selected, onPick}: {players: Player[]; indices: number[]; selected: number | null; onPick: (i: number) => void}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {indices.map((i) => (
        <li key={i}>
          <button
            type="button"
            aria-pressed={selected === i}
            onClick={() => onPick(i)}
            className={`btn w-full justify-start border ${selected === i ? 'border-cyan bg-cyan/15 text-ink' : 'border-line bg-surface2/60 text-ink hover:bg-surface2'}`}>
            {players[i].name}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Same-device game: one phone passed around the table. */
export function LocalGame({onExit}: {onExit: () => void}) {
  const [names, setNames] = useState<string[]>([]);
  const [namesError, setNamesError] = useState<string | null>(null);
  const [counts, setCounts] = useState<RoleCounts>(defaultRoleCounts(MIN_PLAYERS));
  const [countsTouched, setCountsTouched] = useState(false);
  const [dayDuration, setDayDuration] = useState(180);
  const [revealDead, setRevealDead] = useState(true);

  const [players, setPlayers] = useState<Player[]>([]);
  const [phase, setPhase] = useState<Phase>({k: 'setup'});
  const [round, setRound] = useState(1);
  const [wolfVotes, setWolfVotes] = useState<number[]>([]);
  const [protectedIdx, setProtectedIdx] = useState<number | null>(null);
  const [lastProtected, setLastProtected] = useState<number | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(dayDuration);
  const [timerRunning, setTimerRunning] = useState(false);

  // Keep the default distribution in step with the number of players until the host customises it.
  useEffect(() => {
    if (!countsTouched) setCounts(defaultRoleCounts(Math.max(names.length, MIN_PLAYERS)));
  }, [names.length, countsTouched]);

  useEffect(() => {
    if (phase.k !== 'day' || !timerRunning) return;
    const t = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [phase.k, timerRunning]);

  const countsError = validateRoleCounts(names.length, counts);
  const canStart = !namesError && !countsError;

  function startGame(sameNames = names) {
    setPlayers(assignRoles(sameNames, counts));
    setRound(1);
    setLastProtected(null);
    setPhase({k: 'reveal', idx: 0, shown: false});
  }

  function startNight() {
    setWolfVotes([]);
    setProtectedIdx(null);
    setPick(null);
    setPhase({k: 'night', order: aliveIndices(players), pos: 0, shown: false, seerPick: null});
  }

  /**
   * Moves the device to the next living player, or resolves the night. The choice just
   * made is passed in explicitly: state updates from this click are not visible yet.
   */
  function nextNightPlayer(
    p: Extract<Phase, {k: 'night'}>,
    made: {wolfVotes?: number[]; protectedIdx?: number | null} = {},
  ) {
    const votes = made.wolfVotes ?? wolfVotes;
    const protect = made.protectedIdx !== undefined ? made.protectedIdx : protectedIdx;
    if (made.wolfVotes) setWolfVotes(votes);
    if (made.protectedIdx !== undefined) {
      setProtectedIdx(protect);
      setLastProtected(protect);
    }
    setPick(null);
    if (p.pos + 1 < p.order.length) {
      setPhase({...p, pos: p.pos + 1, shown: false, seerPick: null});
      return;
    }
    setPhase({k: 'dawn', result: resolveNight(votes, protect)});
  }

  function afterElimination(next: Player[], then: Phase) {
    setPlayers(next);
    const team = winner(next);
    setPhase(team ? {k: 'end', team} : then);
  }

  function quit() {
    if (phase.k === 'setup' || window.confirm('Quitter la partie en cours ?')) setPhase({k: 'setup'});
  }

  const wolves = useMemo(() => players.flatMap((p, i) => (isWolf(p) ? [i] : [])), [players]);

  // ---------------------------------------------------------------------------
  if (phase.k === 'setup') {
    return (
      <Shell title="Loups de Minuit" kicker="Jeu de rôles · même appareil" onBack={onExit} backLabel="Changer de mode">
        <section className="panel p-5">
          <h2 className="mb-1 text-xl font-bold">Les joueurs</h2>
          <p className="mb-4 text-sm text-muted">Asseyez-vous en cercle : l’appareil passera de main en main dans cet ordre.</p>
          <PlayerSetup
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            onChange={(n, err) => {
              setNames(n);
              setNamesError(err);
            }}
          />
        </section>

        <section className="panel mt-4 p-5">
          <h2 className="mb-3 text-xl font-bold">Les rôles</h2>
          <div className="space-y-2">
            <Stepper label="Loups-garous" value={counts.loup} min={1} max={Math.max(1, Math.floor((names.length - 1) / 2))} onChange={(v) => { setCountsTouched(true); setCounts((c) => ({...c, loup: v})); }} />
            <Stepper label="Voyante" value={counts.voyante} min={0} max={1} onChange={(v) => { setCountsTouched(true); setCounts((c) => ({...c, voyante: v})); }} />
            <Stepper label="Protecteur" value={counts.protecteur} min={0} max={1} onChange={(v) => { setCountsTouched(true); setCounts((c) => ({...c, protecteur: v})); }} />
          </div>
          <p className="mt-2 text-sm text-muted">
            Villageois : {Math.max(0, names.length - counts.loup - counts.voyante - counts.protecteur)}
            {countsTouched && (
              <button type="button" className="ml-2 underline" onClick={() => setCountsTouched(false)}>
                répartition conseillée
              </button>
            )}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Durée du débat</span>
              <select className="input" value={dayDuration} onChange={(e) => setDayDuration(Number(e.target.value))}>
                {DAY_DURATIONS.map((d) => (
                  <option key={d} value={d}>{d / 60} minutes</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-line bg-surface2/50 px-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-cyan" checked={revealDead} onChange={(e) => setRevealDead(e.target.checked)} />
              Révéler le rôle des joueurs éliminés
            </label>
          </div>
        </section>

        <details className="panel mt-4 p-5 text-sm text-muted">
          <summary className="cursor-pointer font-semibold text-ink">Comment jouer</summary>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5">
            <li>Chacun découvre son rôle en secret, à tour de rôle.</li>
            <li>La nuit, l’appareil fait le tour de la table : chacun agit en secret (même les villageois, pour ne pas se trahir).</li>
            <li>Au matin, on découvre la victime, puis le village débat et vote pour éliminer un suspect.</li>
            <li>Le village gagne quand tous les loups sont éliminés ; les loups gagnent quand ils sont aussi nombreux que le village.</li>
          </ol>
        </details>

        {(namesError || countsError) && (
          <p role="alert" className="mt-4 text-center text-sm text-warning">{namesError ?? countsError}</p>
        )}
        <button type="button" className="btn-primary mt-4 w-full" disabled={!canStart} onClick={() => startGame()}>
          <Moon size={18} aria-hidden /> Distribuer les rôles
        </button>
      </Shell>
    );
  }

  const header = (title: string, kicker: string) => ({title, kicker, onBack: quit, backLabel: 'Quitter la partie'});

  if (phase.k === 'reveal') {
    const p = players[phase.idx];
    const done = () =>
      phase.idx + 1 < players.length ? setPhase({k: 'reveal', idx: phase.idx + 1, shown: false}) : setPhase({k: 'nightIntro'});
    return (
      <Shell {...header('Découverte des rôles', `Joueur ${phase.idx + 1} / ${players.length}`)}>
        {!phase.shown ? (
          <Handoff name={p.name} hint="Personne d’autre ne doit regarder l’écran." onReady={() => setPhase({...phase, shown: true})} />
        ) : (
          <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 text-center">
            <p className="text-sm uppercase tracking-[0.2em] text-muted">{p.name}, tu es</p>
            <p className={`font-display text-5xl font-bold ${isWolf(p) ? 'text-danger' : 'text-cyan'}`}>{ROLE_INFO[p.role].label}</p>
            <p className="max-w-sm text-muted">{ROLE_INFO[p.role].goal}</p>
            <p className="max-w-sm text-sm text-muted">{ROLE_INFO[p.role].night}</p>
            {isWolf(p) && wolves.length > 1 && (
              <p className="panel px-4 py-3 text-sm">
                Ta meute : <strong>{wolves.filter((i) => i !== phase.idx).map((i) => players[i].name).join(', ')}</strong>
              </p>
            )}
            <button type="button" className="btn-secondary w-full max-w-xs" onClick={done}>
              <Eye size={18} aria-hidden /> J’ai retenu, cacher
            </button>
          </div>
        )}
      </Shell>
    );
  }

  if (phase.k === 'nightIntro') {
    return (
      <Shell {...header(`Nuit ${round}`, 'La nuit tombe')}>
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
          <Moon size={64} className="text-violet" aria-hidden />
          <p className="max-w-md text-lg">
            Le village s’endort. L’appareil va faire le tour de la table : chacun agit en secret, puis le passe à son voisin.
          </p>
          <button type="button" className="btn-primary w-full max-w-xs" onClick={startNight}>
            Commencer la nuit
          </button>
        </div>
      </Shell>
    );
  }

  if (phase.k === 'night') {
    const idx = phase.order[phase.pos];
    const me = players[idx];
    const progress = `${phase.pos + 1} / ${phase.order.length}`;
    if (!phase.shown) {
      return (
        <Shell {...header(`Nuit ${round}`, `Tour de nuit ${progress}`)}>
          <Handoff name={me.name} hint="Garde l’écran pour toi." onReady={() => setPhase({...phase, shown: true})} />
        </Shell>
      );
    }

    const others = aliveIndices(players).filter((i) => i !== idx);
    let body;
    if (me.role === 'loup') {
      const packChoice = resolveWolfVotes(wolfVotes);
      const targets = wolfTargets(players);
      body = (
        <>
          <p className="text-muted">Choisis la victime de la meute.</p>
          {wolves.filter((i) => i !== idx && players[i].alive).length > 0 && (
            <p className="text-sm text-muted">
              Meute : {wolves.filter((i) => i !== idx && players[i].alive).map((i) => players[i].name).join(', ')}
              {packChoice !== null && <> · choix actuel : <strong className="text-danger">{players[packChoice].name}</strong></>}
            </p>
          )}
          <PickList players={players} indices={targets} selected={pick} onPick={setPick} />
          <button type="button" className="btn-danger w-full" disabled={pick === null} onClick={() => nextNightPlayer(phase, {wolfVotes: [...wolfVotes, pick!]})}>
            <Skull size={18} aria-hidden /> Attaquer {pick !== null ? players[pick].name : ''}
          </button>
        </>
      );
    } else if (me.role === 'voyante') {
      body =
        phase.seerPick === null ? (
          <>
            <p className="text-muted">Choisis un joueur dont tu veux découvrir la nature.</p>
            <PickList players={players} indices={others} selected={pick} onPick={setPick} />
            <button type="button" className="btn-primary w-full" disabled={pick === null} onClick={() => setPhase({...phase, seerPick: pick})}>
              <Eye size={18} aria-hidden /> Sonder
            </button>
          </>
        ) : (
          <>
            <p className="panel px-4 py-6 text-center text-xl">
              <strong>{players[phase.seerPick].name}</strong>{' '}
              {isWolf(players[phase.seerPick]) ? <span className="text-danger">est un loup-garou.</span> : <span className="text-success">n’est pas un loup-garou.</span>}
            </p>
            <button type="button" className="btn-secondary w-full" onClick={() => nextNightPlayer(phase)}>
              J’ai vu, cacher et passer
            </button>
          </>
        );
    } else if (me.role === 'protecteur') {
      body = (
        <>
          <p className="text-muted">Qui protèges-tu cette nuit ? Tu peux te choisir, mais pas la même personne que la nuit dernière.</p>
          <PickList players={players} indices={protectTargets(players, lastProtected)} selected={pick} onPick={setPick} />
          <button type="button" className="btn-primary w-full" disabled={pick === null} onClick={() => nextNightPlayer(phase, {protectedIdx: pick})}>
            <Shield size={18} aria-hidden /> Protéger
          </button>
        </>
      );
    } else {
      body = (
        <>
          <p className="text-muted">Tu dors. Désigne quand même ton suspect : ça brouille les pistes (aucun effet sur la partie).</p>
          <PickList players={players} indices={others} selected={pick} onPick={setPick} />
          <button type="button" className="btn-secondary w-full" disabled={pick === null} onClick={() => nextNightPlayer(phase)}>
            Valider et passer
          </button>
        </>
      );
    }
    return (
      <Shell {...header(`Nuit ${round}`, `Tour de nuit ${progress}`)}>
        <div className="space-y-4">
          <p className="tag">{me.name} · {ROLE_INFO[me.role].label}</p>
          {body}
        </div>
      </Shell>
    );
  }

  if (phase.k === 'dawn') {
    const {victim, saved} = phase.result;
    const next = eliminate(players, victim);
    return (
      <Shell {...header(`Jour ${round}`, 'Le jour se lève')}>
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
          <Sun size={64} className="text-warning" aria-hidden />
          {victim !== null ? (
            <p className="max-w-md text-xl">
              <strong>{players[victim].name}</strong> a été attaqué·e cette nuit.
              {revealDead && <> C’était <strong>{ROLE_INFO[players[victim].role].label.toLowerCase()}</strong>.</>}
            </p>
          ) : saved ? (
            <p className="max-w-md text-xl">Les loups ont attaqué… mais leur cible a été protégée. Personne n’est mort.</p>
          ) : (
            <p className="max-w-md text-xl">La nuit a été calme. Personne n’est mort.</p>
          )}
          <button
            type="button"
            className="btn-primary w-full max-w-xs"
            onClick={() => {
              setSecondsLeft(dayDuration);
              setTimerRunning(true);
              afterElimination(next, {k: 'day'});
            }}>
            Ouvrir le débat
          </button>
        </div>
      </Shell>
    );
  }

  if (phase.k === 'day') {
    return (
      <Shell {...header(`Jour ${round}`, 'Débat du village')}>
        <div className="space-y-5 text-center">
          <p className="text-muted">Discutez, accusez, défendez-vous. Puis votez pour éliminer un suspect.</p>
          <p className={`font-mono text-6xl font-bold ${secondsLeft === 0 ? 'text-danger' : ''}`} aria-live="off">{formatClock(secondsLeft)}</p>
          <div className="flex justify-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => setTimerRunning((r) => !r)}>
              {timerRunning ? <><Pause size={18} aria-hidden /> Pause</> : <><Play size={18} aria-hidden /> Reprendre</>}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setSecondsLeft((s) => s + 60)}>+1 min</button>
          </div>
          <div className="panel p-4 text-left">
            <p className="mb-2 flex items-center gap-2 font-semibold"><Users size={16} aria-hidden /> En vie ({aliveIndices(players).length})</p>
            <p className="text-sm text-muted">{aliveIndices(players).map((i) => players[i].name).join(' · ')}</p>
          </div>
          <button type="button" className="btn-primary w-full" onClick={() => { setTimerRunning(false); setPhase({k: 'vote', selected: null}); }}>
            <Vote size={18} aria-hidden /> Passer au vote
          </button>
        </div>
      </Shell>
    );
  }

  if (phase.k === 'vote') {
    return (
      <Shell {...header(`Jour ${round}`, 'Vote du village')}>
        <div className="space-y-4">
          <p className="text-muted">Votez à main levée. Qui le village élimine-t-il ?</p>
          <PickList players={players} indices={aliveIndices(players)} selected={phase.selected} onPick={(i) => setPhase({k: 'vote', selected: i})} />
          <button type="button" className="btn-danger w-full" disabled={phase.selected === null} onClick={() => setPhase({k: 'verdict', eliminated: phase.selected})}>
            Éliminer {phase.selected !== null ? players[phase.selected].name : ''}
          </button>
          <button type="button" className="btn-ghost w-full" onClick={() => setPhase({k: 'verdict', eliminated: null})}>
            Égalité : personne n’est éliminé
          </button>
        </div>
      </Shell>
    );
  }

  if (phase.k === 'verdict') {
    const e = phase.eliminated;
    const next = eliminate(players, e);
    return (
      <Shell {...header(`Jour ${round}`, 'Verdict')}>
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
          {e === null ? (
            <p className="max-w-md text-xl">Le village n’a pas tranché. Personne n’est éliminé.</p>
          ) : (
            <p className="max-w-md text-xl">
              Le village élimine <strong>{players[e].name}</strong>.
              {revealDead && (
                <> C’était <strong className={isWolf(players[e]) ? 'text-danger' : 'text-cyan'}>{ROLE_INFO[players[e].role].label.toLowerCase()}</strong>.</>
              )}
            </p>
          )}
          <button
            type="button"
            className="btn-primary w-full max-w-xs"
            onClick={() => {
              setRound((r) => r + 1);
              afterElimination(next, {k: 'nightIntro'});
            }}>
            <Moon size={18} aria-hidden /> La nuit tombe
          </button>
        </div>
      </Shell>
    );
  }

  // End
  return (
    <Shell title="Fin de partie" kicker={`Après ${round} ${round > 1 ? 'tours' : 'tour'}`} onBack={() => setPhase({k: 'setup'})}>
      <div className="space-y-5 text-center">
        <p className={`font-display text-4xl font-bold ${phase.team === 'loups' ? 'text-danger' : 'text-success'}`}>
          {phase.team === 'loups' ? 'Les loups-garous gagnent !' : 'Le village gagne !'}
        </p>
        <ul className="panel divide-y divide-line text-left">
          {players.map((p) => (
            <li key={p.name} className="flex items-center justify-between px-4 py-3">
              <span className={p.alive ? '' : 'text-muted line-through'}>{p.name}</span>
              <span className={isWolf(p) ? 'font-semibold text-danger' : 'text-cyan'}>{ROLE_INFO[p.role].label}</span>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-primary" onClick={() => startGame(players.map((p) => p.name))}>
            <RotateCcw size={18} aria-hidden /> Rejouer, nouveaux rôles
          </button>
          <button type="button" className="btn-secondary" onClick={() => setPhase({k: 'setup'})}>
            Changer les joueurs
          </button>
        </div>
      </div>
    </Shell>
  );
}
