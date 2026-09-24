# QA report

Everything here was produced by scripts in `tools/preview/`, so it can be re-run:

```sh
npm run check                                   # Shopify theme-check
npm run compare                                 # prototype vs build, 4 widths
npm run behaviour                               # motion, editor events, CLS, errors
npm run e2e                                     # click-through: cart, bundles, links, sold out
QA_BEFORE=<checkout of c332441> npm run qa      # this report's images + results.json
```

**Scope, stated plainly:** these checks run the real section files through a local Liquid renderer
(LiquidJS) with the seed data, inside Dawn's own CSS. They show the build matches the prototype and
behaves correctly. They do not replace a run on a Shopify store, where the cart, product pages,
theme editor and Lighthouse get tested for real.

## Results

| Check | Result |
|---|---|
| Theme-check (Shopify's linter) | 0 errors. The 9 warnings are all in stock Dawn files; 0 come from the Purelane files. |
| Prototype vs build, 18 elements × 4 widths (375 / 768 / 1024 / 1440) | 68 measured (4 are hidden at that width by design): 56 identical to 0.1px. The other 12 are the hero price flag, 0.2–1.5px wider or narrower because of the ₹ glyph, and the bundle tiers, 2px shorter because of a prototype bug I didn't copy (below). |
| Click-through (`npm run e2e`), desktop and mobile | 74 of 74 checks passed. Every Add to cart (7 products) keeps you on the page, slides in the cart drawer with an "added" confirmation and bumps the header count. The sold-out product is blocked on the button and in the cart. The header Cart opens the drawer; Escape and clicking outside close it. Every "Shop bundle" (5) opens its product page and adds from it. The full cart page's +/−/empty work, all 21 homepage links resolve, and there are no failed requests. |
| Layout shift on load (CLS) | 0.0000 in 12 of 13 runs. One run measured 0.0004 and never reproduced across cold and warm loads; Google's "good" limit is 0.1. |
| Hero fills the first screen | Bottom edge exactly at the fold (1000 / 1000px) |
| Horizontal page scroll, 375–1920px | None at any of 9 widths |
| Slideshow | Advances every 3.8s. The pause button stops it, dots jump to their slide, and the active slide is exposed to screen readers. |
| Reviews marquee | Seamless loop (set width 1480 = half the track). The duplicate set is hidden from screen readers and keyboard. The pause button works. |
| Theme editor (simulated) | Section re-render restarts cleanly. Selecting a slide shows and holds it; deselecting resumes. Selecting an off-screen combo scrolls to it. |
| Keyboard | Visible focus ring. Add to cart is announced with the product name ("Add to cart, Kitchen cleaner, foaming"). |
| Console errors | None |

## Click-through (local preview)

The local server stands in for the Shopify pages the sections link to, so every button can be
tested. On the store these are Dawn's own product page and cart drawer.

**Add to cart keeps you on the page and slides the cart in** (theme setting *Cart type: Drawer*,
Dawn's built-in behaviour). The confirmation, item count and subtotal are on screen; the header
cart and the full cart page stay as the way back in.

| Desktop | Mobile |
|---|---|
| ![](img/e2e-drawer.jpg) | ![](img/e2e-drawer-mobile.jpg) |

| "Shop bundle" → product page | Full cart page (header → Cart → View cart) | Sold-out product |
|---|---|---|
| ![](img/e2e-product-page.jpg) | ![](img/e2e-cart.jpg) | ![](img/e2e-sold-out.jpg) |

## The five sections (build)

| Desktop (1440px) | Mobile (375px) |
|---|---|
| ![Hero desktop](img/section-hero-1440.jpg) | ![Hero mobile](img/section-hero-375.jpg) |
| ![Reviews desktop](img/section-reviews-1440.jpg) | ![Reviews mobile](img/section-reviews-375.jpg) |
| ![Combos desktop](img/section-combos-1440.jpg) | ![Combos mobile](img/section-combos-375.jpg) |
| ![Bundles desktop](img/section-bundles-1440.jpg) | ![Bundles mobile](img/section-bundles-375.jpg) |
| ![Shop desktop](img/section-shop-1440.jpg) | ![Shop mobile](img/section-shop-375.jpg) |

## Prototype (left) vs build (right)

Hero copy and product stage, 1440px:

![Hero copy](img/vs-hero-copy.png)
![Hero stage](img/vs-hero-stage.png)

Review card, combo card, bundle tier and shop card, 1440px:

![Review card](img/vs-review-card.png)
![Combo card](img/vs-combo-card.png)
![Tier](img/vs-tier.png)
![Shop card](img/vs-shop-card.png)

Mobile, 375px:

![Hero mobile](img/vs-hero-mobile.png)
![Combo mobile](img/vs-combo-card-mobile.png)
![Shop card mobile](img/vs-shop-card-mobile.png)

The shop card shows a bottle in the build but not in the prototype. That is a prototype bug; see
"Prototype bugs" below.

## Required edge cases

The second row of the product grid: a normal product, the **sold-out** product (pill and disabled
button, generated from stock), the product with **no image** (leaf tile), and the **very long title**
(clamped to three lines; the full title is in the link's tooltip and on the product page).

![Edge cases](img/edge-cases.jpg)

## Bugs found in my build, and fixed

### 1. Price row wrapped on mobile cards (real bug)

At 375px, "33% off" dropped to its own line, making every card 12px taller than the design
(361.5px vs the prototype's 349.6px). Cause: I had added `flex-wrap` to the price row; the prototype
lets the label break inside its own box. Fixed by removing it; cards are now 349.6px.
Before (left) / after (right):

![Price wrap before/after](img/fix-price-wrap-375.png)

### 2. Hero jumped after loading (real bug, a Core Web Vitals issue)

The hero was sized with Dawn's `--header-height`. Dawn only sets that after its deferred script
runs, so the hero first painted as tall as the whole screen. The intro text and buttons were pushed
below the fold, then everything jumped up 90px. Measured with the header variable arriving late,
as on a real store: **CLS 0.0313 before, 0 after**, headline movement 90px → 0.

Fix: a two-line inline script measures the hero's own position before it paints, which also
accounts for an announcement bar.

| Before: first paint | Before: after Dawn's script | After (never moves) |
|---|---|---|
| ![](img/cls-before-1.jpg) | ![](img/cls-before-2.jpg) | ![](img/cls-after-2.jpg) |

### 3. Sections depended on Dawn for `box-sizing` (robustness)

Dawn sets `box-sizing` in an inline style in `theme.liquid`, not in its CSS file. My first test
page didn't copy that rule, and every box came out wider (e.g. combo cards 304px instead of 302px).
On a real Dawn store this would have looked fine. The sections now set it themselves, so they
don't break if that inline rule changes. Without Dawn's rule, before (left) / after (right):

![box-sizing before/after](img/fix-box-sizing.png)

### 4. Found while testing locally (tooling, not the theme)

- **Stock Dawn was imported with Windows line endings.** 358 files differed from upstream, which
  would have made every diff noisy. The history was rebuilt and verified byte-identical to Dawn
  v16.0.0, and `.gitattributes` now prevents it.
- **Preview server:**
  - It didn't start when the terminal reported the drive as `c:`.
  - It failed silently when an old copy still held the port.
  - Add to cart spun forever because the mock page lacked `window.routes`, which Shopify prints
    on real pages.
  - It had no header, cart or product pages, so Add to cart and "Shop bundle" had nowhere to go.
    It now has all three, and `npm run e2e` clicks through them.
  - The first version of the preview cart drawer had two bugs, both caught by the click-through.
    With 7 items on a phone, the checkout buttons were pushed off-screen; the item list now scrolls
    and the buttons stay pinned. The dimmed overlay behind it was 0×0px because Dawn hides every
    empty `<div>`, the same Dawn rule the backdrop had to work around.

  All of these are fixed.

## Prototype bugs I deliberately did not copy

**Shop images are invisible at desktop.** In the prototype the first four product images are empty
elements measuring **0 × 0 px**. Only the inline-SVG copies of the same products show a bottle.
Prototype (left) / build (right):

![Empty image](img/proto-bug-empty-image.png)

**A stray box around the tier quantity.** A rule meant for the product page's quantity picker
(`.qty`) also matches the bundle tier's number, drawing a border with the text touching its edge.
Prototype (left) / build (right):

![qty box](img/proto-bug-qty-box.png)

**The reviews marquee jumps once per loop.** Measured with motion on: in the prototype one set of
reviews is 1480px, but the animation moves 1474px, a 6px jump every 52s. In the build both are
1480px.

**Small text fails contrast (WCAG AA needs 4.5:1).** Measured on the card background:

| Text | Prototype | Build |
|---|---|---|
| Section kicker ("Pre-built to save you money") | 3.76 | 5.11 |
| Price flag label ("Single bottle") | 3.56 | 5.13 |
| Card rating ("★ 4.8") | 3.56 | 5.13 |

Only small text changed. Large display text keeps the design colours, which already pass at their
size.

## Accessibility captures

Keyboard focus on the hero buttons, and on a product's Add to cart:

![Focus hero](img/focus-hero-cta.png) ![Focus add to cart](img/focus-add-to-cart.png)

With "reduce motion" switched on, the reviews marquee becomes a still row you can swipe:

![Reduced motion](img/reduced-motion-reviews.jpg)

Raw numbers from the last run: [results.json](results.json).
