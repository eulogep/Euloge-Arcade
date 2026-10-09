import {expect, test as base, type Page} from '@playwright/test';

// Public demo credentials of the local Supabase CLI stack (not secrets).
export const SUPABASE_URL = 'http://127.0.0.1:54621';
export const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
export const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const ADMIN = {email: 'e2e-admin@euloge.test', password: 'Password123!'};
export const PLAYER = {email: 'e2e-player@euloge.test', password: 'Password123!'};

/** Every test fails on uncaught page errors or console errors. */
export const test = base.extend<{errors: string[]}>({
  errors: [
    async ({page}, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
      });
      await use(errors);
      expect(errors, 'no blocking console errors').toEqual([]);
    },
    {auto: true},
  ],
});
export {expect};

/** Skip the once-per-session intro so tests start on the page directly. */
export async function visit(page: Page, path: string) {
  await page.goto(path + (path.includes('?') ? '&' : '?') + 'nointro');
}

export async function login(page: Page, who: {email: string; password: string}) {
  await visit(page, '/connexion');
  await page.getByLabel('E-mail').fill(who.email);
  await page.getByLabel('Mot de passe').fill(who.password);
  await page.getByRole('button', {name: 'Se connecter'}).click();
  await expect(page).toHaveURL(/\/profil/);
}
