const { chromium } = require('/tmp/bt-plans-tests/node_modules/playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const mock = String.raw`
const records = new Map();
let initialUser = null;
try { initialUser = JSON.parse(sessionStorage.getItem('btMockUser') || 'null'); } catch {}
export const app = {};
export const auth = { currentUser: initialUser };
export const db = {};
export const storage = {};
export function collection(_db, name){ return { collection: name }; }
export function doc(base, ...parts){
  if (base && base.collection) return { path: base.collection + '/' + (parts[0] || 'auto'), id: parts[0] || 'auto' };
  return { path: parts.join('/'), id: parts[parts.length - 1] };
}
export function where(){ return {}; }
export function query(base){ return base; }
export function serverTimestamp(){ return { __serverTimestamp: true }; }
export async function getDoc(target){
  const data = records.get(target.path);
  return { id: target.id, exists: () => data !== undefined, data: () => data };
}
export async function getDocs(){ return { docs: [] }; }
export async function setDoc(target, data){
  if (globalThis.__failProfile && String(target.path).startsWith('profiles/')) throw new Error('Profile save failed');
  records.set(target.path, { ...(records.get(target.path) || {}), ...data });
}
export async function updateDoc(target, data){ return setDoc(target, data); }
export function onAuthStateChanged(authObj, fn){ queueMicrotask(() => fn(authObj.currentUser)); return () => {}; }
export async function createUserWithEmailAndPassword(authObj, email){
  if (globalThis.__failSignup) {
    const error = new Error('That email already has an account.');
    error.code = 'auth/email-already-in-use';
    throw error;
  }
  const user = { uid: 'new-user-test', email };
  authObj.currentUser = user;
  return { user };
}
export async function sendEmailVerification(){}
export async function updateProfile(){}
export function getFunctions(){ return {}; }
export function httpsCallable(){
  return async () => ({ data: { subscriptionStatus: 'pending', contactEmail: 'band@example.com' } });
}
export function initializeApp(){ return app; }
export function getAuth(){ return auth; }
export function getFirestore(){ return db; }
export function getStorage(){ return storage; }
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
    try {
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      const type = file.endsWith('.css') ? 'text/css' : (file.endsWith('.html') ? 'text/html' : 'text/javascript');
      res.setHeader('Content-Type', type);
      res.end(fs.readFileSync(file));
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

async function open(browser, base) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const recorded = [];
  const collects = [];
  page.on('request', request => {
    const url = request.url();
    if (/google-analytics|analytics\.google|\/g\/collect|\/collect\?/i.test(url)) {
      collects.push(`${request.method()} ${url}\n${request.postData() || ''}`);
    }
  });
  await page.exposeFunction('__recordEvent', (name, params) => { recorded.push({ name, params }); });
  await page.addInitScript(() => {
    let current = null;
    Object.defineProperty(window, 'btTrack', {
      configurable: true,
      get() { return current; },
      set(fn) {
        current = function(name, params) {
          const body = params || {};
          try { window.__recordEvent(name, body); } catch {}
          return fn.apply(this, arguments);
        };
      }
    });
  });
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.includes('/firebase-dev.js') || url.startsWith('https://www.gstatic.com/firebasejs/')) {
      return route.fulfill({ contentType: 'text/javascript', body: `export * from "${base}/mock-firebase.js";` });
    }
    if (/google-analytics\.com|analytics\.google\.com|\/g\/collect|\/collect\?/i.test(url)) {
      collects.push(`${route.request().method()} ${url}\n${route.request().postData() || ''}`);
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.includes('googletagmanager.com/gtag/js')) return route.continue();
    if (url.startsWith(base)) return route.continue();
    return route.abort();
  });
  return { context, page, recorded, collects };
}

function configOf(page) {
  return page.evaluate(() => {
    const hit = (window.dataLayer || []).map(entry => Array.from(entry)).find(entry => entry[0] === 'config');
    return hit ? hit[2] || {} : null;
  });
}

async function fillSignup(page) {
  await page.locator('#email').fill('artist@example.com');
  await page.locator('#password').fill('password123');
  await page.waitForFunction(() => !document.getElementById('continue-button').disabled);
  await page.locator('#continue-button').click();
  await page.locator('#profile-step').waitFor({ state: 'visible' });
  await page.locator('#display-name').fill('Test Band');
  await page.locator('#city').fill('Portland');
  await page.locator('#region').fill('Maine');
  await page.locator('#country').fill('United States');
  await page.locator('#bio').fill('Local test profile. No live account.');
  await page.locator('#music-type').selectOption('original');
  for (const id of ['community-rules', 'adult-content-rules', 'rights-acknowledgment', 'promo-use']) {
    await page.locator(`#${id}`).check();
  }
  await page.waitForFunction(() => !document.getElementById('signup-button').disabled);
}

(async () => {
  const { server, base } = await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    {
      const normal = await open(browser, base);
      await normal.page.goto(`${base}/plans.html`, { waitUntil: 'domcontentloaded' });
      const cfg = await configOf(normal.page);
      assert.ok(cfg, 'gtag config was not queued');
      assert.equal(cfg.traffic_type, undefined);
      assert.equal(cfg.debug_mode, undefined);
      await normal.context.close();
    }
    {
      const legacy = await open(browser, base);
      await legacy.page.addInitScript(() => localStorage.setItem('bt_internal', '1'));
      await legacy.page.goto(`${base}/plans.html`, { waitUntil: 'domcontentloaded' });
      assert.equal((await configOf(legacy.page)).traffic_type, undefined);
      assert.equal(await legacy.page.evaluate(() => localStorage.getItem('bt_internal')), null);
      await legacy.context.close();
    }
    {
      const internal = await open(browser, base);
      await internal.page.goto(`${base}/plans.html?bt_internal=1&bt_debug=1`, { waitUntil: 'domcontentloaded' });
      let cfg = await configOf(internal.page);
      assert.equal(cfg.traffic_type, 'internal');
      assert.equal(cfg.debug_mode, true);
      await internal.page.goto(`${base}/faq.html`, { waitUntil: 'domcontentloaded' });
      cfg = await configOf(internal.page);
      assert.equal(cfg.traffic_type, 'internal');
      assert.equal(cfg.debug_mode, true);
      await internal.page.goto(`${base}/plans.html?bt_internal=0&bt_debug=0`, { waitUntil: 'domcontentloaded' });
      cfg = await configOf(internal.page);
      assert.equal(cfg.traffic_type, undefined);
      assert.equal(cfg.debug_mode, undefined);
      await internal.context.close();
    }
    {
      const visitor = await open(browser, base);
      await visitor.page.goto(`${base}/plans.html`, { waitUntil: 'domcontentloaded' });
      await visitor.page.evaluate(() => {
        const link = document.createElement('a');
        link.href = 'radio-submit.html';
        link.textContent = 'Upload a song';
        document.body.appendChild(link);
      });
      await visitor.page.locator('a[href="radio-submit.html"]').click();
      await visitor.page.waitForURL(/radio-submit\.html/, { waitUntil: 'domcontentloaded' });
      assert.equal(visitor.recorded.some(event => event.name === 'upload_song_click'), true);
      await visitor.page.goto(`${base}/plans.html`, { waitUntil: 'domcontentloaded' });
      await visitor.page.evaluate(() => window.btTrack('radio_listen', { player: 'home_card' }));
      assert.equal(visitor.recorded.some(event => event.name === 'radio_listen' && event.params.player === 'home_card'), true);
      await visitor.context.close();
    }
    {
      const failed = await open(browser, base);
      await failed.page.addInitScript(() => { window.__failSignup = true; });
      await failed.page.goto(`${base}/signup.html?type=band`, { waitUntil: 'domcontentloaded' });
      await fillSignup(failed.page);
      await failed.page.locator('#signup-button').click();
      await failed.page.waitForFunction(() => /already has an account/i.test(document.getElementById('signup-message').textContent || ''));
      assert.equal(failed.recorded.some(event => event.name === 'sign_up'), false);
      await failed.context.close();
    }
    {
      const joined = await open(browser, base);
      await joined.page.goto(`${base}/signup.html?type=band`, { waitUntil: 'domcontentloaded' });
      await fillSignup(joined.page);
      assert.equal(joined.recorded.some(event => event.name === 'sign_up'), false);
      await joined.page.locator('#signup-button').click();
      await joined.page.locator('#signup-notice-continue').waitFor({ state: 'visible' });
      const signups = joined.recorded.filter(event => event.name === 'sign_up');
      assert.equal(signups.length, 1);
      assert.equal(signups[0].params.method, 'email');
      assert.equal(signups[0].params.account_type, 'band');
      const queued = await joined.page.evaluate(() => (window.dataLayer || []).some(entry => {
        try { return Array.from(entry)[1] === 'sign_up'; } catch { return false; }
      }));
      assert.equal(queued, true);
      assert.ok(joined.collects.some(entry => entry.includes('en=page_view')), 'the GA tag did not send page_view');
      await joined.page.locator('#signup-notice-continue').click();
      await joined.page.waitForURL(/profile\.html\?id=new-user-test/, { timeout: 8000, waitUntil: 'domcontentloaded' });
      assert.equal(joined.recorded.filter(event => event.name === 'sign_up').length, 1);
      await joined.context.close();
    }
    {
      const direct = await open(browser, base);
      await direct.page.goto(`${base}/website-merch-success.html`, { waitUntil: 'domcontentloaded' });
      await direct.page.waitForTimeout(400);
      assert.equal(direct.recorded.some(event => event.name === 'purchase'), false);
      await direct.context.close();
    }
    {
      const paid = await open(browser, base);
      await paid.page.goto(`${base}/plans.html`, { waitUntil: 'domcontentloaded' });
      await paid.page.evaluate(() => {
        sessionStorage.setItem('bt_checkout_pending', JSON.stringify({ plan: 'website-merch', nonce: 'checkout-nonce-1', at: Date.now() }));
      });
      await paid.page.goto(`${base}/website-merch-success.html`, {
        waitUntil: 'domcontentloaded',
        referer: 'https://checkout.stripe.com/c/pay/cs_test'
      });
      await paid.page.waitForTimeout(500);
      const purchases = paid.recorded.filter(event => event.name === 'purchase');
      assert.equal(purchases.length, 1);
      assert.equal(purchases[0].params.transaction_id, 'checkout-nonce-1');
      assert.equal(purchases[0].params.value, 15);
      assert.equal(purchases[0].params.currency, 'USD');
      const queuedPurchase = await paid.page.evaluate(() => (window.dataLayer || []).some(entry => {
        try { return Array.from(entry)[1] === 'purchase'; } catch { return false; }
      }));
      assert.equal(queuedPurchase, true);
      assert.ok(paid.collects.some(entry => entry.includes('en=page_view')), 'the GA tag did not send page_view');
      await paid.page.reload({ waitUntil: 'domcontentloaded' });
      await paid.page.waitForTimeout(500);
      assert.equal(paid.recorded.filter(event => event.name === 'purchase').length, 1);
      await paid.context.close();
    }
    {
      const session = await open(browser, base);
      await session.page.goto(`${base}/website-merch-success.html?session_id=cs_test_abcdefgh`, { waitUntil: 'domcontentloaded' });
      await session.page.waitForTimeout(500);
      const purchases = session.recorded.filter(event => event.name === 'purchase');
      assert.equal(purchases.length, 1);
      assert.equal(purchases[0].params.transaction_id, 'cs_test_abcdefgh');
      await session.context.close();
    }

    {
      const beacon = await open(browser, base);
      await beacon.page.goto(`${base}/website.html`, { waitUntil: 'domcontentloaded' });
      const result = await beacon.page.evaluate(async () => {
        const seen = [];
        window.gtag = function() {
          const args = Array.from(arguments);
          if (args[0] === 'event' && args[1] === 'begin_checkout') {
            const body = args[2] || {};
            seen.push({
              transport: body.transport_type,
              sendTo: body.send_to,
              timeout: body.event_timeout,
              hasCallback: typeof body.event_callback === 'function',
              plan: body.plan,
              value: body.value,
              currency: body.currency
            });
          }
        };
        const started = Date.now();
        await window.btTrackCheckout({
          plan: 'website-merch',
          currency: 'USD',
          value: 15,
          items: [{ item_id: 'website-merch', item_name: 'Website + Merch', price: 15, quantity: 1 }]
        });
        return { seen, waited: Date.now() - started };
      });
      assert.equal(result.seen.length, 1);
      assert.equal(result.seen[0].transport, undefined);
      assert.equal(result.seen[0].sendTo, 'G-60112G8RH3');
      assert.equal(result.seen[0].timeout, 800);
      assert.equal(result.seen[0].hasCallback, true);
      assert.equal(result.seen[0].plan, 'website-merch');
      assert.equal(result.seen[0].value, 15);
      assert.equal(result.seen[0].currency, 'USD');
      assert.ok(result.waited >= 700 && result.waited < 1300, `checkout wait ${result.waited}ms`);
      await beacon.context.close();
    }

    console.log('PASS ga events preview');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
