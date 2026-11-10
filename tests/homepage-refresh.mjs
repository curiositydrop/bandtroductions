/**
 * Homepage refresh checks. Serves nothing by itself.
 *   python3 -m http.server 8765
 *   NODE_PATH=/path/to/node_modules node tests/homepage-refresh.mjs
 * Chrome: CHROME_PATH or /opt/google/chrome/chrome
 *
 * Logged-in coverage drives the same hero switch the auth callback uses
 * (window.btSyncHomeHero). Anonymous sign-in is disabled on this Firebase
 * project, and creating a real account would email the owners, so this does
 * not open a production session.
 */
import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:8765/index.html';
const chrome = process.env.CHROME_PATH || '/opt/google/chrome/chrome';
const failures = [];
const fail = message => { failures.push(message); console.error('FAIL', message); };
const ok = message => console.log('OK', message);

const browser = await chromium.launch({
  executablePath: chrome,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

function track(page) {
  const problems = [];
  page.on('pageerror', error => problems.push(`pageerror ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') problems.push(`console ${message.text()}`);
  });
  page.on('response', response => {
    const url = response.url();
    if (response.status() < 400) return;
    if (/firebasestorage\.googleapis\.com|googletagmanager\.com|google-analytics\.com/.test(url)) return;
    if (url.includes('/index.html') || url.includes('welcome-popup') || url.includes('homepage-counts') || url.includes('underground-preview')) {
      problems.push(`${response.status()} ${url}`);
    }
  });
  return problems;
}

const iphone = {
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2
};

async function openGuest() {
  const context = await browser.newContext(iphone);
  const page = await context.newPage();
  const problems = track(page);
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45000 });
  return { context, page, problems };
}

{
  const { context, page, problems } = await openGuest();
  await page.waitForTimeout(700);
  const early = await page.evaluate(() => ({
    popup: !!document.getElementById('bt-welcome-v2-host'),
    h1: document.querySelector('.hero h1')?.textContent || '',
    support: document.querySelector('.hero-support')?.textContent || '',
    tag: document.querySelector('.hero-tagline')?.textContent || '',
    join: document.querySelector('.hero-guest-actions a.btn.primary')?.textContent || '',
    joinHref: document.querySelector('.hero-guest-actions a.btn.primary')?.getAttribute('href') || '',
    joinVisible: getComputedStyle(document.querySelector('.hero-guest-actions')).display !== 'none',
    memberVisible: getComputedStyle(document.querySelector('.hero-member-actions')).display !== 'none',
    primaryCount: document.querySelectorAll('.hero-guest-actions .btn.primary').length,
    paths: [...document.querySelectorAll('.hero-paths a')].filter(a => getComputedStyle(a).display !== 'none').map(a => `${a.textContent}|${a.getAttribute('href')}`),
    online: getComputedStyle(document.querySelector('.online-panel')).display,
    visibleText: document.body.innerText,
    gtag: typeof window.gtag === 'function',
    analytics: !!document.querySelector('script[src*="bt-analytics.js"]'),
    radioFirst: !!(document.querySelector('.right .radio-panel')?.compareDocumentPosition(document.querySelector('.shows-panel')) & Node.DOCUMENT_POSITION_FOLLOWING)
  }));
  if (early.popup) fail('welcome popup blocked first paint');
  else ok('popup not present during first paint');
  if (early.h1 !== 'Where independent music gets heard.') fail(`headline ${early.h1}`);
  else ok('headline');
  if (early.support !== 'A free community connecting bands, musicians, venues, and fans worldwide. Discover new music, get your band heard, and join the scene.') fail('support copy');
  else ok('support copy');
  if (early.tag !== 'Built for the scene. Not the algorithm.') fail('tagline');
  else ok('tagline');
  if (early.join !== 'JOIN FREE' || early.joinHref !== 'signup.html' || !early.joinVisible || early.primaryCount !== 1) fail(`join button ${early.join} ${early.joinHref}`);
  else ok('single JOIN FREE button to signup.html');
  if (early.memberVisible) fail('member actions visible while logged out');
  else ok('member actions hidden while logged out');
  const wanted = ['Bands|bands.html', 'Musicians|musicians.html', 'Venues|venues.html', 'Fans|signup.html?type=fan', 'Radio|radio.html'];
  if (wanted.some(item => !early.paths.includes(item))) fail(`paths ${early.paths.join(', ')}`);
  else ok('audience and radio links');
  if (early.online !== 'none') fail('online panel visible for a guest');
  else ok('empty online panel hidden');
  for (const phrase of ['No active profiles yet', 'Online status unavailable', 'Loading live community feed', 'Loading Show/Event posts']) {
    if (early.visibleText.includes(phrase)) fail(`guest still sees “${phrase}”`);
  }
  ok('guest loading and empty placeholders hidden');
  if (!early.radioFirst) fail('radio card is not above upcoming shows');
  else ok('radio card is above upcoming shows');
  if (!early.gtag || !early.analytics) fail('analytics tag missing');
  else ok('gtag / bt-analytics present');

  await page.waitForFunction(() => {
    const el = document.getElementById('home-counts');
    return el && !el.hidden && /\d/.test(el.textContent || '');
  }, null, { timeout: 10000 }).catch(() => fail('counts did not render'));
  const counts = await page.evaluate(() => [...document.querySelectorAll('#home-counts .home-count')].map(el => ({
    n: Number(el.querySelector('b')?.textContent.replace(/,/g, '')),
    label: el.querySelector('span')?.textContent || ''
  })));
  const allowed = new Set(['Bands', 'Musicians', 'Venues', 'Fans']);
  if (!counts.length || counts.some(item => !allowed.has(item.label) || !(item.n >= 10))) fail(`counts ${JSON.stringify(counts)}`);
  else ok(`counts ${counts.map(item => `${item.n} ${item.label}`).join(', ')}`);

  await page.mouse.wheel(0, 500);
  await page.waitForSelector('#bt-welcome-v2-host', { timeout: 4000 }).catch(() => fail('popup did not open after scroll'));
  if (await page.locator('#bt-welcome-v2-host').count()) ok('popup opens after scroll');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(200);
  if (await page.locator('#bt-welcome-v2-host').count()) fail('popup stayed open');
  else ok('popup closes');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(1200);
  if (await page.locator('#bt-welcome-v2-host').count()) fail('popup showed again on the same browser');
  else ok('popup shows once');

  await page.evaluate(() => window.btSyncHomeHero({ uid: 'member-preview' }));
  const member = await page.evaluate(() => ({
    join: getComputedStyle(document.querySelector('.hero-guest-actions')).display,
    member: getComputedStyle(document.querySelector('.hero-member-actions')).display,
    support: getComputedStyle(document.querySelector('.hero-support')).display,
    fans: getComputedStyle(document.querySelector('.hero-paths a[href="signup.html?type=fan"]')).display,
    h1: document.querySelector('.hero h1')?.textContent,
    tag: document.querySelector('.hero-tagline')?.textContent,
    buttons: document.querySelector('.hero-member-actions')?.innerText.replace(/\s+/g, ' ').trim()
  }));
  if (member.join !== 'none' || member.member === 'none' || member.support !== 'none' || member.fans !== 'none') fail(`logged-in chrome ${JSON.stringify(member)}`);
  else ok('logged-in hero hides JOIN FREE');
  if (member.h1 !== 'Where independent music gets heard.' || member.tag !== 'Built for the scene. Not the algorithm.') fail('logged-in copy changed');
  if (member.buttons !== 'CREATE POST MY PROFILE') fail(`member buttons ${member.buttons}`);
  else ok('logged-in actions are CREATE POST and MY PROFILE');

  await page.evaluate(() => window.btSyncHomeHero(null));
  const restored = await page.evaluate(() => getComputedStyle(document.querySelector('.hero-guest-actions')).display !== 'none');
  if (!restored) fail('signing out did not restore JOIN FREE');
  else ok('signed-out hero restores JOIN FREE');

  const realErrors = problems.filter(item => !/Failed to load resource/.test(item) || /welcome-popup|homepage-counts|underground-preview|index\.html/.test(item));
  if (realErrors.length) fail(`console/network\n${realErrors.slice(0, 8).join('\n')}`);
  else ok('no page errors from the homepage scripts');
  await context.close();
}

{
  const context = await browser.newContext(iphone);
  await context.addInitScript(() => localStorage.setItem('btWelcomeV2Presented', '2'));
  const page = await context.newPage();
  await page.goto(`${base}${base.includes('?') ? '&' : '?'}welcomePopup=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('#bt-welcome-v2-host', { timeout: 8000 }).catch(() => fail('forced popup did not open'));
  if (await page.locator('#bt-welcome-v2-host').count()) ok('welcomePopup=1 still previews the intro');
  const bytes = await page.evaluate(async () => {
    const script = [...document.scripts].find(node => (node.src || '').includes('welcome-popup-v2.js'));
    const response = script ? await fetch(script.src) : null;
    return response ? (await response.blob()).size : 0;
  });
  if (bytes > 80000) fail(`welcome script is ${bytes} bytes`);
  else ok(`welcome script ${bytes} bytes`);
  await context.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nAll homepage refresh checks passed.');
