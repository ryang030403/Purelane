/*
  <pl-marquee>: keeps the reviews loop seamless whatever the review count
  and screen width, and wires up pause/play.

  The track holds two identical halves and slides by -50%. If one set of
  reviews is narrower than the screen, extra copies are added to each half
  (all aria-hidden + inert) and the duration is scaled so speed stays the
  same as the design (10.4s per card, 8s on mobile).
*/
if (!customElements.get('pl-marquee')) {
  customElements.define(
    'pl-marquee',
    class PlMarquee extends HTMLElement {
      connectedCallback() {
        this.track = this.querySelector('.pl-revtrack');
        this.base = this.querySelector('.pl-revset');
        if (!this.track || !this.base) return;
        this.count = parseInt(getComputedStyle(this.track).getPropertyValue('--pl-count'), 10) || 1;
        this.cards = this.count;
        this.reps = 1;

        const band = this.closest('.pl-revband') || document;
        this.toggle = band.querySelector('[data-marquee-toggle]');
        if (this.toggle) {
          this.onToggle = () => this.setPaused(!this.classList.contains('is-paused'));
          this.toggle.addEventListener('click', this.onToggle);
        }

        this.resizeObserver = new ResizeObserver(() => this.fill());
        this.resizeObserver.observe(this);

        this.io = new IntersectionObserver(([entry]) =>
          this.classList.toggle('is-offscreen', !entry.isIntersecting)
        );
        this.io.observe(this);
      }

      disconnectedCallback() {
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.io) this.io.disconnect();
        if (this.toggle) this.toggle.removeEventListener('click', this.onToggle);
      }

      setPaused(paused) {
        this.classList.toggle('is-paused', paused);
        if (!this.toggle) return;
        this.toggle.dataset.paused = String(paused);
        this.toggle.setAttribute('aria-label', paused ? this.toggle.dataset.labelPlay : this.toggle.dataset.labelPause);
      }

      fill() {
        const setWidth = this.base.offsetWidth;
        if (!setWidth) return;
        const reps = Math.max(1, Math.ceil(this.clientWidth / setWidth));
        if (reps === this.reps) return;
        this.reps = reps;

        // Rebuild: first set (real) + copies, twice over, all copies hidden.
        this.track.querySelectorAll('.pl-revset').forEach((set) => set !== this.base && set.remove());
        for (let i = 1; i < reps * 2; i++) {
          const copy = this.base.cloneNode(true);
          copy.setAttribute('aria-hidden', 'true');
          copy.inert = true;
          this.track.appendChild(copy);
        }
        this.track.style.setProperty('--pl-count', String(this.count * reps));
      }
    }
  );
}
