import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect, test} from '@playwright/test';

/**
 * Serves the production build (vite preview) with the exact headers from
 * public/_headers, then checks that the CSP blocks nothing the platform needs.
 * The local Supabase API runs on 127.0.0.1, so it is added to connect/img-src here.
 */
const headersFile = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8');
const csp = headersFile.match(/Content-Security-Policy: (.+)/)![1]
  .replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:54621")
  .replace("img-src 'self'", "img-src 'self' http://127.0.0.1:54621");

test.use({
  baseURL: 'http://127.0.0.1:4180',
  // Route-fulfilled documents are treated as "public" by Chromium's local-network
  // protection, which would block calls to the LOCAL Supabase API (test-only artifact).
  launchOptions: {args: ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks,BlockInsecurePrivateNetworkRequests']},
});

test('production build works under the Content-Security-Policy', async ({page}) => {
  test.skip(!(await fetch('http://127.0.0.1:4180').then((r) => r.ok).catch(() => false)), 'run `npm run build && npm run preview` first');
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/.test(m.text())) violations.push(m.text());
  });
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document' || !route.request().url().startsWith('http://127.0.0.1:4180')) {
      return route.continue();
    }
    const res = await route.fetch();
    await route.fulfill({response: res, headers: {...res.headers(), 'content-security-policy': csp}});
  });

  await page.goto('/?nointro');
  await expect(page.getByRole('heading', {level: 1, name: 'System Breach'})).toBeVisible();
  await page.goto('/jeux/system-breach?jouer=1&nointro');
  await expect(page.frameLocator('iframe[title="System Breach — jeu"]').getByRole('button', {name: /INITIATE STORY BREACH/})).toBeVisible({timeout: 20000});
  expect(violations).toEqual([]);
});
