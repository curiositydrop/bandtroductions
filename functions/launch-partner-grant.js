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

async function requireAdmin(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in as a BANDtroductions administrator.');
  const authUser = await getAuth().getUser(request.auth.uid);
  const email = cleanString(authUser.email, 200).toLowerCase();
  if (!ADMIN_EMAILS.has(email)) throw new HttpsError('permission-denied', 'Administrator access is required.');
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

async function findProfileByName(name) {
  const matches = await db.collection('profiles').where('displayName', '==', name).limit(2).get();
  if (matches.empty) return null;
  if (matches.size > 1) throw new HttpsError('failed-precondition', `More than one profile is named ${name}. Use the admin tools to verify the correct profile before granting access.`);
  return matches.docs[0];
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
    ownerId,
    profileId,
    profileType: type,
    bandName,
    coverImageUrl,
    contactEmail,
    websiteUrl,
    storeDescription,
    subscriptionStatus: 'comped',
    billingStatus: 'comped',
    billingVerified: true,
    billingEnforcement: 'exempt-launch-partner',
    billingPlan: 'launch-partner',
    launchPartner: true,
    planKey: 'website-merch',
    planLabel: 'Website + Merch',
    subscriptionPrice: 15,
    renewalPrice: 15,
    applicationStatus: 'approved',
    adminApproved: true,
    adminPaused: false,
    published: true,
    launchPartnerGrantedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...(storeSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() })
  }, { merge: true });

  batch.set(db.collection('merchStorefronts').doc(profileId), {
    profileId,
    profileType: type,
    bandName,
    coverImageUrl,
    websiteUrl,
    storeDescription,
    published: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  const profileUpdate = {
    websiteEnabled: true,
    websitePlanStatus: 'comped',
    launchPartner: true,
    billingPlan: 'launch-partner',
    artistPlan: {
      key: 'website-merch',
      label: 'Website + Merch',
      status: 'comped',
      monthlyPrice: 15,
      updatedAt: FieldValue.serverTimestamp()
    },
    websitePlanUpdatedAt: FieldValue.serverTimestamp(),
    launchPartnerGrantedAt: FieldValue.serverTimestamp()
  };
  if (!profile.websiteSettings?.revision) profileUpdate.websiteSettings = defaultWebsiteSettings(profile);
  if (!profile.websiteActivatedAt) profileUpdate.websiteActivatedAt = FieldValue.serverTimestamp();
  batch.set(profileSnapshot.ref, profileUpdate, { merge: true });

  await batch.commit();
  return { profileId, displayName: bandName };
}

const grantLaunchPartnerAccess = onCall({ region: REGION }, async request => {
  await requireAdmin(request);
  const activated = [];
  const missing = [];
  for (const name of LAUNCH_PARTNER_NAMES) {
    const profileSnapshot = await findProfileByName(name);
    if (!profileSnapshot) { missing.push(name); continue; }
    activated.push(await grantPartner(profileSnapshot));
  }
  return { ok: missing.length === 0, activated, missing };
});

module.exports = { grantLaunchPartnerAccess };
