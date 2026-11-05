const { chromium, webkit } = require('/tmp/bt-signup-tests/node_modules/playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const reviewDir = '/tmp/signup-review';
const artifactDir = '/opt/cursor/artifacts';
fs.mkdirSync(reviewDir, { recursive: true });
fs.mkdirSync(artifactDir, { recursive: true });

const OFFER_LABEL = 'Yes! I\u2019m interested in my own website for $15/month.';
const results = [];

function record(name, status, detail) {
  results.push({ name, status, detail });
  console.log(`${status}: ${name}${detail ? ` — ${detail}` : ''}`);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function staticChecks() {
  const signup = read('signup.html');
  assert.equal(signup.includes(OFFER_LABEL), true, 'exact upgrade checkbox text');
  assert.equal(signup.includes('await sendAdminApprovalEmail'), false, 'signup must not wait on the admin email');
  assert.equal(signup.includes('void sendAdminApprovalEmail'), true, 'signup still attempts the admin email');
  assert.equal(signup.includes('websiteUpgradeInterest'), true);
  assert.equal(/websiteInterest|upgradeSelected:\s*true/.test(signup), false, 'do not persist upgrade interest');
  for (const benefit of [
    'Full customizable artist website',
    'Merch storefront listed in the Merch Hub',
    'Shows, booking, music, photos and videos',
    'Your existing profile information carries over automatically',
    '$15 today. Includes your first month. Your next 2 months are free, then $15/month. Cancel anytime.'
  ]) {
    assert.equal(signup.includes(benefit), true, benefit);
  }
  assert.equal(signup.includes('custom domain'), false, 'do not add a custom-domain benefit the upgrade page does not list');
  assert.equal(read('website.html').includes('buy.stripe.com/14AaEQbcy0tsfzP3mj6oo0g'), true, 'existing checkout link preserved');
  assert.equal(read('website.html').includes('prepareArtistUpgrade'), true);
  assert.equal(read('functions/main.js').includes("new Set(['band', 'musician'])"), true, 'callable already allows bands and musicians');

  const legacy = [
    'submit-band.html',
    'submit-musician.html',
    'submit-venue.html',
    'submit-band-test.html',
    'submit-band/index.html',
    'submit-musician/index.html',
    'submit-venue/index.html'
  ];
  for (const file of legacy) {
    const html = read(file);
    assert.equal(/formsubmit\.co/i.test(html), false, `${file} still posts to FormSubmit`);
    assert.equal(html.includes('legacy-signup-redirect.js'), true, file);
  }
  assert.equal(read('bands.html').includes('href="signup.html?type=band"'), true);
  assert.equal(read('musicians.html').includes('href="signup.html?type=musician"'), true);
  assert.equal(read('venues.html').includes('href="signup.html?type=venue"'), true);
  assert.equal(read('band-profile.html').includes('href="signup.html?type=band"'), true);
  assert.equal(read('musician-profile.html').includes('href="signup.html?type=venue"'), true);
  assert.equal(read('firebase.json').includes('"hosting"'), false, 'default firebase.json must not gain a live hosting target');
  record('static source safeguards', 'PASS', 'legacy forms, checkbox copy, email await, payment files');
}

const mock = String.raw`
const records = new Map();
const writes = [];
function restore() {
  try {
    JSON.parse(sessionStorage.getItem('btMockRecords') || '[]').forEach(([key, value]) => records.set(key, value));
  } catch {}
}
restore();
let initialUser = null;
try { initialUser = JSON.parse(sessionStorage.getItem('btMockUser') || 'null'); } catch {}
export const app = {};
export const auth = { currentUser: initialUser };
export const db = {};
export const storage = {};
function persist() {
  sessionStorage.setItem('btMockRecords', JSON.stringify([...records.entries()]));
  sessionStorage.setItem('btMockWrites', JSON.stringify(writes));
}
export function collection(_db, name) { return { collection: name }; }
export function doc(base, ...parts) {
  if (base && base.collection) return { path: base.collection + '/' + (parts[0] || 'auto'), id: parts[0] || 'auto' };
  return { path: parts.join('/'), id: parts[parts.length - 1] };
}
export function where() { return {}; }
export function query(base) { return base; }
export function serverTimestamp() { return { __serverTimestamp: true }; }
export async function getDoc(target) {
  const data = records.get(target.path);
  return { id: target.id, exists: () => records.has(target.path), data: () => data };
}
export async function getDocs() {
  return { docs: [{ id: 'admin-profile', data: () => ({ isAdmin: true, ownerId: 'admin-owner' }) }] };
}
export async function setDoc(target, data) {
  if (globalThis.__failProfile && String(target.path).startsWith('profiles/')) throw new Error('Profile save failed');
  writes.push({ op: 'set', path: target.path, keys: Object.keys(data || {}) });
  records.set(target.path, { ...(records.get(target.path) || {}), ...data });
  persist();
}
export async function updateDoc(target, data) {
  writes.push({ op: 'update', path: target.path, keys: Object.keys(data || {}) });
  records.set(target.path, { ...(records.get(target.path) || {}), ...data });
  persist();
}
export function onAuthStateChanged(authObj, fn) {
  queueMicrotask(() => fn(authObj.currentUser));
  return () => {};
}
export async function createUserWithEmailAndPassword(authObj, email) {
  if (globalThis.__failSignup) {
    const error = new Error('That email already has an account.');
    error.code = globalThis.__failCode || 'auth/email-already-in-use';
    throw error;
  }
  const user = { uid: 'new-user-test', email };
  authObj.currentUser = user;
  sessionStorage.setItem('btMockUser', JSON.stringify(user));
  return { user };
}
export async function sendEmailVerification() { return; }
export async function updateProfile() { return; }
export function getFunctions() { return {}; }
export function httpsCallable() {
  return async (data) => {
    const calls = JSON.parse(sessionStorage.getItem('btPrepareCalls') || '[]');
    calls.push(data);
    sessionStorage.setItem('btPrepareCalls', JSON.stringify(calls));
    if (globalThis.__prepareMode === 'fail') throw new Error('The upgrade could not be started. Please try again.');
    if (globalThis.__prepareMode === 'active') return { data: { subscriptionStatus: 'active', contactEmail: 'artist@example.com' } };
    return { data: { subscriptionStatus: 'pending', contactEmail: 'artist@example.com' } };
  };
}
export function initializeApp() { return app; }
export function getAuth() { return auth; }
export function getFirestore() { return db; }
export function getStorage() { return storage; }
`;

function contentType(file) {
  if (file.endsWith('.js')) return 'text/javascript';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.html')) return 'text/html';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function startServer() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    if (pathname === '/mock-firebase.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(mock);
      return;
    }
    if (pathname.includes('..')) {
      res.statusCode = 403;
      res.end();
      return;
    }
    let file = path.join(root, pathname);
    if (!file.startsWith(root)) {
      res.statusCode = 403;
      res.end();
      return;
    }
    try {
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      res.setHeader('Content-Type', contentType(file));
      res.end(fs.readFileSync(file));
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function openPage(browser, base, { viewport = { width: 1280, height: 900 }, mobile = false, userAgent } = {}) {
  const state = { stripe: [], live: [], formsubmit: 0 };
  const context = await browser.newContext({
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
    userAgent
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.includes('/firebase-dev.js') || url.startsWith('https://www.gstatic.com/firebasejs/')) {
      return route.fulfill({
        contentType: 'text/javascript',
        body: `export * from "${base}/mock-firebase.js";`,
        headers: { 'access-control-allow-origin': '*' }
      });
    }
    if (url.includes('formsubmit.co')) {
      state.formsubmit += 1;
      if (state.emailDelayMs) await new Promise(resolve => setTimeout(resolve, state.emailDelayMs));
      return route.fulfill({ status: 522, contentType: 'text/plain', body: 'connection timed out' });
    }
    if (url.includes('buy.stripe.com')) {
      state.stripe.push(url);
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>Checkout intercepted</title><p>Stripe checkout was intercepted and was not submitted.</p>'
      });
    }
    if (url.startsWith(base) && /\/(?:profile|website-pilot)\.html/.test(url)) {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Destination stub</title><p>Local test destination. No account was created.</p>'
      });
    }
    if (url.startsWith(base)) return route.continue();
    state.live.push(url);
    return route.abort();
  });
  return { context, page, state, errors };
}

async function revealProfile(page) {
  await page.locator('#email').fill('artist@example.com');
  await page.locator('#password').fill('password123');
  await page.waitForFunction(() => !document.getElementById('continue-button').disabled);
  await page.locator('#continue-button').click();
  await page.locator('#profile-step').waitFor({ state: 'visible' });
}

async function fillFreeProfile(page, type) {
  await page.locator('#account-type').selectOption(type);
  await page.locator('#display-name').fill(type === 'fan' ? 'Test Fan' : type === 'venue' ? 'Test Venue' : 'Test Artist');
  await page.locator('#city').fill('Portland');
  await page.locator('#region').fill('Maine');
  await page.locator('#country').fill('United States');
  await page.locator('#bio').fill('Local test profile for the signup preview. No live account.');
  if (type === 'band' || type === 'musician') await page.locator('#music-type').selectOption('original');
  for (const id of ['community-rules', 'adult-content-rules', 'rights-acknowledgment', 'promo-use']) {
    await page.locator(`#${id}`).check();
  }
  await page.waitForFunction(() => !document.getElementById('signup-button').disabled);
}

async function shot(page, name, locator) {
  const target = path.join(reviewDir, name);
  if (locator) await locator.screenshot({ path: target });
  else await page.screenshot({ path: target, fullPage: false });
  fs.copyFileSync(target, path.join(artifactDir, name));
}

function assertNoLive(state, errors) {
  assert.equal(state.live.filter(url => /googleapis|firebaseio|identitytoolkit|securetoken|stripe\.com/.test(url) && !url.includes('buy.stripe.com')).length, 0, `live backend calls: ${state.live.join(', ')}`);
  const serious = errors.filter(message => !/analytics|gtag|google/i.test(message));
  assert.deepEqual(serious, [], serious.join('\n'));
}

async function overflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
}

async function run() {
  staticChecks();
  const { server, base } = await startServer();
  const chrome = await chromium.launch({ headless: true });
  let kit = null;
  try {
    kit = await webkit.launch({ headless: true });
    record('simulated WebKit launch', 'PASS', 'Playwright WebKit, not a physical iPhone');
  } catch (error) {
    record('simulated WebKit launch', 'UNVERIFIED', error.message);
  }

  try {
    const desktop = await openPage(chrome, base);
    const page = desktop.page;
    await page.goto(`${base}/signup.html?type=band`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#account-type').inputValue(), 'band');
    await revealProfile(page);
    const offer = page.locator('#website-upgrade-offer');
    await offer.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#website-upgrade-interest').isChecked(), false);
    assert.equal(await page.locator('#website-upgrade-label').innerText(), OFFER_LABEL);
    assert.equal(await page.locator('#website-upgrade-details').evaluate(node => node.open), false);
    await page.locator('#website-upgrade-offer').scrollIntoViewIfNeeded();
    await shot(page, 'band-offer-collapsed.png', offer);
    const collapsedSize = await page.locator('.signup-upgrade-check').boundingBox();
    assert.ok(collapsedSize.height >= 44, `checkbox row ${collapsedSize.height}px`);
    const summarySize = await page.locator('#website-upgrade-details summary').boundingBox();
    assert.ok(summarySize.height >= 44, `summary ${summarySize.height}px`);
    await page.locator('#website-upgrade-details summary').click();
    assert.equal(await page.locator('#website-upgrade-details').evaluate(node => node.open), true);
    await shot(page, 'band-offer-expanded.png', offer);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#website-upgrade-details').evaluate(node => node.open), false, 'Escape closes the disclosure');
    await page.locator('#website-upgrade-interest').check();
    await page.locator('#account-type').selectOption('musician');
    assert.equal(await page.locator('#website-upgrade-interest').isChecked(), false, 'type switch clears the checkbox');
    assert.equal(await offer.isVisible(), true);
    assert.equal(await page.locator('#musician-fields').isVisible(), true);
    await page.locator('#website-upgrade-details summary').click();
    await shot(page, 'musician-offer-expanded.png', offer);
    await page.locator('#website-upgrade-details summary').click();
    await shot(page, 'musician-offer-collapsed.png', offer);
    await page.locator('#account-type').selectOption('venue');
    assert.equal(await offer.isHidden(), true);
    assert.equal(await page.locator('#website-upgrade-interest').isChecked(), false);
    assert.equal(await page.locator('#venue-fields').isVisible(), true);
    await page.locator('#account-type').scrollIntoViewIfNeeded();
    await shot(page, 'venue-no-offer.png');
    await page.locator('#account-type').selectOption('fan');
    assert.equal(await offer.isHidden(), true);
    assert.equal(await page.locator('#fan-fields').isVisible(), true);
    await page.locator('#account-type').scrollIntoViewIfNeeded();
    await shot(page, 'fan-no-offer.png');
    await page.locator('#account-type').selectOption('band');
    assert.equal(await page.locator('#website-upgrade-interest').isChecked(), false, 'returning to band does not restore a stale check');
    record('role switching and disclosure', 'PASS', 'band/musician offer, venue/fan hidden, stale check cleared');
    await desktop.context.close();

    async function register(type, { upgrade = false, preset = '', failSignup = false, failProfile = false, emailDelayMs = 0 } = {}) {
      const session = await openPage(chrome, base);
      session.state.emailDelayMs = emailDelayMs;
      if (failSignup || failProfile) {
        await session.page.addInitScript(flags => {
          window.__failSignup = flags.failSignup;
          window.__failProfile = flags.failProfile;
        }, { failSignup, failProfile });
      }
      await session.page.goto(`${base}/signup.html${preset ? `?type=${preset}` : ''}`, { waitUntil: 'domcontentloaded' });
      await revealProfile(session.page);
      if (preset) assert.equal(await session.page.locator('#account-type').inputValue(), preset);
      await fillFreeProfile(session.page, type);
      if (upgrade) await session.page.locator('#website-upgrade-interest').check();
      const started = Date.now();
      await session.page.locator('#signup-button').click();
      return { ...session, started };
    }

    {
      const session = await register('band', { upgrade: false, preset: 'band', emailDelayMs: 12000 });
      await session.page.waitForURL(/profile\.html\?id=new-user-test/, { timeout: 8000 });
      const elapsed = Date.now() - session.started;
      assert.ok(elapsed < 5000, `redirect waited on email for ${elapsed}ms`);
      assert.ok(session.state.formsubmit >= 1, 'admin email was still attempted');
      assert.equal(session.state.stripe.length, 0);
      const stored = await session.page.evaluate(() => sessionStorage.getItem('btMockRecords'));
      assert.equal(stored.includes('new-user-test'), true);
      assert.equal(stored.includes('websiteUpgrade'), false);
      assert.equal(JSON.parse(session.page.url().includes('profile.html') ? 'true' : 'false'), true);
      assertNoLive(session.state, session.errors);
      record('band unchecked', 'PASS', `free profile destination in ${elapsed}ms while FormSubmit was delayed 12s and returned HTTP 522 (${session.state.formsubmit} attempt)`);
      await session.context.close();
    }

    {
      const session = await register('band', { upgrade: true });
      await session.page.waitForURL(/website\.html\?id=new-user-test&from=signup/, { timeout: 8000 });
      await session.page.locator('#signup-free-note').waitFor({ state: 'visible' });
      assert.equal(session.state.stripe.length, 0, 'signup must not open Stripe by itself');
      assert.match(await session.page.locator('#signup-free-note').innerText(), /free account is already active/i);
      assert.equal(await session.page.locator('#back-profile').innerText(), 'Continue with free profile');
      const prepareCalls = await session.page.evaluate(() => sessionStorage.getItem('btPrepareCalls'));
      assert.equal(prepareCalls, null);
      record('band checked routes to existing upgrade', 'PASS', 'account first, no Stripe until the existing upgrade button');
      await session.page.locator('#seller-agreement').check();
      await session.page.evaluate(() => { window.__prepareMode = 'fail'; });
      await session.page.locator('#upgrade-button').click();
      await session.page.locator('#upgrade-status').waitFor();
      await session.page.waitForFunction(() => /could not be started/i.test(document.getElementById('upgrade-status').textContent || ''));
      assert.equal(session.state.stripe.length, 0);
      assert.equal(await session.page.locator('#signup-free-note').isVisible(), true);
      assert.match(await session.page.locator('#back-profile').getAttribute('href'), /profile\.html\?id=new-user-test/);
      const records = await session.page.evaluate(() => sessionStorage.getItem('btMockRecords'));
      assert.match(records, /"profileComplete":true/);
      record('checkout prepare failure keeps free account', 'PASS', 'error shown, Stripe not opened, profile retained');
      await session.context.close();
    }

    {
      const session = await register('musician', { upgrade: true, preset: 'musician' });
      await session.page.waitForURL(/website\.html\?id=new-user-test&from=signup/, { timeout: 8000 });
      assert.equal(session.state.stripe.length, 0);
      await session.page.locator('#seller-agreement').check();
      await session.page.locator('#upgrade-button').click();
      await session.page.waitForURL(/buy\.stripe\.com/, { timeout: 8000 });
      assert.equal(session.state.stripe.length, 1);
      assert.match(session.state.stripe[0], /client_reference_id=new-user-test/);
      assert.doesNotMatch(session.state.stripe[0], /sk_live|card\[number\]/);
      await session.page.goBack();
      await session.page.locator('#signup-free-note').waitFor({ state: 'visible' });
      const records = await session.page.evaluate(() => sessionStorage.getItem('btMockRecords'));
      assert.match(records, /users\/new-user-test/);
      assert.match(records, /profiles\/new-user-test/);
      assert.equal(records.includes('"websiteEnabled":true'), false);
      record('musician checked then checkout cancel', 'PASS', 'Stripe navigation intercepted; back still has the free account');
      await session.context.close();
    }

    {
      const session = await register('musician', { upgrade: false, preset: 'musician' });
      await session.page.waitForURL(/profile\.html\?id=new-user-test/, { timeout: 8000 });
      assert.equal(session.state.stripe.length, 0);
      record('musician unchecked', 'PASS', 'normal free profile destination');
      await session.context.close();
    }

    {
      const session = await register('venue', { preset: 'venue' });
      assert.equal(await session.page.locator('#website-upgrade-offer').isHidden(), true);
      await session.page.waitForURL(/profile\.html\?id=new-user-test/, { timeout: 8000 });
      assert.equal(session.state.stripe.length, 0);
      record('venue free signup', 'PASS', 'no upgrade offer and no checkout');
      await session.context.close();
    }

    {
      const session = await register('fan', { preset: 'fan' });
      assert.equal(await session.page.locator('#website-upgrade-offer').isHidden(), true);
      await session.page.waitForURL(/profile\.html\?id=new-user-test/, { timeout: 8000 });
      assert.equal(session.state.stripe.length, 0);
      record('fan free signup', 'PASS', 'no upgrade offer and no checkout');
      await session.context.close();
    }

    {
      const session = await register('band', { upgrade: true, failSignup: true });
      await session.page.waitForFunction(() => /already has an account/i.test(document.getElementById('signup-message').textContent || ''));
      assert.equal(session.page.url().includes('signup.html'), true);
      assert.equal(session.state.stripe.length, 0);
      assert.equal(await session.page.evaluate(() => sessionStorage.getItem('btMockUser')), null);
      assert.doesNotMatch(await session.page.locator('#signup-message').innerText(), /free account is ready|upgrade/i);
      record('failed registration does not open checkout', 'PASS', 'no user record and no success claim');
      await session.context.close();
    }

    {
      const session = await register('band', { upgrade: true, failProfile: true });
      await session.page.waitForFunction(() => /profile setup did not finish/i.test(document.getElementById('signup-message').textContent || ''));
      assert.equal(session.state.stripe.length, 0);
      assert.doesNotMatch(await session.page.locator('#signup-message').innerText(), /free account is ready|Opening the optional/i);
      record('profile save failure does not claim upgrade success', 'PASS', 'stays on signup without Stripe');
      await session.context.close();
    }

    {
      const session = await openPage(chrome, base);
      await session.page.addInitScript(() => {
        const user = { uid: 'paid-user', email: 'paid@example.com' };
        const records = [[
          'profiles/paid-user',
          {
            displayName: 'Already Paid',
            published: true,
            ownerId: 'paid-user',
            accountType: 'band',
            websiteEnabled: true,
            websitePlanStatus: 'active'
          }
        ]];
        sessionStorage.setItem('btMockUser', JSON.stringify(user));
        sessionStorage.setItem('btMockRecords', JSON.stringify(records));
      });
      await session.page.goto(`${base}/website.html?id=paid-user&from=signup`, { waitUntil: 'domcontentloaded' });
      await session.page.waitForURL(/website-pilot\.html\?id=paid-user/, { timeout: 8000 });
      assert.equal(session.state.stripe.length, 0);
      record('existing paid account bypass', 'PASS', 'from=signup still follows the current active-plan path and does not open checkout');
      await session.context.close();
    }

    {
      const legacyUrls = [
        ['/submit-band.html', 'band'],
        ['/submit-musician.html', 'musician'],
        ['/submit-venue.html', 'venue'],
        ['/submit-band/', 'band'],
        ['/submit-musician/', 'musician'],
        ['/submit-venue/', 'venue'],
        ['/submit-band', 'band'],
        ['/submit-musician', 'musician'],
        ['/submit-venue', 'venue'],
        ['/submit-band-test.html', 'band']
      ];
      const session = await openPage(chrome, base);
      for (const [url, type] of legacyUrls) {
        await session.page.goto(`${base}${url}?returnTo=bands.html`, { waitUntil: 'domcontentloaded' });
        await session.page.waitForURL(new RegExp(`signup\\.html\\?type=${type}&returnTo=`), { timeout: 5000 });
        const landed = new URL(session.page.url());
        assert.equal(landed.searchParams.get('type'), type);
        assert.equal(landed.searchParams.get('returnTo'), 'bands.html');
        assert.equal(session.page.url().includes('formsubmit'), false);
      }
      record('legacy links including extensionless', 'PASS', legacyUrls.map(([url]) => url).join(', '));
      await session.context.close();
    }

    if (kit) {
      const iphoneAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
      for (const [width, height, label] of [[390, 844, '390'], [375, 667, '375'], [320, 568, '320']]) {
        const session = await openPage(kit, base, {
          viewport: { width, height },
          mobile: true,
          userAgent: iphoneAgent
        });
        await session.page.goto(`${base}/signup.html?type=band`, { waitUntil: 'domcontentloaded' });
        await revealProfile(session.page);
        const metrics = await overflow(session.page);
        assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, `${label} overflow ${metrics.scrollWidth}>${metrics.clientWidth}`);
        const row = await session.page.locator('.signup-upgrade-check').boundingBox();
        assert.ok(row.height >= 44, `${label} touch target ${row.height}`);
        if (label === '390') await shot(session.page, 'mobile-webkit-band-collapsed.png');
        await session.page.locator('#website-upgrade-details summary').tap();
        assert.equal(await session.page.locator('#website-upgrade-details').evaluate(node => node.open), true);
        const openMetrics = await overflow(session.page);
        assert.ok(openMetrics.scrollWidth <= openMetrics.clientWidth + 1, `${label} expanded overflow`);
        if (label === '390') {
          await session.page.locator('#website-upgrade-offer').scrollIntoViewIfNeeded();
          await shot(session.page, 'mobile-webkit-band-expanded.png', session.page.locator('#website-upgrade-offer'));
        }
        await session.page.locator('#account-type').selectOption('fan');
        assert.equal(await session.page.locator('#website-upgrade-offer').isHidden(), true);
        record(`simulated WebKit ${width}x${height}`, 'PASS', 'no horizontal overflow; disclosure tap works; fan hides offer');
        await session.context.close();
      }

      const flow = await openPage(kit, base, {
        viewport: { width: 390, height: 844 },
        mobile: true,
        userAgent: iphoneAgent
      });
      await flow.page.goto(`${base}/signup.html?type=musician`, { waitUntil: 'domcontentloaded' });
      await revealProfile(flow.page);
      await fillFreeProfile(flow.page, 'musician');
      await flow.page.locator('#website-upgrade-interest').check();
      await flow.page.locator('#signup-button').tap();
      await flow.page.waitForURL(/website\.html\?id=new-user-test&from=signup/, { timeout: 8000 });
      assert.equal(flow.state.stripe.length, 0);
      record('simulated WebKit musician checked signup', 'PASS', 'mobile WebKit reaches the existing upgrade page without Stripe');
      await flow.context.close();
    }

    record('physical iPhone Safari', 'UNVERIFIED', 'No physical iPhone was available. Mobile results are simulated Playwright WebKit.');
  } finally {
    await chrome.close();
    if (kit) await kit.close();
    await new Promise(resolve => server.close(resolve));
  }

  const failed = results.filter(item => item.status === 'FAIL');
  fs.writeFileSync(path.join(reviewDir, 'matrix.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(artifactDir, 'signup-test-matrix.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (failed.length) process.exit(1);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
