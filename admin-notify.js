import { db } from './firebase-dev.js';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { deliverAdminNotices } from './admin-notify-core.mjs';

export {
  signupNoticeMessage,
  songNoticeMessage,
  btvNoticeMessage,
  collageNoticeMessage,
  describeAdminNoticeFailure
} from './admin-notify-core.mjs';

async function listAdmins() {
  const snap = await getDocs(query(collection(db, 'profiles'), where('isAdmin', '==', true)));
  return snap.docs.map(item => ({ id: item.id, ...(item.data() || {}) }));
}

async function writeNotice(id, data) {
  const ref = doc(db, 'notifications', id);
  const existing = await getDoc(ref);
  if (existing.exists()) return { created: false };
  await setDoc(ref, {
    ...data,
    read: false,
    createdAt: serverTimestamp()
  });
  return { created: true };
}

export async function notifySiteAdmins(input) {
  const timeout = new Promise(resolve => setTimeout(() => resolve({
    ok: false,
    code: 'timeout',
    message: 'The in-site admin notice did not finish in time.',
    recipients: [],
    written: [],
    failed: [],
    created: 0
  }), 8000));
  try {
    return await Promise.race([
      deliverAdminNotices({ listAdmins, writeNotice }, input),
      timeout
    ]);
  } catch (error) {
    const code = error?.code === 'permission-denied' ? 'permission-denied' : (error?.code || 'unknown');
    return {
      ok: false,
      code,
      message: code === 'permission-denied'
        ? 'The in-site admin notice was blocked by database permissions.'
        : 'The in-site admin notice could not be saved.',
      recipients: [],
      written: [],
      failed: [],
      created: 0
    };
  }
}
