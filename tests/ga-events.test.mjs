import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const analytics = read('bt-analytics.js');
const signup = read('signup.html');
const website = read('website.html');
const success = read('website-merch-success.html');
const gearSuccess = read('payment-success.html');

test('signup and checkout events are tied to the successful action', () => {
  assert.equal(signup.includes("window.btTrack && window.btTrack('sign_up'"), false);
  const created = signup.indexOf('createUserWithEmailAndPassword(auth, email, password)');
  const profileSaved = signup.indexOf('profileComplete: true');
  const tracked = signup.indexOf("await trackSignup('email', accountType)");
  assert.ok(created > 0 && profileSaved > created && tracked > profileSaved);
  assert.match(website, /if\(!agreement\.checked\)/);
  const checkout = website.indexOf('await window.btTrackCheckout(checkoutParams(offer))');
  assert.equal(website.includes("website_merch"), false);
  const redirect = website.indexOf('location.href=checkout.toString()');
  assert.ok(checkout > 0 && redirect > checkout);
  assert.match(success, /trackReturnPurchase\('website-merch'\)/);
  assert.match(gearSuccess, /trackReturnPurchase\('gear-feature'\)/);
  assert.match(read('dashboard-radio-firestore.js'), /btTrack\('radio_listen'/);
  assert.match(read('radio-page.js'), /btTrack\('radio_listen'/);
  assert.match(analytics, /upload_song_click/);
  assert.match(analytics, /p\.transport_type='beacon'/);
  assert.match(analytics, /p\.event_timeout=800/);
  assert.match(website, /btTrackCheckout\(checkoutParams\(offer\)\)/);
  assert.match(website, /dataset\.checkoutStarted==='1'/);
  assert.match(read('merch.js'), /btTrackCheckout\(checkoutParams\(offer\)\)/);
  assert.match(read('merch.js'), /dataset\.checkoutStarted === '1'/);
  assert.match(read('gear-payment.js'), /btTrackCheckout\(/);
  assert.match(analytics, /delete p\.transport_type/);
});

test('internal traffic is tab-scoped and an old permanent flag is cleared', () => {
  assert.match(analytics, /localStorage\.removeItem\('bt_internal'\)/);
  assert.match(analytics, /sessionStorage\.setItem\(name,'1'\)/);
  assert.equal(analytics.includes("localStorage.setItem('bt_internal'"), false);
  assert.match(analytics, /traffic_type='internal'/);
});
