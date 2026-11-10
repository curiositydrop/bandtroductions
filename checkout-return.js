function stripeReferrer() {
  try {
    const host = new URL(document.referrer).hostname;
    return host === 'stripe.com' || host.endsWith('.stripe.com');
  } catch {
    return false;
  }
}

function queryTransactionId() {
  const params = new URLSearchParams(location.search);
  for (const key of ['session_id', 'checkout_session_id', 'payment_intent']) {
    const value = params.get(key) || '';
    if (/^[A-Za-z0-9_-]{8,200}$/.test(value)) return value;
  }
  return '';
}

const OFFERS = {
  'website-merch': { value: 15, item_name: 'Website + Merch' },
  'gear-feature': { value: 5, item_name: 'Gear Exchange feature' }
};

export async function trackReturnPurchase(plan) {
  const offer = OFFERS[plan];
  if (!offer || typeof window.btTrackPurchase !== 'function') return false;
  let transactionId = queryTransactionId();
  if (!transactionId && stripeReferrer()) {
    try {
      const pending = JSON.parse(sessionStorage.getItem('bt_checkout_pending') || 'null');
      if (pending && pending.plan === plan && /^[A-Za-z0-9_-]{8,200}$/.test(pending.nonce || '')) {
        transactionId = pending.nonce;
      }
    } catch {}
  }
  if (!transactionId) return false;
  try { sessionStorage.removeItem('bt_checkout_pending'); } catch {}
  return window.btTrackPurchase(transactionId, {
    plan,
    value: offer.value,
    items: [{ item_id: plan, item_name: offer.item_name, price: offer.value, quantity: 1 }]
  });
}
