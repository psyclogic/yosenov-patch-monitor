// YOSENOV Firebase Web Configuration
// Prioritas konfigurasi:
// 1) Environment Variables Vercel melalui /api/firebase-config
// 2) fallbackFirebaseConfig di file ini untuk penggunaan manual/local.
//
// Jangan pernah menaruh service account / private_key di file frontend ini.

export const fallbackFirebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

export function isFirebaseConfigValid(config) {
  if (!config || typeof config !== 'object') return false;
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
