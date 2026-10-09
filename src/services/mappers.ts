import type {Compatibility, Game, GameRow, Genre} from '@/types/game';
import {GENRES} from '@/types/game';

const DEFAULT_COMPAT: Compatibility = {
  keyboard: false,
  mouse: false,
  gamepad: false,
  touch: false,
  verified: false,
};

export function rowToGame(row: GameRow): Game {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    tagline: row.tagline ?? '',
    description: row.description,
    instructions: row.instructions ?? '',
    genre: (row.genre ?? []).filter((g): g is Genre => (GENRES as readonly string[]).includes(g)),
    coverUrl: row.cover_url,
    bannerUrl: row.banner_url,
    launchMode: row.launch_mode,
    launchUrl: row.launch_url,
    sourceUrl: row.source_url,
    developer: row.developer,
    licenseStatus: row.license_status,
    licenseNotes: row.license_notes,
    compatibility: {...DEFAULT_COMPAT, ...(row.compatibility ?? {})},
    controls: Array.isArray(row.controls) ? row.controls : [],
    orientation: row.orientation ?? 'any',
    featured: Boolean(row.featured),
    featuredRank: row.featured_rank,
    supportsScores: Boolean(row.supports_scores),
    status: row.status,
    publishedAt: row.published_at,
    linkStatus: row.link_status ?? 'unchecked',
    linkCheckedAt: row.link_checked_at,
    linkCheckDetail: row.link_check_detail ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Columns selected for the public catalog. */
export const GAME_COLUMNS =
  'id, slug, title, tagline, description, instructions, genre, cover_url, banner_url, launch_mode, launch_url, source_url, developer, license_status, license_notes, compatibility, controls, orientation, featured, featured_rank, supports_scores, status, published_at, link_status, link_checked_at, link_check_detail, created_at, updated_at';
