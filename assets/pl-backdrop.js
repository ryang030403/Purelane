/*
  <pl-backdrop>: picks the background scene from whichever [data-pl-scene]
  section is at the middle of the viewport, and drives the water parallax
  (scroll everywhere, mouse on desktop).

  Positions are measured once (and on resize / editor changes), never inside
  the scroll frame, so scrolling does no layout reads.
*/
if (!customElements.get('pl-backdrop')) {
  customElements.define(
    'pl-backdrop',
    class PlBackdrop extends HTMLElement {
      connectedCallback() {
        this.scenes = [...this.querySelectorAll('.pl-scene')];
        this.layers = [...this.querySelectorAll('.pl-wl')];
        this.depths = [0.05, 0.09, 0.03, 0.02]; // layers a, b, c, s
        this.parallax = this.dataset.parallax === 'true' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.mx = 0;
        this.my = 0;
        this.current = 0;
        this.zones = [];
        this.raf = null;

        this.onScroll = () => {
          if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
        };
        this.onLayout = () => {
          this.measure();
          this.onScroll();
        };
        this.onMouse = (e) => {
          this.mx = (e.clientX / window.innerWidth - 0.5) * 2;
          this.my = (e.clientY / window.innerHeight - 0.5) * 2;
          this.onScroll();
        };

        window.addEventListener('scroll', this.onScroll, { passive: true });
        window.addEventListener('resize', this.onLayout);
        window.addEventListener('load', this.onLayout);
        if (this.parallax && matchMedia('(min-width: 1024px)').matches) {
          window.addEventListener('mousemove', this.onMouse, { passive: true });
        }
        ['shopify:section:load', 'shopify:section:unload', 'shopify:section:reorder'].forEach((type) =>
          document.addEventListener(type, this.onLayout)
        );
        // Content height changes (fonts, images, editor edits) move the zones.
        this.resizeObserver = new ResizeObserver(this.onLayout);
        this.resizeObserver.observe(document.body);

        this.measure();
        this.frame();
      }

      disconnectedCallback() {
        window.removeEventListener('scroll', this.onScroll);
        window.removeEventListener('resize', this.onLayout);
        window.removeEventListener('load', this.onLayout);
        window.removeEventListener('mousemove', this.onMouse);
        ['shopify:section:load', 'shopify:section:unload', 'shopify:section:reorder'].forEach((type) =>
          document.removeEventListener(type, this.onLayout)
        );
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.raf) cancelAnimationFrame(this.raf);
      }

      measure() {
        const y = window.scrollY;
        this.zones = [...document.querySelectorAll('[data-pl-scene]')].map((el) => ({
          top: el.getBoundingClientRect().top + y,
          scene: parseInt(el.dataset.plScene, 10) || 1,
        }));
      }

      setScene(n) {
        if (n === this.current) return;
        this.current = n;
        this.scenes.forEach((s, i) => s.classList.toggle('is-on', i + 1 === n));
        this.dataset.d = String(n);
      }

      frame() {
        this.raf = null;
        const y = window.scrollY;
        const focus = y + window.innerHeight * 0.5;
        let n = 1;
        for (const zone of this.zones) if (zone.top <= focus) n = zone.scene;
        this.setScene(n);

        if (!this.parallax) return;
        this.layers.forEach((layer, i) => {
          const d = this.depths[i] || 0.05;
          layer.style.setProperty('--px', `${(this.mx * d * 130).toFixed(1)}px`);
          layer.style.setProperty('--py', `${(-y * d + this.my * d * 90).toFixed(1)}px`);
        });
      }
    }
  );
}
