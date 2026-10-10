import {expect, test, visit} from './helpers';

test('instant search from the header filters the catalog', async ({page}) => {
  await visit(page, '/');
  await page.getByRole('searchbox', {name: 'Rechercher un jeu'}).fill('echecs');
  await expect(page).toHaveURL(/\/jeux\?q=echecs/);
  await expect(page.getByText('2 jeux correspondants')).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Lichess — Échecs en ligne'})).toBeVisible();
});

test('genre and feature filters, sort and empty state', async ({page}) => {
  await visit(page, '/jeux');
  await expect(page.getByText(/\d+ jeux au catalogue/)).toBeVisible();
  await page.getByRole('group', {name: 'Filtrer par genre'}).getByRole('button', {name: 'Arcade'}).click();
  await expect(page.getByText('2 jeux correspondants')).toBeVisible();
  await page.getByRole('group', {name: 'Filtrer par caractéristique'}).getByRole('button', {name: 'Jouable sur la plateforme'}).click();
  await expect(page.getByText('1 jeu correspondant')).toBeVisible();
  await expect(page).toHaveURL(/genre=arcade/);

  // Shareable URL restores the same state
  await page.reload();
  await expect(page.getByText('1 jeu correspondant')).toBeVisible();

  await page.getByLabel('Rechercher dans le catalogue').fill('zzzz introuvable');
  await expect(page.getByRole('heading', {name: 'Aucun jeu ne correspond'})).toBeVisible();
  await page.getByRole('button', {name: 'Effacer les filtres'}).click();
  await expect(page.getByText(/\d+ jeux au catalogue/)).toBeVisible();

  await page.getByRole('combobox').selectOption('az');
  await expect(page.locator('article h3').first()).toHaveText('2048');
  // Popularity sort is disabled until real data exists
  await expect(page.locator('option', {hasText: 'indisponible'})).toHaveJSProperty('disabled', true);
});
