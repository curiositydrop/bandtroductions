import test from 'node:test';
import assert from 'node:assert/strict';
import { PROMO_CHECKOUT_URL, PROMO_DEADLINE_MS, STANDARD_CHECKOUT_URL, checkoutParams, currentOffer, isPreviewHost } from '../bt-offer.js';

const live = { hostname: 'bandtroductions.com', search: '?bt_now=2027-01-01T00:00:01-05:00' };
const preview = { hostname: 'upgrade-path--bandtroductions-dev.web.app', search: '?bt_now=2027-01-01T00:00:01-05:00' };
const local = { hostname: '127.0.0.1', search: '?bt_now=2027-01-01T00:00:01-05:00' };

test('promo is on through the last second of 2026 ET and off on January 1', () => {
  const lastSecond = currentOffer(new Date('2026-12-31T23:59:59-05:00'), { hostname: 'bandtroductions.com', search: '' });
  const nextSecond = currentOffer(new Date('2027-01-01T00:00:00-05:00'), { hostname: 'bandtroductions.com', search: '' });
  assert.equal(lastSecond.promo, true);
  assert.equal(lastSecond.checkoutUrl, PROMO_CHECKOUT_URL);
  assert.equal(lastSecond.checkoutUrl, 'https://buy.stripe.com/dRmbIU1BYekifzP2if6oo0f');
  assert.match(lastSecond.text, /Months 2 and 3 are FREE/);
  assert.equal(lastSecond.value, 15);
  assert.equal(lastSecond.plan, 'website-merch');
  assert.equal(checkoutParams(lastSecond).plan, 'website-merch');
  assert.equal(checkoutParams(lastSecond).value, 15);
  assert.equal(nextSecond.promo, false);
  assert.equal(nextSecond.paused, false);
  assert.equal(nextSecond.value, 15);
  assert.equal(nextSecond.plan, 'website-merch');
  assert.equal(nextSecond.checkoutUrl, STANDARD_CHECKOUT_URL);
  assert.equal(nextSecond.checkoutUrl, 'https://buy.stripe.com/9B6dR23K6ccaevL6yv6oo0h');
  assert.equal(nextSecond.short, '$15/month. Cancel anytime.');
  assert.equal(/free|activation fee/i.test(nextSecond.short), false);
  assert.equal(checkoutParams(nextSecond).plan, 'website-merch');
  assert.equal(checkoutParams(nextSecond).value, 15);
  assert.equal(PROMO_DEADLINE_MS, Date.parse('2026-12-31T23:59:59-05:00'));
});

test('bt_now is ignored on the live host and honored on preview and localhost', () => {
  const during = new Date('2026-11-10T12:00:00-05:00');
  assert.equal(isPreviewHost('bandtroductions.com'), false);
  assert.equal(isPreviewHost('www.bandtroductions.com'), false);
  assert.equal(currentOffer(during, live).promo, true);
  assert.equal(isPreviewHost(preview.hostname), true);
  assert.equal(currentOffer(during, preview).promo, false);
  assert.equal(currentOffer(during, local).promo, false);
  assert.equal(currentOffer(during, { hostname: 'upgrade-path--bandtroductions-dev.web.app', search: '' }).promo, true);
});
