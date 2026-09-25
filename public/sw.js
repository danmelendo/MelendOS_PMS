// Minimal service worker for the "Stays" mobile app. It exists so the page can
// surface real OS-level notifications via registration.showNotification() (which
// mobile browsers require — the Notification constructor is unavailable there).
// Availability watches are evaluated in the page (see src/lib/notifications.ts);
// this worker only displays the notification and handles clicks. A production
// build would add a 'push' handler here driven by the PMS via Web Push + VAPID.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/stays/trips";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
