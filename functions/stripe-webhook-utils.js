const crypto = require('crypto');

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

function cleanStripeId(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value.id === 'string') return value.id.trim();
  return '';
}

function parseStripeSignature(header) {
  const values = { timestamp: 0, signatures: [] };
  String(header || '').split(',').forEach(part => {
    const separator = part.indexOf('=');
    if (separator < 1) return;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 't') values.timestamp = Number(value);
    if (key === 'v1' && /^[a-f0-9]{64}$/i.test(value)) values.signatures.push(value.toLowerCase());
  });
  return values;
}

function verifyStripeSignature(rawBody, header, secret, nowMs = Date.now()) {
  if (!Buffer.isBuffer(rawBody) || !secret) return false;
  const { timestamp, signatures } = parseStripeSignature(header);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !signatures.length) return false;
  const age = Math.abs(Math.floor(nowMs / 1000) - timestamp);
  if (age > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;

  const payload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  return signatures.some(signature => {
    const candidate = Buffer.from(signature, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}

function merchStatusFromStripe(status) {
  return ({
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    unpaid: 'past_due',
    paused: 'paused',
    incomplete: 'paused',
    incomplete_expired: 'canceled',
    canceled: 'canceled'
  })[String(status || '').toLowerCase()] || 'paused';
}

function subscriptionIdFromInvoice(invoice) {
  return cleanStripeId(invoice?.subscription)
    || cleanStripeId(invoice?.parent?.subscription_details?.subscription);
}

function isLaunchPartner(store) {
  return store?.subscriptionStatus === 'comped'
    || store?.billingPlan === 'launch-partner'
    || store?.launchPartner === true;
}

module.exports = {
  cleanStripeId,
  isLaunchPartner,
  merchStatusFromStripe,
  parseStripeSignature,
  subscriptionIdFromInvoice,
  verifyStripeSignature
};
