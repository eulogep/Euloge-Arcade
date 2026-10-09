import {ExternalLink} from 'lucide-react';
import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {BRAND} from '@/config/brand';
import {useDocumentTitle} from '@/hooks/useDocumentTitle';

/**
 * Legal texts describe what is actually deployed. Fields marked « à compléter »
 * (publisher address, host) must be filled before a public launch.
 */

function LegalLayout({title, updated, children}: {title: string; updated: string; children: ReactNode}) {
  useDocumentTitle(title);
  return (
    <article className="container-page max-w-3xl pt-10">
      <h1 className="font-display text-3xl font-black sm:text-4xl">{title}</h1>
      <p className="mt-2 text-xs text-ink-faint">Dernière mise à jour : {updated}</p>
      <div className="mt-8 space-y-6 leading-relaxed text-ink-muted [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">
        {children}
      </div>
    </article>
  );
}

const TODO = <span className="rounded bg-warning/15 px-1.5 text-warning">à compléter</span>;

export function LegalNoticePage() {
  return (
    <LegalLayout title="Mentions légales" updated="10 octobre 2026">
      <h2>Éditeur</h2>
      <p>
        {BRAND.name} est édité par <strong>{BRAND.creator}</strong>, à titre personnel. Adresse : {TODO}. Contact :{' '}
        {BRAND.contactEmail ? <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a> : TODO}.
      </p>
      <p>Directeur de la publication : {BRAND.creator}.</p>
      <h2>Hébergement</h2>
      <p>
        Site statique : {TODO} (par exemple Cloudflare Pages). Base de données, authentification et fichiers : Supabase Inc. (région {TODO}).
      </p>
      <h2>Propriété intellectuelle</h2>
      <p>
        L'interface, le code, le logo « E », la marque {BRAND.name} et les illustrations originales de la plateforme sont protégés.{' '}
        {BRAND.copyright} Cette mention ne s'applique pas aux jeux tiers.
      </p>
      <p>
        Les jeux tiers référencés, leurs noms, logos, visuels et contenus appartiennent à leurs auteurs et éditeurs respectifs. {BRAND.name}{' '}
        n'est affilié à aucun d'entre eux, sauf mention contraire. Les jeux intégrés le sont via les outils d'intégration fournis par leurs
        éditeurs ; les autres sont accessibles par un simple lien vers leur site officiel. Voir{' '}
        <Link to="/credits" className="text-accent-3 underline">Crédits &amp; licences</Link>.
      </p>
      <h2>Signalement</h2>
      <p>
        Si vous êtes titulaire de droits et estimez qu'un contenu ne devrait pas apparaître sur {BRAND.name}, contactez l'éditeur : le jeu
        concerné sera retiré du catalogue dans les meilleurs délais.
      </p>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  const {backendEnabled} = usePlatform();
  return (
    <LegalLayout title="Politique de confidentialité" updated="10 octobre 2026">
      <p>
        Cette politique décrit les données réellement traitées par {BRAND.name}. Il n'y a <strong>ni publicité, ni outil de mesure
        d'audience, ni cookie publicitaire</strong> sur la plateforme.
      </p>

      <h2>Sans compte</h2>
      <ul>
        <li>Tes favoris, ton historique de lancement, tes scores, tes succès et tes préférences (thème, animations, recommandations) sont enregistrés <strong>uniquement dans ton navigateur</strong> (localStorage). Ils ne nous sont pas transmis.</li>
        <li>Tu peux les effacer à tout moment en vidant les données du site dans ton navigateur ou en effaçant l'historique dans ton profil.</li>
      </ul>

      {backendEnabled && (
        <>
          <h2>Avec un compte</h2>
          <ul>
            <li><strong>Données :</strong> adresse e-mail, mot de passe (stocké chiffré par Supabase Auth), pseudo, avatar facultatif, favoris, historique de lancement, scores des jeux compatibles, succès, consentement aux recommandations.</li>
            <li><strong>Finalités :</strong> te permettre de te connecter, de retrouver tes données sur tous tes appareils et d'afficher les classements (seul ton pseudo y apparaît).</li>
            <li><strong>Base légale :</strong> exécution du service que tu demandes en créant un compte ; consentement pour les recommandations personnalisées.</li>
            <li><strong>Popularité :</strong> les classements « populaires » comptent le nombre de joueurs connectés distincts par jeu sur 30 jours, sous forme agrégée et anonyme.</li>
            <li><strong>Sous-traitant :</strong> Supabase Inc. (hébergement de la base de données, de l'authentification et des fichiers).</li>
            <li><strong>Durée :</strong> tant que ton compte existe. La suppression du compte depuis ton profil efface définitivement toutes ces données.</li>
            <li><strong>Session :</strong> un jeton de connexion est conservé dans ton navigateur (localStorage) pour te garder connecté.</li>
          </ul>
        </>
      )}

      <h2>Recommandations</h2>
      <p>
        Désactivées par défaut. Si tu les actives, les suggestions sont calculées <strong>sur ton appareil</strong> à partir des genres de tes
        favoris et de ton historique. Tu peux les désactiver à tout moment dans ton profil.
      </p>

      <h2>Jeux tiers</h2>
      <ul>
        <li><strong>Jeux intégrés :</strong> le contenu de l'éditeur n'est chargé qu'au moment où tu cliques sur « Jouer ». L'éditeur reçoit alors les informations techniques habituelles (adresse IP, navigateur) et applique sa propre politique de confidentialité.</li>
        <li><strong>Jeux externes :</strong> ils s'ouvrent sur le site de l'éditeur, qui applique ses propres règles.</li>
        <li>Euloge Arcade ne récupère aucune donnée de progression ou de score des jeux tiers.</li>
      </ul>

      <h2>Polices et ressources</h2>
      <p>Les polices de caractères sont hébergées avec le site : aucune requête n'est envoyée à un service de polices externe.</p>

      <h2>Tes droits</h2>
      <p>
        Tu disposes d'un droit d'accès, de rectification, d'effacement et de portabilité. Le pseudo et l'avatar se modifient dans ton profil ;
        la suppression du compte y est disponible directement. Pour toute autre demande : {BRAND.contactEmail ? <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a> : TODO}.
        Tu peux aussi saisir l'autorité de protection des données de ton pays (en France, la CNIL).
      </p>
    </LegalLayout>
  );
}

const LICENSE_TEXT: Record<string, string> = {
  owned: 'Création originale',
  open_source: 'Logiciel libre',
  embed_permitted: "Intégration autorisée par l'éditeur",
  link_only: 'Lien vers le site officiel',
  unverified: 'Non vérifié',
};

export function CreditsPage() {
  const {games} = usePlatform();
  return (
    <LegalLayout title="Crédits & licences" updated="10 octobre 2026">
      <h2>Plateforme</h2>
      <p>
        Interface, logo, illustrations de couverture et code : créations originales d'{BRAND.name}. {BRAND.copyright}
      </p>
      <p>Les couvertures des jeux tiers sont des illustrations originales de la plateforme et ne reproduisent ni leurs logos ni leurs visuels.</p>

      <h2>Jeux du catalogue</h2>
      <ul className="!ml-0 space-y-4 [&>li]:ml-0 [&>li]:list-none">
        {games.map((g) => (
          <li key={g.id} className="rounded-xl border p-4 border-line-soft">
            <p className="font-semibold text-ink">
              <Link to={`/jeux/${g.slug}`} className="hover:text-accent-3">{g.title}</Link>
              {g.developer && <span className="font-normal text-ink-muted"> — {g.developer}</span>}
            </p>
            <p className="text-sm">{LICENSE_TEXT[g.licenseStatus]}</p>
            {g.licenseNotes && <p className="mt-1 text-xs">{g.licenseNotes}</p>}
            {g.sourceUrl && (
              <a href={g.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-accent-3">
                Site officiel <ExternalLink size={12} />
              </a>
            )}
          </li>
        ))}
      </ul>

      <h2>Logiciels libres utilisés par la plateforme</h2>
      <ul>
        <li>React, React DOM — MIT, © Meta Platforms, Inc. et contributeurs</li>
        <li>React Router — MIT, © Remix Software Inc.</li>
        <li>supabase-js — MIT, © Supabase</li>
        <li>Zod — MIT, © Colin McDonnell</li>
        <li>Lucide — ISC, © Lucide Contributors (icônes dérivées de Feather, MIT)</li>
        <li>Tailwind CSS — MIT, © Tailwind Labs</li>
        <li>Inter et Space Grotesk (via Fontsource) — SIL Open Font License 1.1</li>
      </ul>
      <p className="text-sm">Les composants utilisés par System Breach sont listés dans son fichier THIRD_PARTY_NOTICES.md.</p>
    </LegalLayout>
  );
}

export function NotFoundPage() {
  useDocumentTitle('Page introuvable');
  return (
    <div className="container-page flex flex-col items-center py-28 text-center">
      <p className="font-display text-7xl font-black text-gradient">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold">Cette page n'existe pas</h1>
      <p className="mt-2 text-ink-muted">Le lien est peut-être erroné ou la page a été déplacée.</p>
      <div className="mt-6 flex gap-3">
        <Link to="/" className="btn-primary">Accueil</Link>
        <Link to="/jeux" className="btn-secondary">Tous les jeux</Link>
      </div>
    </div>
  );
}
