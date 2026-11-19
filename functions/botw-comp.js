'use strict';

// Admin-only Band of the Week Website + Merch comp.
// Writes Firestore with the Admin SDK. Does not call Stripe and does not
// change launch-partner or Stripe subscription fields.
const crypto = require('crypto');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const {
  defaultCompExpiresOn,
  etDateString,
  grantBlockReason,
  validCompExpiresOn
} = require('./botw-comp-access');

const db = getFirestore();
const REGION = 'us-central1';
const ADMIN_EMAILS = new Set(['mbergeron79@gmail.com', 'mbegeron79@gmail.com']);
const ARTIST_TYPES = new Set(['band', 'musician']);
const PROFILE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function cleanString(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function requireAdmin(request) {
  const uid = cleanString(request.auth?.uid, 200);
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in as a BANDtroductions administrator.');

  let email = '';
  try {
    const authUser = await getAuth().getUser(uid);
    email = cleanString(authUser.email, 200).toLowerCase();
  } catch (_) {}
  if (ADMIN_EMAILS.has(email)) return uid;

  const [userSnap, profileSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('profiles').doc(uid).get()
  ]);
  const user = userSnap.data() || {};
  const profile = profileSnap.data() || {};
  const establishedAdmin = user.isAdmin === true && profile.isAdmin === true
    && cleanString(profile.displayName, 120) === 'BANDtroductions Admin';
  if (!establishedAdmin) throw new HttpsError('permission-denied', 'Administrator access is required.');
  return uid;
}

function blockMessage(reason, displayName) {
  const name = displayName || 'This profile';
  if (reason === 'launch-partner') {
    return `${name} has permanent launch-partner Website + Merch access. Nothing was changed.`;
  }
  if (reason === 'stripe') {
    return `${name} already has a Stripe Website + Merch subscription. Nothing was changed.`;
  }
  return '';
}

function storefrontPayload(profile, profileId, published, expiresOn) {
  const bandName = cleanString(profile.displayName, 120) || 'BANDtroductions Artist';
  return {
    profileId,
    profileType: cleanString(profile.accountType, 40).toLowerCase(),
    bandName,
    coverImageUrl: cleanString(profile.imageUrl || profile.bannerImageUrl || profile.coverImageUrl, 2000),
    websiteUrl: `https://bandtroductions.com/website.html?id=${encodeURIComponent(profileId)}`,
    storeDescription: cleanString(profile.bio || `Official merchandise from ${bandName}.`, 500),
    published,
    updatedAt: FieldValue.serverTimestamp(),
    ...(expiresOn
      ? { botwCompExpiresOn: expiresOn, botwCompRevoked: false }
      : { botwCompExpiresOn: FieldValue.delete(), botwCompRevoked: true })
  };
}

const setBotwWebsiteComp = onCall({ region: REGION }, async request => {
  const adminUid = await requireAdmin(request);
  const profileId = cleanString(request.data?.profileId, 200);
  const revoke = request.data?.revoke === true;
  if (!PROFILE_ID.test(profileId)) throw new HttpsError('invalid-argument', 'Invalid artist profile.');

  const profileSnap = await db.collection('profiles').doc(profileId).get();
  if (!profileSnap.exists) throw new HttpsError('not-found', 'Artist profile not found.');
  const profile = profileSnap.data() || {};
  const displayName = cleanString(profile.displayName, 120) || 'This profile';
  const accountType = cleanString(profile.accountType, 40).toLowerCase();
  if (!ARTIST_TYPES.has(accountType)) {
    throw new HttpsError('failed-precondition', 'Website + Merch comps are only for band and musician profiles.');
  }
  if (profile.published !== true) {
    throw new HttpsError('failed-precondition', 'Publish the free profile before granting a Band of the Week comp.');
  }

  const storeRef = db.collection('merchStores').doc(profileId);
  const storefrontRef = db.collection('merchStorefronts').doc(profileId);
  const compRef = db.collection('botwWebsiteComps').doc(profileId);
  const [storeSnap, compSnap] = await Promise.all([storeRef.get(), compRef.get()]);
  const store = storeSnap.data() || {};
  const blocked = grantBlockReason(profile, store);
  if (!revoke && blocked) throw new HttpsError('failed-precondition', blockMessage(blocked, displayName));

  const now = new Date();
  let expiresOn = cleanString(request.data?.expiresOn, 20);
  if (!revoke && !expiresOn) expiresOn = defaultCompExpiresOn(now);
  if (!revoke) {
    const dateError = validCompExpiresOn(expiresOn, now);
    if (dateError) throw new HttpsError('invalid-argument', dateError);
  }
  if (revoke && !compSnap.exists) {
    throw new HttpsError('failed-precondition', `${displayName} does not have a Band of the Week comp. Nothing was changed.`);
  }

  const batch = db.batch();
  if (revoke) {
    batch.set(compRef, {
      revokedAt: FieldValue.serverTimestamp(),
      revokedBy: adminUid
    }, { merge: true });
    if (!blocked) {
      batch.set(storefrontRef, storefrontPayload(profile, profileId, false, ''), { merge: true });
      if (storeSnap.exists) {
        batch.set(storeRef, {
          botwCompExpiresOn: FieldValue.delete(),
          botwCompRevoked: true,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } else {
      batch.set(storefrontRef, {
        botwCompExpiresOn: FieldValue.delete(),
        botwCompRevoked: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();
    return { ok: true, profileId, revoked: true, expiresOn: cleanString(compSnap.data()?.expiresOn, 20) };
  }

  batch.set(compRef, {
    profileId,
    expiresOn,
    reason: 'band-of-the-week',
    grantedAt: FieldValue.serverTimestamp(),
    grantedBy: adminUid,
    revokedAt: FieldValue.delete(),
    revokedBy: FieldValue.delete()
  }, { merge: true });

  if (!profile.websiteSettings?.revision) {
    batch.set(profileSnap.ref, {
      websiteSettings: { revision: crypto.randomUUID() }
    }, { merge: true });
  }

  const storeBase = storeSnap.exists ? {} : {
    ownerId: cleanString(profile.ownerId || profile.userId || profile.uid || profileId, 200),
    profileId,
    profileType: accountType,
    bandName: displayName,
    coverImageUrl: cleanString(profile.imageUrl || profile.bannerImageUrl || profile.coverImageUrl, 2000),
    contactEmail: cleanString(profile.bookingEmail || profile.email, 200).toLowerCase(),
    websiteUrl: `https://bandtroductions.com/website.html?id=${encodeURIComponent(profileId)}`,
    storeDescription: cleanString(profile.bio || `Official merchandise from ${displayName}.`, 500),
    subscriptionStatus: 'pending',
    subscriptionPrice: 15,
    renewalPrice: 15,
    planKey: 'website-merch',
    planLabel: 'Website + Merch',
    applicationStatus: 'pending',
    published: false,
    createdAt: FieldValue.serverTimestamp()
  };
  batch.set(storeRef, {
    ...storeBase,
    botwCompExpiresOn: expiresOn,
    botwCompRevoked: false,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  batch.set(storefrontRef, storefrontPayload(profile, profileId, true, expiresOn), { merge: true });
  await batch.commit();
  return {
    ok: true,
    profileId,
    expiresOn,
    revoked: false,
    through: etDateString(now) === expiresOn ? 'today' : expiresOn
  };
});

module.exports = { setBotwWebsiteComp };
