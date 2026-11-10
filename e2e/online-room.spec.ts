import type {Browser, Page} from '@playwright/test';
import {expect, test} from './helpers';

/**
 * A real online game of Loups de Minuit between four separate browsers (four
 * anonymous players), synced through Supabase Realtime. Requires the local
 * Supabase stack with Realtime and anonymous sign-ins enabled.
 */
const GAME_URL = '/games/loups-de-minuit/index.html';
const NAMES = ['Awa', 'Bilal', 'Chloé', 'Dan'];

async function player(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const ctx = await browser.newContext({baseURL});
  return ctx.newPage();
}

async function goOnline(page: Page, name: string) {
  await page.goto(GAME_URL);
  await page.getByRole('button', {name: /En ligne/}).click();
  await page.getByLabel('Ton prénom').fill(name);
}

test('four devices play a full online game, each seeing only their own role', async ({page, browser, baseURL}) => {
  test.setTimeout(90_000);
  const others = await Promise.all([1, 2, 3].map(() => player(browser, baseURL)));
  const pages = [page, ...others];

  // Host creates the room.
  await goOnline(page, NAMES[0]);
  await page.getByRole('button', {name: 'Créer un salon'}).click();
  await expect(page.getByRole('heading', {name: 'Salle d’attente'})).toBeVisible();
  const code = ((await page.getByLabel(/^Code [A-Z2-9] /).textContent()) ?? '').trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  // Three friends join with the code; the host's lobby updates live.
  for (let i = 1; i < 4; i++) {
    await goOnline(pages[i], NAMES[i]);
    await pages[i].getByLabel('Code du salon').fill(code.toLowerCase());
    await pages[i].getByRole('button', {name: 'Rejoindre'}).click();
    await expect(pages[i].getByRole('heading', {name: 'Salle d’attente'})).toBeVisible();
  }
  await expect(page.getByText(/Joueurs \(4\/16\)/)).toBeVisible();
  await expect(pages[3].getByRole('button', {name: 'Lancer la partie'})).toHaveCount(0); // host only

  await page.getByRole('button', {name: 'Lancer la partie'}).click();

  // Every device switches to the night and shows its own role only.
  const roles: string[] = [];
  for (const p of pages) {
    await expect(p.getByRole('heading', {name: 'Nuit 1'})).toBeVisible();
    const tag = (await p.locator('.tag', {hasText: '·'}).first().textContent()) ?? '';
    roles.push(tag.split('·')[1].trim());
  }
  expect(roles.filter((r) => r === 'Loup-garou')).toHaveLength(1);
  expect(roles.filter((r) => r === 'Voyante')).toHaveLength(1);
  const wolf = roles.indexOf('Loup-garou');
  const seer = roles.indexOf('Voyante');
  const villager = roles.findIndex((r) => r === 'Villageois');

  // The seer inspects the wolf and learns it privately.
  await pages[seer].getByRole('button', {name: NAMES[wolf], exact: true}).click();
  await pages[seer].getByRole('button', {name: 'Sonder'}).click();
  await expect(pages[seer].getByText('est un loup-garou.')).toBeVisible();
  await expect(pages[villager].getByText('est un loup-garou.')).toHaveCount(0);

  // The wolf attacks a villager; the night resolves for everyone.
  await pages[wolf].getByRole('button', {name: NAMES[villager], exact: true}).click();
  await pages[wolf].getByRole('button', {name: 'Attaquer'}).click();
  for (const p of pages) await expect(p.getByRole('heading', {name: 'Jour 1'})).toBeVisible();
  await expect(page.getByText(`${NAMES[villager]} a été attaqué·e cette nuit.`)).toBeVisible();

  // Host opens the vote; the living vote out the wolf.
  await page.getByRole('button', {name: /Passer au vote/}).click();
  const living = [0, 1, 2, 3].filter((i) => i !== villager);
  for (const i of living) {
    const p = pages[i];
    await expect(p.getByText(/votes\. Le résultat tombe/)).toBeVisible();
    const target = i === wolf ? NAMES[seer] : NAMES[wolf];
    await p.getByRole('button', {name: target, exact: true}).click();
    await p.getByRole('button', {name: `Voter contre ${target}`}).click();
  }

  for (const p of pages) {
    await expect(p.getByText('Le village gagne !')).toBeVisible();
    await expect(p.getByText('Loup-garou', {exact: true})).toBeVisible(); // all roles revealed at the end
  }
  await Promise.all(others.map((p) => p.context().close()));
});

test('a wrong code and a taken name are explained to the player', async ({page, browser, baseURL}) => {
  await goOnline(page, 'Hôte');
  await page.getByRole('button', {name: 'Créer un salon'}).click();
  await expect(page.getByRole('heading', {name: 'Salle d’attente'})).toBeVisible();
  const code = ((await page.getByLabel(/^Code [A-Z2-9] /).textContent()) ?? '').trim();

  const guest = await player(browser, baseURL);
  await goOnline(guest, 'hôte');
  await guest.getByLabel('Code du salon').fill('ZZZZZZ');
  await guest.getByRole('button', {name: 'Rejoindre'}).click();
  await expect(guest.getByRole('alert')).toContainText('Aucun salon avec ce code');
  await guest.getByLabel('Code du salon').fill(code);
  await guest.getByRole('button', {name: 'Rejoindre'}).click();
  await expect(guest.getByRole('alert')).toContainText('déjà pris');
  await guest.context().close();
});

test('a player joining while Realtime is still connecting is not missed', async ({page, browser, baseURL}) => {
  // Reproduce the gap between "channel SUBSCRIBED" and Realtime actually listening to
  // PostgreSQL: hold the "Subscribed to PostgreSQL" confirmation for 3 s and drop the
  // change notifications that would not have been delivered before it.
  let listening = false;
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => {
      const text = String(m);
      if (text.includes('Subscribed to PostgreSQL')) {
        setTimeout(() => {
          listening = true;
          ws.send(m);
        }, 3000);
      } else if (text.includes('"postgres_changes",{"data"') && !listening) {
        // lost change: not delivered
      } else {
        ws.send(m);
      }
    });
  });

  await goOnline(page, 'Hôte');
  await page.getByRole('button', {name: 'Créer un salon'}).click();
  await expect(page.getByRole('heading', {name: 'Salle d’attente'})).toBeVisible();
  const code = ((await page.getByLabel(/^Code [A-Z2-9] /).textContent()) ?? '').trim();

  const guest = await player(browser, baseURL);
  await goOnline(guest, 'Invité');
  await guest.getByLabel('Code du salon').fill(code);
  await guest.getByRole('button', {name: 'Rejoindre'}).click();
  await expect(guest.getByRole('heading', {name: 'Salle d’attente'})).toBeVisible();
  expect(listening, 'the join happened before Realtime was listening').toBe(false);

  // Caught up as soon as Realtime confirms, well before the slow safety poll.
  await expect(page.getByText(/Joueurs \(2\/16\)/)).toBeVisible({timeout: 6000});
  await guest.context().close();
});

test('a network failure while syncing keeps the player in the room', async ({page, browser, baseURL}) => {
  await goOnline(page, 'Hôte');
  await page.getByRole('button', {name: 'Créer un salon'}).click();
  await expect(page.getByRole('heading', {name: 'Salle d’attente'})).toBeVisible();
  const code = ((await page.getByLabel(/^Code [A-Z2-9] /).textContent()) ?? '').trim();

  // The host's next state read fails (server unreachable).
  let failed = false;
  await page.route('**/rest/v1/rpc/party_state', async (route) => {
    if (failed) return route.continue();
    failed = true;
    await route.fulfill({status: 503, contentType: 'application/json', body: '{"message":"upstream unavailable"}'});
  });

  const join = async (name: string) => {
    const g = await player(browser, baseURL);
    await goOnline(g, name);
    await g.getByLabel('Code du salon').fill(code);
    await g.getByRole('button', {name: 'Rejoindre'}).click();
    await expect(g.getByRole('heading', {name: 'Salle d’attente'})).toBeVisible();
    return g;
  };
  const g1 = await join('Invité 1');
  await expect.poll(() => failed).toBe(true);
  await expect(page.getByRole('heading', {name: 'Salle d’attente'})).toBeVisible(); // not ejected
  const g2 = await join('Invité 2');
  await expect(page.getByText(/Joueurs \(3\/16\)/)).toBeVisible({timeout: 6000});
  await Promise.all([g1.context().close(), g2.context().close()]);
});
