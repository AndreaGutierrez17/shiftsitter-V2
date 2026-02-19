importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js");

let messaging = null;
let isInitialized = false;

function initializeFirebase(config) {
  if (isInitialized || !config || !config.apiKey) return;
  firebase.initializeApp(config);
  messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload?.notification?.title || "ShiftSitter";
    const options = {
      body: payload?.notification?.body || "You have a new update.",
      icon: "/logo-shiftsitter.png",
      badge: "/logo-shiftsitter.png",
      data: {
        link: payload?.data?.link || payload?.fcmOptions?.link || "/families/messages",
      },
    };
    self.registration.showNotification(title, options);
  });
  isInitialized = true;
}

self.addEventListener("message", (event) => {
  if (event?.data?.type === "FIREBASE_CONFIG") {
    initializeFirebase(event.data.payload);
  }
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.link || "/families/messages";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if (client.url.includes(targetUrl)) return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
