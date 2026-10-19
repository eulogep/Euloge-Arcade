# Import du catalogue Ported2Browser

Ported2Browser bloque les accès automatisés (Cloudflare). L'import détaillé repose donc sur un **export fourni par le responsable du site**. Avec son autorisation, des pages du catalogue enregistrées manuellement dans le navigateur peuvent aussi servir à vérifier l'inventaire public, sans contourner cette protection.

```text
export JSON → lecture → copie brute (raw/) → normalisation → validation (schéma du catalogue)
           → déduplication → comparaison avec le catalogue et le manifeste → rapport
           → écriture (seulement avec --apply) → seed.sql régénéré
```

## Utilisation

### Découverte locale depuis des pages enregistrées

La commande suivante lit uniquement les fichiers HTML indiqués. Par défaut, elle affiche le bilan sans écrire de fichier et sans effectuer de requête réseau :

```bash
npm run discover:p2b -- --input page-1.html --input page-2.html

# Sortie JSON locale facultative
npm run discover:p2b -- --input dossier-des-pages/ --output inventaire.json
```

Cette étape extrait seulement les informations visibles sur les cartes : identifiant source, titre, auteur du port, URL de fiche, référence de couverture, tags et alertes. Elle n'invente ni description, ni genre, ni commandes, ni URL de lancement. Un inventaire n'est déclaré complet que si le nombre d'identifiants uniques correspond au total annoncé par le site.

### Import depuis l'export JSON détaillé

```bash
# 1. Simulation : rapport uniquement, le catalogue n'est pas modifié
npm run import:p2b -- --input chemin/vers/export.json

# 2. Simulation avec vérification de chaque lien de lancement (reprise automatique si interrompue)
npm run import:p2b -- --input export.json --check-links

# 3. Écriture réelle, après lecture du rapport
npm run import:p2b -- --input export.json --check-links --apply

# 4. Illustrations originales pour les nouveaux jeux, puis relancer --apply pour les associer
npm run brand:assets
```

Options :

| Option | Effet |
| --- | --- |
| `--check-links` | Vérifie les URL de lancement valides. Résultats gardés dans `link-cache.json` : une relance reprend là où elle s'est arrêtée. |
| `--concurrency <n>` | Vérifications en parallèle (4 par défaut). |
| `--max-age-hours <h>` | Durée de validité d'une vérification (24 h par défaut). |
| `--apply` | Écrit `src/data/games.seed.json`, le manifeste et l'historique, puis régénère `supabase/seed.sql`. |
| `--publish-verified` | Publie les fiches sans anomalie dont le lien répond. Sinon, les nouveaux jeux restent en brouillon (invisibles). |
| `--unpublish-missing` | Retire les jeux publiés qui ont disparu de l'export. À n'utiliser qu'avec un export **complet**. |

## Format attendu

Un tableau JSON (ou `{"games": [...]}`). Tous les champs sont facultatifs sauf un titre, un genre reconnu et une URL :

```json
{
  "id": "identifiant-unique",
  "title": "Nom du jeu",
  "description": "…",
  "genres": ["fps", "action"],
  "original_platform": "PC",
  "year": 1999,
  "original_developer": "…",
  "port_author": "…",
  "page_url": "https://…",
  "play_url": "https://…",
  "cover_url": "https://…",
  "controls": {"keyboard": true, "mouse": true, "touch": false, "gamepad": false},
  "embeddable": false,
  "license_notes": "…"
}
```

Un exemple complet, avec les cas d'erreur, se trouve dans `src/lib/importer/__tests__/sample-export.json`.

## Règles appliquées

- **Mode de lancement** : toujours un lien externe (`link_only`). L'intégration en iframe demande l'accord de l'auteur et l'ajout du domaine à la liste autorisée ; l'hébergement demande une licence de redistribution. Le rapport compte les candidats, il ne les active jamais.
- **Rien n'est inventé** : un genre absent du catalogue (RPG, aventure, simulation…) est mis de côté. Une fiche sans genre reconnu est rejetée et listée dans le rapport. Une description absente est remplacée par une phrase construite uniquement avec les données de la fiche, et signalée.
- **URL refusées** : http, raccourcisseurs (bit.ly, lkgp.pro…), adresses IP, hôtes locaux, URL avec identifiants. Elles ne sont jamais contactées.
- **Vérification des liens** : une protection anti-robot est notée « à tester à la main », jamais « cassé ». Une redirection vers un autre domaine ou un certificat HTTPS invalide est signalé.
- **Doublons** : même identifiant, ou même URL de lancement (à `www.` et `/` final près). Un jeu déjà au catalogue sous une autre source n'est pas recréé.
- **Mises à jour** : le manifeste garde la dernière valeur importée de chaque champ. Un champ modifié à la main dans le catalogue n'est jamais écrasé ; le rapport le signale.
- **Images** : les jaquettes de la source ne sont pas reprises (droits non accordés, et la CSP n'autorise que nos images). `npm run brand:assets` génère une illustration originale par genre.

## Fichiers

| Fichier | Rôle | Versionné |
| --- | --- | --- |
| `imports/ported2browser/manifest.json` | Lien source ↔ jeu, dernières valeurs importées | oui |
| `imports/ported2browser/history.jsonl` | Historique des créations, mises à jour et retraits | oui |
| `imports/ported2browser/raw/` | Copie brute de chaque export importé | non |
| `imports/ported2browser/reports/` | Rapports de chaque exécution (Markdown + JSON) | non |
| `imports/ported2browser/link-cache.json` | Résultats des vérifications de liens | non |

## Retour arrière

Chaque `--apply` ne touche qu'à des fichiers versionnés : `git checkout -- src/data/games.seed.json supabase/seed.sql imports/ported2browser/` annule un import non commité, `git revert` un import commité.

Pour une base Supabase déjà en service, `seed.sql` n'insère que les nouveaux jeux (`on conflict do nothing`) : les mises à jour de fiches existantes doivent passer par l'administration ou une migration.
