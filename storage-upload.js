import { storage } from './firebase-dev.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function validateImageFile(file) {
  if (!file) return { ok: true };
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, message: 'Please choose a JPG, PNG, WebP, or GIF image.' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: 'Please choose an image smaller than 8 MB.' };
  }
  return { ok: true };
}

function safeFilename(name) {
  const cleaned = (name || 'image').toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  return cleaned.replace(/^-+|-+$/g, '') || 'image';
}

export async function uploadUserImage({ userId, folder, file }) {
  const validation = validateImageFile(file);
  if (!validation.ok) throw new Error(validation.message);
  if (!userId || !file) throw new Error('A signed-in user and image are required.');

  const filename = `${Date.now()}-${safeFilename(file.name)}`;
  const objectRef = ref(storage, `users/${userId}/${folder}/${filename}`);
  await uploadBytes(objectRef, file, {
    contentType: file.type,
    customMetadata: { ownerId: userId }
  });
  return getDownloadURL(objectRef);
}

export function storageUnavailableMessage(error) {
  const code = error?.code || '';
  if (code.includes('storage/unknown') || code.includes('storage/bucket-not-found') || code.includes('storage/unauthorized')) {
    return 'Image uploads are prepared but Firebase Storage is not active yet.';
  }
  return error?.message || 'The image could not be uploaded.';
}
