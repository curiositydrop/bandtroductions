const { chromium, webkit } = require('/tmp/bt-website-tests/node_modules/playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const mock = String.raw`
const records = new Map();
export const app = {};
export const auth = { currentUser: null };
export const db = {};
export const storage = {};
export function collection(_db, name) { return { collection: name }; }
export function doc(base, ...parts) {
  if (base && base.collection) return { path: base.collection + '/' + (parts[0] || ('auto-' + Math.random().toString(16).slice(2))), id: parts[0] || 'auto' };
  return { path: parts.join('/'), id: parts[parts.length - 1] };
}
export function where() { return {}; }
export function query(base) { return base; }
export function limit() { return {}; }
export function serverTimestamp() { return { __serverTimestamp: true }; }
export async function getDoc(target) {
  if (globalThis.__profile && globalThis.__user && target.path === 'profiles/' + globalThis.__user.uid) {
    return { id: target.id, exists: () => true, data: () => globalThis.__profile };
  }
  const data = records.get(target.path);
  return { id: target.id, exists: () => records.has(target.path), data: () => data };
}
export async function getDocs() {
  if (globalThis.__adminsDenied) {
    const error = new Error('Missing or insufficient permissions.');
    error.code = 'permission-denied';
    throw error;
  }
  const docs = (globalThis.__admins || []).map(row => ({ id: row.id, data: () => row }));
  return { docs, empty: !docs.length };
}
function remember(row) {
  const rows = JSON.parse(sessionStorage.getItem('btWrites') || '[]');
  rows.push(row);
  sessionStorage.setItem('btWrites', JSON.stringify(rows));
}
export async function setDoc(target, data) {
  records.set(target.path, { ...(records.get(target.path) || {}), ...data });
  remember({ path: target.path, type: data.type || '', recipientId: data.recipientId || '', linkUrl: data.linkUrl || '', message: data.message || '', accountType: data.accountType || '' });
}
export async function updateDoc(target, data) { return setDoc(target, data); }
export async function addDoc(col, data) {
  const id = 'saved-' + ((globalThis.__seq = (globalThis.__seq || 0) + 1));
  const savedPath = (col.collection || 'added') + '/' + id;
  records.set(savedPath, data);
  remember({ path: savedPath, type: data.type || data.gallery || '', gallery: data.gallery || '', btvStatus: data.btvStatus || '', published: data.published === true });
  return { id, path: savedPath };
}
export function onSnapshot(_q, fn) { queueMicrotask(() => fn({ docs: (globalThis.__mediaDocs || []).map(row => ({ id: row.id, data: () => row })) })); return () => {}; }
export function onAuthStateChanged(_auth, fn) { queueMicrotask(() => fn(globalThis.__user || null)); return () => {}; }
export async function createUserWithEmailAndPassword(_auth, email) {
  const user = { uid: globalThis.__uid || 'uid-new', email };
  auth.currentUser = user;
  return { user };
}
export async function sendEmailVerification() {}
export async function updateProfile() {}
export function getFunctions() { return {}; }
export function httpsCallable() { return async () => { const error = new Error('not found'); error.code = 'functions/not-found'; throw error; }; }
export function initializeApp() { return app; }
export function getAuth() { return auth; }
export function getFirestore() { return db; }
export function getStorage() { return storage; }
export async function deleteDoc() {}
export async function uploadBytes() {}
export async function getDownloadURL() { return 'https://example.com/file'; }
`;

function startServer() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    if (pathname === '/mock-firebase.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(mock);
      return;
    }
    if (pathname.includes('..')) { res.statusCode = 403; res.end(); return; }
    let file = path.join(root, pathname);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(root) || !fs.existsSync(file)) { res.statusCode = 404; res.end('missing'); return; }
    const type = file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
    res.setHeader('Content-Type', type);
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, base: 'http://127.0.0.1:' + server.address().port })));
}

async function open(browser, base, { mobile = false, viewport = { width: 1280, height: 900 }, userAgent } = {}) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, userAgent });
  const page = await context.newPage();
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.includes('/firebase-dev.js') || url.startsWith('https://www.gstatic.com/firebasejs/')) {
      return route.fulfill({ contentType: 'text/javascript', body: 'export * from "' + base + '/mock-firebase.js";', headers: { 'access-control-allow-origin': '*' } });
    }
    if (url.includes('formsubmit.co')) return route.fulfill({ status: 522, contentType: 'text/plain', body: 'timeout' });
    if (url.includes('/global.js') || url.includes('bt-analytics.js')) return route.fulfill({ contentType: 'text/javascript', body: '' });
    if (/\/(?:profile|claim-profile|website)\.html/.test(url)) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Destination</title><p>Saved destination</p>' });
    if (url.startsWith(base)) return route.continue();
    return route.abort();
  });
  return { context, page };
}

async function fillSignup(page, role) {
  await page.locator('#email').fill(role + '@example.com');
  await page.locator('#password').fill('password123');
  await page.waitForFunction(() => !document.getElementById('continue-button').disabled);
  await page.locator('#continue-button').click();
  await page.locator('#profile-step').waitFor({ state: 'visible' });
  await page.locator('#account-type').selectOption(role);
  await page.locator('#display-name').fill('Act ' + role);
  await page.locator('#city').fill('Portland');
  await page.locator('#region').fill('Maine');
  await page.locator('#country').fill('United States');
  await page.locator('#bio').fill('Local test profile only.');
  if (role === 'band' || role === 'musician') await page.locator('#music-type').selectOption('original');
  for (const id of ['community-rules', 'adult-content-rules', 'rights-acknowledgment', 'promo-use']) await page.locator('#' + id).check();
  await page.waitForFunction(() => !document.getElementById('signup-button').disabled);
  await page.locator('#signup-button').click();
}

(async () => {
  const { server, base } = await startServer();
  const chrome = await chromium.launch({ headless: true });
  let kit = null;
  try { kit = await webkit.launch({ headless: true }); } catch (error) { console.log('UNVERIFIED webkit', error.message); }
  try {
    const adminDoc = { id: 'admin-profile', isAdmin: true, ownerId: 'uid-mike' };
    for (const role of ['band', 'musician', 'venue', 'fan']) {
      const session = await open(chrome, base);
      await session.page.addInitScript(payload => { window.__uid = payload.uid; window.__admins = payload.admins; window.__writes = []; }, { uid: 'uid-' + role, admins: [adminDoc] });
      const started = Date.now();
      await session.page.goto(base + '/signup.html', { waitUntil: 'domcontentloaded' });
      await fillSignup(session.page, role);
      await session.page.waitForURL(/profile\.html\?id=uid-/, { timeout: 8000 });
      assert.ok(Date.now() - started < 7000, role + ' waited on email');
      const notes = await session.page.evaluate(() => JSON.parse(sessionStorage.getItem('btWrites') || '[]').filter(row => String(row.path).startsWith('notifications/')));
      assert.equal(notes.length, 1, role);
      assert.equal(notes[0].recipientId, 'uid-mike');
      assert.equal(notes[0].type, 'new_account');
      assert.equal(notes[0].linkUrl, 'profile.html?id=uid-' + role);
      assert.match(notes[0].message, new RegExp('New ' + role + ' account'));
      const ids = await session.page.evaluate(() => JSON.parse(sessionStorage.getItem('btWrites') || '[]').map(row => row.path).filter(path => path.startsWith('notifications/')));
      assert.equal(new Set(ids).size, ids.length);
      console.log('PASS signup notice', role);
      await session.context.close();
    }

    {
      const session = await open(chrome, base);
      await session.page.addInitScript(() => { window.__uid = 'uid-none'; window.__admins = []; window.__writes = []; });
      await session.page.goto(base + '/signup.html', { waitUntil: 'domcontentloaded' });
      await fillSignup(session.page, 'fan');
      await session.page.locator('#signup-notice-continue').waitFor({ state: 'visible' });
      assert.match(await session.page.locator('#signup-message').innerText(), /No administrator profile is marked isAdmin/);
      assert.match(await session.page.locator('#signup-message').innerText(), /not confirmed/);
      assert.equal(session.page.url().includes('signup.html'), true);
      const saved = await session.page.evaluate(() => JSON.parse(sessionStorage.getItem('btWrites') || '[]').map(row => row.path));
      assert.ok(saved.some(path => path.startsWith('users/')));
      assert.ok(saved.some(path => path.startsWith('profiles/')));
      console.log('PASS signup reports missing admin without losing the account');
      await session.context.close();
    }

    {
      const session = await open(chrome, base);
      await session.page.addInitScript(() => { window.__uid = 'uid-denied'; window.__adminsDenied = true; window.__writes = []; });
      await session.page.goto(base + '/signup.html', { waitUntil: 'domcontentloaded' });
      await fillSignup(session.page, 'band');
      await session.page.locator('#signup-notice-continue').waitFor({ state: 'visible' });
      assert.match(await session.page.locator('#signup-message').innerText(), /database permissions/);
      const saved = await session.page.evaluate(() => JSON.parse(sessionStorage.getItem('btWrites') || '[]').map(row => row.path));
      assert.ok(saved.some(path => path.startsWith('profiles/uid-denied')));
      console.log('PASS signup reports permission failure without losing the profile');
      await session.context.close();
    }

    {
      const session = await open(chrome, base);
      await session.page.addInitScript(() => { window.__uid = 'uid-claim'; window.__admins = [{ id: 'admin-profile', isAdmin: true, ownerId: 'uid-mike' }]; window.__writes = []; });
      await session.page.goto(base + '/signup.html?returnTo=' + encodeURIComponent('claim-profile.html?type=band&name=Old%20Band'), { waitUntil: 'domcontentloaded' });
      await session.page.locator('#email').fill('claim@example.com');
      await session.page.locator('#password').fill('password123');
      for (const id of ['claim-community-rules', 'claim-adult-content-rules', 'claim-rights-acknowledgment', 'claim-promo-use']) await session.page.locator('#' + id).check();
      await session.page.waitForFunction(() => !document.getElementById('continue-button').disabled);
      await session.page.locator('#continue-button').click();
      await session.page.waitForURL(/claim-profile\.html/, { timeout: 8000 });
      const notes = await session.page.evaluate(() => JSON.parse(sessionStorage.getItem('btWrites') || '[]').filter(row => String(row.path).startsWith('notifications/')));
      assert.equal(notes.length, 1);
      assert.match(notes[0].message, /claiming an existing profile/);
      assert.equal(notes[0].recipientId, 'uid-mike');
      console.log('PASS claim signup notice');
      await session.context.close();
    }

    {
      const session = await open(chrome, base);
      await session.page.addInitScript(() => {
        window.__user = { uid: 'uid-fan', email: 'fan@example.com' };
        window.__profile = { accountType: 'fan', displayName: 'Fan' };
        window.__mediaDocs = [
          { id: 'pending1', gallery: 'btv', btvStatus: 'pending', videoUrl: 'https://example.com/pending.mp4', band: 'Secret', title: 'Not On Air', btvType: 'video' },
          { id: 'live1', gallery: 'btv', btvStatus: 'approved', videoUrl: 'https://example.com/live.mp4', band: 'Live Band', title: 'Approved Clip', btvType: 'interview' }
        ];
      });
      await session.page.goto(base + '/btv.html', { waitUntil: 'domcontentloaded' });
      await session.page.waitForFunction(() => document.getElementById('btv-form')?.hidden === true);
      const list = await session.page.locator('#btv-list').innerText();
      assert.match(list, /Approved Clip/);
      assert.doesNotMatch(list, /Not On Air/);
      console.log('PASS fan cannot upload BTV and pending video is not on air');
      await session.context.close();
    }

    const engines = [['chromium', chrome, false]];
    if (kit) engines.push(['webkit', kit, true]);
    for (const [name, browser, mobile] of engines) {
      for (const [width, height] of mobile ? [[390, 844], [320, 568]] : [[1280, 900]]) {
        const session = await open(browser, base, {
          mobile,
          viewport: { width, height },
          userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' : undefined
        });
        await session.page.addInitScript(() => {
          const ready = Promise.resolve({ pushManager: { getSubscription: async () => null } });
          Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready, addEventListener() {}, controller: null } });
          window.__user = { uid: 'uid-mike', email: 'mbergeron79@gmail.com' };
          window.__admins = [];
        });
        await session.page.goto(base + '/notifications.html', { waitUntil: 'domcontentloaded' });
        await session.page.locator('#push-card-title').waitFor();
        const card = await session.page.locator('.push-card').innerText();
        assert.match(card, /In-site notices/);
        assert.match(card, /Add to Home Screen/);
        assert.doesNotMatch(card, /Phone banners are enabled/);
        const box = await session.page.locator('#enable-push').boundingBox();
        assert.ok(box && box.height >= 44, name + ' button ' + (box && box.height));
        const overflow = await session.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
        assert.equal(overflow, true, name + ' ' + width);
        console.log('PASS notification settings', name, width + 'x' + height, mobile ? 'simulated WebKit iPhone Safari, not a physical device' : 'desktop');
        await session.context.close();
      }
    }
    console.log('UNVERIFIED physical iPhone Safari');
  } finally {
    await chrome.close();
    if (kit) await kit.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exit(1); });
