import {
  Activity,
  Award,
  Camera,
  Clock,
  Compass,
  Cpu,
  Crosshair,
  Flame,
  Heart,
  Lock,
  LogIn,
  Palette,
  Rocket,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react';
import {useEffect, useMemo, useRef, useState, type FormEvent} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {usePlatform, type ChromaSkin} from '@/app/PlatformProvider';
import {Avatar} from '@/components/layout/Header';
import {useDocumentTitle} from '@/hooks/useDocumentTitle';
import {cn} from '@/lib/cn';
import {computeGenreAffinity, computePlayerPrestige, getCartridgeCode} from '@/lib/prestige';
import {playClickPulse} from '@/lib/sound';
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
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => {
            playClickPulse();
            onChange(e.target.checked);
          }}
        />
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
    <section className="holo-panel reticle-frame flex flex-col gap-6 rounded-3xl p-6 sm:flex-row sm:items-center">
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

const ATMOSPHERES: {id: ChromaSkin; theme: 'dark' | 'light'; label: string; desc: string; swatch: string}[] = [
  {id: 'obsidian', theme: 'dark', label: 'Obsidian Pulse', desc: 'Saphir électrique & plasma violet (Défaut)', swatch: 'from-[#38E1FF] to-[#A24DFF]'},
  {id: 'gold', theme: 'dark', label: 'Atelier Cyber-Or', desc: 'Carbone profond & or solaire', swatch: 'from-[#FDE047] to-[#F43F5E]'},
  {id: 'phosphor', theme: 'dark', label: 'Terminal Phosphore', desc: 'Matrice CRT & bio-émeraude', swatch: 'from-[#34D399] to-[#06B6D4]'},
  {id: 'obsidian', theme: 'light', label: 'Prisme Solaire', desc: 'Clarté architecturale haute lisibilité', swatch: 'from-[#2563EB] to-[#7E22CE]'},
];

export default function ProfilePage() {
  useDocumentTitle('Mon profil');
  const {
    user,
    backendEnabled,
    catalog,
    games,
    favorites,
    unlocked,
    history,
    runs,
    gameById,
    clearHistory,
    settings,
    updateSettings,
    recommendationsConsent,
    setRecommendationsConsent,
    setReflexLabOpen,
    signOut,
    notify,
  } = usePlatform();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const achievements = catalog.status === 'ready' ? catalog.achievements : [];
  const unlockedMap = new Map(unlocked.map((u) => [u.id, u.unlockedAt]));
  const unlockedCount = unlocked.filter((u) => achievements.some((a) => a.id === u.id)).length;

  const uniqueLaunched = useMemo(() => new Set(history.map((h) => h.gameId)), [history]);

  const prestige = useMemo(
    () =>
      computePlayerPrestige({
        uniqueGamesLaunched: uniqueLaunched.size,
        totalLaunches: history.length,
        favoriteCount: favorites.size,
        unlockedAchievements: unlockedCount,
        runs,
      }),
    [uniqueLaunched.size, history.length, favorites.size, unlockedCount, runs],
  );

  const genreDna = useMemo(
    () => computeGenreAffinity(games, favorites, history.map((h) => h.gameId)),
    [games, favorites, history],
  );

  return (
    <div className="container-page space-y-8 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="hud-tag text-accent-3 mb-2">
            <Cpu size={12} /> PASSEPORT HOLOGRAPHIQUE // EULOGE ARCADE
          </span>
          <h1 className="font-display text-3xl font-black sm:text-4xl">
            Mon <span className="text-gradient">espace</span>
          </h1>
        </div>
        <button
          type="button"
          onClick={() => {
            playClickPulse();
            setReflexLabOpen(true);
          }}
          className="btn-secondary h-10 min-h-0 px-3.5 text-xs">
          <Crosshair size={15} className="text-accent-3" /> Calibrateur de réflexes
        </button>
      </div>

      {user ? (
        <ProfileHeader />
      ) : (
        <section className="holo-panel reticle-frame flex flex-col items-start gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between">
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

      {/* Holographic Player Prestige & Genre DNA Grid */}
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        {/* Prestige Passport Card */}
        <section aria-labelledby="prestige-title" className="holo-panel reticle-frame min-w-0 rounded-3xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient font-mono text-base font-black text-white shadow-glow">
                N.{prestige.level}
              </span>
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent-3">
                  {prestige.rankBadge} // GRADE D'ARCADE
                </span>
                <h2 id="prestige-title" className="font-display text-xl font-black">
                  {prestige.rankTitle}
                </h2>
              </div>
            </div>
            <span className="hud-tag">
              <Sparkles size={12} className="text-accent-3" /> {prestige.xp} XP TOTAL
            </span>
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex justify-between font-mono text-xs text-ink-muted">
              <span>Progression vers Niveau {prestige.level + 1}</span>
              <span>
                {prestige.currentLevelXp} / {prestige.nextLevelXp} XP ({prestige.progressPercent}%)
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-brand-gradient transition-all duration-500"
                style={{width: `${Math.max(5, prestige.progressPercent)}%`}}
              />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border bg-surface/60 p-3 text-center border-line-soft">
              <p className="font-display text-2xl font-black text-ink">{uniqueLaunched.size}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">Cartouches</p>
            </div>
            <div className="rounded-2xl border bg-surface/60 p-3 text-center border-line-soft">
              <p className="font-display text-2xl font-black text-ink">{history.length}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">Sessions</p>
            </div>
            <div className="rounded-2xl border bg-surface/60 p-3 text-center border-line-soft">
              <p className="font-display text-2xl font-black text-accent-3">{favorites.size}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">Favoris</p>
            </div>
            <div className="rounded-2xl border bg-surface/60 p-3 text-center border-line-soft">
              <p className="font-display text-2xl font-black text-warning">
                {unlockedCount}/{achievements.length}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">Succès</p>
            </div>
          </div>
        </section>

        {/* Genre DNA Radar */}
        <section aria-labelledby="dna-title" className="holo-panel reticle-frame min-w-0 rounded-3xl p-6">
          <h2 id="dna-title" className="flex items-center gap-2 font-display text-lg font-bold">
            <Activity size={18} className="text-accent-3" /> ADN de Joueur (Affinités)
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Calculé localement sur ton appareil d'après tes favoris et tes lancements.
          </p>
          {genreDna.length === 0 ? (
            <div className="mt-6 rounded-2xl border bg-surface/50 p-5 text-center text-xs text-ink-muted border-line-soft">
              Lance un jeu ou ajoute un favori pour révéler ton profil d'affinité par genre.
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {genreDna.map((item) => (
                <li key={item.genre}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <Link to={`/jeux?genre=${item.genre}`} className="font-semibold text-ink hover:text-accent-3">
                      {item.label}
                    </Link>
                    <span className="font-mono text-[11px] text-ink-faint">{item.percent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-brand-gradient transition-all duration-500"
                      style={{width: `${item.percent}%`}}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="ach-title">
        <h2 id="ach-title" className="section-title mb-4 flex items-center gap-2">
          <Award size={20} className="text-warning" /> Succès{' '}
          <span className="text-base font-semibold text-ink-muted">
            {unlockedCount}/{achievements.length}
          </span>
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.map((a) => {
            const at = unlockedMap.get(a.id);
            const Icon = ACHIEVEMENT_ICONS[a.icon] ?? Trophy;
            return (
              <li key={a.id} className={cn('holo-panel flex items-center gap-3 rounded-2xl p-4', !at && 'opacity-60')}>
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
          <ul className="holo-panel divide-y divide-ink/5 rounded-2xl">
            {history.slice(0, 20).map((h, i) => {
              const g = gameById.get(h.gameId);
              if (!g) return null;
              return (
                <li key={h.playedAt + i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono text-[10px] font-bold text-accent-3 shrink-0">{getCartridgeCode(g)}</span>
                    <Link to={`/jeux/${g.slug}`} className="truncate font-semibold hover:text-accent-3">
                      {g.title}
                    </Link>
                  </div>
                  <time dateTime={h.playedAt} className="text-xs text-ink-faint shrink-0">
                    {new Date(h.playedAt).toLocaleString('fr-FR', {dateStyle: 'medium', timeStyle: 'short'})}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="settings-title" className="holo-panel reticle-frame rounded-2xl p-5 sm:p-6">
        <h2 id="settings-title" className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
          <SettingsIcon size={18} className="text-accent-3" /> Paramètres &amp; Studio d'Atmosphère
        </h2>

        {/* Chroma Atmosphere Selector */}
        <div className="mb-5">
          <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">
            <Palette size={14} className="text-accent-3" /> Atmosphère Signature
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {ATMOSPHERES.map((atm) => {
              const active =
                atm.theme === 'light'
                  ? settings.theme === 'light'
                  : settings.theme === 'dark' && settings.skin === atm.id;
              return (
                <button
                  key={atm.label}
                  type="button"
                  onClick={() => {
                    playClickPulse();
                    updateSettings({theme: atm.theme, skin: atm.id});
                  }}
                  aria-pressed={active}
                  className={cn(
                    'flex flex-col items-start gap-1.5 rounded-2xl border p-3.5 text-left transition border-line-soft',
                    active ? 'border-accent-3/60 bg-accent/15 shadow-glow' : 'bg-surface/60 hover:bg-surface-2',
                  )}>
                  <div className="flex w-full items-center justify-between">
                    <span className={cn('h-3.5 w-10 rounded-full bg-gradient-to-r', atm.swatch)} />
                    {active && <span className="font-mono text-[10px] font-bold text-accent-3">ACTIF</span>}
                  </div>
                  <p className="font-display text-sm font-bold text-ink">{atm.label}</p>
                  <p className="text-[11px] leading-snug text-ink-muted">{atm.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="divide-y divide-ink/5 border-t border-line-soft pt-2">
          <Toggle
            checked={settings.theme === 'light'}
            onChange={(v) => updateSettings({theme: v ? 'light' : 'dark'})}
            label="Thème clair"
            description="Le thème sombre est utilisé par défaut."
          />
          <Toggle
            checked={settings.soundEnabled}
            onChange={(v) => updateSettings({soundEnabled: v})}
            label="Son tactile d'interface"
            description="Synthétiseur Web Audio procédural lors des interactions avec la console."
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
        <section aria-labelledby="account-title" className="holo-panel rounded-2xl p-5">
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
