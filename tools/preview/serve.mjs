// Tiny static server for the preview (file:// blocks crossorigin font
// preloads, which the real storefront serves over https).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

export function serve(port = 0) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://x');
      // Shopify-only routes. The real store serves these; the preview explains.
      if (req.method === 'POST' && url.pathname.startsWith('/cart/add')) {
        return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 1, quantity: 1, preview: true }));
      }
      if (/^\/(products|collections|cart|pages|search)(\/|$)/.test(url.pathname)) {
        return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8">
<title>Preview only</title><body style="font:16px/1.6 system-ui;max-width:560px;margin:15vh auto;padding:0 20px">
<h1 style="font-size:22px">Preview only: ${url.pathname}</h1>
<p>This page is served by Shopify. The local preview only renders the homepage sections.
On the dev store this link opens the real ${url.pathname.startsWith('/cart') ? 'cart' : 'page'}${url.pathname.startsWith('/cart') ? ', and Add to cart opens the Dawn cart drawer' : ''}.</p>
<p><a href="/tools/preview/out/index.html">Back to the preview</a></p></body>`);
      }
      const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file.startsWith(root)) return res.writeHead(403).end();
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.listen(port, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

// Run directly (npm run preview)? Compared case-insensitively: Windows
// terminals may report the drive as c:\ or C:\.
const self = fileURLToPath(import.meta.url).toLowerCase();
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === self) {
  const { origin } = await serve(8377);
  console.log(`Preview running. Open:
  ${origin}/tools/preview/out/index.html
  ${origin}/reference/purelane-homepage.html (prototype)
Leave this window open; Ctrl+C to stop.`);
}
