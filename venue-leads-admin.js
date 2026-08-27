import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getDatabase, onValue, ref } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { auth } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
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

function clean(value) {
  return String(value || '').trim();
}

function campaignUrl(venue) {
  const params = new URLSearchParams({ venue: venue.venueName, venueId: venue.venueId, source: 'venue-qr' });
  if (venue.venueLocation) params.set('venueLocation', venue.venueLocation);
  if (venue.venueProfileUrl) params.set('venueProfile', venue.venueProfileUrl);
  return `discover-original-music.html?${params.toString()}`;
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
    <div id="venue-lead-list" class="cr-list"><div class="cr-empty">Loading venue demand…</div></div>`;
  body.appendChild(section);
  const style = document.createElement('style');
  style.textContent = '.venue-lead-metrics{grid-template-columns:repeat(3,minmax(0,1fr));margin-top:4px}.venue-lead-acts{padding:10px;border:1px solid #2e4542;border-radius:10px;background:#090c0c}.venue-lead-acts strong{color:#0ccfbd}.venue-lead-acts ol{margin:7px 0 0;padding-left:22px;color:#d4dbda}.venue-lead-acts li+li{margin-top:5px}.venue-lead-acts a{color:#7afff5}@media(max-width:560px){.venue-lead-metrics{grid-template-columns:1fr 1fr}.venue-lead-metrics .cr-stat:last-child{grid-column:1/-1}}';
  document.head.appendChild(style);
  document.getElementById('venue-lead-search').addEventListener('input', render);
  document.getElementById('venue-lead-period').addEventListener('change', () => { aggregateForPeriod(); render(); });
}

function start() {
  if (started) return;
  started = true;
  install();
  const app = getApps().find(candidate => candidate.name === 'venue-leads-admin') || initializeApp(firebaseConfig, 'venue-leads-admin');
  const database = getDatabase(app);
  onValue(ref(database, 'Bands/__venueCampaigns/comments'), snapshot => {
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
