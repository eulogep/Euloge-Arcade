// Imports a Ported2Browser catalog export into the bootstrap catalog (src/data/games.seed.json).
//
//   npm run import:p2b -- --input export.json                  # simulation: report only, nothing written
//   npm run import:p2b -- --input export.json --check-links    # + checks every launch URL (resumable)
//   npm run import:p2b -- --input export.json --check-links --apply [--publish-verified] [--unpublish-missing]
//
// The source site blocks automated access (Cloudflare): this script only reads an export provided by
// its owner and never tries to get around that protection. Link checks that hit a bot protection are
// recorded as "blocked" (to test by hand), never as broken.
import {execFileSync} from 'node:child_process';
import {appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  applyPlan,
  emptyManifest,
  normalizeEntry,
  parseExport,
  planImport,
  renderReport,
  reportCounts,
  type LinkResult,
  type Manifest,
} from '../src/lib/importer/ported2browser';
import type {GameRow} from '../src/types/game';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = resolve(root, 'imports/ported2browser');
const CATALOG = resolve(root, 'src/data/games.seed.json');
const MANIFEST = resolve(DIR, 'manifest.json');
const HISTORY = resolve(DIR, 'history.jsonl');
const LINK_CACHE = resolve(DIR, 'link-cache.json');
const USER_AGENT = 'EulogeArcadeLinkCheck/1.0 (+https://euloge-arcade.pages.dev)';

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2).filter((a) => a !== '--');
const flag = (name: string) => argv.includes(`--${name}`);
const option = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const input = option('input');
if (!input || flag('help')) {
  console.log(`Usage : npm run import:p2b -- --input <export.json> [options]

  --check-links          Vérifie chaque URL de lancement (reprise automatique via link-cache.json)
  --concurrency <n>      Vérifications en parallèle (défaut 4)
  --max-age-hours <h>    Réutilise les vérifications plus récentes que h heures (défaut 24)
  --apply                Écrit le catalogue, le manifeste et l'historique (sinon : simulation)
  --publish-verified     Publie les fiches sans anomalie dont le lien répond
  --unpublish-missing    Retire les jeux publiés absents de l'export (export complet uniquement)`);
  process.exit(input ? 0 : 1);
}

const readJson = <T>(path: string, fallback: T): T => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback);
const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

// ---------------------------------------------------------------------------
// Link checking (network)
// ---------------------------------------------------------------------------
const hostOf = (u: string) => new URL(u).hostname.toLowerCase().replace(/^www\./, '');

async function checkLink(url: string): Promise<LinkResult> {
  const checkedAt = new Date().toISOString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {redirect: 'follow', signal: ctrl.signal, headers: {'user-agent': USER_AGENT, accept: 'text/html,*/*'}});
    const finalUrl = res.url || url;
    const server = res.headers.get('server') ?? '';
    const head = res.ok ? (await res.text()).slice(0, 8192) : '';
    // Bot protection: we stop here and leave it to a human.
    if (res.headers.get('cf-mitigated') === 'challenge' || ([403, 429, 503].includes(res.status) && /cloudflare|ddos|akamai/i.test(server))) {
      return {status: 'blocked', httpStatus: res.status, finalUrl, frameable: null, detail: `protection ${server || 'anti-bot'}`, checkedAt};
    }
    if ([404, 410].includes(res.status)) return {status: 'broken', httpStatus: res.status, finalUrl, frameable: null, detail: `HTTP ${res.status}`, checkedAt};
    if (!res.ok) return {status: 'error', httpStatus: res.status, finalUrl, frameable: null, detail: `HTTP ${res.status}`, checkedAt};

    // Same-host redirects are fine; another domain (parking, shortener, ad redirect) needs a human.
    const refresh = head.match(/http-equiv=["']?refresh["']?[^>]*url=([^"'>\s]+)/i)?.[1] ?? head.match(/location\.replace\(["']([^"']+)/)?.[1];
    for (const target of [finalUrl, refresh]) {
      if (!target) continue;
      try {
        const abs = new URL(target, url).href;
        if (hostOf(abs) !== hostOf(url)) return {status: 'redirect_offsite', httpStatus: res.status, finalUrl: abs, frameable: null, detail: null, checkedAt};
      } catch {
        /* ignore malformed refresh targets */
      }
    }

    const xfo = (res.headers.get('x-frame-options') ?? '').toLowerCase();
    const ancestors = (res.headers.get('content-security-policy') ?? '').match(/frame-ancestors([^;]*)/i)?.[1].trim() ?? null;
    const frameable = xfo.includes('deny') || xfo.includes('sameorigin') ? false : ancestors === null ? true : /(^|\s)(\*|https:)(\s|$)/.test(ancestors);
    return {status: 'ok', httpStatus: res.status, finalUrl, frameable, detail: null, checkedAt};
  } catch (e) {
    const cause = (e as {cause?: {code?: string}}).cause?.code;
    if (cause === 'ENOTFOUND') return {status: 'broken', httpStatus: null, finalUrl: null, frameable: null, detail: 'domaine introuvable', checkedAt};
    // Visitors would get a browser security warning: as good as broken.
    if (cause && /CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(cause)) {
      return {status: 'broken', httpStatus: null, finalUrl: null, frameable: null, detail: `certificat HTTPS invalide (${cause})`, checkedAt};
    }
    const detail = (e as Error).name === 'AbortError' ? 'délai dépassé' : cause ?? (e as Error).message;
    return {status: 'error', httpStatus: null, finalUrl: null, frameable: null, detail, checkedAt};
  } finally {
    clearTimeout(timer);
  }
}

async function checkLinks(urls: string[]): Promise<Map<string, LinkResult>> {
  const cache = readJson<Record<string, LinkResult>>(LINK_CACHE, {});
  const maxAge = Number(option('max-age-hours', '24')) * 3600_000;
  const fresh = (r?: LinkResult) => r && Date.now() - Date.parse(r.checkedAt) < maxAge;
  const todo = urls.filter((u) => !fresh(cache[u]));
  console.log(`Liens : ${urls.length} au total, ${urls.length - todo.length} déjà vérifiés récemment, ${todo.length} à vérifier.`);

  // Saved after every result, so an interrupted run resumes where it stopped.
  let done = 0;
  const save = () => writeJson(LINK_CACHE, cache);
  process.once('SIGINT', () => {
    save();
    console.log(`\nInterrompu après ${done}/${todo.length} vérifications : relance la même commande pour reprendre.`);
    process.exit(130);
  });
  const queue = [...todo];
  const workers = Array.from({length: Math.max(1, Number(option('concurrency', '4')))}, async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      cache[url] = await checkLink(url);
      done++;
      save();
      process.stdout.write(`\r  ${done}/${todo.length} ${cache[url].status.padEnd(16)}`);
    }
  });
  await Promise.all(workers);
  if (todo.length) process.stdout.write('\n');
  return new Map(urls.map((u) => [u, cache[u]]));
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const stamp = new Date().toISOString();
const fileStamp = stamp.replace(/[:.]/g, '-');
const inputPath = resolve(process.cwd(), input);
const raw = parseExport(JSON.parse(readFileSync(inputPath, 'utf8')));
writeJson(resolve(DIR, `raw/${fileStamp}.json`), raw); // untouched snapshot of what was imported

const catalog = readJson<GameRow[]>(CATALOG, []);
const manifest = readJson<Manifest>(MANIFEST, emptyManifest());

let links = new Map<string, LinkResult>();
if (flag('check-links')) {
  // Only URLs that passed validation are contacted: refused ones (shorteners, http, IPs) never are.
  const urls = [
    ...new Set(
      raw
        .map((r, i) => normalizeEntry(r, i))
        .filter((c) => c.fields && !c.issues.some((i) => i.level === 'error'))
        .map((c) => c.fields!.launch_url),
    ),
  ];
  links = await checkLinks(urls);
}

const apply = flag('apply');
const plan = planImport(raw, catalog, manifest, links, {
  now: stamp,
  publish: flag('publish-verified') ? 'verified' : 'none',
  unpublishMissing: flag('unpublish-missing'),
});
const report = renderReport(plan, {applied: apply, input: relative(root, inputPath)});
writeJson(resolve(DIR, `reports/${fileStamp}.json`), {counts: reportCounts(plan), plan});
writeFileSync(resolve(DIR, `reports/${fileStamp}.md`), `${report}\n`);

if (apply) {
  const result = applyPlan(catalog, manifest, plan);
  // Imported games get an original cover once `npm run brand:assets` has rendered one.
  for (const g of result.catalog) {
    if (!g.cover_url && existsSync(resolve(root, `public/covers/${g.slug}.jpg`))) {
      g.cover_url = `/covers/${g.slug}.jpg`;
      g.banner_url = existsSync(resolve(root, `public/covers/${g.slug}-banner.jpg`)) ? `/covers/${g.slug}-banner.jpg` : null;
    }
  }
  writeJson(CATALOG, result.catalog);
  writeJson(MANIFEST, result.manifest);
  for (const event of result.history) appendFileSync(HISTORY, `${JSON.stringify(event)}\n`);
  execFileSync(process.execPath, [resolve(root, 'scripts/generate-seed.mjs')], {stdio: 'inherit'});
}

const c = reportCounts(plan);
console.log(`
${apply ? 'Import appliqué.' : 'Simulation : rien n’a été écrit dans le catalogue.'}
  découvertes ${c.discovered} · importées ${c.imported} (nouvelles ${c.created}, mises à jour ${c.updated}, inchangées ${c.unchanged})
  doublons ${c.duplicates} · déjà au catalogue ${c.alreadyInCatalog} · rejetées ${c.rejected} · à vérifier ${c.needsReview}
  liens OK ${c.linkOk} · cassés ${c.linkBroken} · non vérifiés ${c.linkUnverified}
  publiées (lien externe) ${c.publishedExternal} · brouillons ${c.drafts} · jouables dans Euloge Arcade ${c.playableInArcade}
Rapport : ${relative(root, resolve(DIR, `reports/${fileStamp}.md`))}`);
