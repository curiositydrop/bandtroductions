'use strict';

// Keep every existing Firebase export, then replace the merch webhook with the
// Website + Merch plan version and add the authenticated upgrade-prep callable.
const existing = require('./index');
const crypto = require('crypto');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');
const { HttpsError, onCall, onRequest } = require('firebase-functions/v2/https');
const {
  cleanStripeId,
  isLaunchPartner,
  merchStatusFromStripe,
  subscriptionIdFromInvoice,
  verifyStripeSignature
} = require('./stripe-webhook-utils');

const db = getFirestore();
const REGION = 'us-central1';
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const ARTIST_TYPES = new Set(['band', 'musician']);
const ACTIVE_PLAN_STATUSES = new Set(['active', 'trialing', 'comped']);
const ADMIN_EMAILS = new Set(['mbergeron79@gmail.com', 'mbegeron79@gmail.com']);

function cleanString(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to upgrade your artist profile.');
  return request.auth.uid;
}

function isArtistOwner(profileSnapshot, uid, email = '') {
  const profile = profileSnapshot.data() || {};
  const ownerId = cleanString(profile.ownerId || profile.userId || profile.uid || profileSnapshot.id, 200);
  return ownerId === uid || ADMIN_EMAILS.has(cleanString(email, 200).toLowerCase());
}

function defaultWebsiteSettings(profile = {}) {
  return {
    revision: crypto.randomUUID(),
    theme: { background: '#0b100f', text: '#eef4ee', accent: '#c3ec77' },
    tagline: '',
    heroBrightness: 1.16,
    heroPosition: { x: 50, y: 25 },
    heroButtons: [
      { label: 'Meet the band', url: '#/about' },
      { label: 'Get in touch', url: '#/contact' }
    ],
    sections: {
      about: true,
      meetBand: true,
      music: true,
      photos: true,
      shows: true,
      merch: true,
      booking: true,
      contact: true
    },
    booking: {
      enabled: true,
      email: cleanString(profile.bookingEmail || profile.email, 200),
      rateCents: 0,
      rateBasis: 'show',
      paymentPolicy: 'in_person',
      depositPercent: 0,
      depositPaymentUrl: '',
      fullPaymentUrl: ''
    },
    buttons: [],
    photos: [],
    videos: [],
    bandMembers: []
  };
}

function storefrontData(store, published) {
  return {
    profileId: cleanString(store.profileId || store.id, 200),
    profileType: cleanString(store.profileType, 40),
    bandName: cleanString(store.bandName, 120) || 'BANDtroductions Artist',
    coverImageUrl: cleanString(store.coverImageUrl, 2000),
    websiteUrl: cleanString(store.websiteUrl, 1000),
    storeDescription: cleanString(store.storeDescription, 500),
    published,
    updatedAt: FieldValue.serverTimestamp()
  };
}

async function setArtistPlan(profileId, status, eventId, batch, profileSnapshot = null) {
  const snap = profileSnapshot || await db.collection('profiles').doc(profileId).get();
  if (!snap.exists) return;
  const profile = snap.data() || {};
  const enabled = ACTIVE_PLAN_STATUSES.has(status);
  const update = {
    websiteEnabled: enabled,
    websitePlanStatus: status,
    artistPlan: {
      key: 'website-merch',
      label: 'Website + Merch',
      status,
      monthlyPrice: 15,
      updatedAt: FieldValue.serverTimestamp()
    },
    websitePlanUpdatedAt: FieldValue.serverTimestamp(),
    websitePlanStripeEventId: cleanString(eventId, 200)
  };
  if (enabled && !profile.websiteSettings?.revision) update.websiteSettings = defaultWebsiteSettings(profile);
  if (enabled && !profile.websiteActivatedAt) update.websiteActivatedAt = FieldValue.serverTimestamp();
  batch.set(snap.ref, update, { merge: true });
}

async function findStoreBySubscription(subscriptionId) {
  if (!subscriptionId) return null;
  const mapping = await db.collection('stripeMerchSubscriptions').doc(subscriptionId).get();
  const mappedStoreId = cleanString(mapping.data()?.storeId, 200);
  if (mappedStoreId) {
    const snap = await db.collection('merchStores').doc(mappedStoreId).get();
    if (snap.exists) return snap;
  }
  const matches = await db.collection('merchStores').where('stripeSubscriptionId', '==', subscriptionId).limit(1).get();
  return matches.empty ? null : matches.docs[0];
}

async function applySubscriptionStatus(storeSnapshot, stripeStatus, eventId, extra = {}) {
  if (!storeSnapshot?.exists) return '';
  const store = { id: storeSnapshot.id, ...storeSnapshot.data() };
  const status = isLaunchPartner(store) ? 'comped' : merchStatusFromStripe(stripeStatus);
  const active = ACTIVE_PLAN_STATUSES.has(status) && store.adminPaused !== true;
  const batch = db.batch();
  batch.set(storeSnapshot.ref, {
    ...extra,
    subscriptionStatus: status,
    billingStatus: status,
    billingVerified: active,
    billingEnforcement: isLaunchPartner(store) ? 'exempt-launch-partner' : 'stripe',
    applicationStatus: active ? 'approved' : status,
    adminApproved: active,
    published: active,
    lastStripeEventId: cleanString(eventId, 200),
    billingUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  batch.set(db.collection('merchStorefronts').doc(store.id), storefrontData(store, active), { merge: true });
  await setArtistPlan(store.id, status, eventId, batch);
  await batch.commit();
  return store.id;
}

async function handleCheckout(session, eventId) {
  if (session?.mode !== 'subscription' || session?.status !== 'complete') return '';
  const profileId = cleanString(session.client_reference_id, 200);
  if (!profileId || profileId === 'admin-merch-preview') return '';
  const storeSnapshot = await db.collection('merchStores').doc(profileId).get();
  if (!storeSnapshot.exists) {
    console.warn('Website + Merch checkout has no prepared artist store', eventId, profileId);
    return '';
  }
  const store = { id: storeSnapshot.id, ...storeSnapshot.data() };
  const checkoutEmail = cleanString(session.customer_details?.email || session.customer_email, 200).toLowerCase();
  const storeEmail = cleanString(store.contactEmail, 200).toLowerCase();
  const emailMatches = !checkoutEmail || !storeEmail || checkoutEmail === storeEmail;
  const subscriptionId = cleanStripeId(session.subscription);
  const customerId = cleanStripeId(session.customer);
  const status = isLaunchPartner(store) ? 'comped' : 'trialing';
  const active = emailMatches;
  const profileSnapshot = await db.collection('profiles').doc(profileId).get();
  const batch = db.batch();

  batch.set(storeSnapshot.ref, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripeCheckoutSessionId: cleanStripeId(session.id),
    stripePaymentLinkId: cleanStripeId(session.payment_link),
    checkoutEmail,
    billingIdentityMatch: emailMatches,
    subscriptionStatus: active ? status : 'pending',
    billingStatus: active ? status : 'pending',
    billingVerified: active,
    billingEnforcement: isLaunchPartner(store) ? 'exempt-launch-partner' : 'stripe',
    applicationStatus: active ? 'approved' : 'payment_review',
    adminApproved: active,
    published: active,
    lastStripeEventId: cleanString(eventId, 200),
    checkoutCompletedAt: FieldValue.serverTimestamp(),
    billingUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  if (subscriptionId) {
    batch.set(db.collection('stripeMerchSubscriptions').doc(subscriptionId), {
      storeId: profileId,
      customerId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  batch.set(db.collection('merchStorefronts').doc(profileId), storefrontData(store, active), { merge: true });
  if (active) await setArtistPlan(profileId, status, eventId, batch, profileSnapshot);
  await batch.commit();
  return profileId;
}

async function handleStripeEvent(event) {
  const object = event?.data?.object || {};
  if (event.type === 'checkout.session.completed') return handleCheckout(object, event.id);
  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const subId = cleanStripeId(object.id);
    const store = await findStoreBySubscription(subId);
    return store ? applySubscriptionStatus(store, object.status, event.id, {
      stripeCustomerId: cleanStripeId(object.customer),
      stripeSubscriptionId: subId,
      stripeCurrentPeriodEnd: Number(object.current_period_end || 0),
      stripeCancelAtPeriodEnd: object.cancel_at_period_end === true
    }) : '';
  }
  if (event.type === 'customer.subscription.deleted') {
    const subId = cleanStripeId(object.id);
    const store = await findStoreBySubscription(subId);
    return store ? applySubscriptionStatus(store, 'canceled', event.id, { stripeSubscriptionId: subId }) : '';
  }
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const subId = subscriptionIdFromInvoice(object);
    const store = await findStoreBySubscription(subId);
    return store ? applySubscriptionStatus(store, event.type === 'invoice.paid' ? 'active' : 'past_due', event.id, {
      stripeSubscriptionId: subId,
      stripeInvoiceId: cleanStripeId(object.id),
      lastInvoiceAmountPaid: Number(object.amount_paid || 0),
      lastInvoiceAt: FieldValue.serverTimestamp()
    }) : '';
  }
  return '';
}

exports.prepareArtistUpgrade = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const profileId = cleanString(request.data?.profileId, 200);
  const accepted = request.data?.sellerAgreementAccepted === true;
  if (!profileId || profileId.includes('/')) throw new HttpsError('invalid-argument', 'Invalid artist profile.');
  if (!accepted) throw new HttpsError('failed-precondition', 'Accept the merch seller responsibility agreement to continue.');

  const profileSnapshot = await db.collection('profiles').doc(profileId).get();
  if (!profileSnapshot.exists) throw new HttpsError('not-found', 'Artist profile not found.');
  const profile = profileSnapshot.data() || {};
  const type = cleanString(profile.accountType, 40).toLowerCase();
  if (!ARTIST_TYPES.has(type)) throw new HttpsError('failed-precondition', 'Website + Merch is available to band and musician profiles.');
  if (!isArtistOwner(profileSnapshot, uid, request.auth.token?.email)) throw new HttpsError('permission-denied', 'This account does not own that artist profile.');
  if (profile.published !== true) throw new HttpsError('failed-precondition', 'Your free artist profile must be active before upgrading.');

  const contactEmail = cleanString(request.auth.token?.email || profile.bookingEmail || profile.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new HttpsError('failed-precondition', 'Add a valid email to your account before upgrading.');

  const storeRef = db.collection('merchStores').doc(profileId);
  const storeSnapshot = await storeRef.get();
  const existingStore = storeSnapshot.data() || {};
  const existingStatus = cleanString(existingStore.subscriptionStatus, 40);
  const websiteUrl = `https://bandtroductions.com/website.html?id=${encodeURIComponent(profileId)}`;
  const store = {
    id: profileId,
    ownerId: cleanString(profile.ownerId || profile.userId || profile.uid || profileId, 200),
    profileId,
    profileType: type,
    bandName: cleanString(profile.displayName, 120) || 'BANDtroductions Artist',
    coverImageUrl: cleanString(profile.imageUrl || profile.bannerImageUrl || profile.coverImageUrl, 2000),
    contactEmail,
    websiteUrl,
    storeDescription: cleanString(existingStore.storeDescription || profile.bio || `Official merchandise from ${profile.displayName || 'this artist'}.`, 500),
    sellerAgreementAccepted: true,
    sellerAgreementAcceptedAt: existingStore.sellerAgreementAcceptedAt || FieldValue.serverTimestamp(),
    subscriptionStatus: ACTIVE_PLAN_STATUSES.has(existingStatus) ? existingStatus : 'pending',
    subscriptionPrice: 15,
    renewalPrice: 15,
    planKey: 'website-merch',
    planLabel: 'Website + Merch',
    applicationStatus: ACTIVE_PLAN_STATUSES.has(existingStatus) ? 'approved' : 'pending',
    published: ACTIVE_PLAN_STATUSES.has(existingStatus),
    updatedAt: FieldValue.serverTimestamp(),
    ...(storeSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() })
  };

  const batch = db.batch();
  batch.set(storeRef, store, { merge: true });
  if (ACTIVE_PLAN_STATUSES.has(existingStatus)) {
    batch.set(db.collection('merchStorefronts').doc(profileId), storefrontData(store, true), { merge: true });
    await setArtistPlan(profileId, existingStatus, 'upgrade-sync', batch, profileSnapshot);
  }
  await batch.commit();
  return { ok: true, profileId, contactEmail, subscriptionStatus: store.subscriptionStatus };
});

exports.stripeMerchWebhook = onRequest(
  { region: REGION, secrets: [STRIPE_WEBHOOK_SECRET], cors: false },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).send('Method not allowed');
      return;
    }
    const rawBody = Buffer.isBuffer(request.rawBody) ? request.rawBody : Buffer.from(request.rawBody || '');
    if (!verifyStripeSignature(rawBody, request.get('stripe-signature'), STRIPE_WEBHOOK_SECRET.value())) {
      response.status(400).send('Invalid Stripe signature');
      return;
    }
    let event;
    try { event = JSON.parse(rawBody.toString('utf8')); }
    catch (_) { response.status(400).send('Invalid JSON'); return; }
    try {
      const profileId = await handleStripeEvent(event);
      console.log('Website + Merch webhook processed', event.id, event.type, profileId || 'no-plan-change');
      response.status(200).json({ received: true });
    } catch (error) {
      console.error('Website + Merch webhook failed', event?.id, event?.type, error);
      response.status(500).send('Webhook processing failed');
    }
  }
);

module.exports = {
  ...existing,
  prepareArtistUpgrade: exports.prepareArtistUpgrade,
  stripeMerchWebhook: exports.stripeMerchWebhook
};
