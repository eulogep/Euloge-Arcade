/** Pure parser for owner-authorized, browser-saved Ported2Browser catalog pages. */

export interface CatalogSnapshot {
  source: string;
  html: string;
}

export interface DiscoveredPort {
  sourceId: string;
  title: string;
  portAuthor: string | null;
  pageUrl: string;
  coverUrl: string | null;
  sourcePage: number | null;
  tags: string[];
  broken: boolean;
  alert: string | null;
}

export interface DiscoveryResult {
  declaredTotal: number | null;
  entries: DiscoveredPort[];
  duplicateIds: string[];
  pagesSeen: number[];
  complete: boolean;
}

const decodeEntities = (value: string) =>
  value
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const text = (html: string) => decodeEntities(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
const attr = (html: string, name: string) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`\\b${escaped}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? decodeEntities(match[1] ?? match[2] ?? '') : null;
};

/**
 * Parses only metadata visibly present on catalogue cards. It deliberately does
 * not infer descriptions, genres, controls or launch URLs from titles/tags.
 */
export function parseCatalogSnapshots(snapshots: CatalogSnapshot[]): DiscoveryResult {
  const entries = new Map<string, DiscoveredPort>();
  const duplicates = new Set<string>();
  const pages = new Set<number>();
  let declaredTotal: number | null = null;

  for (const snapshot of snapshots) {
    const totalMatch = snapshot.html.match(/data-total="(\d+)"|>\s*(\d+)\s+ports\s*</i);
    const foundTotal = Number(totalMatch?.[1] ?? totalMatch?.[2]);
    if (Number.isInteger(foundTotal) && foundTotal > 0) declaredTotal = Math.max(declaredTotal ?? 0, foundTotal);

    const pageMatches = [...snapshot.html.matchAll(/<span>\s*Page\s+(\d+)\s*<\/span>/gi)];
    const sourcePage = pageMatches.length ? Number(pageMatches.at(-1)?.[1]) : null;
    if (sourcePage) pages.add(sourcePage);

    for (const match of snapshot.html.matchAll(/<article\s+class="card([^"]*)"\s+data-port-id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/gi)) {
      const [, classNames, rawId, body] = match;
      const sourceId = decodeEntities(rawId).trim();
      const href = body.match(/<a\s+[^>]*href="([^"]*\/ports\/[^"]+)"/i)?.[1];
      const heading = body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1];
      if (!sourceId || !href || !heading) continue;

      const tags = [...body.matchAll(/<b\s+class="([^"]*-tag)"[^>]*>([\s\S]*?)<\/b>/gi)].map((m) => text(m[2]));
      const paragraphs = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => text(m[1])).filter(Boolean);
      const image = body.match(/<img\s+[^>]*>/i)?.[0] ?? '';
      const alertNode = body.match(/<(?:b|span)\s+[^>]*class="[^"]*alert-badge[^"]*"[^>]*>/i)?.[0] ?? '';
      const alert = attr(alertNode, 'title') ?? attr(alertNode, 'aria-label');
      const item: DiscoveredPort = {
        sourceId,
        title: text(heading),
        portAuthor: paragraphs.at(-1) ?? null,
        pageUrl: decodeEntities(href),
        coverUrl: attr(image, 'src'),
        sourcePage,
        tags,
        broken: /(?:^|\s)is-broken(?:\s|$)/i.test(classNames) || /link broken/i.test(alert ?? ''),
        alert,
      };

      const previous = entries.get(sourceId);
      if (previous) {
        duplicates.add(sourceId);
        // Prefer the card from its actual pagination page over preload templates.
        if (previous.sourcePage === null && item.sourcePage !== null) entries.set(sourceId, item);
      } else {
        entries.set(sourceId, item);
      }
    }
  }

  const sorted = [...entries.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  return {
    declaredTotal,
    entries: sorted,
    duplicateIds: [...duplicates].sort(),
    pagesSeen: [...pages].sort((a, b) => a - b),
    complete: declaredTotal !== null && sorted.length === declaredTotal,
  };
}
