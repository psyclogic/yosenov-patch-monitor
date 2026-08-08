(function () {
  'use strict';
  if (document.body?.classList.contains('blog-game-embed')) return;

  function createButton(label, title, direction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'page-scroll-button';
    button.innerHTML = `<span aria-hidden="true">${label}</span>`;
    button.setAttribute('aria-label', title);
    button.setAttribute('title', title);
    button.addEventListener('click', () => {
      window.scrollTo({ top: direction === 'up' ? 0 : document.documentElement.scrollHeight, behavior: 'smooth' });
    });
    return button;
  }

  function boot() {
    if (document.querySelector('.page-scroll-nav')) return;
    const nav = document.createElement('div');
    nav.className = 'page-scroll-nav';
    nav.setAttribute('aria-label', 'Navigasi halaman');
    const up = createButton('↑', 'Ke paling atas', 'up');
    const down = createButton('↓', 'Ke paling bawah', 'down');
    nav.append(up, down);
    document.body.appendChild(nav);

    const refresh = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const viewport = window.innerHeight || document.documentElement.clientHeight || 0;
      const total = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      up.disabled = y < 40;
      down.disabled = y + viewport >= total - 40;
      nav.classList.toggle('hidden', total <= viewport + 20);
    };
    refresh();
    window.addEventListener('scroll', refresh, { passive: true });
    window.addEventListener('resize', refresh, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(refresh).observe(document.body);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
