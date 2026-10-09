import {z} from 'zod';
import {HOSTED_PATH_RE, isHttpsUrl, LICENSES_ALLOWED_FOR_MODE, SLUG_RE} from '@/lib/rules';
import {GAME_STATUSES, GENRES, LAUNCH_MODES, LICENSE_STATUSES} from '@/types/game';

export {HOSTED_PATH_RE, isHttpsUrl, LICENSES_ALLOWED_FOR_MODE, SLUG_RE};

/**
 * Validation rules for a game, shared by the admin form, the local catalog loader
 * and tests. The same rules are enforced server-side by the `validate_game`
 * trigger in supabase/migrations (client validation is only for UX).
 */

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
    // 'unverified' is allowed for drafts in any mode; publishing it is refused below.
    if (g.license_status !== 'unverified' && !LICENSES_ALLOWED_FOR_MODE[g.launch_mode].includes(g.license_status)) {
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
