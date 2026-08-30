import { db } from './firebase-dev.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const accountLabel = value => ({
  band: 'band',
  musician: 'musician',
  venue: 'venue',
  fan: 'fan'
})[String(value || '').trim().toLowerCase()] || 'member';

const safeId = value => String(value || '')
  .trim()
  .replace(/[^a-z0-9_-]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 180);

export async function createAdminAccountNotification({
  userId,
  profileId,
  displayName,
  accountType,
  location = ''
} = {}) {
  const subjectId = safeId(profileId || userId);
  if (!subjectId) return false;

  const adminProfiles = await getDocs(
    query(collection(db, 'profiles'), where('isAdmin', '==', true))
  );
  const recipientIds = [...new Set(adminProfiles.docs
    .map(snapshot => String(snapshot.data()?.ownerId || snapshot.id || '').trim())
    .filter(Boolean))];

  if (!recipientIds.length) {
    console.warn('No administrator profile was available for the new-account notification.');
    return false;
  }

  const actorName = String(displayName || '').trim() || 'New BANDtroductions Member';
  const place = String(location || '').trim();
  const message = `New ${accountLabel(accountType)} account created${place ? ` • ${place}` : ''}.`;

  await Promise.all(recipientIds.map(async recipientId => {
    const notificationId = `new-account_${safeId(recipientId)}_${subjectId}`;
    const notificationRef = doc(db, 'notifications', notificationId);
    const existing = await getDoc(notificationRef);
    if (existing.exists()) return;

    await setDoc(notificationRef, {
      recipientId,
      actorId: userId || profileId || '',
      actorName,
      type: 'new_account',
      message,
      linkUrl: 'admin.html',
      relatedProfileId: profileId || userId || '',
      read: false,
      createdAt: serverTimestamp()
    });
  }));

  return true;
}
