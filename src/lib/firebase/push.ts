'use client';

import { doc, setDoc, serverTimestamp, arrayUnion, arrayRemove, updateDoc, deleteField, getDoc } from 'firebase/firestore';
import { db, messaging } from '@/lib/firebase/client';

const firebasePublicConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export async function enableWebPush(uid: string) {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('This browser does not support push notifications.');
  }
  const isIOS = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
  const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (!isSecure) {
    throw new Error('Push notifications require HTTPS. Please open ShiftSitter from the secure deployed site.');
  }

  if (isIOS && !isStandalone) {
    throw new Error('On iPhone/iPad, add ShiftSitter to your Home Screen and open it from there to enable notifications.');
  }

  if (!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) {
    throw new Error('NEXT_PUBLIC_FIREBASE_VAPID_KEY is missing.');
  }

  if (!messaging) {
    throw new Error('Firebase Messaging is not available in this client.');
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    throw new Error('Notification permission denied.');
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const readyRegistration = await navigator.serviceWorker.ready;
  const configMessage = { type: 'FIREBASE_CONFIG', payload: firebasePublicConfig };
  registration.active?.postMessage(configMessage);
  registration.waiting?.postMessage(configMessage);
  registration.installing?.postMessage(configMessage);
  readyRegistration.active?.postMessage(configMessage);
  navigator.serviceWorker.controller?.postMessage(configMessage);

  const { getToken } = await import('firebase/messaging');
  const { onMessage } = await import('firebase/messaging');
  const token = await getToken(messaging, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error('Could not get FCM token.');
  }

  await setDoc(
    doc(db, 'fcm_tokens', uid),
    {
      uid,
      tokens: arrayUnion(token),
      updatedAt: serverTimestamp(),
      platform: 'web',
    },
    { merge: true }
  );

  // Backward compatibility for existing reads.
  await setDoc(doc(db, 'users', uid), { fcmToken: token }, { merge: true });

  try {
    window.localStorage.setItem('shiftsitter:push-token', token);
    window.localStorage.removeItem('shiftsitter:push-opt-out');
  } catch {
    // ignore storage issues
  }

  const windowWithFlag = window as typeof window & { __shiftSitterForegroundPushBound?: boolean };
  if (!windowWithFlag.__shiftSitterForegroundPushBound) {
    onMessage(messaging, async (payload) => {
      try {
        const data = payload.data || {};
        const title = payload.notification?.title || data.title || 'ShiftSitter';
        const body = payload.notification?.body || data.body || 'You have a new update.';
        const tag = typeof data.notificationId === 'string' ? data.notificationId : typeof data.tag === 'string' ? data.tag : undefined;
        const readySw = await navigator.serviceWorker.ready;
        await readySw.showNotification(title, {
          body,
          icon: '/logo-shiftsitter.png',
          badge: '/logo-shiftsitter.png',
          tag,
          data,
        });
      } catch (error) {
        console.error('Foreground notification display failed:', error);
      }
    });
    windowWithFlag.__shiftSitterForegroundPushBound = true;
  }

  return token;
}

export async function disableWebPush(uid: string) {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('This browser does not support push notifications.');
  }

  if (!messaging) {
    throw new Error('Firebase Messaging is not available in this client.');
  }

  let token = '';
  try {
    token = window.localStorage.getItem('shiftsitter:push-token') || '';
  } catch {
    token = '';
  }

  if (!token && Notification.permission === 'granted') {
    try {
      const registration =
        (await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')) ||
        (await navigator.serviceWorker.ready);
      const { getToken } = await import('firebase/messaging');
      token = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration,
      });
    } catch {
      token = '';
    }
  }

  if (token) {
    try {
      const { deleteToken } = await import('firebase/messaging');
      await deleteToken(messaging);
    } catch {
      // ignore deleteToken failures
    }

    try {
      await updateDoc(doc(db, 'fcm_tokens', uid), {
        tokens: arrayRemove(token),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // ignore missing doc
    }

    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      const data = userSnap.exists() ? (userSnap.data() as { fcmToken?: string }) : null;
      if (data?.fcmToken === token) {
        await updateDoc(userRef, { fcmToken: deleteField() });
      }
    } catch {
      // ignore
    }
  }

  try {
    window.localStorage.setItem('shiftsitter:push-opt-out', '1');
    window.localStorage.removeItem('shiftsitter:push-token');
  } catch {
    // ignore
  }
}
