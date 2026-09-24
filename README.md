# Purelane on Shopify (Dawn)

The Purelane prototype homepage (`reference/purelane-homepage.html`) rebuilt as production
sections on stock Dawn v16.0.0.

**Live store:** https://purelane-ryan.myshopify.com (password in the submission email).

| # | Section | File | Anchor |
|---|---|---|---|
| 01 | Hero | `sections/pl-hero.liquid` | – |
| 02 | Shop / product grid | `sections/pl-product-grid.liquid` | `#shop` |
| 03 | Best-selling combos | `sections/pl-combos.liquid` | `#combos` |
| 04 | Bundles | `sections/pl-bundles.liquid` | `#bundles` |
| 05 | Reviews rail | `sections/pl-reviews.liquid` | `#reviews` |
| – | Water backdrop (shared) | `sections/pl-backdrop.liquid` | – |

- **[NOTES.md](NOTES.md):** build notes (what I flagged in the original file, what I changed and
  why, gaps, next steps) and AI workflow notes.
- **[docs/qa/REPORT.md](docs/qa/REPORT.md):** test results, live-store and prototype-vs-build
  screenshots, before/after evidence.

## Quick start

Needs Node 18+, plus Chrome, Edge or Chromium for the automated checks (or set `CHROME_PATH`).

```sh
git clone https://github.com/ryang030403/Purelane.git
cd Purelane
npm install
npm run preview      # then open http://127.0.0.1:8377/ and keep this terminal open
```

In a second terminal:

```sh
npm run check        # Shopify theme-check: 0 errors (the 9 warnings are all in stock Dawn files)
npm run e2e          # clicks every button and link: add to cart, cart drawer, bundles, sold out (77 checks)
npm run compare      # prototype vs build at 375 / 768 / 1024 / 1440 → tools/preview/out/compare/
npm run behaviour    # motion on: reveal, slideshow, marquee, pause controls, editor events, layout shift
```

Against the real store (every section, images, cart drawer, checkout, sold out, at 1440 and 375px):

```sh
STORE_URL=https://purelane-ryan.myshopify.com STORE_PASSWORD=... npm run live-check
```

In Windows PowerShell, set variables first instead:
`$env:STORE_URL = "https://purelane-ryan.myshopify.com"; $env:STORE_PASSWORD = "..."`, then `npm run live-check`.

**About the preview:** it renders the real section files with LiquidJS and the seed data. A
small local server stands in for the Shopify pages the sections link to: a header with a cart
count, a cart drawer that Dawn's own add-to-cart code opens, product pages and a cart page. On
the store, Dawn's header, product pages and cart drawer take their place. If `npm run preview`
says the port is in use, an older preview is still running. Close that terminal and run it
again; reloading the browser doesn't restart the server.

## What changed in Dawn

The first commit is byte-identical to upstream Dawn v16.0.0, so `git diff 1f18434` shows the
whole build. Everything is new `pl-*` files except these five Dawn files:

| File | Change |
|---|---|
| `layout/theme.liquid` | 2 lines: render `snippets/pl-head.liquid` before `</head>` |
| `config/settings_data.json` | Cart type *Popup notification* → *Drawer*, so Add to cart keeps shoppers on the page |
| `sections/header-group.json` | Announcement text: the design's ticker message instead of "Welcome to our store" |
| `locales/en.default.json` | New `purelane.*` strings (slideshow and marquee controls, counts, editor notes) |
| `templates/index.json` | The homepage: the backdrop and the five sections in the prototype's order |

```
sections/pl-*.liquid        the five sections + backdrop
snippets/pl-*.liquid        shared: head, icon, rule, section head, price, product media,
                            add to cart (Dawn <product-form>), stars, product card
assets/pl-*.css|js          base styles + one CSS file per section, small deferred custom elements
assets/pl-*.woff2           self-hosted Outfit + Inter (latin) + Inter ₹ subset
assets/pl-water-*.svg       backdrop layers, extracted from the prototype by script
store-seed/                 data.json (single source of truth), product images, seed.mjs
tools/                      asset extraction, theme-check, local preview + checks, live-store check
docs/                       QA report and screenshots, font licences
reference/                  the prototype, byte-for-byte as delivered
```

`.shopifyignore` keeps everything outside the theme folders out of `shopify theme push`.

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

## Setup on a new store

These are the steps used for the live store.

1. **Development store.** In the Shopify Partner dashboard, choose **Stores → Add store → Dev**.
   Pick any plan, and leave *Generate test data* unticked.
2. **Rupees and India** (the design is in INR). In the store admin:
   - *Settings → General → Store defaults:* set **Currency display** to **Indian Rupee (INR)**.
     Then use **⋯ → Change currency formatting** to set *HTML without currency* to `₹{{amount}}`
     (no space).
   - *Markets:* **Create market** "India" including India, then set the *United States* market to
     inactive.
   - *Settings → General → Backup Region:* **India**.
   - *Settings → Shipping and delivery:* **Add zone** for India with a free rate, so checkout works.
3. **API access for the seed script.** In the Dev Dashboard (dev.shopify.com), choose
   **Create app**. Set:
   - App URL: `https://example.com` (it isn't used);
   - untick *Embed app in Shopify admin*;
   - Scopes: `write_products,write_files,write_metaobject_definitions,write_metaobjects,write_publications,write_inventory`.

   **Release** it, then **Install** it on the store and copy the **Client ID** and **Secret**
   from *App settings*.
4. **Seed** the definitions, 12 products (one sold out, one with no image, one with a 106-character
   title), 8 bundle products, the `bestsellers` collection and 5 reviews. It is safe to re-run.
   ```sh
   SHOPIFY_STORE=your-store.myshopify.com SHOPIFY_CLIENT_ID=... SHOPIFY_CLIENT_SECRET=... npm run seed
   # or SHOPIFY_ADMIN_TOKEN=shpat_... (legacy custom app) instead of the client ID/secret
   ```
   In PowerShell: `$env:SHOPIFY_STORE = "your-store.myshopify.com"` (and the same for
   `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`), then `npm run seed`.
5. **Theme.** Install the Shopify CLI (`npm install -g @shopify/cli@latest`), then run:
   ```sh
   shopify theme push --store your-store.myshopify.com --unpublished
   ```
   Publish it under *Online Store → Themes*. `templates/index.json` already points the sections at
   the seeded products. For later updates to the live theme, add `--theme <id> --allow-live`.
6. **Check it:** `npm run live-check` with `STORE_URL` and `STORE_PASSWORD` (the password is under
   *Online Store → Preferences*).

**Without the script:** create the definitions under *Settings → Custom data* as in the tables
above, add the products, and fill in the metafields. `store-seed/data.json` holds the exact content.

## Licences

Dawn is © Shopify Inc. under the terms in `LICENSE.md`. Outfit and Inter are under the SIL Open
Font License 1.1 (`docs/licenses/`).
