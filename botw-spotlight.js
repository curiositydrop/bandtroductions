// Band of the Week winner spotlight. Read-only.
// The Hall of Fame reads botwRounds (newest week first) and labels the newest
// round that has winners the Reigning Champ. This popup uses that same
// collection and query, then keeps only a finalized round (saved by
// finalizeRound, not the display-only Hall of Fame seed).

export const SHOW_DELAY_MS = 2000;
// First Band of the Week Hour airs Monday Nov 23, 2026, for the Nov 16–22 winner.
export const RADIO_HOUR_WEEK = '2026-11-16';
const CSS_HREF = 'botw-spotlight.css?v=1';
const SEEN_PREFIX = 'btBotwSpotlight:';
const PLACEHOLDER_PHOTO = /(?:^|\/)IMG_9367\.png(?:\?.*)?$/i;

const DENY_FILES = new Set([
  'admin.html',
  'admin-auditions.html',
  'launch-partners-admin.html',
  'band-of-the-week.html',
  'signup.html',
  'sign-up.html',
  'login.html',
  'welcome.html',
  'plans.html',
  'payment-success.html',
  'thank-you.html',
  'gear-payment.html',
  'website-merch-success.html',
  'claim-profile.html',
  'claim-existing-profile.html',
  'profile-setup.html',
  'profile-pending.html',
  'create-profile.html',
  'edit-band-profile.html',
  'submit-audition.html',
  'radio-submit.html',
  'popup.html'
]);

export function pageFile(pathname) {
  let path = String(pathname || '/');
  try { path = decodeURIComponent(path.split('?')[0].split('#')[0]); } catch { path = path.split('?')[0].split('#')[0]; }
  const last = path.split('/').filter(Boolean).pop() || '';
  if (!last) return 'index.html';
  const lower = last.toLowerCase();
  return lower.includes('.') ? lower : `${lower}.html`;
}

export function spotlightAllowed(pathname, search = '') {
  const path = String(pathname || '').toLowerCase();
  if (path.includes('/_preview/') || path.includes('/preview/')) return false;
  const file = pageFile(pathname);
  if (DENY_FILES.has(file)) return false;
  if (file.startsWith('website')) return false;
  if (file.startsWith('admin')) return false;
  if (/checkout|signup|sign-up|payment/.test(file)) return false;
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  if (file === 'merch.html' && params.get('manage') === '1') return false;
  return true;
}

export function pickFinalizedChamp(rounds) {
  const list = (Array.isArray(rounds) ? rounds : []).filter(round => {
    if (!round || round.seed === true) return false;
    if (!round.weekId || !round.finalizedAt) return false;
    return Array.isArray(round.winners) && round.winners.some(id => String(id || '').trim());
  });
  list.sort((a, b) => String(b.weekId).localeCompare(String(a.weekId)));
  const top = list[0];
  if (!top) return null;
  const winners = [];
  top.winners.forEach(id => {
    const value = String(id || '').trim();
    if (value && !winners.includes(value)) winners.push(value);
  });
  if (!winners.length) return null;
  return { weekId: String(top.weekId), label: String(top.label || ''), winners, finalizedAt: top.finalizedAt };
}

export function seenStorageKey(round) {
  const ids = [...(round?.winners || [])].map(id => String(id).trim()).filter(Boolean).sort();
  return `${SEEN_PREFIX}${round?.weekId || ''}:${ids.join(',')}`;
}

export function mentionsRadioHour(round, radioHourWeek = RADIO_HOUR_WEEK) {
  if (!round || round.seed === true || !round.finalizedAt || !round.weekId) return false;
  return String(round.weekId) >= String(radioHourWeek);
}

export function bandPhotoAvailable(src) {
  const value = String(src || '').trim();
  return Boolean(value) && !PLACEHOLDER_PHOTO.test(value);
}

export function joinNames(names) {
  const list = (Array.isArray(names) ? names : []).map(name => String(name || '').trim()).filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function safeHref(url) {
  const value = String(url || '').trim();
  if (!value || /^javascript:/i.test(value) || value.startsWith('//')) return '';
  return value;
}

function fallbackName(id) {
  return String(id || '').replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'BT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function readSeen(key) {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

function writeSeen(key) {
  try { localStorage.setItem(key, '1'); } catch { /* private mode still gets this visit */ }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadChampRounds() {
  const { db } = await import('./firebase-dev.js');
  const { collection, getDocs, query, orderBy } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js');
  const snap = await getDocs(query(collection(db, 'botwRounds'), orderBy('weekId', 'desc')));
  return snap.docs.map(docSnap => docSnap.data());
}

function ensureCss() {
  if (document.getElementById('bt-botw-spotlight-css')) return Promise.resolve();
  return new Promise(resolve => {
    const link = document.createElement('link');
    link.id = 'bt-botw-spotlight-css';
    link.rel = 'stylesheet';
    link.href = CSS_HREF;
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    link.onload = done;
    link.onerror = done;
    document.head.appendChild(link);
    setTimeout(done, 1500);
  });
}

function resolveBand(directory, id, slugify) {
  const slug = typeof slugify === 'function' ? slugify(id) : id;
  const hit = directory?.get?.(id) || directory?.get?.(slug);
  const name = hit?.name || fallbackName(id);
  const image = bandPhotoAvailable(hit?.image) ? hit.image : '';
  const url = safeHref(hit?.url) || safeHref(`${id}.html`);
  return { id, name, image, url };
}

function photoMarkup(band) {
  if (!band.image) return `<div class="initials" aria-hidden="true">${escapeHtml(initials(band.name))}</div>`;
  const alt = escapeHtml(`${band.name} profile photo`);
  const src = escapeHtml(band.image);
  return `<img src="${src}" alt="${alt}" width="156" height="156" loading="lazy" decoding="async">`;
}

function crownMarkup() {
  return `<svg class="crown" viewBox="0 0 64 48" aria-hidden="true"><path fill="#ffcc33" d="M6 40 10 16l12 12L32 6l10 22 12-12 4 24H6z"/><rect x="8" y="40" width="48" height="6" rx="2" fill="#ffe27a"/><circle cx="10" cy="14" r="3" fill="#fff6cc"/><circle cx="32" cy="6" r="3.2" fill="#fff6cc"/><circle cx="54" cy="14" r="3" fill="#fff6cc"/></svg>`;
}

function renderCard(champ, bands) {
  const names = joinNames(bands.map(band => band.name));
  const primary = bands[0];
  const kicker = bands.length > 1 ? 'Co-winners' : 'Reigning Champ';
  const prize = mentionsRadioHour(champ);
  const others = bands.slice(1).filter(band => band.url);
  const week = champ.label ? `<p class="week">${escapeHtml(champ.label)}</p>` : '';
  const prizeHtml = prize ? `<p class="prize" id="bt-botw-spot-prize">Catch their Band of the Week Hour on BANDtroductions Radio, Monday 12-1 PM ET</p>` : '';
  const profile = primary.url ? `<a class="go" href="${escapeHtml(primary.url)}">View ${escapeHtml(primary.name)}</a>` : '';
  const co = others.length ? `<p class="co">Also crowned ${others.map(band => `<a href="${escapeHtml(band.url)}">${escapeHtml(band.name)}</a>`).join(', ')}</p>` : '';
  const described = prize ? ' aria-describedby="bt-botw-spot-prize"' : '';
  return `<div class="card" role="dialog" aria-modal="true" aria-labelledby="bt-botw-spot-title"${described} tabindex="-1">
    <button type="button" class="close" aria-label="Close">×</button>
    <div class="badge">${crownMarkup()}<span>${escapeHtml(kicker)}</span></div>
    <div class="photo">${photoMarkup(primary)}</div>
    <h2 id="bt-botw-spot-title">Congratulations to <span class="band">${escapeHtml(names)}</span> for winning Band of the Week!</h2>
    ${week}
    ${prizeHtml}
    ${profile}
    ${co}
    <a class="vote" href="band-of-the-week.html">Vote for this week's Band of the Week</a>
  </div>`;
}

function focusable(card) {
  return [...card.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
}

function mount(champ, bands) {
  const overlay = document.createElement('div');
  overlay.id = 'bt-botw-spotlight';
  overlay.innerHTML = renderCard(champ, bands);
  const card = overlay.querySelector('.card');
  const previous = document.activeElement;
  const overflow = document.body.style.overflow;
  const inerted = [];
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  [...document.body.children].forEach(child => {
    if (child === overlay || child.hasAttribute('inert')) return;
    child.setAttribute('inert', '');
    inerted.push(child);
  });

  const image = overlay.querySelector('img');
  image?.addEventListener('error', () => {
    const fallback = document.createElement('div');
    fallback.className = 'initials';
    fallback.setAttribute('aria-hidden', 'true');
    fallback.textContent = initials(bands[0].name);
    image.replaceWith(fallback);
  });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    inerted.forEach(child => child.removeAttribute('inert'));
    document.body.style.overflow = overflow;
    overlay.remove();
    if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus();
  };

  const onKey = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const nodes = focusable(card);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === card)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  overlay.querySelector('.close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  card.focus();
}

function welcomeHost() {
  return document.getElementById('bt-welcome-v2-host');
}

async function waitUntilWelcomeClears() {
  if (pageFile(location.pathname) !== 'index.html') return;
  const appearBy = Date.now() + 1200;
  while (Date.now() < appearBy && !welcomeHost()) await delay(80);
  while (welcomeHost()) await delay(150);
}

async function boot() {
  if (window.__btBotwSpotlightBooted) return;
  window.__btBotwSpotlightBooted = true;
  try { if (window.top !== window) return; } catch { return; }
  if (!spotlightAllowed(location.pathname, location.search)) return;

  const cssReady = ensureCss();
  const roundsPromise = loadChampRounds().catch(() => null);
  await delay(SHOW_DELAY_MS);
  const rounds = await roundsPromise;
  if (!rounds) return;
  const champ = pickFinalizedChamp(rounds);
  if (!champ) return;
  const seenKey = seenStorageKey(champ);
  if (readSeen(seenKey)) return;
  await waitUntilWelcomeClears();
  if (!spotlightAllowed(location.pathname, location.search) || document.getElementById('bt-botw-spotlight')) return;
  await cssReady;
  let directory = new Map();
  let slugify = value => String(value || '').toLowerCase();
  try {
    const core = await import('./botw-core.js?v=11');
    if (typeof core.slugify === 'function') slugify = core.slugify;
    directory = await Promise.race([
      core.loadDirectory(),
      delay(5000).then(() => new Map())
    ]);
  } catch { directory = new Map(); }
  const bands = champ.winners.map(id => resolveBand(directory, id, slugify)).filter(band => band.name);
  if (!bands.length) return;
  writeSeen(seenKey);
  mount(champ, bands);
}

function start() {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { boot(); }, { once: true });
  else boot();
}

if (typeof document !== 'undefined') start();
