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
  const direct = text.match(/^(\d{3,10})$/);
  if (direct) return direct[1];
  const fromUrl = text.match(/(?:steamdb\.info|steampowered\.com)\/app\/(\d{3,10})(?:\/|$|\?)/i);
  if (fromUrl) return fromUrl[1];
  const generic = text.match(/(?:app\/|appid[=/:]?\s*)(\d{3,10})/i);
  return generic?.[1] || '';
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
  setTimeout(() => item.remove(), 5200);
}

export async function fetchSteamInfo(appId) {
  const response = await fetch(`/api/steam?appid=${encodeURIComponent(appId)}`, { headers: { Accept: 'application/json' } });
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) throw new Error(data.error || `Gagal mengambil data Steam (HTTP ${response.status}).`);
  return data;
}

export function friendlyFirebaseError(error) {
  const code = error?.code || '';
  const messages = {
    'auth/invalid-credential': 'Email atau password salah.',
    'auth/invalid-email': 'Format email tidak valid.',
    'auth/user-disabled': 'Akun admin ini dinonaktifkan.',
    'auth/too-many-requests': 'Terlalu banyak percobaan login. Coba lagi beberapa saat.',
    'auth/network-request-failed': 'Firebase tidak dapat dihubungi. Periksa koneksi internet atau konfigurasi Firebase.',
    'permission-denied': 'Akses Firestore ditolak. Pastikan Firestore Rules sudah dipasang dan UID ada di koleksi admins.'
  };
  return messages[code] || error?.message || 'Terjadi kesalahan yang tidak diketahui.';
}
