// Firebase Cloud Messaging Service Worker
// Replace the firebaseConfig values with your actual Firebase web app config
// from Firebase Console > Project Settings > General > Your apps

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// TODO: Replace with actual values from Firebase Console > Project Settings > General
firebase.initializeApp({
  apiKey: self.FIREBASE_API_KEY || 'your-api-key',
  authDomain: self.FIREBASE_AUTH_DOMAIN || 'your-project.firebaseapp.com',
  projectId: self.FIREBASE_PROJECT_ID || 'your-firebase-project-id',
  storageBucket: self.FIREBASE_STORAGE_BUCKET || 'your-project.appspot.com',
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId: self.FIREBASE_APP_ID || '1:000000000000:web:xxxx',
});

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
