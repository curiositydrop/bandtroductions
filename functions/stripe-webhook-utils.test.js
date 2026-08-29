const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
  isLaunchPartner,
  merchStatusFromStripe,
  subscriptionIdFromInvoice,
  verifyStripeSignature
} = require('./stripe-webhook-utils');

test('accepts a current valid Stripe signature', () => {
  const body = Buffer.from('{"id":"evt_test"}');
  const secret = 'whsec_test_secret';
  const timestamp = 2_000_000_000;
  const signature = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${body.toString('utf8')}`)
    .digest('hex');
  assert.equal(
    verifyStripeSignature(body, `t=${timestamp},v1=${signature}`, secret, timestamp * 1000),
    true
  );
});

test('rejects altered and expired Stripe signatures', () => {
  const body = Buffer.from('{"id":"evt_test"}');
  const secret = 'whsec_test_secret';
  const timestamp = 2_000_000_000;
  const signature = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${body.toString('utf8')}`)
    .digest('hex');
  assert.equal(verifyStripeSignature(Buffer.from('changed'), `t=${timestamp},v1=${signature}`, secret, timestamp * 1000), false);
  assert.equal(verifyStripeSignature(body, `t=${timestamp},v1=${signature}`, secret, (timestamp + 301) * 1000), false);
});

test('maps Stripe subscription states to merch billing states', () => {
  assert.equal(merchStatusFromStripe('trialing'), 'trialing');
  assert.equal(merchStatusFromStripe('active'), 'active');
  assert.equal(merchStatusFromStripe('unpaid'), 'past_due');
  assert.equal(merchStatusFromStripe('canceled'), 'canceled');
});

test('reads current and legacy invoice subscription shapes', () => {
  assert.equal(subscriptionIdFromInvoice({ subscription: 'sub_old' }), 'sub_old');
  assert.equal(subscriptionIdFromInvoice({ parent: { subscription_details: { subscription: 'sub_new' } } }), 'sub_new');
});

test('recognizes every launch-partner marker', () => {
  assert.equal(isLaunchPartner({ subscriptionStatus: 'comped' }), true);
  assert.equal(isLaunchPartner({ billingPlan: 'launch-partner' }), true);
  assert.equal(isLaunchPartner({ launchPartner: true }), true);
  assert.equal(isLaunchPartner({ subscriptionStatus: 'active' }), false);
});
