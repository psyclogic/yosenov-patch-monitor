export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const config = {
    apiKey: process.env.FIREBASE_WEB_API_KEY || '',
    authDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_WEB_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_WEB_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_WEB_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_WEB_APP_ID || ''
  };

  const required = {
    FIREBASE_WEB_API_KEY: config.apiKey,
    FIREBASE_WEB_AUTH_DOMAIN: config.authDomain,
    FIREBASE_WEB_PROJECT_ID: config.projectId,
    FIREBASE_WEB_APP_ID: config.appId
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (missing.length) {
    return res.status(503).json({
      configured: false,
      missing,
      error: 'Firebase Web Configuration belum lengkap di Vercel Environment Variables.'
    });
  }

  return res.status(200).json({ configured: true, config });
}
