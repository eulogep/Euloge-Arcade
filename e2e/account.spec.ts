import {ADMIN, expect, login, PLAYER, test, visit} from './helpers';

test('sign up creates an account and lands on the profile', async ({page}) => {
  const email = `e2e-new-${Date.now()}@euloge.test`;
  await visit(page, '/connexion');
  await page.getByRole('tab', {name: 'Inscription'}).click();
  await page.getByLabel('Pseudo').fill('NouveauJoueur');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill('short');
  await page.getByRole('button', {name: 'Créer mon compte'}).click();
  await expect(page.getByRole('alert')).toContainText('8 caractères');
  await page.getByLabel('Mot de passe').fill('Password123!');
  await page.getByRole('button', {name: 'Créer mon compte'}).click();
  await expect(page).toHaveURL(/\/profil/);
  await expect(page.getByLabel('Pseudo')).toHaveValue('NouveauJoueur');
});

test('wrong password shows a readable error', async ({page}) => {
  await visit(page, '/connexion');
  await page.getByLabel('E-mail').fill(PLAYER.email);
  await page.getByLabel('Mot de passe').fill('wrong-password');
  await page.getByRole('button', {name: 'Se connecter'}).click();
  await expect(page.getByRole('alert')).toHaveText('E-mail ou mot de passe incorrect.');
});

test('favorites: guest favorite is merged into the account and persists', async ({page}) => {
  await visit(page, '/jeux/2048');
  await page.getByRole('button', {name: 'Ajouter 2048 aux favoris'}).click();
  await expect(page.getByRole('button', {name: 'Retirer 2048 des favoris'})).toBeVisible();

  await login(page, PLAYER);
  await visit(page, '/jeux/krunker');
  await page.getByRole('button', {name: 'Ajouter Krunker.io aux favoris'}).click();

  await visit(page, '/favoris');
  await expect(page.getByText('Synchronisés avec ton compte')).toBeVisible();
  await expect(page.getByRole('heading', {name: '2048'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Krunker.io'})).toBeVisible();

  // Survives a reload and a fresh browser storage (server-side)
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('ea:favorites')) localStorage.removeItem(k);
  });
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Krunker.io'})).toBeVisible();

  await page.getByRole('button', {name: 'Retirer Krunker.io des favoris'}).click();
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Krunker.io'})).toHaveCount(0);
});

test('admin space is refused to players (UI and server)', async ({page, request}) => {
  await login(page, PLAYER);
  await visit(page, '/admin');
  await expect(page.getByRole('heading', {name: 'Accès réservé aux administrateurs'})).toBeVisible();

  // Even bypassing the UI, the API refuses writes: RLS filters drafts and blocks inserts.
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))!;
    return JSON.parse(localStorage.getItem(key)!).access_token as string;
  });
  const res = await request.post('http://127.0.0.1:54621/rest/v1/games', {
    headers: {
      apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {slug: 'e2e-hack', title: 'Hack', description: 'Should be refused', genre: ['arcade'], launch_mode: 'external', launch_url: 'https://example.com', license_status: 'link_only'},
  });
  expect(res.status()).toBe(403);
});

test('admin creates, publishes and unpublishes a game', async ({page}) => {
  await login(page, ADMIN);
  await visit(page, '/admin');
  await expect(page.getByRole('heading', {name: 'Catalogue'})).toBeVisible();
  await page.getByRole('link', {name: 'Ajouter un jeu'}).click();

  // Client validation
  await page.getByRole('button', {name: 'Enregistrer'}).click();
  await expect(page.getByText('Titre requis')).toBeVisible();

  await page.getByLabel('Titre', {exact: true}).fill('E2E Test Game');
  await page.getByLabel('Slug (URL)').fill('e2e-test-game');
  await page.getByLabel('Description').fill('Un jeu de test créé par les tests end-to-end.');
  await page.getByText('Arcade', {exact: true}).click();
  await page.getByLabel('URL de lancement').fill('https://example.com/');
  await page.getByLabel('Statut de licence').selectOption('link_only');
  await page.getByLabel('Statut', {exact: true}).selectOption('draft');
  await page.getByRole('button', {name: 'Enregistrer'}).click();

  await expect(page).toHaveURL(/\/admin$/);
  const row = page.getByRole('row', {name: /E2E Test Game/});
  await expect(row.getByText('Brouillon')).toBeVisible();

  // Draft is not public
  await visit(page, '/jeux/e2e-test-game');
  await expect(page.getByText("Ce jeu n'existe pas ou n'est plus disponible")).toBeVisible();

  await visit(page, '/admin');
  await page.getByRole('button', {name: 'Publier E2E Test Game'}).click();
  await expect(page.getByRole('row', {name: /E2E Test Game/}).getByText('Publié')).toBeVisible();
  await visit(page, '/jeux/e2e-test-game');
  await expect(page.getByRole('heading', {level: 1, name: 'E2E Test Game'})).toBeVisible();

  await visit(page, '/admin');
  await page.getByRole('button', {name: 'Retirer E2E Test Game'}).click();
  await expect(page.getByRole('row', {name: /E2E Test Game/}).getByText('Retiré')).toBeVisible();
});

test('server refuses embedding a domain outside the allowlist', async ({page}) => {
  await login(page, ADMIN);
  await visit(page, '/admin/jeux/nouveau');
  await page.getByLabel('Titre', {exact: true}).fill('E2E Embed');
  await page.getByLabel('Slug (URL)').fill('e2e-embed');
  await page.getByLabel('Description').fill('Tentative d’intégration non autorisée.');
  await page.getByText('Arcade', {exact: true}).click();
  await page.getByLabel('Mode de lancement').selectOption('embed');
  await page.getByLabel('URL de lancement').fill('https://not-allowed.example/game');
  await page.getByLabel('Statut de licence').selectOption('embed_permitted');
  await page.getByLabel('Statut', {exact: true}).selectOption('draft');
  await page.getByRole('button', {name: 'Enregistrer'}).click();
  await expect(page.getByText(/absent de la liste des intégrations autorisées/)).toBeVisible();
});
