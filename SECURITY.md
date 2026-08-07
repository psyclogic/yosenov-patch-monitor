# Security Policy

## Secrets and credentials

Never commit Firebase or Google Cloud service-account JSON files, private keys, access tokens, or `.env` files to this repository.

The scheduled synchronization workflow reads credentials only from GitHub Actions secrets:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT`

Store the complete service-account JSON value in the GitHub repository secret named `FIREBASE_SERVICE_ACCOUNT`. Do not create a service-account file inside the repository.

Firebase Web App configuration in `assets/firebase-config.js` is client configuration, not a Firebase Admin service account. Access must still be protected through Firebase Authentication and Firestore Security Rules.
