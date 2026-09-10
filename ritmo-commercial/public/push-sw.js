self.addEventListener('push', (event) => {
  let data = { title: 'Ritmo', body: 'Você tem uma nova atualização.', icon: '/pwa-192.png', badge: '/pwa-192.png', url: '/', tag: 'ritmo-notification' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  const targetUrl = data.url || data.data?.url || '/';
  event.waitUntil(self.registration.showNotification(data.title || 'Ritmo', {
    body: data.body || '',
    icon: data.icon || '/pwa-192.png',
    badge: data.badge || '/pwa-192.png',
    tag: data.tag || 'ritmo-notification',
    data: { ...(data.data || {}), url: targetUrl },
    actions: data.actions || []
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
    for (const client of list) {
      if ('focus' in client) {
        if ('navigate' in client) await client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow ? clients.openWindow(target) : undefined;
  }));
});
