# Audit du projet initial

Date : 2026-10-10 · Commit de référence : `f84793a` (baseline avant les travaux sur la plateforme)

## 1. Ce que contenait le dépôt

| Élément | Constat |
| --- | --- |
| Contenu | **Un seul jeu** : *System Breach*, un plateformer d'action cyberpunk avec 3 secteurs et 3 boss, en React + TypeScript + Canvas 2D. |
| Origine | Export d'un environnement « Playground » : pas de `package.json`, pas de `index.html`, pas de bundler, pas de tests. Le projet ne pouvait pas être construit tel quel. |
| Technologies | React (le fichier de notices indique React 19), lucide-react, Tailwind (classes utilitaires, sans configuration fournie), Web Audio API. Les notices listent aussi three, phaser, framer-motion et @react-three/*, qui **ne sont jamais importés** : ce sont des dépendances inutiles. |
| Chargement | `index.tsx` monte `<App/>`. Les images et la musique sont chargées à l'exécution par chemins relatifs (`assets/...`). |
| SDK | `utils/usePlayground.ts` charge un script distant (`gstatic.com/.../playground.js`) sauf en mode aperçu, où il utilise `playground-fake.ts`. |
| Poids | 14 Mo d'assets, dont `player_hacker.png` (**11 Mo**), qui **n'est référencé nulle part** dans le code. |

## 2. Fonctionnalités du jeu

Ce qui existe : physique soignée (coyote time, tampon de saut, gravité asymétrique), tir, écrasement des ennemis en sautant dessus, plateformes mobiles et clignotantes, lasers, 3 boss multi-phases, checkpoints, mode contre-la-montre, rang final, commandes tactiles, menu pause.

Ce qui a été ajouté ou corrigé lors de la session précédente (le correctif de pause fait aussi partie des bugs de la section 3) : dash, drones qui tirent, combos, bonus de fragments, records locaux, correction de la perte de plusieurs vies sur une seule chute, correction de la pause avec Échap.

## 3. Bugs, performances et risques

- **Bug (corrigé)** : santé et vies appliquées en différé via `setState`, ce qui provoquait des dégâts cumulés et plusieurs vies perdues en une frame.
- **Bug (corrigé)** : la victoire pouvait se déclencher plusieurs fois, ajoutant +1500 points à chaque fois.
- **Performance** : `setGameState` est appelé à chaque pas physique (60 fois par seconde) pour le chronomètre, ce qui fait re-rendre React 60 fois par seconde. C'est acceptable pour l'instant ; c'est une piste d'optimisation identifiée.
- **Performance** : l'asset de 11 Mo inutilisé est sorti du dossier publié (`games/system-breach/source-assets/`).
- **Vie privée / réseau** : le SDK Playground distant n'a aucune utilité hors de la plateforme Playground. Sur Euloge Arcade, le jeu force le SDK local (aucun appel à gstatic).
- **Sécurité** : `useRpc` envoie `postMessage(message, '*')`. Ce code reste inactif sur la plateforme, mais il est signalé. Le pont des scores ajouté pour la plateforme envoie toujours ses messages vers une origine explicite.

## 4. Inventaire des jeux et droits

Les en-têtes ont été vérifiés avec `curl` le 2026-10-10.

| Jeu | Droits | Intégration technique | Mode retenu |
| --- | --- | --- | --- |
| System Breach | Projet fourni par le propriétaire du dépôt | Code source disponible | **A — hébergé** |
| Lichess, puzzle du jour (`/training/frame`) | Widget d'intégration officiel proposé par Lichess (logiciel libre, AGPL) | Pas de `X-Frame-Options`, intégrable | **B — intégré** |
| Lichess (partie complète) | Lien uniquement | `X-Frame-Options: DENY` | C — externe |
| Krunker.io | Lien uniquement | `X-Frame-Options: SAMEORIGIN` | C — externe |
| 2048 (play2048.co) | Lien uniquement | CSP `frame-ancestors` limitée à ses propres domaines | C — externe |

Aucun visuel ni logo de jeu tiers n'est réutilisé. Leurs couvertures sont des illustrations originales générées pour la plateforme.

## 5. Ce qui est réutilisé

- Le jeu entier, déplacé dans `games/system-breach/` sans réécriture.
- La direction néon cyan/magenta du jeu, qui inspire la palette de la plateforme (bleu électrique et violet).
- `lucide-react`, déjà utilisé par le jeu, sert aussi d'iconographie pour la plateforme.

## 6. Décisions d'architecture

Voir [ARCHITECTURE.md](./ARCHITECTURE.md).
