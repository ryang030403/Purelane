// Shared "store chrome" for the local preview: a simple header with a live
// cart count, used on the homepage, product pages and the cart page.
// Stand-in for Dawn's header; the real store renders Dawn's own.

export const HOME = '/tools/preview/out/index.html';

export const chromeCss = `
  .pv-bar { position: sticky; top: 0; z-index: 60; display: flex; align-items: center; gap: 24px; height: 64px; padding: 0 24px;
    background: #fff; border-bottom: 1px solid #e8e4f0; font: 500 14px/1 system-ui, sans-serif; color: #241a3d; letter-spacing: 0; }
  .pv-bar a { color: inherit; text-decoration: none; }
  .pv-logo { font: 800 18px/1 system-ui, sans-serif; letter-spacing: .08em; }
  .pv-nav { display: flex; gap: 18px; }
  .pv-nav a:hover, .pv-cart:hover { text-decoration: underline; }
  .pv-tag { margin-left: auto; font-size: 11px; padding: 4px 8px; border-radius: 999px; background: #fff4e0; color: #7a4a0c; border: 1px solid #f0d49c; }
  .pv-cart { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; }
  .pv-count { min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; background: #00706a; color: #fff; display: inline-grid; place-items: center; font-size: 12px; }
  @media (max-width: 700px) { .pv-nav, .pv-tag { display: none; } .pv-cart { margin-left: auto; } }
`;

export const chromeHtml = `
<header class="pv-bar" aria-label="Preview header">
  <a class="pv-logo" href="${HOME}">PURELANE</a>
  <nav class="pv-nav" aria-label="Preview">
    <a href="${HOME}#shop">Shop</a><a href="${HOME}#combos">Combos</a><a href="${HOME}#bundles">Bundles</a><a href="${HOME}#reviews">Reviews</a>
  </nav>
  <span class="pv-tag" title="On the store this bar is Dawn's real header">Local preview &middot; Dawn's header goes here</span>
  <a class="pv-cart" href="/cart">Cart <span class="pv-count" data-pv-count>0</span></a>
</header>
<script>
  fetch('/cart.js', { cache: 'no-store' }).then((r) => r.json()).then((c) => {
    document.querySelectorAll('[data-pv-count]').forEach((el) => (el.textContent = c.item_count));
  }).catch(() => {});
</script>`;
