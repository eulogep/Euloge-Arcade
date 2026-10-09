import {LogIn, UserPlus} from 'lucide-react';
import {useState, type FormEvent} from 'react';
import {Link, Navigate, useLocation, useNavigate} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {LogoMark} from '@/components/ui/Logo';
import {EmptyState} from '@/components/ui/feedback';
import {useDocumentTitle} from '@/hooks/useDocumentTitle';
import {cn} from '@/lib/cn';
import {authErrorMessage, signIn, signUp} from '@/services/authService';

export default function AuthPage() {
  const {backendEnabled, user, authReady} = usePlatform();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  useDocumentTitle(mode === 'signin' ? 'Connexion' : 'Inscription');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as {from?: string} | null)?.from ?? '/profil';

  if (!backendEnabled) {
    return (
      <div className="container-page py-24">
        <EmptyState title="Comptes indisponibles">
          Cette instance fonctionne en mode local : favoris et historique sont enregistrés dans ton navigateur.
        </EmptyState>
      </div>
    );
  }
  if (authReady && user) return <Navigate to={redirectTo} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (mode === 'signup' && password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
        navigate(redirectTo, {replace: true});
      } else {
        const {needsConfirmation} = await signUp(email.trim(), password, displayName.trim() || email.split('@')[0]);
        if (needsConfirmation) setInfo('Compte créé ! Clique sur le lien reçu par e-mail pour l’activer.');
        else navigate('/profil', {replace: true});
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page flex justify-center py-12 sm:py-20">
      <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-6 shadow-card sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark className="h-14 w-14" title={null} />
          <h1 className="mt-4 font-display text-2xl font-black">{mode === 'signin' ? 'Bon retour !' : 'Rejoins Euloge Arcade'}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {mode === 'signin' ? 'Retrouve tes favoris, ton historique et tes succès.' : 'Synchronise tes favoris et tes scores sur tous tes appareils.'}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-xl bg-surface-2/70 p-1" role="tablist" aria-label="Choisir">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn('h-10 rounded-lg text-sm font-semibold transition', mode === m ? 'bg-surface text-ink shadow' : 'text-ink-muted')}>
              {m === 'signin' ? 'Connexion' : 'Inscription'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4" noValidate>
          {mode === 'signup' && (
            <div>
              <label htmlFor="displayName" className="label">Pseudo</label>
              <input id="displayName" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} autoComplete="nickname" />
            </div>
          )}
          <div>
            <label htmlFor="email" className="label">E-mail</label>
            <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <label htmlFor="password" className="label">Mot de passe</label>
            <input
              id="password"
              type="password"
              required
              minLength={mode === 'signup' ? 8 : undefined}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
            {mode === 'signup' && <p className="mt-1 text-xs text-ink-faint">8 caractères minimum.</p>}
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          {info && (
            <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
              {info}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy || !email || !password}>
            {mode === 'signin' ? <LogIn size={18} /> : <UserPlus size={18} />}
            {busy ? 'Un instant…' : mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-ink-faint">
          En créant un compte, tu acceptes notre <Link to="/confidentialite" className="underline">politique de confidentialité</Link>.
        </p>
      </div>
    </div>
  );
}
