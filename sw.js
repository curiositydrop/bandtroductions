const SW_VERSION = 'bt-pwa-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Intentionally no fetch interception or offline cache in v1.
// The live site remains the source of truth while installation is tested.

self.addEventListener('message', event => {
  if (event.data?.type === 'BT_PWA_PING') {
    event.source?.postMessage?.({ type: 'BT_PWA_PONG', version: SW_VERSION });
  }
});
