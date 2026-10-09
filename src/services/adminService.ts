import type {ValidGameInput} from '@/lib/gameSchema';
import {IMAGE_MIME_TYPES} from '@/services/authService';
import {GAME_COLUMNS, rowToGame} from '@/services/mappers';
import {getSupabase} from '@/services/supabase';
import type {Game, GameRow, GameStatus} from '@/types/game';

/**
 * Admin operations. The UI hides admin screens from non-admins, but the real
 * protection is server-side: every write below is checked by RLS (`is_admin()`),
 * the `validate_game` trigger and storage policies.
 */

export async function adminListGames(): Promise<Game[]> {
  const sb = await getSupabase();
  const {data, error} = await sb.from('games').select(GAME_COLUMNS).order('updated_at', {ascending: false});
  if (error) throw error;
  return (data as unknown as GameRow[]).map(rowToGame);
}

export async function adminGetGame(id: string): Promise<Game | null> {
  const sb = await getSupabase();
  const {data, error} = await sb.from('games').select(GAME_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToGame(data as unknown as GameRow) : null;
}

export async function adminSaveGame(input: ValidGameInput, id?: string): Promise<Game> {
  const sb = await getSupabase();
  const query = id
    ? sb.from('games').update(input).eq('id', id).select(GAME_COLUMNS).single()
    : sb.from('games').insert(input).select(GAME_COLUMNS).single();
  const {data, error} = await query;
  if (error) throw error;
  return rowToGame(data as unknown as GameRow);
}

export async function adminSetStatus(id: string, status: GameStatus): Promise<void> {
  const sb = await getSupabase();
  const {error} = await sb.from('games').update({status}).eq('id', id);
  if (error) throw error;
}

export async function adminDeleteGame(id: string): Promise<void> {
  const sb = await getSupabase();
  const {error} = await sb.from('games').delete().eq('id', id);
  if (error) throw error;
}

export const COVER_MAX_BYTES = 2 * 1024 * 1024;

export async function adminUploadCover(file: File, slug: string): Promise<string> {
  const allowed = [...IMAGE_MIME_TYPES, 'image/avif'];
  if (!allowed.includes(file.type)) throw new Error('Formats acceptés : PNG, JPEG, WebP ou AVIF (pas de SVG).');
  if (file.size > COVER_MAX_BYTES) throw new Error('Image trop lourde (2 Mo maximum).');
  const sb = await getSupabase();
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  const safeSlug = slug.replace(/[^a-z0-9-]/g, '') || 'game';
  const path = `${safeSlug}/${Date.now()}.${ext}`;
  const {error} = await sb.storage.from('covers').upload(path, file, {contentType: file.type, upsert: false});
  if (error) throw error;
  return sb.storage.from('covers').getPublicUrl(path).data.publicUrl;
}

export interface EmbedDomain {
  domain: string;
  note: string | null;
}

export async function adminListEmbedDomains(): Promise<EmbedDomain[]> {
  const sb = await getSupabase();
  const {data, error} = await sb.from('embed_domains').select('domain, note').order('domain');
  if (error) throw error;
  return data as EmbedDomain[];
}

export async function adminAddEmbedDomain(domain: string, note: string): Promise<void> {
  const sb = await getSupabase();
  const {error} = await sb.from('embed_domains').insert({domain: domain.trim().toLowerCase(), note: note.trim() || null});
  if (error) throw error;
}

export async function adminRemoveEmbedDomain(domain: string): Promise<void> {
  const sb = await getSupabase();
  const {error} = await sb.from('embed_domains').delete().eq('domain', domain);
  if (error) throw error;
}

export interface LinkCheckResult {
  id: string;
  slug: string;
  status: string;
  detail: string;
}

/** Runs the `check-links` Edge Function (server-side fetch; admin only). */
export async function adminCheckLinks(): Promise<LinkCheckResult[]> {
  const sb = await getSupabase();
  const {data, error} = await sb.functions.invoke('check-links', {
    method: 'POST',
    body: {siteUrl: window.location.origin},
  });
  if (error) throw error;
  return (data as {results: LinkCheckResult[]}).results;
}

/** Turns Postgres/PostgREST errors into a readable admin message. */
export function adminErrorMessage(error: unknown): string {
  const e = error as {message?: string; code?: string};
  if (e?.code === '42501') return "Action refusée : ce compte n'a pas les droits administrateur.";
  if (e?.code === '23505') return 'Ce slug est déjà utilisé par un autre jeu.';
  if (e?.code === '22023' && e.message) return e.message;
  return e?.message ?? 'Erreur inconnue.';
}
