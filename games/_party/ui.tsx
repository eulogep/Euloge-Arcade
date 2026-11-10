import {ArrowLeft, Eye, Plus, Smartphone, Trash2} from 'lucide-react';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {cleanName, loadPlayers, MAX_NAME_LENGTH, savePlayers, validatePlayers} from './players';

/** Full-height screen with a slim header. Content scrolls; safe areas respected. */
export function Shell({
  title,
  kicker,
  onBack,
  backLabel = 'Retour',
  right,
  children,
}: {
  title: string;
  kicker?: string;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col" style={{paddingBottom: 'env(safe-area-inset-bottom)'}}>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur">
        {onBack && (
          <button type="button" onClick={onBack} className="btn-ghost min-h-[40px] px-2" aria-label={backLabel}>
            <ArrowLeft size={20} aria-hidden />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {kicker && <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan">{kicker}</p>}
          <h1 className="truncate text-lg font-bold sm:text-xl">{title}</h1>
        </div>
        {right}
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 sm:py-8">{children}</main>
    </div>
  );
}

/** Editable list of player names, remembered on this device. */
export function PlayerSetup({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (names: string[], error: string | null) => void;
}) {
  const [names, setNames] = useState<string[]>(() =>
    loadPlayers(Array.from({length: min}, (_, i) => `Joueur ${i + 1}`)).slice(0, max),
  );
  const lastInput = useRef<HTMLInputElement>(null);
  const [focusLast, setFocusLast] = useState(false);

  useEffect(() => {
    const error = validatePlayers(names, min, max);
    onChange(names.map(cleanName), error);
    if (!error) savePlayers(names);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, min, max]);

  useEffect(() => {
    if (focusLast) {
      lastInput.current?.focus();
      lastInput.current?.select();
      setFocusLast(false);
    }
  }, [focusLast]);

  return (
    <div>
      <ol className="space-y-2">
        {names.map((name, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-7 shrink-0 text-right font-mono text-sm text-muted">{i + 1}.</span>
            <input
              ref={i === names.length - 1 ? lastInput : undefined}
              className="input"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              aria-label={`Prénom du joueur ${i + 1}`}
              onChange={(e) => setNames((n) => n.map((v, j) => (j === i ? e.target.value : v)))}
            />
            <button
              type="button"
              className="btn-ghost min-h-[44px] px-3"
              disabled={names.length <= min}
              aria-label={`Retirer ${cleanName(name) || `le joueur ${i + 1}`}`}
              onClick={() => setNames((n) => n.filter((_, j) => j !== i))}>
              <Trash2 size={18} aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn-secondary mt-3 w-full"
        disabled={names.length >= max}
        onClick={() => {
          setNames((n) => [...n, `Joueur ${n.length + 1}`]);
          setFocusLast(true);
        }}>
        <Plus size={18} aria-hidden /> Ajouter un joueur
      </button>
      <p className="mt-2 text-center text-xs text-muted">
        {min} à {max} joueurs · les prénoms restent sur cet appareil.
      </p>
    </div>
  );
}

/**
 * Hides secret information between players sharing one device. The next player
 * confirms who they are before anything private is shown.
 */
export function Handoff({name, hint, onReady}: {name: string; hint?: string; onReady: () => void}) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-cyan/40 bg-cyan/10">
        <Smartphone size={36} className="text-cyan" aria-hidden />
      </div>
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted">Passe l’appareil à</p>
        <p className="mt-2 font-display text-4xl font-bold">{name}</p>
        {hint && <p className="mx-auto mt-3 max-w-sm text-sm text-muted">{hint}</p>}
      </div>
      <button type="button" className="btn-primary w-full max-w-xs" onClick={onReady} autoFocus>
        <Eye size={18} aria-hidden /> C’est moi, {name}
      </button>
    </div>
  );
}
