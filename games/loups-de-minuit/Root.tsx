import {Smartphone, Wifi} from 'lucide-react';
import {useState} from 'react';
import {codeFromUrl, lastRoom, ONLINE_AVAILABLE} from '../_party/online';
import {Shell} from '../_party/ui';
import {LocalGame} from './App';
import {OnlineGame} from './Online';

type Mode = 'choose' | 'local' | 'online';

/** Entry point: same device, or online with one device per player. */
export default function Root() {
  // An invitation link (?salon=CODE) or a room left open goes straight online.
  const [mode, setMode] = useState<Mode>(() =>
    ONLINE_AVAILABLE && (codeFromUrl() || lastRoom('loups-de-minuit')) ? 'online' : 'choose',
  );
  if (mode === 'local') return <LocalGame onExit={() => setMode('choose')} />;
  if (mode === 'online') return <OnlineGame onExit={() => setMode('choose')} />;
  return (
    <Shell title="Loups de Minuit" kicker="Jeu de rôles et de bluff">
      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" className="panel p-6 text-left transition hover:border-cyan/60" onClick={() => setMode('local')}>
          <Smartphone size={28} className="text-cyan" aria-hidden />
          <p className="mt-3 font-display text-xl font-bold">Sur cet appareil</p>
          <p className="mt-1 text-sm text-muted">Tout le monde dans la même pièce : le téléphone passe de main en main.</p>
        </button>
        <button
          type="button"
          className="panel p-6 text-left transition hover:border-cyan/60 disabled:opacity-50"
          onClick={() => setMode('online')}
          disabled={!ONLINE_AVAILABLE}
          aria-describedby={ONLINE_AVAILABLE ? undefined : 'online-off'}>
          <Wifi size={28} className="text-violet" aria-hidden />
          <p className="mt-3 font-display text-xl font-bold">En ligne</p>
          <p className="mt-1 text-sm text-muted">Chacun sur son appareil, même à distance, avec un code de salon.</p>
          {!ONLINE_AVAILABLE && (
            <p id="online-off" className="mt-2 text-xs text-warning">Indisponible : cette installation n’a pas de serveur de jeu.</p>
          )}
        </button>
      </div>
    </Shell>
  );
}
