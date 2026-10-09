// Renders raster brand assets and original game cover art with headless Chromium.
//   node scripts/render-brand-assets.mjs
// Outputs: public/brand/{apple-touch-icon,icon-512,og-image}.png and public/covers/*.jpg
// Third-party covers are ORIGINAL illustrations (no third-party logos or artwork).
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = (p) => pathToFileURL(resolve(root, p)).href;
const work = mkdtempSync(join(tmpdir(), 'ea-render-'));
mkdirSync(resolve(root, 'public/covers'), {recursive: true});

const FONT_DISPLAY = url('node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2');
const FONT_BODY = url('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2');
const favicon = readFileSync(resolve(root, 'public/brand/favicon.svg'), 'utf8');
const mark = readFileSync(resolve(root, 'public/brand/logo-mark-dark.svg'), 'utf8');

const base = (w, h, body, extraCss = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:SG;src:url(${FONT_DISPLAY}) format('woff2');font-weight:300 700}
@font-face{font-family:IN;src:url(${FONT_BODY}) format('woff2');font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:#070914;color:#ecf0ff;font-family:IN,sans-serif}
.title{font-family:SG;font-weight:700;letter-spacing:-0.02em;line-height:.95}
.grain{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.035) 1px,transparent 1px);background-size:3px 3px;mix-blend-mode:overlay}
.vignette{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,transparent 50%,rgba(0,0,0,.55))}
${extraCss}</style></head><body>${body}</body></html>`;

// ---------------------------------------------------------------------------
// Cover art templates. `banner` = wider variant used by the hero.
// ---------------------------------------------------------------------------
const covers = {
  'system-breach': (w, h, banner) => `
  <div style="position:absolute;inset:0;background:url(${url('public/games/system-breach/assets/images/bg_cyber_network.png')}) center/cover"></div>
  <div style="position:absolute;inset:0;background:linear-gradient(100deg,rgba(7,9,20,.92) 0%,rgba(7,9,20,.55) 45%,rgba(7,9,20,.05) 75%)"></div>
  <div style="position:absolute;left:${w * 0.52}px;bottom:${h * 0.12}px;width:${w * 0.42}px;height:${h * 0.07}px;background:url(${url('public/games/system-breach/assets/images/cyber_platform.png')}) center/100% 100%"></div>
  <div style="position:absolute;left:${w * 0.6}px;bottom:${h * 0.18}px;width:${h * 0.5}px;height:${h * 0.5}px;background:url(${url('public/games/system-breach/assets/images/player_hacker_idle.png')}) 0 0/400% auto no-repeat;filter:drop-shadow(0 0 24px rgba(0,240,255,.55))"></div>
  <div style="position:absolute;left:${w * 0.8}px;top:${h * 0.16}px;width:${h * 0.2}px;height:${h * 0.2}px;background:url(${url('public/games/system-breach/assets/images/security_drone.png')}) center/contain no-repeat;filter:drop-shadow(0 0 18px rgba(255,0,90,.6))"></div>
  <div style="position:absolute;left:${w * 0.53}px;top:${h * 0.3}px;width:${h * 0.07}px;height:${h * 0.09}px;background:url(${url('public/games/system-breach/assets/images/data_fragment.png')}) center/contain no-repeat;filter:drop-shadow(0 0 14px #00f0ff)"></div>
  <div class="txt" style="position:absolute;left:${w * 0.07}px;top:50%;transform:translateY(-50%);max-width:${w * 0.5}px">
    <div style="font:600 ${h * 0.035}px IN;letter-spacing:.3em;color:#38e1ff;text-transform:uppercase">Cyberpunk action platformer</div>
    <div class="title" style="font-size:${h * (banner ? 0.2 : 0.17)}px;margin-top:${h * 0.03}px;background:linear-gradient(90deg,#38e1ff,#a24dff 70%,#ff007f);-webkit-background-clip:text;color:transparent;text-shadow:0 0 40px rgba(56,225,255,.25)">SYSTEM<br/>BREACH</div>
  </div>
  <div class="grain"></div><div class="vignette"></div>`,

  'lichess-daily-puzzle': (w, h, banner) => chessArt(w, h, 'Puzzle du jour', '♛', '#38e1ff', banner),
  lichess: (w, h, banner) => chessArt(w, h, 'Échecs en ligne', '♚', '#a24dff', banner),

  krunker: (w, h) => {
    const cubes = Array.from({length: 46}, (_, i) => {
      const s = 20 + ((i * 37) % 70);
      const x = (i * 211) % w;
      const y = (i * 137) % h;
      const hue = i % 3 === 0 ? '#2f7bff' : i % 3 === 1 ? '#a24dff' : '#38e1ff';
      return `<div style="position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:${hue};opacity:${0.12 + (i % 5) * 0.06};transform:rotate(${(i * 23) % 45}deg);box-shadow:0 0 30px ${hue}"></div>`;
    }).join('');
    return `<div style="position:absolute;inset:0;background:radial-gradient(80% 90% at 70% 50%,#1a1450,#070914 70%)"></div>${cubes}
    <svg style="position:absolute;right:${w * 0.12}px;top:50%;transform:translateY(-50%)" width="${h * 0.62}" height="${h * 0.62}" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="34" fill="none" stroke="#38e1ff" stroke-width="2.5"/>
      <circle cx="50" cy="50" r="3" fill="#ff3b6b"/>
      <path d="M50 4v24M50 72v24M4 50h24M72 50h24" stroke="#38e1ff" stroke-width="3"/>
    </svg>
    <div class="txt" style="position:absolute;left:${w * 0.07}px;top:50%;transform:translateY(-50%)">
      <div style="font:600 ${h * 0.035}px IN;letter-spacing:.3em;color:#38e1ff;text-transform:uppercase">FPS multijoueur</div>
      <div class="title" style="font-size:${h * 0.17}px;margin-top:${h * 0.03}px">Krunker<span style="color:#a24dff">.io</span></div>
    </div><div class="grain"></div><div class="vignette"></div>`;
  },

  2048: (w, h) => {
    const vals = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4, 2, 8, 16, 2];
    const cell = h * 0.17;
    const tiles = vals
      .map((v, i) => {
        const t = Math.log2(v) / 11;
        const bg = `rgba(${Math.round(47 + t * 115)},${Math.round(123 - t * 46)},255,${0.18 + t * 0.6})`;
        return `<div style="width:${cell}px;height:${cell}px;border-radius:14px;background:${bg};display:flex;align-items:center;justify-content:center;font:700 ${cell * (v >= 1000 ? 0.28 : 0.38)}px SG;box-shadow:${v === 2048 ? '0 0 50px #a24dff' : 'none'};border:1px solid rgba(255,255,255,.12)">${v}</div>`;
      })
      .join('');
    return `<div style="position:absolute;inset:0;background:radial-gradient(80% 90% at 75% 50%,#1d1150,#070914 70%)"></div>
    <div style="position:absolute;right:${w * 0.07}px;top:50%;transform:translateY(-50%) perspective(900px) rotateY(-14deg) rotateX(6deg);display:grid;grid-template-columns:repeat(4,${cell}px);gap:${cell * 0.12}px;padding:${cell * 0.14}px;border-radius:22px;background:rgba(14,18,38,.8);border:1px solid rgba(255,255,255,.08)">${tiles}</div>
    <div class="txt" style="position:absolute;left:${w * 0.07}px;top:50%;transform:translateY(-50%)">
      <div style="font:600 ${h * 0.035}px IN;letter-spacing:.3em;color:#38e1ff;text-transform:uppercase">Puzzle</div>
      <div class="title" style="font-size:${h * 0.22}px;margin-top:${h * 0.02}px;background:linear-gradient(90deg,#38e1ff,#a24dff);-webkit-background-clip:text;color:transparent">2048</div>
    </div><div class="grain"></div><div class="vignette"></div>`;
  },
};

function chessArt(w, h, label, piece, accent, banner) {
  const n = 8;
  const size = h * 1.1;
  const squares = Array.from({length: n * n}, (_, i) => {
    const dark = (Math.floor(i / n) + (i % n)) % 2 === 1;
    return `<div style="background:${dark ? 'rgba(47,123,255,.28)' : 'rgba(236,240,255,.06)'}"></div>`;
  }).join('');
  return `<div style="position:absolute;inset:0;background:radial-gradient(80% 90% at 70% 40%,#16123f,#070914 70%)"></div>
  <div style="position:absolute;right:${-w * 0.08}px;top:${-h * 0.05}px;width:${size}px;height:${size}px;display:grid;grid-template-columns:repeat(${n},1fr);transform:perspective(1200px) rotateX(48deg) rotateZ(-28deg);border:1px solid rgba(255,255,255,.1)">${squares}</div>
  <div style="position:absolute;right:${w * 0.16}px;top:${h * 0.12}px;font-size:${h * 0.62}px;line-height:1;color:#ecf0ff;text-shadow:0 0 40px ${accent},0 0 90px ${accent}">${piece}</div>
  <div class="txt" style="position:absolute;left:${w * 0.07}px;top:50%;transform:translateY(-50%)">
    <div style="font:600 ${h * 0.035}px IN;letter-spacing:.3em;color:${accent};text-transform:uppercase">Échecs</div>
    <div class="title" style="font-size:${h * 0.14}px;margin-top:${h * 0.03}px;max-width:${w * 0.5}px">${label}</div>
  </div><div class="grain"></div><div class="vignette"></div>`;
}

const ogImage = base(
  1200,
  630,
  `<div style="position:absolute;inset:0;background:radial-gradient(60% 80% at 15% 10%,rgba(47,123,255,.35),transparent 60%),radial-gradient(60% 80% at 100% 100%,rgba(162,77,255,.35),transparent 60%)"></div>
  <div style="position:absolute;inset:0;display:flex;align-items:center;gap:56px;padding:0 90px">
    <div style="width:260px;height:260px;filter:drop-shadow(0 0 50px rgba(47,123,255,.6))">${mark.replace('<svg ', '<svg width="260" height="260" ')}</div>
    <div>
      <div class="title" style="font-size:86px;letter-spacing:.06em">EULOGE <span style="background:linear-gradient(90deg,#38e1ff,#2f7bff,#a24dff);-webkit-background-clip:text;color:transparent">ARCADE</span></div>
      <div style="margin-top:22px;font-size:30px;color:#a6b0d2">Des jeux instantanés, directement dans ton navigateur.</div>
      <div style="margin-top:34px;font:600 18px IN;letter-spacing:.35em;color:#6e78a0;text-transform:uppercase">Created by Euloge</div>
    </div>
  </div><div class="grain"></div>`,
);

const iconPage = (size) =>
  base(size, size, `<div style="width:${size}px;height:${size}px">${favicon.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>`, 'html,body{background:#070914}');

async function shot(page, html, out, w, h, type = 'png') {
  const file = join(work, `p-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(file, html);
  await page.setViewportSize({width: w, height: h});
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({path: resolve(root, out), type, ...(type === 'jpeg' ? {quality: 84} : {})});
  console.log('✓', out);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await shot(page, iconPage(180), 'public/brand/apple-touch-icon.png', 180, 180);
await shot(page, iconPage(512), 'public/brand/icon-512.png', 512, 512);
await shot(page, ogImage, 'public/brand/og-image.png', 1200, 630);
for (const [slug, tpl] of Object.entries(covers)) {
  await shot(page, base(1280, 800, tpl(1280, 800, false)), `public/covers/${slug}.jpg`, 1280, 800, 'jpeg');
  await shot(page, base(1920, 820, tpl(1920, 820, true), '.txt{display:none}'), `public/covers/${slug}-banner.jpg`, 1920, 820, 'jpeg');
}
await browser.close();
