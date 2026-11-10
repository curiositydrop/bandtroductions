// Shared-clock bed for the unused tail of a 60-second between-show break.
// Paid ads keep the front of the minute. Real playback stays off unless
// __stationControl.breakFill is an explicit, enabled Firebase Storage upload.
// This module does not write Firestore or Storage and does not start audio by itself.
import { planCommercialBreak } from './radio-break-planner.mjs';

export const BREAK_LENGTH_SECONDS = 60;
export const FILL_FADE_SECONDS = 1.25;
export const REJECTED_FILL_MARK = 'break-fill-default';

const CONTENT_TYPES = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  aac: 'audio/aac'
};

// Map by extension so an iPhone Voice Memo (.m4a, often an empty MIME type)
// uploads as audio/mp4, which the current Storage rule already allows.
export function breakFillContentType(fileName) {
  const ext = (String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  return CONTENT_TYPES[ext] || '';
}

export function paidAdSeconds(config) {
  if (!config || config.active !== true) return 0;
  if (Array.isArray(config.ads)) {
    const plan = planCommercialBreak(config.ads);
    return plan.ok ? plan.usedSeconds : 0;
  }
  if (!(config.videoUrl || config.posterUrl || config.audioUrl)) return 0;
  return Math.max(1, Math.min(BREAK_LENGTH_SECONDS, Number(config.durationSeconds) || 40));
}

export function isApprovedFillUrl(url) {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value || /break-fill-default/i.test(value)) return false;
  let parsed;
  try { parsed = new URL(value); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return host === 'firebasestorage.googleapis.com' || host.endsWith('.firebasestorage.app');
}

// A saved Storage object can be previewed even while the bed is off.
// Station playback still requires resolveBreakFill (enabled and a duration).
export function previewableBreakFill(stored) {
  if (!stored || typeof stored !== 'object') return null;
  const audioUrl = typeof stored.audioUrl === 'string' ? stored.audioUrl.trim() : '';
  if (!isApprovedFillUrl(audioUrl)) return null;
  const duration = Number(stored.durationSeconds);
  return {
    audioUrl,
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
    enabled: stored.enabled === true,
    label: String(stored.label || '').slice(0, 120)
  };
}

// Missing map, enabled not exactly true, placeholder/relative/foreign URL, or
// bad duration: stay off. Never substitute a generated tone.
export function resolveBreakFill(stored) {
  if (!stored || typeof stored !== 'object' || stored.enabled !== true) return null;
  const audioUrl = typeof stored.audioUrl === 'string' ? stored.audioUrl.trim() : '';
  if (!isApprovedFillUrl(audioUrl)) return null;
  const duration = Number(stored.durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600) return null;
  return {
    enabled: true,
    audioUrl,
    durationSeconds: duration,
    label: String(stored.label || 'Station bed').slice(0, 120),
    source: 'custom'
  };
}

// Enabling requires a new upload or an already approved Storage URL.
// Disabling is allowed and clears any placeholder URL. This does not write.
export function planBreakFillSave({ enabled, existing, fileReady, durationSeconds, label = '' } = {}) {
  const name = String(label || existing?.label || '').trim().slice(0, 120);
  if (enabled !== true) {
    const keep = resolveBreakFill({ ...existing, enabled: true });
    return {
      ok: true,
      needsUpload: false,
      breakFill: {
        enabled: false,
        audioUrl: keep ? keep.audioUrl : '',
        durationSeconds: keep ? keep.durationSeconds : 0,
        label: name
      }
    };
  }
  if (fileReady) {
    const duration = Number(durationSeconds);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 600) return { ok: false, reason: 'duration' };
    return { ok: true, needsUpload: true, breakFill: { enabled: true, durationSeconds: duration, label: name } };
  }
  const saved = previewableBreakFill(existing);
  if (!saved || !(saved.durationSeconds > 0)) return { ok: false, reason: 'upload-required' };
  return {
    ok: true,
    needsUpload: false,
    breakFill: {
      enabled: true,
      audioUrl: saved.audioUrl,
      durationSeconds: saved.durationSeconds,
      label: name || saved.label
    }
  };
}

export function planBreakFill({
  breakOffsetSeconds,
  adSeconds = 0,
  fill,
  fadeSeconds = FILL_FADE_SECONDS,
  breakSeconds = BREAK_LENGTH_SECONDS
} = {}) {
  if (!fill || fill.enabled === false || !fill.audioUrl) return { phase: 'none', reason: 'fill-off' };
  const ads = Math.max(0, Math.min(breakSeconds, Number(adSeconds) || 0));
  const offset = Number(breakOffsetSeconds);
  if (!Number.isFinite(offset)) return { phase: 'none', reason: 'bad-offset' };
  if (offset < 0 || offset >= breakSeconds) return { phase: 'none', reason: 'outside-break' };
  if (ads >= breakSeconds - 1e-6) return { phase: 'none', reason: 'ads-fill-minute', adSeconds: ads };
  if (offset < ads - 1e-9) {
    return { phase: 'ad', adSeconds: ads, fillStartsAt: ads, reason: 'ad-still-playing' };
  }
  const elapsed = offset - ads;
  const remaining = breakSeconds - offset;
  const window = breakSeconds - ads;
  const clip = Number(fill.durationSeconds);
  const known = Number.isFinite(clip) && clip > 0.05;
  // A clip shorter than the leftover window loops on the one unlocked audio
  // element. A longer clip does not loop: every listener seeks to the same
  // elapsed point. The fade is a function of time left on the shared clock.
  const loop = !known || clip < window - 0.05;
  let clipOffset = elapsed;
  if (known) clipOffset = loop ? elapsed % clip : Math.min(elapsed, Math.max(0, clip - 0.05));
  const volume = remaining <= fadeSeconds ? Math.max(0, remaining / fadeSeconds) : 1;
  return {
    phase: 'fill',
    audioUrl: fill.audioUrl,
    label: fill.label || 'Station bed',
    source: fill.source || 'custom',
    clipOffsetSeconds: clipOffset,
    elapsedFillSeconds: elapsed,
    remainingSeconds: remaining,
    volume,
    loop,
    fade: volume < 0.999,
    adSeconds: ads,
    fillStartsAt: ads,
    breakSeconds
  };
}

export function currentBreakFill({
  stationEnabled = true,
  sponsorConfig,
  fillConfig,
  gap = null,
  previewOffset = null,
  previewAdSeconds = null,
  previewNextStart = 0
} = {}) {
  if (!stationEnabled) return null;
  const source = resolveBreakFill(fillConfig);
  if (!source) return null;
  let offset = null;
  let adSeconds = 0;
  let meta = null;
  if (previewOffset != null) {
    offset = previewOffset;
    adSeconds = Number(previewAdSeconds) || 0;
    meta = { endedShow: 'Test', nextShow: 'Back to the music', nextStartMinutes: previewNextStart };
  } else if (gap) {
    offset = gap.offsetSecondsExact;
    adSeconds = paidAdSeconds(sponsorConfig);
    meta = {
      endedShow: gap.endedShow,
      nextShow: gap.nextShow,
      nextStartMinutes: gap.nextStartMinutes
    };
  } else return null;
  const plan = planBreakFill({ breakOffsetSeconds: offset, adSeconds, fill: source });
  if (plan.phase !== 'fill') return null;
  return { ...plan, ...meta, key: `break-fill|${meta.nextStartMinutes}|${source.audioUrl}` };
}

export function clampFillSeek(fill, duration) {
  let time = Number(fill?.clipOffsetSeconds);
  if (!Number.isFinite(time) || time < 0) time = 0;
  const elapsed = Number(fill?.elapsedFillSeconds);
  if (Number.isFinite(duration) && duration > 0.2) {
    if (time >= duration - 0.02 && fill?.loop && Number.isFinite(elapsed)) time = elapsed % duration;
    time = Math.min(Math.max(0, time), Math.max(0, duration - 0.05));
  }
  return time;
}

function absoluteFillUrl(url) {
  try { return new URL(url, location.href).href; } catch { return url; }
}

export function fillBlockedByFailure(audio, fill) {
  if (!audio?.dataset?.breakFillFailed || !fill?.audioUrl) return false;
  const failed = audio.dataset.breakFillFailed;
  return failed === fill.audioUrl || failed === absoluteFillUrl(fill.audioUrl);
}

export function releaseFillAudio(audio) {
  if (!audio) return;
  try { audio.pause(); } catch { /* already stopped */ }
  try { audio.removeAttribute?.('src'); } catch { /* mock or detached */ }
  try { audio.load?.(); } catch { /* ignore */ }
  clearBreakFillAudio(audio);
}

export function syncBreakFillAudio(audio, fill, options = {}) {
  if (!audio || !fill || fill.phase !== 'fill' || !isApprovedFillUrl(fill.audioUrl)) return false;
  if (fillBlockedByFailure(audio, fill)) return false;
  const shouldPlay = options.shouldPlay !== false;
  audio.playsInline = true;
  if (audio.setAttribute) audio.setAttribute('playsinline', '');
  audio.loop = !!fill.loop;
  audio.muted = !!options.muted;
  const volume = Math.max(0, Math.min(1, Number(fill.volume) || 0));
  try { audio.volume = volume; } catch { /* iOS may ignore volume until playback starts */ }
  const absolute = absoluteFillUrl(fill.audioUrl);
  if (!audio.dataset.breakFillGuard) {
    audio.dataset.breakFillGuard = '1';
    audio.addEventListener('error', () => {
      const failed = audio.dataset.breakFillUrl || absolute;
      releaseFillAudio(audio);
      audio.dataset.breakFillFailed = failed;
    });
  }
  if (audio.dataset.breakFillUrl !== absolute) {
    if (audio.dataset.breakFillFailed && audio.dataset.breakFillFailed !== absolute) delete audio.dataset.breakFillFailed;
    audio.dataset.breakFillUrl = absolute;
    audio.src = fill.audioUrl;
    audio.load();
    const seekAndPlay = () => {
      const fresh = typeof options.current === 'function' ? options.current() : fill;
      const active = fresh && fresh.phase === 'fill' ? fresh : null;
      if (!active || active.audioUrl !== fill.audioUrl) {
        if (audio.dataset.breakFillUrl === absolute) releaseFillAudio(audio);
        return;
      }
      try { audio.currentTime = clampFillSeek(active, audio.duration); } catch { /* metadata not seekable yet */ }
      audio.loop = !!active.loop;
      try { audio.volume = Math.max(0, Math.min(1, Number(active.volume) || 0)); } catch { /* ignore */ }
      if (shouldPlay && audio.volume > 0.001) audio.play().catch(() => {});
    };
    audio.addEventListener('loadedmetadata', seekAndPlay, { once: true });
    // play() in this turn keeps the listener's LISTEN gesture on iPhone.
    // If the file is still loading when the minute ends, releaseFillAudio
    // drops the src so a late decode cannot start over the next show.
    if (shouldPlay) audio.play().catch(() => {});
    return true;
  }
  if (audio.readyState > 0) {
    const target = clampFillSeek(fill, audio.duration);
    if (Math.abs((audio.currentTime || 0) - target) > 1.5) {
      try { audio.currentTime = target; } catch { /* seek can fail before data arrives */ }
    }
  }
  if (volume <= 0.001) {
    if (!audio.paused) audio.pause();
    return true;
  }
  if (shouldPlay && audio.paused && audio.readyState > 0) audio.play().catch(() => {});
  return true;
}

export function clearBreakFillAudio(audio) {
  if (!audio) return;
  if (audio.dataset) delete audio.dataset.breakFillUrl;
  audio.loop = false;
  try { audio.volume = 1; } catch { /* ignore */ }
}
