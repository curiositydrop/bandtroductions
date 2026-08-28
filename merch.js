import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { uploadUserImage, validateImageFile, storageUnavailableMessage } from './storage-upload.js';

const SUBSCRIPTION_PRICE = 15;
const MAX_PRODUCTS = 20;
const ACTIVE_STATUSES = new Set(['active', 'trialing']);
// Replace these three placeholders when the live recurring checkout,
// platform-product checkout, and customer billing portal links are ready.
const STORE_SUBSCRIPTION_CHECKOUT_URL = '';
const PLATFORM_HOODIE_CHECKOUT_URL = '';
const BILLING_PORTAL_URL = '';

const SAMPLE_STORES = [
  {
    id: 'sample-burning-time',
    bandName: 'BURNING TIME · SAMPLE',
    coverImageUrl: 'IMG_9382.jpeg',
    isSample: true
  },
  {
    id: 'sample-bandtroductions',
    bandName: 'YOUR BAND HERE',
    coverImageUrl: '6088D6CE-FC3E-40D6-BF94-9191E0A7FE10.png',
    isSample: true
  },
  {
    id: 'sample-country-roads',
    bandName: 'COUNTRY ROADS · SAMPLE',
    coverImageUrl: 'IMG_9496.jpeg',
    isSample: true
  }
];

const SAMPLE_PRODUCTS = [
  {
    name: 'Logo Hoodie',
    price: '$45.00',
    description: 'Premium black pullover hoodie with the band logo.',
    options: 'S–3XL · Black',
    imageUrl: 'merch-platform-hoodie.webp',
    published: true
  },
  {
    name: 'Tour T-Shirt',
    price: '$25.00',
    description: 'Soft heavyweight tee made for loud nights.',
    options: 'S–3XL · Black',
    imageUrl: 'IMG_9382.jpeg',
    published: true
  },
  {
    name: 'Sticker Pack',
    price: '$8.00',
    description: 'A set of weatherproof band logo stickers.',
    options: '5-piece pack',
    imageUrl: '6088D6CE-FC3E-40D6-BF94-9191E0A7FE10.png',
    published: true
  }
];

const bandGrid = document.getElementById('band-store-grid');
const selectedStoreSection = document.getElementById('selected-store');
const selectedStoreHead = document.getElementById('selected-store-head');
const selectedProductGrid = document.getElementById('selected-product-grid');
const ownerSummary = document.getElementById('owner-summary');
const ownerActions = document.getElementById('owner-actions');
const ownerMessage = document.getElementById('owner-message');
const productForm = document.getElementById('product-form');
const ownerProducts = document.getElementById('owner-products');
const saveProductButton = document.getElementById('save-product');

let publicStores = [];
let currentUser = null;
let ownedBand = null;
let ownedStore = null;
let ownedProducts = [];

function fillStoreRow(stores) {
  const liveStores = Array.isArray(stores) ? stores : [];
  const openSlots = Math.max(0, 3 - liveStores.length);
  return [...liveStores, ...SAMPLE_STORES.slice(0, openSlots)];
}

function setOwnerMessage(message, isError = false) {
  ownerMessage.textContent = message || '';
  ownerMessage.classList.toggle('error', Boolean(isError));
}

function initials(name) {
  return String(name || 'BT').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'BT';
}

function imageForStore(store) {
  return store.coverImageUrl || store.imageUrl || store.bannerImageUrl || '';
}

function isValidWebUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch (_) {
    return false;
  }
}

function timestampValue(value) {
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  return 0;
}

function showEmpty(container, title, message) {
  container.replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'market-status';
  const strong = document.createElement('strong');
  strong.textContent = title;
  empty.append(strong, document.createTextNode(message));
  container.appendChild(empty);
}

function createStoreImage(store, className = '') {
  const url = imageForStore(store);
  if (!url) {
    const fallback = document.createElement('div');
    fallback.className = className || 'band-fallback';
    fallback.textContent = initials(store.bandName);
    fallback.setAttribute('aria-hidden', 'true');
    return fallback;
  }
  const image = document.createElement('img');
  image.className = className;
  image.src = url;
  image.alt = `${store.bandName || 'Band'} cover art`;
  image.loading = 'lazy';
  return image;
}

function renderBandStores() {
  bandGrid.replaceChildren();
  if (!publicStores.length) {
    showEmpty(bandGrid, 'The first band stores are coming soon.', 'When subscribed bands publish merchandise, their cover art will appear here.');
    return;
  }

  publicStores.forEach(store => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'band-card';
    button.dataset.storeId = store.id;
    button.appendChild(createStoreImage(store));
    const copy = document.createElement('span');
    copy.className = 'band-card-copy';
    const name = document.createElement('strong');
    name.textContent = store.bandName || 'BANDtroductions Band';
    const action = document.createElement('span');
    action.textContent = 'OPEN MERCH STORE →';
    copy.append(name, action);
    button.appendChild(copy);
    button.addEventListener('click', () => openStore(store.id, true));
    bandGrid.appendChild(button);
  });
}

function createProductCard(product) {
  const card = document.createElement('article');
  card.className = 'product-card';
  const image = document.createElement('img');
  image.src = product.imageUrl || imageForStore(publicStores.find(store => store.id === product.storeId) || {});
  image.alt = product.name || 'Band merchandise';
  image.loading = 'lazy';
  const info = document.createElement('div');
  info.className = 'product-info';
  const title = document.createElement('h3');
  title.textContent = product.name || 'Band Merchandise';
  const price = document.createElement('div');
  price.className = 'product-price';
  price.textContent = product.price || 'See band checkout';
  const description = document.createElement('p');
  description.className = 'product-description';
  description.textContent = product.description || '';
  const options = document.createElement('p');
  options.className = 'product-options';
  options.textContent = product.options ? `Options: ${product.options}` : 'See the band checkout for available options.';
  const buy = document.createElement('a');
  buy.className = 'button primary';
  buy.textContent = 'BUY FROM BAND';
  buy.href = isValidWebUrl(product.buyUrl) ? product.buyUrl : '#';
  buy.target = '_blank';
  buy.rel = 'noopener';
  if (!isValidWebUrl(product.buyUrl)) {
    buy.removeAttribute('target');
    buy.addEventListener('click', event => {
      event.preventDefault();
      alert('This band is still connecting its checkout link.');
    });
  }
  info.append(title, price, description, options, buy);
  card.append(image, info);
  return card;
}

async function openStore(storeId, updateHistory = false) {
  const store = publicStores.find(item => item.id === storeId);
  if (!store) return;
  selectedStoreSection.hidden = false;
  selectedStoreHead.replaceChildren();
  selectedProductGrid.replaceChildren();

  const logo = createStoreImage(store, 'store-logo');
  const copy = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = store.bandName || 'Band Merch';
  const note = document.createElement('p');
  note.textContent = store.isSample
    ? 'Sample storefront · Products and checkout links are placeholders.'
    : 'Official band merchandise · Purchases are completed through the band.';
  copy.append(title, note);
  selectedStoreHead.append(logo, copy);
  showEmpty(selectedProductGrid, 'Loading products…', 'Opening this band’s storefront.');

  if (updateHistory) {
    const url = new URL(location.href);
    url.searchParams.set('band', store.id);
    history.pushState({ storeId: store.id }, '', url);
  }

  if (store.isSample) {
    selectedProductGrid.replaceChildren();
    SAMPLE_PRODUCTS.forEach(product => selectedProductGrid.appendChild(createProductCard({ ...product, storeId: store.id })));
    selectedStoreSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  try {
    const snapshot = await getDocs(query(collection(db, 'merchProducts'), where('storeId', '==', store.id)));
    const products = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .filter(product => product.published === true)
      .sort((a, b) => (Number(a.sortOrder) || 999) - (Number(b.sortOrder) || 999) || timestampValue(b.createdAt) - timestampValue(a.createdAt));
    selectedProductGrid.replaceChildren();
    if (!products.length) showEmpty(selectedProductGrid, 'This band is stocking the shelves.', 'Check back soon for published merchandise.');
    else products.forEach(product => selectedProductGrid.appendChild(createProductCard(product)));
  } catch (error) {
    console.error('Could not load band merchandise:', error);
    showEmpty(selectedProductGrid, 'This store could not be loaded.', 'Please refresh the page and try again.');
  }
  selectedStoreSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

onSnapshot(collection(db, 'merchStores'), snapshot => {
  const liveStores = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
    .filter(store => ACTIVE_STATUSES.has(store.subscriptionStatus) && store.published !== false)
    .sort((a, b) => (a.bandName || '').localeCompare(b.bandName || ''));
  publicStores = fillStoreRow(liveStores);
  renderBandStores();
  const requestedStore = new URLSearchParams(location.search).get('band');
  if (requestedStore && publicStores.some(store => store.id === requestedStore)) openStore(requestedStore, false);
}, error => {
  console.error('Could not load merch stores:', error);
  publicStores = fillStoreRow([]);
  renderBandStores();
});

async function findOwnedBandProfile(user) {
  const direct = await getDoc(doc(db, 'profiles', user.uid));
  if (direct.exists() && direct.data().accountType === 'band') return { id: direct.id, ...direct.data() };
  const owned = await getDocs(query(collection(db, 'profiles'), where('ownerId', '==', user.uid)));
  const bandDoc = owned.docs.find(item => item.data().accountType === 'band');
  return bandDoc ? { id: bandDoc.id, ...bandDoc.data() } : null;
}

function createActionButton(label, handler, className = 'button primary') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

async function requestStore() {
  if (!currentUser || !ownedBand) return;
  const button = ownerActions.querySelector('button');
  if (button) button.disabled = true;
  setOwnerMessage('Saving your store request…');
  try {
    const storeRef = doc(db, 'merchStores', ownedBand.id);
    const existing = await getDoc(storeRef);
    const existingStatus = existing.data()?.subscriptionStatus || '';
    const status = ACTIVE_STATUSES.has(existingStatus) ? existingStatus : 'pending';
    await setDoc(storeRef, {
      ownerId: currentUser.uid,
      profileId: ownedBand.id,
      bandName: ownedBand.displayName || 'BANDtroductions Band',
      coverImageUrl: ownedBand.imageUrl || ownedBand.bannerImageUrl || '',
      subscriptionStatus: status,
      subscriptionPrice: SUBSCRIPTION_PRICE,
      published: ACTIVE_STATUSES.has(status),
      updatedAt: serverTimestamp(),
      ...(existing.exists() ? {} : { createdAt: serverTimestamp() })
    }, { merge: true });
    await loadOwnerState(currentUser);
    if (STORE_SUBSCRIPTION_CHECKOUT_URL) location.href = STORE_SUBSCRIPTION_CHECKOUT_URL;
    else setOwnerMessage('Your request is saved. The $15 monthly checkout link is still a placeholder; your upload tools will unlock after payment is confirmed.');
  } catch (error) {
    console.error(error);
    setOwnerMessage('Your store request could not be saved. Please try again.', true);
    if (button) button.disabled = false;
  }
}

function renderOwnerLocked(status) {
  productForm.hidden = true;
  ownerProducts.replaceChildren();
  ownerActions.replaceChildren();
  const statusLabel = status === 'pending' ? 'PAYMENT PENDING' : status === 'past_due' ? 'UPDATE PAYMENT' : 'START MY STORE — $15/MONTH';
  ownerActions.appendChild(createActionButton(statusLabel, requestStore));
  if (status === 'pending') ownerSummary.textContent = `${ownedBand.displayName}'s store request is ready. Product uploads unlock after the recurring payment is confirmed.`;
  else if (status === 'past_due' || status === 'paused') ownerSummary.textContent = `${ownedBand.displayName}'s storefront is paused until billing is active again.`;
  else ownerSummary.textContent = `${ownedBand.displayName} is eligible for a storefront with up to ${MAX_PRODUCTS} products and no sales commission.`;
}

function renderOwnerProduct(product) {
  const row = document.createElement('article');
  row.className = 'owner-product';
  const image = document.createElement('img');
  image.src = product.imageUrl || '';
  image.alt = '';
  const copy = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = product.name || 'Merchandise';
  const meta = document.createElement('span');
  meta.textContent = `${product.price || 'No price'} · ${product.published ? 'Published' : 'Hidden'}`;
  copy.append(name, meta);
  const actions = document.createElement('div');
  actions.className = 'owner-actions';
  const toggle = createActionButton(product.published ? 'HIDE' : 'PUBLISH', async () => {
    toggle.disabled = true;
    try {
      await updateDoc(doc(db, 'merchProducts', product.id), { published: !product.published, updatedAt: serverTimestamp() });
      await loadOwnerProducts();
    } catch (error) {
      console.error(error);
      setOwnerMessage('That product could not be updated.', true);
      toggle.disabled = false;
    }
  }, 'button secondary');
  const remove = createActionButton('REMOVE', async () => {
    if (!confirm(`Remove ${product.name || 'this product'} from your store?`)) return;
    remove.disabled = true;
    try {
      await deleteDoc(doc(db, 'merchProducts', product.id));
      await loadOwnerProducts();
      setOwnerMessage('Product removed.');
    } catch (error) {
      console.error(error);
      setOwnerMessage('That product could not be removed.', true);
      remove.disabled = false;
    }
  }, 'button danger');
  actions.append(toggle, remove);
  row.append(image, copy, actions);
  return row;
}

async function loadOwnerProducts() {
  if (!ownedBand || !currentUser) return;
  try {
    const snapshot = await getDocs(query(collection(db, 'merchProducts'), where('storeId', '==', ownedBand.id)));
    ownedProducts = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .filter(product => product.ownerId === currentUser.uid)
      .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt));
    ownerProducts.replaceChildren();
    if (!ownedProducts.length) {
      const empty = document.createElement('div');
      empty.className = 'market-status';
      empty.textContent = 'No products added yet.';
      ownerProducts.appendChild(empty);
    } else ownedProducts.forEach(product => ownerProducts.appendChild(renderOwnerProduct(product)));
    saveProductButton.disabled = ownedProducts.length >= MAX_PRODUCTS;
    if (ownedProducts.length >= MAX_PRODUCTS) setOwnerMessage(`This store has reached its ${MAX_PRODUCTS}-product limit.`);
  } catch (error) {
    console.error(error);
    setOwnerMessage('Your current products could not be loaded.', true);
  }
}

async function loadOwnerState(user) {
  currentUser = user;
  ownedBand = null;
  ownedStore = null;
  productForm.hidden = true;
  ownerProducts.replaceChildren();
  ownerActions.replaceChildren();
  setOwnerMessage('');

  if (!user) {
    ownerSummary.textContent = 'Sign in with the account that owns your band profile to begin.';
    const signIn = document.createElement('a');
    signIn.className = 'button primary';
    signIn.href = 'login.html';
    signIn.textContent = 'SIGN IN';
    ownerActions.appendChild(signIn);
    return;
  }

  ownerSummary.textContent = 'Checking your band profile and store access…';
  try {
    ownedBand = await findOwnedBandProfile(user);
    if (!ownedBand) {
      ownerSummary.textContent = 'A published BANDtroductions band profile is required to open a merch store.';
      const createProfile = document.createElement('a');
      createProfile.className = 'button primary';
      createProfile.href = 'create-profile.html';
      createProfile.textContent = 'CREATE BAND PROFILE';
      ownerActions.appendChild(createProfile);
      return;
    }
    const storeSnapshot = await getDoc(doc(db, 'merchStores', ownedBand.id));
    ownedStore = storeSnapshot.exists() ? { id: storeSnapshot.id, ...storeSnapshot.data() } : null;
    const status = ownedStore?.subscriptionStatus || 'not_started';
    if (!ACTIVE_STATUSES.has(status)) {
      renderOwnerLocked(status);
      return;
    }
    ownerSummary.textContent = `${ownedBand.displayName}'s $15/month store is active. Add or manage products below.`;
    ownerActions.appendChild(createActionButton('MANAGE BILLING', () => {
      if (BILLING_PORTAL_URL) window.open(BILLING_PORTAL_URL, '_blank', 'noopener');
      else alert('The subscription management link is being connected with the live checkout.');
    }, 'button secondary'));
    productForm.hidden = false;
    await loadOwnerProducts();
  } catch (error) {
    console.error('Could not load merch owner tools:', error);
    ownerSummary.textContent = 'Your store access could not be checked right now.';
    setOwnerMessage('Please refresh and try again.', true);
  }
}

productForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser || !ownedBand || !ownedStore || !ACTIVE_STATUSES.has(ownedStore.subscriptionStatus)) {
    setOwnerMessage('An active merch subscription is required before products can be added.', true);
    return;
  }
  if (ownedProducts.length >= MAX_PRODUCTS) {
    setOwnerMessage(`This store has reached its ${MAX_PRODUCTS}-product limit.`, true);
    return;
  }
  const name = document.getElementById('product-name').value.trim();
  const price = document.getElementById('product-price').value.trim();
  const description = document.getElementById('product-description').value.trim();
  const options = document.getElementById('product-options').value.trim();
  const buyUrl = document.getElementById('product-buy-url').value.trim();
  const file = document.getElementById('product-image').files?.[0];
  const published = document.getElementById('product-published').checked;
  const validation = validateImageFile(file);
  if (!name || !price || !file || !isValidWebUrl(buyUrl)) {
    setOwnerMessage('Add a product name, price, valid checkout link, and product image.', true);
    return;
  }
  if (!validation.ok) {
    setOwnerMessage(validation.message, true);
    return;
  }

  saveProductButton.disabled = true;
  setOwnerMessage('Uploading product image…');
  try {
    const imageUrl = await uploadUserImage({ userId: currentUser.uid, folder: 'merch-products', file });
    setOwnerMessage('Saving product…');
    await addDoc(collection(db, 'merchProducts'), {
      storeId: ownedBand.id,
      ownerId: currentUser.uid,
      bandName: ownedBand.displayName || 'BANDtroductions Band',
      name,
      price,
      description,
      options,
      buyUrl,
      imageUrl,
      published,
      sortOrder: ownedProducts.length + 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    productForm.reset();
    document.getElementById('product-published').checked = true;
    await loadOwnerProducts();
    setOwnerMessage('Product added to your store.');
  } catch (error) {
    console.error(error);
    setOwnerMessage(storageUnavailableMessage(error), true);
  } finally {
    saveProductButton.disabled = ownedProducts.length >= MAX_PRODUCTS;
  }
});

document.getElementById('platform-buy-button').addEventListener('click', event => {
  if (PLATFORM_HOODIE_CHECKOUT_URL) {
    event.currentTarget.href = PLATFORM_HOODIE_CHECKOUT_URL;
    return;
  }
  event.preventDefault();
  alert('The official BANDtroductions hoodie checkout link is being connected.');
});

window.addEventListener('popstate', event => {
  const storeId = event.state?.storeId || new URLSearchParams(location.search).get('band');
  if (storeId) openStore(storeId, false);
  else selectedStoreSection.hidden = true;
});

onAuthStateChanged(auth, loadOwnerState);
