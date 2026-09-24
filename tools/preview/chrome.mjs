// Shared "store chrome" for the local preview: a header with a live cart
// count and a slide-in cart drawer, used on the homepage, product pages and
// the cart page. Stand-in for Dawn's header and cart drawer.
//
// The drawer is a <cart-drawer> element exposing the same methods Dawn's
// product-form.js calls (getSectionsToRender, setActiveElement,
// renderContents), so Add to cart in the preview runs the same code path as
// the store with theme setting "Cart type: Drawer".

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
  .pv-count.bump { animation: pv-bump .45s ease; }
  @keyframes pv-bump { 40% { transform: scale(1.35); } }
  @media (max-width: 700px) { .pv-nav, .pv-tag { display: none; } .pv-cart { margin-left: auto; } }

  /* drawer */
  cart-drawer { position: fixed; inset: 0; z-index: 100; visibility: hidden; font: 15px/1.5 system-ui, sans-serif; color: #241a3d; letter-spacing: 0; }
  cart-drawer.is-open { visibility: visible; }
  .pv-overlay { display: block; position: absolute; inset: 0; background: rgba(23,16,43,.35); opacity: 0; transition: opacity .25s; }
  cart-drawer.is-open .pv-overlay { opacity: 1; }
  .pv-drawer { position: absolute; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); display: flex; flex-direction: column;
    background: #fff; box-shadow: -20px 0 50px rgba(23,16,43,.18); transform: translateX(100%); transition: transform .3s cubic-bezier(.2,.7,.2,1); }
  cart-drawer.is-open .pv-drawer { transform: none; }
  /* The item list scrolls; the subtotal and buttons stay pinned in view. */
  .pv-drawer { overflow: hidden; }
  .pv-drawer [data-body] { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .pv-lines { min-height: 0; }
  .pv-dhead { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid #eee; }
  .pv-dhead h2 { margin: 0; font: 800 18px system-ui; letter-spacing: .04em; text-transform: uppercase; }
  .pv-close { width: 36px; height: 36px; border-radius: 50%; border: 1px solid #ddd; background: #fff; font-size: 20px; cursor: pointer; color: inherit; }
  .pv-added { display: flex; gap: 10px; align-items: center; margin: 14px 20px 0; padding: 10px 12px; border-radius: 12px; background: #e9f7ef; color: #0f5b3a; font-weight: 600; font-size: 14px; }
  .pv-lines { flex: 1; overflow: auto; padding: 8px 20px; list-style: none; margin: 0; }
  .pv-lines li { display: grid; grid-template-columns: 56px 1fr auto; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
  .pv-lines img, .pv-lines .pv-ph { width: 56px; height: 56px; object-fit: contain; background: #f6f3fb; border-radius: 10px; }
  .pv-lines a { color: inherit; font-weight: 600; font-size: 14px; }
  .pv-lines .pv-meta { font-size: 13px; color: #6b6480; }
  .pv-lines li.is-new { background: linear-gradient(90deg, #f3fbf6, transparent); }
  .pv-foot { padding: 16px 20px 20px; border-top: 1px solid #eee; }
  .pv-total { display: flex; justify-content: space-between; font: 800 18px system-ui; margin-bottom: 12px; }
  .pv-actions { display: grid; gap: 10px; }
  .pv-btn { display: flex; align-items: center; justify-content: center; height: 46px; border-radius: 999px; font: 700 13px system-ui;
    letter-spacing: .12em; text-transform: uppercase; text-decoration: none; cursor: pointer; border: 0; }
  .pv-btn.primary { background: linear-gradient(135deg,#00706a,#004b46); color: #fff; }
  .pv-btn.ghost { background: #fff; color: #01423b; border: 1px solid #cfc6e6; }
  .pv-empty { padding: 32px 20px; text-align: center; color: #6b6480; }
  .pv-note { font-size: 12px; color: #6b6480; margin-top: 10px; text-align: center; }
`;

export const chromeHtml = `
<header class="pv-bar" aria-label="Preview header">
  <a class="pv-logo" href="${HOME}">PURELANE</a>
  <nav class="pv-nav" aria-label="Preview">
    <a href="${HOME}#shop">Shop</a><a href="${HOME}#combos">Combos</a><a href="${HOME}#bundles">Bundles</a><a href="${HOME}#reviews">Reviews</a>
  </nav>
  <span class="pv-tag" title="On the store this bar is Dawn's real header">Local preview &middot; Dawn's header goes here</span>
  <a class="pv-cart" id="cart-icon-bubble" href="/cart">Cart <span class="pv-count" data-pv-count>0</span></a>
</header>
<cart-drawer aria-hidden="true">
  <span class="pv-overlay" data-close aria-hidden="true"></span><!-- span, not div: Dawn hides div:empty -->
  <div class="pv-drawer" role="dialog" aria-modal="true" aria-labelledby="pv-dtitle" tabindex="-1">
    <div class="pv-dhead"><h2 id="pv-dtitle">Your cart</h2><button class="pv-close" type="button" data-close aria-label="Close cart">&times;</button></div>
    <div data-body></div>
  </div>
</cart-drawer>
<script>
(() => {
  const money = (c) => '₹' + (c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const setCount = (n, bump) => document.querySelectorAll('[data-pv-count]').forEach((el) => {
    el.textContent = n;
    if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  });
  const getCart = () => fetch('/cart.js', { cache: 'no-store' }).then((r) => r.json());

  class PvCartDrawer extends HTMLElement {
    connectedCallback() {
      this.panel = this.querySelector('.pv-drawer');
      this.body = this.querySelector('[data-body]');
      this.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close()));
      this.addEventListener('keydown', (e) => e.key === 'Escape' && this.close());
      // Like Dawn: the header cart link opens the drawer (the /cart page stays as the fallback).
      const link = document.getElementById('cart-icon-bubble');
      if (link && location.pathname !== '/cart') link.addEventListener('click', (e) => { e.preventDefault(); this.refresh(null, link); });
      getCart().then((c) => setCount(c.item_count));
    }
    // --- the API Dawn's product-form.js calls ---
    getSectionsToRender() { return []; }
    setActiveElement(el) { this.activeElement = el; }
    renderContents(added) { this.refresh(added); }
    // ---
    refresh(added, opener) {
      if (opener) this.setActiveElement(opener);
      getCart().then((cart) => {
        setCount(cart.item_count, !!added);
        const lines = cart.items.map((i) =>
          '<li' + (added && added.id === i.id ? ' class="is-new"' : '') + '>' +
            (i.image ? '<img src="' + i.image + '" alt="">' : '<span class="pv-ph"></span>') +
            '<div><a href="' + i.url + '">' + esc(i.product_title) + '</a><div class="pv-meta">Qty ' + i.quantity + ' &middot; ' + money(i.price) + ' each</div></div>' +
            '<b>' + money(i.line_price) + '</b></li>').join('');
        this.body.innerHTML = cart.items.length
          ? (added ? '<div class="pv-added" role="status">&#10003; ' + esc(added.product_title) + ' added &middot; ' + cart.item_count + ' item' + (cart.item_count === 1 ? '' : 's') + ' in cart</div>' : '') +
            '<ul class="pv-lines">' + lines + '</ul>' +
            '<div class="pv-foot"><div class="pv-total"><span>Subtotal</span><span>' + money(cart.total_price) + '</span></div>' +
            '<div class="pv-actions"><a class="pv-btn primary" href="/cart">View cart &amp; check out</a>' +
            '<button class="pv-btn ghost" type="button" data-continue>Continue shopping</button></div>' +
            '<p class="pv-note">Local preview. On the store this is Dawn\\'s cart drawer and Shopify checkout.</p></div>'
          : '<p class="pv-empty">Your cart is empty.</p>';
        const cont = this.body.querySelector('[data-continue]');
        if (cont) cont.addEventListener('click', () => this.close());
        this.open();
      });
    }
    open() {
      this.classList.add('is-open');
      this.setAttribute('aria-hidden', 'false');
      document.documentElement.style.overflow = 'hidden';
      setTimeout(() => this.panel.focus(), 50);
    }
    close() {
      this.classList.remove('is-open');
      this.setAttribute('aria-hidden', 'true');
      document.documentElement.style.overflow = '';
      if (this.activeElement && this.activeElement.focus) this.activeElement.focus();
    }
  }
  customElements.define('cart-drawer', PvCartDrawer);
})();
</script>`;
