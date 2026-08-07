export function initTheme() {
  const saved = localStorage.getItem('yosenov-theme');
  const preferred = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = saved || preferred;
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.textContent = document.documentElement.dataset.theme === 'dark' ? '☀' : '☾';
    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('yosenov-theme', next);
      document.querySelectorAll('[data-theme-toggle]').forEach((b) => b.textContent = next === 'dark' ? '☀' : '☾');
    });
  });
}

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

export function formatDate(unixOrDate) {
  if (!unixOrDate) return 'Belum diketahui';
  const date = typeof unixOrDate === 'number' ? new Date(unixOrDate * 1000) : new Date(unixOrDate);
  if (Number.isNaN(date.getTime())) return 'Belum diketahui';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function getStatus(game) {
  const remote = String(game.remoteBuildId || '');
  const local = String(game.localBuildId || '');
  const translation = String(game.translationBuildId || '');
  return {
    gameNeedsUpdate: Boolean(remote && local && remote !== local),
    translationNeedsUpdate: Boolean(remote && translation !== remote),
    localUnknown: !local,
    remoteUnknown: !remote,
    ready: Boolean(remote && local === remote && translation === remote)
  };
}

export function extractAppId(input) {
  const text = String(input || '').trim();
  const match = text.match(/(?:app\/|appid[=/:]?\s*|^)(\d{3,10})(?:\/|$|\D)/i) || text.match(/^(\d{3,10})$/);
  return match?.[1] || '';
}

export function toast(message, type = '') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  stack.appendChild(item);
  setTimeout(() => item.remove(), 4200);
}

export async function fetchSteamInfo(appId) {
  const response = await fetch(`/api/steam?appid=${encodeURIComponent(appId)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Gagal mengambil data Steam.');
  return data;
}
