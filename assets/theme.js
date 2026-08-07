(function () {
  'use strict';

  const STORAGE_KEY = 'yosenov-theme';

  function getStoredTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'dark' || saved === 'light' ? saved : null;
    } catch (_) {
      return null;
    }
  }

  function systemTheme() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (_) {
      return 'light';
    }
  }

  function setTheme(theme) {
    const normalized = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', normalized);
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.textContent = normalized === 'dark' ? '☀' : '☾';
      button.setAttribute('aria-label', normalized === 'dark' ? 'Gunakan tema terang' : 'Gunakan tema gelap');
      button.setAttribute('title', normalized === 'dark' ? 'Tema terang' : 'Tema gelap');
    });
    try { localStorage.setItem(STORAGE_KEY, normalized); } catch (_) {}
  }

  function bindButtons() {
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      if (button.dataset.themeBound === '1') return;
      button.dataset.themeBound = '1';
      button.addEventListener('click', function () {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        setTheme(current === 'dark' ? 'light' : 'dark');
      });
    });
    setTheme(document.documentElement.getAttribute('data-theme') || getStoredTheme() || systemTheme());
  }

  setTheme(getStoredTheme() || systemTheme());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindButtons, { once: true });
  } else {
    bindButtons();
  }

  window.YosenovTheme = { set: setTheme };
})();
