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

// ---------------------------------------------------------------------------
// Generic covers for external games: brand background + an original SVG motif
// (viewBox 0 0 100 100) + plain-text title. Never a third-party logo or artwork.
// ---------------------------------------------------------------------------
const C = {cyan: '#38e1ff', blue: '#2f7bff', violet: '#a24dff', pink: '#ff3b6b', green: '#34d399', amber: '#ffb020'};
const stroke = (c, wd = 2.5) => `fill="none" stroke="${c}" stroke-width="${wd}" stroke-linecap="round" stroke-linejoin="round"`;

const MOTIFS = {
  crosshair: (a) => `<circle cx="50" cy="50" r="34" ${stroke(a)}/><circle cx="50" cy="50" r="3" fill="${C.pink}"/>
    <path d="M50 4v24M50 72v24M4 50h24M72 50h24" ${stroke(a, 3)}/>`,
  rings: (a) => [40, 30, 20, 10].map((r, i) => `<circle cx="50" cy="50" r="${r}" ${stroke(i % 2 ? C.violet : a, 2)} opacity="${1 - i * 0.18}"/>`).join('') +
    `<path d="M50 6l6 14h-12z" fill="${C.pink}"/>`,
  skyline: (a) => `<path d="M4 92V60h12V44h10v20h8V30h14v34h8V50h12v14h10V38h12v54z" fill="${a}" opacity=".35"/>
    <circle cx="66" cy="40" r="16" ${stroke(C.pink, 2)}/><path d="M66 18v12M66 50v12M44 40h12M76 40h12" ${stroke(C.pink, 2)}/>`,
  claws: (a) => [0, 1, 2, 3].map((i) => `<path d="M${22 + i * 16} 8 C ${30 + i * 16} 40, ${18 + i * 16} 60, ${26 + i * 16} 94" ${stroke(i % 2 ? C.pink : a, 5)}/>`).join(''),
  moon: (a) => `<circle cx="50" cy="50" r="38" fill="${a}" opacity=".22"/><circle cx="50" cy="50" r="38" ${stroke(a)}/>
    <circle cx="36" cy="38" r="8" ${stroke(a, 1.5)}/><circle cx="62" cy="60" r="12" ${stroke(a, 1.5)}/><circle cx="64" cy="30" r="4" ${stroke(a, 1.5)}/>
    <path d="M18 62l14-6 6 10 12-4" ${stroke(C.pink, 2)}/>`,
  reel: (a) => `<circle cx="50" cy="50" r="38" ${stroke(a, 3)}/><circle cx="50" cy="50" r="6" fill="${a}"/>` +
    [0, 1, 2, 3, 4].map((i) => {
      const t = (i / 5) * Math.PI * 2;
      return `<circle cx="${50 + Math.cos(t) * 22}" cy="${50 + Math.sin(t) * 22}" r="9" ${stroke(C.pink, 2)}/>`;
    }).join(''),
  cube: (a) => `<path d="M50 10l36 20v40L50 90 14 70V30z" fill="${C.amber}" opacity=".25"/><path d="M50 10l36 20v40L50 90 14 70V30zM14 30l36 20 36-20M50 50v40" ${stroke(C.amber)}/>
    <circle cx="34" cy="62" r="5" ${stroke(C.amber, 1.5)}/><circle cx="66" cy="56" r="7" ${stroke(C.amber, 1.5)}/><circle cx="50" cy="28" r="4" ${stroke(C.amber, 1.5)}/>`,
  wave: (a) => `<path d="M6 80 Q 30 20 54 60 T 96 30" ${stroke(a, 4)}/><path d="M6 92 Q 30 40 54 76 T 96 48" ${stroke(C.violet, 2)} opacity=".6"/>
    <path d="M70 34l12-4-4 12" ${stroke(C.pink, 3)}/>`,
  ring: (a) => `<ellipse cx="50" cy="50" rx="44" ry="14" ${stroke(a, 5)} transform="rotate(-16 50 50)"/>
    <circle cx="50" cy="50" r="12" fill="${C.blue}" opacity=".5"/><circle cx="82" cy="20" r="3" fill="#fff"/><circle cx="16" cy="78" r="2" fill="#fff"/>`,
  skate: (a) => `<rect x="10" y="40" width="80" height="16" rx="8" ${stroke(a, 3)} transform="rotate(-14 50 48)"/>
    <circle cx="26" cy="68" r="6" ${stroke(C.pink)}/><circle cx="70" cy="57" r="6" ${stroke(C.pink)}/><path d="M8 88h84" ${stroke(C.violet, 2)} opacity=".5"/>`,
  flame: (a) => `<path d="M50 92c-20 0-30-14-26-32 4-14 16-20 14-40 14 10 20 22 18 34 4-4 6-10 6-16 10 10 14 22 12 32-2 14-10 22-24 22z" ${stroke(C.amber, 3)}/>
    <path d="M50 92c-8 0-12-6-10-14 2-6 8-10 8-18 6 6 10 12 8 20 2-2 4-4 4-6 4 6 4 18-10 18z" fill="${C.pink}" opacity=".5"/>`,
  sword: (a) => `<path d="M80 8l12 0 0 12-46 46-12-12z" ${stroke(a, 2.5)}/><path d="M26 52l22 22M30 70l-14 14M20 80l-8 8" ${stroke(C.amber, 4)}/>
    <circle cx="10" cy="90" r="4" fill="${C.amber}"/>`,
  ball: (a) => `<rect x="6" y="14" width="88" height="72" ${stroke(C.green, 2)} opacity=".6"/><path d="M50 14v72" ${stroke(C.green, 2)} opacity=".6"/>
    <circle cx="50" cy="50" r="14" ${stroke(C.green, 2)} opacity=".6"/><circle cx="72" cy="56" r="12" fill="#ecf0ff"/><path d="M72 50l5 4-2 6h-6l-2-6z" fill="#070914"/>`,
  sunset: (a) => `<circle cx="50" cy="56" r="30" fill="${C.pink}" opacity=".8"/>` +
    [0, 1, 2, 3].map((i) => `<rect x="18" y="${62 + i * 7}" width="64" height="${2 + i}" fill="#070914"/>`).join('') +
    `<path d="M80 94V48M80 48c-10-4-18 0-22 6M80 48c8-8 16-6 18 0M80 48c-4-10-14-12-18-8M80 48c6-10 14-10 16-4" ${stroke(C.green, 2.5)}/>`,
  donut: (a) => `<circle cx="50" cy="50" r="36" fill="#e8a25c"/><circle cx="50" cy="50" r="30" fill="#ff7ac0"/><circle cx="50" cy="50" r="11" fill="#070914"/>` +
    Array.from({length: 14}, (_, i) => {
      const t = i * 0.9;
      const r = 18 + (i % 3) * 4;
      return `<rect x="${50 + Math.cos(t) * r}" y="${50 + Math.sin(t) * r}" width="5" height="1.6" rx=".8" fill="${[C.cyan, C.amber, C.green, '#fff'][i % 4]}" transform="rotate(${i * 37} ${50 + Math.cos(t) * r} ${50 + Math.sin(t) * r})"/>`;
    }).join(''),
  hazard: (a) => `<path d="M50 8l44 78H6z" ${stroke(C.amber, 4)}/>` +
    `<path d="M50 34v26" ${stroke(C.amber, 6)}/><circle cx="50" cy="72" r="4" fill="${C.amber}"/>`,
  castle: (a) => `<path d="M10 92V40h8v8h8v-8h8v14h32V40h8v8h8v-8h8v52z" fill="${a}" opacity=".3"/><path d="M10 92V40h8v8h8v-8h8v14h32V40h8v8h8v-8h8v52z" ${stroke(a, 2)}/>
    <path d="M42 92V74a8 8 0 0 1 16 0v18" ${stroke(C.pink, 2)}/><path d="M50 54V14l16 6-16 6" ${stroke(C.pink, 2)}/>`,
  mountain: (a) => `<path d="M4 90l30-50 14 20 18-36 30 66z" fill="${a}" opacity=".3"/><path d="M4 90l30-50 14 20 18-36 30 66z" ${stroke(a, 2)}/>
    <path d="M58 40l8-16 8 16" fill="#ecf0ff" opacity=".8"/><path d="M26 30c0-6 10-6 10 0 0 6-5 10-5 10s-5-4-5-10z" fill="${C.pink}"/>`,
  blocks: () => {
    const cells = [[0, 4, C.cyan], [1, 4, C.cyan], [2, 4, C.cyan], [3, 4, C.cyan], [0, 3, C.violet], [0, 2, C.violet], [1, 3, C.violet],
      [2, 3, C.amber], [3, 3, C.amber], [3, 2, C.amber], [1, 1, C.pink], [2, 1, C.pink], [2, 0, C.pink], [1, 2, C.pink]];
    return cells.map(([x, y, c]) => `<rect x="${14 + x * 18}" y="${8 + y * 18}" width="16" height="16" rx="2" fill="${c}" opacity=".85"/>`).join('');
  },
  elements: () => [[32, 32, C.cyan], [68, 32, C.pink], [32, 68, C.green], [68, 68, C.amber]]
    .map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="15" fill="${c}" opacity=".3"/><circle cx="${x}" cy="${y}" r="15" ${stroke(c, 2)}/>`).join('') +
    `<path d="M47 32h6M47 68h6M32 47v6M68 47v6" ${stroke('#ecf0ff', 2)}/>`,
  snake: (a) => Array.from({length: 22}, (_, i) => {
    const x = 10 + i * 3.8;
    const y = 50 + Math.sin(i / 3) * 24;
    return `<circle cx="${x}" cy="${y}" r="${5 + i * 0.22}" fill="${i % 2 ? a : C.violet}"/>`;
  }).join('') + `<circle cx="92" cy="${50 + Math.sin(21 / 3) * 24 - 2}" r="2" fill="#fff"/>`,
  tank: (a) => `<rect x="50" y="42" width="40" height="16" rx="2" fill="#8a94b8"/><circle cx="46" cy="50" r="22" fill="${a}"/><circle cx="46" cy="50" r="22" ${stroke('#ecf0ff', 2)} opacity=".5"/>
    <rect x="8" y="12" width="12" height="12" fill="${C.amber}" transform="rotate(20 14 18)"/><path d="M14 80l8-14 8 14z" fill="${C.pink}"/>`,
  scribble: (a) => `<path d="M8 70c10-30 20 10 30-16s16 30 26 2 18 12 26-10" ${stroke(a, 4)}/>
    <path d="M70 14l16 16-36 36-20 4 4-20z" ${stroke(C.amber, 2.5)}/><path d="M64 20l16 16" ${stroke(C.amber, 2.5)}/>`,
  sled: (a) => `<path d="M4 30 C 30 30, 40 80, 70 70 S 96 40, 96 40" ${stroke(a, 3)}/>
    <path d="M60 66l14-4" ${stroke(C.pink, 3)}/><circle cx="68" cy="58" r="4" fill="${C.pink}"/>`,
  letters: () => {
    const row = [['A', C.green], ['R', '#3c4466'], ['C', C.amber], ['A', C.green], ['D', '#3c4466']];
    return [0, 1, 2].map((r) => row.map(([l, c], i) => {
      const fill = r === 2 ? C.green : r === 1 ? (i % 2 ? C.amber : '#3c4466') : c;
      return `<rect x="${4 + i * 19}" y="${16 + r * 24}" width="17" height="21" rx="2" fill="${fill}"/><text x="${12.5 + i * 19}" y="${32 + r * 24}" font-family="SG" font-weight="700" font-size="13" fill="#fff" text-anchor="middle">${r === 2 ? 'ARCAD'[i] : l}</text>`;
    }).join('')).join('');
  },
  egg: (a) => `<path d="M50 8c20 0 34 32 34 52 0 18-15 32-34 32S16 78 16 60C16 40 30 8 50 8z" fill="#ecf0ff" opacity=".9"/>
    <path d="M30 46l8 6 8-8 8 8 8-6" ${stroke(C.amber, 2.5)}/><circle cx="50" cy="66" r="14" ${stroke(C.pink, 2)}/><path d="M50 48v8M50 76v8M32 66h8M60 66h8" ${stroke(C.pink, 2)}/>`,
  hex: (a) => `<path d="M50 20l26 15v30L50 80 24 65V35z" ${stroke(a, 3)}/>` +
    [[50, 6, C.pink], [86, 28, C.amber], [86, 72, C.green], [50, 94, C.violet], [14, 72, C.cyan], [14, 28, C.pink]]
      .map(([x, y, c]) => `<rect x="${x - 8}" y="${y - 3}" width="16" height="6" rx="1" fill="${c}" transform="rotate(${Math.atan2(y - 50, x - 50) * 57.3 + 90} ${x} ${y})"/>`).join(''),
};

const EXTERNAL = {
  quakeworld: ['FPS rétro multijoueur', 'QuakeWorld', C.amber, 'rings'],
  surfd: ['Surf · mouvement', 'Surfd', C.cyan, 'wave'],
  'quake-2': ['FPS rétro', 'Quake II', C.amber, 'rings'],
  'urban-terror': ['FPS tactique', 'Urban Terror', C.cyan, 'skyline'],
  'black-ops-zombies-browser': ['Survie zombies', 'Black Ops Zombies', C.green, 'claws'],
  'halo-ce-browser': ['FPS science-fiction', 'Halo CE', C.cyan, 'ring'],
  'skate-3-browser': ['Skate · fan game', 'Skate 3', C.violet, 'skate'],
  'diablo-web': ['Action-RPG rétro', 'Diablo Web', C.pink, 'sword'],
  'moon-zombies': ['Survie zombies', 'Moon Zombies', C.cyan, 'moon'],
  'kino-der-toten-browser': ['Survie zombies', 'Kino der Toten', C.pink, 'reel'],
  'cheese-cube-browser': ['Survie zombies', 'Cheese Cube', C.amber, 'cube'],
  'vibe-slops-2': ['FPS parodique', 'Vibe Slops II', C.violet, 'crosshair'],
  'skate-rust': ['Skate · Rust/WASM', 'Skate × Rust', C.amber, 'skate'],
  'halo-ce-mobile': ['FPS science-fiction', 'Halo CE Mobile', C.violet, 'ring'],
  'pes-6-web': ['Football rétro', 'PES 6 Web', C.green, 'ball'],
  'gta-vice-city-wasm': ['Action · monde ouvert', 'Vice City', C.pink, 'sunset'],
  'simpsons-hit-and-run-wasm': ['Action · conduite', 'Hit & Run', C.amber, 'donut'],
  'quake-3-browser': ['FPS arène', 'Quake III Arena', C.pink, 'rings'],
  'return-to-castle-wolfenstein-browser': ['FPS rétro', 'Return to Castle Wolfenstein', C.blue, 'castle'],
  'half-life-web': ['FPS rétro', 'Half-Life Web', C.amber, 'hazard'],
  'webxash-half-life-cs16': ['FPS rétro', 'WebXash', C.amber, 'crosshair'],
  'nazi-zombies-portable': ['Survie zombies · open source', 'NZ: Portable', C.pink, 'claws'],
  'celeste-classic': ['Plateformes · PICO-8', 'Celeste Classic', C.violet, 'mountain'],
  tetris: ['Puzzle', 'Tetris', C.cyan, 'blocks'],
  'a-dark-room': ['Aventure textuelle', 'A Dark Room', C.amber, 'flame'],
  'little-alchemy-2': ['Puzzle · découverte', 'Little Alchemy 2', C.green, 'elements'],
  'slither-io': ['Arcade multijoueur', 'slither.io', C.green, 'snake'],
  'diep-io': ['Arcade multijoueur', 'diep.io', C.cyan, 'tank'],
  'skribbl-io': ['Dessin multijoueur', 'skribbl.io', C.violet, 'scribble'],
  'line-rider': ['Bac à sable', 'Line Rider', C.cyan, 'sled'],
  wordle: ['Mots', 'Wordle', C.green, 'letters'],
  'shell-shockers': ['FPS multijoueur', 'Shell Shockers', C.amber, 'egg'],
  hextris: ['Puzzle', 'Hextris', C.violet, 'hex'],
};

function motifArt(w, h, [kicker, title, accent, motif]) {
  const size = h * 0.6;
  // Fit the longest word in the text column so the title never runs into the motif.
  const longest = Math.max(...title.split(' ').map((s) => s.length));
  const fs = Math.min(h * 0.17, (w * 0.4) / (longest * 0.6));
  return `<div style="position:absolute;inset:0;background:radial-gradient(80% 90% at 72% 50%,${accent}33,#070914 70%)"></div>
  <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:${h / 10}px ${h / 10}px"></div>
  <svg style="position:absolute;right:${w * 0.08}px;top:50%;transform:translateY(-50%);filter:drop-shadow(0 0 22px ${accent}88)" width="${size}" height="${size}" viewBox="0 0 100 100">${MOTIFS[motif](accent)}</svg>
  <div class="txt" style="position:absolute;left:${w * 0.07}px;top:50%;transform:translateY(-50%);max-width:${w * 0.44}px">
    <div style="font:600 ${h * 0.035}px IN;letter-spacing:.3em;color:${accent};text-transform:uppercase">${kicker}</div>
    <div class="title" style="font-size:${fs}px;margin-top:${h * 0.03}px">${title}</div>
  </div><div class="grain"></div><div class="vignette"></div>`;
}

for (const [slug, spec] of Object.entries(EXTERNAL)) covers[slug] = (w, h) => motifArt(w, h, spec);

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
  await page.screenshot({path: resolve(root, out), type, ...(type === 'jpeg' ? {quality: 78} : {})});
  console.log('✓', out);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await shot(page, iconPage(180), 'public/brand/apple-touch-icon.png', 180, 180);
await shot(page, iconPage(512), 'public/brand/icon-512.png', 512, 512);
await shot(page, ogImage, 'public/brand/og-image.png', 1200, 630);
for (const [slug, tpl] of Object.entries(covers)) {
  // Card covers are displayed at ~330 CSS px: 800px wide covers 2x screens.
  await shot(page, base(800, 500, tpl(800, 500, false)), `public/covers/${slug}.jpg`, 800, 500, 'jpeg');
  await shot(page, base(1600, 683, tpl(1600, 683, true), '.txt{display:none}'), `public/covers/${slug}-banner.jpg`, 1600, 683, 'jpeg');
}
await browser.close();
