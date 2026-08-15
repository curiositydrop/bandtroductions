const SW_VERSION = 'bt-pwa-v3-notifications-test';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Intentionally no fetch interception or offline cache.
// The live site remains the source of truth while PWA features are tested.

self.addEventListener('message', event => {
  if (event.data?.type === 'BT_PWA_PING') {
    event.source?.postMessage?.({ type: 'BT_PWA_PONG', version: SW_VERSION });
  }
});

async function applyBadge(count) {
  const value = Math.max(0, Number(count) || 0);
  try {
    if (value > 0 && typeof self.registration.setAppBadge === 'function') {
      await self.registration.setAppBadge(value);
    } else if (value === 0 && typeof self.registration.clearAppBadge === 'function') {
      await self.registration.clearAppBadge();
    }
  } catch (error) {
    console.warn('BANDtroductions service-worker badge update failed:', error);
  }
}

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload = {};
    try {
      payload = event.data ? event.data.json() : {};
    } catch (_) {
      payload = { body: event.data?.text?.() || '' };
    }

    const title = payload.title || 'BANDtroductions';
    const body = payload.body || 'You have new activity on BANDtroductions.';
    const url = payload.url || '/notifications.html';

    if (Object.prototype.hasOwnProperty.call(payload, 'badgeCount')) {
      await applyBadge(payload.badgeCount);
    }

    await self.registration.showNotification(title, {
      body,
      icon: '/IMG_2293.png',
      badge: '/IMG_2292.png',
      tag: payload.tag || 'bandtroductions-activity',
      renotify: Boolean(payload.renotify),
      data: { url }
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const targetUrl = new URL(event.notification.data?.url || '/notifications.html', self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        if ('navigate' in client) await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
  })());
});
