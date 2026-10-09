import {Eye, EyeOff, Link2, Pencil, Plus, RefreshCw, Trash2} from 'lucide-react';
import {useCallback, useEffect, useState, type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {ErrorState, Skeleton} from '@/components/ui/feedback';
import {AdminGuard} from '@/features/admin/AdminGuard';
import {useDocumentTitle} from '@/hooks/useDocumentTitle';
import {cn} from '@/lib/cn';
import {LAUNCH_MODE_LABELS} from '@/lib/catalog';
import {
  adminAddEmbedDomain,
  adminCheckLinks,
  adminErrorMessage,
  adminListEmbedDomains,
  adminListGames,
  adminRemoveEmbedDomain,
  adminSetStatus,
  type EmbedDomain,
} from '@/services/adminService';
import type {Game, LinkStatus} from '@/types/game';

const STATUS_STYLE: Record<Game['status'], string> = {
  published: 'bg-success/15 text-success',
  draft: 'bg-ink/10 text-ink-muted',
  unpublished: 'bg-warning/15 text-warning',
};
const STATUS_LABEL: Record<Game['status'], string> = {published: 'Publié', draft: 'Brouillon', unpublished: 'Retiré'};
const LINK_LABEL: Record<LinkStatus, string> = {
  unchecked: 'Non vérifié',
  ok: 'OK',
  broken: 'Lien mort',
  embed_blocked: 'Intégration refusée',
};
const LINK_STYLE: Record<LinkStatus, string> = {
  unchecked: 'text-ink-faint',
  ok: 'text-success',
  broken: 'text-danger',
  embed_blocked: 'text-warning',
};

function EmbedDomains() {
  const {notify} = usePlatform();
  const [domains, setDomains] = useState<EmbedDomain[] | null>(null);
  const [domain, setDomain] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    adminListEmbedDomains()
      .then(setDomains)
      .catch((e) => notify({tone: 'error', title: 'Domaines indisponibles', body: adminErrorMessage(e)}));
  }, [notify]);
  useEffect(load, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await adminAddEmbedDomain(domain, note);
      setDomain('');
      setNote('');
      load();
    } catch (err) {
      notify({tone: 'error', title: 'Ajout refusé', body: adminErrorMessage(err)});
    }
  };

  return (
    <section className="glass rounded-2xl p-5" aria-labelledby="domains-title">
      <h2 id="domains-title" className="font-display text-lg font-bold">
        Domaines d'intégration autorisés
      </h2>
      <p className="mt-1 text-xs text-ink-muted">
        Seuls ces domaines (et leurs sous-domaines) peuvent être affichés en iframe. N'ajoute un domaine que si l'éditeur autorise
        explicitement l'intégration.
      </p>
      <ul className="mt-4 space-y-2">
        {domains?.map((d) => (
          <li key={d.domain} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2/50 px-3 py-2 text-sm">
            <span>
              <span className="font-mono font-semibold">{d.domain}</span>
              {d.note && <span className="ml-2 text-xs text-ink-muted">{d.note}</span>}
            </span>
            <button
              type="button"
              className="btn-ghost h-8 min-h-0 px-2 text-danger"
              aria-label={`Retirer ${d.domain}`}
              onClick={() =>
                void adminRemoveEmbedDomain(d.domain)
                  .then(load)
                  .catch((e) => notify({tone: 'error', title: 'Suppression refusée', body: adminErrorMessage(e)}))
              }>
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input className="input sm:w-56" placeholder="exemple.com" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Domaine" required />
        <input className="input flex-1" placeholder="Justification (lien vers l'autorisation)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
        <button type="submit" className="btn-secondary">
          <Plus size={16} /> Ajouter
        </button>
      </form>
    </section>
  );
}

export default function AdminDashboard() {
  useDocumentTitle('Administration');
  const {notify, reloadCatalog} = usePlatform();
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(() => {
    setError(null);
    adminListGames()
      .then(setGames)
      .catch((e) => setError(adminErrorMessage(e)));
  }, []);
  useEffect(load, [load]);

  const toggleStatus = async (g: Game) => {
    const next = g.status === 'published' ? 'unpublished' : 'published';
    try {
      await adminSetStatus(g.id, next);
      notify({tone: 'success', title: next === 'published' ? 'Jeu publié' : 'Jeu retiré', body: g.title});
      load();
      reloadCatalog();
    } catch (e) {
      notify({tone: 'error', title: 'Action refusée', body: adminErrorMessage(e)});
    }
  };

  const checkLinks = async () => {
    setChecking(true);
    try {
      const results = await adminCheckLinks();
      const bad = results.filter((r) => r.status === 'broken' || r.status === 'embed_blocked').length;
      notify({
        tone: bad ? 'error' : 'success',
        title: `Vérification terminée : ${results.length} jeu(x)`,
        body: bad ? `${bad} problème(s) détecté(s)` : 'Aucun lien mort détecté',
      });
      load();
      reloadCatalog();
    } catch (e) {
      notify({tone: 'error', title: 'Vérification impossible', body: adminErrorMessage(e)});
    } finally {
      setChecking(false);
    }
  };

  return (
    <AdminGuard>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-black">Catalogue</h1>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => void checkLinks()} disabled={checking}>
              <RefreshCw size={16} className={cn(checking && 'animate-spin')} /> {checking ? 'Vérification…' : 'Vérifier les liens'}
            </button>
            <Link to="/admin/jeux/nouveau" className="btn-primary">
              <Plus size={16} /> Ajouter un jeu
            </Link>
          </div>
        </div>

        {error ? (
          <ErrorState title="Chargement impossible" message={error} onRetry={load} />
        ) : !games ? (
          <Skeleton className="h-64" />
        ) : (
          <div className="glass overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-ink-faint">
                <tr className="border-b border-line-soft">
                  <th className="px-4 py-3">Jeu</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Licence</th>
                  <th className="px-4 py-3">Lien</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.id} className="border-b last:border-0 border-line-soft">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{g.title}</p>
                      <p className="font-mono text-xs text-ink-faint">/{g.slug}</p>
                    </td>
                    <td className="px-4 py-3">{LAUNCH_MODE_LABELS[g.launchMode]}</td>
                    <td className="px-4 py-3 font-mono text-xs">{g.licenseStatus}</td>
                    <td className={cn('px-4 py-3 text-xs font-semibold', LINK_STYLE[g.linkStatus])} title={g.linkCheckDetail ?? undefined}>
                      <span className="inline-flex items-center gap-1">
                        <Link2 size={13} /> {LINK_LABEL[g.linkStatus]}
                      </span>
                      {g.linkCheckedAt && <span className="block font-normal text-ink-faint">{new Date(g.linkCheckedAt).toLocaleDateString('fr-FR')}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-md px-2 py-0.5 text-xs font-bold', STATUS_STYLE[g.status])}>{STATUS_LABEL[g.status]}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="btn-ghost h-9 min-h-0 px-2.5 text-xs"
                          onClick={() => void toggleStatus(g)}
                          aria-label={g.status === 'published' ? `Retirer ${g.title}` : `Publier ${g.title}`}>
                          {g.status === 'published' ? <EyeOff size={15} /> : <Eye size={15} />}
                          {g.status === 'published' ? 'Retirer' : 'Publier'}
                        </button>
                        <Link to={`/admin/jeux/${g.id}`} className="btn-ghost h-9 min-h-0 px-2.5 text-xs" aria-label={`Modifier ${g.title}`}>
                          <Pencil size={15} /> Modifier
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <EmbedDomains />
      </div>
    </AdminGuard>
  );
}
