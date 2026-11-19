'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  addCalendarMonths,
  compAccess,
  defaultCompExpiresOn,
  etDateString,
  grantBlockReason,
  storefrontListing,
  storefrontVisible,
  validCompExpiresOn,
  websiteMerchAccess
} = require('./botw-comp-access');

const NOW = new Date('2026-11-19T15:00:00.000Z');

test('Eastern calendar date and a two-month default', () => {
  assert.equal(etDateString(NOW), '2026-11-19');
  assert.equal(etDateString(new Date('2026-11-19T04:00:00.000Z')), '2026-11-18');
  assert.equal(defaultCompExpiresOn(NOW), '2027-01-19');
  assert.equal(addCalendarMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addCalendarMonths('2026-11-19', 2), '2027-01-19');
});

test('comp is active through the end date and then lapses with no cron', () => {
  const comp = { expiresOn: '2027-01-19', reason: 'band-of-the-week' };
  assert.equal(compAccess(comp, new Date('2027-01-19T15:00:00.000Z')), 'active');
  assert.equal(compAccess(comp, new Date('2027-01-20T15:00:00.000Z')), 'ended');
  assert.equal(compAccess({ ...comp, revokedAt: { seconds: 1 } }, NOW), 'ended');
  assert.equal(compAccess(null, NOW), 'none');
});

test('Stripe subscribers and launch partners stay paid, including when a prize date is present', () => {
  const stripe = { websiteEnabled: true, websitePlanStatus: 'active' };
  const trialing = { websiteEnabled: true, websitePlanStatus: 'trialing', artistPlan: { status: 'trialing' } };
  const partner = { websiteEnabled: true, websitePlanStatus: 'comped', launchPartner: true, billingPlan: 'launch-partner' };
  const expired = { expiresOn: '2026-01-01' };
  assert.equal(websiteMerchAccess(stripe, expired, NOW), 'paid');
  assert.equal(websiteMerchAccess(trialing, null, NOW), 'paid');
  assert.equal(websiteMerchAccess(partner, expired, NOW), 'paid');
  assert.equal(websiteMerchAccess({ websiteEnabled: false }, { expiresOn: '2027-01-19' }, NOW), 'comp');
  assert.equal(websiteMerchAccess({ websiteEnabled: true, websitePlanStatus: 'canceled' }, expired, NOW), 'comp-ended');
  assert.equal(websiteMerchAccess({ websiteEnabled: false }, null, NOW), 'free');
});

test('grant refuses launch partners and Stripe subscriptions and allows a free profile', () => {
  assert.equal(grantBlockReason(
    { launchPartner: true, websiteEnabled: true, websitePlanStatus: 'comped' },
    { subscriptionStatus: 'comped', billingPlan: 'launch-partner' }
  ), 'launch-partner');
  assert.equal(grantBlockReason(
    { displayName: 'Ascent To Power' },
    { subscriptionStatus: 'comped', launchPartner: true }
  ), 'launch-partner');
  assert.equal(grantBlockReason(
    { websiteEnabled: true, websitePlanStatus: 'active' },
    { subscriptionStatus: 'active', stripeSubscriptionId: 'sub_123', billingEnforcement: 'stripe' }
  ), 'stripe');
  assert.equal(grantBlockReason(
    { websiteEnabled: true, websitePlanStatus: 'trialing' },
    { subscriptionStatus: 'past_due', stripeSubscriptionId: 'sub_456' }
  ), 'stripe');
  assert.equal(grantBlockReason(
    { websiteEnabled: false, accountType: 'band', published: true },
    { subscriptionStatus: 'pending' }
  ), '');
  assert.equal(grantBlockReason({ accountType: 'band', published: true }, {}), '');
});

test('storefront listing is unchanged without a comp and keeps a prize after Stripe cancellation', () => {
  assert.deepEqual(storefrontListing({ active: true, comp: null }), { published: true, clearCompMarker: true });
  assert.deepEqual(storefrontListing({ active: false, comp: null }), { published: false, clearCompMarker: false });
  assert.deepEqual(
    storefrontListing({ active: false, comp: { expiresOn: '2027-01-19' } }),
    { published: true, clearCompMarker: false, expiresOn: '2027-01-19' }
  );
  assert.deepEqual(
    storefrontListing({ active: true, comp: { expiresOn: '2027-01-19' } }),
    { published: true, clearCompMarker: true }
  );
});

test('public merch listing hides only an expired prize storefront', () => {
  assert.equal(storefrontVisible({ published: true, bandName: 'Paying Band' }, NOW), true);
  assert.equal(storefrontVisible({
    published: true,
    launchPartner: true,
    subscriptionStatus: 'comped',
    botwCompExpiresOn: '2020-01-01'
  }, NOW), true);
  assert.equal(storefrontVisible({
    published: true,
    billingEnforcement: 'stripe',
    subscriptionStatus: 'active',
    botwCompExpiresOn: '2020-01-01'
  }, NOW), true);
  assert.equal(storefrontVisible({ published: true, botwCompExpiresOn: '2027-01-19' }, NOW), true);
  assert.equal(storefrontVisible({ published: true, botwCompExpiresOn: '2026-11-18' }, NOW), false);
  assert.equal(storefrontVisible({ published: false, botwCompExpiresOn: '2027-01-19' }, NOW), false);
});

test('end dates cannot be in the past or long enough to mimic a permanent comp', () => {
  assert.equal(validCompExpiresOn('2027-01-19', NOW), '');
  assert.equal(validCompExpiresOn('2026-11-19', NOW), '');
  assert.equal(validCompExpiresOn('2026-11-18', NOW), 'The comp end date has to be today or later.');
  assert.notEqual(validCompExpiresOn('2030-01-01', NOW), '');
  assert.notEqual(validCompExpiresOn('next year', NOW), '');
});
