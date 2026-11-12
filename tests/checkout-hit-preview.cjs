const { chromium, webkit, devices } = require('/tmp/bt-plans-tests/node_modules/playwright');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const iphone = devices['iPhone 14'];
const PROMO = 'https://buy.stripe.com/dRmbIU1BYekifzP2if6oo0f';
const STANDARD = 'https://buy.stripe.com/9B6dR23K6ccaevL6yv6oo0h';

const fixture = `<!doctype html>
<meta charset="utf-8">
<title>Checkout hit</title>
<script src="/bt-analytics.js"></script>
<button id="checkout" type="button">Upgrade Website + Merch</button>
<script type="module">
import { currentOffer } from '/bt-offer.js';
const before = currentOffer(new Date('2026-06-01T12:00:00-04:00'), { hostname: 'bandtroductions.com', search: '' });
const after = currentOffer(new Date('2027-01-01T00:00:01-05:00'), { hostname: 'bandtroductions.com', search: '' });
window.__offers = { before: before.checkoutUrl, after: after.checkoutUrl };
document.getElementById('checkout').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (button.dataset.checkoutStarted === '1') return;
  button.dataset.checkoutStarted = '1';
  button.disabled = true;
  await window.btTrackCheckout({
    plan: 'website-merch',
    currency: 'USD',
    value: 15,
    items: [{ item_id: 'website-merch', item_name: 'Website + Merch', price: 15, quantity: 1 }]
  });
  location.href = before.checkoutUrl + '?client_reference_id=band-owner&prefilled_email=band%40example.com';
});
</script>`;

function contentType(file) {
  if (file.endsWith('.js') || file.endsWith('.mjs')) return 'text/javascript';
  if (file.endsWith('.html')) return 'text/html';
  return 'application/octet-stream';
}

function startServer() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    if (pathname === '/__checkout-hit.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(fixture);
      return;
    }
    const file = path.join(root, pathname.replace(/^\/+/, ''));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('missing');
      return;
    }
    res.writeHead(200, { 'content-type': contentType(file) });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function watch(context) {
  const hits = [];
  context.on('request', request => {
    const url = request.url();
    if (!url.includes('/g/collect')) return;
    let post = '';
    try { post = request.postData() || ''; } catch {}
    const payload = `${url}&${post}`;
    if (payload.includes('en=begin_checkout')) hits.push(payload);
  });
  return hits;
}

async function runBrowser(browserType, label) {
  const browser = await browserType.launch();
  const context = await browser.newContext({ ...iphone });
  const hits = watch(context);
  const page = await context.newPage();
  await page.route('**/buy.stripe.com/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><title>Stripe stub</title><p>stubbed</p>'
  }));
  await page.route('**/*google-analytics.com/**', route => {
    if (route.request().url().includes('/g/collect')) {
      return route.fulfill({ status: 204, body: '' });
    }
    return route.continue();
  });
  await page.route('**/*analytics.google.com/**', route => route.fulfill({ status: 204, body: '' }));
  await page.goto(`${process.env.CHECKOUT_HIT_BASE}/__checkout-hit.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.google_tag_manager && window.google_tag_manager['G-60112G8RH3'], null, { timeout: 15000 });
  const offers = await page.evaluate(() => window.__offers);
  assert.equal(offers.before, PROMO, `${label} promo url`);
  assert.equal(offers.after, STANDARD, `${label} standard url`);
  await page.evaluate(() => {
    const button = document.getElementById('checkout');
    button.click();
    button.click();
  });
  await page.waitForURL(/buy\.stripe\.com\/dRmbIU1BYekifzP2if6oo0f/, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1200);
  assert.equal(hits.length, 1, `${label} begin_checkout count ${hits.length}: ${hits.join('\n---\n').slice(0, 1500)}`);
  const payload = hits[0];
  assert.ok(payload.includes('ep.plan=website-merch'), `${label} plan missing in ${payload.slice(0, 800)}`);
  assert.ok(payload.includes('epn.value=15'), `${label} value missing in ${payload.slice(0, 800)}`);
  assert.ok(payload.includes('cu=USD'), `${label} currency missing in ${payload.slice(0, 800)}`);
  assert.equal(payload.includes('ep.transport_type'), false, `${label} leaked transport_type`);
  console.log(`PASS ${label} begin_checkout x1`);
  await browser.close();
}

(async () => {
  const server = await startServer();
  const { port } = server.address();
  process.env.CHECKOUT_HIT_BASE = `http://127.0.0.1:${port}`;
  try {
    await runBrowser(chromium, 'chromium');
    await runBrowser(webkit, 'webkit');
    console.log('PASS checkout hit preview');
  } finally {
    server.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
