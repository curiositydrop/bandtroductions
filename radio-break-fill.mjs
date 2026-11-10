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

// Active ads in air order. An invalid list (3 ads, overfull configured
// durations, bad metadata) is not turned into a shorter lineup.
export function configuredBreakAds(config) {
  if (!config || config.active !== true) return { ok: true, ads: [] };
  if (Array.isArray(config.ads)) {
    const plan = planCommercialBreak(config.ads);
    if (!plan.ok) return { ok: false, reason: plan.reason, ads: [] };
    return { ok: true, ads: plan.slots };
  }
  if (!(config.audioUrl || config.videoUrl || config.posterUrl)) return { ok: true, ads: [] };
  return {
    ok: true,
    ads: [{ ...config, durationSeconds: Math.max(1, Math.min(BREAK_LENGTH_SECONDS, Number(config.durationSeconds) || 40)) }]
  };
}

// File length is the playable length. Configured duration must not end a longer
// file early. A file shorter than its metadata plays once and does not loop.
// Unknown or failed measurement does not release the ad to fill.
// If the real lengths cannot finish inside 60s, full play and the next-show
// boundary cannot both happen: the result says so and does not invent a cut lineup.
export function planPaidAdPlayback({ ads = [], actualDurations = [], breakOffset, breakSeconds = BREAK_LENGTH_SECONDS } = {}) {
  const offset = Number(breakOffset);
  if (!Number.isFinite(offset)) return { phase: 'none', reason: 'bad-offset', promiseFullPlay: false, allowFill: false, loop: false };
  if (offset < 0 || offset >= breakSeconds) return { phase: 'break-over', reason: 'next-show', promiseFullPlay: true, allowFill: false, hardStop: breakSeconds, loop: false };
  if (ads.length > 2) return { phase: 'rejected', reason: 'too-many-ads', promiseFullPlay: false, allowFill: false, loop: false };
  if (!ads.length) return { phase: 'no-ads', reason: 'zero-ads', promiseFullPlay: true, allowFill: true, fillStartsAt: 0, loop: false };

  const playable = [];
  let unresolved = false;
  for (let i = 0; i < ads.length; i++) {
    const actual = actualDurations[i];
    if (!ads[i]?.audioUrl) {
      playable.push(Number(ads[i].durationSeconds));
      continue;
    }
    if (actual === 'failed' || actual == null || !Number.isFinite(Number(actual)) || Number(actual) <= 0) {
      unresolved = true;
      playable.push(null);
      continue;
    }
    playable.push(Number(actual));
  }

  if (unresolved) {
    let cursor = 0;
    for (let i = 0; i < ads.length; i++) {
      if (playable[i] == null) {
        if (offset >= cursor) {
          return { phase: 'ad', reason: actualDurations[i] === 'failed' ? 'duration-failed' : 'duration-pending', promiseFullPlay: false, allowFill: false, adIndex: i, ad: ads[i], localOffset: Math.max(0, offset - cursor), loop: false };
        }
      } else if (offset < cursor + playable[i]) {
        return { phase: 'ad', reason: 'playing', promiseFullPlay: false, allowFill: false, adIndex: i, ad: ads[i], localOffset: offset - cursor, loop: false };
      } else cursor += playable[i];
    }
    return { phase: 'ad', reason: 'duration-pending', promiseFullPlay: false, allowFill: false, adIndex: ads.length - 1, ad: ads[ads.length - 1], localOffset: 0, loop: false };
  }

  const total = playable.reduce((sum, n) => sum + n, 0);
  if (total > breakSeconds + 1e-6) {
    let cursor = 0;
    for (let i = 0; i < ads.length; i++) {
      const end = cursor + playable[i];
      if (offset < end) {
        return { phase: 'ad', reason: 'overfull-actual', ok: false, promiseFullPlay: false, allowFill: false, adIndex: i, ad: ads[i], localOffset: offset - cursor, hardStop: breakSeconds, loop: false };
      }
      cursor = end;
    }
    return { phase: 'break-over', reason: 'overfull-actual', ok: false, promiseFullPlay: false, allowFill: false, hardStop: breakSeconds, loop: false };
  }

  let cursor = 0;
  for (let i = 0; i < ads.length; i++) {
    const end = cursor + playable[i];
    if (offset < end - 1e-9) {
      const configured = Number(ads[i].durationSeconds);
      return {
        phase: 'ad',
        reason: playable[i] + 1e-3 < configured ? 'file-shorter-than-metadata' : 'playing',
        ok: true,
        promiseFullPlay: true,
        allowFill: false,
        adIndex: i,
        ad: ads[i],
        localOffset: offset - cursor,
        playable: playable[i],
        fillStartsAt: total,
        loop: false
      };
    }
    cursor = end;
  }
  return { phase: 'ads-complete', reason: 'files-finished', ok: true, promiseFullPlay: true, allowFill: true, fillStartsAt: total, loop: false };
}

// Save gate. Does not write. A measured total over 60s is rejected whole.
// A file more than a second longer than its typed duration is rejected rather
// than stored short. New Leaf's 18.005s file against an integer 18 is inside
// that one-second tolerance and is not a failed save.
export function assessAdPublish({ ads, actualDurations } = {}) {
  const configured = planCommercialBreak(ads);
  if (!configured.ok) return { ok: false, reason: configured.reason, promiseFullPlay: false };
  if (!Array.isArray(actualDurations) || actualDurations.length < configured.slots.length) return { ok: false, reason: 'duration-unconfirmed', promiseFullPlay: false };
  const actuals = [];
  for (let i = 0; i < configured.slots.length; i++) {
    const actual = actualDurations[i];
    if (actual === 'failed' || !Number.isFinite(Number(actual)) || Number(actual) <= 0) return { ok: false, reason: 'duration-unconfirmed', promiseFullPlay: false, index: i };
    actuals.push(Number(actual));
  }
  const total = actuals.reduce((sum, n) => sum + n, 0);
  if (total > BREAK_LENGTH_SECONDS + 1e-6) return { ok: false, reason: 'overfull-actual', promiseFullPlay: false, total };
  for (let i = 0; i < actuals.length; i++) {
    const typed = Number(configured.slots[i].durationSeconds);
    if (actuals[i] > typed + 1) return { ok: false, reason: 'metadata-shorter-than-file', promiseFullPlay: false, index: i, actual: actuals[i], configured: typed };
  }
  return { ok: true, reason: 'fits', promiseFullPlay: true, total };
}

const measuredAdDurations = new Map();
const failedAdDurations = new Set();
const primingAdDurations = new Set();

export function noteMeasuredAdDuration(url, seconds) {
  if (!url) return;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds === Infinity) {
    failedAdDurations.add(url);
    return;
  }
  failedAdDurations.delete(url);
  measuredAdDurations.set(url, seconds);
}

export function actualDurationFor(url) {
  if (!url) return null;
  if (failedAdDurations.has(url)) return 'failed';
  return measuredAdDurations.has(url) ? measuredAdDurations.get(url) : null;
}

export function primeAdDuration(url) {
  if (!url || measuredAdDurations.has(url) || failedAdDurations.has(url) || primingAdDurations.has(url)) return;
  if (typeof Audio === 'undefined') return;
  primingAdDurations.add(url);
  const probe = new Audio();
  probe.preload = 'metadata';
  probe.playsInline = true;
  probe.addEventListener('loadedmetadata', () => { noteMeasuredAdDuration(url, probe.duration); primingAdDurations.delete(url); }, { once: true });
  probe.addEventListener('error', () => { noteMeasuredAdDuration(url, NaN); primingAdDurations.delete(url); }, { once: true });
  probe.src = url;
}

export function holdPaidAd(breakObject, run) {
  if (!breakObject || !run || run.phase !== 'ad') {
    if (breakObject && run?.phase === 'ads-complete') return { ...breakObject, clipPlaying: false };
    return breakObject;
  }
  const ad = run.ad || {};
  const sameFile = !ad.audioUrl || ad.audioUrl === breakObject.audioUrl;
  return {
    ...breakObject,
    audioUrl: ad.audioUrl || breakObject.audioUrl,
    videoUrl: ad.videoUrl ?? breakObject.videoUrl,
    posterUrl: ad.posterUrl ?? breakObject.posterUrl,
    sponsorName: ad.sponsorName || breakObject.sponsorName,
    clickUrl: ad.clickUrl || breakObject.clickUrl,
    durationSeconds: run.playable || breakObject.durationSeconds,
    offsetSeconds: run.localOffset,
    clipPlaying: true,
    key: sameFile ? breakObject.key : `${breakObject.key}|file${run.adIndex}`
  };
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
  previewNextStart = 0,
  actualAdSeconds = null
} = {}) {
  if (!stationEnabled) return null;
  const source = resolveBreakFill(fillConfig);
  if (!source) return null;
  let offset = null;
  let adSeconds = 0;
  let meta = null;
  if (previewOffset != null) {
    offset = previewOffset;
    adSeconds = actualAdSeconds == null || !Number.isFinite(Number(actualAdSeconds)) ? (Number(previewAdSeconds) || 0) : Number(actualAdSeconds);
    meta = { endedShow: 'Test', nextShow: 'Back to the music', nextStartMinutes: previewNextStart };
  } else if (gap) {
    offset = gap.offsetSecondsExact;
    adSeconds = actualAdSeconds == null || !Number.isFinite(Number(actualAdSeconds)) ? paidAdSeconds(sponsorConfig) : Number(actualAdSeconds);
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
