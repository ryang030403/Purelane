# Purelane on Shopify (Dawn)

The Purelane prototype homepage (`reference/purelane-homepage.html`) rebuilt as production
sections on stock Dawn v16.0.0:

| # | Section | File | Anchor |
|---|---|---|---|
| 01 | Hero | `sections/pl-hero.liquid` | – |
| 02 | Shop / product grid | `sections/pl-product-grid.liquid` | `#shop` |
| 03 | Best-selling combos | `sections/pl-combos.liquid` | `#combos` |
| 04 | Bundles | `sections/pl-bundles.liquid` | `#bundles` |
| 05 | Reviews rail | `sections/pl-reviews.liquid` | `#reviews` |
| – | Water backdrop (shared) | `sections/pl-backdrop.liquid` | – |

Build notes, what was flagged in the original file, and the AI workflow notes are in
**[NOTES.md](NOTES.md)**. Test results with screenshots and before/after evidence are in
**[docs/qa/REPORT.md](docs/qa/REPORT.md)**.

## Quick start

Needs Node 18+ and Chrome, Edge or Chromium (for the automated checks).

```sh
git clone https://github.com/ryang030403/Purelane.git
cd Purelane
npm install
npm run preview      # open http://127.0.0.1:8377/  (keep the terminal open)
```

In a second terminal, run the checks. Each one renders the sections from the repo first:

```sh
npm run check        # Shopify theme-check
npm run e2e          # clicks every button: add to cart, cart drawer, bundles, links (74 checks)
npm run compare      # prototype vs build at 375 / 768 / 1024 / 1440
npm run behaviour    # animations, pause controls, theme-editor events, layout shift
```

To put it on a Shopify store instead, see [Setup](#setup) below.

## What changed in Dawn

Two lines. `layout/theme.liquid` renders `snippets/pl-head.liquid` before `</head>`. One
theme setting also changed: *Cart type* is *Drawer* (was *Popup notification*), so Add to cart keeps
shoppers on the page. Everything
else is new `pl-*` files, plus a `purelane.*` block in `locales/en.default.json` and the homepage
template. The first commit is byte-identical to upstream Dawn v16.0.0, so `git diff 1f18434`
shows the whole build.

```
sections/pl-*.liquid        the five sections + backdrop
snippets/pl-*.liquid        shared: head, icon, rule, section head, price, product media,
                            add to cart (Dawn <product-form>), stars, product card
assets/pl-*.css|js          one CSS file per section, small deferred custom elements
assets/pl-*.woff2           self-hosted Outfit + Inter (latin) + Inter ₹ subset
assets/pl-water-*.svg       backdrop layers, extracted from the prototype by script
store-seed/                 data.json (single source of truth), images, seed.mjs
tools/                      extraction, rasterising, theme-check, preview + comparison harness
reference/                  the prototype, byte-for-byte as delivered
```

## Data model

Everything product-related comes from Shopify. Where no native field exists:

**Product metafields** (namespace `custom`, all pinned in admin)

| Key | Type | Used by | Purpose |
|---|---|---|---|
| `custom.badge` | Single line text | Product grid | Card pill ("Best seller", "New"). "Sold out" replaces it automatically. |
| `custom.benefit` | Single line text | Combos | One-line benefit under each item in a box. A combo block can override it per item. |
| `custom.cutout_image` | File (image) | Hero | Tall bottle-only image for the price stage. Falls back to the featured image. |
| `custom.bundle_items` | List of products | Combos, Bundles | What is in a bundle, in display order. |
| `custom.bundle_size` | Integer (min 1) | Combos, Bundles | "Pick any N" size. Falls back to the number of bundle items. |
| `custom.summary` | Multi-line text | Combos | Short card copy. Falls back to the product description. |

**Standard product metafields:** `reviews.rating` and `reviews.rating_count`, the ones review apps
(Judge.me, Okendo and others) already write. They drive the card rating.

**Metaobject** `customer_review` (storefront access: public read)

| Field | Type |
|---|---|
| `rating` | Rating (1–5), required |
| `title` | Single line text |
| `body` | Multi-line text, required |
| `author` | Single line text, required |
| `verified` | Boolean |
| `product` | Product reference |
| `product_label` | Single line text (short name on the card; defaults to the product title) |

Combos and "pick any N" tiers are **real products** (e.g. "Kitchen essentials" ₹499, compare-at
₹897), so price, saving, stock and link all come from the platform. Savings, percentages and
"₹174 per product" are calculated in Liquid, never typed.

## Setup

1. **Store:** Partner account → development store on Dawn. In *Settings → General*, set the
   currency to **INR** and the money format ("HTML without currency") to `₹{{amount}}`.
2. **API access:** create an app in the Dev Dashboard, install it on the dev store with scopes
   `write_products, write_files, write_metaobject_definitions, write_metaobjects,
   write_publications, write_inventory`.
3. **Seed:**
   ```sh
   npm install
   SHOPIFY_STORE=your-store.myshopify.com SHOPIFY_ADMIN_TOKEN=shpat_... npm run seed
   # or SHOPIFY_CLIENT_ID=... SHOPIFY_CLIENT_SECRET=... npm run seed
   ```
   It creates the definitions above, 12 products (one sold out, one with no image, one with a
   106-character title), 8 bundle products, the `bestsellers` collection and 5 reviews. It is safe to
   re-run.
4. **Theme:** `shopify theme push` (or `shopify theme dev`). `templates/index.json` already wires
   the sections to the seeded handles.

**Manual alternative to step 3:** create the definitions in *Settings → Custom data* as in the
tables above, add products, and fill the metafields. `store-seed/data.json` holds the exact content.

## Checks

```sh
npm run check       # Shopify theme-check (0 errors; only stock Dawn's 9 warnings remain)
npm run preview     # local preview at http://127.0.0.1:8377/ (keep the terminal open)
npm run e2e         # clicks every button and link: add to cart, bundles, cart, sold out
npm run compare     # prototype vs build, 375/768/1024/1440 → tools/preview/out/compare/
npm run behaviour   # motion on: reveal, slideshow, marquee, CLS, focus order, editor events
```

The preview renders the real section files with LiquidJS and the seed data. A small local server
stands in for the Shopify pages the sections link to: a header with a cart count, a cart drawer
that Dawn's own add-to-cart code opens, product pages and a cart page. On the store, Dawn's
header, product pages and cart drawer take their place.
It is a harness, not Shopify; the dev store is the real test (see the gaps in NOTES.md).

If `npm run preview` says the port is in use, an older preview is still running. Close that
terminal (or press Ctrl+C in it) and run it again. Reloading the browser does not restart it.

Dawn is © Shopify, MIT licensed (`LICENSE.md`). Outfit and Inter are under the SIL Open Font License.
