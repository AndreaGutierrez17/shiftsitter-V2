/* eslint-disable no-undef */
let firebaseApp = null;
let messaging = null;
let firebaseConfig = null;

self.addEventListener('message', async (event) => {
  if (!event?.data || event.data.type !== 'FIREBASE_CONFIG') return;
  firebaseConfig = event.data.payload;

  try {
    if (!self.firebase) {
      importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
      importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
    }

    if (!firebaseApp && firebaseConfig) {
      firebaseApp = self.firebase.initializeApp(firebaseConfig);
      messaging = self.firebase.messaging();

      messaging.onBackgroundMessage((payload) => {
        const title = payload.notification?.title || 'ShiftSitter';
        const options = {
          body: payload.notification?.body || 'You have a new update.',
          icon: '/logo-shiftsitter.png',
          data: payload.data || {},
        };
        self.registration.showNotification(title, options);
      });
    }
  } catch (error) {
    console.error('[firebase-messaging-sw] init error', error);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/families/messages';
  event.waitUntil(clients.openWindow(targetUrl));
});
