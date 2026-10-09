/** Runtime configuration read from Vite env variables (see .env.example). */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export const ENV = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  /** False = "local mode": seed catalog, browser-only user data, no accounts/admin. */
  backendEnabled: Boolean(url && anonKey),
} as const;
