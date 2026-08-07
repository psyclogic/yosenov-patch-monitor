import { loadFirebaseConfig } from './firebase-config.js';

const FIREBASE_VERSION = '12.16.0';

export async function createFirebaseClient({ auth = false, firestore = true } = {}) {
  const config = await loadFirebaseConfig();

  const appModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`);
  const app = appModule.initializeApp(config);

  const result = { app, config };

  if (auth) {
    const authModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
    result.authModule = authModule;
    result.auth = authModule.getAuth(app);
  }

  if (firestore) {
    const firestoreModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`);
    result.firestoreModule = firestoreModule;
    result.db = firestoreModule.getFirestore(app);
  }

  return result;
}
