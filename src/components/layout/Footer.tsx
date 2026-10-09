import {Link} from 'react-router-dom';
import {BRAND} from '@/config/brand';
import {Logo} from '@/components/ui/Logo';
import {SocialLinks} from '@/components/layout/SocialLinks';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line-soft">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-ink-muted">{BRAND.tagline}</p>
          <SocialLinks className="mt-4" />
        </div>
        <nav aria-label="Plateforme">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-ink-faint">Plateforme</h2>
          <ul className="space-y-2 text-sm">
            <li><Link className="text-ink-muted hover:text-ink" to="/jeux">Tous les jeux</Link></li>
            <li><Link className="text-ink-muted hover:text-ink" to="/favoris">Mes favoris</Link></li>
            <li><Link className="text-ink-muted hover:text-ink" to="/profil">Mon profil</Link></li>
            <li><Link className="text-ink-muted hover:text-ink" to="/a-propos">À propos</Link></li>
          </ul>
        </nav>
        <nav aria-label="Informations légales">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-ink-faint">Légal</h2>
          <ul className="space-y-2 text-sm">
            <li><Link className="text-ink-muted hover:text-ink" to="/mentions-legales">Mentions légales</Link></li>
            <li><Link className="text-ink-muted hover:text-ink" to="/confidentialite">Confidentialité</Link></li>
            <li><Link className="text-ink-muted hover:text-ink" to="/credits">Crédits &amp; licences</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line-soft">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            {BRAND.copyright} <span className="text-ink-muted">· {BRAND.signature}</span>
          </p>
          <p>
            Les jeux tiers et leurs marques appartiennent à leurs auteurs respectifs.{' '}
            <Link to="/credits" className="underline underline-offset-2 hover:text-ink">
              Crédits
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
