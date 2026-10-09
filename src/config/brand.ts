/**
 * Single source of truth for the platform identity.
 *
 * Rename the platform, change the creator signature or add official links here:
 * the header, footer, intro, About page, admin, <head> metadata (see vite.config.ts)
 * and Open Graph tags all read from this object.
 *
 * Keep this file free of `import.meta.env` so it can also be imported by vite.config.ts.
 */
export const BRAND = {
  name: 'Euloge Arcade',
  /** Uppercase wordmark used in the logo lockup. */
  wordmark: 'EULOGE ARCADE',
  monogram: 'E',
  creator: 'Euloge',
  signature: 'Created by Euloge',
  copyrightYear: 2026,
  copyright: '© 2026 Euloge Arcade. All rights reserved.',
  tagline: 'Des jeux instantanés, directement dans ton navigateur.',
  description:
    "Euloge Arcade est une plateforme indépendante pour découvrir des jeux et y jouer directement dans le navigateur : jeux hébergés, intégrations officielles et liens vers les sites d'origine.",
  aboutStatement:
    "Euloge Arcade est une plateforme imaginée et développée par Euloge, avec l'ambition de rendre les jeux accessibles rapidement, directement depuis le navigateur, à travers une expérience moderne et immersive.",
  /** Public URL of the deployed site, used for canonical/Open Graph URLs. */
  siteUrl: 'https://euloge-arcade.pages.dev',
  themeColor: '#070914',
  /** Official links. Empty values are hidden in the UI (no dead buttons). */
  links: {
    github: '',
    portfolio: '',
    x: '',
    instagram: '',
    linkedin: '',
    youtube: '',
  },
  /** Contact address shown on the legal/privacy pages. Empty = hidden. */
  contactEmail: '',
  assets: {
    markDark: '/brand/logo-mark-dark.svg',
    markLight: '/brand/logo-mark-light.svg',
    markMono: '/brand/logo-mark-mono.svg',
    favicon: '/brand/favicon.svg',
    appleTouchIcon: '/brand/apple-touch-icon.png',
    ogImage: '/brand/og-image.png',
  },
} as const;

export type BrandLinks = typeof BRAND.links;
