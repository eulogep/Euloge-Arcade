import gamesSeed from '@/data/games.seed.json';
import {
  applyPlan,
  emptyManifest,
  mapGenres,
  parseExport,
  planImport,
  renderReport,
  reportCounts,
  slugify,
  sourceUuid,
  urlKey,
  urlProblem,
  type LinkResult,
  type PlanOptions,
} from '@/lib/importer/ported2browser';
import type {GameRow} from '@/types/game';
import sample from './sample-export.json';

const catalog = gamesSeed as GameRow[];
const raw = parseExport(sample);
const NOW = '2026-10-19T00:00:00Z';
const LATER = '2026-11-01T00:00:00Z';
const opts: PlanOptions = {now: NOW, publish: 'none', unpublishMissing: false};
const ok = (frameable: boolean | null = null): LinkResult => ({
  status: 'ok',
  httpStatus: 200,
  finalUrl: null,
  frameable,
  detail: null,
  checkedAt: NOW,
});

const bySource = (plan: ReturnType<typeof planImport>, id: string) =>
  plan.items.find((i) => 'sourceId' in i && i.sourceId === id && i.action !== 'duplicate')!;

describe('normalization helpers', () => {
  it('maps known genres and keeps the others aside', () => {
    expect(mapGenres(['Shooter', 'RPG', 'retro'])).toEqual({genres: ['fps', 'retro'], unmapped: ['RPG']});
    expect(mapGenres('Racing, Simulation')).toEqual({genres: ['racing'], unmapped: ['Simulation']});
  });

  it('refuses unsafe URLs', () => {
    expect(urlProblem('https://example.com/game')).toBeNull();
    expect(urlProblem('http://example.com/')).toMatch(/https/);
    expect(urlProblem('javascript:alert(1)')).toMatch(/https/);
    expect(urlProblem('https://user:pw@example.com/')).toMatch(/identifiants/);
    expect(urlProblem('https://192.168.1.10/')).toMatch(/IP/);
    expect(urlProblem('https://bit.ly/x')).toMatch(/Raccourcisseur/);
    expect(urlProblem('https://lkgp.pro/0aff63bc')).toMatch(/Raccourcisseur/);
  });

  it('builds stable slugs, url keys and ids', () => {
    expect(slugify('Half-Life: Opposing Force (Éd. Web)')).toBe('half-life-opposing-force-ed-web');
    expect(urlKey('https://www.Example.com/game/index.html')).toBe(urlKey('https://example.com/game'));
    expect(sourceUuid('p2b-001')).toBe(sourceUuid('p2b-001'));
    expect(sourceUuid('p2b-001')).not.toBe(sourceUuid('p2b-002'));
    expect(sourceUuid('p2b-001')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('accepts a wrapped export and rejects anything else', () => {
    expect(parseExport({games: [{id: 1}]})).toHaveLength(1);
    expect(() => parseExport({nope: true})).toThrow(/tableau/);
  });
});

describe('planImport (dry run)', () => {
  const plan = planImport(raw, catalog, emptyManifest(), new Map(), opts);
  const counts = reportCounts(plan);

  it('accounts for every entry of the export', () => {
    expect(counts.discovered).toBe(9);
    expect(counts.created + counts.duplicates + counts.rejected + counts.alreadyInCatalog).toBe(9);
    expect(counts.created).toBe(3);
    expect(counts.duplicates).toBe(2);
    expect(counts.rejected).toBe(4);
  });

  it('creates external, link-only drafts and never invents a genre', () => {
    const quest = bySource(plan, 'p2b-001');
    expect(quest.action).toBe('create');
    if (quest.action !== 'create') return;
    expect(quest.after).toMatchObject({
      slug: 'exemple-quest',
      launch_mode: 'external',
      license_status: 'link_only',
      status: 'draft',
      genre: ['platformer', 'retro'],
      cover_url: null,
      link_status: 'unchecked',
      developer: 'Studio Exemple',
      tagline: 'Portage navigateur · DOS · 1994',
    });
    expect(quest.after.compatibility).toEqual({keyboard: true, mouse: false, gamepad: true, touch: false, verified: false});
    expect(quest.after.license_notes).toMatch(/Porteur Exemple/);

    const rpg = bySource(plan, 'p2b-003');
    expect(rpg.action).toBe('rejected');
  });

  it('flags generated descriptions and page-only links for review', () => {
    const racer = bySource(plan, 'p2b-002');
    expect(racer.action === 'create' && racer.issues.map((i) => i.code)).toEqual(['unmapped_genres', 'generated_description']);
    const pageOnly = bySource(plan, 'p2b-007');
    expect(pageOnly.action === 'create' && pageOnly.after.launch_url).toBe('https://ported2browser.example/games/fiche-sans-lien');
  });

  it('rejects shorteners and plain http', () => {
    expect(bySource(plan, 'p2b-004').action).toBe('rejected');
    expect(bySource(plan, 'p2b-005').action).toBe('rejected');
  });

  it('skips entries already in the catalog under another source', () => {
    const p = planImport(
      [{id: 'q1', title: 'QuakeWorld', description: 'Déjà référencé par ailleurs.', genres: ['FPS'], play_url: 'https://q1.pieter.com'}],
      catalog,
      emptyManifest(),
      new Map(),
      opts,
    );
    expect(p.items[0]).toMatchObject({action: 'already_in_catalog', slug: 'quakeworld'});
  });

  it('writes a report that separates referenced and playable games', () => {
    const md = renderReport(plan, {applied: false, input: 'sample-export.json'});
    expect(md).toMatch(/\*\*simulation\*\*/);
    expect(md).toMatch(/Jouables directement dans Euloge Arcade \| 0/);
    expect(md).toMatch(/Raccourcisseur/);
  });
});

describe('publication and link checks', () => {
  it('publishes only clean entries whose link answered OK', () => {
    const links = new Map([
      ['https://play.example.com/exemple-quest/', ok(true)],
      ['https://racer.example.org/play', ok()],
    ]);
    const plan = planImport(raw, catalog, emptyManifest(), links, {...opts, publish: 'verified'});
    const quest = bySource(plan, 'p2b-001');
    const racer = bySource(plan, 'p2b-002');
    expect(quest.action === 'create' && quest.after.status).toBe('published');
    expect(racer.action === 'create' && racer.after.status).toBe('draft'); // generated description
    const c = reportCounts(plan);
    expect(c.iframeCandidates).toBe(1);
    expect(c.iframeAuthorized).toBe(0);
    expect(c.publishedExternal).toBe(1);
  });

  it('keeps a blocked link unverified instead of calling it broken', () => {
    const blocked: LinkResult = {...ok(), status: 'blocked', httpStatus: 403, detail: 'Cloudflare'};
    const plan = planImport(raw, catalog, emptyManifest(), new Map([['https://play.example.com/exemple-quest/', blocked]]), {
      ...opts,
      publish: 'verified',
    });
    const quest = bySource(plan, 'p2b-001');
    expect(quest.action === 'create' && quest.after).toMatchObject({link_status: 'unchecked', status: 'draft'});
  });
});

describe('re-import', () => {
  const first = planImport(raw, catalog, emptyManifest(), new Map(), opts);
  const applied = applyPlan(catalog, emptyManifest(), first);

  it('appends new games without touching existing ones', () => {
    expect(applied.catalog).toHaveLength(catalog.length + 3);
    expect(applied.catalog.slice(0, catalog.length)).toEqual(catalog);
    expect(Object.keys(applied.manifest.entries).sort()).toEqual(['p2b-001', 'p2b-002', 'p2b-007']);
    expect(applied.history.map((h) => h.action)).toEqual(['create', 'create', 'create']);
  });

  it('is idempotent', () => {
    const again = planImport(raw, applied.catalog, applied.manifest, new Map(), {...opts, now: LATER});
    expect(reportCounts(again)).toMatchObject({created: 0, updated: 0, unchanged: 3});
  });

  it('updates source changes but keeps manual edits', () => {
    const quest = applied.catalog.find((g) => g.slug === 'exemple-quest')!;
    const edited = applied.catalog.map((g) => (g.id === quest.id ? {...g, description: 'Texte réécrit à la main.'} : g));
    const changedRaw = raw.map((r) =>
      r.id === 'p2b-001' && r.title === 'Exemple Quest'
        ? {...r, description: 'Nouvelle description de la source.', original_developer: 'Studio Renommé'}
        : r,
    );
    const plan = planImport(changedRaw, edited, applied.manifest, new Map(), {...opts, now: LATER});
    const item = bySource(plan, 'p2b-001');
    expect(item.action).toBe('update');
    if (item.action !== 'update') return;
    expect(Object.keys(item.changes)).toEqual(['developer']);
    expect(item.keptManualEdits).toEqual(['description']);
    expect(item.after.description).toBe('Texte réécrit à la main.');
    expect(item.after.developer).toBe('Studio Renommé');
  });

  it('marks a broken link and reports games that left the source', () => {
    const broken: LinkResult = {...ok(), status: 'broken', httpStatus: 404, detail: 'HTTP 404', checkedAt: LATER};
    const withoutRacer = raw.filter((r) => r.id !== 'p2b-002');
    const plan = planImport(withoutRacer, applied.catalog, applied.manifest, new Map([['https://play.example.com/exemple-quest/', broken]]), {
      ...opts,
      now: LATER,
      unpublishMissing: true,
    });
    const quest = bySource(plan, 'p2b-001');
    expect(quest.action === 'update' && quest.changes.link_status).toEqual({from: 'unchecked', to: 'broken'});
    const missing = plan.items.find((i) => i.action === 'missing');
    // Drafts are not "unpublished": only published games are withdrawn.
    expect(missing).toMatchObject({action: 'missing', sourceId: 'p2b-002', unpublish: false});
    const after = applyPlan(applied.catalog, applied.manifest, plan);
    expect(after.manifest.entries['p2b-002'].missingSince).toBe(LATER);
  });
});
