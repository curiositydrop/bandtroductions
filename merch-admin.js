import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

const container = document.getElementById('cr-merch-body');
let stopStores = null;
let stopProducts = null;
let allStores = [];
let allProducts = [];

function statusLabel(status) {
  return ({ active: 'Active', trialing: 'Free trial', comped: 'Launch partner', pending: 'Awaiting approval', past_due: 'Past due', paused: 'Paused', canceled: 'Canceled' })[status] || 'Not started';
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

async function setStoreStatus(store, subscriptionStatus, billingPlan = store.billingPlan || '') {
  const verb = subscriptionStatus === 'comped' ? 'comp as a launch-partner store' : subscriptionStatus === 'active' ? 'activate' : subscriptionStatus === 'paused' ? 'pause' : 'mark pending';
  if (!confirm(`${verb[0].toUpperCase()}${verb.slice(1)} the merch store for ${store.bandName || 'this band'}?`)) return;
  try {
    const isPublic = ['active', 'trialing', 'comped'].includes(subscriptionStatus);
    const batch = writeBatch(db);
    batch.update(doc(db, 'merchStores', store.id), {
      subscriptionStatus,
      billingPlan,
      applicationStatus: isPublic ? 'approved' : 'pending',
      published: isPublic,
      adminUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    batch.set(doc(db, 'merchStorefronts', store.id), {
      profileId: store.profileId || store.id,
      bandName: store.bandName || 'BANDtroductions Band',
      coverImageUrl: store.coverImageUrl || '',
      websiteUrl: store.websiteUrl || '',
      storeDescription: store.storeDescription || '',
      published: isPublic,
      updatedAt: serverTimestamp()
    }, { merge: true });
    await batch.commit();
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
    const introMonths = store.introMonths ?? 2;
    const renewalPrice = store.renewalPrice ?? store.subscriptionPrice ?? 15;
    const plan = store.subscriptionStatus === 'comped'
      ? 'No monthly charge'
      : `First ${introMonths} months free, then $${renewalPrice}/month`;
    details.textContent = `${statusLabel(store.subscriptionStatus)} · ${plan} · Profile: ${store.profileId || store.id}`;
    const contact = document.createElement('span');
    contact.style.display = 'block';
    contact.style.marginTop = '5px';
    contact.textContent = `Contact: ${store.contactEmail || 'Not supplied'}${store.websiteUrl ? ` · ${store.websiteUrl}` : ''}`;
    const submittedProducts = allProducts.filter(product => product.storeId === store.id);
    const products = document.createElement('span');
    products.style.display = 'block';
    products.style.marginTop = '5px';
    products.textContent = submittedProducts.length
      ? `${submittedProducts.length} item${submittedProducts.length === 1 ? '' : 's'}: ${submittedProducts.map(product => product.name || 'Unnamed item').join(', ')}`
      : 'No merchandise items submitted yet.';
    const actions = document.createElement('div');
    actions.className = 'welcome-actions';
    actions.style.marginTop = '10px';
    if (store.subscriptionStatus !== 'comped') actions.appendChild(actionButton('COMP LAUNCH STORE', 'approve-button', () => setStoreStatus(store, 'comped', 'launch-partner')));
    if (store.subscriptionStatus !== 'active') actions.appendChild(actionButton('ACTIVATE', '', () => setStoreStatus(store, 'active', 'monthly')));
    if (store.subscriptionStatus !== 'pending') actions.appendChild(actionButton('MARK PENDING', '', () => setStoreStatus(store, 'pending')));
    if (store.subscriptionStatus !== 'paused') actions.appendChild(actionButton('PAUSE', '', () => setStoreStatus(store, 'paused')));
    if (['active', 'trialing', 'comped'].includes(store.subscriptionStatus)) {
      const view = document.createElement('a');
      view.className = 'auth-button';
      view.style.width = 'auto';
      view.href = `merch.html?band=${encodeURIComponent(store.id)}`;
      view.textContent = 'VIEW STORE';
      actions.appendChild(view);
    }
    const profile = document.createElement('a');
    profile.className = 'auth-button';
    profile.style.width = 'auto';
    profile.href = `profile.html?id=${encodeURIComponent(store.profileId || store.id)}`;
    profile.textContent = 'VIEW PROFILE';
    actions.appendChild(profile);
    card.append(name, details, contact, products, actions);
    container.appendChild(card);
  });
}

onAuthStateChanged(auth, user => {
  if (stopStores) stopStores();
  if (stopProducts) stopProducts();
  stopStores = null;
  stopProducts = null;
  if (!isAdminAccount(user)) {
    container.textContent = 'Administrator access is required.';
    return;
  }
  stopStores = onSnapshot(collection(db, 'merchStores'), snapshot => {
    allStores = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    render([...allStores]);
  }, error => {
    console.error(error);
    container.textContent = 'Merch store requests could not be loaded.';
  });
  stopProducts = onSnapshot(collection(db, 'merchProducts'), snapshot => {
    allProducts = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    render([...allStores]);
  }, error => {
    console.error(error);
    container.textContent = 'Merch product submissions could not be loaded.';
  });
});
