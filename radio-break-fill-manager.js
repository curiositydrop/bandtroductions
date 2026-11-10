import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { doc, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';
import { isAdminAccount } from './admin-access.js';
import { breakFillContentType, planBreakFillSave, resolveBreakFill, isApprovedFillUrl } from './radio-break-fill.mjs?v=20261110-fill-off';

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
    #break-fill-manager .break-fill-actions button{flex:1 1 160px}
  </style>
  <h3 style="color:#0ccfbd;margin:0 0 5px">Between-Show Fill Bed</h3>
  <button type="button" id="break-fill-toggle" class="crr-btn" aria-expanded="false" style="margin:8px 0;min-height:44px">+ Expand</button>
  <div id="break-fill-body" hidden>
    <p class="crr-muted" style="margin:0 0 10px;line-height:1.45">The bed is off until you upload promotional audio and save it. Paid ads still play first, in full (up to two). A saved bed covers only the seconds left in the 60-second break, then fades out as the next show starts. Listeners share the station clock. Nothing is written per listener, and no placeholder tone is played.</p>
    <p id="break-fill-source" class="crr-muted" style="margin:0 0 10px;line-height:1.45"></p>
    <label style="display:flex;align-items:center;gap:8px;margin:8px 0"><input id="break-fill-enabled" type="checkbox" style="width:auto"> Play the uploaded bed in the unused break time</label>
    <label>Bed name (Control Room only)<input id="break-fill-label" type="text" maxlength="120" placeholder="Station promo"></label>
    <label style="margin-top:8px">Upload or replace (MP3, M4A, WAV, AAC, max 15 MB)<input id="break-fill-file" type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/aac,.mp3,.m4a,.wav,.aac,audio/*"></label>
    <p class="crr-muted" style="margin:8px 0;line-height:1.45">iPhone Voice Memos (.m4a) are welcome. AAC needs the Storage rules update in this branch before an upload will succeed; that rules change is not deployed. MP3, M4A, and WAV use the rules already live. Turning this on requires the file you upload here. A shorter clip loops. A longer clip is heard from the matching moment in the break. Either way it fades out over about 1.25 seconds at the end of the minute.</p>
    <audio id="break-fill-preview-audio" playsinline webkit-playsinline preload="none" style="display:none"></audio>
    <div class="break-fill-actions">
      <button type="button" id="break-fill-play" class="crr-btn">Preview selected audio</button>
      <button type="button" id="break-fill-save" class="crr-btn primary">Save fill bed</button>
    </div>
    <p id="break-fill-status" role="status" aria-live="polite" style="color:#aab;font-size:.9rem;line-height:1.4"></p>
    <p class="crr-muted" style="margin:8px 0 0"><a id="break-fill-sim-link" href="radio-break-fill-sim.html" style="color:#0ccfbd">Open the break-timing preview</a> (a generated test tone on this page only; saves nothing and is not the station).</p>
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
  let dirty = false;
  let objectUrl = '';
  let detectedDuration = 0;
  const OFF_COPY = 'Fill is off. Listeners hear the ads, then silence for the rest of the minute, until you upload promotional audio and save with the bed enabled.';

  function describe(data) {
    const approved = resolveBreakFill(data);
    if (approved) return `Uploaded bed is on (${approved.durationSeconds}s)${approved.label ? `: ${approved.label}` : ''}.`;
    if (data && data.enabled === true) return 'A bed was marked on, but it is not an approved upload, so the station will not play it.';
    return OFF_COPY;
  }
  function applyStored(data) {
    stored = data && typeof data === 'object' ? data : null;
    if (dirty) return;
    enabled.checked = !!resolveBreakFill(stored);
    label.value = stored?.label || '';
    source.textContent = describe(stored);
  }
  function previewSrc() {
    if (objectUrl) return objectUrl;
    const approved = resolveBreakFill(stored);
    return approved ? approved.audioUrl : '';
  }
  function stopPreview() {
    previewAudio.pause();
    try { previewAudio.currentTime = 0; } catch { /* not seekable yet */ }
    playButton.textContent = 'Preview selected audio';
  }
  playButton.addEventListener('click', () => {
    if (!previewAudio.paused) { stopPreview(); return; }
    const src = previewSrc();
    if (!src) { status.textContent = 'Choose an audio file to preview. The station stays silent until a real upload is saved.'; return; }
    if (previewAudio.getAttribute('src') !== src) previewAudio.src = src;
    previewAudio.playsInline = true;
    playButton.textContent = 'Stop preview';
    previewAudio.play().catch(error => {
      stopPreview();
      status.textContent = 'Preview could not start: ' + error.message;
    });
  });
  previewAudio.addEventListener('ended', stopPreview);
  previewAudio.addEventListener('error', () => {
    if (playButton.textContent.startsWith('Stop')) status.textContent = 'That audio could not be loaded. The station will not play it.';
    stopPreview();
  });
  fileInput.addEventListener('change', async () => {
    dirty = true;
    detectedDuration = 0;
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
      detectedDuration = seconds;
      status.textContent = `Detected ${seconds.toFixed(1)} seconds. Preview it, then save. ${file.name.toLowerCase().endsWith('.aac') ? 'AAC still needs the Storage rules deploy before save will succeed.' : ''}`.trim();
    } catch (error) {
      detectedDuration = 0;
      status.textContent = error.message;
    }
  });
  enabled.addEventListener('change', () => { dirty = true; });
  label.addEventListener('input', () => { dirty = true; });

  function canPublish(user) {
    return !!user && isAdminAccount(user) && user.email === 'mbergeron79@gmail.com' && (user.emailVerified || user.uid === 'PJXufsvdCCgRpfKcLtxPH3jEQN83');
  }
  saveButton.disabled = preview;
  if (sim) {
    source.textContent = OFF_COPY;
    status.textContent = 'Preview is read-only. No station data changed. Choose a file if you want to preview it on this device.';
  } else {
    onAuthStateChanged(auth, user => {
      if (!isAdminAccount(user)) { panel.hidden = true; return; }
      panel.hidden = false;
      if (preview) status.textContent = 'Preview is read-only. No station data changed. Choose a file if you want to preview it on this device.';
      onSnapshot(doc(db, 'radioPlaylists', '__stationControl'), snap => {
        applyStored(snap.data()?.breakFill);
        if (preview && !dirty) status.textContent = 'Preview is read-only. No station data changed. Choose a file if you want to preview it on this device.';
      }, error => { status.textContent = 'Unable to load the fill bed: ' + error.message; });
    });
  }
  saveButton.addEventListener('click', async () => {
    if (preview) { status.textContent = 'Preview is read-only. No station data changed.'; return; }
    const user = auth.currentUser;
    if (!canPublish(user)) { status.textContent = 'Verified admin sign-in required.'; return; }
    const file = fileInput.files[0] || null;
    if (file) {
      const type = breakFillContentType(file.name);
      if (!type) { status.textContent = 'Use an MP3, M4A, WAV, or AAC file.'; return; }
      if (!file.size || file.size > 15 * 1024 * 1024) { status.textContent = 'Audio must be under 15 MB.'; return; }
    }
    const plan = planBreakFillSave({
      enabled: enabled.checked,
      existing: stored,
      fileReady: !!file,
      durationSeconds: detectedDuration,
      label: label.value
    });
    if (!plan.ok) {
      status.textContent = plan.reason === 'duration'
        ? 'Preview the file so its duration can be read before saving.'
        : 'Upload promotional audio before turning the bed on. Nothing was saved.';
      return;
    }
    if (!confirm(plan.breakFill.enabled ? 'Play this uploaded bed after the ads for every listener?' : 'Turn the between-show bed off for every listener?')) return;
    saveButton.disabled = true;
    try {
      const next = { ...plan.breakFill, label: label.value.trim().slice(0, 120), updatedAt: Date.now() };
      if (file) {
        status.textContent = 'Reading audio…';
        const seconds = detectedDuration || await new Promise((resolve, reject) => {
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
      if (next.enabled && !isApprovedFillUrl(next.audioUrl)) throw Error('The upload did not return an approved Storage URL. The bed stays off.');
      if (next.enabled && !resolveBreakFill(next)) throw Error('This bed is not approved for air. Nothing was changed.');
      status.textContent = 'Saving…';
      await setDoc(doc(db, 'radioPlaylists', '__stationControl'), { breakFill: next, updatedAt: Date.now() }, { merge: true });
      dirty = false;
      fileInput.value = '';
      detectedDuration = 0;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = '';
      status.textContent = next.enabled
        ? 'Uploaded bed saved. Listeners pick it up on the next break.'
        : 'Fill turned off. Nothing plays after the ads.';
    } catch (error) {
      const aac = file && breakFillContentType(file.name) === 'audio/aac';
      status.textContent = 'Not saved: ' + error.message + (aac ? ' AAC needs the Storage rules deploy from this branch (audio/aac) before it can upload.' : '');
    } finally {
      saveButton.disabled = preview;
    }
  });
}
