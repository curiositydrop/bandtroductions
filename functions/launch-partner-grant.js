'use strict';

const crypto = require('crypto');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

const db = getFirestore();
const REGION = 'us-central1';
const ADMIN_EMAILS = new Set(['mbergeron79@gmail.com', 'mbegeron79@gmail.com']);
const LAUNCH_PARTNER_NAMES = ['Angel Down', 'Ascent To Power'];

function cleanString(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizedName(value) {
  return cleanString(value, 200).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function looksLikePartnerName(value, target) {
  const candidate = normalizedName(value);
  const wanted = normalizedName(target);
  if (!candidate || !wanted) return false;
  return candidate === wanted || candidate.includes(wanted) || wanted.includes(candidate);
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

function defaultWebsiteSettings(profile = {}) {
  return {
    revision: crypto.randomUUID(),
    theme: { background: '#0b100f', text: '#eef4ee', accent: '#c3ec77' },
    tagline: '', heroBrightness: 1.16, heroPosition: { x: 50, y: 25 },
    heroButtons: [{ label: 'Meet the band', url: '#/about' }, { label: 'Get in touch', url: '#/contact' }],
    sections: { about:true, meetBand:true, music:true, photos:true, shows:true, merch:true, booking:true, contact:true },
    booking: { enabled:true, email:cleanString(profile.bookingEmail || profile.email, 200), rateCents:0, rateBasis:'show', paymentPolicy:'in_person', depositPercent:0, depositPaymentUrl:'', fullPaymentUrl:'' },
    buttons: [], photos: [], videos: [], bandMembers: []
  };
}

async function profileFromId(profileId) {
  const id = cleanString(profileId, 200);
  if (!id) return null;
  const profile = await db.collection('profiles').doc(id).get();
  return profile.exists ? profile : null;
}

async function findProfileByName(name) {
  const direct = await db.collection('profiles').where('displayName', '==', name).limit(2).get();
  if (direct.size > 1) throw new HttpsError('failed-precondition', `More than one profile is named ${name}.`);
  if (!direct.empty) return direct.docs[0];

  for (const collectionName of ['merchStores', 'merchStorefronts']) {
    const exact = await db.collection(collectionName).where('bandName', '==', name).limit(2).get();
    if (exact.size > 1) throw new HttpsError('failed-precondition', `More than one ${collectionName} record is named ${name}.`);
    if (!exact.empty) {
      const record = exact.docs[0];
      const profile = await profileFromId(record.data()?.profileId || record.id);
      if (profile) return profile;
    }
  }

  const candidateIds = new Set();
  const profiles = await db.collection('profiles').get();
  for (const doc of profiles.docs) {
    const data = doc.data() || {};
    if (looksLikePartnerName(data.displayName, name)) candidateIds.add(doc.id);
  }
  for (const collectionName of ['merchStores', 'merchStorefronts']) {
    const snapshot = await db.collection(collectionName).get();
    for (const doc of snapshot.docs) {
      const data = doc.data() || {};
      if (!looksLikePartnerName(data.bandName, name)) continue;
      const profileId = cleanString(data.profileId || doc.id, 200);
      if (profileId) candidateIds.add(profileId);
    }
  }

  const resolved = [];
  for (const profileId of candidateIds) {
    const profile = await profileFromId(profileId);
    if (profile) resolved.push(profile);
  }
  const unique = new Map(resolved.map(profile => [profile.id, profile]));
  if (unique.size === 1) return [...unique.values()][0];
  if (unique.size > 1) throw new HttpsError('failed-precondition', `More than one possible profile matched ${name}; no access was changed.`);
  return null;
}

async function grantPartner(profileSnapshot) {
  const profile = profileSnapshot.data() || {};
  const profileId = profileSnapshot.id;
  const type = cleanString(profile.accountType, 40).toLowerCase();
  if (!['band', 'musician'].includes(type)) throw new HttpsError('failed-precondition', `${profile.displayName || profileId} is not a band or musician profile.`);

  const storeRef = db.collection('merchStores').doc(profileId);
  const storeSnapshot = await storeRef.get();
  const existingStore = storeSnapshot.data() || {};
  const ownerId = cleanString(existingStore.ownerId || profile.ownerId || profile.userId || profile.uid || profileId, 200);
  const bandName = cleanString(profile.displayName, 120) || 'BANDtroductions Artist';
  const coverImageUrl = cleanString(existingStore.coverImageUrl || profile.imageUrl || profile.bannerImageUrl || profile.coverImageUrl, 2000);
  const websiteUrl = `https://bandtroductions.com/website.html?id=${encodeURIComponent(profileId)}`;
  const storeDescription = cleanString(existingStore.storeDescription || profile.bio || `Official merchandise from ${bandName}.`, 500);
  const contactEmail = cleanString(existingStore.contactEmail || profile.bookingEmail || profile.email, 200).toLowerCase();
  const batch = db.batch();

  batch.set(storeRef, {
    ownerId, profileId, profileType:type, bandName, coverImageUrl, contactEmail, websiteUrl, storeDescription,
    subscriptionStatus:'comped', billingStatus:'comped', billingVerified:true,
    billingEnforcement:'exempt-launch-partner', billingPlan:'launch-partner', launchPartner:true,
    planKey:'website-merch', planLabel:'Website + Merch', subscriptionPrice:15, renewalPrice:15,
    applicationStatus:'approved', adminApproved:true, adminPaused:false, published:true,
    launchPartnerGrantedAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp(),
    ...(storeSnapshot.exists ? {} : { createdAt:FieldValue.serverTimestamp() })
  }, { merge:true });

  batch.set(db.collection('merchStorefronts').doc(profileId), {
    profileId, profileType:type, bandName, coverImageUrl, websiteUrl, storeDescription,
    published:true, updatedAt:FieldValue.serverTimestamp()
  }, { merge:true });

  const profileUpdate = {
    websiteEnabled:true, websitePlanStatus:'comped', launchPartner:true, billingPlan:'launch-partner',
    artistPlan:{ key:'website-merch', label:'Website + Merch', status:'comped', monthlyPrice:15, updatedAt:FieldValue.serverTimestamp() },
    websitePlanUpdatedAt:FieldValue.serverTimestamp(), launchPartnerGrantedAt:FieldValue.serverTimestamp()
  };
  if (!profile.websiteSettings?.revision) profileUpdate.websiteSettings = defaultWebsiteSettings(profile);
  if (!profile.websiteActivatedAt) profileUpdate.websiteActivatedAt = FieldValue.serverTimestamp();
  batch.set(profileSnapshot.ref, profileUpdate, { merge:true });
  await batch.commit();
  return { profileId, displayName:bandName };
}

const grantLaunchPartnerAccess = onCall({ region:REGION }, async request => {
  await requireAdmin(request);
  const activated = [], missing = [];
  for (const name of LAUNCH_PARTNER_NAMES) {
    const snap = await findProfileByName(name);
    if (!snap) { missing.push(name); continue; }
    activated.push(await grantPartner(snap));
  }
  return { ok:missing.length === 0, activated, missing };
});

module.exports = { grantLaunchPartnerAccess };
