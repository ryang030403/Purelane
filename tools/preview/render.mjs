// Local preview: renders the real pl-* sections with LiquidJS against the
// seed data (store-seed/data.json), inside a Dawn-like shell (Dawn's
// base.css, html font-size 62.5%, an in-flow header), so layout and CSS
// can be checked against the prototype without a Shopify store.
//
// It is a harness, not Shopify: Shopify-only tags/filters are shimmed to
// produce the same shape of output. The store is the real test.
//
//   node tools/preview/render.mjs   -> tools/preview/out/index.html
import { Liquid, Tag, Drop } from 'liquidjs';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromeCss, chromeHtml } from './chrome.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.join(root, 'tools/preview/out');
mkdirSync(out, { recursive: true });
const rel = (p) => path.relative(out, path.join(root, p)).split(path.sep).join('/');

const data = JSON.parse(readFileSync(path.join(root, 'store-seed/data.json'), 'utf8'));
const locale = JSON.parse(readFileSync(path.join(root, 'locales/en.default.json'), 'utf8'));
const template = JSON.parse(readFileSync(path.join(root, 'templates/index.json'), 'utf8'));

/* ---------------- data -> Liquid-shaped objects ---------------- */
const pngSize = (file) => {
  const buf = readFileSync(path.join(root, 'store-seed/images', `${file}.png`));
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};
const image = (file, alt) => {
  if (!file) return null;
  const { width, height } = pngSize(file);
  return { src: rel(`store-seed/images/${file}.png`), width, height, aspect_ratio: width / height, alt: alt || '' };
};
const cents = (s) => Math.round(parseFloat(s) * 100);

let nextId = 1000;
const products = new Map();
const makeProduct = (p) => {
  const id = nextId++;
  const featured = image(p.image, p.title);
  const prod = {
    id,
    handle: p.handle,
    title: p.title,
    url: `/products/${p.handle}`,
    description: `<p>${p.description || ''}</p>`,
    price: cents(p.price),
    compare_at_price: p.compare_at_price ? cents(p.compare_at_price) : null,
    price_varies: false,
    available: !p.sold_out,
    has_only_default_variant: true,
    selected_or_first_available_variant: { id: id * 10, available: !p.sold_out },
    featured_image: featured,
    metafields: {
      custom: {
        badge: p.badge ? { value: p.badge } : undefined,
        benefit: p.benefit ? { value: p.benefit } : undefined,
        cutout_image: p.cutout ? { value: { preview_image: image(p.cutout, p.title) } } : undefined,
        bundle_size: p.size ? { value: p.size } : undefined,
        summary: p.summary ? { value: p.summary } : undefined,
      },
      reviews: {
        rating: p.rating ? { value: { rating: p.rating, scale_min: 1, scale_max: 5 } } : undefined,
        rating_count: p.rating_count ? { value: p.rating_count } : undefined,
      },
    },
  };
  products.set(p.handle, prod);
  return prod;
};
data.products.forEach(makeProduct);
data.bundles.forEach(makeProduct);
for (const b of data.bundles) {
  if (b.items) products.get(b.handle).metafields.custom.bundle_items = { value: b.items.map((h) => products.get(h)) };
}
const collections = new Map(
  data.collections.map((c) => [
    c.handle,
    { handle: c.handle, title: c.title, products: c.products.map((h) => products.get(h)), products_count: c.products.length },
  ])
);
const reviews = data.reviews.map((r) => ({
  handle: r.handle,
  rating: { value: { rating: r.rating, scale_min: 1, scale_max: 5 } },
  title: { value: r.title },
  body: { value: r.body },
  author: { value: r.author },
  verified: { value: r.verified },
  product: { value: products.get(r.product) },
  product_label: { value: r.product_label },
}));

/* ---------------- engine ---------------- */
const engine = new Liquid({
  root: [path.join(root, 'sections'), path.join(root, 'snippets')],
  partials: path.join(root, 'snippets'),
  extname: '.liquid',
  strictFilters: true,
  jsTruthy: false,
});

// {% schema %} ... {% endschema %} renders nothing.
engine.registerTag(
  'schema',
  class extends Tag {
    constructor(token, remain, liquid) {
      super(token, remain, liquid);
      while (remain.length) if (remain.shift().name === 'endschema') return;
    }
    *render() {}
  }
);
// {% style %} -> <style>
engine.registerTag(
  'style',
  class extends Tag {
    constructor(token, remain, liquid) {
      super(token, remain, liquid);
      this.tpls = [];
      const stream = liquid.parser.parseStream(remain);
      stream.on('tag:endstyle', () => stream.stop()).on('template', (t) => this.tpls.push(t)).on('end', () => {
        throw new Error('style not closed');
      });
      stream.start();
    }
    *render(ctx, emitter) {
      emitter.write('<style>');
      yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
      emitter.write('</style>');
    }
  }
);
// {% form 'product', product, id: ..., class: ... %} -> <form action="/cart/add">
engine.registerTag(
  'form',
  class extends Tag {
    constructor(token, remain, liquid) {
      super(token, remain, liquid);
      this.args = token.args;
      this.tpls = [];
      const stream = liquid.parser.parseStream(remain);
      stream.on('tag:endform', () => stream.stop()).on('template', (t) => this.tpls.push(t)).on('end', () => {
        throw new Error('form not closed');
      });
      stream.start();
    }
    *render(ctx, emitter) {
      const attrs = [];
      for (const m of this.args.matchAll(/([\w-]+):\s*('[^']*'|[\w.]+)/g)) {
        const v = m[2].startsWith("'") ? m[2].slice(1, -1) : yield this.liquid.evalValue(m[2], ctx);
        attrs.push(`${m[1]}="${v}"`);
      }
      emitter.write(`<form method="post" action="/cart/add" accept-charset="UTF-8" enctype="multipart/form-data" ${attrs.join(' ')}>`);
      emitter.write('<input type="hidden" name="form_type" value="product"><input type="hidden" name="utf8" value="✓">');
      yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
      emitter.write('</form>');
    }
  }
);

const lookup = (key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), locale);
engine.registerFilter('t', (key, ...args) => {
  let v = lookup(key);
  const vars = {};
  for (const a of args) if (Array.isArray(a)) vars[a[0]] = a[1];
  if (v && typeof v === 'object') v = vars.count === 1 ? v.one : v.other;
  if (typeof v !== 'string') return `translation missing: ${key}`;
  return v.replace(/{{\s*(\w+)\s*}}/g, (_, k) => (vars[k] ?? ''));
});
// Shopify: integer / integer is integer division (349 / 2 = 174).
engine.registerFilter('divided_by', (a, b) =>
  Number.isInteger(Number(a)) && Number.isInteger(Number(b)) ? Math.floor(Number(a) / Number(b)) : Number(a) / Number(b)
);
engine.registerFilter('asset_url', (f) => rel(`assets/${f}`));
engine.registerFilter('stylesheet_tag', (u) => `<link href="${u}" rel="stylesheet" type="text/css" media="all" />`);
engine.registerFilter('inline_asset_content', (f) => readFileSync(path.join(root, 'assets', f), 'utf8'));
engine.registerFilter('handle', (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
engine.registerFilter('image_url', (img) => img);
engine.registerFilter('image_tag', (img, ...args) => {
  const o = {};
  for (const a of args) if (Array.isArray(a)) o[a[0]] = a[1];
  const widths = String(o.widths || '').split(',').filter(Boolean);
  const srcset = widths.map((w) => `${img.src}?width=${w} ${w}w`).join(', ');
  const attr = (k, v) => (v === undefined || v === null || v === false ? '' : ` ${k}="${v}"`);
  return `<img src="${img.src}"${attr('alt', o.alt ?? img.alt)}${srcset ? attr('srcset', srcset) : ''}${attr('sizes', o.sizes)} width="${img.width}" height="${img.height}"${attr('loading', o.loading)}${attr('fetchpriority', o.fetchpriority)}${attr('decoding', o.decoding)}${attr('class', o.class)}>`;
});
// Shopify INR store format "₹{{amount}}", western grouping.
engine.registerFilter('money_without_trailing_zeros', (c) => {
  const n = Number(c) / 100;
  const s = Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2 });
  return `₹${s}`;
});
engine.registerFilter('placeholder_svg_tag', (name, cls) => `<svg class="${cls || ''}" viewBox="0 0 100 100"><rect width="100" height="100"/></svg>`);

/* ---------------- render the template ---------------- */
const resolveSetting = (key, value) => {
  if (key === 'collection') return collections.get(value);
  if (key === 'product') return products.get(value);
  if (key === 'products') return (value || []).map((h) => products.get(h));
  return value;
};
const resolveSettings = (settings = {}) =>
  Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, resolveSetting(k, v)]));

let html = '';
let index = 0;
for (const id of template.order) {
  const def = template.sections[id];
  index++;
  const blocks = (def.block_order || []).map((bid) => ({
    id: bid,
    type: def.blocks[bid].type,
    settings: resolveSettings(def.blocks[bid].settings),
    shopify_attributes: `data-block-id="${bid}"`,
  }));
  const section = { id: `template--index__${id}`, index, settings: resolveSettings(def.settings), blocks };
  if (def.type === 'pl-reviews') section.settings.reviews = [];
  const body = await engine.renderFile(`${def.type}`, {
    section,
    request: { design_mode: false, page_type: 'index' },
    routes: { all_products_collection_url: '/collections/all' },
    shop: { metaobjects: { customer_review: { values: reviews } } },
  });
  html += `<section id="shopify-section-${section.id}" class="shopify-section pl-section">${body}</section>\n`;
}

const head = await engine.renderFile('pl-head', { request: { page_type: 'index' } });
const page = `<!doctype html>
<html class="js" lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Purelane preview</title>
<style>
  /* Minimal stand-in for the variables Dawn prints in theme.liquid. */
  :root { --font-body-scale: 1; --font-heading-scale: 1; --color-foreground: 18,18,18; --color-background: 255,255,255;
    --focused-base-outline: .2rem solid rgba(18,18,18,.5); --focused-base-outline-offset: .3rem; --focused-base-box-shadow: none; }
  /* Copied from the inline <style> in Dawn's layout/theme.liquid. */
  *, *::before, *::after { box-sizing: inherit; }
  html { box-sizing: border-box; font-size: calc(var(--font-body-scale) * 62.5%); height: 100%; }
  body { display: flex; flex-direction: column; min-height: 100%; margin: 0; font-size: 1.5rem;
    letter-spacing: .06rem; line-height: calc(1 + .8 / var(--font-body-scale)); font-family: system-ui; }
  @media screen and (min-width: 750px) { body { font-size: 1.6rem; } }
  ${chromeCss}
</style>
<link rel="stylesheet" href="${rel('assets/base.css')}">
${head}
<script>
  window.Shopify = { designMode: false };
  // Printed by Dawn's theme.liquid on a real store; product-form.js needs it.
  window.routes = { cart_add_url: '/cart/add', cart_change_url: '/cart/change', cart_update_url: '/cart/update', cart_url: '/cart', predictive_search_url: '/search/suggest' };
</script>
<script src="${rel('assets/constants.js')}" defer></script>
<script src="${rel('assets/pubsub.js')}" defer></script>
<script src="${rel('assets/global.js')}" defer></script>
</head>
<body class="gradient">
${chromeHtml}
<main id="MainContent" class="content-for-layout" role="main">
${html}
</main>
</body>
</html>`;
writeFileSync(path.join(out, 'index.html'), page);

// Catalogue for the preview server's product pages and cart.
const catalog = [...products.values()].map((p) => ({
  handle: p.handle,
  title: p.title,
  price: p.price,
  compare_at_price: p.compare_at_price,
  available: p.available,
  variant_id: p.selected_or_first_available_variant.id,
  description: p.description,
  image: p.featured_image && '/' + path.relative(root, path.join(out, p.featured_image.src)).split(path.sep).join('/'),
  items: (p.metafields.custom.bundle_items?.value || []).map((i) => i.handle),
}));
writeFileSync(path.join(out, 'catalog.json'), JSON.stringify(catalog, null, 2));
console.log(`wrote ${path.relative(root, path.join(out, 'index.html'))} (${Math.round(page.length / 1024)} KB)`);
