(() => {
  const state = {
    deferredPrompt: null,
    installed: window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true
  };

  function ensureHeadTag(selector, create) {
    if (document.head.querySelector(selector)) return;
    const node = create();
    if (node) document.head.appendChild(node);
  }

  ensureHeadTag('link[rel="manifest"]', () => {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/manifest.webmanifest?v=1';
    return link;
  });

  ensureHeadTag('meta[name="theme-color"]', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#090a0a';
    return meta;
  });

  ensureHeadTag('meta[name="apple-mobile-web-app-capable"]', () => {
    const meta = document.createElement('meta');
    meta.name = 'apple-mobile-web-app-capable';
    meta.content = 'yes';
    return meta;
  });

  ensureHeadTag('meta[name="apple-mobile-web-app-status-bar-style"]', () => {
    const meta = document.createElement('meta');
    meta.name = 'apple-mobile-web-app-status-bar-style';
    meta.content = 'black-translucent';
    return meta;
  });

  ensureHeadTag('meta[name="apple-mobile-web-app-title"]', () => {
    const meta = document.createElement('meta');
    meta.name = 'apple-mobile-web-app-title';
    meta.content = 'BANDtroductions';
    return meta;
  });

  ensureHeadTag('link[rel="apple-touch-icon"]', () => {
    const link = document.createElement('link');
    link.rel = 'apple-touch-icon';
    link.href = '/pwa-icon-192.png?v=1';
    return link;
  });

  function analytics(eventName, params = {}) {
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, params);
      }
    } catch (_) {}
  }

  function dispatch(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.deferredPrompt = event;
    analytics('pwa_install_available');
    dispatch('bt:pwa-install-available');
  });

  window.addEventListener('appinstalled', () => {
    state.deferredPrompt = null;
    state.installed = true;
    analytics('pwa_installed');
    dispatch('bt:pwa-installed');
  });

  async function install() {
    if (state.installed) return { status: 'installed' };
    if (!state.deferredPrompt) return { status: 'unavailable' };

    const prompt = state.deferredPrompt;
    state.deferredPrompt = null;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    analytics('pwa_install_prompt_result', { outcome: choice?.outcome || 'unknown' });
    dispatch('bt:pwa-install-result', { outcome: choice?.outcome || 'unknown' });
    return { status: choice?.outcome || 'unknown' };
  }

  window.BANDtroductionsPWA = {
    install,
    isInstalled: () => state.installed,
    canPrompt: () => Boolean(state.deferredPrompt),
    isIOS: () => /iphone|ipad|ipod/i.test(navigator.userAgent),
    isStandalone: () => state.installed
  };

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(registration => {
          analytics('pwa_service_worker_ready', { scope: registration.scope });
          dispatch('bt:pwa-service-worker-ready', { scope: registration.scope });
        })
        .catch(error => console.warn('BANDtroductions PWA service worker registration failed:', error));
    }, { once: true });
  }
})();
