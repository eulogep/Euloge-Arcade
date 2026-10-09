import {ShieldAlert} from 'lucide-react';
import type {ReactNode} from 'react';
import {Link, Navigate, useLocation} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {BRAND} from '@/config/brand';
import {LogoMark} from '@/components/ui/Logo';
import {BrandLoader, EmptyState} from '@/components/ui/feedback';

/**
 * UX guard only. Authorization is enforced server-side (RLS `is_admin()`, storage
 * policies, Edge Function checks): a non-admin bypassing this screen still cannot
 * read drafts or write anything.
 */
export function AdminGuard({children}: {children: ReactNode}) {
  const {backendEnabled, user, profile, authReady} = usePlatform();
  const location = useLocation();

  if (!backendEnabled) {
    return (
      <div className="container-page py-24">
        <EmptyState icon={<ShieldAlert size={32} />} title="Administration indisponible">
          Configure Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) pour gérer le catalogue.
        </EmptyState>
      </div>
    );
  }
  if (!authReady || (user && !profile)) return <BrandLoader className="py-32" label="Vérification des droits…" />;
  if (!user) return <Navigate to="/connexion" replace state={{from: location.pathname}} />;
  if (profile?.role !== 'admin') {
    return (
      <div className="container-page py-24">
        <EmptyState
          icon={<ShieldAlert size={32} className="text-danger" />}
          title="Accès réservé aux administrateurs"
          action={
            <Link to="/" className="btn-secondary">
              Retour à l'accueil
            </Link>
          }>
          Ton compte n'a pas les droits nécessaires.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="container-page pt-8">
      <div className="mb-8 flex items-center gap-3 border-b pb-5 border-line-soft">
        <LogoMark className="h-10 w-10" title={null} />
        <div>
          <p className="font-display text-lg font-black tracking-wide">
            {BRAND.name} <span className="text-gradient">Admin</span>
          </p>
          <p className="text-xs text-ink-faint">Gestion du catalogue · {BRAND.signature}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
