import {z} from 'zod';
import {GAME_STATUSES, GENRES, LAUNCH_MODES, LICENSE_STATUSES} from '@/types/game';

/**
 * Validation rules for a game, shared by the admin form, the local catalog loader
 * and tests. The same rules are enforced server-side by the `validate_game`
 * trigger in supabase/migrations (client validation is only for UX).
 */

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
export const LICENSES_ALLOWED_FOR_MODE: Record<(typeof LAUNCH_MODES)[number], readonly string[]> = {
  hosted: ['owned', 'open_source'],
  embed: ['owned', 'open_source', 'embed_permitted'],
  external: ['owned', 'open_source', 'embed_permitted', 'link_only'],
};

const compatibilitySchema = z.object({
  keyboard: z.boolean(),
  mouse: z.boolean(),
  gamepad: z.boolean(),
  touch: z.boolean(),
  verified: z.boolean(),
});

const controlSchema = z.object({
  device: z.enum(['keyboard', 'mouse', 'gamepad', 'touch']),
  input: z.string().trim().min(1).max(60),
  action: z.string().trim().min(1).max(80),
});

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .nullable()
  .transform((v) => (v ? v : null));

export const gameInputSchema = z
  .object({
    slug: z.string().trim().min(2).max(60).regex(SLUG_RE, 'Slug : minuscules, chiffres et tirets uniquement'),
    title: z.string().trim().min(1, 'Titre requis').max(80),
    tagline: z.string().trim().max(140),
    description: z.string().trim().min(10, 'Description trop courte (10 caractères min.)').max(4000),
    instructions: z.string().trim().max(4000),
    genre: z.array(z.enum(GENRES)).min(1, 'Choisis au moins un genre').max(5),
    cover_url: optionalUrl,
    banner_url: optionalUrl,
    launch_mode: z.enum(LAUNCH_MODES),
    launch_url: z.string().trim().min(1, 'URL de lancement requise').max(2048),
    source_url: optionalUrl,
    developer: z.string().trim().max(120).nullable().transform((v) => (v ? v : null)),
    license_status: z.enum(LICENSE_STATUSES),
    license_notes: z.string().trim().max(2000).nullable().transform((v) => (v ? v : null)),
    compatibility: compatibilitySchema,
    controls: z.array(controlSchema).max(30),
    orientation: z.enum(['any', 'landscape', 'portrait']),
    featured: z.boolean(),
    featured_rank: z.number().int().min(1).max(99).nullable(),
    supports_scores: z.boolean(),
    status: z.enum(GAME_STATUSES),
  })
  .superRefine((g, ctx) => {
    if (g.launch_mode === 'hosted' && !HOSTED_PATH_RE.test(g.launch_url)) {
      ctx.addIssue({
        code: 'custom',
        path: ['launch_url'],
        message: 'Un jeu hébergé doit pointer vers un chemin /games/<slug>/… du site.',
      });
    }
    if (g.launch_url.includes('..')) {
      ctx.addIssue({code: 'custom', path: ['launch_url'], message: 'Chemin invalide.'});
    }
    if (g.launch_mode !== 'hosted' && !isHttpsUrl(g.launch_url)) {
      ctx.addIssue({code: 'custom', path: ['launch_url'], message: 'URL https:// requise.'});
    }
    for (const key of ['cover_url', 'banner_url', 'source_url'] as const) {
      const v = g[key];
      if (v && !(v.startsWith('/') && !v.startsWith('//')) && !isHttpsUrl(v)) {
        ctx.addIssue({code: 'custom', path: [key], message: 'URL https:// ou chemin local requis.'});
      }
    }
    if (!LICENSES_ALLOWED_FOR_MODE[g.launch_mode].includes(g.license_status)) {
      ctx.addIssue({
        code: 'custom',
        path: ['license_status'],
        message: `Ce statut de licence ne permet pas le mode « ${g.launch_mode} ».`,
      });
    }
    if (g.status === 'published' && g.license_status === 'unverified') {
      ctx.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Impossible de publier un jeu dont les droits ne sont pas vérifiés.',
      });
    }
  });

export type GameInput = z.input<typeof gameInputSchema>;
export type ValidGameInput = z.output<typeof gameInputSchema>;
