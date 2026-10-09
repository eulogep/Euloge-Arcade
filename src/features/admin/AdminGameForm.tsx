import {ArrowLeft, Plus, Save, Trash2, Upload} from 'lucide-react';
import {useEffect, useState, type FormEvent, type ReactNode} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {ErrorState, Skeleton} from '@/components/ui/feedback';
import {AdminGuard} from '@/features/admin/AdminGuard';
import {useDocumentTitle} from '@/hooks/useDocumentTitle';
import {GENRE_LABELS} from '@/lib/catalog';
import {gameInputSchema, LICENSES_ALLOWED_FOR_MODE, type GameInput} from '@/lib/gameSchema';
import {adminDeleteGame, adminErrorMessage, adminGetGame, adminSaveGame, adminUploadCover} from '@/services/adminService';
import {GENRES, LICENSE_STATUSES, type ControlDevice, type Game, type Genre} from '@/types/game';

const EMPTY: GameInput = {
  slug: '',
  title: '',
  tagline: '',
  description: '',
  instructions: '',
  genre: [],
  cover_url: null,
  banner_url: null,
  launch_mode: 'external',
  launch_url: '',
  source_url: null,
  developer: null,
  license_status: 'unverified',
  license_notes: null,
  compatibility: {keyboard: false, mouse: false, gamepad: false, touch: false, verified: false},
  controls: [],
  orientation: 'any',
  featured: false,
  featured_rank: null,
  supports_scores: false,
  status: 'draft',
};

function fromGame(g: Game): GameInput {
  return {
    slug: g.slug,
    title: g.title,
    tagline: g.tagline,
    description: g.description,
    instructions: g.instructions,
    genre: g.genre,
    cover_url: g.coverUrl,
    banner_url: g.bannerUrl,
    launch_mode: g.launchMode,
    launch_url: g.launchUrl,
    source_url: g.sourceUrl,
    developer: g.developer,
    license_status: g.licenseStatus,
    license_notes: g.licenseNotes,
    compatibility: g.compatibility,
    controls: g.controls,
    orientation: g.orientation,
    featured: g.featured,
    featured_rank: g.featuredRank,
    supports_scores: g.supportsScores,
    status: g.status,
  };
}

const LICENSE_HELP: Record<string, string> = {
  owned: 'Création originale, droits détenus.',
  open_source: 'Licence libre permettant la redistribution (créditer la licence dans les notes).',
  embed_permitted: "L'éditeur autorise explicitement l'intégration (préciser la source dans les notes).",
  link_only: 'Aucun droit de diffusion : simple lien vers le site officiel.',
  unverified: 'Droits non vérifiés : publication impossible.',
};

const MODE_HELP = {
  hosted: 'Mode A — fichiers du jeu présents dans le dépôt sous /games/<slug>/ (déployés avec le site). Aucun téléversement de code via cette interface.',
  embed: "Mode B — iframe d'un domaine figurant dans la liste des intégrations autorisées.",
  external: "Mode C — bouton « Ouvrir le jeu » vers le site officiel, sans iframe.",
};

function Field({label, error, children, hint}: {label: string; error?: string; children: ReactNode; hint?: string}) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
      {error && <p className="mt-1 text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}

export default function AdminGameForm() {
  const {id} = useParams();
  const isNew = !id;
  useDocumentTitle(isNew ? 'Ajouter un jeu' : 'Modifier un jeu');
  const navigate = useNavigate();
  const {notify, reloadCatalog} = usePlatform();
  const [form, setForm] = useState<GameInput | null>(isNew ? EMPTY : null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'cover_url' | 'banner_url' | null>(null);

  useEffect(() => {
    if (isNew || !id) return;
    adminGetGame(id)
      .then((g) => (g ? setForm(fromGame(g)) : setLoadError('Jeu introuvable.')))
      .catch((e) => setLoadError(adminErrorMessage(e)));
  }, [id, isNew]);

  if (loadError) {
    return (
      <AdminGuard>
        <ErrorState title="Impossible d'ouvrir ce jeu" message={loadError} />
      </AdminGuard>
    );
  }
  if (!form) {
    return (
      <AdminGuard>
        <Skeleton className="h-96" />
      </AdminGuard>
    );
  }

  const set = <K extends keyof GameInput>(key: K, value: GameInput[K]) => setForm((f) => (f ? {...f, [key]: value} : f));
  const allowedLicenses = LICENSES_ALLOWED_FOR_MODE[form.launch_mode];

  const upload = async (key: 'cover_url' | 'banner_url', file?: File) => {
    if (!file) return;
    setUploading(key);
    try {
      const url = await adminUploadCover(file, form.slug || 'game');
      set(key, url);
      notify({tone: 'success', title: 'Image téléversée'});
    } catch (e) {
      notify({tone: 'error', title: 'Téléversement refusé', body: adminErrorMessage(e)});
    } finally {
      setUploading(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = gameInputSchema.safeParse(form);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) map[issue.path.join('.')] ??= issue.message;
      setErrors(map);
      notify({tone: 'error', title: 'Formulaire incomplet', body: 'Corrige les champs signalés.'});
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await adminSaveGame(parsed.data, id);
      notify({tone: 'success', title: isNew ? 'Jeu créé' : 'Modifications enregistrées', body: parsed.data.title});
      reloadCatalog();
      navigate('/admin');
    } catch (err) {
      notify({tone: 'error', title: 'Enregistrement refusé', body: adminErrorMessage(err)});
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!id || !window.confirm('Supprimer définitivement ce jeu ? Les favoris et historiques associés seront effacés.')) return;
    try {
      await adminDeleteGame(id);
      reloadCatalog();
      navigate('/admin');
    } catch (err) {
      notify({tone: 'error', title: 'Suppression refusée', body: adminErrorMessage(err)});
    }
  };

  const textInput = (key: 'slug' | 'title' | 'tagline' | 'launch_url', props: Record<string, unknown> = {}) => (
    <input className="input" value={(form[key] as string) ?? ''} onChange={(e) => set(key, e.target.value)} aria-invalid={!!errors[key]} {...props} />
  );
  const nullableInput = (key: 'cover_url' | 'banner_url' | 'source_url' | 'developer') => (
    <input className="input" value={form[key] ?? ''} onChange={(e) => set(key, e.target.value || null)} aria-invalid={!!errors[key]} />
  );

  return (
    <AdminGuard>
      <form onSubmit={submit} className="space-y-8" noValidate>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link to="/admin" className="btn-ghost h-9 min-h-0 px-2" aria-label="Retour">
              <ArrowLeft size={18} />
            </Link>
            <h1 className="font-display text-2xl font-black">{isNew ? 'Ajouter un jeu' : `Modifier · ${form.title}`}</h1>
          </div>
          <div className="flex gap-2">
            {!isNew && (
              <button type="button" className="btn-danger" onClick={() => void remove()}>
                <Trash2 size={16} /> Supprimer
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={saving}>
              <Save size={16} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>

        <section className="glass grid gap-5 rounded-2xl p-5 md:grid-cols-2">
          <h2 className="font-display text-lg font-bold md:col-span-2">Identité</h2>
          <Field label="Titre" error={errors.title}>{textInput('title', {maxLength: 80})}</Field>
          <Field label="Slug (URL)" error={errors.slug} hint="minuscules-et-tirets">{textInput('slug', {maxLength: 60})}</Field>
          <div className="md:col-span-2">
            <Field label="Accroche" error={errors.tagline}>{textInput('tagline', {maxLength: 140})}</Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Description" error={errors.description}>
              <textarea className="input min-h-[120px] py-2" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={4000} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Comment jouer" error={errors.instructions}>
              <textarea className="input min-h-[90px] py-2" value={form.instructions} onChange={(e) => set('instructions', e.target.value)} maxLength={4000} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Genres" error={errors.genre}>
              <div className="flex flex-wrap gap-2">
                {GENRES.map((g: Genre) => (
                  <label key={g} className="chip cursor-pointer has-[:checked]:border-accent/60 has-[:checked]:bg-accent/15">
                    <input
                      type="checkbox"
                      className="accent-[rgb(var(--accent))]"
                      checked={form.genre.includes(g)}
                      onChange={(e) => set('genre', e.target.checked ? [...form.genre, g] : form.genre.filter((x) => x !== g))}
                    />
                    {GENRE_LABELS[g]}
                  </label>
                ))}
              </div>
            </Field>
          </div>
          <Field label="Développeur / éditeur" error={errors.developer}>{nullableInput('developer')}</Field>
          <Field label="Orientation">
            <select className="input" value={form.orientation} onChange={(e) => set('orientation', e.target.value as GameInput['orientation'])}>
              <option value="any">Indifférente</option>
              <option value="landscape">Paysage</option>
              <option value="portrait">Portrait</option>
            </select>
          </Field>
        </section>

        <section className="glass grid gap-5 rounded-2xl p-5 md:grid-cols-2">
          <h2 className="font-display text-lg font-bold md:col-span-2">Visuels</h2>
          {(['cover_url', 'banner_url'] as const).map((key) => (
            <Field key={key} label={key === 'cover_url' ? 'Couverture (16:10)' : 'Bannière (21:9)'} error={errors[key]} hint="PNG, JPEG, WebP ou AVIF · 2 Mo max · pas de SVG">
              <div className="flex gap-2">
                {nullableInput(key)}
                <label className="btn-secondary cursor-pointer">
                  <Upload size={16} /> {uploading === key ? '…' : 'Envoyer'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" onChange={(e) => void upload(key, e.target.files?.[0])} />
                </label>
              </div>
              {form[key] && <img src={form[key] ?? ''} alt="" className="mt-2 aspect-[16/10] w-48 rounded-lg object-cover" />}
            </Field>
          ))}
        </section>

        <section className="glass grid gap-5 rounded-2xl p-5 md:grid-cols-2">
          <h2 className="font-display text-lg font-bold md:col-span-2">Lancement, source &amp; licence</h2>
          <Field label="Mode de lancement" hint={MODE_HELP[form.launch_mode]}>
            <select
              className="input"
              value={form.launch_mode}
              onChange={(e) => {
                const mode = e.target.value as GameInput['launch_mode'];
                setForm((f) =>
                  f ? {...f, launch_mode: mode, license_status: LICENSES_ALLOWED_FOR_MODE[mode].includes(f.license_status) ? f.license_status : 'unverified'} : f,
                );
              }}>
              <option value="hosted">A — Hébergé</option>
              <option value="embed">B — Intégré (iframe)</option>
              <option value="external">C — Externe (site officiel)</option>
            </select>
          </Field>
          <Field label="URL de lancement" error={errors.launch_url} hint={form.launch_mode === 'hosted' ? '/games/<slug>/index.html' : 'https://…'}>
            {textInput('launch_url')}
          </Field>
          <Field label="Source / site officiel" error={errors.source_url}>{nullableInput('source_url')}</Field>
          <Field label="Statut de licence" error={errors.license_status} hint={LICENSE_HELP[form.license_status]}>
            <select className="input" value={form.license_status} onChange={(e) => set('license_status', e.target.value as GameInput['license_status'])}>
              {LICENSE_STATUSES.map((l) => (
                <option key={l} value={l} disabled={l !== 'unverified' && !allowedLicenses.includes(l)}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Notes de licence (preuve d'autorisation, licence, crédits)" error={errors.license_notes}>
              <textarea className="input min-h-[80px] py-2" value={form.license_notes ?? ''} onChange={(e) => set('license_notes', e.target.value || null)} maxLength={2000} />
            </Field>
          </div>
        </section>

        <section className="glass grid gap-5 rounded-2xl p-5 md:grid-cols-2">
          <h2 className="font-display text-lg font-bold md:col-span-2">Compatibilité &amp; commandes</h2>
          <div className="md:col-span-2">
            <div className="flex flex-wrap gap-2">
              {(['keyboard', 'mouse', 'gamepad', 'touch', 'verified'] as const).map((k) => (
                <label key={k} className="chip cursor-pointer has-[:checked]:border-accent/60 has-[:checked]:bg-accent/15">
                  <input
                    type="checkbox"
                    checked={form.compatibility[k]}
                    onChange={(e) => set('compatibility', {...form.compatibility, [k]: e.target.checked})}
                  />
                  {{keyboard: 'Clavier', mouse: 'Souris', gamepad: 'Manette', touch: 'Tactile', verified: 'Compatibilité testée ✔'}[k]}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-faint">Les icônes ne sont affichées aux joueurs que si « Compatibilité testée » est coché.</p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <span className="label">Commandes</span>
            {form.controls.map((c, i) => (
              <div key={i} className="grid grid-cols-[120px_1fr_1fr_auto] gap-2">
                <select
                  className="input"
                  value={c.device}
                  aria-label="Appareil"
                  onChange={(e) => set('controls', form.controls.map((x, j) => (j === i ? {...x, device: e.target.value as ControlDevice} : x)))}>
                  <option value="keyboard">Clavier</option>
                  <option value="mouse">Souris</option>
                  <option value="gamepad">Manette</option>
                  <option value="touch">Tactile</option>
                </select>
                <input className="input" placeholder="Touche" aria-label="Touche" value={c.input} onChange={(e) => set('controls', form.controls.map((x, j) => (j === i ? {...x, input: e.target.value} : x)))} />
                <input className="input" placeholder="Action" aria-label="Action" value={c.action} onChange={(e) => set('controls', form.controls.map((x, j) => (j === i ? {...x, action: e.target.value} : x)))} />
                <button type="button" className="btn-ghost px-2" aria-label="Retirer la commande" onClick={() => set('controls', form.controls.filter((_, j) => j !== i))}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button type="button" className="btn-secondary h-9 min-h-0 text-xs" onClick={() => set('controls', [...form.controls, {device: 'keyboard', input: '', action: ''}])}>
              <Plus size={14} /> Ajouter une commande
            </button>
          </div>
        </section>

        <section className="glass grid gap-5 rounded-2xl p-5 md:grid-cols-3">
          <h2 className="font-display text-lg font-bold md:col-span-3">Publication</h2>
          <Field label="Statut" error={errors.status}>
            <select className="input" value={form.status} onChange={(e) => set('status', e.target.value as GameInput['status'])}>
              <option value="draft">Brouillon</option>
              <option value="published">Publié</option>
              <option value="unpublished">Retiré</option>
            </select>
          </Field>
          <Field label="À la une" error={errors.featured_rank} hint="Rang 1 = premier du carrousel">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} aria-label="Mettre à la une" />
              <input
                className="input"
                type="number"
                min={1}
                max={99}
                value={form.featured_rank ?? ''}
                onChange={(e) => set('featured_rank', e.target.value ? Number(e.target.value) : null)}
                aria-label="Rang"
              />
            </div>
          </Field>
          <Field label="Scores" hint="Uniquement pour les jeux hébergés qui envoient leurs scores à la plateforme.">
            <label className="flex h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={form.supports_scores} onChange={(e) => set('supports_scores', e.target.checked)} /> Le jeu transmet ses scores
            </label>
          </Field>
        </section>
      </form>
    </AdminGuard>
  );
}
