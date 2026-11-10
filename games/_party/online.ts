/**
 * Online rooms for party games (Supabase). The server is authoritative: every move
 * is an RPC that checks phase, role and target; each device reads only its own view
 * (party_state). supabase-js is loaded on demand, only when a player goes online.
 *
 * Players get an anonymous Supabase session stored under its own key, so it never
 * mixes with the platform account session (same origin, different storage key).
 */
import type {SupabaseClient} from '@supabase/supabase-js';

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';
export const ONLINE_AVAILABLE = Boolean(URL_ && KEY);
export const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

let clientPromise: Promise<SupabaseClient> | null = null;

export function getClient(): Promise<SupabaseClient> {
  if (!ONLINE_AVAILABLE) return Promise.reject(new Error('Le jeu en ligne n’est pas disponible sur cette installation.'));
  clientPromise ??= import('@supabase/supabase-js').then(({createClient}) =>
    createClient(URL_, KEY, {
      auth: {storageKey: 'euloge-arcade-party-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false},
    }),
  );
  return clientPromise;
}

/** Signs in anonymously if needed and returns the player's id. */
export async function ensureSession(): Promise<string> {
  const sb = await getClient();
  const {data} = await sb.auth.getSession();
  if (data.session) return data.session.user.id;
  const {data: signed, error} = await sb.auth.signInAnonymously();
  if (error || !signed.user) {
    throw new Error('Impossible de se connecter au serveur de jeu. Vérifie ta connexion et réessaie.');
  }
  return signed.user.id;
}

/** Calls a party RPC; server messages are already written for players. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const sb = await getClient();
  const {data, error} = await sb.rpc(fn, args);
  if (error) {
    const msg = error.message && !/fetch|network/i.test(error.message) ? error.message : 'Le serveur ne répond pas. Réessaie dans un instant.';
    throw new Error(msg);
  }
  return data as T;
}

/**
 * Calls `onChange` whenever the room changes (Realtime on party_rooms.version), with a
 * polling safety net: every 4 s while Realtime is not connected, every 20 s otherwise.
 */
export function watchRoom(roomId: string, onChange: () => void): () => void {
  let live = false;
  let stopped = false;
  let timer = 0;
  let unsubscribe = () => {};

  const schedule = () => {
    window.clearTimeout(timer);
    if (stopped) return;
    timer = window.setTimeout(() => {
      onChange();
      schedule();
    }, live ? 20_000 : 4_000);
  };

  void getClient().then((sb) => {
    if (stopped) return;
    const channel = sb
      .channel(`party-room-${roomId}`)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'party_rooms', filter: `id=eq.${roomId}`}, () => onChange())
      .subscribe((status) => {
        const wasLive = live;
        live = status === 'SUBSCRIBED';
        if (live && !wasLive) onChange(); // catch up on anything missed while connecting
        schedule();
      });
    unsubscribe = () => void sb.removeChannel(channel);
  });
  schedule();

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    unsubscribe();
  };
}

/** Link that opens the game page on the platform with the room code prefilled. */
export function roomLink(gameSlug: string, code: string): string {
  const origin = window.location.origin;
  return `${origin}/jeux/${gameSlug}?jouer=1&salon=${code}`;
}

/** Room code passed in the URL (?salon=…), if valid. */
export function codeFromUrl(): string | null {
  const c = new URLSearchParams(window.location.search).get('salon')?.toUpperCase() ?? '';
  return CODE_PATTERN.test(c) ? c : null;
}

const LAST_ROOM_KEY = (game: string) => `euloge-arcade:party-room:${game}`;
export function rememberRoom(game: string, roomId: string | null) {
  try {
    if (roomId) localStorage.setItem(LAST_ROOM_KEY(game), roomId);
    else localStorage.removeItem(LAST_ROOM_KEY(game));
  } catch {
    /* ignore */
  }
}
export function lastRoom(game: string): string | null {
  try {
    return localStorage.getItem(LAST_ROOM_KEY(game));
  } catch {
    return null;
  }
}
