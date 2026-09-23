// Side-by-side check of the prototype vs the rendered sections.
// Freezes animations/timers in both pages, then for each viewport width
// measures matching elements and screenshots them next to each other.
//
//   node tools/preview/render.mjs && node tools/preview/compare.mjs
//   -> tools/preview/out/compare/report.md + PNGs
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { serve } from './serve.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outDir = path.join(root, 'tools/preview/out/compare');
mkdirSync(outDir, { recursive: true });

const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);

const { server, origin } = await serve();
const PROTO = `${origin}/reference/purelane-homepage.html`;
const OURS = `${origin}/tools/preview/out/index.html`;
const widths = (process.argv[2] || '375,768,1024,1440').split(',').map(Number);

// [label, prototype selector, our selector]
const pairs = [
  ['hero-copy', '.hero-copy', '.pl-hero__copy'],
  ['hero-title', '.hero h1', '.pl-hero__title'],
  ['hero-stage', '.hero-prod', '.pl-hero__prod'],
  ['hero-ptag', '.hslide.on .ptag', '.pl-hslide.is-on .pl-ptag'],
  ['hero-badges', '.badges', '.pl-hero__badges'],
  ['hero-strip', '.badgestrip', '.pl-hero__strip'],
  ['reviews-head', '.revhead', '.pl-revhead'],
  ['review-card', '.rcard', '.pl-rcard'],
  ['combos-head', '#combos .panel-head', '.pl-combos .pl-head'],
  ['combo-card-1', '.combo:nth-child(1)', '.pl-combo:nth-child(1)'],
  ['combo-card-2', '.combo:nth-child(2)', '.pl-combo:nth-child(2)'],
  ['combo-card-3', '.combo:nth-child(3)', '.pl-combo:nth-child(3)'],
  ['bundles-intro', '#bundles > .wrap > .glass', '.pl-bundles__intro'],
  ['tier-1', '.tiers .tier:nth-child(1)', '.pl-tiers li:nth-child(1) .pl-tier'],
  ['tier-2', '.tiers .tier:nth-child(2)', '.pl-tiers li:nth-child(2) .pl-tier'],
  ['shop-head', '#shop .panel-head', '.pl-grid .pl-head'],
  ['shop-card-1', '.shelf .card:nth-child(1)', '.pl-shelf li:nth-child(1) .pl-card'],
  ['shop-card-2', '.shelf .card:nth-child(2)', '.pl-shelf li:nth-child(2) .pl-card'],
];

// Both pages honour prefers-reduced-motion, which stops every animation.
// Pausing animations with injected CSS instead makes each headless
// (software-rendered) frame re-rasterise the blended water and all the
// backdrop-filter glass: 90s+ per capture.
const HIDE_CHROME = '.ticker, header, .rail, .sticky, .preview-header, .pv-bar { display: none !important; }';

const browser = await puppeteer.launch({
  executablePath: browserPath,
  headless: true,
  protocolTimeout: 600000,
  args: ['--hide-scrollbars'],
});

async function open(url, width) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(url, { waitUntil: 'load' });
  // Freeze slideshows/rotators on their first frame.
  await page.evaluate(() => {
    const last = setTimeout(() => {}, 0);
    for (let i = 0; i <= last + 1000; i++) clearInterval(i);
  });
  await page.addStyleTag({ content: HIDE_CHROME });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.evaluate(async () => {
    document.querySelectorAll('.rv').forEach((el) => el.classList.add('in'));
    document.querySelectorAll('.pl-rv').forEach((el) => el.classList.add('is-in', 'is-done'));
    await document.fonts.ready;
  });
  await new Promise((r) => setTimeout(r, 300));
  return page;
}

async function measure(page, sel) {
  return page.evaluate((s) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.getClientRects().length);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, font: cs.fontSize, family: cs.fontFamily.split(',')[0] };
  }, sel);
}

async function shot(page, sel) {
  // Two pages share one browser; a background tab produces no frames, so a
  // screenshot there never resolves.
  await page.bringToFront();
  const clip = await page.evaluate((s) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.getClientRects().length);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, width: Math.ceil(r.width), height: Math.ceil(r.height) };
  }, sel);
  if (!clip || !clip.width || !clip.height) return null;
  await new Promise((r) => setTimeout(r, 150));
  return PNG.sync.read(Buffer.from(await page.screenshot({ clip, captureBeyondViewport: false })));
}

function sideBySide(a, b) {
  const gap = 12;
  const w = (a ? a.width : 0) + gap + (b ? b.width : 0);
  const h = Math.max(a ? a.height : 0, b ? b.height : 0);
  const out = new PNG({ width: Math.max(w, 1), height: Math.max(h, 1) });
  out.data.fill(255);
  const blit = (src, dx) => src && PNG.bitblt(src, out, 0, 0, src.width, src.height, dx, 0);
  blit(a, 0);
  blit(b, (a ? a.width : 0) + gap);
  return out;
}

const lines = ['# Prototype vs build', '', 'Left = prototype, right = build. Sizes in CSS px.', ''];
for (const width of widths) {
  const proto = await open(PROTO, width);
  const ours = await open(OURS, width);
  lines.push(`## ${width}px`, '', '| element | prototype | build | Δw | Δh |', '|---|---|---|---|---|');
  for (const [label, ps, os] of pairs) {
    const a = await measure(proto, ps);
    const b = await measure(ours, os);
    const fmt = (m) => (m ? `${m.w}×${m.h}` : 'hidden');
    const dw = a && b ? Math.round((b.w - a.w) * 10) / 10 : '';
    const dh = a && b ? Math.round((b.h - a.h) * 10) / 10 : '';
    lines.push(`| ${label} | ${fmt(a)} | ${fmt(b)} | ${dw} | ${dh} |`);
    process.stderr.write(`${width} ${label} ${Math.round(performance.now() / 1000)}s
`);
    if (a || b) {
      const img = sideBySide(await shot(proto, ps), await shot(ours, os));
      writeFileSync(path.join(outDir, `${width}-${label}.png`), PNG.sync.write(img));
    }
  }
  // Full-page captures re-rasterise every backdrop-filter in software and
  // take minutes, so only the first screen is captured.
  for (const [name, page] of [['proto', proto], ['build', ours]]) {
    await page.bringToFront();
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 150));
    await page.screenshot({ path: path.join(outDir, `${width}-top-${name}.png`) });
    await page.close();
  }
  lines.push('');
}
await browser.close();
server.close();
writeFileSync(path.join(outDir, 'report.md'), lines.join('\n'));
console.log(lines.join('\n'));
