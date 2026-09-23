// Shopify product media must be raster, so the SVG product art extracted from
// the prototype is rendered to transparent PNGs at 1200px tall (enough for
// every srcset width the sections request).
//   node tools/rasterize-seed-images.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const dir = new URL('../store-seed/images/', import.meta.url);
for (const file of readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
  const svg = readFileSync(new URL(file, dir), 'utf8');
  const png = new Resvg(svg, { fitTo: { mode: 'height', value: 1200 }, background: 'rgba(0,0,0,0)' }).render().asPng();
  writeFileSync(new URL(file.replace('.svg', '.png'), dir), png);
  console.log(file.replace('.svg', '.png'), `${Math.round(png.length / 1024)} KB`);
}
