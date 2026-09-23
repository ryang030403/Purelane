// End-to-end click-through of the preview, as a shopper would do it.
// Every assertion prints PASS/FAIL; exits 1 on any failure.
//   npm run e2e
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { serve } from './serve.mjs';

const { server, origin } = await serve();
const HOME = `${origin}/tools/preview/out/index.html`;
const browser = await puppeteer.launch({
  executablePath: ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(existsSync),
  headless: true,
  protocolTimeout: 300000,
});

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

async function newPage(width) {
  const page = await browser.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  // Record failing requests by URL (the console only says "404").
  page.on('response', (r) => r.status() >= 400 && page.errors.push(`HTTP ${r.status()} ${r.url()}`));
  await page.setViewport({ width, height: 900 });
  // Reduced motion keeps headless rendering fast; behaviour.mjs covers motion.
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  return page;
}
const cartJs = (page) => page.evaluate(() => fetch('/cart.js', { cache: 'no-store' }).then((r) => r.json()));
const headerCount = (page) => page.$eval('[data-pv-count]', (e) => Number(e.textContent));

for (const width of [1440, 375]) {
  console.log(`\n=== ${width}px ===`);
  const page = await newPage(width);
  await page.goto(`${origin}/cart/clear`);
  await page.goto(HOME, { waitUntil: 'load' });
  check((await page.$('.pv-bar')) !== null, 'header bar with cart link is shown');
  check((await headerCount(page)) === 0, 'cart starts empty', `count ${await headerCount(page)}`);

  /* 1. every add-to-cart in the product grid */
  const cards = await page.$$eval('.pl-shelf > li', (lis) =>
    lis.map((li, i) => ({
      i,
      title: li.querySelector('.pl-card__title').textContent.trim(),
      canAdd: !!li.querySelector('button[type=submit]'),
      disabled: li.querySelector('.pl-btn')?.disabled || false,
      link: li.querySelector('a.pl-btn')?.getAttribute('href') || null,
    }))
  );
  let added = 0;
  for (const card of cards) {
    await page.goto(`${HOME}#shop`, { waitUntil: 'load' });
    if (!card.canAdd) {
      check(card.disabled, `"${card.title.slice(0, 32)}" is sold out: button disabled`);
      await page.$eval(`.pl-shelf > li:nth-child(${card.i + 1}) .pl-btn`, (b) => b.click());
      await new Promise((r) => setTimeout(r, 300));
      check(page.url().startsWith(HOME), '  clicking it does nothing');
      continue;
    }
    const sel = `.pl-shelf > li:nth-child(${card.i + 1}) button[type=submit]`;
    await page.$eval(sel, (b) => b.scrollIntoView({ block: 'center' }));
    await Promise.all([page.waitForNavigation({ timeout: 15000 }), page.click(sel)]);
    added++;
    const cart = await cartJs(page);
    const line = cart.items.find((l) => l.product_title === card.title);
    check(page.url().endsWith('/cart') && !!line, `add to cart: "${card.title.slice(0, 32)}"`, `cart now ${cart.item_count} item(s)`);
  }
  await page.goto(`${origin}/cart`, { waitUntil: 'load' });
  check((await headerCount(page)) === added, `header count matches cart`, `${await headerCount(page)} = ${added}`);
  const rows = await page.$$eval('tbody tr', (r) => r.length);
  check(rows === added, 'cart page lists every added product', `${rows} rows`);

  /* 2. cart quantity controls */
  await Promise.all([page.waitForNavigation(), page.click('a[aria-label="Increase"]')]);
  check((await cartJs(page)).item_count === added + 1, 'cart: + increases quantity');
  await Promise.all([page.waitForNavigation(), page.click('a[aria-label="Decrease"]')]);
  check((await cartJs(page)).item_count === added, 'cart: − decreases quantity');
  const total = await page.$eval('.price', (e) => e.textContent);
  check(/₹[\d,]+/.test(total), 'cart shows a total', total.trim());

  /* 3. every combo "Shop bundle" -> its product page -> add to cart */
  await page.goto(HOME, { waitUntil: 'load' });
  const combos = await page.$$eval('.pl-combo', (els) =>
    els.map((el) => ({ title: el.querySelector('.pl-combo__title').textContent.trim(), href: el.querySelector('a.pl-btn').getAttribute('href') }))
  );
  for (const combo of combos) {
    await page.goto(HOME, { waitUntil: 'load' });
    await page.$eval(`.pl-combo a.pl-btn[href="${combo.href}"]`, (a) => a.scrollIntoView({ inline: 'center', block: 'center' }));
    await Promise.all([page.waitForNavigation(), page.$eval(`.pl-combo a.pl-btn[href="${combo.href}"]`, (a) => a.click())]);
    const h1 = await page.$eval('h1', (e) => e.textContent.trim());
    check(h1.toLowerCase() === combo.title.toLowerCase(), `"Shop bundle" opens ${combo.title}`, page.url().replace(origin, ''));
    const before = (await cartJs(page)).item_count;
    await Promise.all([page.waitForNavigation(), page.click('form[action="/cart/add"] button')]);
    check((await cartJs(page)).item_count === before + 1, `  add ${combo.title} from its product page`);
  }

  /* 4. bundle tier + hero buttons land on their sections */
  await page.goto(HOME, { waitUntil: 'load' });
  for (const [label, sel] of [
    ['hero "Shop now"', '.pl-hero__cta .pl-btn--primary'],
    ['hero "How it works"', '.pl-hero__cta .pl-btn--ghost'],
    ['tier "Build this box"', '.pl-tier .pl-btn'],
  ]) {
    const href = await page.$eval(sel, (a) => a.getAttribute('href'));
    const target = href.startsWith('#') ? await page.$(href) : null;
    check(!!target, `${label} -> ${href} exists on the page`);
  }

  /* 5. every link on the homepage resolves */
  const hrefs = [...new Set(await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href'))))];
  const broken = [];
  for (const href of hrefs) {
    if (href.startsWith('#')) {
      if (!(await page.$(href))) broken.push(href);
      continue;
    }
    if (/^(mailto|tel):/.test(href)) continue;
    const url = new URL(href, HOME);
    if (url.hash && url.pathname === new URL(HOME).pathname) {
      if (!(await page.$(url.hash))) broken.push(href);
      continue;
    }
    const status = await page.evaluate((u) => fetch(u, { redirect: 'follow' }).then((r) => r.status), url.href);
    if (status >= 400) broken.push(`${href} (${status})`);
  }
  check(broken.length === 0, `all ${hrefs.length} links on the homepage resolve`, broken.join(', '));

  /* 6. sold-out product cannot be added even directly */
  // Direct requests (from Node, so the expected 4xx doesn't count as a page error).
  const post = (id) =>
    fetch(`${origin}/cart/add`, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', 'content-type': 'application/x-www-form-urlencoded' }, body: `id=${id}` });
  check((await post(0)).status === 404, 'unknown variant is rejected');
  const soldOutId = await page.evaluate(() => fetch('/tools/preview/out/catalog.json').then((r) => r.json()).then((c) => c.find((p) => !p.available).variant_id));
  const so = await post(soldOutId);
  check(so.status === 422, 'sold-out product is rejected by the cart', (await so.json()).description);

  /* 7. empty cart */
  await page.goto(`${origin}/cart`);
  await Promise.all([page.waitForNavigation(), page.click('a[href="/cart/clear"]')]);
  check((await cartJs(page)).item_count === 0, 'cart: empty cart works');

  check(page.errors.length === 0, 'no script errors or failed requests', page.errors.join(' | '));
  await page.close();
}

await browser.close();
server.close();
console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
