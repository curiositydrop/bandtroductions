// iPhone-sized screenshots of the Radio Share Kit preview, plus the real 1080 PNG.
const { chromium } = require('/tmp/bt-share-kit-tests/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = process.cwd();
const out = '/tmp/bt-share-kit-review';
const artifacts = '/opt/cursor/artifacts';
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(artifacts, { recursive: true });

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('missing');
    return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

function pngSize(buffer) {
  assert.equal(buffer.readUInt32BE(0), 0x89504e47);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function events(dataLayer) {
  return (dataLayer || []).filter(entry => entry && entry[0] === 'event').map(entry => entry[1]);
}

async function waitReady(page) {
  await page.waitForFunction(() => document.querySelector('[data-rsk-ready="1"] canvas')?.width === 1080);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    permissions: ['clipboard-read', 'clipboard-write']
  });
  await context.addInitScript(() => {
    window.__shares = [];
    navigator.canShare = data => Boolean(data && data.files && data.files.length);
    navigator.share = async data => {
      window.__shares.push({ title: data.title || '', text: data.text || '', url: data.url || '', files: data.files ? data.files.length : 0 });
    };
  });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(String(error)));

  await page.goto(`${base}/radio-share-kit-preview.html?view=owner`, { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  const ownerShot = path.join(artifacts, 'radio-share-kit-owner-iphone.png');
  await page.screenshot({ path: ownerShot, fullPage: true });
  fs.copyFileSync(ownerShot, path.join(out, 'owner-iphone.png'));

  const photoCard = await page.evaluate(() => document.querySelector('[data-rsk-ready="1"] canvas').toDataURL('image/png'));
  const png = Buffer.from(photoCard.split(',')[1], 'base64');
  const pngPath = path.join(artifacts, 'radio-share-kit-1080.png');
  fs.writeFileSync(pngPath, png);
  fs.writeFileSync(path.join(out, 'share-card-1080.png'), png);
  const size = pngSize(png);
  assert.deepEqual(size, { width: 1080, height: 1080 });
  assert.ok(png.length > 20000, 'share card png is unexpectedly small');
  const bright = await page.evaluate(() => {
    const canvas = document.querySelector('[data-rsk-ready="1"] canvas');
    const data = canvas.getContext('2d').getImageData(280, 250, 520, 500).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i] + data[i + 1] + data[i + 2] > 220) count += 1;
    }
    return count;
  });
  assert.ok(bright > 30, `band photo did not draw, bright pixels ${bright}`);

  const link = await page.locator('[data-rsk-url]').innerText();
  const parsed = new URL(link);
  assert.equal(parsed.searchParams.get('utm_source'), 'band_share');
  assert.equal(parsed.searchParams.get('utm_medium'), 'social');
  assert.equal(parsed.searchParams.get('utm_campaign'), 'radio_share_kit');
  assert.equal(parsed.searchParams.get('utm_content'), 'preview-harbor-lights');
  assert.match(await page.locator('h2').innerText(), /radio/i);
  assert.match(await page.locator('.rsk-note').innerText(), /Instagram/);

  await page.getByRole('button', { name: 'Share' }).click();
  await page.waitForFunction(() => window.__shares.length === 1);
  const shared = await page.evaluate(() => window.__shares[0]);
  assert.equal(shared.files, 1);
  assert.match(shared.text, /We're on BANDtroductions Radio!/);
  assert.match(shared.text, /utm_campaign=radio_share_kit/);
  await page.waitForFunction(() => (window.dataLayer || []).some(entry => entry && entry[1] === 'share_kit_share'));

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^bandtroductions-radio-harbor-lights\.png$/);
  await page.waitForFunction(() => (window.dataLayer || []).some(entry => entry && entry[1] === 'share_kit_download'));

  await page.getByRole('button', { name: 'Copy Link' }).click();
  await page.waitForFunction(() => (window.dataLayer || []).some(entry => entry && entry[1] === 'share_kit_copy_link'));
  const copied = await page.evaluate(async () => {
    try { return await navigator.clipboard.readText(); } catch { return ''; }
  });
  if (copied) assert.equal(copied, link);
  else assert.match(await page.locator('.rsk-status').innerText(), /copied/i);
  const names = events(await page.evaluate(() => window.dataLayer));
  assert.ok(names.includes('share_kit_share'));
  assert.ok(names.includes('share_kit_download'));
  assert.ok(names.includes('share_kit_copy_link'));

  await page.goto(`${base}/radio-share-kit-preview.html?view=admin`, { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  assert.match((await page.locator('#where').innerText()).toLowerCase(), /radio control room/);
  assert.match(await page.locator('#band').innerText(), /Harbor Lights/);
  assert.match(await page.locator('#band').innerText(), /Northline/);
  const adminShot = path.join(artifacts, 'radio-share-kit-admin-iphone.png');
  await page.screenshot({ path: adminShot, fullPage: true });
  fs.copyFileSync(adminShot, path.join(out, 'admin-iphone.png'));
  await page.selectOption('#band', 'northline');
  await page.waitForFunction(() => document.querySelector('[data-rsk-url]')?.textContent.includes('preview-northline'));
  const northline = await page.locator('[data-rsk-url]').innerText();
  assert.match(northline, /utm_source=band_share/);
  assert.match(northline, /id=preview-northline/);

  await page.goto(`${base}/radio-share-kit-preview.html?view=owner&photo=missing`, { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  const fallbackDiffers = await page.evaluate(async () => {
    const { drawShareCard } = await import('./share-card.js');
    const { radioCardOptions } = await import('./radio-share-kit.js');
    const missing = await drawShareCard(radioCardOptions({ name: 'Harbor Lights', image: 'https://127.0.0.1:9/no-photo.png' }));
    const blank = await drawShareCard(radioCardOptions({ name: 'Harbor Lights', image: '' }));
    const photo = document.querySelector('canvas');
    return {
      missing: missing.toDataURL(),
      blank: blank.toDataURL(),
      shown: photo.toDataURL(),
      size: [missing.width, missing.height]
    };
  });
  assert.deepEqual(fallbackDiffers.size, [1080, 1080]);
  assert.equal(fallbackDiffers.missing, fallbackDiffers.blank);
  assert.equal(fallbackDiffers.shown, fallbackDiffers.blank);
  assert.notEqual(photoCard, fallbackDiffers.blank);

  await page.goto(`${base}/profile.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('#radio-share-kit').count(), 0);
  const previewErrors = failures.filter(error => !/firebase|Firestore|auth/i.test(error));
  assert.deepEqual(previewErrors, []);
  await browser.close();
  server.close();
  console.log('PASS: iPhone owner UI, admin UI, 1080 share card, share/download/copy events.');
  console.log(ownerShot);
  console.log(adminShot);
  console.log(pngPath);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
