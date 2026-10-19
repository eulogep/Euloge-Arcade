import {gameInputSchema} from '@/lib/gameSchema';
import {isHttpsUrl} from '@/lib/rules';
import {GENRES, type Compatibility, type GameRow, type GameStatus, type Genre, type LinkStatus} from '@/types/game';

/**
 * Ported2Browser catalog importer — pure logic (no file system, no network).
 *
 *   export JSON → parseExport → normalize → dedupe → plan (diff with catalog + manifest) → applyPlan
 *
 * Rules:
 * - Every imported game is an external link (`link_only`): nothing is hosted or framed automatically.
 *   Embedding needs the author's permission and the embed allowlist; hosting needs a license.
 * - Missing information is never invented: an entry that cannot satisfy the catalog schema is
 *   rejected and listed for review instead of being filled with guesses.
 * - Fields edited by hand in the catalog are never overwritten (three-way merge with the manifest).
 * - New entries are drafts unless `publish: 'verified'` and the entry is clean with a working link.
 */

export const SOURCE_NAME = 'Ported2Browser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One record of the export, as agreed with the site owner. Every field may be missing. */
export interface RawEntry {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  genres?: unknown;
  original_platform?: unknown;
  year?: unknown;
  original_developer?: unknown;
  port_author?: unknown;
  page_url?: unknown;
  play_url?: unknown;
  cover_url?: unknown;
  controls?: unknown;
  embeddable?: unknown;
  license_notes?: unknown;
}

export type IssueLevel = 'error' | 'review';
export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
}

/** Source information kept in the manifest but not shown in the catalog (yet). */
export interface SourceMeta {
  pageUrl: string | null;
  playUrl: string | null;
  originalPlatform: string | null;
  year: number | null;
  originalDeveloper: string | null;
  portAuthor: string | null;
  /** Never displayed: the CSP only allows our own images, and reuse rights are not granted. */
  coverUrl: string | null;
  embeddableClaimed: boolean | null;
  unmappedGenres: string[];
}

/** Catalog fields owned by the importer (subject to the three-way merge). */
export interface ImportedFields {
  title: string;
  tagline: string;
  description: string;
  genre: Genre[];
  launch_url: string;
  source_url: string | null;
  developer: string | null;
  license_notes: string | null;
  compatibility: Compatibility;
}
const IMPORTED_KEYS = [
  'title',
  'tagline',
  'description',
  'genre',
  'launch_url',
  'source_url',
  'developer',
  'license_notes',
  'compatibility',
] as const satisfies readonly (keyof ImportedFields)[];

export interface Candidate {
  index: number;
  sourceId: string | null;
  fields: ImportedFields | null;
  meta: SourceMeta;
  issues: Issue[];
}

export type LinkCheckStatus = 'ok' | 'broken' | 'blocked' | 'redirect_offsite' | 'error';
export interface LinkResult {
  status: LinkCheckStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  /** null = unknown. Technical capability only, never a permission. */
  frameable: boolean | null;
  detail: string | null;
  checkedAt: string;
}

export interface ManifestEntry {
  gameId: string;
  slug: string;
  firstSeenAt: string;
  lastSeenAt: string;
  missingSince: string | null;
  /** Values written by the last import, used to detect manual edits. */
  fields: ImportedFields;
  meta: SourceMeta;
}
export interface Manifest {
  source: 'ported2browser';
  version: 1;
  entries: Record<string, ManifestEntry>;
}
export const emptyManifest = (): Manifest => ({source: 'ported2browser', version: 1, entries: {}});

export type Change = {from: unknown; to: unknown};
export type PlanItem =
  | {action: 'create'; sourceId: string; after: GameRow; fields: ImportedFields; meta: SourceMeta; issues: Issue[]; link: LinkResult | null}
  | {
      action: 'update';
      sourceId: string;
      after: GameRow;
      changes: Record<string, Change>;
      keptManualEdits: string[];
      fields: ImportedFields;
      meta: SourceMeta;
      issues: Issue[];
      link: LinkResult | null;
    }
  | {action: 'unchanged'; sourceId: string; after: GameRow; fields: ImportedFields; meta: SourceMeta; issues: Issue[]; link: LinkResult | null}
  | {action: 'duplicate'; sourceId: string | null; index: number; of: string; reason: string}
  | {action: 'already_in_catalog'; sourceId: string; slug: string}
  | {action: 'rejected'; sourceId: string | null; index: number; title: string | null; issues: Issue[]}
  | {action: 'missing'; sourceId: string; slug: string; after: GameRow | null; unpublish: boolean};

export interface PlanOptions {
  now: string;
  /** 'none': new entries are drafts. 'verified': publish clean entries whose link answered OK. */
  publish: 'none' | 'verified';
  /** Unpublish catalog games whose source entry disappeared. Only meaningful with a complete export. */
  unpublishMissing: boolean;
}

export interface Plan {
  generatedAt: string;
  rawCount: number;
  linksChecked: boolean;
  items: PlanItem[];
}

export interface HistoryEvent {
  at: string;
  action: 'create' | 'update' | 'unpublish';
  sourceId: string;
  gameId: string;
  slug: string;
  changes?: Record<string, Change>;
}

// ---------------------------------------------------------------------------
// Parsing and normalization
// ---------------------------------------------------------------------------

/** Accepts `[...]`, `{games: [...]}` or `{items: [...]}`. */
export function parseExport(json: unknown): RawEntry[] {
  const list = Array.isArray(json)
    ? json
    : json && typeof json === 'object'
      ? ((json as Record<string, unknown>).games ?? (json as Record<string, unknown>).items)
      : null;
  if (!Array.isArray(list)) throw new Error('Export invalide : un tableau de fiches est attendu (ou {"games": [...]}).');
  return list.map((e) => (e && typeof e === 'object' ? (e as RawEntry) : {}));
}

const str = (v: unknown): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s ? s : null;
};
const longStr = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return s ? s : null;
};
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** Source genre labels → catalog genres. Anything else is kept aside, never guessed. */
const GENRE_SYNONYMS: Record<string, Genre> = {
  action: 'action',
  'action-adventure': 'action',
  'beat em up': 'action',
  "beat 'em up": 'action',
  fighting: 'action',
  hack: 'action',
  'hack and slash': 'action',
  fps: 'fps',
  shooter: 'fps',
  'first person shooter': 'fps',
  'first-person shooter': 'fps',
  'tactical shooter': 'fps',
  platformer: 'platformer',
  platform: 'platformer',
  plateforme: 'platformer',
  arcade: 'arcade',
  'shoot em up': 'arcade',
  "shoot 'em up": 'arcade',
  shmup: 'arcade',
  puzzle: 'puzzle',
  réflexion: 'puzzle',
  reflexion: 'puzzle',
  strategy: 'strategy',
  stratégie: 'strategy',
  strategie: 'strategy',
  rts: 'strategy',
  'real-time strategy': 'strategy',
  'real time strategy': 'strategy',
  'turn-based strategy': 'strategy',
  tactics: 'strategy',
  'tower defense': 'strategy',
  board: 'board',
  'board game': 'board',
  card: 'board',
  'card game': 'board',
  chess: 'board',
  plateau: 'board',
  retro: 'retro',
  rétro: 'retro',
  classic: 'retro',
  racing: 'racing',
  driving: 'racing',
  course: 'racing',
  sports: 'sports',
  sport: 'sports',
  football: 'sports',
  soccer: 'sports',
  skateboarding: 'sports',
  skate: 'sports',
};

export function mapGenres(value: unknown): {genres: Genre[]; unmapped: string[]} {
  const labels = (Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,/|;]/) : [])
    .map((v) => str(v))
    .filter((v): v is string => Boolean(v));
  const genres: Genre[] = [];
  const unmapped: string[] = [];
  for (const label of labels) {
    const key = label.toLowerCase().replace(/[_]+/g, ' ');
    const g = (GENRES as readonly string[]).includes(key) ? (key as Genre) : GENRE_SYNONYMS[key];
    if (g) {
      if (!genres.includes(g)) genres.push(g);
    } else if (!unmapped.includes(label)) unmapped.push(label);
  }
  return {genres: genres.slice(0, 5), unmapped};
}

/** Link shorteners and redirect services: the real destination cannot be reviewed. */
const SHORTENER_HOSTS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'is.gd',
  'cutt.ly',
  'rebrand.ly',
  'shorturl.at',
  'ow.ly',
  'buff.ly',
  'rb.gy',
  'lkgp.pro',
]);

/** Returns null when the URL is safe to link to, otherwise the reason it is not. */
export function urlProblem(value: string): string | null {
  if (value.length > 2048) return 'URL trop longue';
  if (!isHttpsUrl(value)) return 'URL https:// requise';
  const u = new URL(value);
  if (u.username || u.password) return 'URL avec identifiants';
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return 'Hôte local';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return 'Adresse IP au lieu d’un nom de domaine';
  if (SHORTENER_HOSTS.has(host.replace(/^www\./, ''))) return 'Raccourcisseur de lien : destination non vérifiable';
  return null;
}

/** Normalized form used to detect the same game behind cosmetic URL differences. */
export function urlKey(value: string): string {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/index\.html?$/i, '/').replace(/\/+$/, '') || '';
    return `${host}${path}${u.search}`;
  } catch {
    return value.trim().toLowerCase();
  }
}

export function slugify(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= 60) return base;
  return base.slice(0, 60).replace(/-[^-]*$/, '').replace(/-+$/, '') || base.slice(0, 60);
}

/** Small non-cryptographic 128-bit hash (cyrb128), enough for stable ids. */
function hash128(input: string): string {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1, h2, h3, h4].map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
}

/** Deterministic UUID for a source id: re-importing the same entry always yields the same game id. */
export function sourceUuid(sourceId: string): string {
  const h = hash128(`ported2browser:${sourceId}`);
  const variant = (8 | (parseInt(h[16], 16) & 3)).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

export function normalizeEntry(raw: RawEntry, index: number): Candidate {
  const issues: Issue[] = [];
  const err = (code: string, message: string) => issues.push({level: 'error', code, message});
  const review = (code: string, message: string) => issues.push({level: 'review', code, message});

  const title = str(raw.title);
  const pageUrl = str(raw.page_url);
  const playUrl = str(raw.play_url);
  const yearNum = typeof raw.year === 'number' ? raw.year : Number(str(raw.year));
  const year = Number.isInteger(yearNum) && yearNum >= 1950 && yearNum <= 2100 ? yearNum : null;
  const {genres, unmapped} = mapGenres(raw.genres);
  const controls = raw.controls && typeof raw.controls === 'object' ? (raw.controls as Record<string, unknown>) : {};

  const meta: SourceMeta = {
    pageUrl,
    playUrl,
    originalPlatform: str(raw.original_platform),
    year,
    originalDeveloper: str(raw.original_developer),
    portAuthor: str(raw.port_author),
    coverUrl: str(raw.cover_url),
    embeddableClaimed: bool(raw.embeddable),
    unmappedGenres: unmapped,
  };

  const sourceId = str(raw.id) ?? pageUrl ?? playUrl;
  if (!str(raw.id)) {
    if (sourceId) review('id_from_url', 'Pas d’identifiant source : l’URL sert d’identifiant.');
    else err('missing_id', 'Ni identifiant, ni URL : la fiche ne peut pas être suivie.');
  }
  if (!title) err('missing_title', 'Titre manquant.');
  else if (title.length > 80) err('title_too_long', 'Titre de plus de 80 caractères.');

  let launchUrl = playUrl;
  if (!launchUrl && pageUrl) {
    launchUrl = pageUrl;
    review('launch_is_page', 'Pas d’URL de lancement : le bouton ouvrira la fiche Ported2Browser.');
  }
  if (!launchUrl) err('missing_url', 'Aucune URL de lancement ni de fiche.');
  else {
    const p = urlProblem(launchUrl);
    if (p) err('unsafe_launch_url', `URL de lancement refusée : ${p}.`);
  }
  const sourceUrl = pageUrl ?? playUrl;
  if (pageUrl && urlProblem(pageUrl)) err('unsafe_page_url', `URL de fiche refusée : ${urlProblem(pageUrl)}.`);

  if (genres.length === 0) {
    err(
      'no_genre',
      unmapped.length
        ? `Genres non reconnus par le catalogue : ${unmapped.join(', ')}.`
        : 'Aucun genre fourni.',
    );
  } else if (unmapped.length) {
    review('unmapped_genres', `Genres ignorés (absents du catalogue) : ${unmapped.join(', ')}.`);
  }

  let description = longStr(raw.description);
  if (!description || description.length < 10) {
    // Built only from facts present in the export, and flagged so a human rewrites it.
    const facts = [meta.originalPlatform, meta.year].filter(Boolean).join(', ');
    description = title ? `${title}${facts ? ` (${facts})` : ''}, en version navigateur référencée par ${SOURCE_NAME}.` : '';
    review('generated_description', 'Description absente : texte minimal généré à partir des données de la fiche.');
  }

  const tagline = clip(['Portage navigateur', meta.originalPlatform, meta.year].filter(Boolean).join(' · '), 140);
  const developer = meta.originalDeveloper ? clip(meta.originalDeveloper, 120) : null;
  const notes = [
    `Lien externe uniquement, référencé depuis ${SOURCE_NAME}${pageUrl ? ` (${pageUrl})` : ''}.`,
    'Aucun fichier ni visuel du jeu n’est hébergé par Euloge Arcade.',
    meta.portAuthor ? `Portage navigateur : ${meta.portAuthor}.` : null,
    longStr(raw.license_notes) ? `Notes de la source : ${longStr(raw.license_notes)}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const fields: ImportedFields | null =
    title && launchUrl
      ? {
          title,
          tagline,
          description: clip(description, 4000),
          genre: genres,
          launch_url: launchUrl,
          source_url: sourceUrl,
          developer,
          license_notes: clip(notes, 2000),
          compatibility: {
            keyboard: bool(controls.keyboard) ?? false,
            mouse: bool(controls.mouse) ?? false,
            gamepad: bool(controls.gamepad) ?? false,
            touch: bool(controls.touch) ?? false,
            // Declared by the source, not tested by us: the UI hides unverified flags.
            verified: false,
          },
        }
      : null;

  return {index, sourceId, fields, meta, issues};
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function linkStatusOf(link: LinkResult | null): LinkStatus | null {
  if (!link) return null;
  if (link.status === 'ok') return 'ok';
  if (link.status === 'broken') return 'broken';
  return 'unchecked';
}

function linkIssues(link: LinkResult | null): Issue[] {
  if (!link) return [];
  switch (link.status) {
    case 'blocked':
      return [{level: 'review', code: 'link_blocked', message: `Le site refuse les vérifications automatiques (${link.detail ?? link.httpStatus}). À tester à la main.`}];
    case 'redirect_offsite':
      return [{level: 'review', code: 'link_redirect', message: `Redirige vers un autre domaine : ${link.finalUrl ?? '?'}.`}];
    case 'error':
      return [{level: 'review', code: 'link_error', message: `Vérification impossible : ${link.detail ?? 'erreur réseau'}.`}];
    case 'broken':
      return [{level: 'review', code: 'link_broken', message: `Lien cassé (${link.detail ?? link.httpStatus}).`}];
    default:
      return [];
  }
}

function uniqueSlug(base: string, sourceId: string, taken: Set<string>): string {
  let slug = base || `jeu-${hash128(sourceId).slice(0, 8)}`;
  if (taken.has(slug)) slug = `${slug.slice(0, 55)}-p2b`.replace(/--+/g, '-');
  let n = 2;
  while (taken.has(slug)) slug = `${base.slice(0, 54)}-p2b-${n++}`;
  taken.add(slug);
  return slug;
}

const INSTRUCTIONS =
  'Le jeu s’ouvre dans un nouvel onglet, sur le site du portage. Consulte les indications du site avant de lancer une partie.';

export function planImport(
  raw: RawEntry[],
  catalog: GameRow[],
  manifest: Manifest,
  links: Map<string, LinkResult>,
  opts: PlanOptions,
): Plan {
  const items: PlanItem[] = [];
  const byId = new Map(catalog.map((g) => [g.id, g]));
  const trackedIds = new Set(Object.values(manifest.entries).map((e) => e.gameId));
  const catalogByUrl = new Map(catalog.filter((g) => !trackedIds.has(g.id)).map((g) => [urlKey(g.launch_url), g]));
  const takenSlugs = new Set(catalog.map((g) => g.slug));
  const takenIds = new Set(catalog.map((g) => g.id));
  const seenIds = new Map<string, number>();
  const seenUrls = new Map<string, string>();
  const seenSources = new Set<string>();

  raw.forEach((entry, index) => {
    const c = normalizeEntry(entry, index);
    const errors = c.issues.filter((i) => i.level === 'error');
    if (errors.length || !c.fields || !c.sourceId) {
      items.push({action: 'rejected', sourceId: c.sourceId, index, title: str(entry.title), issues: c.issues});
      return;
    }
    const sourceId = c.sourceId;
    const fields = c.fields;

    if (seenIds.has(sourceId)) {
      items.push({action: 'duplicate', sourceId, index, of: sourceId, reason: 'Identifiant déjà vu dans l’export'});
      return;
    }
    const key = urlKey(fields.launch_url);
    const firstWithUrl = seenUrls.get(key);
    if (firstWithUrl) {
      items.push({action: 'duplicate', sourceId, index, of: firstWithUrl, reason: 'Même URL de lancement qu’une autre fiche'});
      return;
    }
    seenIds.set(sourceId, index);
    seenUrls.set(key, sourceId);
    seenSources.add(sourceId);

    const link = links.get(fields.launch_url) ?? null;
    const issues = [...c.issues, ...linkIssues(link)];
    const linkStatus = linkStatusOf(link);
    const clean = issues.length === 0 && linkStatus === 'ok';
    const tracked = manifest.entries[sourceId];
    const existing = tracked ? byId.get(tracked.gameId) : undefined;

    if (!existing) {
      const other = catalogByUrl.get(key);
      if (other) {
        items.push({action: 'already_in_catalog', sourceId, slug: other.slug});
        return;
      }
      let id = tracked?.gameId ?? sourceUuid(sourceId);
      while (takenIds.has(id)) id = sourceUuid(`${sourceId}#${id}`);
      takenIds.add(id);
      const status: GameStatus = opts.publish === 'verified' && clean ? 'published' : 'draft';
      const after: GameRow = {
        id,
        slug: uniqueSlug(slugify(fields.title), sourceId, takenSlugs),
        ...fields,
        instructions: INSTRUCTIONS,
        cover_url: null,
        banner_url: null,
        launch_mode: 'external',
        license_status: 'link_only',
        controls: [],
        orientation: 'any',
        featured: false,
        featured_rank: null,
        supports_scores: false,
        status,
        published_at: status === 'published' ? opts.now : null,
        link_status: linkStatus ?? 'unchecked',
        link_checked_at: link ? link.checkedAt : null,
        created_at: opts.now,
        updated_at: opts.now,
      };
      const invalid = schemaIssues(after);
      if (invalid.length) {
        items.push({action: 'rejected', sourceId, index, title: fields.title, issues: [...issues, ...invalid]});
        takenSlugs.delete(after.slug);
        return;
      }
      items.push({action: 'create', sourceId, after, fields, meta: c.meta, issues, link});
      return;
    }

    // Existing game: three-way merge of importer-owned fields.
    const after: GameRow = {...existing};
    const changes: Record<string, Change> = {};
    const keptManualEdits: string[] = [];
    for (const k of IMPORTED_KEYS) {
      const current = existing[k];
      const next = fields[k];
      if (same(current, next)) continue;
      if (same(current, tracked.fields[k])) {
        changes[k] = {from: current, to: next};
        (after as unknown as Record<string, unknown>)[k] = next;
      } else {
        keptManualEdits.push(k);
      }
    }
    if (link && linkStatus && (existing.link_status !== linkStatus || existing.link_checked_at !== link.checkedAt)) {
      if (existing.link_status !== linkStatus) changes.link_status = {from: existing.link_status, to: linkStatus};
      after.link_status = linkStatus;
      after.link_checked_at = link.checkedAt;
    }
    // Only promotes importer drafts; never re-publishes a game an admin unpublished.
    if (opts.publish === 'verified' && clean && existing.status === 'draft') {
      changes.status = {from: 'draft', to: 'published'};
      after.status = 'published';
      after.published_at = opts.now;
    }
    const invalid = schemaIssues(after);
    if (invalid.length) {
      items.push({action: 'rejected', sourceId, index, title: fields.title, issues: [...issues, ...invalid]});
      return;
    }
    if (Object.keys(changes).length) {
      after.updated_at = opts.now;
      items.push({action: 'update', sourceId, after, changes, keptManualEdits, fields, meta: c.meta, issues, link});
    } else {
      items.push({action: 'unchanged', sourceId, after: existing, fields, meta: c.meta, issues, link});
    }
  });

  for (const [sourceId, entry] of Object.entries(manifest.entries)) {
    if (seenSources.has(sourceId)) continue;
    const row = byId.get(entry.gameId) ?? null;
    const unpublish = opts.unpublishMissing && row?.status === 'published';
    items.push({
      action: 'missing',
      sourceId,
      slug: entry.slug,
      after: row && unpublish ? {...row, status: 'unpublished', updated_at: opts.now} : row,
      unpublish,
    });
  }

  return {generatedAt: opts.now, rawCount: raw.length, linksChecked: links.size > 0, items};
}

function schemaIssues(row: GameRow): Issue[] {
  const r = gameInputSchema.safeParse(row);
  return r.success
    ? []
    : r.error.issues.map((i) => ({level: 'error' as const, code: 'schema', message: `${i.path.join('.')} : ${i.message}`}));
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

export function applyPlan(
  catalog: GameRow[],
  manifest: Manifest,
  plan: Plan,
): {catalog: GameRow[]; manifest: Manifest; history: HistoryEvent[]} {
  const now = plan.generatedAt;
  const rows = new Map(catalog.map((g) => [g.id, g]));
  const order = catalog.map((g) => g.id);
  const entries = {...manifest.entries};
  const history: HistoryEvent[] = [];

  for (const item of plan.items) {
    if (item.action === 'create' || item.action === 'update' || item.action === 'unchanged') {
      const {after, sourceId} = item;
      if (!rows.has(after.id)) order.push(after.id);
      rows.set(after.id, after);
      const prev = entries[sourceId];
      // Keep the previous baseline for fields whose manual edit was preserved.
      const fields = {...item.fields};
      if (item.action === 'update' && prev) {
        for (const k of item.keptManualEdits) (fields as Record<string, unknown>)[k] = prev.fields[k as keyof ImportedFields];
      }
      entries[sourceId] = {
        gameId: after.id,
        slug: after.slug,
        firstSeenAt: prev?.firstSeenAt ?? now,
        lastSeenAt: now,
        missingSince: null,
        fields,
        meta: item.meta,
      };
      if (item.action === 'create') history.push({at: now, action: 'create', sourceId, gameId: after.id, slug: after.slug});
      if (item.action === 'update') history.push({at: now, action: 'update', sourceId, gameId: after.id, slug: after.slug, changes: item.changes});
    } else if (item.action === 'missing') {
      const prev = entries[item.sourceId];
      if (prev) entries[item.sourceId] = {...prev, missingSince: prev.missingSince ?? now};
      if (item.unpublish && item.after) {
        rows.set(item.after.id, item.after);
        history.push({at: now, action: 'unpublish', sourceId: item.sourceId, gameId: item.after.id, slug: item.slug});
      }
    }
  }

  return {catalog: order.map((id) => rows.get(id)!), manifest: {...manifest, entries}, history};
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface ReportCounts {
  discovered: number;
  imported: number;
  created: number;
  updated: number;
  unchanged: number;
  duplicates: number;
  alreadyInCatalog: number;
  rejected: number;
  missingFromSource: number;
  linkOk: number;
  linkBroken: number;
  linkUnverified: number;
  needsReview: number;
  iframeCandidates: number;
  iframeAuthorized: number;
  hostable: number;
  publishedExternal: number;
  drafts: number;
  playableInArcade: number;
}

export function reportCounts(plan: Plan): ReportCounts {
  const kept = plan.items.filter(
    (i): i is Extract<PlanItem, {action: 'create' | 'update' | 'unchanged'}> =>
      i.action === 'create' || i.action === 'update' || i.action === 'unchanged',
  );
  const count = (a: PlanItem['action']) => plan.items.filter((i) => i.action === a).length;
  return {
    discovered: plan.rawCount,
    imported: kept.length,
    created: count('create'),
    updated: count('update'),
    unchanged: count('unchanged'),
    duplicates: count('duplicate'),
    alreadyInCatalog: count('already_in_catalog'),
    rejected: count('rejected'),
    missingFromSource: count('missing'),
    linkOk: kept.filter((i) => i.after.link_status === 'ok').length,
    linkBroken: kept.filter((i) => i.after.link_status === 'broken').length,
    linkUnverified: kept.filter((i) => i.after.link_status === 'unchecked').length,
    needsReview: kept.filter((i) => i.issues.length > 0).length + count('rejected'),
    iframeCandidates: kept.filter((i) => i.meta.embeddableClaimed === true && i.link?.frameable === true).length,
    // Embedding and hosting always need an explicit, recorded permission: never automatic.
    iframeAuthorized: 0,
    hostable: 0,
    publishedExternal: kept.filter((i) => i.after.status === 'published' && i.after.link_status === 'ok').length,
    drafts: kept.filter((i) => i.after.status === 'draft').length,
    playableInArcade: 0,
  };
}

export function renderReport(plan: Plan, opts: {applied: boolean; input: string}): string {
  const c = reportCounts(plan);
  const line = (label: string, n: number) => `| ${label} | ${n} |`;
  const out: string[] = [
    `# Import ${SOURCE_NAME} — ${plan.generatedAt}`,
    '',
    `- Fichier source : \`${opts.input}\``,
    `- Mode : ${opts.applied ? '**écriture appliquée**' : '**simulation** (aucune écriture dans le catalogue)'}`,
    `- Liens vérifiés : ${plan.linksChecked ? 'oui' : 'non (relancer avec --check-links)'}`,
    '',
    '## Bilan',
    '',
    '| Indicateur | Nombre |',
    '| --- | ---: |',
    line('Fiches découvertes dans l’export', c.discovered),
    line('Fiches importées (créées + mises à jour + inchangées)', c.imported),
    line('— nouvelles', c.created),
    line('— mises à jour', c.updated),
    line('— inchangées', c.unchanged),
    line('Doublons dans l’export', c.duplicates),
    line('Déjà présentes dans le catalogue (même lien)', c.alreadyInCatalog),
    line('Rejetées (données insuffisantes ou URL refusée)', c.rejected),
    line('Disparues de la source depuis le dernier import', c.missingFromSource),
    line('Liens fonctionnels', c.linkOk),
    line('Liens cassés', c.linkBroken),
    line('Liens non vérifiés ou bloqués', c.linkUnverified),
    line('Fiches nécessitant une vérification humaine', c.needsReview),
    line('Candidates à l’intégration iframe (autorisation à obtenir)', c.iframeCandidates),
    line('Intégrables en iframe avec autorisation enregistrée', c.iframeAuthorized),
    line('Hébergeables légalement', c.hostable),
    line('Publiées et accessibles via lien externe', c.publishedExternal),
    line('En brouillon (non visibles)', c.drafts),
    line('Jouables directement dans Euloge Arcade', c.playableInArcade),
    '',
    '> Les jeux importés sont **référencés** : ils s’ouvrent sur le site du portage. Aucun n’est **jouable directement** dans Euloge Arcade tant que son auteur n’a pas autorisé l’intégration (iframe) ou la redistribution (hébergement).',
    '',
  ];

  const section = (title: string, rows: string[]) => {
    if (!rows.length) return;
    out.push(`## ${title}`, '', ...rows, '');
  };
  const fmtIssues = (issues: Issue[]) => issues.map((i) => `${i.level === 'error' ? '⛔' : '⚠️'} ${i.message}`).join(' ');

  section(
    'Rejetées',
    plan.items.flatMap((i) => (i.action === 'rejected' ? [`- #${i.index} ${i.title ?? '(sans titre)'} \`${i.sourceId ?? '-'}\` : ${fmtIssues(i.issues)}`] : [])),
  );
  section(
    'À vérifier',
    plan.items.flatMap((i) =>
      (i.action === 'create' || i.action === 'update' || i.action === 'unchanged') && i.issues.length
        ? [`- **${i.after.title}** (\`${i.after.slug}\`) : ${fmtIssues(i.issues)}`]
        : [],
    ),
  );
  section(
    'Modifications manuelles conservées',
    plan.items.flatMap((i) => (i.action === 'update' && i.keptManualEdits.length ? [`- ${i.after.slug} : ${i.keptManualEdits.join(', ')}`] : [])),
  );
  section(
    'Mises à jour',
    plan.items.flatMap((i) => (i.action === 'update' ? [`- ${i.after.slug} : ${Object.keys(i.changes).join(', ')}`] : [])),
  );
  section(
    'Doublons',
    plan.items.flatMap((i) => (i.action === 'duplicate' ? [`- #${i.index} \`${i.sourceId ?? '-'}\` → ${i.reason} (\`${i.of}\`)`] : [])),
  );
  section(
    'Déjà au catalogue',
    plan.items.flatMap((i) => (i.action === 'already_in_catalog' ? [`- \`${i.sourceId}\` → ${i.slug}`] : [])),
  );
  section(
    'Disparues de la source',
    plan.items.flatMap((i) => (i.action === 'missing' ? [`- ${i.slug} (\`${i.sourceId}\`)${i.unpublish ? ' → retirée du catalogue' : ''}`] : [])),
  );
  return out.join('\n');
}
