import {expect, test, visit} from './helpers';

test('System Breach daily challenge: panel, one-click launch, challenge HUD in game', async ({page}) => {
  await visit(page, '/jeux/system-breach');
  const panel = page.getByRole('region', {name: 'Défi du jour'});
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Nouveau défi dans/)).toBeVisible();
  await expect(panel.getByRole('listitem')).toHaveCount(2); // two modifiers

  await panel.getByRole('link', {name: 'Relever le défi'}).click();
  await expect(page).toHaveURL(/defi=1/);

  const iframe = page.locator('iframe[title="System Breach — jeu"]');
  await expect(iframe).toHaveAttribute('src', /challenge=daily/);
  // The game skips its menu and starts today's challenge directly.
  await expect(page.frameLocator('iframe[title="System Breach — jeu"]').getByText(/^DAILY · /)).toBeVisible({
    timeout: 15000,
  });

  // A finished challenge run reported by the game shows up as today's best.
  const day = new Date().toISOString().slice(0, 10);
  await page.frames().find((f) => f.url().includes('/games/system-breach/'))!.evaluate((challenge) => {
    window.parent.postMessage(
      {
        source: 'euloge-arcade-game',
        version: 1,
        game: 'system-breach',
        type: 'run-finished',
        payload: {score: 4321, timeElapsed: 95, victory: false, startLevel: 2, deaths: 1, challenge},
      },
      window.location.origin,
    );
  }, day);
  await expect(page.getByText('Défi du jour enregistré')).toBeVisible();
  await expect(panel.getByText(/Ton meilleur score du jour/)).toContainText(/4\s?321/);
  // …and it does not become the standard personal record.
  await expect(page.getByRole('region', {name: 'Scores'}).getByText(/premier score/)).toBeVisible();
});
