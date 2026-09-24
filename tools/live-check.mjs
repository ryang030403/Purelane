// Checks the LIVE store (not the local preview): every Purelane section
// renders with real data, every image loads, Add to cart opens Dawn's cart
// drawer and updates the count, sold-out is blocked, bundle pages open,
// checkout is reachable. Saves screenshots to tools/preview/out/live/.
//
//   STORE_URL=https://your-store.myshopify.com STORE_PASSWORD=... npm run live-check
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch } from './preview/browser.mjs';

const STORE = (process.env.STORE_URL || '').replace(/\/$/, '');
const PASSWORD = process.env.STORE_PASSWORD || '';
if (!STORE) {
  console.error('Set STORE_URL (and STORE_PASSWORD if the store is password protected).');
  process.exit(1);
}
const shots = fileURLToPath(new URL('./preview/out/live/', import.meta.url));
mkdirSync(shots, { recursive: true });
const shot = (name) => path.join(shots, name);

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

const browser = await launch();

async function open(width) {
  const page = await browser.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.setViewport({ width, height: 900 });
  page.setDefaultNavigationTimeout(90000);
  await page.goto(`${STORE}/`, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/password')) {
    if (!PASSWORD) throw new Error('The store is password protected: set STORE_PASSWORD.');
    // On small screens Dawn tucks the password field into a modal, so fill
    // and submit the form directly rather than typing into it.
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.evaluate((pw) => {
        const input = document.querySelector('input[type=password]');
        input.value = pw;
        input.form.requestSubmit();
      }, PASSWORD),
    ]);
    await page.goto(`${STORE}/`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForSelector('pl-hero', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));
  return page;
}

async function scrollAll(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    // Swipe through horizontal rails too: their off-screen images are
    // lazy-loaded and only load once swiped into view, as for a shopper.
    for (const rail of document.querySelectorAll('[data-pl-rail]')) {
      rail.scrollIntoView({ block: 'center' });
      for (let x = 0; x <= rail.scrollWidth; x += 200) {
        rail.scrollLeft = x;
        await new Promise((r) => setTimeout(r, 150));
      }
      rail.scrollLeft = 0;
    }
    window.scrollTo(0, 0);
  });
  await new Promise((r) => setTimeout(r, 1500));
}

for (const width of [1440, 375]) {
  console.log(`\n=== ${width}px ===`);
  const page = await open(width);
  const theme = await page.evaluate(() => window.Shopify?.theme?.name || '');
  check(/purelane/i.test(theme), 'Purelane is the live theme', theme);

  // Sections present with data
  const data = await page.evaluate(() => ({
    hero: !!document.querySelector('pl-hero .pl-hero__title'),
    slides: document.querySelectorAll('.pl-hslide').length,
    heroPrice: document.querySelector('.pl-ptag__val strong')?.textContent.trim(),
    reviews: document.querySelectorAll('.pl-revset:first-child .pl-rcard').length,
    combos: document.querySelectorAll('.pl-combo').length,
    comboItems: document.querySelectorAll('.pl-stack__it').length,
    tiers: document.querySelectorAll('.pl-tier').length,
    perItem: [...document.querySelectorAll('.pl-tier__per')].map((e) => e.textContent.trim()),
    cards: document.querySelectorAll('.pl-card').length,
    soldOut: [...document.querySelectorAll('.pl-card')].filter((c) => c.querySelector('.pl-btn[disabled]')).length,
    noImage: document.querySelectorAll('.pl-card .pl-tile').length,
    ratings: document.querySelectorAll('.pl-card__rate').length,
  }));
  check(data.hero && data.slides === 3, 'hero renders with 3 price slides');
  check(/^₹\d/.test(data.heroPrice || ''), 'prices are in rupees with no space', data.heroPrice);
  check(data.reviews === 5, 'reviews rail shows 5 reviews from the metaobject', `${data.reviews}`);
  check(data.combos === 5 && data.comboItems >= 13, 'combos show 5 bundles with their items', `${data.combos} combos, ${data.comboItems} items`);
  check(data.tiers === 3, 'bundles show 3 tiers', data.perItem.join(' | '));
  check(data.cards === 8, 'product grid shows 8 products', `${data.cards}`);
  check(data.soldOut === 1 && data.noImage === 1, 'sold-out and no-image cases render', `sold out ${data.soldOut}, no image ${data.noImage}`);
  check(data.ratings >= 8, 'ratings come from the reviews metafields', `${data.ratings}`);

  // Every image loads once scrolled into view
  await scrollAll(page);
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll('.pl img')]
      .filter((i) => !i.naturalWidth)
      .map((i) => `${i.closest('.pl-combo, .pl-card, .pl-tier, pl-hero')?.className.split(' ')[0] || '?'}: ${(i.currentSrc || i.src).split('/').pop().slice(0, 40)}`)
  );
  check(broken.length === 0, 'every section image loads', broken.join(', '));

  // Section screenshots
  for (const [name, sel] of [['hero', 'pl-hero'], ['reviews', '.pl-revband'], ['combos', '.pl-combos'], ['bundles', '.pl-bundles'], ['shop', '.pl-grid']]) {
    await page.$eval(sel, (e) => e.scrollIntoView({ block: 'start' }));
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: shot(`${width}-${name}.jpg`), type: 'jpeg', quality: 72 });
  }

  // Add to cart -> Dawn's cart drawer on the same page
  const countBefore = await page.evaluate(() => fetch('/cart.js').then((r) => r.json()).then((c) => c.item_count));
  const btn = '.pl-shelf > li:nth-child(1) button[type=submit]';
  await page.$eval(btn, (b) => b.scrollIntoView({ block: 'center' }));
  await new Promise((r) => setTimeout(r, 500));
  await page.click(btn);
  const opened = await page
    .waitForSelector('cart-drawer.active, cart-notification.active, .cart-notification.active', { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  await new Promise((r) => setTimeout(r, 1500));
  const countAfter = await page.evaluate(() => fetch('/cart.js').then((r) => r.json()).then((c) => c.item_count));
  check(opened && countAfter === countBefore + 1, 'Add to cart opens the cart drawer and adds the item', `${countBefore} -> ${countAfter}`);
  check(page.url().replace(/#.*$/, '') === `${STORE}/`, 'shopper stays on the homepage');
  const bubble = await page.evaluate(() => document.querySelector('#cart-icon-bubble')?.textContent.replace(/\s+/g, ' ').trim());
  check(/\d/.test(bubble || ''), 'header cart icon shows the count', bubble);
  await page.screenshot({ path: shot(`${width}-cart-drawer.jpg`), type: 'jpeg', quality: 72 });

  // Checkout reachable from the drawer
  const checkout = await page.evaluate(() => {
    const b = document.querySelector('cart-drawer button[name=checkout], cart-drawer [name=checkout]');
    return !!b;
  });
  check(checkout, 'cart drawer has a checkout button');

  // Sold-out product can't be bought. The theme disables its button (checked
  // above); Shopify's cart API accepts the line, and checkout then refuses it
  // on its stock-problems page.
  await page.evaluate(async () => {
    const v = (await (await fetch('/products/herbal-floor-cleaner.js')).json()).variants[0];
    await fetch('/cart/clear.js', { method: 'POST' });
    await fetch('/cart/add.js', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: v.id, quantity: 1 }) });
  });
  const co = await browser.newPage();
  await co.goto(`${STORE}/checkout`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));
  check(/stock-problems/.test(co.url()), 'checkout refuses the sold-out product', co.url().replace(/^.*\/checkouts\/[^/]+\/[^/]+\//, '…/'));
  await co.close();

  // Bundle product pages
  const hrefs = await page.$$eval('.pl-combo a.pl-btn', (as) => as.map((a) => a.getAttribute('href')));
  let okPages = 0;
  for (const h of hrefs) {
    const s = await page.evaluate((u) => fetch(u).then((r) => r.status), h);
    if (s === 200) okPages++;
  }
  check(okPages === hrefs.length && hrefs.length === 5, '"Shop bundle" product pages open', `${okPages}/${hrefs.length}`);

  // Clean up the test cart
  await page.evaluate(() => fetch('/cart/clear.js', { method: 'POST' }));
  check(page.errors.length === 0, 'no theme script errors', page.errors.slice(0, 3).join(' | '));
  await page.close();
}

await browser.close();
console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}  (screenshots in tools/preview/out/live/)`);
process.exit(failures ? 1 : 0);
