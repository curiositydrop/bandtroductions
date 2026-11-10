import { planBreakFill, FILL_FADE_SECONDS } from './radio-break-fill.mjs?v=20261110-fill-off';

const AD_URL = '/assets/ads/new-leaf-ad.m4a';
// Isolated preview tone. The station player never receives this URL.
function testToneUrl(seconds = 12) {
  const rate = 8000;
  const count = rate * seconds;
  const bytes = 44 + count * 2;
  const buffer = new ArrayBuffer(bytes);
  const view = new DataView(buffer);
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, bytes - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const sample = Math.sin(2 * Math.PI * 440 * (i / rate)) * 0.2;
    view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}
const fill = { enabled: true, audioUrl: testToneUrl(12), durationSeconds: 12, label: 'Simulated test tone', source: 'preview-test' };
const scenarios = {
  'sim-ads-0': { adSeconds: 0, note: 'No paid ad. The bed covers the whole minute.' },
  'sim-ads-1': { adSeconds: 18, note: 'One 18-second ad plays first. The bed starts at 18s.' },
  'sim-ads-2': { adSeconds: 45, note: 'Two ads (20s + 25s) play first. The bed starts at 45s.' },
  'sim-ads-full': { adSeconds: 60, note: 'Ads use the full minute. No bed plays.' }
};
const audio = document.getElementById('sim-audio');
audio.setAttribute('playsinline', '');
const slider = document.getElementById('sim-slider');
const playButton = document.getElementById('sim-play');
let adSeconds = 0;
let activeScenario = 'sim-ads-0';
let running = false;
let originOffset = 0;
let originTime = 0;

function offsetNow() {
  if (!running) return Number(slider.value);
  return originOffset + (performance.now() - originTime) / 1000;
}

function paint(offset) {
  const clamped = Math.max(0, Math.min(60, offset));
  const plan = planBreakFill({ breakOffsetSeconds: Math.min(clamped, 59.999), adSeconds, fill });
  const ended = offset >= 60;
  const phase = ended ? 'show' : plan.phase === 'fill' ? 'fill' : plan.phase === 'ad' ? 'ad' : 'ads';
  const phaseEl = document.getElementById('sim-phase');
  const clockEl = document.getElementById('sim-clock');
  const clipEl = document.getElementById('sim-clip');
  const volumeEl = document.getElementById('sim-volume');
  phaseEl.dataset.phase = phase;
  phaseEl.textContent = phase === 'show' ? 'Next show' : phase === 'fill' ? 'Fill bed' : phase === 'ad' ? 'Paid ad' : 'No fill';
  clockEl.dataset.offset = String(ended ? 60 : clamped);
  clockEl.textContent = `${(ended ? 60 : clamped).toFixed(1)}s`;
  const clip = phase === 'fill' ? plan.clipOffsetSeconds : 0;
  const volume = phase === 'fill' ? plan.volume : phase === 'show' ? 0 : 1;
  clipEl.dataset.clip = String(clip);
  clipEl.textContent = phase === 'fill' ? `${clip.toFixed(1)}s` : '—';
  volumeEl.dataset.volume = String(volume);
  volumeEl.textContent = `${Math.round(volume * 100)}%`;
  document.getElementById('sim-slider-label').textContent = `${(ended ? 60 : clamped).toFixed(1)}s`;
  const scenario = scenarios[activeScenario];
  document.getElementById('sim-note').textContent = ended
    ? 'Break ended. The bed is stopped so the next show can start.'
    : scenario.note + (phase === 'fill' && plan.fade ? ` Fading out (${FILL_FADE_SECONDS}s, shared clock).` : '');
  return { phase, plan, volume };
}

function applyAudio(state, offset) {
  if (state.phase === 'show' || state.phase === 'ads') {
    audio.pause();
    try { audio.volume = 1; } catch { /* ignore */ }
    return;
  }
  const src = state.phase === 'ad' ? AD_URL : fill.audioUrl;
  const absolute = new URL(src, location.href).href;
  const seek = state.phase === 'fill' ? state.plan.clipOffsetSeconds : Math.min(offset, Math.max(0, adSeconds - 0.05));
  audio.loop = state.phase === 'fill' && !!state.plan.loop;
  try { audio.volume = state.volume; } catch { /* ignore */ }
  const seekNow = () => {
    try { audio.currentTime = Math.min(seek, Math.max(0, (audio.duration || seek + 1) - 0.05)); } catch { /* not seekable yet */ }
  };
  if (audio.src !== absolute) {
    audio.src = src;
    audio.addEventListener('loadedmetadata', seekNow, { once: true });
  } else if (audio.readyState > 0 && Math.abs((audio.currentTime || 0) - seek) > 0.35) {
    seekNow();
  }
}

function tick() {
  const offset = offsetNow();
  if (!running) return;
  const state = paint(offset);
  applyAudio(state, offset);
  if (offset >= 60) {
    running = false;
    playButton.textContent = 'Play from here';
    audio.pause();
    slider.value = '60';
    return;
  }
  requestAnimationFrame(tick);
}

function selectScenario(id) {
  running = false;
  audio.pause();
  adSeconds = scenarios[id].adSeconds;
  activeScenario = id;
  for (const buttonId of Object.keys(scenarios)) {
    document.getElementById(buttonId).setAttribute('aria-pressed', String(buttonId === id));
  }
  playButton.textContent = 'Play from here';
  const state = paint(Number(slider.value));
  applyAudio(state, Number(slider.value));
}

for (const id of Object.keys(scenarios)) {
  document.getElementById(id).addEventListener('click', () => selectScenario(id));
}
slider.addEventListener('input', () => {
  running = false;
  playButton.textContent = 'Play from here';
  const state = paint(Number(slider.value));
  if (state.phase !== 'fill' && state.phase !== 'ad') audio.pause();
});
document.getElementById('sim-apply').addEventListener('click', () => {
  running = false;
  playButton.textContent = 'Play from here';
  const offset = Number(slider.value);
  const state = paint(offset);
  applyAudio(state, offset);
  if (state.phase === 'ad' || state.phase === 'fill') {
    audio.play().catch(error => {
      document.getElementById('sim-note').textContent = 'Tap again to start audio: ' + error.message;
    });
  }
});
playButton.addEventListener('click', () => {
  if (running) {
    running = false;
    audio.pause();
    playButton.textContent = 'Play from here';
    slider.value = String(Math.min(60, offsetNow()));
    paint(Number(slider.value));
    return;
  }
  originOffset = Number(slider.value);
  originTime = performance.now();
  running = true;
  playButton.textContent = 'Pause';
  const state = paint(originOffset);
  applyAudio(state, originOffset);
  if (state.phase === 'ad' || state.phase === 'fill') audio.play().catch(() => {});
  requestAnimationFrame(tick);
});
selectScenario('sim-ads-0');
