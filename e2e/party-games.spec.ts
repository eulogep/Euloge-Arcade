import {expect, test, visit} from './helpers';

test('home shows the "Entre amis" rail with the three party games', async ({page}) => {
  await visit(page, '/');
  const rail = page.getByRole('region', {name: /Entre amis/});
  await rail.scrollIntoViewIfNeeded();
  for (const title of ['Loups de Minuit', 'Chroma Clash', 'Micro Néon']) {
    await expect(rail.getByText(title, {exact: true}).first()).toBeVisible();
  }
});

test('Loups de Minuit: roles, a full night on one device, then the village vote', async ({page}) => {
  await visit(page, '/jeux/loups-de-minuit?jouer=1');
  const game = page.frameLocator('iframe[title="Loups de Minuit — jeu"]');
  await game.getByRole('button', {name: /Sur cet appareil/}).click();
  await game.getByRole('button', {name: 'Distribuer les rôles'}).click();

  // Secret role reveal, passing the device around the 4 default players.
  for (let i = 1; i <= 4; i++) {
    await game.getByRole('button', {name: `C’est moi, Joueur ${i}`}).click();
    await expect(game.getByText(/tu es/)).toBeVisible();
    await game.getByRole('button', {name: 'J’ai retenu, cacher'}).click();
  }

  await game.getByRole('button', {name: 'Commencer la nuit'}).click();
  // Night: everyone acts in turn, whatever role they were dealt.
  for (let i = 1; i <= 4; i++) {
    await game.getByRole('button', {name: `C’est moi, Joueur ${i}`}).click();
    await game.locator('button[aria-pressed]').first().click();
    const confirm = game.getByRole('button', {name: /^(Attaquer|Protéger|Valider et passer|Sonder)/});
    const label = await confirm.innerText();
    await confirm.click();
    if (label.includes('Sonder')) {
      await expect(game.getByText(/est un loup-garou|n’est pas un loup-garou/)).toBeVisible();
      await game.getByRole('button', {name: 'J’ai vu, cacher et passer'}).click();
    }
  }

  await expect(game.getByText('Le jour se lève')).toBeVisible();
  await game.getByRole('button', {name: 'Ouvrir le débat'}).click();
  await expect(game.getByText(/^\d:\d\d$/)).toBeVisible();
  await game.getByRole('button', {name: 'Passer au vote'}).click();
  await game.locator('button[aria-pressed]').first().click();
  await game.getByRole('button', {name: /^Éliminer/}).click();
  await expect(game.getByText(/Le village élimine/)).toBeVisible();
});

test('Chroma Clash: a human plays against a bot', async ({page}) => {
  await visit(page, '/jeux/chroma-clash?jouer=1');
  const game = page.frameLocator('iframe[title="Chroma Clash — jeu"]');
  await game.getByRole('button', {name: 'Distribuer les cartes'}).click();

  const hand = game.getByRole('region', {name: 'Main de Joueur 1'});
  await expect(hand.getByRole('button')).toHaveCount(7);
  // Play a number card if possible (actions such as Bond or Retour would replay the
  // turn with two players); otherwise draw, and keep a playable drawn card.
  const numberCards = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => `button:not([disabled])[aria-label^="${v} "]`).join(', ');
  const playableNumber = hand.locator(numberCards);
  if ((await playableNumber.count()) > 0) {
    await playableNumber.first().click();
    await game.getByRole('button', {name: /^Poser/}).click();
    await expect(game.getByText(/^Joueur 1 joue/)).toBeVisible();
  } else {
    await game.getByRole('button', {name: /^Piocher/}).first().click();
    await expect(game.getByText(/^Joueur 1 pioche/)).toBeVisible();
    const keep = game.getByRole('button', {name: 'Garder et passer'});
    if (await keep.isVisible()) await keep.click();
  }
  // The bot answers on its own.
  await expect(game.getByText(/^Bot Ion (joue|pioche|ne peut|garde)/)).toBeVisible({timeout: 5000});
});
