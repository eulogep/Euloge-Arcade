import {expect, test, visit} from './helpers';

test('mobile: tab bar, no horizontal overflow, playable game page', async ({page}) => {
  await visit(page, '/');
  await expect(page.getByRole('navigation', {name: 'Navigation mobile'})).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole('navigation', {name: 'Navigation mobile'}).getByRole('link', {name: 'Jeux'}).click();
  await expect(page.getByRole('heading', {level: 1, name: /Tous les jeux/})).toBeVisible();
  await visit(page, '/jeux/system-breach');
  await expect(page.getByRole('button', {name: 'Lancer System Breach'})).toBeVisible();
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow2).toBeLessThanOrEqual(1);
});
