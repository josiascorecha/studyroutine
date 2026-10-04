/**
 * Gera os ícones PNG (web e Android) e as telas de abertura a partir dos SVG em resources/.
 * Uso: node scripts/gerar-icones.mjs   (requer o Chromium do Playwright; PW_CHROMIUM opcional)
 * Rode de novo sempre que mudar um SVG em resources/.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = join(root, 'android/app/src/main/res');
const svg = (name) => readFileSync(join(root, 'resources', name), 'utf8');

const ICON = svg('icon.svg'); // cantos arredondados (web)
const FULL = svg('icon-maskable.svg'); // fundo inteiro (maskable, Play Store, ícone legado)
const FOREGROUND = svg('icon-foreground.svg'); // só o desenho, fundo transparente (ícone adaptativo)

const LIGHT_BG = '#F5F5FA';
const DARK_BG = '#121220';

const sized = (markup, w, h = w) => markup.replace('<svg ', `<svg width="${w}" height="${h}" `);
const page = (body, bg = 'transparent') => `<html><body style="margin:0;background:${bg};overflow:hidden">${body}</body></html>`;
const round = (markup, size) =>
  `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden">${sized(markup, size)}</div>`;
const splash = (w, h, bg) => {
  const s = Math.round(Math.min(w, h) * 0.3);
  return `<div style="width:${w}px;height:${h}px;display:grid;place-items:center;background:${bg}">${sized(ICON, s)}</div>`;
};

const jobs = [
  // Web (PWA)
  ['public/icons/icon-192.png', 192, 192, page(sized(ICON, 192))],
  ['public/icons/icon-512.png', 512, 512, page(sized(ICON, 512))],
  ['public/icons/maskable-512.png', 512, 512, page(sized(FULL, 512))],
  ['public/icons/apple-touch-icon.png', 180, 180, page(sized(FULL, 180))],
  // Google Play (ícone da ficha: 512×512, sem transparência)
  ['resources/play-store-512.png', 512, 512, page(sized(FULL, 512))],
];

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
if (existsSync(res)) {
  for (const [d, k] of Object.entries(densities)) {
    const legacy = Math.round(48 * k);
    const fg = Math.round(108 * k);
    jobs.push([`android/app/src/main/res/mipmap-${d}/ic_launcher.png`, legacy, legacy, page(sized(ICON, legacy))]);
    jobs.push([`android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, legacy, legacy, page(round(FULL, legacy))]);
    jobs.push([`android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`, fg, fg, page(sized(FOREGROUND, fg))]);
  }
  const splashSizes = {
    mdpi: [320, 480],
    hdpi: [480, 800],
    xhdpi: [720, 1280],
    xxhdpi: [960, 1600],
    xxxhdpi: [1280, 1920],
  };
  for (const [d, [w, h]] of Object.entries(splashSizes)) {
    jobs.push([`android/app/src/main/res/drawable-port-${d}/splash.png`, w, h, page(splash(w, h, LIGHT_BG))]);
    jobs.push([`android/app/src/main/res/drawable-land-${d}/splash.png`, h, w, page(splash(h, w, LIGHT_BG))]);
    jobs.push([`android/app/src/main/res/drawable-port-night-${d}/splash.png`, w, h, page(splash(w, h, DARK_BG))]);
    jobs.push([`android/app/src/main/res/drawable-land-night-${d}/splash.png`, h, w, page(splash(h, w, DARK_BG))]);
  }
  jobs.push(['android/app/src/main/res/drawable/splash.png', 480, 320, page(splash(480, 320, LIGHT_BG))]);
  jobs.push(['android/app/src/main/res/drawable-night/splash.png', 480, 320, page(splash(480, 320, DARK_BG))]);
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [out, w, h, html] of jobs) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.setContent(html);
  mkdirSync(dirname(join(root, out)), { recursive: true });
  await p.screenshot({ path: join(root, out), omitBackground: true });
  await p.close();
}
await browser.close();
console.log(`${jobs.length} imagens geradas.`);
