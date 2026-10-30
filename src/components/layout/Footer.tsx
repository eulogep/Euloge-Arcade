import {Command, Cpu, Crosshair, Sparkles} from 'lucide-react';
import {Link} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {BRAND} from '@/config/brand';
import {Logo} from '@/components/ui/Logo';
import {SocialLinks} from '@/components/layout/SocialLinks';
import {playClickPulse} from '@/lib/sound';

export function Footer() {
  const {games, setCommandPaletteOpen, setReflexLabOpen} = usePlatform();

  return (
    <footer className="mt-24 border-t border-line-soft bg-surface/35">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-muted">{BRAND.tagline}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="hud-tag">
              <Cpu size={11} className="text-success" /> PRISM-DECK OS // {games.length || 34} CARTOUCHES
            </span>
            <button
              type="button"
              onClick={() => {
                playClickPulse();
                setReflexLabOpen(true);
              }}
              className="hud-tag hover:border-accent-3/50 hover:text-ink transition">
              <Crosshair size={11} className="text-accent-3" /> CALIBRATEUR
            </button>
            <button
              type="button"
              onClick={() => {
                playClickPulse();
                setCommandPaletteOpen(true);
              }}
              className="hud-tag hover:border-accent-3/50 hover:text-ink transition">
              <Command size={11} className="text-accent-3" /> CONSOLE ⌘K
            </button>
          </div>
          <SocialLinks className="mt-4" />
        </div>
        <nav aria-label="Plateforme">
          <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-widest text-ink-faint">Plateforme</h2>
          <ul className="space-y-2 text-sm">
            <li><Link className="text-ink-muted hover:text-ink transition-colors" to="/jeux">Tous les jeux</Link></li>
            <li><Link className="text-ink-muted hover:text-ink transition-colors" to="/favoris">Mes favoris</Link></li>
            <li><Link className="text-ink-muted hover:text-ink transition-colors" to="/profil">Mon profil</Link></li>
            <li><Link className="text-ink-muted hover:text-ink transition-colors" to="/a-propos">À propos</Link></li>
          </ul>
        </nav>
        <nav aria-label="Informations légales">
          <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-widest text-ink-faint">Légal</h2>
          <ul className="space-y-2 text-sm">
            <li><Link className="text-ink-muted hover:text-ink transition-colors" to="/mentions-legales">Mentions légales</Link></li>
            <li><Link className="text-ink-muted hover:text-ink transition-colors" to="/confidentialite">Confidentialité</Link></li>
            <li><Link className="text-ink-muted hover:text-ink transition-colors" to="/credits">Crédits &amp; licences</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line-soft">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap items-center gap-1.5">
            <Sparkles size={12} className="text-accent-3" aria-hidden />
            <span>{BRAND.copyright}</span> <span className="text-ink-muted">· {BRAND.signature}</span>
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
