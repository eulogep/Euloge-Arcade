/// <reference types="vitest/config" />
import {resolve} from 'node:path';
import react from '@vitejs/plugin-react';
import {defineConfig, type Plugin} from 'vite';
import {BRAND} from './src/config/brand';

/** Injects the centralized brand values into index.html (%BRAND_*% placeholders). */
function brandHtml(): Plugin {
  const values: Record<string, string> = {
    BRAND_NAME: BRAND.name,
    BRAND_TAGLINE: BRAND.tagline,
    BRAND_DESCRIPTION: BRAND.description,
    BRAND_CREATOR: BRAND.creator,
    BRAND_SIGNATURE: BRAND.signature,
    BRAND_THEME_COLOR: BRAND.themeColor,
    BRAND_SITE_URL: BRAND.siteUrl.replace(/\/$/, ''),
  };
  const escape = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return {
    name: 'euloge-brand-html',
    transformIndexHtml(html) {
      return html.replace(/%(BRAND_[A-Z_]+)%/g, (m, key: string) =>
        key in values ? escape(values[key]) : m,
      );
    },
  };
}

// Multi-page build: the platform SPA and each first-party hosted game are
// separate entries, so a game's code is only downloaded when it is launched.
export default defineConfig({
  plugins: [react(), brandHtml()],
  resolve: {
    alias: {'@': resolve(__dirname, 'src')},
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'system-breach': resolve(__dirname, 'games/system-breach/index.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
