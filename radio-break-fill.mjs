// Shared-clock bed for the unused tail of a 60-second between-show break.
// Paid ads keep the front of the minute. This module only describes the fill.
// It does not write Firestore or Storage and it does not start audio by itself.
import { planCommercialBreak } from './radio-break-planner.mjs';

export const BREAK_LENGTH_SECONDS = 60;
export const FILL_FADE_SECONDS = 1.25;
export const DEFAULT_BREAK_FILL_URL = '/assets/radio/break-fill-default.wav';
export const DEFAULT_BREAK_FILL_SECONDS = 12;
export const DEFAULT_BREAK_FILL_LABEL = 'BANDtroductions station bed';

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

// Missing config means "use the built-in bed". enabled:false turns the bed off
// and leaves today's post-ad silence (or the rotation, when no ad is scheduled).
export function resolveBreakFill(stored) {
  if (stored && typeof stored === 'object' && stored.enabled === false) return null;
  const custom = stored && typeof stored.audioUrl === 'string' ? stored.audioUrl.trim() : '';
  if (custom) {
    const duration = Number(stored.durationSeconds);
    return {
      enabled: true,
      audioUrl: custom,
      durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
      label: String(stored.label || 'Station bed').slice(0, 120),
      source: 'custom'
    };
  }
  return {
    enabled: true,
    audioUrl: DEFAULT_BREAK_FILL_URL,
    durationSeconds: DEFAULT_BREAK_FILL_SECONDS,
    label: DEFAULT_BREAK_FILL_LABEL,
    source: 'default'
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
  if (offset < ads) {
    return { phase: 'ad', adSeconds: ads, fillStartsAt: ads, reason: 'ad-still-playing' };
  }
  const elapsed = offset - ads;
  const remaining = breakSeconds - offset;
  const window = breakSeconds - ads;
  const clip = Number(fill.durationSeconds);
  const known = Number.isFinite(clip) && clip > 0.05;
  // Loop when the clip cannot cover the leftover window. The default bed is
  // written to loop cleanly. A custom clip uses the same single audio element
  // (loop=true) so iPhone keeps the one unlocked player; the clock fade below
  // still ends the break. A clip longer than the window does not loop: every
  // listener seeks to the same elapsed point and fades out at the minute.
  const loop = !known || clip < window - 0.05;
  let clipOffset = elapsed;
  if (known) clipOffset = loop ? elapsed % clip : Math.min(elapsed, Math.max(0, clip - 0.05));
  const volume = remaining <= fadeSeconds ? Math.max(0, remaining / fadeSeconds) : 1;
  return {
    phase: 'fill',
    audioUrl: fill.audioUrl,
    label: fill.label || DEFAULT_BREAK_FILL_LABEL,
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

export function syncBreakFillAudio(audio, fill, options = {}) {
  if (!audio || !fill || fill.phase !== 'fill' || !fill.audioUrl) return false;
  const shouldPlay = options.shouldPlay !== false;
  audio.playsInline = true;
  if (audio.setAttribute) audio.setAttribute('playsinline', '');
  audio.loop = !!fill.loop;
  audio.muted = !!options.muted;
  const volume = Math.max(0, Math.min(1, Number(fill.volume) || 0));
  try { audio.volume = volume; } catch { /* iOS may ignore volume until playback starts */ }
  let absolute = fill.audioUrl;
  try { absolute = new URL(fill.audioUrl, location.href).href; } catch { /* relative URL in non-browser tests */ }
  if (audio.dataset?.breakFillUrl !== absolute) {
    if (audio.dataset) audio.dataset.breakFillUrl = absolute;
    audio.src = fill.audioUrl;
    audio.load();
    const seekAndPlay = () => {
      const fresh = typeof options.current === 'function' ? options.current() : null;
      const active = fresh && fresh.phase === 'fill' ? fresh : fill;
      try { audio.currentTime = clampFillSeek(active, audio.duration); } catch { /* metadata not seekable yet */ }
      audio.loop = !!active.loop;
      try { audio.volume = Math.max(0, Math.min(1, Number(active.volume) || 0)); } catch { /* ignore */ }
      if (shouldPlay && audio.volume > 0.001) audio.play().catch(() => {});
    };
    audio.addEventListener('loadedmetadata', seekAndPlay, { once: true });
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
  if (shouldPlay && audio.paused) audio.play().catch(() => {});
  return true;
}

export function clearBreakFillAudio(audio) {
  if (!audio) return;
  if (audio.dataset) delete audio.dataset.breakFillUrl;
  audio.loop = false;
  try { audio.volume = 1; } catch { /* ignore */ }
}
