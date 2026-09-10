self.addEventListener('push', (event) => {
  let data = { title: 'Ritmo', body: 'Você tem uma nova atualização.', icon: '/pwa-192.svg', data: { url: '/' } };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch { if (event.data) data.body = event.data.text(); }
  event.waitUntil(self.registration.showNotification(data.title || 'Ritmo', {
    body: data.body || '', icon: data.icon || '/pwa-192.svg', badge: data.badge || '/pwa-192.svg',
    tag: data.tag || 'ritmo-notification', data: data.data || { url: '/' }, actions: data.actions || []
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const client of list) { if ('focus' in client) { client.navigate?.(target); return client.focus(); } }
    return clients.openWindow ? clients.openWindow(target) : undefined;
  }));
});
