import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, onSnapshot, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

const container = document.getElementById('cr-business-body');
let stopStores = null;

function actionButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `auth-button ${className || ''}`.trim();
  button.textContent = label;
  button.style.width = 'auto';
  button.addEventListener('click', handler);
  return button;
}

function statusLabel(store) {
  if (store.subscriptionStatus === 'comped') return 'Launch partner · Billing exempt';
  if (store.subscriptionStatus === 'active') return 'Active · $35/month';
  if (store.subscriptionStatus === 'paused') return 'Paused';
  return 'Pending · Subscription not confirmed';
}

function publicStoreData(store, published, featured = store.featured === true) {
  return {
    businessName: store.businessName || 'Music Business',
    category: store.category || 'Music Service',
    contactEmail: store.contactEmail || '',
    location: store.location || '',
    websiteUrl: store.websiteUrl || '',
    tagline: store.tagline || '',
    businessDescription: store.businessDescription || '',
    memberOffer: store.memberOffer || '',
    logoImageUrl: store.logoImageUrl || '',
    featured,
    published,
    updatedAt: serverTimestamp()
  };
}

async function setStatus(store, subscriptionStatus, billingPlan = store.billingPlan || 'monthly') {
  const verb = subscriptionStatus === 'comped' ? 'comp' : subscriptionStatus === 'active' ? 'activate' : subscriptionStatus === 'paused' ? 'pause' : 'mark pending';
  if (!confirm(`${verb[0].toUpperCase()}${verb.slice(1)} ${store.businessName || 'this business'}?`)) return;
  const published = subscriptionStatus === 'active' || subscriptionStatus === 'comped';
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'businessStores', store.id), {
      subscriptionStatus,
      billingPlan,
      applicationStatus: published ? 'approved' : 'pending',
      published,
      adminPaused: subscriptionStatus === 'paused',
      updatedAt: serverTimestamp()
    });
    batch.set(doc(db, 'merchStorefronts', store.id), { ...publicStoreData(store, published), storeKind: 'business' }, { merge: true });
    await batch.commit();
  } catch (error) {
    console.error(error);
    alert('That business storefront could not be updated.');
  }
}

async function toggleFeatured(store) {
  const featured = store.featured !== true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'businessStores', store.id), { featured, updatedAt: serverTimestamp() });
    batch.set(doc(db, 'merchStorefronts', store.id), { ...publicStoreData(store, store.published === true, featured), storeKind: 'business' }, { merge: true });
    await batch.commit();
  } catch (error) {
    console.error(error);
    alert('That featured placement could not be changed.');
  }
}

async function deleteStore(store) {
  if (!confirm(`Delete the Business Hub storefront for ${store.businessName || 'this business'}? This cannot be undone.`)) return;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'merchStorefronts', store.id));
    batch.delete(doc(db, 'businessStores', store.id));
    await batch.commit();
  } catch (error) {
    console.error(error);
    alert('That business storefront could not be deleted.');
  }
}

function render(stores) {
  container.replaceChildren();
  if (!stores.length) {
    const empty = document.createElement('p');
    empty.className = 'welcome-help';
    empty.textContent = 'No music businesses have requested a storefront yet.';
    container.appendChild(empty);
    return;
  }

  stores.sort((a, b) => {
    if (a.subscriptionStatus === 'pending' && b.subscriptionStatus !== 'pending') return -1;
    if (b.subscriptionStatus === 'pending' && a.subscriptionStatus !== 'pending') return 1;
    return (a.businessName || '').localeCompare(b.businessName || '');
  }).forEach(store => {
    const card = document.createElement('article');
    card.className = 'control-card';
    card.style.minHeight = '0';
    const name = document.createElement('strong');
    name.textContent = store.businessName || 'Unnamed Business';
    const details = document.createElement('span');
    details.textContent = `${statusLabel(store)} · ${store.category || 'No category'} · ${store.location || 'No location'}${store.featured ? ' · FEATURED' : ''}`;
    const contact = document.createElement('span');
    contact.style.display = 'block';
    contact.style.marginTop = '5px';
    contact.textContent = `Contact: ${store.contactEmail || 'Not supplied'}${store.websiteUrl ? ` · ${store.websiteUrl}` : ''}`;
    const offer = document.createElement('span');
    offer.style.display = 'block';
    offer.style.marginTop = '5px';
    offer.textContent = store.memberOffer ? `Member offer: ${store.memberOffer}` : 'No BANDtroductions member offer supplied.';
    const actions = document.createElement('div');
    actions.className = 'welcome-actions';
    actions.style.marginTop = '10px';
    if (store.subscriptionStatus !== 'comped') actions.appendChild(actionButton('COMP LAUNCH BUSINESS', 'approve-button', () => setStatus(store, 'comped', 'launch-partner')));
    if (!['active', 'comped'].includes(store.subscriptionStatus)) actions.appendChild(actionButton('ACTIVATE OVERRIDE', '', () => setStatus(store, 'active', 'monthly')));
    if (store.subscriptionStatus !== 'pending') actions.appendChild(actionButton('MARK PENDING', '', () => setStatus(store, 'pending', 'monthly')));
    if (store.subscriptionStatus !== 'paused') actions.appendChild(actionButton('PAUSE', '', () => setStatus(store, 'paused')));
    actions.appendChild(actionButton(store.featured ? 'REMOVE FEATURED' : 'MAKE FEATURED', '', () => toggleFeatured(store)));
    const manage = document.createElement('a');
    manage.className = 'auth-button';
    manage.style.width = 'auto';
    manage.href = `business-hub.html?manage=${encodeURIComponent(store.id)}#list-your-business`;
    manage.textContent = 'MANAGE / PREVIEW';
    actions.appendChild(manage);
    if (['active', 'comped'].includes(store.subscriptionStatus)) {
      const view = document.createElement('a');
      view.className = 'auth-button';
      view.style.width = 'auto';
      view.href = `business-hub.html?business=${encodeURIComponent(store.id)}`;
      view.textContent = 'VIEW STOREFRONT';
      actions.appendChild(view);
    }
    const remove = actionButton('DELETE STOREFRONT', '', () => deleteStore(store));
    remove.style.borderColor = '#8f3030';
    remove.style.color = '#ff9b9b';
    actions.appendChild(remove);
    card.append(name, details, contact, offer, actions);
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
  stopStores = onSnapshot(collection(db, 'businessStores'), snapshot => {
    render(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, error => {
    console.error(error);
    container.textContent = 'Business storefront requests could not be loaded.';
  });
});
