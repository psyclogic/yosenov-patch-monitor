// YOSENOV Firebase Web Configuration
// Prioritas konfigurasi:
// 1) Environment Variables Vercel melalui /api/firebase-config
// 2) fallbackFirebaseConfig di file ini untuk penggunaan manual/local.
//
// Jangan pernah menaruh service account / private_key di file frontend ini.

export const fallbackFirebaseConfig = {
  apiKey: 'AIzaSyDnZlELIrRoiuQzdhLV_GIbXkSuE2NuN1k',
  authDomain: 'ysnupdate-182f6.firebaseapp.com',
  projectId: 'ysnupdate-182f6',
  storageBucket: 'ysnupdate-182f6.firebasestorage.app',
  messagingSenderId: '803224220954',
  appId: '1:803224220954:web:d243c7037a07988d8528a3',
  measurementId: 'G-13S1FMD10F' // Tambahan optional untuk analytics
};

export function isFirebaseConfigValid(config) {
  if (!config || typeof config !== 'object') return false;
  // Menambahkan pengecekan dasar
  const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
  return required.every((key) => {
    const value = String(config[key] || '').trim();
    return value && !/GANTI_|YOUR_|PLACEHOLDER/i.test(value);
  });
}

export async function loadFirebaseConfig() {
  try {
    const response = await fetch('/api/firebase-config', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (response.ok) {
      const payload = await response.json();
      if (isFirebaseConfigValid(payload?.config)) return payload.config;
    }
  } catch (_) {
    // Fallback ke konfigurasi lokal di bawah.
  }

  if (isFirebaseConfigValid(fallbackFirebaseConfig)) return fallbackFirebaseConfig;

  throw new Error(
    'Firebase belum dikonfigurasi. Isi FIREBASE_WEB_* di Vercel Project Settings > Environment Variables, lalu Redeploy.'
  );
}
