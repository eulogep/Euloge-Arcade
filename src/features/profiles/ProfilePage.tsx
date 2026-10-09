import {
  Award,
  Camera,
  Clock,
  Compass,
  Flame,
  Heart,
  Lock,
  LogIn,
  Rocket,
  Settings as SettingsIcon,
  Shield,
  Trash2,
  Trophy,
} from 'lucide-react';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {Avatar} from '@/components/layout/Header';
import {useDocumentTitle} from '@/hooks/useDocumentTitle';
import {cn} from '@/lib/cn';
import {deleteAccount, updateProfile, uploadAvatar} from '@/services/authService';

const ACHIEVEMENT_ICONS: Record<string, typeof Trophy> = {
  rocket: Rocket,
  compass: Compass,
  heart: Heart,
  trophy: Trophy,
  shield: Shield,
  flame: Flame,
};

function Toggle({checked, onChange, label, description}: {checked: boolean; onChange: (v: boolean) => void; label: string; description?: string}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-muted">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-surface-2 ring-1 ring-ink/15 transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent-3" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function ProfileHeader() {
  const {user, profile, refreshProfile, notify} = usePlatform();
  const [name, setName] = useState(profile?.displayName ?? '');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setName(profile?.displayName ?? ''), [profile?.displayName]);
  if (!user || !profile) return null;

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await updateProfile(user.id, {displayName: name});
      await refreshProfile();
      notify({tone: 'success', title: 'Pseudo mis à jour'});
    } catch {
      notify({tone: 'error', title: 'Impossible de modifier le pseudo'});
    } finally {
      setBusy(false);
    }
  };

  const onAvatar = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadAvatar(user.id, file);
      await updateProfile(user.id, {avatarUrl: url});
      await refreshProfile();
      notify({tone: 'success', title: 'Avatar mis à jour'});
    } catch (err) {
      notify({tone: 'error', title: "Échec de l'envoi de l'avatar", body: err instanceof Error ? err.message : undefined});
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section className="glass flex flex-col gap-6 rounded-3xl p-6 sm:flex-row sm:items-center">
      <div className="relative w-fit">
        <Avatar url={profile.avatarUrl} name={profile.displayName} size={96} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="btn-secondary absolute -bottom-1 -right-1 h-9 min-h-0 w-9 rounded-full px-0"
          aria-label="Changer d'avatar">
          <Camera size={16} />
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void onAvatar(e.target.files?.[0])} />
      </div>
      <div className="flex-1">
        <form onSubmit={saveName} className="flex max-w-md items-end gap-2">
          <div className="flex-1">
            <label htmlFor="pseudo" className="label">Pseudo</label>
            <input id="pseudo" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </div>
          <button type="submit" className="btn-secondary" disabled={busy || name.trim() === profile.displayName}>
            Enregistrer
          </button>
        </form>
        <p className="mt-2 text-xs text-ink-faint">
          {user.email} · membre depuis le {new Date(profile.createdAt).toLocaleDateString('fr-FR')}
          {profile.role === 'admin' && <span className="ml-2 rounded bg-accent-2/20 px-1.5 py-0.5 font-semibold text-accent-2">Administrateur</span>}
        </p>
      </div>
    </section>
  );
}

export default function ProfilePage() {
  useDocumentTitle('Mon profil');
  const {
    user,
    backendEnabled,
    catalog,
    unlocked,
    history,
    gameById,
    clearHistory,
    settings,
    updateSettings,
    recommendationsConsent,
    setRecommendationsConsent,
    signOut,
    notify,
  } = usePlatform();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const achievements = catalog.status === 'ready' ? catalog.achievements : [];
  const unlockedMap = new Map(unlocked.map((u) => [u.id, u.unlockedAt]));

  return (
    <div className="container-page space-y-8 pt-8">
      <h1 className="font-display text-3xl font-black sm:text-4xl">
        Mon <span className="text-gradient">espace</span>
      </h1>

      {user ? (
        <ProfileHeader />
      ) : (
        <section className="glass flex flex-col items-start gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">Tu joues en invité</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Tes favoris, ton historique et tes succès sont enregistrés dans ce navigateur.
              {backendEnabled && ' Crée un compte pour les synchroniser : ils seront transférés automatiquement.'}
            </p>
          </div>
          {backendEnabled && (
            <Link to="/connexion" className="btn-primary shrink-0">
              <LogIn size={16} /> Connexion / inscription
            </Link>
          )}
        </section>
      )}

      <section aria-labelledby="ach-title">
        <h2 id="ach-title" className="section-title mb-4 flex items-center gap-2">
          <Award size={20} className="text-warning" /> Succès{' '}
          <span className="text-base font-semibold text-ink-muted">
            {unlocked.filter((u) => achievements.some((a) => a.id === u.id)).length}/{achievements.length}
          </span>
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.map((a) => {
            const at = unlockedMap.get(a.id);
            const Icon = ACHIEVEMENT_ICONS[a.icon] ?? Trophy;
            return (
              <li key={a.id} className={cn('glass flex items-center gap-3 rounded-2xl p-4', !at && 'opacity-60')}>
                <span
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                    at ? 'bg-brand-gradient text-white shadow-glow' : 'bg-surface-2 text-ink-faint',
                  )}>
                  {at ? <Icon size={20} /> : <Lock size={18} />}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{a.title}</p>
                  <p className="text-xs text-ink-muted">{a.description}</p>
                  {at && <p className="mt-0.5 text-[11px] text-ink-faint">Débloqué le {new Date(at).toLocaleDateString('fr-FR')}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="hist-title">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="hist-title" className="section-title flex items-center gap-2">
            <Clock size={20} className="text-accent-3" /> Historique
          </h2>
          {history.length > 0 && (
            <button
              type="button"
              className="btn-ghost h-9 min-h-0 text-xs"
              onClick={() =>
                void clearHistory()
                  .then(() => notify({tone: 'success', title: 'Historique effacé'}))
                  .catch(() => notify({tone: 'error', title: "Impossible d'effacer l'historique"}))
              }>
              <Trash2 size={14} /> Effacer
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucun jeu lancé pour l'instant.</p>
        ) : (
          <ul className="glass divide-y divide-ink/5 rounded-2xl">
            {history.slice(0, 20).map((h, i) => {
              const g = gameById.get(h.gameId);
              if (!g) return null;
              return (
                <li key={h.playedAt + i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <Link to={`/jeux/${g.slug}`} className="font-semibold hover:text-accent-3">
                    {g.title}
                  </Link>
                  <time dateTime={h.playedAt} className="text-xs text-ink-faint">
                    {new Date(h.playedAt).toLocaleString('fr-FR', {dateStyle: 'medium', timeStyle: 'short'})}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="settings-title" className="glass rounded-2xl p-5">
        <h2 id="settings-title" className="mb-2 flex items-center gap-2 font-display text-lg font-bold">
          <SettingsIcon size={18} className="text-accent-3" /> Paramètres
        </h2>
        <div className="divide-y divide-ink/5">
          <Toggle
            checked={settings.theme === 'light'}
            onChange={(v) => updateSettings({theme: v ? 'light' : 'dark'})}
            label="Thème clair"
            description="Le thème sombre est utilisé par défaut."
          />
          <Toggle
            checked={settings.reducedMotion}
            onChange={(v) => updateSettings({reducedMotion: v})}
            label="Réduire les animations"
            description="Désactive les effets de mouvement (activé automatiquement si ton système le demande)."
          />
          <Toggle
            checked={recommendationsConsent}
            onChange={(v) =>
              void setRecommendationsConsent(v).catch(() => notify({tone: 'error', title: 'Impossible de modifier ce réglage'}))
            }
            label="Recommandations personnalisées"
            description="Utilise les genres de tes favoris et de ton historique pour te suggérer des jeux."
          />
        </div>
      </section>

      {user && (
        <section aria-labelledby="account-title" className="glass rounded-2xl p-5">
          <h2 id="account-title" className="mb-4 font-display text-lg font-bold">
            Compte
          </h2>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-secondary" onClick={() => void signOut().then(() => navigate('/'))}>
              Déconnexion
            </button>
            {!confirmDelete ? (
              <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} /> Supprimer mon compte
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-danger/10 p-3">
                <p className="text-sm text-danger">Suppression définitive du compte, des favoris, de l'historique et des scores.</p>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() =>
                    void deleteAccount()
                      .then(() => {
                        notify({tone: 'success', title: 'Compte supprimé'});
                        navigate('/');
                        window.location.reload();
                      })
                      .catch(() => notify({tone: 'error', title: 'La suppression a échoué', body: 'Réessaie plus tard.'}))
                  }>
                  Confirmer
                </button>
                <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>
                  Annuler
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
