import type {Session} from '@supabase/supabase-js';
import {ENV} from '@/config/env';
import {getSupabase} from '@/services/supabase';

export interface Profile {
  id: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: 'player' | 'admin';
  recommendationsConsent: boolean;
  createdAt: string;
}

export interface ProfileUpdate {
  displayName?: string;
  avatarUrl?: string | null;
  recommendationsConsent?: boolean;
}

/** Translate the most common Supabase auth errors into French messages. */
export function authErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou mot de passe incorrect.';
  if (/already registered|already been registered|user already exists/i.test(msg)) return 'Un compte existe déjà avec cet e-mail.';
  if (/password should be at least/i.test(msg)) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (/email not confirmed/i.test(msg)) return "Confirme d'abord ton e-mail grâce au lien reçu.";
  if (/rate limit|too many/i.test(msg)) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  if (/invalid email|unable to validate email/i.test(msg)) return 'Adresse e-mail invalide.';
  if (/failed to fetch|network/i.test(msg)) return 'Serveur injoignable. Vérifie ta connexion.';
  return 'Une erreur est survenue. Réessaie.';
}

export async function getSession(): Promise<Session | null> {
  if (!ENV.backendEnabled) return null;
  const sb = await getSupabase();
  const {data} = await sb.auth.getSession();
  return data.session;
}

export async function onAuthChange(cb: (session: Session | null) => void): Promise<() => void> {
  if (!ENV.backendEnabled) return () => {};
  const sb = await getSupabase();
  const {data} = sb.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function signUp(email: string, password: string, displayName: string) {
  const sb = await getSupabase();
  const {data, error} = await sb.auth.signUp({
    email,
    password,
    options: {data: {display_name: displayName}, emailRedirectTo: window.location.origin + '/profil'},
  });
  if (error) throw error;
  /** When e-mail confirmation is enabled, there is no session until the link is clicked. */
  return {needsConfirmation: !data.session};
}

export async function signIn(email: string, password: string) {
  const sb = await getSupabase();
  const {error} = await sb.auth.signInWithPassword({email, password});
  if (error) throw error;
}

export async function signOut() {
  const sb = await getSupabase();
  await sb.auth.signOut();
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const sb = await getSupabase();
  const {data, error} = await sb
    .from('profiles')
    .select('id, username, display_name, avatar_url, role, recommendations_consent, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name ?? 'Joueur',
    avatarUrl: data.avatar_url,
    role: data.role === 'admin' ? 'admin' : 'player',
    recommendationsConsent: Boolean(data.recommendations_consent),
    createdAt: data.created_at,
  };
}

export async function updateProfile(userId: string, update: ProfileUpdate) {
  const sb = await getSupabase();
  const payload: Record<string, unknown> = {};
  if (update.displayName !== undefined) payload.display_name = update.displayName.trim().slice(0, 40);
  if (update.avatarUrl !== undefined) payload.avatar_url = update.avatarUrl;
  if (update.recommendationsConsent !== undefined) payload.recommendations_consent = update.recommendationsConsent;
  const {error} = await sb.from('profiles').update(payload).eq('id', userId);
  if (error) throw error;
}

export const AVATAR_MAX_BYTES = 1024 * 1024;
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Formats acceptés : PNG, JPEG ou WebP.');
  }
  if (file.size > AVATAR_MAX_BYTES) throw new Error('Image trop lourde (1 Mo maximum).');
  const sb = await getSupabase();
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const {error} = await sb.storage.from('avatars').upload(path, file, {contentType: file.type, upsert: false});
  if (error) throw error;
  return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

/** Permanently deletes the account and all associated data (Edge Function `delete-account`). */
export async function deleteAccount() {
  const sb = await getSupabase();
  const {error} = await sb.functions.invoke('delete-account', {method: 'POST'});
  if (error) throw error;
  await sb.auth.signOut();
}
