import {expect, test, visit} from './helpers';

test('Mode A — hosted game launches in the player, fullscreen and exit work', async ({page}) => {
  await visit(page, '/jeux/system-breach');
  await expect(page.getByRole('heading', {name: 'Commandes'})).toBeVisible();
  await page.getByRole('button', {name: 'Lancer System Breach'}).click();
  const frame = page.frameLocator('iframe[title="System Breach — jeu"]');
  await expect(frame.getByRole('button', {name: /INITIATE STORY BREACH/})).toBeVisible({timeout: 15000});
  // Achievement + toast on first launch
  await expect(page.getByText('Succès débloqué')).toBeVisible();

  await page.getByRole('button', {name: 'Plein écran'}).click();
  await expect(page.getByRole('button', {name: 'Quitter le plein écran'})).toBeVisible();
  await page.getByRole('button', {name: 'Quitter le plein écran'}).click();
  await expect(page.getByRole('button', {name: 'Plein écran'})).toBeVisible();

  await page.getByRole('button', {name: 'Commandes', exact: false}).last().click();
  await expect(page.getByText('Dash (invulnérable un court instant)').first()).toBeVisible();

  await page.getByRole('button', {name: 'Quitter le jeu'}).click();
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('Mode A — a missing hosted game (SPA fallback page) shows a clear error', async ({page}) => {
  await page.route('**/games/system-breach/index.html', (route) =>
    route.fulfill({status: 200, contentType: 'text/html', body: '<!doctype html><title>fallback</title><div id="root"></div>'}),
  );
  await visit(page, '/jeux/system-breach?jouer=1');
  await expect(page.getByRole('alert').getByRole('heading', {name: 'Jeu introuvable'})).toBeVisible({timeout: 15000});
  await expect(page.getByRole('button', {name: 'Réessayer'})).toBeVisible();
});

test('Mode B — allowlisted embed is shown in a sandboxed iframe', async ({page}) => {
  await page.route('https://lichess.org/**', (route) =>
    route.fulfill({status: 200, contentType: 'text/html', body: '<!doctype html><p>Puzzle stub</p>'}),
  );
  await visit(page, '/jeux/lichess-daily-puzzle');
  await page.getByRole('button', {name: /Lancer Puzzle/}).click();
  const iframe = page.locator('iframe[title^="Puzzle"]');
  await expect(iframe).toHaveAttribute('src', /^https:\/\/lichess\.org\/training\/frame/);
  await expect(iframe).toHaveAttribute('sandbox', /allow-scripts/);
  await expect(page.frameLocator('iframe[title^="Puzzle"]').getByText('Puzzle stub')).toBeVisible();
  await expect(page.getByRole('link', {name: /Site officiel/}).first()).toBeVisible();
});

test('Mode C — external game is never framed and opens the official site safely', async ({page}) => {
  await visit(page, '/jeux/krunker');
  await expect(page.locator('iframe')).toHaveCount(0);
  const link = page.getByRole('link', {name: /Ouvrir le jeu/});
  await expect(link).toHaveAttribute('href', 'https://krunker.io/');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(page.getByText(/n'autorise pas son intégration/)).toBeVisible();
});

test('a game flagged as dead link is shown as unavailable', async ({page}) => {
  // Simulate the admin link checker having flagged the game.
  await page.route('**/rest/v1/games?*', async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as Array<Record<string, unknown>>;
    await route.fulfill({response: res, json: body.map((g) => (g.slug === '2048' ? {...g, link_status: 'broken'} : g))});
  });
  await visit(page, '/jeux/2048');
  await expect(page.getByText(/momentanément indisponible/)).toBeVisible();
  await expect(page.getByRole('link', {name: /Ouvrir le jeu/})).toHaveCount(0);
});
