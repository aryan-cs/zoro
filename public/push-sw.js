// Zoro's service worker, push part (imported by the generated one). iOS 18.4+ shows the rest
// timer's notifications by itself (they're Declarative Web Push messages); this shows the same
// message anywhere else, and opens the app when one is tapped.
self.addEventListener('push', (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { notification: { title: 'Zoro', body: event.data ? event.data.text() : '' } };
  }
  const n = msg.notification || {};
  event.waitUntil(self.registration.showNotification(n.title || 'Zoro', { body: n.body, tag: n.tag, data: { url: n.navigate }, icon: 'icon-192.png' }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      const open = all.find((c) => c.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
