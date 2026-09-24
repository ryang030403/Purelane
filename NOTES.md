# Build notes

## How close it is

I measured it against the prototype, not just eyeballed it. `tools/preview/compare.mjs` renders
the real sections (LiquidJS, seed data, inside Dawn's own `base.css` and inline rules) and measures
matching elements in headless Chrome at 375 / 768 / 1024 / 1440px. Every element checked (hero
copy, title, stage, badges and strip, review card, section heads, combo cards, bundle intro,
tiers, shop cards) matches to within 0.1px, with two exceptions:

- **Hero price flag −1.5px wide at ≥901px.** Outfit has no ₹ glyph (the Google Fonts version
  doesn't either), so ₹ falls back to the system font in both. The residual comes from glyph
  rendering, not layout.
- **Tiers −2px tall.** This is deliberate; see flag 1 below.

Behaviour checks (`tools/preview/behaviour.mjs`, motion on) cover:

- scroll reveal and the scene crossfade;
- slideshow timing, pause and dot state;
- the marquee loop period and its hidden duplicates;
- focus order;
- no console errors;
- CLS 0.0000 on load;
- the hero ending exactly at the fold;
- no horizontal page overflow from 375 to 1920px;
- simulated theme-editor re-render, block select/deselect and scroll-to-block.

## What I'd flag about the original file

1. **Class-name collisions change the design.**
   - A PDP rule `.qty{background…;border…}` also hits the bundle tier's `.qty` and draws a stray
     box around "2 PRODUCTS", with the text touching its left edge. I treated this as a bug and
     didn't reproduce it; it is the one intentional visual difference.
   - `.card{transition:.4s}` comes after `.rv-d1{transition-delay}`. On every card this silently
     replaced the 0.95s staggered reveal with a flat 0.4s. The build runs the intended stagger,
     then hands over to the hover lift.
2. **The first four shop images never render at desktop.** They are empty `<span>`s with no height,
   shrink-wrapped to 0×0 by `place-items:center`. Only the four inline-SVG cards (which repeat the
   same four products) show bottles. The build uses the 122px bottle height those cards used.
3. **The reviews marquee jumps every loop.** One flex `gap` across both copies makes `-50%` land
   6px short of the real period (1474 vs 1480px). Screen readers also hear every review twice, and
   there is no way to pause it.
4. **Two stylesheets fight each other.** A dark V1 sheet sits under a light V2 sheet, so most
   properties are declared twice. Palette find/replace leftovers include comments saying "brand
   green" and "#4b3a8f teal ink" (it is purple), and the primary button is teal on a purple brand.
   Some rules are dead: the depth opacity on `.wl-s` / `.wl-c` is overridden by their own opacity
   keyframes.
5. **Accessibility:**
   - Small grey text (`paper-3`, 3.5–3.8:1) and small amber labels (`#b8701c`, 2.7–3.8:1) fail
     WCAG AA contrast.
   - Autoplaying hero and marquee have no pause control (WCAG 2.2.2).
   - The hero dots are 6px targets with no current state.
   - The rotator is `aria-hidden` around images that carry labels.
   - Reveal-hidden content stays invisible if JS fails.
6. **Performance:**
   - 150KB single file with base64 images in CSS custom properties.
   - About 40KB of inline SVG water with filter IDs (`#cg`, `#wf`, `#wf2`) declared twice.
   - An endless Web Animations `filter` pulse on the hero column repaints a 560px layer every frame.
   - Render-blocking third-party Google Fonts.
7. **Links and behaviour:**
   - The nav rail and footer link to `#voices`, which doesn't exist.
   - "Add to cart" does nothing, and the signup form is `onsubmit="return false"`.
   - The rotator writes a data attribute into the page with `innerHTML`.
8. **Content is inconsistent. These are for the brand to decide, so I left them as merchant
   settings:**
   - "30,000+ happy homes" vs "Loved by 30,000 homes" vs "12 lakh+ homes".
   - ₹1495 vs ₹1,495.
   - "Complete home bundle, 5 products" shows three.
   - "Flat ₹174 per product" when 349/2 is 174.50.

## What I changed in the code and why

- **Resolved cascade, scoped.** The V1+V2 sheets are collapsed into one set of `pl-` prefixed,
  `.pl`-scoped tokens and rules. Dawn already owns `.card`, `.price`, `.badge` and `.button`, and
  nothing leaks either way. The sections set `box-sizing` themselves rather than relying on
  Dawn's inline rule.
- **Real data.** Prices, compare-at prices, stock, ratings, badges, bundle contents and reviews
  come from products, metafields and a metaobject. Savings and percentages are calculated. Per-product
  price is rounded half down, which never overstates the price and reproduces the design's
  174 / 166 / 160.
- **Real cart.** Grid cards use Dawn's own `<product-form>`, so the drawer, count and errors
  behave like the rest of the theme. Sold out gives a disabled button. Multi-variant products
  get a "Choose options" link. Buttons are labelled with the product name.
- **Add to cart keeps shoppers on the page.** The theme's cart type is set to Dawn's built-in
  *Drawer* (Dawn ships with *Popup notification*). Adding from the grid slides in the cart with
  the item, count, subtotal and checkout, and the header cart count updates, with no page change.
  It is a Dawn theme setting, not new UI, so it stays within "a build, not a redesign" and the
  merchant can switch it back under *Theme settings → Cart*.
- **Merchant-editable.** All copy, labels, saving templates (`Save [saving]`), anchors, the
  slide interval and the background depth are settings. Slides, badges, combos and tiers are
  blocks. Reviews are picked and ordered with a metaobject picker.
- **Theme editor.** All JS is custom elements, so re-rendered sections reinitialise and old
  timers and listeners are cleaned up.
  - Reveal targets are re-collected on section load and reorder.
  - Selecting a slide shows it and holds autoplay.
  - Selecting a combo scrolls the rail to it.
  - Empty blocks and sections show an editor-only note, never broken markup.
- **Accessibility:**
  - Contrast raised for small text only: `paper-3` alpha .56 → .66, and small amber labels
    `#b8701c` → `#945a14`, same hue. Large text keeps the design colours.
  - Pause/play controls on the hero and marquee.
  - The marquee duplicate is `aria-hidden` + `inert`.
  - Dots get `aria-current` and a larger hit area.
  - Stars read as "5 out of 5 stars".
  - Headings are properly nested.
  - The combo rail is a labelled, keyboard-scrollable region.
  - Reduced motion turns the marquee into a static swipeable row.
- **Performance:**
  - Fonts are self-hosted (latin variable woff2 plus a 8KB Inter ₹ subset), preloaded on the
    homepage only.
  - Product art is real Shopify images with exact `srcset`/`sizes` derived from each image's ratio.
  - The first hero bottle is `fetchpriority=high`.
  - The water layers are cacheable `<img>` assets.
  - The WAAPI filter pulse is dropped.
  - Scroll handlers never read layout.
  - The marquee pauses off-screen.
- **Layout shift.** Dawn's `--header-height` is set by deferred JS, so a hero sized with it would
  jump after first paint. A two-line inline script measures the hero's own offset before it
  paints; CLS measures 0.
- **Breakpoints** are the prototype's own (420 / 600 / 760 / 900 / 1200), reproduced per
  component. With Dawn's header in normal flow, the hero's top spacing becomes "space below
  header", with per-breakpoint offsets matching the prototype's 150 / 132 / 118px.

## Gaps, stated plainly

- **Verified on a real store, with one area left to people.** The theme is live on the dev store,
  seeded by `store-seed/seed.mjs`, and `npm run live-check` passes there (34/34, desktop and
  mobile, including Dawn's cart drawer and Shopify checkout refusing the sold-out product). The
  theme editor was exercised with simulated editor events locally, and should also be tried
  by hand. Lighthouse hasn't been run on the live store.
- **"Pick any N" is an offer, not yet a mechanic.** Tiers are products carrying the right price,
  but choosing the N products needs a bundle builder (a Shopify Bundles app or a Cart Transform
  Function). "Build this box" links to the grid in the meantime.
- **Duplicate h1 on the homepage.** Dawn's header wraps the logo in an `<h1>`, and the hero
  heading is also an `h1` (switchable to h2 in settings). The clean fix is in Dawn's header;
  flagged, not changed.
- **"How it works" has no target in scope.** That section is out of the five, so it links to
  `#bundles`.
- The desktop combo rail relies on trackpad, shift-scroll or keyboard to move sideways, like the
  prototype. It has no arrows.

## With more time

1. Build a real bundle builder (Cart Transform Function or Shopify Bundles) behind the tiers
   and combos.
2. Build the rest of the file: ticker, glass nav as Dawn header settings, ingredients, pillars,
   proof rotator, full range, trust bar, signup (Shopify customer form), sticky mobile CTA.
3. Point the comparison harness at `shopify theme dev` and run it in CI as a visual regression
   gate, plus Lighthouse on the live store.
4. Connect a reviews app so `reviews.rating` and the review entries fill themselves.
5. Add optional desktop arrows on the combo rail, and fix the header `h1`.

---

# AI workflow notes

**What I delegated.** I used Claude Code (an agentic coding tool, not autocomplete) for nearly all
of the typing:

- reading the prototype and resolving its two-sheet cascade into final values;
- extraction scripts for the water layers and product art;
- the sections, snippets and JS;
- the seed script;
- a local render-and-compare harness.

My job was the spec (data model, what is a setting vs a block vs a metafield, what counts as a
bug vs the design) and verification. Nothing was accepted on "looks right". It was measured
against the prototype or the rule was checked in Dawn's source.

**Where it failed or needed catching:**

- **Environment:** Git for Windows' `autocrlf` silently turned the "stock Dawn" import into CRLF
  (358 files not identical to upstream). I caught this from a whole-file diff on a 2-line change.
  The history was rebuilt, verified by matching upstream's tree hash, and `.gitattributes` was
  added.
- **Platform knowledge it didn't have:**
  - Dawn hides `div:empty` (would have deleted the backdrop layers, and later hid the preview's
    cart-drawer overlay).
  - Dawn sets `box-sizing` in an inline style, not `base.css` (the first comparison showed every
    box 36px off).
  - Dawn's `--header-height` is set late (would have caused layout shift).
  - Shopify's `divided_by` is integer division while LiquidJS's isn't (showed as "₹174.99" in
    the preview).
- **Prototype-reading mistakes:** it initially reproduced things the numbers later showed were
  wrong, such as `flex-wrap` on the card price row (+12px at 375) and `scroll-padding` changing
  snap points. The fix was always "measure, then match".
- **Tooling:** headless Chrome took 90s+ per screenshot because pausing animations with injected
  CSS forces software re-rasterising of blended, blurred layers; background tabs never produce
  frames. Emulating `prefers-reduced-motion` (which both pages honour) made a full run 22s.

- **Real store:** Shopify's cart API now accepts a sold-out variant (checkout rejects it), so the
  first live test expected the wrong thing. Dawn also tucks the storefront password field into a
  modal on small screens, which broke the automated login until the form was submitted directly.

**What I'd systematise for twenty more:**

1. **Prototype intake script:** extract assets and computed styles per component from the
   browser instead of reading CSS by hand. That removes the cascade-resolution step, which was
   the most error-prone.
2. **The comparison harness as a gate:** a selector map per section, run against
   `shopify theme dev`, failing on any delta over 0.5px. It found every layout bug here.
3. **A snippet kit:** price / saving, height-driven product media with a no-image state, a
   `<product-form>` add to cart, stars, pause controls and reveal. Most client sections are
   combinations of these.
4. **Seed-as-data:** one `data.json` per client drives both the local preview and the store seed,
   with the required edge cases built in (sold out, no image, long title).
5. **A Dawn gotchas checklist fed to the agent up front:** `div:empty`, inline `box-sizing`, logo
   `h1`, `--header-height` timing, the `<product-form>` contract. Every item cost a debug loop once;
   none should cost one twice.
