# Euloge Arcade

**Euloge Arcade** est une plateforme de jeux jouables directement dans le navigateur, **imaginée, conçue et développée par Euloge**.

> Created by Euloge · © 2026 Euloge Arcade. All rights reserved.
> Cette mention couvre la plateforme et ses créations originales, pas les jeux tiers référencés (voir [Crédits](#droits-et-licences)).

Découvrir un jeu, comprendre ce qu'il propose et y jouer, en un minimum d'étapes :

- **Catalogue dynamique** : la base de données est la source de vérité. Recherche instantanée, filtres par genre et par compatibilité vérifiée, tri par nouveauté, popularité réelle ou ordre alphabétique.
- **GamePlayer universel** en 3 modes :
  - **A, hébergé** : jeux dont on détient les droits, servis par la plateforme.
  - **B, intégré** : iframe, uniquement pour les éditeurs autorisés et inscrits sur une liste blanche.
  - **C, externe** : lien vers le site officiel.
- **Comptes et suivi** : favoris, historique, succès, scores et classements (jeux compatibles), recommandations sur consentement, « Surprends-moi ».
- **Administration sécurisée** : gestion du catalogue, licences, couvertures, publication, liste blanche d'intégration, détection des liens morts.

## Démarrage rapide

```bash
npm install
npm run dev            # http://localhost:5180
```

Sans configuration, la plateforme tourne en **mode local** :
- le catalogue vient de `src/data/games.seed.json` ;
- favoris, historique et succès restent dans le navigateur ;
- comptes et administration sont désactivés.

### Avec Supabase en local (comptes, admin, classements)

Prérequis : Docker et la [CLI Supabase](https://supabase.com/docs/guides/cli).

```bash
supabase start -x realtime,studio,imgproxy,vector,logflare,supavisor   # applique les migrations + le seed
cp .env.example .env.local   # puis renseigner VITE_SUPABASE_URL=http://127.0.0.1:54621 et la clé ANON_KEY affichée
npm run dev
supabase functions serve --env-file supabase/functions/.env.local     # check-links & delete-account
```

Pour donner le rôle administrateur à un compte (après son inscription) :

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'toi@exemple.com');
```

Le rôle n'est **jamais** modifiable depuis l'application : la colonne n'est pas accessible en écriture via l'API.

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` / `build` / `preview` | Développement, build de production, aperçu du build (port 4180) |
| `npm run typecheck` | Vérification TypeScript (plateforme, jeu, tests) |
| `npm test` | Tests unitaires (Vitest) |
| `npm run test:e2e` | Tests end-to-end (Playwright). Nécessite Supabase en local. |
| `supabase test db` | Tests de sécurité de la base (pgTAP : RLS, rôles, validation) |
| `npm run seed:sql` | Régénère `supabase/seed.sql` depuis `src/data/*.seed.json` |
| `npm run brand:assets` | Régénère les visuels PNG (favicon, image Open Graph) et les couvertures |

## Documentation

- [docs/AUDIT.md](docs/AUDIT.md) : audit du projet initial et inventaire des droits.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : architecture, décisions, sécurité, performances, tests.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) : mise en production.
- [BRANDING.md](BRANDING.md) : identité visuelle d'Euloge Arcade.

## Droits et licences

- **Plateforme** (code, interface, logo « E », marque, illustrations originales) : © 2026 Euloge Arcade, tous droits réservés. Voir [LICENSE.md](LICENSE.md).
- **System Breach** : jeu original du projet. Ses bibliothèques tierces sont listées dans `games/system-breach/THIRD_PARTY_NOTICES.md`.
- **Jeux tiers** : ils appartiennent à leurs auteurs. Ils sont soit intégrés via un widget officiel de l'éditeur (le puzzle du jour Lichess), soit simplement liés vers leur site officiel. Aucun logo ni visuel tiers n'est réutilisé. La page `/credits` du site détaille chaque jeu.
