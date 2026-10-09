# Architecture d'Euloge Arcade

## Vue d'ensemble

```text
Navigateur
 ├─ SPA plateforme (index.html → src/)        React 18 + TS + Tailwind, React Router 7
 │   ├─ lectures publiques ──► REST Supabase (fetch simple, clé anon, RLS)
 │   ├─ auth / écritures ────► supabase-js (chargé à la demande)
 │   └─ GamePlayer
 │        ├─ A hébergé : iframe → /games/<slug>/index.html  (même origine, entrée Vite séparée)
 │        ├─ B intégré : iframe sandboxée → domaine de la liste blanche
 │        └─ C externe : lien target=_blank rel=noopener
 └─ Jeux hébergés (games/<slug>/) : bundles indépendants, téléchargés seulement au lancement

Supabase
 ├─ Postgres : games, embed_domains, profiles, favorites, play_events, scores,
 │             achievements, user_achievements (RLS partout)
 ├─ Storage  : covers (admin), avatars (propriétaire). Images uniquement, taille limitée.
 └─ Edge Functions : check-links (admin), delete-account (utilisateur)
```

## Arborescence

```text
src/
├── app/            PlatformProvider (état global), router (une chunk par page)
├── components/
│   ├── layout/     Header, Footer, AppLayout, IntroSplash, SocialLinks
│   ├── gaming/     GameCard, GameRail/GameGrid, HeroCarousel, GameBits (couverture, badges…)
│   └── ui/         Logo (monogramme E), feedback (loader, skeleton, états vides, toasts)
├── features/
│   ├── home/ catalog/ game/       pages de découverte
│   ├── player/                    GamePlayer, pont de scores
│   ├── favorites/ profiles/       favoris, auth, profil
│   ├── achievements/              règles de déblocage
│   ├── admin/                     garde, tableau de bord, formulaire
│   └── about/                     À propos, mentions légales, confidentialité, crédits, 404
├── services/       catalogService, userDataService (local | distant), authService, adminService
├── lib/            logique pure et testée : catalog, recommend, embed, rules, gameSchema (zod)
├── hooks/  types/  config/ (brand.ts, env.ts)  data/ (seeds)  styles/
games/system-breach/   le jeu d'origine, déplacé sans réécriture
supabase/              migrations, seed généré, tests pgTAP, Edge Functions
e2e/                   tests Playwright
```

## Une seule source de vérité

| Donnée | Source de vérité | Remarque |
| --- | --- | --- |
| Catalogue | table `public.games` | `src/data/games.seed.json` ne sert qu'à **amorcer** une base vide (`seed.sql` est généré à partir de lui) et à faire tourner le **mode local** sans backend. Il n'existe aucune autre liste de jeux dans le frontend. |
| Domaines intégrables | table `public.embed_domains` | même principe (`embed-domains.seed.json`) |
| Succès | table `public.achievements` (textes) + `features/achievements/evaluate.ts` (conditions) | |
| Identité de marque | `src/config/brand.ts` | lue par l'interface **et** par `vite.config.ts` (métadonnées HTML) |

Données brutes (`*.seed.json`) → validées (`gameSchema` côté client, trigger `validate_game` côté serveur) → exploitées (`rowToGame` → type `Game`).

## Décisions

| Décision | Pourquoi |
| --- | --- |
| **Conserver React + TS**, ajouter Vite + Tailwind | Le jeu existant était déjà en React/TS/Tailwind : aucune réécriture n'était nécessaire. |
| **Multi-page Vite** (plateforme + un point d'entrée par jeu hébergé) | Le code d'un jeu n'est téléchargé qu'au lancement. Le jeu reste isolé dans son iframe. |
| **Pas de Framer Motion** | Les animations (carrousel, cartes 3D, fondus, intro) sont en CSS, avec un pilotage minimal en JS via variables CSS. Cela évite d'ajouter environ 40 Ko gzip pour un gain nul. |
| **Supabase** (Auth, Postgres, Storage, Edge Functions) | Autorisation appliquée **côté serveur** par RLS. Testable en local avec Docker. |
| **Lectures publiques en REST simple** | supabase-js (59 Ko gzip) sort du chemin critique ; il n'est chargé que pour l'authentification. Gain mesuré sur le LCP. |
| **Mode local sans backend** | Le site se déploie aussi en statique pur. Rien n'est simulé : les comptes et l'administration y sont **désactivés**, avec un message explicite. |
| **Popularité = joueurs distincts sur 30 jours** | Données réelles, impossibles à gonfler en relançant un jeu. La section est masquée tant qu'il n'y a pas de données. |
| **Recommandations sur consentement, calculées sur l'appareil** | Désactivées par défaut. L'algorithme est transparent (pondération des genres). |
| **Scores uniquement pour les jeux hébergés qui les envoient** | Aucune récupération de progression tierce. Les classements sont présentés comme indicatifs : scores envoyés par le client, sans anti-triche. |
| **Couvertures tierces = illustrations originales** | Aucun logo ni visuel de tiers n'est réutilisé. |

## Sécurité

- **Rôles** : `profiles.role`, non modifiable par l'API (la permission d'écriture sur cette colonne est révoquée). `is_admin()` est vérifié dans chaque policy d'écriture, et l'Edge Function `check-links` vérifie aussi le rôle.
- **Validation serveur** : le trigger `validate_game` impose :
  - les chemins des jeux hébergés limités à `/games/<slug>/…`, sans `..` ;
  - https obligatoire pour les modes intégré et externe ;
  - le domaine des jeux intégrés présent dans `embed_domains` ;
  - un statut de licence compatible avec le mode ;
  - aucune publication si les droits sont « non vérifiés ».
- **Iframes** :
  - les jeux tiers intégrés sont sandboxés (scripts, popups vers l'éditeur, pas de navigation du parent) ;
  - les jeux hébergés sont du code **interne versionné dans le dépôt**. Ils ont `allow-same-origin`, ce qui est nécessaire pour l'audio et la détection de fichier manquant, et jamais de code téléversé.
- **Téléversements** : buckets limités à PNG, JPEG, WebP et AVIF (SVG refusé, risque XSS), 2 Mo pour les couvertures et 1 Mo pour les avatars. Les avatars sont rangés dans un dossier `uid/` propre à chaque utilisateur. **Aucun téléversement de code exécutable** n'est possible.
- **Pont de scores** : un message n'est accepté que s'il vient de notre origine, de l'iframe exacte du jeu, et pour un jeu `supports_scores`.
- **check-links** : réservé aux admins. Il ne contacte que des URL https publiques (IP et localhost refusés).
- **En-têtes** : `public/_headers` impose une CSP sans script inline, `nosniff`, une `Permissions-Policy` et `frame-ancestors 'self'`. Le test `e2e/csp.spec.ts` vérifie le build de production sous cette CSP.
- **Secrets** : seule la clé publique `anon` est présente côté client. La clé `service_role` n'est utilisée que dans les Edge Functions (variables d'environnement Supabase).

## Ajouter un jeu

- **Hébergé (A)** :
  1. Vérifier les droits : création originale, ou licence libre permettant la redistribution.
  2. Ajouter les fichiers dans `games/<slug>/` avec la balise `<meta name="euloge-arcade-game" content="<slug>">`.
  3. Déclarer le point d'entrée dans `vite.config.ts`.
  4. Déployer, puis créer la fiche depuis l'admin avec `launch_url=/games/<slug>/index.html`.
- **Intégré (B)** :
  1. Obtenir une preuve que l'éditeur autorise l'intégration (widget officiel ou autorisation écrite).
  2. Ajouter le domaine à la liste blanche dans l'admin, en indiquant le lien vers cette preuve.
  3. Créer la fiche avec le statut `embed_permitted`.
- **Externe (C)** : créer la fiche avec le statut `link_only` et l'URL officielle.

## Performances (mesurées)

Mesures sur le build de production (`vite preview`), Chromium 1366×768, via `PerformanceObserver` :

| Page | Conditions | FCP | LCP | CLS | Transfert |
| --- | --- | --- | --- | --- | --- |
| Accueil | sans bridage | 0,11 s | 0,23 s | 0,002 | 554 Ko |
| Accueil | 4G lente + CPU ×4 | 1,13 s | 1,56 s | 0,002 | 554 Ko |
| Fiche System Breach | sans bridage | 0,05 s | 0,84 s | 0,002 | 421 Ko |
| Fiche System Breach | 4G lente + CPU ×4 | 1,10 s | 3,38 s | 0,002 | 421 Ko |

- Aucune ressource de jeu n'est téléchargée sur l'accueil (0 requête vers `/games/`).
- Corrections apportées grâce à ces mesures :
  - CLS passé de 1,0 à 0,002 ;
  - −35 % de données sur l'accueil (couvertures redimensionnées, slides du carrousel montées à la demande) ;
  - supabase-js et zod retirés du chemin critique.
- Point restant : le LCP de la fiche de jeu en 4G lente vient de la bannière (environ 100 Ko). Une variante AVIF ou WebP le ferait encore baisser.

## Tests

| Niveau | Outil | Couverture |
| --- | --- | --- |
| Unitaires | Vitest (36) | recherche, filtres, tri, URL, recommandations, succès, liste blanche, décision de lancement, validation, détection du framing |
| Base de données | pgTAP (22) | RLS (anonyme, joueur, admin), escalade de rôle, favoris d'autrui, scores, liste blanche, droits d'hébergement, publication non vérifiée |
| End-to-end | Playwright (24) | navigation, intro, recherche et filtres, 3 modes de lancement, plein écran, lien mort, fichier manquant, inscription, erreurs d'auth, fusion des favoris, autorisation admin (interface + API), création et publication de jeu, refus d'un domaine non autorisé, mobile, accessibilité axe (WCAG A/AA), CSP |
