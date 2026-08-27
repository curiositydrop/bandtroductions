import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getDatabase, onValue, ref, update } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { auth } from './firebase-dev.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { isAdminAccount } from './admin-access.js';

const firebaseConfig = {
  apiKey: 'AIzaSyApLiiJsKTw1Fp8J3aQatMqiSZoP_6EycE',
  authDomain: 'bandfanwall.firebaseapp.com',
  databaseURL: 'https://bandfanwall-default-rtdb.firebaseio.com',
  projectId: 'bandfanwall',
  storageBucket: 'bandfanwall.firebasestorage.app',
  messagingSenderId: '619241154826',
  appId: '1:619241154826:web:25ddc58eef094e3c0732f3'
};

const body = document.getElementById('cr-venue-leads-body');
let allVenues = [];
let rawVoteRows = {};
let started = false;
let legacyAuth = null;
let venueDatabase = null;
let pendingDeletion = null;

function clean(value) {
  return String(value || '').trim();
}

function campaignUrl(venue) {
  const params = new URLSearchParams({ venue: venue.venueName, venueId: venue.venueId, source: 'venue-qr' });
  if (venue.venueLocation) params.set('venueLocation', venue.venueLocation);
  if (venue.venueProfileUrl) params.set('venueProfile', venue.venueProfileUrl);
  return `discover-original-music.html?${params.toString()}`;
}

function rawVenueId(row) {
  let payload = null;
  try {
    payload = typeof row?.message === 'string' ? JSON.parse(row.message) : row?.message;
  } catch (_) {
    payload = null;
  }
  return clean(payload?.venueId || payload?.venueSlug)
    || globalThis.BTVenueCampaign?.slug(payload?.venueName || row?.name)
    || '';
}

function rawIdsForVenue(venue) {
  const venueIds = new Set([clean(venue.venueId), clean(venue.venueSlug)].filter(Boolean));
  return Object.entries(rawVoteRows)
    .filter(([, row]) => venueIds.has(rawVenueId(row)))
    .map(([id]) => id);
}

function deletionDialog() {
  return document.getElementById('venue-delete-auth');
}

function closeDeletionDialog() {
  const dialog = deletionDialog();
  if (dialog?.open) dialog.close();
  const password = document.getElementById('venue-delete-password');
  const status = document.getElementById('venue-delete-auth-status');
  if (password) password.value = '';
  if (status) status.textContent = '';
}

async function deleteVenueRows(request) {
  if (!venueDatabase || !isAdminAccount(auth.currentUser)) return;
  const ids = request.ids.filter(id => Object.prototype.hasOwnProperty.call(rawVoteRows, id));
  if (!ids.length) {
    alert('No vote records remain for this venue.');
    return;
  }
  request.button.disabled = true;
  request.button.textContent = 'Deleting…';
  try {
    const patch = Object.fromEntries(ids.map(id => [id, null]));
    await update(ref(venueDatabase, 'Bands/__venueCampaigns/comments'), patch);
    alert(`${ids.length} vote record${ids.length === 1 ? '' : 's'} for "${request.venue.venueName}" ${ids.length === 1 ? 'was' : 'were'} permanently deleted.`);
  } catch (error) {
    console.error('Venue vote data could not be deleted:', error);
    const denied = String(error?.code || '').includes('PERMISSION_DENIED');
    alert(denied
      ? 'The legacy database rejected the deletion. No venue data was removed.'
      : 'The venue data could not be deleted. No other records were changed.');
    request.button.disabled = false;
    request.button.textContent = 'Delete Venue Data';
  }
}

async function authorizeAndDelete(request) {
  const currentEmail = clean(auth.currentUser?.email).toLowerCase();
  const legacyEmail = clean(legacyAuth?.currentUser?.email).toLowerCase();
  if (currentEmail && legacyEmail === currentEmail) {
    await deleteVenueRows(request);
    return;
  }
  pendingDeletion = request;
  const dialog = deletionDialog();
  const email = document.getElementById('venue-delete-email');
  if (email) email.textContent = currentEmail;
  if (dialog?.showModal) dialog.showModal();
  else alert('Legacy database authentication is not supported in this browser. No data was removed.');
}

function requestVenueDeletion(venue, button) {
  const ids = rawIdsForVenue(venue);
  if (!ids.length) {
    alert('No raw vote records were found for this venue.');
    return;
  }
  const typed = prompt(`Permanently delete all ${ids.length} raw vote record${ids.length === 1 ? '' : 's'} for "${venue.venueName}"?\n\nThis cannot be undone. Type DELETE to continue:`, '');
  if (typed !== 'DELETE') return;
  authorizeAndDelete({ venue, button, ids });
}

function formatDate(milliseconds) {
  if (!milliseconds) return 'No activity date';
  return new Date(milliseconds).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function metric(value, label) {
  const box = document.createElement('div');
  box.className = 'cr-stat';
  const strong = document.createElement('strong');
  strong.textContent = String(value);
  const span = document.createElement('span');
  span.textContent = label;
  box.append(strong, span);
  return box;
}

function render() {
  if (!body) return;
  const search = document.getElementById('venue-lead-search');
  const term = clean(search?.value).toLowerCase();
  const visible = allVenues.filter(venue => !term || [venue.venueName, venue.venueLocation, ...venue.acts.map(act => act.actName)].join(' ').toLowerCase().includes(term));
  const list = document.getElementById('venue-lead-list');
  if (!list) return;
  list.replaceChildren();
  document.getElementById('venue-lead-count').textContent = `${allVenues.filter(venue => venue.preCampaignDemand > 0).length} fan-generated lead${allVenues.filter(venue => venue.preCampaignDemand > 0).length === 1 ? '' : 's'}`;

  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'cr-empty';
    empty.textContent = allVenues.length ? 'No venue leads match that search.' : 'No venue campaign votes have been recorded yet.';
    list.appendChild(empty);
    return;
  }

  visible.forEach(venue => {
    const row = document.createElement('article');
    row.className = 'cr-row venue-lead-row';
    const top = document.createElement('div');
    top.className = 'cr-row-top';
    const copy = document.createElement('div');
    copy.className = 'cr-copy';
    const name = document.createElement('b');
    name.textContent = venue.venueName;
    const detail = document.createElement('small');
    detail.textContent = [venue.venueLocation, `Latest activity ${formatDate(venue.latestActivity)}`].filter(Boolean).join(' · ');
    copy.append(name, detail);
    const badge = document.createElement('span');
    badge.className = `cr-badge ${venue.preCampaignDemand ? 'warn' : 'good'}`;
    badge.textContent = venue.preCampaignDemand ? 'SALES LEAD' : 'CAMPAIGN';
    top.append(copy, badge);

    const metrics = document.createElement('div');
    metrics.className = 'cr-grid venue-lead-metrics';
    metrics.append(
      metric(venue.preCampaignDemand, 'Pre-campaign demand'),
      metric(venue.campaignParticipants, 'QR participants'),
      metric(venue.uniqueVoters, 'Total unique voters')
    );

    const acts = document.createElement('div');
    acts.className = 'venue-lead-acts';
    const actsTitle = document.createElement('strong');
    actsTitle.textContent = 'Most requested acts';
    const actsList = document.createElement('ol');
    venue.acts.slice(0, 5).forEach(act => {
      const item = document.createElement('li');
      if (act.profileUrl) {
        const link = document.createElement('a');
        link.href = act.profileUrl;
        link.textContent = act.actName;
        item.appendChild(link);
      } else {
        item.append(act.actName);
      }
      item.append(` — ${act.votes} vote${act.votes === 1 ? '' : 's'}`);
      actsList.appendChild(item);
    });
    acts.append(actsTitle, actsList);

    const actions = document.createElement('div');
    actions.className = 'cr-actions';
    const campaign = document.createElement('a');
    campaign.href = campaignUrl(venue);
    campaign.textContent = 'Open Campaign Page';
    actions.appendChild(campaign);
    if (venue.venueProfileUrl) {
      const profile = document.createElement('a');
      profile.href = venue.venueProfileUrl;
      profile.textContent = 'Open Venue Profile';
      actions.appendChild(profile);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = 'Delete Venue Data';
    remove.addEventListener('click', () => requestVenueDeletion(venue, remove));
    actions.appendChild(remove);
    row.append(top, metrics, acts, actions);
    list.appendChild(row);
  });
}

function aggregateForPeriod() {
  const days = Number(document.getElementById('venue-lead-period')?.value || 0);
  if (!days) {
    allVenues = globalThis.BTVenueCampaign?.aggregate(rawVoteRows) || [];
    return;
  }
  const cutoff = Date.now() - (days * 86400000);
  const filtered = Object.fromEntries(Object.entries(rawVoteRows).filter(([, row]) => Number(row?.createdAt || 0) >= cutoff));
  allVenues = globalThis.BTVenueCampaign?.aggregate(filtered) || [];
}

function install() {
  if (!body || document.getElementById('venue-lead-list')) return;
  const section = document.createElement('section');
  section.className = 'cr-section';
  section.innerHTML = `
    <div class="cr-head"><div><p class="cr-kicker">Inbound Sales</p><h2>Venue Leads & Campaign Results</h2><div class="cr-muted">Fans choose the venue and act. Pre-campaign demand identifies who to pitch; QR activity tracks active campaigns. Total voters are deduplicated by device within each venue.</div></div><span id="venue-lead-count" class="cr-inline-count">Loading…</span></div>
    <div class="cr-tools"><input id="venue-lead-search" type="search" placeholder="Search venue, town, or requested act…"><select id="venue-lead-period" aria-label="Venue report period"><option value="0">All time</option><option value="30">Last 30 days</option><option value="60">Last 60 days</option><option value="90">Last 90 days</option></select></div>
    <div id="venue-lead-list" class="cr-list"><div class="cr-empty">Loading venue demand…</div></div>
    <dialog id="venue-delete-auth" class="venue-delete-auth">
      <form id="venue-delete-auth-form">
        <h3>Confirm legacy database access</h3>
        <p>Venue votes are stored in the original BANDtroductions database. Sign in as <strong id="venue-delete-email"></strong> to complete this deletion.</p>
        <label for="venue-delete-password">Password</label>
        <input id="venue-delete-password" type="password" autocomplete="current-password" required>
        <p id="venue-delete-auth-status" class="cr-status" role="status"></p>
        <div class="cr-actions">
          <button type="submit">Sign In & Delete</button>
          <button id="venue-delete-cancel" type="button">Cancel</button>
        </div>
      </form>
    </dialog>`;
  body.appendChild(section);
  const style = document.createElement('style');
  style.textContent = '.venue-lead-metrics{grid-template-columns:repeat(3,minmax(0,1fr));margin-top:4px}.venue-lead-acts{padding:10px;border:1px solid #2e4542;border-radius:10px;background:#090c0c}.venue-lead-acts strong{color:#0ccfbd}.venue-lead-acts ol{margin:7px 0 0;padding-left:22px;color:#d4dbda}.venue-lead-acts li+li{margin-top:5px}.venue-lead-acts a{color:#7afff5}.venue-delete-auth{max-width:430px;border:1px solid #397a74;border-radius:14px;background:#101414;color:#fff;padding:18px}.venue-delete-auth::backdrop{background:rgba(0,0,0,.78)}.venue-delete-auth h3{margin:0 0 8px;color:#0ccfbd}.venue-delete-auth p{color:#b7c0bf;line-height:1.45}.venue-delete-auth label{display:block;margin:12px 0 6px;font-weight:800}.venue-delete-auth input{width:100%;box-sizing:border-box;border:1px solid #4b5a58;border-radius:10px;background:#070909;color:#fff;padding:10px;font:inherit}@media(max-width:560px){.venue-lead-metrics{grid-template-columns:1fr 1fr}.venue-lead-metrics .cr-stat:last-child{grid-column:1/-1}}';
  document.head.appendChild(style);
  document.getElementById('venue-lead-search').addEventListener('input', render);
  document.getElementById('venue-lead-period').addEventListener('change', () => { aggregateForPeriod(); render(); });
  document.getElementById('venue-delete-cancel').addEventListener('click', () => {
    pendingDeletion = null;
    closeDeletionDialog();
  });
  document.getElementById('venue-delete-auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const request = pendingDeletion;
    const password = document.getElementById('venue-delete-password');
    const status = document.getElementById('venue-delete-auth-status');
    const submit = event.submitter;
    if (!request || !password?.value || !legacyAuth || !auth.currentUser?.email) return;
    submit.disabled = true;
    status.textContent = 'Checking access…';
    try {
      await signInWithEmailAndPassword(legacyAuth, auth.currentUser.email, password.value);
      pendingDeletion = null;
      closeDeletionDialog();
      await deleteVenueRows(request);
    } catch (error) {
      console.error('Legacy database sign-in failed:', error);
      status.textContent = 'That sign-in did not work. No data was removed.';
    } finally {
      submit.disabled = false;
    }
  });
}

function start() {
  if (started) return;
  started = true;
  install();
  const app = getApps().find(candidate => candidate.name === 'venue-leads-admin') || initializeApp(firebaseConfig, 'venue-leads-admin');
  venueDatabase = getDatabase(app);
  legacyAuth = getAuth(app);
  onValue(ref(venueDatabase, 'Bands/__venueCampaigns/comments'), snapshot => {
    rawVoteRows = snapshot.val() || {};
    aggregateForPeriod();
    render();
  }, error => {
    console.error('Venue lead data could not be loaded:', error);
    const list = document.getElementById('venue-lead-list');
    if (list) list.innerHTML = '<div class="cr-empty">Venue lead data could not be loaded.</div>';
  });
}

onAuthStateChanged(auth, user => {
  if (isAdminAccount(user)) start();
});
