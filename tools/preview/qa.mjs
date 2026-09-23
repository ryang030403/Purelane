// QA evidence for docs/qa: section captures, prototype vs build, edge cases,
// focus, reduced motion, and before/after captures of the bugs that were
// fixed (QA_BEFORE = a checkout of the pre-fix commit with the same
// tools/preview folder, e.g. `git worktree add ../before c332441`).
//
//   node tools/preview/render.mjs && QA_BEFORE=../before node tools/preview/qa.mjs
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { serve } from './serve.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.join(root, 'docs/qa/img');
mkdirSync(out, { recursive: true });
const results = {};

const { server, origin } = await serve();
let before = null;
if (process.env.QA_BEFORE) {
  const mod = await import(pathToFileURL(path.resolve(process.env.QA_BEFORE, 'tools/preview/serve.mjs')).href);
  before = await mod.serve();
}
const BUILD = `${origin}/tools/preview/out/index.html`;
const PROTO = `${origin}/reference/purelane-homepage.html`;
const OLD = before && `${before.origin}/tools/preview/out/index.html`;

const browser = await puppeteer.launch({
  executablePath: ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(existsSync),
  headless: true,
  protocolTimeout: 300000,
  args: ['--hide-scrollbars'],
});

async function open(url, width, { motion = false, height = 1000, init } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  if (!motion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (init) await page.evaluateOnNewDocument(init);
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.bringToFront();
  return page;
}
const hideChrome = (page) =>
  page.addStyleTag({ content: '.ticker,header,.rail,.sticky{display:none!important}' });

async function crop(page, sel, file, { pad = 0, type = 'jpeg' } = {}) {
  await page.bringToFront();
  const clip = await page.evaluate(
    (s, pad) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.getClientRects().length);
      if (!el) return null;
      el.scrollIntoView({ block: 'start' });
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, r.left - pad) + scrollX, y: Math.max(0, r.top - pad) + scrollY, width: Math.ceil(r.width + pad * 2), height: Math.ceil(r.height + pad * 2) };
    },
    sel,
    pad
  );
  if (!clip) throw new Error(`not found: ${sel}`);
  await new Promise((r) => setTimeout(r, 200));
  const opts = { clip, captureBeyondViewport: clip.height > (page.viewport().height || 1000) };
  const buf = await page.screenshot(type === 'jpeg' ? { ...opts, type: 'jpeg', quality: 82 } : opts);
  if (file) writeFileSync(path.join(out, file), buf);
  return buf;
}

// Two captures next to each other with a white gutter (PNG only).
function pair(a, b, file) {
  const A = PNG.sync.read(Buffer.from(a));
  const B = PNG.sync.read(Buffer.from(b));
  const g = 16;
  const img = new PNG({ width: A.width + g + B.width, height: Math.max(A.height, B.height) });
  img.data.fill(255);
  PNG.bitblt(A, img, 0, 0, A.width, A.height, 0, 0);
  PNG.bitblt(B, img, 0, 0, B.width, B.height, A.width + g, 0);
  writeFileSync(path.join(out, file), PNG.sync.write(img));
}

const log = (k, v) => {
  results[k] = v;
  console.log(k, typeof v === 'object' ? JSON.stringify(v) : v);
};

/* 1. every section, build, desktop + mobile */
const sections = [
  ['hero', 'pl-hero'],
  ['reviews', '.pl-revband'],
  ['combos', '.pl-combos'],
  ['bundles', '.pl-bundles'],
  ['shop', '.pl-grid'],
];
for (const width of [1440, 375]) {
  const page = await open(BUILD, width);
  for (const [name, sel] of sections) await crop(page, sel, `section-${name}-${width}.jpg`);
  await page.close();
}

/* 2. prototype vs build, same element */
const pairs = [
  ['hero-copy', '.hero-copy', '.pl-hero__copy', 1440],
  ['hero-stage', '.hero-prod', '.pl-hero__prod', 1440],
  ['review-card', '.rcard', '.pl-rcard', 1440],
  ['combo-card', '.combo:nth-child(3)', '.pl-combo:nth-child(3)', 1440],
  ['tier', '.tiers .tier:nth-child(2)', '.pl-tiers li:nth-child(2) .pl-tier', 1440],
  ['shop-card', '.shelf .card:nth-child(1)', '.pl-shelf li:nth-child(1) .pl-card', 1440],
  ['hero-mobile', '.hero-copy', '.pl-hero__copy', 375],
  ['combo-card-mobile', '.combo:nth-child(1)', '.pl-combo:nth-child(1)', 375],
  ['shop-card-mobile', '.shelf .card:nth-child(1)', '.pl-shelf li:nth-child(1) .pl-card', 375],
];
for (const width of [1440, 375]) {
  const proto = await open(PROTO, width);
  await hideChrome(proto);
  await proto.evaluate(() => document.querySelectorAll('.rv').forEach((e) => e.classList.add('in')));
  const build = await open(BUILD, width);
  for (const [name, ps, bs, w] of pairs.filter((p) => p[3] === width)) {
    pair(await crop(proto, ps, null, { type: 'png' }), await crop(build, bs, null, { type: 'png' }), `vs-${name}.png`);
  }
  await proto.close();
  await build.close();
}

/* 3. required edge cases: sold out, no image, long title */
{
  const page = await open(BUILD, 1440);
  await page.evaluate(() => document.querySelectorAll('.pl-shelf > li')[4].scrollIntoView({ block: 'center' }));
  const clip = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.pl-shelf > li')].slice(4, 8);
    const a = items[0].getBoundingClientRect();
    const b = items[3].getBoundingClientRect();
    return { x: a.left + scrollX - 8, y: a.top + scrollY - 8, width: b.right - a.left + 16, height: Math.max(a.height, b.height) + 16 };
  });
  await new Promise((r) => setTimeout(r, 200));
  writeFileSync(path.join(out, 'edge-cases.jpg'), await page.screenshot({ clip, type: 'jpeg', quality: 85 }));
  log('edge cases', await page.evaluate(() =>
    [...document.querySelectorAll('.pl-shelf > li')].slice(4, 8).map((li) => ({
      title: li.querySelector('.pl-card__title').textContent.trim().slice(0, 40),
      pill: li.querySelector('.pl-card__pill')?.textContent.trim() || '',
      image: !!li.querySelector('img'),
      button: li.querySelector('.pl-btn').textContent.trim().split('\n')[0].trim(),
      disabled: li.querySelector('.pl-btn').disabled || false,
      titleLines: Math.round(li.querySelector('.pl-card__title').getBoundingClientRect().height / 16.2),
    }))
  ));
  await page.close();
}

/* 4. keyboard focus */
{
  const page = await open(BUILD, 1440);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await crop(page, '.pl-hero__cta', 'focus-hero-cta.png', { pad: 10, type: 'png' });
  await page.focus('.pl-shelf li:nth-child(2) button[type=submit]');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Tab');
  await crop(page, '.pl-shelf li:nth-child(2) .pl-card', 'focus-add-to-cart.png', { pad: 10, type: 'png' });
  log('focused element names', await page.evaluate(() => {
    const b = document.activeElement;
    const ids = (b.getAttribute('aria-labelledby') || '').split(' ');
    return ids.map((id) => document.getElementById(id)?.textContent.trim().split('\n')[0].trim()).join(', ');
  }));
  await page.close();
}

/* 5. motion on: marquee loop period + reduced-motion fallback */
{
  const page = await open(BUILD, 1440, { motion: true });
  log('build marquee: one set vs half track (px)', await page.evaluate(() => [document.querySelector('.pl-revset').offsetWidth, document.querySelector('.pl-revtrack').scrollWidth / 2]));
  await page.close();
  const proto = await open(PROTO, 1440, { motion: true });
  log('prototype marquee: one set vs half track (px)', await proto.evaluate(() => {
    const t = document.querySelector('.revtrack');
    const cards = [...t.children];
    const period = cards[cards.length / 2].offsetLeft - cards[0].offsetLeft;
    return [period, t.scrollWidth / 2];
  }));
  await proto.close();
  const rm = await open(BUILD, 1440);
  await crop(rm, '.pl-revband', 'reduced-motion-reviews.jpg');
  await rm.close();
}

/* 6. before / after */
if (OLD) {
  // a) Price row wrapping on mobile cards (real bug, would show on the store).
  {
    const a = await open(OLD, 375);
    const b = await open(BUILD, 375);
    pair(await crop(a, '.pl-shelf li:nth-child(1) .pl-card', null, { type: 'png' }), await crop(b, '.pl-shelf li:nth-child(1) .pl-card', null, { type: 'png' }), 'fix-price-wrap-375.png');
    log('card height at 375 before/after (prototype 349.6)', [
      await a.evaluate(() => document.querySelector('.pl-card').getBoundingClientRect().height),
      await b.evaluate(() => document.querySelector('.pl-card').getBoundingClientRect().height),
    ]);
    await a.close();
    await b.close();
  }
  // b) box-sizing: only broke without Dawn's inline rule (how the first
  //    harness rendered it). Simulated here by removing that rule.
  {
    const noInline = () => {
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = '*,*::before,*::after{box-sizing:content-box}';
        document.head.append(s);
      });
    };
    const a = await open(OLD, 1440, { init: noInline });
    const b = await open(BUILD, 1440, { init: noInline });
    pair(await crop(a, '.pl-combo:nth-child(1)', null, { type: 'png' }), await crop(b, '.pl-combo:nth-child(1)', null, { type: 'png' }), 'fix-box-sizing.png');
    log('combo card width without Dawn inline rule, before/after (prototype 302)', [
      await a.evaluate(() => document.querySelector('.pl-combo').getBoundingClientRect().width),
      await b.evaluate(() => document.querySelector('.pl-combo').getBoundingClientRect().width),
    ]);
    await a.close();
    await b.close();
  }
  // c) Hero layout shift. On a real store Dawn sets --header-height from a
  //    deferred script; simulated with a 600ms delay and a 90px header.
  {
    const lateHeader = () => {
      window.__cls = 0;
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__cls += e.value))).observe({ type: 'layout-shift', buffered: true });
      window.addEventListener('load', () => setTimeout(() => document.documentElement.style.setProperty('--header-height', '90px'), 600));
    };
    const cls = [];
    for (const [label, url] of [['before', OLD], ['after', BUILD]]) {
      const p = await open(url, 1440, { motion: true, height: 900, init: lateHeader });
      await p.evaluate(() => window.scrollTo(0, 0));
      const top0 = await p.evaluate(() => document.querySelector('.pl-hero__title').getBoundingClientRect().top);
      writeFileSync(path.join(out, `cls-${label}-1.jpg`), await p.screenshot({ type: 'jpeg', quality: 70 }));
      await new Promise((r) => setTimeout(r, 1200));
      const top1 = await p.evaluate(() => document.querySelector('.pl-hero__title').getBoundingClientRect().top);
      writeFileSync(path.join(out, `cls-${label}-2.jpg`), await p.screenshot({ type: 'jpeg', quality: 70 }));
      cls.push({ label, cls: +(await p.evaluate(() => window.__cls)).toFixed(4), headlineMovedPx: Math.round(top0 - top1) });
      await p.close();
    }
    log('hero layout shift (Dawn header var set late)', cls);
  }
}

/* 7. prototype bugs that were not copied */
{
  const proto = await open(PROTO, 1440);
  await hideChrome(proto);
  await proto.evaluate(() => document.querySelectorAll('.rv').forEach((e) => e.classList.add('in')));
  const build = await open(BUILD, 1440);
  pair(await crop(proto, '.shelf .card:nth-child(1) .shot', null, { type: 'png' }), await crop(build, '.pl-shelf li:nth-child(1) .pl-card__shot', null, { type: 'png' }), 'proto-bug-empty-image.png');
  log('prototype shelf image size at 1440 (w x h)', await proto.evaluate(() => {
    const r = document.querySelector('.shelf .card .pimg').getBoundingClientRect();
    return `${r.width} x ${r.height}`;
  }));
  pair(await crop(proto, '.tiers .tier:nth-child(1) .qty', null, { pad: 6, type: 'png' }), await crop(build, '.pl-tier__qty', null, { pad: 6, type: 'png' }), 'proto-bug-qty-box.png');
  // contrast of small text, computed from the rendered colours
  const contrast = async (page, sel) =>
    page.evaluate((s) => {
      const el = document.querySelector(s);
      const c = getComputedStyle(el).color.match(/[\d.]+/g).map(Number);
      const bg = [246, 243, 251];
      const a = c[3] ?? 1;
      const mix = c.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
      const L = (rgb) => rgb.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const [x, y] = [L(mix), L(bg)];
      return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2);
    }, sel);
  log('contrast on glass, prototype vs build', {
    kicker: [await contrast(proto, '#combos .kicker'), await contrast(build, '.pl-combos .pl-kicker')],
    'price label': [await contrast(proto, '.ptag .lbl'), await contrast(build, '.pl-ptag__lbl')],
    'rating': [await contrast(proto, '.card .rate b'), await contrast(build, '.pl-card__rate b')],
  });
  await proto.close();
  await build.close();
}

await browser.close();
server.close();
if (before) before.server.close();
writeFileSync(path.join(root, 'docs/qa/results.json'), JSON.stringify(results, null, 2));
console.log('\nwrote docs/qa/img/* and docs/qa/results.json');
