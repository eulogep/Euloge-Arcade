import {applySeasonalTheme, getSeasonalTheme} from '@/lib/season';

describe('seasonal theme', () => {
  it('activates Halloween throughout October', () => {
    expect(getSeasonalTheme(new Date(2026, 9, 1))).toBe('halloween');
    expect(getSeasonalTheme(new Date(2026, 9, 31, 23, 59))).toBe('halloween');
  });

  it('stays inactive outside October and removes stale state', () => {
    const root = document.createElement('html');
    root.dataset.season = 'halloween';
    applySeasonalTheme(root, new Date(2026, 10, 1));
    expect(root.dataset.season).toBeUndefined();
  });
});
