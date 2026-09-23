// Pulls the artwork out of reference/purelane-homepage.html so nothing is
// hand-copied: the four water layers become theme assets, and the base64
// product illustrations become seed images for the dev store.
//   node tools/extract-prototype-assets.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync(new URL('../reference/purelane-homepage.html', import.meta.url), 'utf8');

// Water layers: <div class="wl wl-a"><svg class="sv" ...>...</svg></div>
const layers = [...html.matchAll(/<div class="wl (wl-[a-z])"><svg class="sv"([^>]*)>([\s\S]*?)<\/svg><\/div>/g)];
if (layers.length !== 4) throw new Error(`expected 4 water layers, found ${layers.length}`);
for (const [, name, attrs, body] of layers) {
  const svgAttrs = attrs.replace(/\s*aria-hidden="true"/, '');
  const out = `<svg${svgAttrs}>${body.replace(/\n/g, '')}</svg>\n`;
  writeFileSync(new URL(`../assets/pl-water-${name.slice(3)}.svg`, import.meta.url), out);
  console.log(`assets/pl-water-${name.slice(3)}.svg  ${out.length} bytes`);
}

// Product art: --p-name:url("data:image/svg+xml;base64,...")
mkdirSync(new URL('../store-seed/images/', import.meta.url), { recursive: true });
for (const [, name, b64] of html.matchAll(/--p-([a-z0-9]+):url\("data:image\/svg\+xml;base64,([^"]+)"\)/g)) {
  const svg = Buffer.from(b64, 'base64').toString('utf8');
  writeFileSync(new URL(`../store-seed/images/${name}.svg`, import.meta.url), svg);
  console.log(`store-seed/images/${name}.svg`);
}
