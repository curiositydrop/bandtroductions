import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
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

async function createAdminTestStore() {
  const user = auth.currentUser;
  if (!user || !isAdminAccount(user)) return;
  if (!confirm('Create a private admin test store? It will remain hidden from fans until you deliberately activate it.')) return;
  const storeId = 'admin-merch-preview';
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'merchStores', storeId), {
      ownerId: user.uid,
      profileId: storeId,
      bandName: 'BANDtroductions Test Store',
      coverImageUrl: 'IMG_9367.png',
      contactEmail: user.email || '',
      websiteUrl: 'https://bandtroductions.com',
      storeDescription: 'Private admin test storefront for previewing the BANDtroductions Merch Hub.',
      sellerAgreementAccepted: true,
      sellerAgreementAcceptedAt: serverTimestamp(),
      subscriptionStatus: 'pending',
      subscriptionPrice: 15,
      introPrice: 0,
      introMonths: 2,
      renewalPrice: 15,
      offerCode: 'two-months-free-then-15-monthly',
      applicationStatus: 'pending',
      published: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    await batch.commit();
    location.href = `merch.html?manage=${encodeURIComponent(storeId)}#sell-merch`;
  } catch (error) {
    console.error(error);
    alert('The private test store could not be created.');
  }
}

async function deleteStore(store) {
  if (!confirm(`Permanently delete ${store.bandName || 'this merch store'} and all of its product records?`)) return;
  try {
    const productsSnapshot = await getDocs(query(collection(db, 'merchProducts'), where('storeId', '==', store.id)));
    const batch = writeBatch(db);
    productsSnapshot.docs.forEach(product => batch.delete(product.ref));
    batch.delete(doc(db, 'merchStorefronts', store.id));
    batch.delete(doc(db, 'merchStores', store.id));
    await batch.commit();
  } catch (error) {
    console.error(error);
    alert('That merch store could not be deleted.');
  }
}

function render(stores) {
  container.replaceChildren();
  const adminTools = document.createElement('div');
  adminTools.className = 'welcome-actions';
  adminTools.style.marginBottom = '10px';
  if (!stores.some(store => store.id === 'admin-merch-preview')) {
    adminTools.appendChild(actionButton('CREATE ADMIN TEST STORE', '', createAdminTestStore));
  }
  container.appendChild(adminTools);
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
    const isAdminTestStore = store.id === 'admin-merch-preview';
    if (!isAdminTestStore && store.subscriptionStatus !== 'comped') actions.appendChild(actionButton('COMP LAUNCH STORE', 'approve-button', () => setStoreStatus(store, 'comped', 'launch-partner')));
    if (!isAdminTestStore && store.subscriptionStatus !== 'active') actions.appendChild(actionButton('ACTIVATE', '', () => setStoreStatus(store, 'active', 'monthly')));
    if (!isAdminTestStore && store.subscriptionStatus !== 'pending') actions.appendChild(actionButton('MARK PENDING', '', () => setStoreStatus(store, 'pending')));
    if (!isAdminTestStore && store.subscriptionStatus !== 'paused') actions.appendChild(actionButton('PAUSE', '', () => setStoreStatus(store, 'paused')));
    const manage = document.createElement('a');
    manage.className = 'auth-button';
    manage.style.width = 'auto';
    manage.href = `merch.html?manage=${encodeURIComponent(store.id)}#sell-merch`;
    manage.textContent = 'MANAGE / PREVIEW';
    actions.appendChild(manage);
    if (!isAdminTestStore && ['active', 'trialing', 'comped'].includes(store.subscriptionStatus)) {
      const view = document.createElement('a');
      view.className = 'auth-button';
      view.style.width = 'auto';
      view.href = `merch.html?band=${encodeURIComponent(store.id)}`;
      view.textContent = 'VIEW STORE';
      actions.appendChild(view);
    }
    if (!isAdminTestStore) {
      const profile = document.createElement('a');
      profile.className = 'auth-button';
      profile.style.width = 'auto';
      profile.href = `profile.html?id=${encodeURIComponent(store.profileId || store.id)}`;
      profile.textContent = 'VIEW PROFILE';
      actions.appendChild(profile);
    }
    const remove = actionButton('DELETE STORE', '', () => deleteStore(store));
    remove.style.borderColor = '#8f3030';
    remove.style.color = '#ff9b9b';
    actions.appendChild(remove);
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
