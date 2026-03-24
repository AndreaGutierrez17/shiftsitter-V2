import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
console.log("AUTH DOMAIN:", firebaseConfig.authDomain);

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const initFirestorePersistence = async () => {
  if (typeof window === 'undefined') return;

  try {
    await enableIndexedDbPersistence(db);
  } catch {
    // Ignore persistence errors (unsupported or multiple tabs).
  }
};

void initFirestorePersistence();

let messaging: import('firebase/messaging').Messaging | undefined = undefined;

const initMessaging = async () => {
  if (typeof window === 'undefined') return;

  try {
    const { getMessaging } = await import('firebase/messaging');
    messaging = getMessaging(app);
  } catch {
    // Ignore messaging init errors on unsupported clients.
    messaging = undefined;
  }
};

void initMessaging();

export { app, auth, db, storage, messaging };
