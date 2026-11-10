import AxeBuilder from '@axe-core/playwright';
import {expect, test, visit} from './helpers';

test('Tactical Deck, Mood Roulette, and Holographic Cartridge Inspector work on home page', async ({page}) => {
  await visit(page, '/');

  const deck = page.getByRole('region', {name: 'Console de télémétrie et atelier tactique'});
  await expect(deck).toBeVisible();
  await expect(deck.getByText('Initié du Réseau')).toBeVisible();
  await expect(deck.getByText(/FRÉQUENCE DU JOUR/)).toBeVisible();
  await expect(deck.getByText(/TIRAGE TACTIQUE/)).toBeVisible();

  // Select a mood in the Tactical Roulette
  const moodBtn = deck.getByRole('button', {name: 'Adrénaline Pure'});
  await moodBtn.click();
  await expect(moodBtn).toHaveAttribute('aria-pressed', 'true');

  // Open the Holographic Cartridge Inspector from the Hero
  await page.getByRole('button', {name: /Inspecter la cartouche/}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/CARTOUCHE \/\/ EA-/)).toBeVisible();

  // Close the inspector modal
  await dialog.getByRole('button', {name: "Fermer l'inspecteur de cartouche"}).click();
  await expect(dialog).toHaveCount(0);
});

test('Command Console (⌘K), Chroma Atmospheres, and Reflex Calibrator mini-game work with zero axe violations', async ({
  page,
}) => {
  await visit(page, '/');

  // Open Command Console via button
  await page.getByRole('banner').getByRole('button', {name: 'Console de commande'}).click();
  const cmdDialog = page.getByRole('dialog', {name: 'Console de commande rapide'});
  await expect(cmdDialog).toBeVisible();

  // Filter cartridges in Command Console
  await cmdDialog.getByRole('searchbox', {name: 'Rechercher dans la console de commande'}).fill('System Breach');
  await expect(cmdDialog.getByText('EA-SYS')).toBeVisible();

  // Switch Chroma Atmosphere to Atelier Cyber-Or
  await cmdDialog.getByRole('button', {name: 'Atelier Cyber-Or'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'gold');

  // Launch Cyber-Pulse Reflex Calibrator directly from Command Console
  await cmdDialog.getByRole('button', {name: /Calibrateur de Réflexes/}).click();
  const labDialog = page.getByRole('dialog', {name: /Cyber-Pulse : Calibrateur de Réflexes/});
  await expect(labDialog).toBeVisible();

  // Start the 20s reflex sequence and hit 2 active targets
  await labDialog.getByRole('button', {name: /Démarrer la séquence/}).click();
  await labDialog.getByRole('button', {name: 'Cible active'}).click();
  await labDialog.getByRole('button', {name: 'Cible active'}).click();
  await expect(labDialog.getByText(/ms$/)).toBeVisible();

  await labDialog.getByRole('button', {name: 'Fermer le calibrateur de réflexes'}).click();
  await expect(labDialog).toHaveCount(0);

  // Verify WCAG 2.1 AA accessibility under the Gold Chroma Skin
  const results = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious).toEqual([]);
});

test('Catalog Deck View and Profile Holographic Passport work and pass accessibility checks', async ({page}) => {
  await visit(page, '/jeux');
  const deckBtn = page.getByRole('button', {name: 'Vue en liste technique'});
  await deckBtn.click();
  await expect(deckBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('EA-204').first()).toBeVisible();

  await visit(page, '/profil');
  await expect(page.getByText(/PASSEPORT HOLOGRAPHIQUE/)).toBeVisible();
  await expect(page.getByRole('heading', {name: /ADN de Joueur/})).toBeVisible();
  const cosmeticsRegion = page.getByRole('region', {name: /Dos de Cartes Holographiques/});
  await expect(cosmeticsRegion).toBeVisible();
  await expect(page.getByRole('heading', {name: /Paramètres & Studio d'Atmosphère/})).toBeVisible();

  // Equip Obsidian Pulse card back in Prestige Cosmetics
  const obsidianBtn = cosmeticsRegion.getByRole('button', {name: /Obsidian Pulse/});
  await obsidianBtn.click();
  await expect(obsidianBtn).toHaveAttribute('aria-pressed', 'true');

  // Switch to Terminal Phosphore skin from Profile Studio
  await page.getByRole('button', {name: /Terminal Phosphore/}).click();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'phosphor');

  const results = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious).toEqual([]);
});

test('External catalog games (2048, Krunker) launch and play in-platform via Holo-Cartridge Console', async ({
  page,
}) => {
  // 1. External game (Krunker.io) launched via the "Jouer sur la plateforme" button
  await visit(page, '/jeux/krunker');
  await expect(page.getByRole('heading', {name: 'Krunker.io'})).toBeVisible();

  await page.getByRole('button', {name: /Jouer sur la plateforme/}).click();

  const krunkerFrame = page.locator('iframe[title="Krunker.io — jeu"]');
  await expect(krunkerFrame).toHaveCount(1);
  await expect(krunkerFrame).toHaveAttribute('src', /\/games\/arcade-suite\/index\.html\?slug=krunker/);
  await expect(page.frameLocator('iframe[title="Krunker.io — jeu"]').locator('#game-canvas')).toBeVisible();

  // 2. Direct launch via ?jouer=1 auto-starts 2048 inside the platform
  await visit(page, '/jeux/2048?jouer=1');
  const frame2048 = page.locator('iframe[title="2048 — jeu"]');
  await expect(frame2048).toHaveCount(1);
  await expect(frame2048).toHaveAttribute('src', /\/games\/arcade-suite\/index\.html\?slug=2048/);
  await expect(page.frameLocator('iframe[title="2048 — jeu"]').locator('#game-canvas')).toBeVisible();

  // 3. New REA-engineered games (8-Ball Pool, Pac-Man Neon, Geometry Neon Dash) launch natively
  await visit(page, '/jeux/8-ball-pool?jouer=1');
  const poolFrame = page.frameLocator('iframe[title="Billard Cyber 8-Ball — jeu"]');
  await expect(poolFrame.locator('#game-canvas')).toBeVisible();
  await expect(poolFrame.locator('#hud-mode')).toHaveText('BILLARD // 8-BALL');

  await visit(page, '/jeux/pac-man-neon?jouer=1');
  const pacFrame = page.frameLocator('iframe[title="Pac-Man Neon — jeu"]');
  await expect(pacFrame.locator('#game-canvas')).toBeVisible();
  await expect(pacFrame.locator('#hud-mode')).toHaveText('ARCADE // LABYRINTHE');

  await visit(page, '/jeux/geometry-neon-dash?jouer=1');
  const dashFrame = page.frameLocator('iframe[title="Geometry Neon Dash — jeu"]');
  await expect(dashFrame.locator('#game-canvas')).toBeVisible();
  await expect(dashFrame.locator('#hud-mode')).toHaveText('RYTHME // NÉON DASH');
});

