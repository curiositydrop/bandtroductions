// Owner and admin surfaces both mount this. It only draws a card and shares a link.
import { drawShareCard, canvasToPngBlob } from './share-card.js';
import {
  SHARE_KIT_EVENTS,
  SHARE_KIT_LINE,
  bandInitials,
  buildShareLink,
  shareKitFileName
} from './radio-share-kit-core.mjs';

const STYLE_ID = 'radio-share-kit-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .rsk{color:#eef6f4;font-family:Arial,Helvetica,sans-serif}
    .rsk-kicker{margin:0;color:#0ccfbd;font-size:.72rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
    .rsk h2{margin:4px 0 6px;font-size:1.35rem;line-height:1.15;color:#fff}
    .rsk-copy,.rsk-note{margin:0;color:#9aada9;font-size:.88rem;line-height:1.4}
    .rsk-note{margin-top:8px}
    .rsk-preview{width:min(100%,420px);height:auto;margin:12px auto 0;border-radius:16px;display:block;background:#050807;box-shadow:0 10px 28px rgba(0,0,0,.35)}
    .rsk-actions{display:grid;gap:8px;margin-top:12px}
    .rsk-actions button{min-height:48px;border-radius:999px;border:1px solid #0ccfbd;background:#0ccfbd;color:#06110f;font:inherit;font-size:1rem;font-weight:900;cursor:pointer}
    .rsk-actions button.secondary{background:#0b1110;color:#0ccfbd}
    .rsk-actions button:disabled{opacity:.45;cursor:default}
    .rsk-url{margin:10px 0 0;font-size:.75rem;line-height:1.35;word-break:break-all;color:#baf8f2}
    .rsk-status{min-height:1.2em;margin:8px 0 0;font-weight:800;color:#d7fff8}
    .rsk-status[data-tone="error"]{color:#ffb4b4}
  `;
  document.head.appendChild(style);
}

function track(name, params) {
  const payload = { event_category: 'Radio Share Kit', ...(params || {}) };
  try {
    if (typeof window.btTrack === 'function') window.btTrack(name, payload);
    else if (typeof window.gtag === 'function') window.gtag('event', name, payload);
  } catch { /* analytics must not block sharing */ }
}

function fitLine(ctx, text, maxWidth, start, min, weight) {
  let size = start;
  let value = String(text || '');
  while (size > min) {
    ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
    if (ctx.measureText(value).width <= maxWidth) return { font: ctx.font, text: value };
    size -= 2;
  }
  ctx.font = `${weight} ${min}px Arial, Helvetica, sans-serif`;
  const ellipsis = '…';
  while (value.length > 1 && ctx.measureText(`${value}${ellipsis}`).width > maxWidth) value = value.slice(0, -1);
  const trimmed = value.length < String(text || '').length ? `${value}${ellipsis}` : value;
  return { font: ctx.font, text: trimmed };
}

export function radioCardOptions({ name, image }) {
  const band = String(name || 'Our band').trim() || 'Our band';
  const probe = document.createElement('canvas').getContext('2d');
  const fitted = fitLine(probe, band.toUpperCase(), 960, 76, 36, 900);
  return {
    image: image || '',
    crossOrigin: image ? 'anonymous' : '',
    fallback: true,
    monogram: bandInitials(band),
    gradient: ['#083833', '#050505'],
    photo: { x: 250, y: 214, size: 580, radius: 44, stroke: '#0ccfbd', strokeWidth: 10 },
    marks: [{ type: 'rule', y: 176, x1: 140, x2: 940, color: '#0ccfbd', width: 6 }],
    lines: [
      { text: 'BANDTRODUCTIONS', y: 92, font: '900 40px Arial, Helvetica, sans-serif', fill: '#0ccfbd' },
      { text: "WE'RE ON THE RADIO", y: 156, font: '900 54px Arial, Helvetica, sans-serif', fill: '#ffffff' },
      { text: fitted.text, y: 888, font: fitted.font, fill: '#ffffff' },
      { text: SHARE_KIT_LINE, y: 962, font: '700 36px Arial, Helvetica, sans-serif', fill: '#d7fff8' },
      { text: 'bandtroductions.com', y: 1032, font: '700 30px Arial, Helvetica, sans-serif', fill: '#8aa39e' }
    ]
  };
}

async function pngBlob(canvas, band) {
  try {
    return await canvasToPngBlob(canvas);
  } catch {
    const clean = await drawShareCard({ ...radioCardOptions(band), image: '' });
    return canvasToPngBlob(clean);
  }
}

function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    input.remove();
    return ok;
  }
}

async function sharePng(blob, { title, text, url, filename }) {
  const file = new File([blob], filename, { type: 'image/png' });
  const caption = `${text} ${url}`;
  const withFile = { files: [file], title, text: caption };
  const can = navigator.canShare?.bind(navigator);
  try {
    if (can?.(withFile)) {
      await navigator.share(withFile);
      return 'web_share_files';
    }
    if (can?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text: caption });
      return 'web_share_files';
    }
  } catch (error) {
    if (error?.name === 'AbortError') return 'abort';
  }
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'web_share';
    } catch (error) {
      if (error?.name === 'AbortError') return 'abort';
    }
  }
  return '';
}

export async function mountShareKit(container, band) {
  ensureStyle();
  const name = String(band?.name || 'Our band').trim() || 'Our band';
  const model = {
    name,
    image: band?.image || '',
    profileId: band?.profileId || '',
    path: band?.path || '',
    songCount: Math.max(1, Number(band?.songCount) || 1),
    surface: band?.surface || 'owner'
  };
  const url = buildShareLink(model);
  const filename = shareKitFileName(name);
  const songs = model.songCount === 1 ? '1 approved song' : `${model.songCount} approved songs`;
  container.replaceChildren();
  container.classList.add('rsk');
  container.hidden = false;

  const kicker = document.createElement('p');
  kicker.className = 'rsk-kicker';
  kicker.textContent = 'BANDtroductions Radio';
  const heading = document.createElement('h2');
  heading.textContent = 'Share that you’re on the radio';
  const copy = document.createElement('p');
  copy.className = 'rsk-copy';
  copy.textContent = `${songs} on BANDtroductions Radio. Post this card so fans land on your profile.`;
  const preview = document.createElement('canvas');
  preview.className = 'rsk-preview';
  preview.width = 1080;
  preview.height = 1080;
  preview.setAttribute('aria-label', `${name} radio share card`);
  const actions = document.createElement('div');
  actions.className = 'rsk-actions';
  const shareButton = document.createElement('button');
  shareButton.type = 'button';
  shareButton.dataset.rskShare = '1';
  shareButton.textContent = 'Share';
  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'secondary';
  downloadButton.dataset.rskDownload = '1';
  downloadButton.textContent = 'Download';
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'secondary';
  copyButton.dataset.rskCopy = '1';
  copyButton.textContent = 'Copy Link';
  actions.append(shareButton, downloadButton, copyButton);
  const linkLine = document.createElement('p');
  linkLine.className = 'rsk-url';
  linkLine.dataset.rskUrl = url;
  linkLine.textContent = url;
  const status = document.createElement('p');
  status.className = 'rsk-status';
  status.setAttribute('role', 'status');
  const note = document.createElement('p');
  note.className = 'rsk-note';
  note.textContent = 'Instagram can’t take a post directly from the browser. Download the image, post it in the Instagram app, and paste the link.';
  container.append(kicker, heading, copy, preview, actions, linkLine, status, note);

  const setStatus = (text, error = false) => {
    status.textContent = text;
    status.dataset.tone = error ? 'error' : '';
  };
  const eventParams = () => ({
    profile_id: model.profileId || model.path || 'unknown',
    song_count: model.songCount,
    surface: model.surface
  });

  let card = null;
  const buttons = [shareButton, downloadButton, copyButton];
  buttons.forEach(button => { button.disabled = true; });
  setStatus('Drawing your card…');
  try {
    card = await drawShareCard(radioCardOptions(model));
    const context = preview.getContext('2d');
    context.clearRect(0, 0, preview.width, preview.height);
    context.drawImage(card, 0, 0);
    buttons.forEach(button => { button.disabled = false; });
    setStatus('');
  } catch (error) {
    console.warn('Radio share card failed', error);
    setStatus('The share card could not be drawn on this device.', true);
    return container;
  }

  shareButton.addEventListener('click', async () => {
    shareButton.disabled = true;
    try {
      const blob = await pngBlob(card, model);
      const method = await sharePng(blob, {
        title: `${name} on BANDtroductions Radio`,
        text: SHARE_KIT_LINE,
        url,
        filename
      });
      if (method === 'abort') return;
      if (method) {
        track(SHARE_KIT_EVENTS.share, { ...eventParams(), method });
        setStatus(method === 'web_share_files' ? 'Share sheet opened with your card.' : 'Share sheet opened.');
        return;
      }
      downloadBlob(blob, filename);
      const copied = await copyText(url);
      track(SHARE_KIT_EVENTS.share, { ...eventParams(), method: 'download_fallback' });
      setStatus(copied ? 'Card saved and the profile link was copied.' : 'Card saved. Copy the link below to post with it.');
    } catch (error) {
      console.warn('Radio share failed', error);
      setStatus('Sharing did not finish. Try Download or Copy Link.', true);
    } finally {
      shareButton.disabled = false;
    }
  });

  downloadButton.addEventListener('click', async () => {
    downloadButton.disabled = true;
    try {
      const blob = await pngBlob(card, model);
      downloadBlob(blob, filename);
      track(SHARE_KIT_EVENTS.download, eventParams());
      setStatus('PNG saved. Post it with the link below.');
    } catch (error) {
      console.warn('Radio share download failed', error);
      setStatus('The PNG could not be saved on this device.', true);
    } finally {
      downloadButton.disabled = false;
    }
  });

  copyButton.addEventListener('click', async () => {
    const copied = await copyText(url);
    if (!copied) {
      setStatus('Select the link below and copy it.', true);
      return;
    }
    track(SHARE_KIT_EVENTS.copy, eventParams());
    setStatus('Profile link copied.');
  });

  container.dataset.rskReady = '1';
  return container;
}
