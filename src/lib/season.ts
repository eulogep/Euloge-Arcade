export type SeasonalTheme = 'halloween' | null;

/** Seasonal presentation follows the visitor's local calendar. */
export function getSeasonalTheme(date = new Date()): SeasonalTheme {
  return date.getMonth() === 9 ? 'halloween' : null;
}

export function applySeasonalTheme(root: HTMLElement, date = new Date()) {
  const season = getSeasonalTheme(date);
  if (season) root.dataset.season = season;
  else delete root.dataset.season;
}
