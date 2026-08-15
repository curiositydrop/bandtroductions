const crypto = require('crypto');
const webpush = require('web-push');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');

initializeApp();
const db = getFirestore();
const VAPID_PUBLIC_KEY = defineSecret('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
const REGION = 'us-central1';

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
