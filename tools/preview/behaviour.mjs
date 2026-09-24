// Behaviour checks on the rendered preview with motion ON: custom elements
// defined, reveal, slideshow timing / pause / dots, marquee loop period and
// hidden duplicates, scene switching, keyboard order, console errors.
//   node tools/preview/render.mjs && node tools/preview/behaviour.mjs
import { serve } from './serve.mjs';
import { launch } from './browser.mjs';
const { server, origin } = await serve();
const browser = await launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push('console: ' + m.text()));
page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/favicon.ico') && errors.push('HTTP ' + r.status() + ' ' + r.url()));
await page.setViewport({ width: 1440, height: 1000 });
await page.evaluateOnNewDocument(() => {
  window.__cls = 0;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
});
await page.goto(origin + '/tools/preview/out/index.html', { waitUntil: 'load' });
const q = (fn, ...a) => page.evaluate(fn, ...a);
await new Promise((r) => setTimeout(r, 1500));
console.log('CLS after load (no scrolling):', (await page.evaluate(() => window.__cls)).toFixed(4));
console.log('hero bottom vs fold:', await page.evaluate(() => Math.round(document.querySelector('pl-hero').getBoundingClientRect().bottom) + ' vs ' + innerHeight));
console.log('pl-motion:', await q(() => document.documentElement.classList.contains('pl-motion')));
console.log('custom elements:', await q(() => ['pl-hero', 'pl-marquee', 'pl-backdrop', 'product-form'].map((n) => n + '=' + !!customElements.get(n)).join(' ')));
await new Promise((r) => setTimeout(r, 800));
console.log('revealed above fold:', await q(() => document.querySelectorAll('.pl-rv.is-in').length), '/', await q(() => document.querySelectorAll('.pl-rv').length));
const slide = () => q(() => [...document.querySelectorAll('.pl-hslide')].findIndex((s) => s.classList.contains('is-on')));
console.log('slide t0:', await slide());
await new Promise((r) => setTimeout(r, 4200));
console.log('slide t+4.2s:', await slide(), 'aria-hidden on active:', await q(() => document.querySelector('.pl-hslide.is-on').hasAttribute('aria-hidden')));
await page.click('.pl-hdots__toggle');
const s1 = await slide();
await new Promise((r) => setTimeout(r, 4200));
console.log('after pause, slide unchanged:', s1 === (await slide()), 'label:', await q(() => document.querySelector('.pl-hdots__toggle').getAttribute('aria-label')));
await page.click('.pl-hdots__dot[data-go="2"]');
console.log('dot 3 -> slide', await slide(), 'aria-current:', await q(() => document.querySelector('.pl-hdots__dot[data-go="2"]').getAttribute('aria-current')));
console.log('marquee sets:', await q(() => document.querySelectorAll('.pl-revset').length), 'hidden copies:', await q(() => document.querySelectorAll('.pl-revset[aria-hidden="true"][inert]').length),
  'anim:', await q(() => getComputedStyle(document.querySelector('.pl-revtrack')).animationName + ' ' + getComputedStyle(document.querySelector('.pl-revtrack')).animationDuration));
console.log('period check (set width vs half track):', await q(() => { const t = document.querySelector('.pl-revtrack'); const s = document.querySelector('.pl-revset'); return s.offsetWidth + ' vs ' + t.scrollWidth / 2; }));
await page.click('.pl-revhead__toggle');
console.log('marquee paused class:', await q(() => document.querySelector('pl-marquee').classList.contains('is-paused')));
await q(() => window.scrollTo(0, document.body.scrollHeight));
await new Promise((r) => setTimeout(r, 1500));
console.log('revealed after scroll:', await q(() => document.querySelectorAll('.pl-rv.is-in').length), '/', await q(() => document.querySelectorAll('.pl-rv').length),
  'scene:', await q(() => document.querySelector('pl-backdrop').dataset.d));
// keyboard: tab order reaches add-to-cart with a name
await q(() => window.scrollTo(0, 0));
const names = [];
for (let i = 0; i < 60; i++) {
  await page.keyboard.press('Tab');
  names.push(await q(() => { const a = document.activeElement; return a.tagName + ':' + (a.getAttribute('aria-label') || a.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)); }));
}
console.log('focus order sample:', names.slice(0, 60).join(' | '));
// ---- theme editor simulation ----
await page.mouse.move(5, 5); // earlier clicks left the cursor over the hero (a real hover hold)
await q(() => { window.Shopify.designMode = true; window.scrollTo(0, 0); });
const editor = await q(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  // 1. Re-render: the editor swaps a section's HTML (old custom element disconnects, new one connects).
  const wrap = document.querySelector('pl-hero').closest('.shopify-section');
  const html = wrap.innerHTML;
  wrap.innerHTML = html;
  wrap.dispatchEvent(new CustomEvent('shopify:section:load', { bubbles: true, detail: { sectionId: wrap.id } }));
  await wait(4200);
  const slides = [...wrap.querySelectorAll('.pl-hslide')];
  out.rerenderAutoplays = slides.findIndex((s) => s.classList.contains('is-on')) !== 0;
  // 2. Selecting a slide block shows it and holds autoplay; deselect resumes.
  slides[2].dispatchEvent(new CustomEvent('shopify:block:select', { bubbles: true, detail: { load: false } }));
  await wait(4200);
  out.blockSelectShowsSlide3 = slides[2].classList.contains('is-on');
  slides[2].dispatchEvent(new CustomEvent('shopify:block:deselect', { bubbles: true }));
  await wait(4200);
  out.deselectResumes = !slides[2].classList.contains('is-on');
  // 3. Selecting an off-screen combo scrolls the rail to it.
  const rail = document.querySelector('[data-pl-rail]');
  const last = rail.querySelector('.pl-combo:last-child');
  last.dispatchEvent(new CustomEvent('shopify:block:select', { bubbles: true, detail: { load: true } }));
  await wait(300);
  out.railScrolledTo = rail.scrollLeft > 0;
  return out;
});
console.log('editor simulation:', JSON.stringify(editor));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
server.close();
