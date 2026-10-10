import {ExternalLink} from 'lucide-react';
import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {usePlatform} from '@/app/PlatformProvider';
import {BRAND} from '@/config/brand';
import {useDocumentTitle} from '@/hooks/useDocumentTitle';

const LEGAL = {
  contactUrl: 'https://github.com/eulogep/Euloge-Arcade/issues',
  host: {
    name: 'Cloudflare, Inc.',
    address: '101 Townsend Street, San Francisco, CA 94107, États-Unis',
    phone: '+1 650 319 8930',
    website: 'https://www.cloudflare.com/',
    privacy: 'https://www.cloudflare.com/privacypolicy/',
  },
  cnilComplaint: 'https://www.cnil.fr/fr/plaintes',
  lcen: 'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000049568614/',
} as const;

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

export function LegalNoticePage() {
  return (
    <LegalLayout title="Mentions légales" updated="10 octobre 2026">
      <p>
        <strong>{BRAND.name}</strong> est un site personnel, gratuit et non commercial, accessible à l'adresse{' '}
        <a href={BRAND.siteUrl} className="text-accent-3 underline">
          {BRAND.siteUrl}
        </a>
        . Il ne propose ni achat, ni abonnement payant.
      </p>

      <h2>Éditeur</h2>
      <p>
        Le service est édité à titre non professionnel sous le pseudonyme <strong>{BRAND.creator}</strong>. Afin de préserver
        l'anonymat de l'éditeur, seules les coordonnées de l'hébergeur sont rendues publiques, conformément à{' '}
        <a href={LEGAL.lcen} target="_blank" rel="noopener noreferrer" className="text-accent-3 underline">
          l'article 1-1, II de la loi pour la confiance dans l'économie numérique
        </a>
        .
      </p>
      <p>Directeur de la publication : {BRAND.creator}.</p>
      <p>
        Contact électronique :{' '}
        <a href={LEGAL.contactUrl} target="_blank" rel="noopener noreferrer" className="text-accent-3 underline">
          formulaire public de contact sur GitHub
        </a>
        . Ne publie aucune donnée personnelle ou confidentielle dans une demande publique.
      </p>

      <h2>Hébergement</h2>
      <p>
        Le site statique est hébergé par <strong>{LEGAL.host.name}</strong>, {LEGAL.host.address}. Téléphone :{' '}
        <a href="tel:+16503198930" className="text-accent-3 underline">
          {LEGAL.host.phone}
        </a>
        . Site :{' '}
        <a href={LEGAL.host.website} target="_blank" rel="noopener noreferrer" className="text-accent-3 underline">
          cloudflare.com
        </a>
        .
      </p>
      <p>Le déploiement public actuel n'active ni compte utilisateur, ni base de données distante.</p>

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
        Si tu es titulaire de droits et estimes qu'un contenu ne devrait pas apparaître sur {BRAND.name}, utilise le{' '}
        <a href={LEGAL.contactUrl} target="_blank" rel="noopener noreferrer" className="text-accent-3 underline">
          formulaire de contact
        </a>{' '}
        en indiquant le contenu concerné et les éléments permettant d'examiner la demande. Une demande fondée sera traitée dans les meilleurs
        délais.
      </p>

      <h2>Responsabilité</h2>
      <p>
        Les informations sont fournies de bonne foi, sans garantie d'absence d'erreur ni de disponibilité continue. Les sites et jeux tiers
        restent sous la responsabilité de leurs éditeurs respectifs ; leurs contenus, conditions et pratiques peuvent évoluer sans contrôle de{' '}
        {BRAND.name}.
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

      <h2>Responsable du traitement</h2>
      <p>
        Le responsable du traitement est l'éditeur non professionnel de {BRAND.name}, désigné sous le pseudonyme {BRAND.creator}. Pour le
        contacter, utilise le{' '}
        <a href={LEGAL.contactUrl} target="_blank" rel="noopener noreferrer" className="text-accent-3 underline">
          formulaire public sur GitHub
        </a>{' '}
        sans y publier de donnée personnelle : demande simplement un canal privé pour poursuivre l'échange.
      </p>

      <h2>Données conservées sur ton appareil</h2>
      <ul>
        <li>
          <strong>Données :</strong> favoris, historique de lancement, scores, succès et préférences (thème, animations et recommandations).
        </li>
        <li>
          <strong>Finalité :</strong> mémoriser tes choix et personnaliser l'interface sur l'appareil utilisé.
        </li>
        <li>
          <strong>Stockage et destinataire :</strong> ces données restent uniquement dans le stockage local de ton navigateur (localStorage) et
          ne sont pas transmises à {BRAND.name}.
        </li>
        <li>
          <strong>Durée :</strong> jusqu'à leur suppression depuis le profil ou les réglages de ton navigateur.
        </li>
      </ul>

      <h2>Traceurs</h2>
      <p>
        Le stockage local sert exclusivement aux fonctionnalités que tu demandes. Aucun traceur publicitaire, outil de profilage ou mesure
        d'audience n'est installé par {BRAND.name}. Ces éléments strictement fonctionnels ne nécessitent pas de bandeau de consentement ; tu peux
        néanmoins les supprimer à tout moment depuis ton navigateur.
      </p>

      <h2>Hébergement et journaux techniques</h2>
      <p>
        Lors de l'accès au site, Cloudflare traite les données techniques nécessaires à l'acheminement et à la sécurisation des requêtes,
        notamment l'adresse IP, l'URL demandée, l'horodatage et des informations sur le navigateur ou le trafic. Ce traitement repose sur
        l'intérêt légitime à fournir et sécuriser le site. Ces données sont destinées à Cloudflare et ne sont pas utilisées par {BRAND.name} à
        des fins publicitaires ou de profilage. Leur conservation suit les durées nécessaires au service, à la sécurité et aux obligations
        légales décrites dans la{' '}
        <a href={LEGAL.host.privacy} target="_blank" rel="noopener noreferrer" className="text-accent-3 underline">
          politique de confidentialité de Cloudflare
        </a>
        .
      </p>
      <p>
        Cloudflare est établi aux États-Unis. Des transferts de données hors de l'Espace économique européen peuvent donc intervenir. Cloudflare
        indique les encadrer notamment par le cadre de protection des données UE–États-Unis et, si nécessaire, par les clauses contractuelles
        types de la Commission européenne.
      </p>

      {backendEnabled && (
        <>
          <h2>Avec un compte</h2>
          <ul>
            <li><strong>Données :</strong> adresse e-mail, identifiants gérés par Supabase Auth, pseudo, avatar facultatif, favoris, historique de lancement, scores des jeux compatibles, succès, consentement aux recommandations. {BRAND.name} n'accède jamais au mot de passe en clair.</li>
            <li><strong>Finalités :</strong> te permettre de te connecter, de retrouver tes données sur tous tes appareils et d'afficher les classements (seul ton pseudo y apparaît).</li>
            <li><strong>Base légale :</strong> exécution du service que tu demandes en créant un compte ; consentement pour les recommandations personnalisées.</li>
            <li><strong>Popularité :</strong> les classements « populaires » comptent le nombre de joueurs connectés distincts par jeu sur 30 jours, sous forme agrégée et anonyme.</li>
            <li><strong>Sous-traitant :</strong> Supabase (hébergement de la base de données, de l'authentification et des fichiers).</li>
            <li><strong>Durée :</strong> pendant l'existence du compte, puis pendant les délais techniques de suppression et de sauvegarde appliqués par le prestataire.</li>
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
        Selon ta situation, tu disposes de droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité. Les
        données enregistrées uniquement dans ton navigateur sont directement sous ton contrôle. Pour toute autre demande, utilise le{' '}
        <a href={LEGAL.contactUrl} target="_blank" rel="noopener noreferrer" className="text-accent-3 underline">
          formulaire de contact
        </a>{' '}
        sans publier de donnée personnelle. Tu peux également adresser une{' '}
        <a href={LEGAL.cnilComplaint} target="_blank" rel="noopener noreferrer" className="text-accent-3 underline">
          réclamation à la CNIL
        </a>
        .
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
