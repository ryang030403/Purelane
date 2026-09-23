// Local preview server. Serves the rendered homepage and simulates the few
// Shopify routes the sections link to, so every button can be clicked:
//   POST /cart/add        add a variant (same form Dawn's product-form sends)
//   GET  /cart.js         cart JSON (drives the header count)
//   GET  /cart            cart page with quantity controls
//   GET  /products/:h     product page for every product and bundle
// This is a stand-in for Shopify; the dev store is the real test.
//
//   npm run preview   ->  http://127.0.0.1:8377/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { HOME, chromeCss, chromeHtml } from './chrome.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' };

const catalogFile = path.join(root, 'tools/preview/out/catalog.json');
const loadCatalog = () => (existsSync(catalogFile) ? JSON.parse(readFileSync(catalogFile, 'utf8')) : []);
const money = (c) => `₹${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Purelane preview</title>
<style>${chromeCss}
  body { margin: 0; font: 16px/1.6 system-ui, sans-serif; color: #241a3d; background: #f4f0fb; }
  main { max-width: 980px; margin: 32px auto; padding: 0 20px; }
  h1 { font: 800 28px/1.15 system-ui, sans-serif; margin: 0 0 8px; text-transform: uppercase; }
  .card { background: #fff; border-radius: 20px; padding: 24px; box-shadow: 0 12px 30px rgba(58,44,112,.08); }
  .pdp { display: grid; gap: 28px; grid-template-columns: minmax(0,1fr) minmax(0,1.2fr); align-items: start; }
  .pdp img { width: 100%; max-height: 420px; object-fit: contain; background: #f6f3fb; border-radius: 16px; }
  .noimg { display: grid; place-items: center; height: 300px; border: 1px dashed #bbb; border-radius: 16px; color: #777; }
  .price { font: 800 26px system-ui; margin: 10px 0; } .price s { font-size: 15px; color: #888; font-weight: 500; margin-left: 8px; }
  .btn { display: inline-flex; align-items: center; justify-content: center; height: 46px; padding: 0 24px; border-radius: 999px; border: 0;
    background: linear-gradient(135deg,#00706a,#004b46); color: #fff; font: 700 13px system-ui; letter-spacing: .12em; text-transform: uppercase; cursor: pointer; text-decoration: none; }
  .btn[disabled] { opacity: .5; cursor: not-allowed; } .btn.ghost { background: #fff; color: #01423b; border: 1px solid #cfc6e6; }
  .items { display: flex; gap: 12px; flex-wrap: wrap; margin: 12px 0; } .items a { font-size: 14px; padding: 6px 12px; border-radius: 999px; background: #f1ecfa; color: inherit; }
  table { width: 100%; border-collapse: collapse; } td, th { padding: 12px 8px; border-bottom: 1px solid #eee; text-align: left; vertical-align: middle; }
  td img { width: 56px; height: 56px; object-fit: contain; background: #f6f3fb; border-radius: 10px; }
  .qty a { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; border: 1px solid #ccc; color: inherit; text-decoration: none; }
  .note { font-size: 13px; color: #6b6480; } .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 20px; }
  @media (max-width: 700px) { .pdp { grid-template-columns: 1fr; } }
</style></head><body>${chromeHtml}<main>${body}</main></body></html>`;

// One cart per server process (the preview has a single visitor: you).
const cart = new Map(); // variant_id -> quantity
const cartJson = (catalog) => {
  const items = [...cart].map(([id, quantity]) => {
    const p = catalog.find((x) => x.variant_id === id);
    return { id, quantity, handle: p.handle, product_title: p.title, price: p.price, line_price: p.price * quantity, image: p.image, url: `/products/${p.handle}` };
  });
  return { item_count: items.reduce((n, i) => n + i.quantity, 0), total_price: items.reduce((n, i) => n + i.line_price, 0), items };
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
// Dawn posts multipart FormData; the product page posts urlencoded.
const field = (body, name) => {
  const m = body.match(new RegExp(`name="${name}"\\r?\\n\\r?\\n([^\\r\\n]*)`)) || body.match(new RegExp(`(?:^|&)${name}=([^&]*)`));
  return m ? decodeURIComponent(m[1]) : null;
};

function productPage(p, catalog) {
  const inBox = p.items.map((h) => catalog.find((x) => x.handle === h)).filter(Boolean);
  return page(
    p.title,
    `<div class="card pdp">
      ${p.image ? `<img src="${p.image}" alt="${esc(p.title)}">` : '<div class="noimg">No product image</div>'}
      <div>
        <h1>${esc(p.title)}</h1>
        <div class="price">${money(p.price)}${p.compare_at_price > p.price ? `<s>${money(p.compare_at_price)}</s>` : ''}</div>
        ${p.description}
        ${inBox.length ? `<p class="note">In this box:</p><div class="items">${inBox.map((i) => `<a href="/products/${i.handle}">${esc(i.title)}</a>`).join('')}</div>` : ''}
        <form method="post" action="/cart/add" class="row">
          <input type="hidden" name="id" value="${p.variant_id}"><input type="hidden" name="return_to" value="/cart">
          <button class="btn" type="submit" ${p.available ? '' : 'disabled'}>${p.available ? 'Add to cart' : 'Sold out'}</button>
          <a class="btn ghost" href="${HOME}">Back to homepage</a>
        </form>
        <p class="note">Local preview page. On the store this is Dawn's product page.</p>
      </div>
    </div>`
  );
}

function cartPage(catalog) {
  const c = cartJson(catalog);
  const rows = c.items
    .map(
      (i) => `<tr><td>${i.image ? `<img src="${i.image}" alt="">` : ''}</td>
      <td><a href="${i.url}">${esc(i.product_title)}</a><br><span class="note">${money(i.price)} each</span></td>
      <td class="qty"><a href="/cart/change?id=${i.id}&quantity=${i.quantity - 1}" aria-label="Decrease">−</a> <b>${i.quantity}</b>
        <a href="/cart/change?id=${i.id}&quantity=${i.quantity + 1}" aria-label="Increase">+</a></td>
      <td><b>${money(i.line_price)}</b></td></tr>`
    )
    .join('');
  return page(
    'Cart',
    `<div class="card"><h1>Your cart</h1>
      ${c.items.length ? `<table><thead><tr><th></th><th>Product</th><th>Quantity</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="row"><div class="price">Total ${money(c.total_price)}</div></div>
      <div class="row"><a class="btn" href="${HOME}#shop">Keep shopping</a><a class="btn ghost" href="/cart/clear">Empty cart</a></div>`
      : `<p>Your cart is empty.</p><div class="row"><a class="btn" href="${HOME}#shop">Shop products</a></div>`}
      <p class="note">Local preview cart. On the store, Add to cart opens Dawn's cart drawer and checkout is Shopify's.</p></div>`
  );
}

export function serve(port = 0) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://x');
      const catalog = loadCatalog();
      const html = (status, body) => res.writeHead(status, { 'content-type': types['.html'], 'cache-control': 'no-store' }).end(body);
      const json = (status, body) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
      const redirect = (to) => res.writeHead(303, { location: to }).end();

      if (url.pathname === '/' || url.pathname === '/index.html') return redirect(HOME);
      if (url.pathname === '/favicon.ico') return res.writeHead(204).end();

      if (req.method === 'POST' && url.pathname.startsWith('/cart/add')) {
        const body = await readBody(req);
        const id = Number(field(body, 'id'));
        const qty = Math.max(1, Number(field(body, 'quantity')) || 1);
        const p = catalog.find((x) => x.variant_id === id);
        const wantsJson = (req.headers.accept || '').includes('json') || req.headers['x-requested-with'] === 'XMLHttpRequest';
        if (!p) return json(404, { status: 404, message: 'Not found', description: 'This product does not exist.' });
        if (!p.available) return json(422, { status: 422, message: 'Sold out', description: `${p.title} is sold out.` });
        cart.set(id, (cart.get(id) || 0) + qty);
        if (!wantsJson) return redirect(field(body, 'return_to') || '/cart');
        return json(200, { id, quantity: cart.get(id), product_title: p.title, price: p.price, url: `/products/${p.handle}` });
      }
      if (url.pathname === '/cart.js') return json(200, cartJson(catalog));
      if (url.pathname === '/cart/change') {
        const id = Number(url.searchParams.get('id'));
        const q = Number(url.searchParams.get('quantity'));
        if (q > 0) cart.set(id, q);
        else cart.delete(id);
        return redirect('/cart');
      }
      if (url.pathname === '/cart/clear') {
        cart.clear();
        return redirect('/cart');
      }
      if (url.pathname === '/cart') return html(200, cartPage(catalog));

      const m = url.pathname.match(/^\/products\/([\w-]+)$/);
      if (m) {
        const p = catalog.find((x) => x.handle === m[1]);
        return p ? html(200, productPage(p, catalog)) : html(404, page('Not found', `<div class="card"><h1>Product not found</h1><p>No product with the handle “${esc(m[1])}”.</p></div>`));
      }
      if (/^\/(collections|pages|search|account)(\/|$)/.test(url.pathname)) {
        return html(200, page('Preview only', `<div class="card"><h1>Preview only</h1><p><code>${esc(url.pathname)}</code> is a Shopify page that exists on the dev store, not in the local preview.</p><div class="row"><a class="btn" href="${HOME}">Back to homepage</a></div></div>`));
      }

      const file = path.join(root, decodeURIComponent(url.pathname));
      if (!file.startsWith(root)) return res.writeHead(403).end();
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
      } catch {
        html(404, page('Not found', `<div class="card"><h1>Not found</h1><p><code>${esc(url.pathname)}</code></p></div>`));
      }
    });
    server.on('error', (e) => {
      if (e.code !== 'EADDRINUSE') throw e;
      console.error(
        [
          '',
          `Port ${port} is already in use: an older preview is probably still running.`,
          'Close that terminal (or press Ctrl+C in it), or in PowerShell run:',
          `  Get-Process -Id (Get-NetTCPConnection -LocalPort ${port}).OwningProcess | Stop-Process`,
          'then run npm run preview again.',
          '',
        ].join('\n')
      );
      process.exit(1);
    });
    server.listen(port, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

// Run directly (npm run preview)? Compared case-insensitively: Windows
// terminals may report the drive as c:\ or C:\.
const self = fileURLToPath(import.meta.url).toLowerCase();
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === self) {
  const { origin } = await serve(8377);
  console.log(
    [
      'Preview running. Open:',
      `  ${origin}/`,
      `  ${origin}/reference/purelane-homepage.html (prototype)`,
      'Leave this window open; Ctrl+C to stop.',
    ].join('\n')
  );
}
