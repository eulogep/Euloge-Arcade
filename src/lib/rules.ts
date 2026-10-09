import type {LaunchMode} from '@/types/game';

/** Dependency-free validation rules shared by the player (no zod) and the admin schema. */

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Hosted games must live under /games/ on our own origin; no traversal, no scheme. */
export const HOSTED_PATH_RE = /^\/games\/[a-z0-9-]+\/[a-zA-Z0-9._\-/]*$/;

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Which license statuses allow each launch mode. Mirrors the SQL trigger. */
export const LICENSES_ALLOWED_FOR_MODE: Record<LaunchMode, readonly string[]> = {
  hosted: ['owned', 'open_source'],
  embed: ['owned', 'open_source', 'embed_permitted'],
  external: ['owned', 'open_source', 'embed_permitted', 'link_only'],
};
