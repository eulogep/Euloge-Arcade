# Mise en production

Cible recommandée : **Cloudflare Pages** (site statique + `_headers`/`_redirects` déjà fournis) et **Supabase** (base, auth, stockage, fonctions). Netlify fonctionne aussi tel quel. Vercel demande de traduire `_headers` et `_redirects` dans un `vercel.json`.

## 1. Supabase

1. Créer un projet sur supabase.com et choisir la région (à reporter dans les mentions légales).
2. Lier le projet et pousser le schéma :
   ```bash
   supabase link --project-ref <ref>
   supabase db push                      # applique supabase/migrations
   psql "<connection string>" -f supabase/seed.sql   # amorce le catalogue (une seule fois)
   ```
3. Déployer les fonctions et configurer leur secret :
   ```bash
   supabase secrets set PUBLIC_SITE_URL=https://ton-domaine
   supabase functions deploy check-links
   supabase functions deploy delete-account
   ```
4. Dans **Authentication → URL configuration** :
   - Site URL : `https://ton-domaine` ;
   - Redirect URLs : `https://ton-domaine/**`.
5. Activer la **confirmation par e-mail** et configurer un SMTP. L'interface gère déjà le cas « vérifie ta boîte mail ».
6. Créer ton compte depuis le site, puis te donner le rôle administrateur (SQL Editor) :
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'toi@exemple.com');
   ```

## 2. Site (Cloudflare Pages)

- Commande de build : `npm run build`. Dossier de sortie : `dist`. Version de Node : 22.
- Variables d'environnement :
  - `VITE_SUPABASE_URL` = `https://<ref>.supabase.co` ;
  - `VITE_SUPABASE_ANON_KEY` = la clé **anon / publishable**.
- **Ne jamais** fournir la clé `service_role` au site.
- Mettre à jour `BRAND.siteUrl` dans `src/config/brand.ts`. Cette valeur sert à l'URL canonique et aux balises Open Graph.
- Si Supabase est auto-hébergé ou sur un domaine personnalisé, remplacer `*.supabase.co` dans la CSP de `public/_headers`.

### Déploiement automatique (GitHub Actions)

Le projet Cloudflare Pages `euloge-arcade` n'est pas relié à Git : c'est le job `deploy` de `.github/workflows/ci.yml` qui publie le site. Il ne tourne qu'après une fusion dans `main`, et seulement si les jobs `checks` et `database-and-e2e` ont réussi. Les pull requests ne déploient jamais rien.

Secrets à définir dans GitHub (Settings → Secrets and variables → Actions) :

- `CLOUDFLARE_API_TOKEN` : jeton créé dans Cloudflare (My Profile → API Tokens) avec la permission **Cloudflare Pages : Edit** ;
- `CLOUDFLARE_ACCOUNT_ID` : l'identifiant du compte Cloudflare ;
- `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (facultatifs) : sans eux, le site est construit en mode local (catalogue intégré, sans comptes).

Déploiement manuel de secours, sans reprendre le `.env.local` de développement :

```bash
VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run build
npx wrangler pages deploy dist --project-name euloge-arcade --branch main
```

## 3. Avant l'ouverture au public

- [ ] Compléter les mentions légales (adresse et contact de l'éditeur, hébergeur, région Supabase) dans `src/features/about/LegalPages.tsx`, et `BRAND.contactEmail`.
- [ ] Renseigner les liens officiels (GitHub, portfolio, réseaux) dans `BRAND.links`. Les entrées vides restent masquées.
- [ ] Lancer « Vérifier les liens » depuis l'administration.
- [ ] Vérifier la CSP sur le domaine réel : console du navigateur, aucune ligne « Refused to ».

## Retour arrière

- **Site** : Cloudflare Pages conserve chaque déploiement, il suffit de cliquer sur « Rollback ». Côté code, chaque étape est un commit distinct (`git log`).
- **Base** : les migrations sont versionnées dans `supabase/migrations`. Pour annuler une modification de schéma, écrire une nouvelle migration inverse ; ne jamais réécrire une migration déjà appliquée en production.
- **Catalogue** : un jeu problématique se retire en un clic (« Retirer »), sans suppression.
