/*
  <pl-hero>: the 1 -> 2 -> 3 product price stage, plus the scroll/mouse
  parallax on the product column.

  Autoplay runs only while the stage is on screen, and stops for hover,
  keyboard focus, the pause button, reduced motion, and while a slide
  block is selected in the theme editor.
*/
if (!customElements.get('pl-hero')) {
  customElements.define(
    'pl-hero',
    class PlHero extends HTMLElement {
      connectedCallback() {
        this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.slides = [...this.querySelectorAll('.pl-hslide')];
        this.dots = [...this.querySelectorAll('.pl-hdots__dot')];
        this.toggle = this.querySelector('[data-toggle]');
        this.stage = this.querySelector('.pl-hstage');
        this.prod = this.querySelector('[data-prod]');
        this.interval = parseInt(this.dataset.interval, 10) || 3800;
        this.index = 0;
        this.timer = null;
        // Reasons autoplay is currently held; it runs only when this is empty.
        this.holds = new Set(this.reduce ? ['motion'] : []);

        this.setupSlides();
        this.setupParallax();
      }

      disconnectedCallback() {
        this.stop();
        if (this.io) this.io.disconnect();
        window.removeEventListener('scroll', this.onScroll);
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('mousemove', this.onMouse);
        document.removeEventListener('shopify:block:select', this.onBlockSelect);
        document.removeEventListener('shopify:block:deselect', this.onBlockDeselect);
        if (this.raf) cancelAnimationFrame(this.raf);
      }

      /* ---------- slides ---------- */
      setupSlides() {
        if (this.slides.length < 2) return;

        this.dots.forEach((dot) =>
          dot.addEventListener('click', () => {
            this.go(parseInt(dot.dataset.go, 10));
            this.restart();
          })
        );

        if (this.toggle) {
          this.toggle.addEventListener('click', () => {
            if (this.holds.has('user') || this.holds.has('motion')) {
              // An explicit "play" outranks the reduced-motion default.
              this.holds.delete('motion');
              this.release('user');
            } else {
              this.hold('user');
            }
          });
          if (this.reduce) this.syncToggle();
        }

        const hoverArea = this.prod || this.stage;
        hoverArea.addEventListener('mouseenter', () => this.hold('hover'));
        hoverArea.addEventListener('mouseleave', () => this.release('hover'));
        hoverArea.addEventListener('focusin', () => this.hold('focus'));
        hoverArea.addEventListener('focusout', (e) => {
          if (!hoverArea.contains(e.relatedTarget)) this.release('focus');
        });

        this.hold('offscreen');
        this.io = new IntersectionObserver(
          ([entry]) => (entry.isIntersecting ? this.release('offscreen') : this.hold('offscreen')),
          { threshold: 0.2 }
        );
        this.io.observe(this.stage);

        this.onBlockSelect = (e) => {
          const i = this.slides.indexOf(e.target);
          if (i === -1) return;
          this.go(i);
          this.hold('editor');
        };
        this.onBlockDeselect = (e) => {
          if (this.slides.includes(e.target)) this.release('editor');
        };
        document.addEventListener('shopify:block:select', this.onBlockSelect);
        document.addEventListener('shopify:block:deselect', this.onBlockDeselect);
      }

      go(n) {
        this.index = (n + this.slides.length) % this.slides.length;
        this.slides.forEach((slide, i) => {
          const on = i === this.index;
          slide.classList.toggle('is-on', on);
          slide.toggleAttribute('aria-hidden', !on);
        });
        this.dots.forEach((dot, i) => {
          const on = i === this.index;
          dot.classList.toggle('is-on', on);
          on ? dot.setAttribute('aria-current', 'true') : dot.removeAttribute('aria-current');
        });
      }

      hold(reason) {
        this.holds.add(reason);
        this.stop();
        this.syncToggle();
      }

      release(reason) {
        this.holds.delete(reason);
        this.syncToggle();
        if (this.holds.size === 0) this.start();
      }

      start() {
        if (this.timer || this.slides.length < 2) return;
        this.timer = setInterval(() => this.go(this.index + 1), this.interval);
      }

      stop() {
        clearInterval(this.timer);
        this.timer = null;
      }

      restart() {
        this.stop();
        if (this.holds.size === 0) this.start();
      }

      // The button reflects the user's choice (and reduced motion), not
      // temporary holds like hover, so it does not flicker.
      syncToggle() {
        if (!this.toggle) return;
        const paused = this.holds.has('user') || this.holds.has('motion');
        this.toggle.dataset.paused = String(paused);
        this.toggle.setAttribute('aria-label', paused ? this.toggle.dataset.labelPlay : this.toggle.dataset.labelPause);
      }

      /* ---------- parallax ---------- */
      setupParallax() {
        if (!this.prod || this.reduce) return;
        this.mx = 0;
        this.my = 0;
        this.raf = null;

        this.onScroll = () => {
          if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
        };
        this.onResize = () => {
          this.top = this.getBoundingClientRect().top + window.scrollY;
          this.onScroll();
        };
        window.addEventListener('scroll', this.onScroll, { passive: true });
        window.addEventListener('resize', this.onResize);
        window.addEventListener('load', this.onResize, { once: true });

        if (matchMedia('(min-width: 1024px)').matches) {
          this.onMouse = (e) => {
            this.mx = (e.clientX / window.innerWidth - 0.5) * 2;
            this.my = (e.clientY / window.innerHeight - 0.5) * 2;
            this.onScroll();
          };
          window.addEventListener('mousemove', this.onMouse, { passive: true });
        }
        this.onResize();
      }

      frame() {
        this.raf = null;
        // On the first screen (under Dawn's header) progress counts from the
        // top of the page, exactly like the prototype. Placed further down,
        // it counts from when the hero reaches the top of the viewport.
        const start = this.top < window.innerHeight ? 0 : this.top;
        const y = Math.max(0, window.scrollY - start);
        const f = Math.min(y / 700, 1);
        this.prod.style.transform = `translate3d(${(this.mx * -16).toFixed(2)}px, ${(-f * 54 + this.my * -10).toFixed(
          2
        )}px, 0) scale(${(1 - f * 0.06).toFixed(3)})`;
        this.prod.style.opacity = (1 - f * 0.55).toFixed(3);
      }
    }
  );
}
