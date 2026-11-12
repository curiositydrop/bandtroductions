// One place for the Website + Merch price, the launch promo, and both checkout URLs.
// Do not copy the promo wording or the Stripe links into other files.
export const PROMO_ENDS_AT = '2026-12-31T23:59:59-05:00';
export const PROMO_DEADLINE_MS = Date.parse(PROMO_ENDS_AT);
export const PROMO_CHECKOUT_URL = 'https://buy.stripe.com/dRmbIU1BYekifzP2if6oo0f';
export const STANDARD_CHECKOUT_URL = 'https://buy.stripe.com/9B6dR23K6ccaevL6yv6oo0h';
export const PLAN_ID = 'website-merch';
export const PLAN_PRICE = 15;
export const PAUSED_MESSAGE = 'Upgrades are paused for a moment. Contact us.';

export const PROMO = {
  label: 'LIMITED-TIME LAUNCH OFFER',
  heading: 'Get 2 Months FREE!',
  text: 'Pay just $15 for your first month. Months 2 and 3 are FREE, then just $15/month.',
  ends: 'Offer ends December 31, 2026.'
};

export function isPreviewHost(hostname = '') {
  return hostname === 'localhost' || hostname === '127.0.0.1' || /--[a-z0-9-]+\.web\.app$/i.test(hostname);
}

export function resolveNow(now = new Date(), loc) {
  const host = String(loc?.hostname || '');
  if (!isPreviewHost(host)) return now;
  let stamp = '';
  try { stamp = new URLSearchParams(String(loc?.search || '')).get('bt_now') || ''; } catch { stamp = ''; }
  const storage = globalThis.sessionStorage;
  if (stamp) {
    const parsed = new Date(stamp);
    if (!Number.isNaN(parsed.getTime())) {
      try { storage?.setItem('bt_now', stamp); } catch {}
      return parsed;
    }
  }
  try {
    const saved = storage?.getItem('bt_now') || '';
    if (saved) {
      const parsed = new Date(saved);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  } catch {}
  return now;
}

export function currentOffer(now = new Date(), loc = globalThis.location) {
  const at = resolveNow(now, loc);
  if (at.getTime() <= PROMO_DEADLINE_MS) {
    return {
      promo: true,
      paused: false,
      checkoutUrl: PROMO_CHECKOUT_URL,
      plan: PLAN_ID,
      value: PLAN_PRICE,
      ...PROMO,
      short: `${PROMO.text} ${PROMO.ends}`
    };
  }
  return {
    promo: false,
    paused: !STANDARD_CHECKOUT_URL,
    checkoutUrl: STANDARD_CHECKOUT_URL,
    plan: PLAN_ID,
    value: PLAN_PRICE,
    label: 'Band Website + Merch',
    heading: '$15/month',
    text: '$15/month. Cancel anytime.',
    ends: '',
    short: '$15/month. Cancel anytime.'
  };
}

export function checkoutParams(offer = currentOffer()) {
  return {
    plan: offer.plan,
    currency: 'USD',
    value: offer.value,
    items: [{ item_id: offer.plan, item_name: 'Website + Merch', price: offer.value, quantity: 1 }]
  };
}
