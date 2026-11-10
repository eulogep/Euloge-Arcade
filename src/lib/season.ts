export type SeasonId = 'halloween' | 'winter';
export type SeasonalTheme = SeasonId | null;

interface MonthDay {
  /** 1 = January … 12 = December */
  month: number;
  day: number;
}

export interface Season {
  id: SeasonId;
  /** Short label shown in the header badge. */
  label: string;
  /** Inclusive range in the visitor's local calendar. May wrap over New Year. */
  start: MonthDay;
  end: MonthDay;
}

/**
 * Seasonal events, checked in order (first match wins). Adding a season means:
 * an entry here, its colors and atmosphere in styles/index.css, and its
 * decoration in components/layout/SeasonalAtmosphere.tsx.
 */
export const SEASONS: readonly Season[] = [
  {id: 'halloween', label: 'Halloween', start: {month: 10, day: 1}, end: {month: 10, day: 31}},
  {id: 'winter', label: "Fêtes d'hiver", start: {month: 12, day: 1}, end: {month: 1, day: 6}},
];

const ordinal = ({month, day}: MonthDay) => month * 100 + day;

function isWithin(date: Date, {start, end}: Season) {
  const today = ordinal({month: date.getMonth() + 1, day: date.getDate()});
  const from = ordinal(start);
  const to = ordinal(end);
  return from <= to ? today >= from && today <= to : today >= from || today <= to;
}

export function isSeasonId(value: unknown): value is SeasonId {
  return SEASONS.some((s) => s.id === value);
}

/** Seasonal presentation follows the visitor's local calendar. */
export function getSeason(date = new Date()): Season | null {
  return SEASONS.find((s) => isWithin(date, s)) ?? null;
}

export function getSeasonalTheme(date = new Date()): SeasonalTheme {
  return getSeason(date)?.id ?? null;
}

/**
 * Development preview: `?saison=winter` (or `halloween`, `aucune`) forces a season
 * outside its dates. Ignored in production builds.
 */
export function getSeasonPreview(search: string, enabled = import.meta.env.DEV): SeasonalTheme | undefined {
  if (!enabled) return undefined;
  const value = new URLSearchParams(search).get('saison');
  if (value === 'aucune') return null;
  return isSeasonId(value) ? value : undefined;
}

export function getActiveSeason(date = new Date(), search = globalThis.location?.search ?? ''): Season | null {
  const preview = getSeasonPreview(search);
  if (preview === undefined) return getSeason(date);
  return SEASONS.find((s) => s.id === preview) ?? null;
}

export function applySeasonalTheme(root: HTMLElement, date = new Date(), search = globalThis.location?.search ?? '') {
  const season = getActiveSeason(date, search);
  if (season) root.dataset.season = season.id;
  else delete root.dataset.season;
}
