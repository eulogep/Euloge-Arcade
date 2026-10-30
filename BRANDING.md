# Euloge Arcade — identité de marque

| | |
| --- | --- |
| Marque | **Euloge Arcade** (wordmark : `EULOGE ARCADE`) |
| Créateur | Euloge |
| Signature | **Created by Euloge** |
| Copyright | **© 2026 Euloge Arcade. All rights reserved.** Il s'applique à la plateforme et à ses créations originales, **jamais** aux jeux tiers. |
| Positionnement | Plateforme indépendante de découverte et d'accès à des jeux sur navigateur : premium, rapide, respectueuse des créateurs. |

Toutes ces valeurs sont centralisées dans **`src/config/brand.ts`**. Renommer la plateforme ou ajouter les liens officiels se fait à un seul endroit ; l'interface, les métadonnées HTML et Open Graph suivent automatiquement.

## Logo : le monogramme « E »

- **Cadre** : un carré dont deux coins opposés sont coupés en biseau (haut gauche, bas droit). Il évoque à la fois une cartouche de jeu et un écran.
- **Lettre E** : construite géométriquement, avec des extrémités biseautées.
- **Barre centrale** : détachée du fût, comme une impulsion de données. C'est l'élément distinctif, qui reste lisible jusqu'en 16 px.
- **Couleur** : dégradé du cyan au bleu électrique puis au violet, avec un halo lumineux discret en version sombre.

| Fichier | Usage |
| --- | --- |
| `public/brand/logo-mark-dark.svg` | Version principale, sur fond sombre (avec halo) |
| `public/brand/logo-mark-light.svg` | Sur fond clair (tons plus profonds, sans halo) |
| `public/brand/logo-mark-mono.svg` | Monochrome (`currentColor`) : impression, gravure, filigrane |
| `public/brand/favicon.svg` | Favicon simplifié, traits plus épais |
| `public/brand/apple-touch-icon.png`, `icon-512.png` | Icônes d'application (générées) |
| `public/brand/og-image.png` | Image de partage 1200×630 (générée) |
| `src/components/ui/Logo.tsx` | Composants `LogoMark` et `Logo` (monogramme + wordmark + signature), qui suivent le thème |

Pour régénérer les images PNG : `npm run brand:assets`.

**À éviter** : déformer le monogramme, recolorer le dégradé hors palette, rattacher la barre centrale au fût, placer le logo sur un visuel chargé sans fond.

## Palette & Studio d'Atmosphère (PRISM-DECK // ATELIER HOLO-CARTOUCHE)

Les couleurs sont définies en variables CSS dans `src/styles/index.css` et exposées dans Tailwind (`bg`, `surface`, `ink`, `accent`…). L'identité visuelle **PRISM-DECK // ATELIER HOLO-CARTOUCHE** traite chaque jeu comme une cartouche holographique matérielle (`EA-XXX`) dotée d'encoches biseautées (`.reticle-frame`), de panneaux de verre télémétriques (`.holo-panel`) et de quatre atmosphères visuelles sélectionnables en temps réel :

1. **Obsidian Pulse** (`data-theme="dark"`, défaut) : Saphir électrique (`#2F7BFF`), plasma violet (`#A24DFF`) et cyan laser (`#38E1FF`) sur fond obsidienne (`#060813`).
2. **Atelier Cyber-Or** (`data-theme="dark" data-skin="gold"`) : Carbone profond (`#0A0807`), or solaire (`#F59E0B`), ambre (`#FDE047`) et rubis (`#F43F5E`).
3. **Terminal Phosphore** (`data-theme="dark" data-skin="phosphor"`) : Matrice CRT (`#040C09`) et bio-émeraude haute lisibilité (`#10B981` / `#6EE7B7`).
4. **Prisme Solaire** (`data-theme="light"`) : Clarté architecturale haute lisibilité sur fond ivoire-opale (`#F4F6FC`).

| Token | Sombre (Obsidian Pulse) | Rôle |
| --- | --- | --- |
| `--bg` | `#060813` | Fond architectural + grille de perspective holographique |
| `--surface` / `--surface-2` | `#0D1124` / `#151B36` | Cartouches, panneaux `.holo-panel` |
| `--accent` | `#2F7BFF` | Bleu électrique, couleur principale |
| `--accent-2` | `#A24DFF` | Violet |
| `--accent-3` | `#38E1FF` | Cyan, pour la lumière et les états actifs |
| `--ink` / `--ink-muted` / `--ink-faint` | `#EEF2FF` / `#AAB4D6` / `#909AC2` | Texte. Les contrastes sont vérifiés WCAG AA par axe sur toutes les atmosphères. |

## Typographie

- **Space Grotesk** pour les titres et le wordmark : géométrique, technique.
- **Inter** pour le texte : très lisible.
- Les deux polices sont auto-hébergées via Fontsource : aucune requête vers un service externe.

## Mouvement

- **Introduction** : le monogramme se dessine, s'illumine, puis s'efface. Elle est jouée une fois par session, jamais lors d'un changement de page, et peut être passée par un clic ou une touche.
- **Effets** : cartes à profondeur 3D, lumière qui suit le pointeur, carrousel en fondu avec léger zoom (Ken Burns), apparition progressive des textes.
- **Accessibilité** : tout mouvement est désactivé avec `prefers-reduced-motion` ou le réglage « Réduire les animations » du profil.

## Où la marque apparaît

- Le header (monogramme, wordmark et signature).
- L'écran de démarrage avant le chargement du JavaScript, puis l'introduction animée.
- Le favicon et les icônes d'application.
- Les métadonnées et Open Graph.
- Le footer (copyright et signature).
- La page À propos (déclaration et « Créé et développé par Euloge »).
- L'espace d'administration (« Euloge Arcade Admin »).
- Les écrans de chargement (`BrandLoader`).

## Propriété intellectuelle

- Les éléments originaux d'Euloge Arcade sont l'interface, le code, le logo, la marque et les illustrations de couverture.
- Les jeux tiers, leurs noms, logos et contenus appartiennent à leurs auteurs. Ils ne sont jamais utilisés comme éléments de l'identité d'Euloge Arcade.
- Leurs couvertures sur la plateforme sont des illustrations originales, qui ne reprennent ni leurs logos ni leurs visuels.
