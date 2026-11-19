import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as clientAccess from '../botw-comp-access.mjs';
import { decideUpgrade } from '../plans-upgrade.js';

const require = createRequire(import.meta.url);
const serverAccess = require('./botw-comp-access.js');

const user = { uid: 'band-1' };
const profileId = 'band-1';
const published = {
  accountType: 'band',
  ownerId: 'band-1',
  published: true,
  displayName: 'Prize Band'
};

test('normal paid signup stays on the existing checkout path', () => {
  const decision = decideUpgrade({ user, profile: published, profileId, comp: null });
  assert.equal(decision.state, 'eligible');
  assert.equal(decision.label, 'Continue to website checkout');
  assert.equal(decision.href, 'website.html?id=band-1');
  assert.match(decision.message, /seller agreement/);
});

test('an active Stripe plan and a launch partner do not see the prize prompt', () => {
  const stripe = decideUpgrade({
    user,
    profileId,
    profile: { ...published, websiteEnabled: true, websitePlanStatus: 'active' },
    comp: { expiresOn: '2020-01-01' }
  });
  assert.equal(stripe.state, 'active');
  assert.equal(stripe.label, 'Open your website');
  assert.equal(stripe.message, '');

  const partner = decideUpgrade({
    user,
    profileId,
    profile: { ...published, websiteEnabled: true, websitePlanStatus: 'comped', launchPartner: true },
    comp: { expiresOn: '2020-01-01', revokedAt: { seconds: 1 } }
  });
  assert.equal(partner.state, 'active');
  assert.equal(partner.label, 'Open your website');
  assert.equal(partner.message, '');
});

test('an unexpired comp opens the website and an expired comp asks to keep it', () => {
  const active = decideUpgrade({
    user,
    profileId,
    profile: published,
    comp: { expiresOn: '2999-01-01' }
  });
  assert.equal(active.state, 'active');
  assert.equal(active.label, 'Open your website');
  assert.match(active.message, /Comped until January 1, 2999/);
  assert.match(active.message, /No card is on file/);

  const ended = decideUpgrade({
    user,
    profileId,
    profile: published,
    comp: { expiresOn: '2000-01-01' }
  });
  assert.equal(ended.state, 'eligible');
  assert.equal(ended.label, 'Keep Website + Merch?');
  assert.equal(ended.href, 'website.html?id=band-1');
  assert.match(ended.message, /normal Website \+ Merch checkout/);
  assert.match(ended.message, /Nothing is charged unless you subscribe/);
});

test('browser and function copies of the comp rules match', () => {
  const now = new Date('2026-11-19T15:00:00.000Z');
  const samples = [
    [ { websiteEnabled: true, websitePlanStatus: 'active' }, { expiresOn: '2020-01-01' } ],
    [ { websiteEnabled: true, websitePlanStatus: 'comped', launchPartner: true }, null ],
    [ { websiteEnabled: false }, { expiresOn: '2027-01-19' } ],
    [ { websiteEnabled: false }, { expiresOn: '2027-01-19', revokedAt: true } ],
    [ {}, null ]
  ];
  for (const [profile, comp] of samples) {
    assert.equal(clientAccess.websiteMerchAccess(profile, comp, now), serverAccess.websiteMerchAccess(profile, comp, now));
  }
  assert.equal(clientAccess.defaultCompExpiresOn(now), serverAccess.defaultCompExpiresOn(now));
  assert.deepEqual(
    clientAccess.storefrontListing({ active: false, comp: { expiresOn: '2027-01-19' } }),
    serverAccess.storefrontListing({ active: false, comp: { expiresOn: '2027-01-19' } })
  );
});

test('a fan account cannot use a comp to reach checkout', () => {
  const decision = decideUpgrade({
    user,
    profileId,
    profile: { ...published, accountType: 'fan' },
    comp: { expiresOn: '2999-01-01' }
  });
  assert.equal(decision.state, 'ineligible');
  assert.equal(decision.href, '');
});
