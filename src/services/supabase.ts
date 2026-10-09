import type {SupabaseClient} from '@supabase/supabase-js';
import {ENV} from '@/config/env';

let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Lazily loads supabase-js (kept out of the initial bundle) and returns a singleton.
 * Throws if the backend isn't configured — callers check ENV.backendEnabled first.
 */
export function getSupabase(): Promise<SupabaseClient> {
  if (!ENV.backendEnabled) {
    return Promise.reject(new Error('Backend non configuré'));
  }
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({createClient}) =>
      createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
        auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true},
      }),
    );
  }
  return clientPromise;
}
