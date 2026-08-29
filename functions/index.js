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

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to manage notifications.');
  return request.auth.uid;
}

function cleanString(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
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
