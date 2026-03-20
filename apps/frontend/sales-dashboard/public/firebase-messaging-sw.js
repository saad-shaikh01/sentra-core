// Firebase Cloud Messaging Service Worker
// NOTE: Service workers cannot access process.env or NEXT_PUBLIC_* variables.
// These values are injected at build time by scripts/generate-firebase-sw.cjs
// DO NOT edit the config values below manually — run the generator script instead.
// See: deploy/scripts/generate-firebase-sw.cjs

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// __FIREBASE_CONFIG__ is replaced by generate-firebase-sw.cjs at deploy time
const firebaseConfig = self.__FIREBASE_CONFIG__ || {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);

  const messaging = firebase.messaging();

  // Background message: show native notification
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title ?? 'New notification';
    const body = payload.notification?.body ?? '';
    const url = payload.data?.url ?? '/';

    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: { url },
      requireInteraction: false,
    });
  });

  // Click on background notification -> navigate
  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url ?? '/';

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(url);
      }),
    );
  });
}
