import {applySeasonalTheme, getSeasonalTheme, getSeasonPreview} from '@/lib/season';

describe('seasonal theme', () => {
  it('activates Halloween throughout October', () => {
    expect(getSeasonalTheme(new Date(2026, 9, 1))).toBe('halloween');
    expect(getSeasonalTheme(new Date(2026, 9, 31, 23, 59))).toBe('halloween');
  });

  it('activates the winter holidays from 1 December to 6 January, across New Year', () => {
    expect(getSeasonalTheme(new Date(2026, 11, 1))).toBe('winter');
    expect(getSeasonalTheme(new Date(2026, 11, 31, 23, 59))).toBe('winter');
    expect(getSeasonalTheme(new Date(2027, 0, 1))).toBe('winter');
    expect(getSeasonalTheme(new Date(2027, 0, 6, 23, 59))).toBe('winter');
    expect(getSeasonalTheme(new Date(2027, 0, 7))).toBeNull();
  });

  it('stays inactive between seasons', () => {
    expect(getSeasonalTheme(new Date(2026, 10, 1))).toBeNull();
    expect(getSeasonalTheme(new Date(2026, 10, 30))).toBeNull();
    expect(getSeasonalTheme(new Date(2026, 6, 14))).toBeNull();
  });

  it('applies the season to the root and removes stale state', () => {
    const root = document.createElement('html');
    applySeasonalTheme(root, new Date(2026, 11, 24), '');
    expect(root.dataset.season).toBe('winter');
    applySeasonalTheme(root, new Date(2026, 10, 1), '');
    expect(root.dataset.season).toBeUndefined();
  });

  it('only honours the ?saison= preview when enabled (development builds)', () => {
    expect(getSeasonPreview('?saison=winter', true)).toBe('winter');
    expect(getSeasonPreview('?saison=aucune', true)).toBeNull();
    expect(getSeasonPreview('?saison=inconnue', true)).toBeUndefined();
    expect(getSeasonPreview('?saison=winter', false)).toBeUndefined();
  });

  it('covers exactly October, December and 1–6 January over a year', () => {
    const days = {halloween: 0, winter: 0};
    for (let day = new Date(2026, 0, 1); day.getFullYear() === 2026; day.setDate(day.getDate() + 1)) {
      const season = getSeasonalTheme(day);
      if (season) days[season] += 1;
    }
    expect(days).toEqual({halloween: 31, winter: 31 + 6});
  });
});
