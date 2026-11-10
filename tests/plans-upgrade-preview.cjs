const { chromium } = require('/tmp/bt-plans-tests/node_modules/playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const artifactDir = '/opt/cursor/artifacts';
fs.mkdirSync(artifactDir, { recursive: true });

const mock = String.raw`
const records = new Map();
function restore() {
  try { JSON.parse(sessionStorage.getItem('btMockRecords') || '[]').forEach(([key, value]) => records.set(key, value)); } catch {}
}
restore();
let initialUser = null;
try { initialUser = JSON.parse(sessionStorage.getItem('btMockUser') || 'null'); } catch {}
export const app = {};
export const auth = { currentUser: initialUser };
export const db = {};
export const storage = {};
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
export async function getDocs() { return { docs: [] }; }
export async function setDoc(target, data) {
  records.set(target.path, { ...(records.get(target.path) || {}), ...data });
}
export async function updateDoc(target, data) { return setDoc(target, data); }
export function onAuthStateChanged(authObj, fn) {
  queueMicrotask(() => fn(authObj.currentUser));
  return () => {};
}
export async function createUserWithEmailAndPassword(authObj, email) {
  const user = { uid: 'new-user-test', email };
  authObj.currentUser = user;
  sessionStorage.setItem('btMockUser', JSON.stringify(user));
  return { user };
}
export async function sendEmailVerification() {}
export async function updateProfile() {}
export async function signInWithEmailAndPassword() { return { user: initialUser }; }
export async function sendPasswordResetEmail() {}
export function getFunctions() { return {}; }
export function httpsCallable() {
  return async (data) => {
    try { window.__recordPrepare(data); } catch {}
    return { data: { subscriptionStatus: 'pending', contactEmail: 'band@example.com' } };
  };
}
export function initializeApp() { return app; }
export function getAuth() { return auth; }
export function getFirestore() { return db; }
export function getStorage() { return storage; }
`;

function contentType(file) {
  if (file.endsWith('.js') || file.endsWith('.mjs')) return 'text/javascript';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.html')) return 'text/html';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
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

function seed(user, records) {
  return async page => {
    await page.addInitScript(({ user, records }) => {
      sessionStorage.setItem('btMockUser', JSON.stringify(user));
      sessionStorage.setItem('btMockRecords', JSON.stringify(records));
    }, { user, records });
  };
}

async function openPhone(browser, base, prepare) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();
  const state = { stripe: [], live: [] };
  if (prepare) await prepare(page);
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.includes('/firebase-dev.js') || url.startsWith('https://www.gstatic.com/firebasejs/')) {
      return route.fulfill({
        contentType: 'text/javascript',
        body: `export * from "${base}/mock-firebase.js";`,
        headers: { 'access-control-allow-origin': '*' }
      });
    }
    if (url.includes('buy.stripe.com')) {
      state.stripe.push(url);
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Checkout intercepted</title><p>Stripe checkout was intercepted and was not submitted.</p>'
      });
    }
    if (url.startsWith(base)) return route.continue();
    state.live.push(url);
    return route.abort();
  });
  return { context, page, state };
}

async function shot(page, name) {
  const target = path.join(artifactDir, name);
  await page.screenshot({ path: target });
  await page.screenshot({ path: target.replace(/\.png$/, '-full.png'), fullPage: true });
}

async function overflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
}

(async () => {
  const { server, base } = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    {
      const session = await openPhone(browser, base);
      await session.page.goto(`${base}/plans.html`, { waitUntil: 'domcontentloaded' });
      await session.page.waitForFunction(() => document.documentElement.dataset.upgradeState === 'logged-out');
      const href = await session.page.locator('#upgrade-account-link').getAttribute('href');
      const loginHref = await session.page.locator('#upgrade-login-link').getAttribute('href');
      assert.equal(href, 'signup.html?type=band&upgrade=1&returnTo=plans.html%3Fupgrade%3D1');
      assert.equal(loginHref, 'login.html?type=band&upgrade=1&returnTo=plans.html%3Fupgrade%3D1');
      assert.match(await session.page.locator('h1').innerText(), /official website, without building one/);
      assert.match(await session.page.locator('#launch-offer').innerText(), /LIMITED-TIME LAUNCH OFFER/);
      assert.match(await session.page.locator('#launch-offer').innerText(), /Get 2 Months FREE!/);
      const box = await session.page.locator('#upgrade-account-link').boundingBox();
      assert.ok(box.height >= 44, `upgrade button ${box.height}px`);
      const width = await overflow(session.page);
      assert.ok(width.scrollWidth <= width.clientWidth + 1, JSON.stringify(width));
      await shot(session.page, 'plans-after-iphone.png');
      const recorded = [];
      await session.page.exposeFunction('__recordEvent', name => { recorded.push(name); });
      await session.page.evaluate(() => {
        const original = window.btTrack;
        window.btTrack = function(name, params) {
          window.__recordEvent(name);
          return original.apply(this, arguments);
        };
      });
      await session.page.locator('#upgrade-account-link').click();
      await session.page.waitForURL(/signup\.html\?type=band&upgrade=1&returnTo=/, { waitUntil: 'domcontentloaded' });
      assert.equal(new URL(session.page.url()).searchParams.get('returnTo'), 'plans.html?upgrade=1');
      assert.equal(await session.page.locator('#claim-notice-continue').count(), 0);
      const continueBox = await session.page.locator('#continue-button').boundingBox();
      assert.ok(continueBox && continueBox.height >= 44);
      assert.equal(recorded.includes('upgrade_intent'), true);
      await session.page.locator('#email').fill('artist@example.com');
      await session.page.locator('#password').fill('password123');
      await session.page.waitForFunction(() => !document.getElementById('continue-button').disabled);
      await session.page.locator('#continue-button').click();
      await session.page.locator('#website-upgrade-offer').waitFor({ state: 'visible' });
      assert.equal(await session.page.locator('#account-type').inputValue(), 'band');
      assert.equal(await session.page.locator('#website-upgrade-interest').isChecked(), true);
      await shot(session.page, 'flow-logged-out-signup-iphone.png');
      await session.context.close();
    }

    {
      const session = await openPhone(browser, base);
      await session.page.goto(`${base}/plans.html`, { waitUntil: 'domcontentloaded' });
      await session.page.locator('#upgrade-login-link').click();
      await session.page.waitForURL(/login\.html\?/, { waitUntil: 'domcontentloaded' });
      const signup = await session.page.locator('#signup-link').getAttribute('href');
      const signupUrl = new URL(signup, session.page.url());
      assert.equal(signupUrl.searchParams.get('type'), 'band');
      assert.equal(signupUrl.searchParams.get('upgrade'), '1');
      assert.equal(signupUrl.searchParams.get('returnTo'), 'plans.html?upgrade=1');
      await session.context.close();
    }

    {
      const session = await openPhone(browser, base);
      await session.page.goto(`${base}/login.html?returnTo=${encodeURIComponent('https://evil.example/phish')}`, { waitUntil: 'domcontentloaded' });
      const signup = await session.page.locator('#signup-link').getAttribute('href');
      assert.equal(signup, 'signup.html');
      assert.equal(signup.includes('evil.example'), false);
      await session.page.goto(`${base}/login.html?returnTo=${encodeURIComponent('javascript:alert(1)')}`, { waitUntil: 'domcontentloaded' });
      assert.equal(await session.page.locator('#signup-link').getAttribute('href'), 'signup.html');
      await session.page.goto(`${base}/signup.html?returnTo=${encodeURIComponent('//evil.example')}`, { waitUntil: 'domcontentloaded' });
      const login = await session.page.locator('#login-link').getAttribute('href');
      assert.equal(login.includes('evil.example'), false);
      await session.context.close();
    }

    {
      const prepare = seed(
        { uid: 'band-owner', email: 'band@example.com' },
        [
          ['users/band-owner', { accountType: 'band', activeProfileId: 'band-owner', profileComplete: true }],
          ['profiles/band-owner', { accountType: 'band', ownerId: 'band-owner', published: true, displayName: 'Test Band' }]
        ]
      );
      const session = await openPhone(browser, base, prepare);
      const prepared = [];
      await session.page.exposeFunction('__recordPrepare', data => { prepared.push(data); });
      await session.page.goto(`${base}/plans.html`, { waitUntil: 'domcontentloaded' });
      await session.page.waitForFunction(() => document.documentElement.dataset.upgradeState === 'eligible');
      assert.equal(await session.page.locator('#upgrade-account-link').getAttribute('href'), 'website.html?id=band-owner');
      assert.equal(await session.page.locator('#upgrade-login-link').isHidden(), true);
      assert.equal(session.page.url().includes('profile.html'), false);
      const width = await overflow(session.page);
      assert.ok(width.scrollWidth <= width.clientWidth + 1, JSON.stringify(width));
      await shot(session.page, 'plans-after-band-iphone.png');
      const recorded = [];
      await session.page.exposeFunction('__recordEvent', name => { recorded.push(name); });
      await session.page.evaluate(() => {
        const original = window.btTrack;
        window.btTrack = function(name, params) {
          window.__recordEvent(name);
          return original.apply(this, arguments);
        };
      });
      await session.page.locator('#upgrade-account-link').click();
      await session.page.waitForURL(/website\.html\?id=band-owner$/, { waitUntil: 'domcontentloaded' });
      await session.page.locator('#upgrade-card').waitFor({ state: 'visible' });
      assert.equal(recorded.includes('upgrade_intent'), true);
      await shot(session.page, 'flow-band-checkout-iphone.png');
      await session.page.evaluate(() => {
        const original = window.btTrack;
        window.btTrack = function(name, params) {
          window.__recordEvent(name);
          return original.apply(this, arguments);
        };
      });
      assert.equal(await session.page.locator('#seller-agreement').isChecked(), false);
      await session.page.locator('#upgrade-button').click();
      assert.match(await session.page.locator('#upgrade-status').innerText(), /seller responsibility/i);
      assert.equal(session.state.stripe.length, 0);
      await session.page.locator('#seller-agreement').check();
      await session.page.locator('#upgrade-button').click();
      await session.page.waitForURL(/buy\.stripe\.com\/14AaEQbcy0tsfzP3mj6oo0g/, { waitUntil: 'domcontentloaded' });
      const checkout = new URL(session.state.stripe[0]);
      assert.equal(checkout.origin + checkout.pathname, 'https://buy.stripe.com/14AaEQbcy0tsfzP3mj6oo0g');
      assert.equal(checkout.searchParams.get('client_reference_id'), 'band-owner');
      assert.equal(prepared[0].sellerAgreementAccepted, true);
      assert.equal(prepared[0].profileId, 'band-owner');
      assert.equal(recorded.includes('begin_checkout'), true);
      await session.context.close();

      const returning = await openPhone(browser, base, prepare);
      await returning.page.goto(`${base}/plans.html?upgrade=1`, { waitUntil: 'domcontentloaded' });
      await returning.page.waitForURL(/website\.html\?id=band-owner$/, { waitUntil: 'domcontentloaded' });
      await returning.page.locator('#upgrade-card').waitFor({ state: 'visible' });
      assert.equal(returning.page.url().includes('profile.html'), false);
      await returning.context.close();

      const standard = await openPhone(browser, base, prepare);
      const standardEvents = [];
      await standard.page.exposeFunction('__recordCheckout', (name, params) => { standardEvents.push({ name, params }); });
      await standard.page.goto(`${base}/plans.html?bt_now=2027-01-01T00:00:01-05:00`, { waitUntil: 'domcontentloaded' });
      await standard.page.waitForFunction(() => document.documentElement.dataset.upgradeState === 'eligible');
      const standardPlans = await standard.page.locator('#launch-offer').innerText();
      assert.match(standardPlans, /\$15\/month\. Cancel anytime\./);
      assert.equal(/FREE|activation fee|paused/i.test(standardPlans), false);
      await standard.page.locator('#upgrade-account-link').click();
      await standard.page.waitForURL(/website\.html\?id=band-owner$/, { waitUntil: 'domcontentloaded' });
      await standard.page.locator('#upgrade-card').waitFor({ state: 'visible' });
      assert.match(await standard.page.locator('#offer-detail').innerText(), /\$15\/month\. Cancel anytime\./);
      assert.equal(/FREE|activation fee/i.test(await standard.page.locator('#offer-detail').innerText()), false);
      await standard.page.evaluate(() => {
        const original = window.btTrack;
        window.btTrack = function(name, params) {
          window.__recordCheckout(name, params);
          return original.apply(this, arguments);
        };
      });
      await standard.page.locator('#seller-agreement').check();
      await standard.page.locator('#upgrade-button').click();
      await standard.page.waitForURL(/buy\.stripe\.com\/9B6dR23K6ccaevL6yv6oo0h/, { waitUntil: 'domcontentloaded' });
      const standardCheckout = new URL(standard.state.stripe[0]);
      assert.equal(standardCheckout.origin + standardCheckout.pathname, 'https://buy.stripe.com/9B6dR23K6ccaevL6yv6oo0h');
      assert.equal(standardCheckout.searchParams.get('client_reference_id'), 'band-owner');
      assert.equal(standardCheckout.searchParams.get('prefilled_email'), 'band@example.com');
      const checkouts = standardEvents.filter(event => event.name === 'begin_checkout');
      assert.equal(checkouts.length, 1);
      assert.equal(checkouts[0].params.plan, 'website-merch');
      assert.equal(checkouts[0].params.value, 15);
      await standard.context.close();
    }

    {
      const prepare = seed(
        { uid: 'fan-owner', email: 'fan@example.com' },
        [
          ['users/fan-owner', { accountType: 'fan', activeProfileId: 'fan-owner', profileComplete: true }],
          ['profiles/fan-owner', { accountType: 'fan', ownerId: 'fan-owner', published: true, displayName: 'Test Fan' }]
        ]
      );
      const session = await openPhone(browser, base, prepare);
      await session.page.goto(`${base}/plans.html?upgrade=1`, { waitUntil: 'domcontentloaded' });
      await session.page.waitForFunction(() => document.documentElement.dataset.upgradeState === 'ineligible');
      assert.match(session.page.url(), /plans\.html\?upgrade=1/);
      assert.match(await session.page.locator('#upgrade-status').innerText(), /fan/);
      assert.equal(await session.page.locator('#upgrade-account-link').isHidden(), true);
      assert.equal(session.state.stripe.length, 0);
      await shot(session.page, 'flow-fan-plans-iphone.png');
      await session.context.close();
    }

    console.log('PASS plans upgrade preview');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
