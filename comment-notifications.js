import { auth, db } from './firebase-dev.js';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const pendingForms = new WeakSet();

function profileIdFromLink(link) {
  if (!link) return '';
  try {
    return new URL(link.href, window.location.href).searchParams.get('id') || '';
  } catch {
    return '';
  }
}

async function resolveRecipientId(profileId) {
  if (!profileId) return '';

  try {
    const profileSnap = await getDoc(doc(db, 'profiles', profileId));
    if (profileSnap.exists()) {
      const ownerId = profileSnap.data()?.ownerId;
      if (typeof ownerId === 'string' && ownerId.trim()) return ownerId.trim();
    }
  } catch (error) {
    console.error('Could not resolve comment notification recipient:', error);
  }

  return profileId;
}

function waitForCommentSave(input, originalComment, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (!input || input.value.trim() === '') {
        resolve(true);
        return;
      }

      if (input.value.trim() !== originalComment) {
        resolve(false);
        return;
      }

      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }

      window.setTimeout(check, 250);
    };

    window.setTimeout(check, 250);
  });
}

document.addEventListener('submit', async (event) => {
  const form = event.target.closest?.('.comment-form');
  if (!form || pendingForms.has(form)) return;

  const user = auth.currentUser;
  const article = form.closest('.community-post');
  const authorLink = article?.querySelector('.community-author');
  const profileId = profileIdFromLink(authorLink);
  const input = form.querySelector('textarea');
  const submittedComment = input?.value.trim() || '';

  if (!user || !profileId || !submittedComment) return;

  pendingForms.add(form);
  const actorName = document.getElementById('composer-name')?.textContent?.trim()
    || user.displayName
    || 'BANDtroductions Member';

  try {
    const recipientId = await resolveRecipientId(profileId);
    if (!recipientId || recipientId === user.uid) return;

    const saved = await waitForCommentSave(input, submittedComment);
    if (!saved) return;

    await addDoc(collection(db, 'notifications'), {
      recipientId,
      actorId: user.uid,
      actorName,
      type: 'comment',
      message: `${actorName} commented on your post.`,
      linkUrl: 'community.html',
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Could not create comment notification:', error);
  } finally {
    pendingForms.delete(form);
  }
}, true);
