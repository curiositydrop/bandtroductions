// Manual/preview check for the simulated between-show break.
// Run: node tests/radio-break-fill-preview.mjs [baseUrl]
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:8765';
const outDir = '/tmp/break-fill-shots';
const phone = devices['iPhone 13'];

function num(value) {
  return Number(value);
}

async function run() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({
    viewport: phone.viewport,
    userAgent: phone.userAgent,
    isMobile: phone.isMobile,
    hasTouch: phone.hasTouch,
    deviceScaleFactor: phone.deviceScaleFactor
  });
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.goto(`${base}/radio-break-fill-sim.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sim-phase');

  async function phase() {
    return page.locator('#sim-phase').getAttribute('data-phase');
  }
  async function setOffset(value) {
    await page.locator('#sim-slider').evaluate((el, next) => {
      el.value = String(next);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  }

  await page.locator('#sim-ads-0').click();
  await setOffset(0);
  if (await phase() !== 'fill') failures.push('0 ads at 0s should be the bed');
  if (num(await page.locator('#sim-clip').getAttribute('data-clip')) !== 0) failures.push('0 ads should start the bed at 0');

  await page.locator('#sim-ads-1').click();
  await setOffset(10);
  if (await phase() !== 'ad') failures.push('1 ad at 10s should still be the paid ad');
  await setOffset(33);
  if (await phase() !== 'fill') failures.push('1 ad at 33s should be the bed');
  const oneClip = num(await page.locator('#sim-clip').getAttribute('data-clip'));
  if (Math.abs(oneClip - 3) > 0.05) failures.push('1 ad late fill offset expected 3, got ' + oneClip);

  await page.locator('#sim-ads-2').click();
  await setOffset(44);
  if (await phase() !== 'ad') failures.push('2 ads at 44s should still be paid ads');
  await setOffset(50);
  if (await phase() !== 'fill') failures.push('2 ads at 50s should be the bed');
  const twoClip = num(await page.locator('#sim-clip').getAttribute('data-clip'));
  if (Math.abs(twoClip - 5) > 0.05) failures.push('2 ads fill offset expected 5, got ' + twoClip);

  await page.locator('#sim-ads-full').click();
  await setOffset(30);
  if (await phase() !== 'ads') failures.push('a full minute of ads should not play a bed');

  await page.locator('#sim-ads-1').click();
  await setOffset(50);
  if (await phase() !== 'fill') failures.push('late join at 50s should be the bed');
  const lateClip = num(await page.locator('#sim-clip').getAttribute('data-clip'));
  if (Math.abs(lateClip - 8) > 0.05) failures.push('late join offset expected 8, got ' + lateClip);
  await page.locator('#sim-apply').click();
  await page.waitForFunction(() => {
    const audio = document.querySelector('#sim-audio');
    return audio && audio.readyState >= 1 && !audio.paused && Math.abs(audio.currentTime - 8) < 1.5;
  }, null, { timeout: 8000 });
  const src = await page.locator('#sim-audio').evaluate(el => el.src);
  if (!String(src).startsWith('blob:')) failures.push('sim fill should be an isolated generated tone, got ' + src);
  if (String(src).includes('break-fill-default')) failures.push('placeholder tone was used: ' + src);
  const playsinline = await page.locator('#sim-audio').evaluate(el => el.hasAttribute('playsinline'));
  if (!playsinline) failures.push('station audio is missing playsinline');

  await page.locator('#sim-ads-0').click();
  await setOffset(59);
  const volume = num(await page.locator('#sim-volume').getAttribute('data-volume'));
  if (Math.abs(volume - 0.8) > 0.02) failures.push('fade volume at 59s expected 0.8, got ' + volume);
  await setOffset(58);
  await page.locator('#sim-play').click();
  await page.waitForFunction(() => document.querySelector('#sim-phase')?.dataset.phase === 'show', null, { timeout: 5000 });
  const endedPaused = await page.locator('#sim-audio').evaluate(el => el.paused);
  const endedOffset = num(await page.locator('#sim-clock').getAttribute('data-offset'));
  if (!endedPaused) failures.push('bed was still playing after the minute');
  if (endedOffset < 60) failures.push('clock did not reach the next show');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) failures.push('mobile viewport overflowed by ' + overflow + 'px');
  await page.screenshot({ path: `${outDir}/sim-phone-fill.png`, fullPage: true });

  await page.locator('#break-fill-toggle').click();
  await page.locator('#break-fill-file').waitFor({ state: 'visible' });
  const saveDisabled = await page.locator('#break-fill-save').isDisabled();
  if (!saveDisabled) failures.push('preview save button must stay disabled');
  const status = await page.locator('#break-fill-status').innerText();
  if (!status.includes('No station data changed')) failures.push('preview status missing read-only notice: ' + status);
  const enabled = await page.locator('#break-fill-enabled').isChecked();
  if (enabled) failures.push('fill checkbox must start off');
  const buttonHeight = await page.locator('#break-fill-play').evaluate(el => el.getBoundingClientRect().height);
  if (buttonHeight < 44) failures.push('preview button is smaller than 44px: ' + buttonHeight);
  const fileFont = await page.locator('#break-fill-file').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  if (fileFont < 16) failures.push('file input font is below 16px: ' + fileFont);
  await page.locator('#break-fill-play').click();
  const afterStatus = await page.locator('#break-fill-status').innerText();
  if (!/Choose an audio file|stays silent/i.test(afterStatus)) failures.push('preview without a file should refuse: ' + afterStatus);
  const previewPaused = await page.locator('#break-fill-preview-audio').evaluate(el => el.paused && !String(el.src || '').includes('break-fill-default'));
  if (!previewPaused) failures.push('control room preview played without an uploaded file');
  await page.screenshot({ path: `${outDir}/sim-phone-control-room.png`, fullPage: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: `${outDir}/sim-desktop.png`, fullPage: true });

  const radio = await browser.newPage({
    viewport: phone.viewport,
    userAgent: phone.userAgent,
    isMobile: phone.isMobile,
    hasTouch: phone.hasTouch
  });
  const placeholderHits = [];
  radio.on('request', request => { if (request.url().includes('break-fill-default')) placeholderHits.push(request.url()); });
  await radio.goto(`${base}/radio.html?testBreak=1&adSeconds=18&breakOffset=40`, { waitUntil: 'domcontentloaded' });
  await radio.waitForFunction(() => /New Leaf|A WORD FROM OUR SPONSOR/.test(document.body.innerText), null, { timeout: 8000 });
  const radioText = await radio.locator('body').innerText();
  if (/STATION BREAK/.test(radioText)) failures.push('real player showed a fill bed without an approved upload');
  if (placeholderHits.length) failures.push('real player requested the placeholder tone');
  await radio.locator('#rpListen').click();
  await radio.waitForFunction(() => /PAUSE/.test(document.querySelector('#rpListen')?.textContent || ''), null, { timeout: 4000 });
  const radioOverflow = await radio.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (radioOverflow > 1) failures.push('radio page overflowed by ' + radioOverflow + 'px');
  await radio.screenshot({ path: `${outDir}/radio-phone-fill.png`, fullPage: false });
  await radio.close();

  await browser.close();
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('Break fill preview checks passed');
  console.log(outDir);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
