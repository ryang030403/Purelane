/*
  Purelane base behaviour shared by every pl-* section.

  1. Scroll reveal (.pl-rv -> .is-in, then .is-done once the transition has
     finished so hover transitions take over).
  2. Theme editor resilience: sections can be added, removed, reordered and
     re-rendered at any time, so reveal targets are re-collected on every
     editor event and a selected section/block is always shown immediately.
*/
(() => {
  const root = document.documentElement;
  const DONE_AFTER = 1400; // longest delay (.36s) + duration (.95s), rounded up

  const settle = (el) => {
    el.classList.add('is-in');
    setTimeout(() => el.classList.add('is-done'), DONE_AFTER);
  };

  let observer = null;
  if (root.classList.contains('pl-motion')) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          settle(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
    );
  }

  const scan = (scope = document) => {
    scope.querySelectorAll('.pl-rv:not(.is-in)').forEach((el) => {
      if (observer) observer.observe(el);
      else el.classList.add('is-in', 'is-done');
    });
  };

  const revealNow = (scope) => {
    if (!scope) return;
    scope.querySelectorAll('.pl-rv:not(.is-in)').forEach((el) => {
      if (observer) observer.unobserve(el);
      settle(el);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scan());
  } else {
    scan();
  }

  if (!window.Shopify || !window.Shopify.designMode) return;

  document.addEventListener('shopify:section:load', (e) => scan(e.target));
  document.addEventListener('shopify:section:reorder', () => scan());
  document.addEventListener('shopify:section:select', (e) => revealNow(e.target));

  // Selecting a block in the sidebar should make it visible, including cards
  // parked off-screen inside a horizontal rail.
  document.addEventListener('shopify:block:select', (e) => {
    const block = e.target;
    revealNow(block.closest('.shopify-section'));
    const rail = block.closest('[data-pl-rail]');
    if (rail) {
      const left = block.offsetLeft - (rail.clientWidth - block.offsetWidth) / 2;
      rail.scrollTo({ left, behavior: e.detail && e.detail.load ? 'auto' : 'smooth' });
    }
  });
})();
