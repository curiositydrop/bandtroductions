import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

const container = document.getElementById('cr-merch-body');
let stopStores = null;

function statusLabel(status) {
  return ({ active: 'Active', trialing: 'Trialing', pending: 'Payment pending', past_due: 'Past due', paused: 'Paused', canceled: 'Canceled' })[status] || 'Not started';
}

function actionButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `auth-button ${className || ''}`.trim();
  button.textContent = label;
  button.style.width = 'auto';
  button.addEventListener('click', handler);
  return button;
}

async function setStoreStatus(store, subscriptionStatus) {
  const verb = subscriptionStatus === 'active' ? 'activate' : subscriptionStatus === 'paused' ? 'pause' : 'mark pending';
  if (!confirm(`${verb[0].toUpperCase()}${verb.slice(1)} the merch store for ${store.bandName || 'this band'}?`)) return;
  try {
    await updateDoc(doc(db, 'merchStores', store.id), {
      subscriptionStatus,
      published: subscriptionStatus === 'active' || subscriptionStatus === 'trialing',
      adminUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error(error);
    alert('That merch store could not be updated.');
  }
}

function render(stores) {
  container.replaceChildren();
  if (!stores.length) {
    const empty = document.createElement('p');
    empty.className = 'welcome-help';
    empty.textContent = 'No bands have requested a merch store yet.';
    container.appendChild(empty);
    return;
  }

  stores.sort((a, b) => {
    if (a.subscriptionStatus === 'pending' && b.subscriptionStatus !== 'pending') return -1;
    if (b.subscriptionStatus === 'pending' && a.subscriptionStatus !== 'pending') return 1;
    return (a.bandName || '').localeCompare(b.bandName || '');
  }).forEach(store => {
    const card = document.createElement('article');
    card.className = 'control-card';
    card.style.minHeight = '0';
    const name = document.createElement('strong');
    name.textContent = store.bandName || 'Unnamed Band Store';
    const details = document.createElement('span');
    details.textContent = `${statusLabel(store.subscriptionStatus)} · $${store.subscriptionPrice || 15}/month · Profile: ${store.profileId || store.id}`;
    const actions = document.createElement('div');
    actions.className = 'welcome-actions';
    actions.style.marginTop = '10px';
    if (store.subscriptionStatus !== 'active') actions.appendChild(actionButton('ACTIVATE', 'approve-button', () => setStoreStatus(store, 'active')));
    if (store.subscriptionStatus !== 'pending') actions.appendChild(actionButton('MARK PENDING', '', () => setStoreStatus(store, 'pending')));
    if (store.subscriptionStatus !== 'paused') actions.appendChild(actionButton('PAUSE', '', () => setStoreStatus(store, 'paused')));
    const view = document.createElement('a');
    view.className = 'auth-button';
    view.style.width = 'auto';
    view.href = `merch.html?band=${encodeURIComponent(store.id)}`;
    view.textContent = 'VIEW STORE';
    actions.appendChild(view);
    card.append(name, details, actions);
    container.appendChild(card);
  });
}

onAuthStateChanged(auth, user => {
  if (stopStores) stopStores();
  stopStores = null;
  if (!isAdminAccount(user)) {
    container.textContent = 'Administrator access is required.';
    return;
  }
  stopStores = onSnapshot(collection(db, 'merchStores'), snapshot => {
    render(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, error => {
    console.error(error);
    container.textContent = 'Merch store requests could not be loaded.';
  });
});
