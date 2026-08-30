const crypto = require('crypto');
const webpush = require('web-push');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');
const { HttpsError, onCall, onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const {
  cleanStripeId,
  isLaunchPartner,
  merchStatusFromStripe,
  subscriptionIdFromInvoice,
  verifyStripeSignature
} = require('./stripe-webhook-utils');

initializeApp();
const db = getFirestore();
const VAPID_PUBLIC_KEY = defineSecret('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const REGION = 'us-central1';
const GOOD_MERCH_BILLING_STATUSES = new Set(['active', 'trialing']);
const MERCH_PROFILE_TYPES = new Set(['band', 'musician']);
const MERCH_ACTIVE_STATUSES = new Set(['active', 'trialing', 'comped']);
const BUSINESS_ACTIVE_STATUSES = new Set(['active', 'comped']);
const MERCH_ADMIN_EMAILS = new Set(['mbergeron79@gmail.com', 'mbegeron79@gmail.com']);

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage notifications.');
  return request.auth.uid;
}

function cleanString(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidWebUrl(value) {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch (_) {
    return false;
  }
}

function subscriptionDocId(endpoint) {
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

function configureWebPush() {
  webpush.setVapidDetails(
    'mailto:info@bandtroductions.com',
    VAPID_PUBLIC_KEY.value(),
    VAPID_PRIVATE_KEY.value()
  );
}

async function resolveRecipientUserId(recipientId) {
  if (!recipientId) return '';
  const direct = await db.collection('pushSubscriptions').doc(recipientId).collection('devices').limit(1).get();
  if (!direct.empty) return recipientId;
  const profile = await db.collection('profiles').doc(recipientId).get();
  return cleanString(profile.data()?.ownerId || profile.data()?.userId || profile.data()?.uid || recipientId, 200);
}

async function sendToUser(uid, payload) {
  if (!uid) return { sent: 0, removed: 0 };
  configureWebPush();
  const devicesRef = db.collection('pushSubscriptions').doc(uid).collection('devices');
  const devices = await devicesRef.get();
  let sent = 0;
  let removed = 0;

  await Promise.all(devices.docs.map(async device => {
    const data = device.data() || {};
    const subscription = data.subscription;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return;
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 120 });
      sent += 1;
      await device.ref.set({ lastPushAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      const status = Number(error?.statusCode || 0);
      if (status === 404 || status === 410) {
        removed += 1;
        await device.ref.delete();
      } else {
        console.error('Push delivery failed', uid, status, error?.message || error);
      }
    }
  }));

  return { sent, removed };
}

function merchStorefrontData(store, published) {
  return {
    profileId: cleanString(store.profileId || store.id, 200),
    bandName: cleanString(store.bandName, 120) || 'BANDtroductions Band',
    coverImageUrl: cleanString(store.coverImageUrl, 2000),
    websiteUrl: cleanString(store.websiteUrl, 1000),
    storeDescription: cleanString(store.storeDescription, 500),
    published,
    updatedAt: FieldValue.serverTimestamp()
  };
}

function merchStoreWasApproved(store) {
  return store.adminApproved === true
    || store.published === true
    || store.applicationStatus === 'approved';
}

async function findMerchStoreBySubscription(subscriptionId) {
  if (!subscriptionId) return null;
  const mapping = await db.collection('stripeMerchSubscriptions').doc(subscriptionId).get();
  const mappedStoreId = cleanString(mapping.data()?.storeId, 200);
  if (mappedStoreId) {
    const mappedStore = await db.collection('merchStores').doc(mappedStoreId).get();
    if (mappedStore.exists) return mappedStore;
  }

  const matches = await db.collection('merchStores')
    .where('stripeSubscriptionId', '==', subscriptionId)
    .limit(1)
    .get();
  return matches.empty ? null : matches.docs[0];
}

async function applyMerchBillingStatus(storeSnapshot, billingStatus, eventId, extra = {}) {
  if (!storeSnapshot?.exists) return '';
  const store = { id: storeSnapshot.id, ...storeSnapshot.data() };
  const storeRef = storeSnapshot.ref;
  const status = merchStatusFromStripe(billingStatus);
  const common = {
    billingStatus: status,
    billingVerified: GOOD_MERCH_BILLING_STATUSES.has(status),
    billingUpdatedAt: FieldValue.serverTimestamp(),
    lastStripeEventId: cleanString(eventId, 200),
    updatedAt: FieldValue.serverTimestamp(),
    ...extra
  };

  if (isLaunchPartner(store)) {
    await storeRef.set({
      ...common,
      billingEnforcement: 'exempt-launch-partner'
    }, { merge: true });
    return store.id;
  }

  const approved = merchStoreWasApproved(store);
  const billingGood = GOOD_MERCH_BILLING_STATUSES.has(status);
  const shouldPublish = approved && billingGood && store.adminPaused !== true;
  const privateUpdate = {
    ...common,
    adminApproved: approved,
    applicationStatus: approved ? 'approved' : (billingGood ? 'payment_verified' : 'pending'),
    published: shouldPublish
  };

  if (approved) privateUpdate.subscriptionStatus = status;
  else if (!store.subscriptionStatus || store.subscriptionStatus === 'canceled') privateUpdate.subscriptionStatus = 'pending';

  const batch = db.batch();
  batch.set(storeRef, privateUpdate, { merge: true });
  if (approved || store.published === true) {
    batch.set(
      db.collection('merchStorefronts').doc(store.id),
      merchStorefrontData(store, shouldPublish),
      { merge: true }
    );
  }
  await batch.commit();
  return store.id;
}

async function handleMerchCheckoutSession(session, eventId) {
  if (session?.mode !== 'subscription' || session?.status !== 'complete') return '';
  const storeId = cleanString(session.client_reference_id, 200);
  if (!storeId || storeId === 'admin-merch-preview') return '';
  const storeSnapshot = await db.collection('merchStores').doc(storeId).get();
  if (!storeSnapshot.exists) {
    console.warn('Stripe merch checkout has no matching store', eventId, storeId);
    return '';
  }

  const store = storeSnapshot.data() || {};
  const subscriptionId = cleanStripeId(session.subscription);
  const customerId = cleanStripeId(session.customer);
  const checkoutEmail = cleanString(session.customer_details?.email || session.customer_email, 200).toLowerCase();
  const storeEmail = cleanString(store.contactEmail, 200).toLowerCase();
  const emailMatches = !checkoutEmail || !storeEmail || checkoutEmail === storeEmail;
  const launchPartner = isLaunchPartner(store);
  const approved = merchStoreWasApproved(store);
  const batch = db.batch();
  batch.set(storeSnapshot.ref, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripeCheckoutSessionId: cleanStripeId(session.id),
    stripePaymentLinkId: cleanStripeId(session.payment_link),
    checkoutEmail,
    billingIdentityMatch: emailMatches,
    billingStatus: launchPartner ? (store.billingStatus || 'comped') : 'trialing',
    billingVerified: launchPartner || emailMatches,
    billingEnforcement: launchPartner ? 'exempt-launch-partner' : 'stripe',
    applicationStatus: approved ? 'approved' : (emailMatches ? 'payment_verified' : 'payment_review'),
    lastStripeEventId: cleanString(eventId, 200),
    checkoutCompletedAt: FieldValue.serverTimestamp(),
    billingUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  if (subscriptionId) {
    batch.set(db.collection('stripeMerchSubscriptions').doc(subscriptionId), {
      storeId,
      customerId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  await batch.commit();
  return storeId;
}

async function handleMerchSubscription(subscription, eventId, forcedStatus = '') {
  const subscriptionId = cleanStripeId(subscription?.id);
  const storeSnapshot = await findMerchStoreBySubscription(subscriptionId);
  if (!storeSnapshot) {
    console.warn('Stripe subscription event has no matching merch store', eventId, subscriptionId);
    return '';
  }
  return applyMerchBillingStatus(storeSnapshot, forcedStatus || subscription.status, eventId, {
    stripeCustomerId: cleanStripeId(subscription.customer),
    stripeSubscriptionId: subscriptionId,
    stripeCurrentPeriodEnd: Number(subscription.current_period_end || 0),
    stripeCancelAtPeriodEnd: subscription.cancel_at_period_end === true
  });
}

async function handleMerchInvoice(invoice, eventId, billingStatus) {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  const storeSnapshot = await findMerchStoreBySubscription(subscriptionId);
  if (!storeSnapshot) {
    console.warn('Stripe invoice event has no matching merch store', eventId, subscriptionId);
    return '';
  }
  return applyMerchBillingStatus(storeSnapshot, billingStatus, eventId, {
    stripeSubscriptionId: subscriptionId,
    stripeInvoiceId: cleanStripeId(invoice.id),
    lastInvoiceAmountPaid: Number(invoice.amount_paid || 0),
    lastInvoiceAt: FieldValue.serverTimestamp()
  });
}

async function handleStripeMerchEvent(event) {
  const object = event?.data?.object || {};
  if (event.type === 'checkout.session.completed') return handleMerchCheckoutSession(object, event.id);
  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    return handleMerchSubscription(object, event.id);
  }
  if (event.type === 'customer.subscription.deleted') {
    return handleMerchSubscription(object, event.id, 'canceled');
  }
  if (event.type === 'invoice.paid') return handleMerchInvoice(object, event.id, 'active');
  if (event.type === 'invoice.payment_failed') return handleMerchInvoice(object, event.id, 'past_due');
  return '';
}

exports.stripeMerchWebhook = onRequest(
  { region: REGION, secrets: [STRIPE_WEBHOOK_SECRET], cors: false },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).send('Method not allowed');
      return;
    }
    const rawBody = Buffer.isBuffer(request.rawBody)
      ? request.rawBody
      : Buffer.from(request.rawBody || '');
    const signature = request.get('stripe-signature');
    if (!verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET.value())) {
      response.status(400).send('Invalid Stripe signature');
      return;
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch (_) {
      response.status(400).send('Invalid JSON');
      return;
    }

    try {
      const storeId = await handleStripeMerchEvent(event);
      console.log('Stripe merch webhook processed', event.id, event.type, storeId || 'no-store-change');
      response.status(200).json({ received: true });
    } catch (error) {
      console.error('Stripe merch webhook failed', event?.id, event?.type, error);
      response.status(500).send('Webhook processing failed');
    }
  }
);

exports.saveMerchStoreRequest = onCall(
  { region: REGION },
  async request => {
    const uid = requireAuth(request);
    const profileId = cleanString(request.data?.profileId, 200);
    const contactEmail = cleanString(request.data?.contactEmail, 200).toLowerCase();
    const websiteUrl = cleanString(request.data?.websiteUrl, 1000);
    const storeDescription = cleanString(request.data?.storeDescription, 500);
    const sellerAgreementAccepted = request.data?.sellerAgreementAccepted === true;

    if (!profileId || profileId.includes('/')) throw new HttpsError('invalid-argument', 'Invalid artist profile.');
    if (!isValidEmail(contactEmail)) throw new HttpsError('invalid-argument', 'Add a valid store contact email.');
    if (!isValidWebUrl(websiteUrl)) throw new HttpsError('invalid-argument', 'Add a valid artist website or social page.');
    if (!sellerAgreementAccepted) throw new HttpsError('failed-precondition', 'Accept the seller agreement to continue.');

    const profileSnapshot = await db.collection('profiles').doc(profileId).get();
    if (!profileSnapshot.exists) throw new HttpsError('not-found', 'Artist profile not found.');
    const profile = profileSnapshot.data() || {};
    const profileType = cleanString(profile.accountType, 40).toLowerCase();
    if (!MERCH_PROFILE_TYPES.has(profileType)) {
      throw new HttpsError('failed-precondition', 'A band or musician profile is required.');
    }

    const profileOwnerId = cleanString(profile.ownerId || profile.userId || profile.uid || profileSnapshot.id, 200);
    const requesterEmail = cleanString(request.auth.token?.email, 200).toLowerCase();
    const isAdmin = MERCH_ADMIN_EMAILS.has(requesterEmail);
    if (profileOwnerId !== uid && !isAdmin) {
      throw new HttpsError('permission-denied', 'This account does not own that artist profile.');
    }

    const storeRef = db.collection('merchStores').doc(profileId);
    const storeSnapshot = await storeRef.get();
    const existing = storeSnapshot.data() || {};
    if (storeSnapshot.exists && cleanString(existing.ownerId, 200) !== uid && !isAdmin) {
      throw new HttpsError('permission-denied', 'This account does not own that merchandise store.');
    }

    const existingStatus = cleanString(existing.subscriptionStatus, 40);
    const subscriptionStatus = existingStatus && existingStatus !== 'canceled' ? existingStatus : 'pending';
    const active = MERCH_ACTIVE_STATUSES.has(subscriptionStatus);
    const ownerId = cleanString(existing.ownerId, 200) || profileOwnerId || uid;
    const bandName = cleanString(profile.displayName, 120) || 'BANDtroductions Artist';
    const coverImageUrl = cleanString(profile.imageUrl || profile.bannerImageUrl, 2000);
    const batch = db.batch();
    batch.set(storeRef, {
      ownerId,
      profileId,
      profileType,
      bandName,
      coverImageUrl,
      contactEmail,
      websiteUrl,
      storeDescription,
      sellerAgreementAccepted: true,
      sellerAgreementAcceptedAt: existing.sellerAgreementAcceptedAt || FieldValue.serverTimestamp(),
      subscriptionStatus,
      subscriptionPrice: 15,
      introPrice: 0,
      introMonths: 2,
      renewalPrice: 15,
      offerCode: 'two-months-free-then-15-monthly',
      applicationStatus: active ? 'approved' : 'pending',
      published: active,
      updatedAt: FieldValue.serverTimestamp(),
      ...(storeSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() })
    }, { merge: true });

    if (active) {
      batch.set(db.collection('merchStorefronts').doc(profileId), {
        profileId,
        profileType,
        bandName,
        coverImageUrl,
        websiteUrl,
        storeDescription,
        published: true,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }

    await batch.commit();
    return { ok: true, storeId: profileId, subscriptionStatus };
  }
);

exports.saveBusinessStoreRequest = onCall(
  { region: REGION },
  async request => {
    const uid = requireAuth(request);
    const requesterEmail = cleanString(request.auth.token?.email, 200).toLowerCase();
    const isAdmin = MERCH_ADMIN_EMAILS.has(requesterEmail);
    const requestedStoreId = cleanString(request.data?.storeId, 200);
    const storeId = isAdmin && requestedStoreId ? requestedStoreId : uid;
    const businessName = cleanString(request.data?.businessName, 120);
    const category = cleanString(request.data?.category, 100);
    const contactEmail = cleanString(request.data?.contactEmail, 200).toLowerCase();
    const location = cleanString(request.data?.location, 140);
    const websiteUrl = cleanString(request.data?.websiteUrl, 1000);
    const tagline = cleanString(request.data?.tagline, 160);
    const businessDescription = cleanString(request.data?.businessDescription, 700);
    const memberOffer = cleanString(request.data?.memberOffer, 300);
    const logoImageUrl = cleanString(request.data?.logoImageUrl, 2000);
    const sellerAgreementAccepted = request.data?.sellerAgreementAccepted === true;

    if (!storeId || storeId.includes('/')) throw new HttpsError('invalid-argument', 'Invalid business storefront.');
    if (!businessName) throw new HttpsError('invalid-argument', 'Add your business name.');
    if (!category) throw new HttpsError('invalid-argument', 'Choose a business category.');
    if (!isValidEmail(contactEmail)) throw new HttpsError('invalid-argument', 'Add a valid business contact email.');
    if (!location) throw new HttpsError('invalid-argument', 'Add your city, state or service region.');
    if (!isValidWebUrl(websiteUrl) || !websiteUrl) throw new HttpsError('invalid-argument', 'Add a valid business website or social page.');
    if (!businessDescription) throw new HttpsError('invalid-argument', 'Add a business description.');
    if (!isValidWebUrl(logoImageUrl) || !logoImageUrl) throw new HttpsError('invalid-argument', 'Add a business logo or storefront image.');
    if (!sellerAgreementAccepted) throw new HttpsError('failed-precondition', 'Accept the seller agreement to continue.');

    const storeRef = db.collection('businessStores').doc(storeId);
    const storeSnapshot = await storeRef.get();
    const existing = storeSnapshot.data() || {};
    if (storeSnapshot.exists && cleanString(existing.ownerId, 200) !== uid && !isAdmin) {
      throw new HttpsError('permission-denied', 'This account does not own that business storefront.');
    }

    const existingStatus = cleanString(existing.subscriptionStatus, 40);
    const subscriptionStatus = existingStatus && existingStatus !== 'canceled' ? existingStatus : 'pending';
    const active = BUSINESS_ACTIVE_STATUSES.has(subscriptionStatus);
    const ownerId = cleanString(existing.ownerId, 200) || uid;
    const storefront = {
      ownerId,
      businessName,
      category,
      contactEmail,
      location,
      websiteUrl,
      tagline,
      businessDescription,
      memberOffer,
      logoImageUrl,
      featured: existing.featured === true,
      subscriptionStatus,
      subscriptionPrice: 35,
      billingPlan: cleanString(existing.billingPlan, 80) || 'monthly',
      applicationStatus: active ? 'approved' : 'pending',
      sellerAgreementAccepted: true,
      sellerAgreementAcceptedAt: existing.sellerAgreementAcceptedAt || FieldValue.serverTimestamp(),
      published: active,
      updatedAt: FieldValue.serverTimestamp(),
      ...(storeSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() })
    };

    const batch = db.batch();
    batch.set(storeRef, storefront, { merge: true });
    if (active) {
      batch.set(db.collection('merchStorefronts').doc(storeId), {
        storeKind: 'business',
        businessName,
        category,
        contactEmail,
        location,
        websiteUrl,
        tagline,
        businessDescription,
        memberOffer,
        logoImageUrl,
        featured: existing.featured === true,
        published: true,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();
    return { ok: true, storeId, subscriptionStatus };
  }
);

exports.getBusinessStore = onCall(
  { region: REGION },
  async request => {
    const uid = requireAuth(request);
    const requesterEmail = cleanString(request.auth.token?.email, 200).toLowerCase();
    const isAdmin = MERCH_ADMIN_EMAILS.has(requesterEmail);
    const requestedStoreId = cleanString(request.data?.storeId, 200);
    const storeId = isAdmin && requestedStoreId ? requestedStoreId : uid;
    if (!storeId || storeId.includes('/')) throw new HttpsError('invalid-argument', 'Invalid business storefront.');
    const snapshot = await db.collection('businessStores').doc(storeId).get();
    if (!snapshot.exists) return { store: null };
    const store = snapshot.data() || {};
    if (cleanString(store.ownerId, 200) !== uid && !isAdmin) {
      throw new HttpsError('permission-denied', 'This account does not own that business storefront.');
    }
    return {
      store: {
        id: snapshot.id,
        ownerId: cleanString(store.ownerId, 200),
        businessName: cleanString(store.businessName, 120),
        category: cleanString(store.category, 100),
        contactEmail: cleanString(store.contactEmail, 200),
        location: cleanString(store.location, 140),
        websiteUrl: cleanString(store.websiteUrl, 1000),
        tagline: cleanString(store.tagline, 160),
        businessDescription: cleanString(store.businessDescription, 700),
        memberOffer: cleanString(store.memberOffer, 300),
        logoImageUrl: cleanString(store.logoImageUrl, 2000),
        featured: store.featured === true,
        subscriptionStatus: cleanString(store.subscriptionStatus, 40) || 'pending',
        billingPlan: cleanString(store.billingPlan, 80) || 'monthly',
        sellerAgreementAccepted: store.sellerAgreementAccepted === true,
        published: store.published === true
      }
    };
  }
);

exports.getPushConfig = onCall(
  { region: REGION, secrets: [VAPID_PUBLIC_KEY] },
  request => {
    requireAuth(request);
    return { publicKey: VAPID_PUBLIC_KEY.value() };
  }
);

exports.registerPushSubscription = onCall(
  { region: REGION },
  async request => {
    const uid = requireAuth(request);
    const subscription = request.data?.subscription || {};
    const endpoint = cleanString(subscription.endpoint, 5000);
    const p256dh = cleanString(subscription.keys?.p256dh, 2000);
    const auth = cleanString(subscription.keys?.auth, 2000);
    if (!endpoint || !p256dh || !auth) throw new HttpsError('invalid-argument', 'Invalid push subscription.');

    const id = subscriptionDocId(endpoint);
    await db.collection('pushSubscriptions').doc(uid).collection('devices').doc(id).set({
      subscription: { endpoint, expirationTime: subscription.expirationTime || null, keys: { p256dh, auth } },
      userAgent: cleanString(request.data?.userAgent, 1000),
      standalone: Boolean(request.data?.standalone),
      enabled: true,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return { ok: true, deviceId: id };
  }
);

exports.removePushSubscription = onCall(
  { region: REGION },
  async request => {
    const uid = requireAuth(request);
    const endpoint = cleanString(request.data?.endpoint, 5000);
    if (!endpoint) throw new HttpsError('invalid-argument', 'Missing push endpoint.');
    await db.collection('pushSubscriptions').doc(uid).collection('devices').doc(subscriptionDocId(endpoint)).delete();
    return { ok: true };
  }
);

exports.sendPrivateMessagePush = onDocumentCreated(
  {
    document: 'conversations/{conversationId}/messages/{messageId}',
    region: REGION,
    secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY]
  },
  async event => {
    const message = event.data?.data() || {};
    const senderId = cleanString(message.senderId, 200);
    if (!senderId) return;

    const conversationId = event.params.conversationId;
    const conversationSnap = await db.collection('conversations').doc(conversationId).get();
    if (!conversationSnap.exists) return;
    const conversation = conversationSnap.data() || {};
    const participants = Array.isArray(conversation.participants) ? conversation.participants.filter(Boolean) : [];
    const senderName = cleanString(conversation.participantNames?.[senderId], 120) || 'BANDtroductions Member';
    const senderProfile = cleanString(conversation.participantProfiles?.[senderId], 200) || senderId;
    const recipients = participants.filter(uid => uid && uid !== senderId);

    await Promise.all(recipients.map(uid => sendToUser(uid, {
      title: `New message from ${senderName}`,
      body: 'You have a new private message on BANDtroductions.',
      url: `/messages.html?to=${encodeURIComponent(senderProfile)}`,
      tag: `message-${conversationId}`,
      renotify: true,
      badgeCount: 1
    })));
  }
);

exports.sendActivityPush = onDocumentCreated(
  {
    document: 'notifications/{notificationId}',
    region: REGION,
    secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY]
  },
  async event => {
    const notification = event.data?.data() || {};
    const recipientId = cleanString(notification.recipientId, 200);
    if (!recipientId) return;
    const uid = await resolveRecipientUserId(recipientId);
    if (!uid) return;

    await sendToUser(uid, {
      title: cleanString(notification.actorName, 120) || 'BANDtroductions',
      body: cleanString(notification.message, 240) || 'You have new activity on BANDtroductions.',
      url: cleanString(notification.linkUrl, 1000) || '/notifications.html',
      tag: `activity-${event.params.notificationId}`,
      renotify: true
    });
  }
);
