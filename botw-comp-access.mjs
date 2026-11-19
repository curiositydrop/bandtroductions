// Band of the Week Website + Merch comp.
// Date math only. No Stripe calls and no Firestore writes.
// Keep functions/botw-comp-access.js in sync with this file.

const ACTIVE_WEBSITE = new Set(['active', 'trialing', 'comped']);
const STRIPE_STORE_STATUSES = new Set(['active', 'trialing', 'past_due', 'paused']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function etDateString(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

export function addCalendarMonths(isoDate, months) {
  if (!ISO_DATE.test(String(isoDate || '')) || !Number.isInteger(months)) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const result = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay)));
  return result.toISOString().slice(0, 10);
}

export function formatCompDate(isoDate) {
  if (!ISO_DATE.test(String(isoDate || ''))) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function normalizeComp(comp) {
  if (!comp || typeof comp !== 'object') return null;
  const expiresOn = String(comp.expiresOn || comp.botwCompExpiresOn || '');
  if (!ISO_DATE.test(expiresOn)) return null;
  const revoked = comp.revoked === true
    || comp.botwCompRevoked === true
    || (comp.revokedAt != null && comp.revokedAt !== false && comp.revokedAt !== '');
  return { expiresOn, revoked };
}

export function compAccess(comp, now = new Date()) {
  const normalized = normalizeComp(comp);
  if (!normalized) return 'none';
  if (normalized.revoked) return 'ended';
  return etDateString(now) <= normalized.expiresOn ? 'active' : 'ended';
}

export function stripeOrPartnerWebsite(profile) {
  const status = String(profile?.websitePlanStatus || profile?.artistPlan?.status || '').toLowerCase();
  return profile?.websiteEnabled === true && ACTIVE_WEBSITE.has(status);
}

// paid: Stripe or permanent launch partner. comp: unexpired prize. comp-ended: prize lapsed.
// A paid profile stays paid even when a prize date is also present.
export function websiteMerchAccess(profile, comp, now = new Date()) {
  if (stripeOrPartnerWebsite(profile)) return 'paid';
  const state = compAccess(comp, now);
  if (state === 'active') return 'comp';
  if (state === 'ended') return 'comp-ended';
  return 'free';
}

export function grantBlockReason(profile, store) {
  const profileStatus = String(profile?.websitePlanStatus || profile?.artistPlan?.status || '').toLowerCase();
  const partner = profile?.launchPartner === true
    || profile?.billingPlan === 'launch-partner'
    || profile?.billingEnforcement === 'exempt-launch-partner'
    || profileStatus === 'comped'
    || store?.launchPartner === true
    || store?.billingPlan === 'launch-partner'
    || store?.billingEnforcement === 'exempt-launch-partner'
    || store?.subscriptionStatus === 'comped';
  if (partner) return 'launch-partner';
  const storeStatus = String(store?.subscriptionStatus || '');
  if (store?.stripeSubscriptionId
    || STRIPE_STORE_STATUSES.has(storeStatus)
    || (profile?.websiteEnabled === true && (profileStatus === 'active' || profileStatus === 'trialing'))) {
    return 'stripe';
  }
  return '';
}

export function storefrontListing({ active, comp } = {}) {
  if (active === true) return { published: true, clearCompMarker: true };
  const normalized = normalizeComp(comp);
  if (normalized && compAccess(normalized) === 'active') {
    return { published: true, clearCompMarker: false, expiresOn: normalized.expiresOn };
  }
  return { published: false, clearCompMarker: false };
}

export function storefrontVisible(store, now = new Date()) {
  if (!store || store.published !== true) return false;
  if (store.storeKind === 'business') return true;
  if (store.launchPartner === true || store.billingPlan === 'launch-partner' || store.subscriptionStatus === 'comped') return true;
  if (store.billingEnforcement === 'stripe' && (store.subscriptionStatus === 'active' || store.subscriptionStatus === 'trialing')) return true;
  const marked = normalizeComp({
    expiresOn: store.botwCompExpiresOn,
    revoked: store.botwCompRevoked === true
  });
  if (!marked) return true;
  return compAccess(marked, now) === 'active';
}

export function validCompExpiresOn(expiresOn, now = new Date()) {
  if (!ISO_DATE.test(String(expiresOn || ''))) return 'Choose a valid end date.';
  const today = etDateString(now);
  if (expiresOn < today) return 'The comp end date has to be today or later.';
  const max = addCalendarMonths(today, 24);
  if (expiresOn > max) return 'A Band of the Week comp can run at most 24 months. Permanent access stays on the launch-partner grant.';
  return '';
}

export function defaultCompExpiresOn(now = new Date()) {
  return addCalendarMonths(etDateString(now), 2);
}

export function compNote(comp) {
  const normalized = normalizeComp(comp);
  if (!normalized) return '';
  return `Comped until ${formatCompDate(normalized.expiresOn)} (Band of the Week prize). No card is on file.`;
}

export function keepPromptMessage(comp) {
  const normalized = normalizeComp(comp);
  const date = normalized ? formatCompDate(normalized.expiresOn) : '';
  const when = date ? ` on ${date}` : '';
  return `Your Band of the Week prize ended${when}. The next page is the normal Website + Merch checkout. Nothing is charged unless you subscribe.`;
}
