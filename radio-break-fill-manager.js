import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { doc, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';
import { isAdminAccount } from './admin-access.js';
import { breakFillContentType, DEFAULT_BREAK_FILL_URL, DEFAULT_BREAK_FILL_SECONDS } from './radio-break-fill.mjs';

const host = document.getElementById('cr-radio-body');
if (host) {
  const sim = /radio-break-fill-sim\.html$/i.test(location.pathname);
  const preview = sim || /pages\.dev$|grok\.bot$|vercel\.app$|--.*\.web\.app$|^localhost$|^127\.0\.0\.1$/.test(location.hostname) || new URLSearchParams(location.search).has('adPreview') || new URLSearchParams(location.search).has('radioPreview');
  const panel = document.createElement('section');
  panel.className = 'crr-panel';
  panel.id = 'break-fill-manager';
  panel.hidden = !sim;
  panel.style.cssText = 'border:1px solid #315650;border-radius:14px;background:#0b0e0e;padding:14px;margin:12px 0;color:#eee';
  panel.innerHTML = `<style>
    #break-fill-manager{overflow-wrap:anywhere}
    #break-fill-manager button,#break-fill-manager input,#break-fill-manager label{font-size:16px}
    #break-fill-manager button{min-height:44px}
    #break-fill-manager input[type="text"],#break-fill-manager input[type="file"]{display:block;box-sizing:border-box;width:100%;max-width:100%;padding:10px;margin-top:4px;border-radius:8px;background:#101717;color:white;border:1px solid #456}
    #break-fill-manager .break-fill-actions{display:flex;flex-wrap:wrap;gap:8px}
    #break-fill-manager .break-fill-actions button{flex:1 1 140px}
  </style>
  <h3 style="color:#0ccfbd;margin:0 0 5px">Between-Show Fill Bed</h3>
  <button type="button" id="break-fill-toggle" class="crr-btn" aria-expanded="false" style="margin:8px 0;min-height:44px">+ Expand</button>
  <div id="break-fill-body" hidden>
    <p class="crr-muted" style="margin:0 0 10px;line-height:1.45">Paid ads still play first, in full (up to two). This bed only covers the seconds left in the 60-second break, then fades out as the next show starts. Every listener, including late joiners, follows the same station clock. Nothing is written per listener.</p>
    <p id="break-fill-source" class="crr-muted" style="margin:0 0 10px;line-height:1.45"></p>
    <label style="display:flex;align-items:center;gap:8px;margin:8px 0"><input id="break-fill-enabled" type="checkbox" checked style="width:auto"> Play a bed in the unused break time</label>
    <label>Bed name (Control Room only)<input id="break-fill-label" type="text" maxlength="120" placeholder="Station promo"></label>
    <label style="margin-top:8px">Upload or replace (MP3, M4A, WAV, AAC, max 15 MB)<input id="break-fill-file" type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/aac,.mp3,.m4a,.wav,.aac,audio/*"></label>
    <p class="crr-muted" style="margin:8px 0;line-height:1.45">iPhone Voice Memos (.m4a) are welcome. AAC needs the Storage rules update in this branch before an upload will succeed; that rules change is not deployed. MP3, M4A, and WAV use the rules already live. A clip shorter than the leftover time loops. A longer clip is heard from the matching moment in the break. Either way it fades out over about 1.25 seconds at the end of the minute and does not play into the next show.</p>
    <audio id="break-fill-preview-audio" playsinline webkit-playsinline preload="none" style="display:none"></audio>
    <div class="break-fill-actions">
      <button type="button" id="break-fill-play" class="crr-btn">Preview bed</button>
      <button type="button" id="break-fill-default" class="crr-btn">Use built-in bed</button>
      <button type="button" id="break-fill-save" class="crr-btn primary">Save fill bed</button>
    </div>
    <p id="break-fill-status" role="status" aria-live="polite" style="color:#aab;font-size:.9rem;line-height:1.4"></p>
    <p class="crr-muted" style="margin:8px 0 0"><a id="break-fill-sim-link" href="radio-break-fill-sim.html" style="color:#0ccfbd">Open the break-timing preview</a> (plays in this browser only; saves nothing).</p>
  </div>`;
  const body = panel.querySelector('#break-fill-body');
  const toggle = panel.querySelector('#break-fill-toggle');
  toggle.addEventListener('click', () => {
    const opening = body.hidden;
    body.hidden = !opening;
    toggle.textContent = opening ? '− Collapse' : '+ Expand';
    toggle.setAttribute('aria-expanded', String(opening));
  });
  host.append(panel);
  const place = () => {
    const radio = host.querySelector('#crr');
    if (radio && panel.parentElement !== radio) radio.append(panel);
  };
  place();
  new MutationObserver(place).observe(host, { childList: true });

  const status = panel.querySelector('#break-fill-status');
  const source = panel.querySelector('#break-fill-source');
  const enabled = panel.querySelector('#break-fill-enabled');
  const label = panel.querySelector('#break-fill-label');
  const fileInput = panel.querySelector('#break-fill-file');
  const previewAudio = panel.querySelector('#break-fill-preview-audio');
  const playButton = panel.querySelector('#break-fill-play');
  const saveButton = panel.querySelector('#break-fill-save');
  previewAudio.setAttribute('playsinline', '');
  let stored = null;
  let preferDefault = false;
  let dirty = false;
  let objectUrl = '';
  const DEFAULT_COPY = `No custom bed is saved, so the station uses a built-in ${DEFAULT_BREAK_FILL_SECONDS}-second tone (${DEFAULT_BREAK_FILL_URL}). It is an original synthesized placeholder, not a song and not a commercial. Upload a BANDtroductions promo, station ID, or another bed you have the rights to play.`;

  function describe(data) {
    if (data && data.enabled === false) return 'Fill is off. After the ads, the break goes quiet again until you turn this back on.';
    if (data && data.audioUrl) return `Custom bed is on${data.durationSeconds ? ` (${data.durationSeconds}s)` : ''}${data.label ? `: ${data.label}` : ''}.`;
    return DEFAULT_COPY;
  }
  function applyStored(data) {
    stored = data && typeof data === 'object' ? data : null;
    if (dirty) return;
    enabled.checked = !(stored && stored.enabled === false);
    label.value = stored?.label || '';
    preferDefault = false;
    source.textContent = describe(stored);
  }
  function previewSrc() {
    if (objectUrl && !preferDefault) return objectUrl;
    if (!preferDefault && stored?.audioUrl) return stored.audioUrl;
    return DEFAULT_BREAK_FILL_URL;
  }
  function stopPreview() {
    previewAudio.pause();
    try { previewAudio.currentTime = 0; } catch { /* not seekable yet */ }
    playButton.textContent = 'Preview bed';
  }
  playButton.addEventListener('click', () => {
    if (!previewAudio.paused) { stopPreview(); return; }
    const src = previewSrc();
    if (previewAudio.getAttribute('src') !== src) previewAudio.src = src;
    previewAudio.playsInline = true;
    playButton.textContent = 'Stop preview';
    previewAudio.play().catch(error => {
      stopPreview();
      status.textContent = 'Preview could not start: ' + error.message;
    });
  });
  previewAudio.addEventListener('ended', stopPreview);
  fileInput.addEventListener('change', async () => {
    dirty = true;
    preferDefault = false;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
    const file = fileInput.files[0];
    if (!file) return;
    const type = breakFillContentType(file.name);
    if (!type) { status.textContent = 'Use an MP3, M4A, WAV, or AAC file.'; return; }
    if (!file.size || file.size > 15 * 1024 * 1024) { status.textContent = 'Audio must be under 15 MB.'; return; }
    objectUrl = URL.createObjectURL(file);
    try {
      const seconds = await new Promise((resolve, reject) => {
        const probe = new Audio();
        probe.preload = 'metadata';
        probe.onloadedmetadata = () => resolve(probe.duration);
        probe.onerror = () => reject(Error('Cannot read this audio file.'));
        probe.src = objectUrl;
      });
      if (!Number.isFinite(seconds) || seconds <= 0) throw Error('Cannot read this audio duration.');
      status.textContent = `Detected ${seconds.toFixed(1)} seconds. Preview it, then save. ${file.name.toLowerCase().endsWith('.aac') ? 'AAC still needs the Storage rules deploy before save will succeed.' : ''}`.trim();
    } catch (error) {
      status.textContent = error.message;
    }
  });
  panel.querySelector('#break-fill-default').addEventListener('click', () => {
    dirty = true;
    preferDefault = true;
    fileInput.value = '';
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
    stopPreview();
    status.textContent = preview
      ? 'Built-in bed selected for this preview. Saving is off here, so the live station is unchanged.'
      : 'Built-in bed selected. Save to use it for every listener.';
    source.textContent = DEFAULT_COPY;
  });
  enabled.addEventListener('change', () => { dirty = true; });
  label.addEventListener('input', () => { dirty = true; });

  function canPublish(user) {
    return !!user && isAdminAccount(user) && user.email === 'mbergeron79@gmail.com' && (user.emailVerified || user.uid === 'PJXufsvdCCgRpfKcLtxPH3jEQN83');
  }
  saveButton.disabled = preview;
  if (sim) {
    source.textContent = DEFAULT_COPY;
    status.textContent = 'Preview is read-only. No station data changed. You can still preview the bed on this device.';
  } else {
    onAuthStateChanged(auth, user => {
      if (!isAdminAccount(user)) { panel.hidden = true; return; }
      panel.hidden = false;
      if (preview) status.textContent = 'Preview is read-only. No station data changed. You can still preview the bed on this device.';
      onSnapshot(doc(db, 'radioPlaylists', '__stationControl'), snap => {
        applyStored(snap.data()?.breakFill);
        if (preview && !dirty) status.textContent = 'Preview is read-only. No station data changed. You can still preview the bed on this device.';
      }, error => { status.textContent = 'Unable to load the fill bed: ' + error.message; });
    });
  }
  saveButton.addEventListener('click', async () => {
    if (preview) { status.textContent = 'Preview is read-only. No station data changed.'; return; }
    const user = auth.currentUser;
    if (!canPublish(user)) { status.textContent = 'Verified admin sign-in required.'; return; }
    const file = preferDefault ? null : fileInput.files[0];
    if (file) {
      const type = breakFillContentType(file.name);
      if (!type) { status.textContent = 'Use an MP3, M4A, WAV, or AAC file.'; return; }
      if (!file.size || file.size > 15 * 1024 * 1024) { status.textContent = 'Audio must be under 15 MB.'; return; }
    }
    if (!confirm('Update the between-show fill bed for every listener?')) return;
    saveButton.disabled = true;
    try {
      const next = {
        enabled: enabled.checked,
        label: label.value.trim().slice(0, 120),
        audioUrl: preferDefault ? '' : (stored?.audioUrl || ''),
        durationSeconds: preferDefault ? 0 : (Number(stored?.durationSeconds) || 0),
        updatedAt: Date.now()
      };
      if (file) {
        status.textContent = 'Reading audio…';
        const seconds = await new Promise((resolve, reject) => {
          const probe = new Audio();
          probe.preload = 'metadata';
          probe.onloadedmetadata = () => resolve(probe.duration);
          probe.onerror = () => reject(Error('Cannot read this audio file.'));
          probe.src = objectUrl || URL.createObjectURL(file);
        });
        if (!Number.isFinite(seconds) || seconds <= 0) throw Error('Cannot read this audio duration.');
        next.durationSeconds = Math.round(seconds * 100) / 100;
        status.textContent = 'Uploading bed…';
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `between-show-ads/${user.uid}/break-fill-${Date.now()}-${Math.random().toString(36).slice(2)}-${safe}`;
        const storage = getStorage();
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, file, { contentType: breakFillContentType(file.name) });
        next.audioUrl = await getDownloadURL(fileRef);
      }
      if (next.enabled && next.audioUrl && !(next.durationSeconds > 0)) throw Error('Duration is missing. Choose the file again.');
      status.textContent = 'Saving…';
      await setDoc(doc(db, 'radioPlaylists', '__stationControl'), { breakFill: next, updatedAt: Date.now() }, { merge: true });
      preferDefault = false;
      dirty = false;
      fileInput.value = '';
      status.textContent = next.enabled
        ? (next.audioUrl ? 'Custom bed saved. Listeners pick it up on the next break.' : 'Built-in bed saved. Listeners pick it up on the next break.')
        : 'Fill turned off. Breaks go quiet after the ads again.';
    } catch (error) {
      const aac = file && breakFillContentType(file.name) === 'audio/aac';
      status.textContent = 'Not saved: ' + error.message + (aac ? ' AAC needs the Storage rules deploy from this branch (audio/aac) before it can upload.' : '');
    } finally {
      saveButton.disabled = preview;
    }
  });
}
