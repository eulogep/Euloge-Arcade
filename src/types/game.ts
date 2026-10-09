/**
 * Game metamodel. Mirrors the `public.games` table (snake_case there, camelCase here);
 * see src/services/mappers.ts for the conversion.
 */

export const LAUNCH_MODES = ['hosted', 'embed', 'external'] as const;
export type LaunchMode = (typeof LAUNCH_MODES)[number];

export const GAME_STATUSES = ['draft', 'published', 'unpublished'] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

/**
 * - owned: the platform owner holds the rights (first-party game)
 * - open_source: redistributable under an open-source license (license must be credited)
 * - embed_permitted: the provider explicitly offers/permits iframe embedding
 * - link_only: no distribution right; we only link to the official site
 * - unverified: rights not checked yet — can never be published
 */
export const LICENSE_STATUSES = [
  'owned',
  'open_source',
  'embed_permitted',
  'link_only',
  'unverified',
] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export const LINK_STATUSES = ['unchecked', 'ok', 'broken', 'embed_blocked'] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

export const GENRES = [
  'action',
  'fps',
  'platformer',
  'arcade',
  'puzzle',
  'strategy',
  'board',
  'retro',
  'racing',
  'sports',
] as const;
export type Genre = (typeof GENRES)[number];

export interface Compatibility {
  keyboard: boolean;
  mouse: boolean;
  gamepad: boolean;
  touch: boolean;
  /** True only when the flags above were actually tested. Unverified flags are not shown. */
  verified: boolean;
}

export type ControlDevice = 'keyboard' | 'mouse' | 'gamepad' | 'touch';

export interface ControlBinding {
  device: ControlDevice;
  input: string;
  action: string;
}

export type Orientation = 'any' | 'landscape' | 'portrait';

export interface Game {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  instructions: string;
  genre: Genre[];
  coverUrl: string | null;
  bannerUrl: string | null;
  launchMode: LaunchMode;
  launchUrl: string;
  sourceUrl: string | null;
  developer: string | null;
  licenseStatus: LicenseStatus;
  licenseNotes: string | null;
  compatibility: Compatibility;
  controls: ControlBinding[];
  orientation: Orientation;
  featured: boolean;
  featuredRank: number | null;
  supportsScores: boolean;
  status: GameStatus;
  publishedAt: string | null;
  linkStatus: LinkStatus;
  linkCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row shape of public.games (and of the seed file). */
export interface GameRow {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  instructions: string;
  genre: string[];
  cover_url: string | null;
  banner_url: string | null;
  launch_mode: LaunchMode;
  launch_url: string;
  source_url: string | null;
  developer: string | null;
  license_status: LicenseStatus;
  license_notes: string | null;
  compatibility: Compatibility;
  controls: ControlBinding[];
  orientation: Orientation;
  featured: boolean;
  featured_rank: number | null;
  supports_scores: boolean;
  status: GameStatus;
  published_at: string | null;
  link_status: LinkStatus;
  link_checked_at: string | null;
  created_at: string;
  updated_at: string;
}
