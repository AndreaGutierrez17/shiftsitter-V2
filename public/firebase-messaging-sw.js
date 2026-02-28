/* eslint-disable no-undef */
let firebaseApp = null;
let messaging = null;
let firebaseConfig = null;

function normalizePayload(rawPayload) {
  const payload = rawPayload || {};
  const notification = payload.notification || {};
  const data = payload.data || {};

  const title =
    notification.title ||
    data.title ||
    'ShiftSitter';

  const body =
    notification.body ||
    data.body ||
    'You have a new update.';

  const href =
    data.href ||
    data.url ||
    '/families/messages';

  return {
    title,
    options: {
      body,
      icon: notification.icon || '/logo-shiftsitter.png',
      badge: data.badge || '/logo-shiftsitter.png',
      tag: data.tag || data.notificationId || undefined,
      renotify: false,
      data: {
        ...data,
        url: href,
      },
    },
  };
}

async function showNormalizedNotification(rawPayload) {
  const { title, options } = normalizePayload(rawPayload);
  await self.registration.showNotification(title, options);
}

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
        showNormalizedNotification(payload);
      });
    }
  } catch (error) {
    console.error('[firebase-messaging-sw] init error', error);
  }
});

self.addEventListener('push', (event) => {
  if (!event?.data) return;

  event.waitUntil((async () => {
    try {
      const payload = event.data.json();
      await showNormalizedNotification(payload);
    } catch (error) {
      console.error('[firebase-messaging-sw] push parse error', error);
      const text = event.data.text?.() || '';
      await showNormalizedNotification({
        notification: {
          title: 'ShiftSitter',
          body: text || 'You have a new update.',
        },
        data: {
          url: '/families/messages',
        },
      });
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/families/messages';

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    for (const client of allClients) {
      if ('focus' in client) {
        const sameOrigin = client.url && client.url.startsWith(self.location.origin);
        if (sameOrigin) {
          if ('navigate' in client) {
            await client.navigate(targetUrl);
          }
          await client.focus();
          return;
        }
      }
    }

    await clients.openWindow(targetUrl);
  })());
});
