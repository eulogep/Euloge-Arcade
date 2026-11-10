import {expect, test, visit} from './helpers';

// Chromium's fake microphone: the real getUserMedia flow, without hardware.
test.use({
  permissions: ['microphone'],
  launchOptions: {args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']},
});

test('microphone is delegated to the karaoke iframe only, and a scored song reaches the results', async ({page}) => {
  test.setTimeout(60_000);
  await visit(page, '/jeux/micro-neon?jouer=1');
  const iframe = page.locator('iframe[title="Micro Néon — jeu"]');
  await expect(iframe).toHaveAttribute('allow', /microphone/);
  const game = page.frameLocator('iframe[title="Micro Néon — jeu"]');

  await game.getByRole('button', {name: 'Activer le micro'}).click();
  await expect(game.getByRole('meter', {name: 'Niveau du micro'})).toBeVisible();
  await expect(game.getByRole('button', {name: /Micro actif/})).toBeVisible();

  await game.getByRole('button', {name: 'Commencer la soirée'}).click();
  await game.getByRole('button', {name: /Échauffement : la gamme/}).click();
  await game.getByRole('button', {name: 'Chanter et être noté'}).click();
  await expect(game.getByText('Notation en direct')).toBeVisible();
  await expect(game.getByText(/^Justesse : \d+ %$/)).toBeVisible({timeout: 30_000});
  await game.getByRole('button', {name: 'Classement'}).click();
  await expect(game.getByRole('heading', {name: 'Classement de la soirée'})).toBeVisible();
});

test('other hosted games do not get the microphone', async ({page}) => {
  await visit(page, '/jeux/chroma-clash?jouer=1');
  await expect(page.locator('iframe[title="Chroma Clash — jeu"]')).not.toHaveAttribute('allow', /microphone/);
});
