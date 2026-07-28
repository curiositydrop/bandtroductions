import { auth, db, storage } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { doc, getDoc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getDownloadURL, ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';

const form = document.getElementById('profile-form');
const mediaLinkInput = document.getElementById('media-link');
const mediaLinkLabel = mediaLinkInput?.closest('label');
if (!form || !mediaLinkLabel) throw new Error('Profile media editor could not find the profile form.');

// Rename the main media field. This is always the single featured video.
for (const node of mediaLinkLabel.childNodes) {
  if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
    node.textContent = 'Featured video';
    break;
  }
}
mediaLinkInput.placeholder = 'YouTube or Vimeo link';
const featuredNote = document.createElement('small');
featuredNote.textContent = 'This video appears first on your public profile. Use a YouTube or Vimeo link.';
mediaLinkLabel.appendChild(featuredNote);

const style = document.createElement('style');
style.textContent = `
  .media-editor{margin-top:8px;padding:16px;border:1px solid #333;border-radius:14px;background:#0c0c0c;min-width:0;box-sizing:border-box}
  .media-editor-head{margin-bottom:12px}.media-editor-head h2{margin:0;font-size:1.18rem}.media-editor-head small{display:block;margin-top:5px;color:#aaa}
  .media-editor-list{display:grid;gap:12px;min-width:0}
  .media-editor-row{padding:12px;border:1px solid #333;border-radius:12px;background:#151515;display:grid;gap:10px;min-width:0;box-sizing:border-box}
  .media-editor-grid{display:grid;grid-template-columns:150px minmax(0,1fr);gap:10px;min-width:0}
  .media-editor-row input,.media-editor-row select{width:100%;max-width:100%;box-sizing:border-box}
  .media-image-upload{display:grid;gap:8px;min-width:0}.media-image-upload input[type=file]{max-width:100%}
  .media-image-preview{width:100%;max-height:240px;object-fit:cover;border-radius:10px;border:1px solid #333;background:#080808}
  .media-row-actions{display:flex;justify-content:flex-end}.media-save-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px}
  .media-add-row{display:flex;justify-content:center;margin-top:14px}.media-add-row .auth-button{width:100%}
  @media(max-width:620px){.media-editor-grid{grid-template-columns:1fr}.media-editor{padding:12px}.media-editor-row{padding:10px}}
`;
document.head.appendChild(style);

const editor = document.createElement('section');
editor.className = 'media-editor';
editor.innerHTML = `
  <div class="media-editor-head">
    <h2>Additional Profile Media</h2>
    <small>These images and videos appear after the featured video on your profile.</small>
  </div>
  <div id="profile-media-editor-list" class="media-editor-list"></div>
  <div class="media-add-row"><button id="add-profile-media" class="auth-button auth-button-secondary" type="button">Add More Media</button></div>
  <div class="media-save-row">
    <button id="save-profile-media" class="auth-button" type="button">Save Media</button>
    <span id="profile-media-editor-status" class="auth-message"></span>
  </div>
`;
mediaLinkLabel.insertAdjacentElement('afterend', editor);

const list = editor.querySelector('#profile-media-editor-list');
const addButton = editor.querySelector('#add-profile-media');
const saveButton = editor.querySelector('#save-profile-media');
const status = editor.querySelector('#profile-media-editor-status');
let currentUser = null;

function isEmbeddableVideo(url = '') {
  return /(?:youtube\.com|youtu\.be|vimeo\.com)/i.test(url.trim());
}

function fallbackItems(profile = {}) {
  if (Array.isArray(profile.mediaItems) && profile.mediaItems.length) return profile.mediaItems;
  if (Array.isArray(profile.additionalMedia) && profile.additionalMedia.length) {
    return profile.additionalMedia.map(item => ({
      type: 'video',
      url: typeof item === 'string' ? item : item.url,
      caption: typeof item === 'string' ? '' : (item.title || item.caption || '')
    }));
  }
  if (profile.legacyPage === 'burning-time.html') {
    return [
      { type: 'video', url: 'https://www.youtube.com/watch?v=o_a3zRmXjf0', caption: 'Burning Time — More Video' },
      { type: 'video', url: 'https://www.youtube.com/watch?v=mAAIqAtM9lU', caption: 'Burning Time — More Video' },
      { type: 'video', url: 'https://www.youtube.com/watch?v=Es5BP4jGlcc', caption: 'Burning Time — More Video' },
      { type: 'video', url: 'https://www.youtube.com/watch?v=hg3FNy3xgGo', caption: 'Burning Time — More Video' }
    ];
  }
  return [];
}

function addRow(item = { type: 'video', url: '', caption: '' }) {
  const row = document.createElement('div');
  row.className = 'media-editor-row';
  row.innerHTML = `
    <div class="media-editor-grid">
      <label>Type of media
        <select class="media-type"><option value="video">Video</option><option value="image">Image</option></select>
      </label>
      <label>Caption
        <input class="media-caption" type="text" maxlength="160" placeholder="Optional title or caption">
      </label>
    </div>
    <label class="media-video-field">YouTube or Vimeo link
      <input class="media-url" type="url" inputmode="url" placeholder="https://youtube.com/watch?v=... or https://vimeo.com/...">
      <small>Only embeddable YouTube or Vimeo links are accepted.</small>
    </label>
    <div class="media-image-field media-image-upload" hidden>
      <label>Upload image<input class="media-file" type="file" accept="image/*"></label>
      <input class="media-existing-url" type="hidden">
      <img class="media-image-preview" alt="Media image preview" hidden>
    </div>
    <div class="media-row-actions"><button class="auth-button auth-button-secondary remove-media" type="button">Remove</button></div>
  `;
  const type = row.querySelector('.media-type');
  const caption = row.querySelector('.media-caption');
  const url = row.querySelector('.media-url');
  const existingUrl = row.querySelector('.media-existing-url');
  const videoField = row.querySelector('.media-video-field');
  const imageField = row.querySelector('.media-image-field');
  const file = row.querySelector('.media-file');
  const preview = row.querySelector('.media-image-preview');

  type.value = item.type === 'image' ? 'image' : 'video';
  caption.value = item.caption || item.title || '';
  if (type.value === 'video') url.value = item.url || '';
  if (type.value === 'image') {
    existingUrl.value = item.url || '';
    if (item.url) { preview.src = item.url; preview.hidden = false; }
  }

  function syncType() {
    const image = type.value === 'image';
    imageField.hidden = !image;
    videoField.hidden = image;
  }
  type.addEventListener('change', syncType);
  file.addEventListener('change', () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    preview.src = URL.createObjectURL(chosen);
    preview.hidden = false;
  });
  row.querySelector('.remove-media').addEventListener('click', () => row.remove());
  syncType();
  list.appendChild(row);
  return row;
}

async function uploadImage(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Selected media file must be an image.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Media images must be smaller than 12 MB.');
  const clean = file.name.replace(/[^a-z0-9._-]+/gi, '-');
  const storageRef = ref(storage, `profile-media/${currentUser.uid}/gallery-${Date.now()}-${clean}`);
  const snapshot = await uploadBytes(storageRef, file, { contentType: file.type, customMetadata: { ownerId: currentUser.uid, mediaType: 'image' } });
  return getDownloadURL(snapshot.ref);
}

addButton.addEventListener('click', () => {
  const row = addRow();
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.querySelector('.media-type').focus();
});

saveButton.addEventListener('click', async () => {
  if (!currentUser) return;
  const featuredUrl = mediaLinkInput.value.trim();
  if (featuredUrl && !isEmbeddableVideo(featuredUrl)) {
    status.textContent = 'Featured video must be a YouTube or Vimeo link.';
    return;
  }
  saveButton.disabled = true;
  status.textContent = 'Saving media…';
  try {
    const items = [];
    for (const row of list.querySelectorAll('.media-editor-row')) {
      const type = row.querySelector('.media-type').value;
      const caption = row.querySelector('.media-caption').value.trim();
      if (type === 'video') {
        const url = row.querySelector('.media-url').value.trim();
        if (!url) continue;
        if (!isEmbeddableVideo(url)) throw new Error('Video links must be from YouTube or Vimeo.');
        items.push({ type: 'video', url, caption });
      } else {
        const file = row.querySelector('.media-file').files?.[0];
        let url = row.querySelector('.media-existing-url').value;
        if (file) { status.textContent = 'Uploading media image…'; url = await uploadImage(file); }
        if (url) items.push({ type: 'image', url, caption });
      }
    }
    const additionalMedia = items
      .filter(item => item.type === 'video')
      .map(item => ({ url: item.url, title: item.caption || 'More Video' }));
    await setDoc(doc(db, 'profiles', currentUser.uid), {
      mediaLink: featuredUrl,
      mediaItems: items,
      additionalMedia,
      updatedAt: serverTimestamp()
    }, { merge: true });
    status.textContent = 'Media saved.';
  } catch (error) {
    console.error(error);
    status.textContent = error.message || 'Media could not be saved.';
  } finally {
    saveButton.disabled = false;
  }
});

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (!user) return;
  try {
    const snapshot = await getDoc(doc(db, 'profiles', user.uid));
    const profile = snapshot.exists() ? snapshot.data() : {};
    const items = fallbackItems(profile);
    list.replaceChildren();
    items.forEach(addRow);
  } catch (error) {
    console.error(error);
    status.textContent = 'Existing media could not be loaded.';
  }
});