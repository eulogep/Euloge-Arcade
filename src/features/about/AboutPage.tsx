import {Gauge, Gamepad2, Heart, ShieldCheck} from 'lucide-react';
import {Link} from 'react-router-dom';
import {BRAND} from '@/config/brand';
import {hasSocialLinks, SocialLinks} from '@/components/layout/SocialLinks';
import {LogoMark} from '@/components/ui/Logo';
import {useDocumentTitle} from '@/hooks/useDocumentTitle';

const PILLARS = [
  {Icon: Gauge, title: 'Instantané', text: 'Du catalogue au jeu en un clic, sans installation ni téléchargement inutile.'},
  {Icon: Gamepad2, title: 'Immersif', text: 'Une interface pensée pour le jeu : plein écran, commandes claires, reprise rapide.'},
  {Icon: ShieldCheck, title: 'Respectueux', text: 'Aucun jeu diffusé sans droits vérifiés. Les créateurs restent crédités et propriétaires de leurs œuvres.'},
  {Icon: Heart, title: 'Sans manipulation', text: 'Pas de publicité, pas de faux compteurs : les classements reposent sur de vraies données.'},
];

export default function AboutPage() {
  useDocumentTitle('À propos');
  return (
    <div className="container-page max-w-4xl pt-10">
      <div className="flex flex-col items-center text-center">
        <LogoMark className="h-20 w-20 animate-fade-up" title={null} />
        <h1 className="mt-6 animate-fade-up font-display text-4xl font-black sm:text-5xl">
          À propos d'<span className="text-gradient">{BRAND.name}</span>
        </h1>
        <p className="mt-3 text-sm font-semibold uppercase tracking-[0.3em] text-ink-faint">Créé et développé par {BRAND.creator}</p>
      </div>

      <blockquote className="glass mt-10 rounded-3xl p-6 text-lg leading-relaxed sm:p-8">
        <p>« {BRAND.aboutStatement} »</p>
        <footer className="mt-4 text-sm font-semibold text-ink-muted">— {BRAND.creator}</footer>
      </blockquote>

      <p className="mt-8 leading-relaxed text-ink-muted">
        {BRAND.name} est une plateforme indépendante de découverte et d'accès à des jeux sur navigateur. Elle réunit trois façons de jouer :
        des jeux hébergés directement sur la plateforme lorsque nous en détenons les droits, des jeux intégrés lorsque leur éditeur l'autorise
        officiellement, et des liens vers les sites d'origine pour tous les autres.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {PILLARS.map(({Icon, title, text}) => (
          <li key={title} className="glass rounded-2xl p-5">
            <Icon size={22} className="text-accent-3" />
            <h2 className="mt-3 font-display text-lg font-bold">{title}</h2>
            <p className="mt-1 text-sm text-ink-muted">{text}</p>
          </li>
        ))}
      </ul>

      <section className="mt-10 rounded-2xl border p-5 text-sm text-ink-muted border-line-soft">
        <h2 className="mb-2 font-display text-base font-bold text-ink">Ce qui appartient à qui</h2>
        <p>
          L'interface, le logo, l'identité visuelle et le code de la plateforme sont des créations originales d'{BRAND.name} ({BRAND.copyright.replace(' All rights reserved.', '')}).
          Les jeux tiers, leurs noms, logos et contenus restent la propriété de leurs auteurs et éditeurs ; {BRAND.name} n'en revendique aucun droit.
          Détails sur la page <Link to="/credits" className="text-accent-3 underline">Crédits &amp; licences</Link>.
        </p>
      </section>

      {hasSocialLinks() && (
        <section className="mt-10 text-center">
          <h2 className="font-display text-lg font-bold">Retrouver {BRAND.creator}</h2>
          <SocialLinks withLabels className="mt-4 justify-center" />
        </section>
      )}
    </div>
  );
}
