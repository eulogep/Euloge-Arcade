import {defineConfig, devices} from '@playwright/test';

/**
 * End-to-end tests. They expect the local Supabase stack (`supabase start`)
 * and start the Vite dev server automatically (or reuse a running one).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5180',
    trace: 'retain-on-failure',
  },
  projects: [
    {name: 'desktop', use: {...devices['Desktop Chrome'], viewport: {width: 1440, height: 900}}, testIgnore: /responsive\.spec\.ts/},
    {name: 'mobile', use: {...devices['Pixel 7']}, testMatch: /responsive\.spec\.ts/},
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5180',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
