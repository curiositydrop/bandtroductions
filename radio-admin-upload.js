import { auth, db, storage } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { ref, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';

// Matches the dedicated radio-admin path in Storage rules.
const canUpload = user => user?.email === 'mbergeron79@gmail.com';
const MAX_BYTES = 250 * 1024 * 1024;

function readDuration(file) {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    const finish = (error, duration) => {
      clearTimeout(timer);
      audio.onloadedmetadata = audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      if (error) reject(error); else resolve(duration);
    };
    const timer = setTimeout(() => finish(new Error('Reading the MP3 took too long. Please try again.')), 30000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      if (!Number.isFinite(duration) || duration <= 0) finish(new Error('This MP3 has no readable duration. Please choose another file.'));
      else finish(null, Math.round(duration * 10) / 10);
    };
    audio.onerror = () => finish(new Error('This file could not be read as audio. Please choose a playable MP3.'));
    audio.src = url;
  });
}

export function installAdminAudioUpload() {
  const library = document.getElementById('crr-track-library')?.parentElement;
  if (!library || document.getElementById('crr-upload-panel')) return;
  const panel = document.createElement('details');
  panel.id = 'crr-upload-panel';
  panel.style.cssText = 'margin-top:10px;border:1px solid #397a74;border-radius:10px;padding:10px;font-size:14px';
  panel.innerHTML = `<summary style="cursor:pointer;color:#0ccfbd;font-weight:900">Upload Song / Show</summary>
    <form style="display:grid;gap:10px;margin-top:12px">
      <p style="margin:0;color:#bbb">MP3 · Up to 250 MB. Adds directly to Approved Songs.</p>
      <fieldset style="border:0;padding:0;margin:0;display:grid;gap:10px;min-width:0">
        <label>Audio file<input name="audio" type="file" accept=".mp3,audio/mpeg" required></label>
        <label>Title<input name="title" maxlength="200" required placeholder="Plowzone Radio Show #366"></label>
        <label>Artist / Show name<input name="artist" maxlength="200" required placeholder="The Plowzone Radio Show"></label>
        <label>Type<select name="kind"><option value="song">Song</option><option value="show">Radio show</option></select></label>
      </fieldset>
      <progress max="100" value="0" hidden style="width:100%;accent-color:#0ccfbd" aria-label="Audio upload progress"></progress>
      <p role="status" aria-live="polite" style="margin:0;color:#bbb;overflow-wrap:anywhere"></p>
      <button type="submit" class="crr-btn primary" style="font-size:14px">Upload to Approved Songs</button>
    </form>`;
  library.insertBefore(panel, document.getElementById('crr-song-search'));
  const form = panel.querySelector('form');
  const fields = panel.querySelector('fieldset');
  const button = panel.querySelector('button');
  const status = panel.querySelector('[role="status"]');
  const progress = panel.querySelector('progress');
  let busy = false, pending = null, uploadTask = null;
  const message = (text, error = false) => {
    status.textContent = text;
    status.style.color = error ? '#ffaaaa' : '#baf8f2';
  };
  const authorized = uid => canUpload(auth.currentUser) && auth.currentUser.uid === uid;
  window.addEventListener('beforeunload', event => {
    if (busy || pending) { event.preventDefault(); event.returnValue = ''; }
  });
  onAuthStateChanged(auth, user => {
    panel.hidden = !canUpload(user);
    if (pending && !authorized(pending.uid)) uploadTask?.cancel();
  });
  panel.hidden = !canUpload(auth.currentUser);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    if (!canUpload(auth.currentUser)) { message('Sign in with your administrator account to upload.', true); return; }
    const uid = auth.currentUser.uid;
    if (pending && pending.uid !== uid) { message('Sign back in with the account that started this upload.', true); return; }
    busy = true;
    fields.disabled = button.disabled = true;
    try {
      if (!pending) {
        const file = form.elements.audio.files[0];
        const title = form.elements.title.value.trim();
        const artist = form.elements.artist.value.trim();
        if (!file || !(file.type === 'audio/mpeg' || /\.mp3$/i.test(file.name))) throw new Error('Choose an MP3 file.');
        if (!file.size || file.size > MAX_BYTES) throw new Error('Choose a nonempty MP3 no larger than 250 MB.');
        if (!title || !artist) throw new Error('Enter a title and artist / show name.');
        message('Reading audio duration…');
        const durationSeconds = await readDuration(file);
        if (!authorized(uid)) throw new Error('Your sign-in changed. Sign in again before uploading.');
        const record = doc(collection(db, 'radioApprovedTracks'));
        const audioStoragePath = `radio-admin/${uid}/${record.id}.mp3`;
        pending = { uid, file, record, objectRef: ref(storage, audioStoragePath), uploaded: false, data: {
          title, artist, audioStoragePath, durationSeconds,
          contentType: form.elements.kind.value,
          genre: form.elements.kind.value === 'show' ? 'Radio Show' : '',
          approved: true, reviewStatus: 'approved', uploadedByAdmin: true,
          submittedByUid: uid, contactEmail: auth.currentUser.email,
          originalAudioFileName: file.name, fileSizeBytes: file.size,
          coverUrl: '', profileUrl: '', approvedAt: Date.now(), dateAdded: Date.now()
        }};
      }
      if (!pending.uploaded) {
        progress.hidden = false;
        progress.value = 0;
        message('Uploading… Keep this page open until the upload finishes.');
        uploadTask = uploadBytesResumable(pending.objectRef, pending.file, { contentType: 'audio/mpeg' });
        await new Promise((resolve, reject) => uploadTask.on('state_changed', snapshot => {
          const percent = Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100);
          progress.value = percent;
          message(`Uploading: ${percent}% — keep this page open.`);
        }, reject, resolve));
        pending.uploaded = true;
        pending.file = null;
      }
      if (!authorized(uid)) throw new Error('Sign back in with your administrator account, then retry saving.');
      message('Upload complete. Adding to Approved Songs…');
      const audioUrl = await getDownloadURL(pending.objectRef);
      await setDoc(pending.record, { ...pending.data, audioUrl, createdAt: serverTimestamp() });
      const title = pending.data.title;
      pending = null;
      form.reset();
      progress.hidden = true;
      // The existing library listener receives the new approved record.
      message(`“${title}” added to Approved Songs. You can now add it to a playlist.`);
    } catch (error) {
      console.error('Admin radio upload failed', error);
      if (pending?.uploaded) {
        message('The audio uploaded, but saving it to Approved Songs failed. Keep this page open and retry saving; the audio will not upload again.', true);
      } else {
        pending = null;
        progress.hidden = true;
        message(error.code === 'storage/unauthorized'
          ? 'Upload blocked. Publish the updated Firebase Storage rules for admin radio uploads, then try again.'
          : error.message || 'Upload failed. Please try again.', true);
      }
    } finally {
      busy = false;
      uploadTask = null;
      fields.disabled = Boolean(pending);
      button.disabled = false;
      button.textContent = pending ? 'Retry saving to Approved Songs' : 'Upload to Approved Songs';
    }
  });
}
