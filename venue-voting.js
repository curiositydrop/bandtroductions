import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getDatabase, push, ref } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyApLiiJsKTw1Fp8J3aQatMqiSZoP_6EycE',
  authDomain: 'bandfanwall.firebaseapp.com',
  databaseURL: 'https://bandfanwall-default-rtdb.firebaseio.com',
  projectId: 'bandfanwall',
  storageBucket: 'bandfanwall.firebasestorage.app',
  messagingSenderId: '619241154826',
  appId: '1:619241154826:web:25ddc58eef094e3c0732f3'
};

const params = new URLSearchParams(location.search);
const venueName = clean(params.get('venue'));
const voteButton = document.getElementById('discover-vote-button');
const voteStatus = document.getElementById('discover-vote-status');
const voteHelp = document.getElementById('discover-vote-help');
const venueSlug = slug(venueName);
const selectionKey = venueSlug ? `bandtroductions_venue_vote_${venueSlug}` : '';
const voterKey = 'bandtroductions_venue_voter_id';
let currentAct = null;
let saving = false;
let memorySelection = null;
let memoryVoterId = '';

function clean(value) {
  return String(value || '').trim();
}

function slug(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (_) {
    return false;
  }
}

function readSelection() {
  if (memorySelection) return memorySelection;
  if (!selectionKey) return null;
  try {
    const saved = JSON.parse(readStorage(selectionKey) || 'null');
    return saved?.actId && saved?.actName ? saved : null;
  } catch (_) {
    return null;
  }
}

function voterId() {
  if (memoryVoterId) return memoryVoterId;
  const existing = readStorage(voterKey);
  if (existing && /^[a-zA-Z0-9_-]{12,80}$/.test(existing)) {
    memoryVoterId = existing;
    return memoryVoterId;
  }
  const generated = globalThis.crypto?.randomUUID?.().replace(/-/g, '')
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  writeStorage(voterKey, generated);
  memoryVoterId = generated;
  return memoryVoterId;
}

function setStatus(message = '', state = '') {
  voteStatus.textContent = message;
  voteStatus.classList.toggle('is-success', state === 'success');
  voteStatus.classList.toggle('is-error', state === 'error');
  if (state !== 'error') delete voteStatus.dataset.errorCode;
}

function updateButton(preserveStatus = false) {
  if (!venueName || !currentAct) {
    voteButton.hidden = true;
    return;
  }

  const selection = readSelection();
  const isCurrentVote = selection?.actId === currentAct.actId;
  voteButton.hidden = false;
  voteButton.disabled = saving || isCurrentVote;

  if (saving) {
    voteButton.textContent = 'Saving your vote…';
  } else if (isCurrentVote) {
    voteButton.textContent = `Your vote: ${currentAct.actName} ✓`;
  } else if (selection) {
    voteButton.textContent = `Change vote to ${currentAct.actName}`;
  } else {
    voteButton.textContent = `Vote for ${currentAct.actName} to play at ${venueName}`;
  }

  if (!saving && !preserveStatus) {
    if (isCurrentVote) {
      setStatus(`You voted for ${currentAct.actName}. Open another act if you want to change it.`, 'success');
    } else if (selection) {
      setStatus(`Your current vote is ${selection.actName}.`);
    } else {
      setStatus('One vote per person for this venue. You can change it later.');
    }
  }
}

async function saveVote() {
  if (!currentAct || !venueSlug || saving) return;
  const previousSelection = readSelection();
  if (previousSelection?.actId === currentAct.actId) return;

  saving = true;
  updateButton();

  try {
    const app = getApps().find(candidate => candidate.options?.projectId === firebaseConfig.projectId)
      || initializeApp(firebaseConfig, 'venue-voting');
    const database = getDatabase(app);
    const deviceId = voterId();
    const submittedAct = { ...currentAct };
    const now = Date.now();
    const votesRef = ref(database, 'Bands/__venueCampaigns/comments');
    await push(votesRef, {
      name: venueName.slice(0, 120),
      message: JSON.stringify({
        venueSlug,
        voterId: deviceId,
        actId: submittedAct.actId,
        actName: submittedAct.actName.slice(0, 120),
        profileUrl: submittedAct.profileUrl.slice(0, 300),
        previousActId: clean(previousSelection?.actId)
      }),
      createdAt: now
    });

    memorySelection = {
      actId: submittedAct.actId,
      actName: submittedAct.actName
    };
    writeStorage(selectionKey, JSON.stringify(memorySelection));
    setStatus(previousSelection
      ? `Vote changed to ${submittedAct.actName}! 🤘`
      : `Vote counted for ${submittedAct.actName}! 🤘`, 'success');
    window.dispatchEvent(new CustomEvent('bandtroductions:venue-vote-saved', {
      detail: { venueName, venueSlug, ...submittedAct }
    }));
  } catch (error) {
    console.error('Venue vote could not be saved:', error);
    voteStatus.dataset.errorCode = clean(error?.code || error?.message).slice(0, 160);
    setStatus('Your vote could not be saved. Please try again.', 'error');
  } finally {
    saving = false;
    updateButton(true);
  }
}

if (venueName) {
  voteHelp.textContent = `Tap a video to watch and vote for who should play at ${venueName}.`;
  window.addEventListener('bandtroductions:venue-video-opened', event => {
    const detail = event.detail || {};
    const actName = clean(detail.artistName);
    if (!actName) return;
    currentAct = {
      actId: slug(detail.profileUrl || actName || detail.videoId),
      actName,
      profileUrl: clean(detail.profileUrl)
    };
    updateButton();
  });
  voteButton.addEventListener('click', saveVote);
} else {
  voteButton.hidden = true;
  voteHelp.textContent = 'Tap a video to watch and explore the artist.';
}
