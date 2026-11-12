// Same-origin relative return targets only. Rejects schemes, protocol-relative
// URLs, backslashes, and any host other than the base used to parse the value.
const PAGE = /^\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.html$/;
const BASE = 'https://bandtroductions.invalid/';

export function safeSameOriginReturn(value, fallback = 'index.html') {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 512) return fallback;
  if (/[\u0000-\u001F\u007F\\]/.test(raw)) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
  let url;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== 'https://bandtroductions.invalid') return fallback;
  if (url.username || url.password) return fallback;
  if (!PAGE.test(url.pathname)) return fallback;
  const relative = url.pathname.replace(/^\/+/, '') + url.search + url.hash;
  if (!relative || relative.startsWith('//') || relative.includes('\\') || relative.includes('@')) return fallback;
  return relative;
}

export const UPGRADE_RETURN = 'plans.html?upgrade=1';

export function isUpgradeReturn(value) {
  const safe = safeSameOriginReturn(value, '');
  if (!safe) return false;
  try {
    const url = new URL(safe, BASE);
    return url.pathname === '/plans.html' && url.searchParams.get('upgrade') === '1';
  } catch {
    return false;
  }
}
