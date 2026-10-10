import AxeBuilder from '@axe-core/playwright';
import {expect, test, visit} from './helpers';

test('home shows the featured hero, discovery rails and branding', async ({page}) => {
  await visit(page, '/');
  await expect(page.getByRole('region', {name: 'Jeux à la une'})).toBeVisible();
  await expect(page.getByRole('heading', {level: 1, name: 'System Breach'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Nouveautés'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'FPS & action'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Jeux rétro'})).toBeVisible();
  // No real popularity data yet: no fake "popular" section.
  await expect(page.getByRole('heading', {name: 'Jeux populaires'})).toHaveCount(0);
  await expect(page.getByText('© 2026 Euloge Arcade. All rights reserved.')).toBeVisible();
  await expect(page).toHaveTitle(/Euloge Arcade/);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/favicon.svg');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og-image\.png/);
});

test('navigates between pages from the header and footer', async ({page}) => {
  await visit(page, '/');
  await page.getByRole('navigation', {name: 'Navigation principale'}).getByRole('link', {name: 'Jeux'}).click();
  await expect(page.getByRole('heading', {level: 1, name: /Tous les jeux/})).toBeVisible();
  await page.getByRole('link', {name: 'À propos'}).click();
  await expect(page.getByText(/plateforme imaginée et développée par Euloge/)).toBeVisible();
  await expect(page.getByText('Créé et développé par Euloge')).toBeVisible();
  await page.getByRole('link', {name: 'Confidentialité'}).click();
  await expect(page.getByRole('heading', {level: 1, name: 'Politique de confidentialité'})).toBeVisible();
  await visit(page, '/nimporte-quoi');
  await expect(page.getByRole('heading', {name: "Cette page n'existe pas"})).toBeVisible();
});

test('legal pages identify the host and contain no unfinished placeholders', async ({page}) => {
  await visit(page, '/mentions-legales');
  await expect(page.getByRole('heading', {level: 1, name: 'Mentions légales'})).toBeVisible();
  await expect(page.getByText('Cloudflare, Inc.')).toBeVisible();
  await expect(page.getByText('101 Townsend Street')).toBeVisible();
  await expect(page.getByText('à compléter')).toHaveCount(0);

  await visit(page, '/confidentialite');
  await expect(page.getByRole('heading', {name: 'Responsable du traitement'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Traceurs'})).toBeVisible();
  await expect(page.getByRole('link', {name: 'réclamation à la CNIL'})).toHaveAttribute('href', 'https://www.cnil.fr/fr/plaintes');
  await expect(page.getByText('à compléter')).toHaveCount(0);
});

test('intro plays once per session, not on navigation', async ({page}) => {
  await page.goto('/');
  const intro = page.locator('.ea-intro');
  await expect(intro).toBeVisible();
  await expect(intro).toBeHidden({timeout: 4000});
  await page.getByRole('navigation', {name: 'Navigation principale'}).getByRole('link', {name: 'Favoris'}).click();
  await page.goto('/');
  await expect(page.locator('.ea-intro')).toHaveCount(0);
});

test('"Surprends-moi" opens a game page', async ({page}) => {
  await visit(page, '/');
  await page.getByRole('banner').getByRole('button', {name: /Surprends-moi/}).click();
  await expect(page).toHaveURL(/\/jeux\/[a-z0-9-]+$/);
  await expect(page.getByRole('heading', {name: 'À propos du jeu'})).toBeVisible();
});

for (const path of ['/', '/jeux', '/jeux/system-breach', '/a-propos', '/connexion', '/mentions-legales', '/confidentialite']) {
  test(`no serious accessibility violations on ${path}`, async ({page}) => {
    await visit(page, path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  });
}
