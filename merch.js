import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
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
  updateDoc,
  where,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { uploadUserImage, validateImageFile, storageUnavailableMessage } from './storage-upload.js';
import { isAdminAccount } from './admin-access.js';

const SUBSCRIPTION_PRICE = 15;
const INTRO_MONTHS = 2;
const INTRO_PRICE = 0;
const MAX_PRODUCTS = 20;
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'comped']);
const PRODUCT_EDIT_STATUSES = new Set(['pending', 'active', 'trialing', 'comped', 'past_due', 'paused']);
const MERCH_PROFILE_TYPES = new Set(['band', 'musician']);
// Replace these three placeholders when the live recurring checkout,
// platform-product checkout, and customer billing portal links are ready.
const STORE_SUBSCRIPTION_CHECKOUT_URL = 'https://buy.stripe.com/4gM8wI94qccabjzaOL6oo0e';
const PLATFORM_HOODIE_CHECKOUT_URL = '';
const BILLING_PORTAL_URL = '';

const SAMPLE_STORES = [
  {
    id: 'sample-bandtroductions',
    bandName: 'YOUR BAND HERE',
    coverImageUrl: '6088D6CE-FC3E-40D6-BF94-9191E0A7FE10.png',
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
const storeForm = document.getElementById('store-form');
const requestStoreButton = document.getElementById('request-store');
const productEditor = document.getElementById('product-editor');
const productForm = document.getElementById('product-form');
const productEditorTitle = document.getElementById('product-editor-title');
const productEditorNote = document.getElementById('product-editor-note');
const productImageInput = document.getElementById('product-image');
const productImageLabel = document.getElementById('product-image-label');
const productPublishLabel = document.getElementById('product-publish-label');
const ownerProducts = document.getElementById('owner-products');
const saveProductButton = document.getElementById('save-product');
const cancelProductEditButton = document.getElementById('cancel-product-edit');

let publicStores = [];
let currentUser = null;
let ownedBand = null;
let ownedStore = null;
let ownedProducts = [];
let editingProductId = null;
let currentUserIsAdmin = false;
let adminManagedStoreId = '';

function isAdminManagingStore() {
  return currentUserIsAdmin && Boolean(adminManagedStoreId) && ownedStore?.id === adminManagedStoreId;
}

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

function storeSubscriptionCheckoutUrl() {
  if (!STORE_SUBSCRIPTION_CHECKOUT_URL || !ownedBand) return '';
  const checkout = new URL(STORE_SUBSCRIPTION_CHECKOUT_URL);
  checkout.searchParams.set('client_reference_id', ownedBand.id);
  const checkoutEmail = ownedStore?.contactEmail || currentUser?.email || '';
  if (checkoutEmail) checkout.searchParams.set('prefilled_email', checkoutEmail);
  return checkout.toString();
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
  image.alt = `${store.bandName || 'Artist'} cover art`;
  image.loading = 'lazy';
  return image;
}

function renderBandStores() {
  bandGrid.replaceChildren();
  if (!publicStores.length) {
    showEmpty(bandGrid, 'The first artist stores are coming soon.', 'When subscribed bands and musicians publish merchandise, their cover art will appear here.');
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
    name.textContent = store.bandName || 'BANDtroductions Artist';
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
  image.alt = product.name || 'Artist merchandise';
  image.loading = 'lazy';
  const info = document.createElement('div');
  info.className = 'product-info';
  const title = document.createElement('h3');
  title.textContent = product.name || 'Artist Merchandise';
  const price = document.createElement('div');
  price.className = 'product-price';
  price.textContent = product.price || 'See artist checkout';
  const description = document.createElement('p');
  description.className = 'product-description';
  description.textContent = product.description || '';
  const options = document.createElement('p');
  options.className = 'product-options';
  options.textContent = product.options ? `Options: ${product.options}` : 'See the artist checkout for available options.';
  const buy = document.createElement('a');
  buy.className = 'button primary';
  buy.textContent = 'BUY FROM ARTIST';
  buy.href = isValidWebUrl(product.buyUrl) ? product.buyUrl : '#';
  buy.target = '_blank';
  buy.rel = 'noopener';
  if (!isValidWebUrl(product.buyUrl)) {
    buy.removeAttribute('target');
    buy.addEventListener('click', event => {
      event.preventDefault();
      alert('This artist is still connecting their checkout link.');
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
  title.textContent = store.bandName || 'Artist Merch';
  const note = document.createElement('p');
  note.textContent = store.isSample
    ? 'Sample storefront · Products and checkout links are placeholders.'
    : (store.storeDescription || 'Official artist merchandise · Purchases are completed through the artist.');
  copy.append(title, note);
  const browseAll = document.createElement('a');
  browseAll.className = 'button secondary store-browse';
  browseAll.href = '#band-marketplace';
  browseAll.textContent = 'BROWSE ALL ARTIST MERCH';
  browseAll.addEventListener('click', event => {
    event.preventDefault();
    const url = new URL(location.href);
    url.searchParams.delete('band');
    history.pushState({}, '', url);
    selectedStoreSection.hidden = true;
    document.getElementById('band-marketplace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  selectedStoreHead.append(logo, copy, browseAll);
  showEmpty(selectedProductGrid, 'Loading products…', 'Opening this artist’s storefront.');

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
    const snapshot = await getDocs(query(
      collection(db, 'merchProducts'),
      where('storeId', '==', store.id),
      where('published', '==', true)
    ));
    const products = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .filter(product => product.published === true)
      .sort((a, b) => (Number(a.sortOrder) || 999) - (Number(b.sortOrder) || 999) || timestampValue(b.createdAt) - timestampValue(a.createdAt));
    selectedProductGrid.replaceChildren();
    if (!products.length) showEmpty(selectedProductGrid, 'This artist is stocking the shelves.', 'Check back soon for published merchandise.');
    else products.forEach(product => selectedProductGrid.appendChild(createProductCard(product)));
  } catch (error) {
    console.error('Could not load artist merchandise:', error);
    showEmpty(selectedProductGrid, 'This store could not be loaded.', 'Please refresh the page and try again.');
  }
  selectedStoreSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderAdminStorePreview() {
  if (!isAdminManagingStore() || !ownedStore) return;
  selectedStoreSection.hidden = false;
  selectedStoreHead.replaceChildren();
  selectedProductGrid.replaceChildren();

  const logo = createStoreImage(ownedStore, 'store-logo');
  const copy = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = ownedStore.bandName || ownedBand?.displayName || 'Artist Merch';
  const note = document.createElement('p');
  const visibility = ACTIVE_STATUSES.has(ownedStore.subscriptionStatus)
    ? 'This is the current fan-facing storefront.'
    : 'ADMIN PREVIEW — this storefront is still hidden from fans.';
  note.textContent = `${visibility} ${ownedStore.storeDescription || 'Official artist merchandise · Purchases are completed through the artist.'}`;
  copy.append(title, note);

  const browseAll = document.createElement('a');
  browseAll.className = 'button secondary store-browse';
  browseAll.href = '#band-marketplace';
  browseAll.textContent = 'BROWSE ALL ARTIST MERCH';
  selectedStoreHead.append(logo, copy, browseAll);

  const previewProducts = ownedProducts
    .filter(product => product.published === true)
    .sort((a, b) => (Number(a.sortOrder) || 999) - (Number(b.sortOrder) || 999));
  if (!previewProducts.length) {
    showEmpty(selectedProductGrid, 'This artist is stocking the shelves.', 'No products are marked to appear in the storefront yet.');
  } else {
    previewProducts.forEach(product => selectedProductGrid.appendChild(createProductCard(product)));
  }
}

onSnapshot(query(collection(db, 'merchStorefronts'), where('published', '==', true)), snapshot => {
  const liveStores = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
    .filter(store => store.published === true)
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

async function findOwnedMerchProfile(user) {
  let completedLookup = false;
  try {
    const owned = await getDocs(query(collection(db, 'profiles'), where('ownerId', '==', user.uid)));
    completedLookup = true;
    const artistDoc = owned.docs.find(item => MERCH_PROFILE_TYPES.has(item.data().accountType));
    if (artistDoc) return { id: artistDoc.id, ...artistDoc.data() };
  } catch (error) {
    console.warn('Could not query owned merch profiles:', error);
  }

  try {
    const direct = await getDoc(doc(db, 'profiles', user.uid));
    completedLookup = true;
    if (direct.exists() && MERCH_PROFILE_TYPES.has(direct.data().accountType)) return { id: direct.id, ...direct.data() };
  } catch (error) {
    console.warn('Could not load direct merch profile:', error);
  }

  if (!completedLookup) throw new Error('Artist profile access could not be verified.');
  return null;
}

async function findOwnedMerchStore(user, profileId) {
  try {
    const owned = await getDocs(query(collection(db, 'merchStores'), where('ownerId', '==', user.uid)));
    const storeDoc = owned.docs.find(item => item.id === profileId || item.data().profileId === profileId);
    return storeDoc ? { id: storeDoc.id, ...storeDoc.data() } : null;
  } catch (queryError) {
    console.warn('Could not query owned merch stores:', queryError);
    try {
      const direct = await getDoc(doc(db, 'merchStores', profileId));
      return direct.exists() ? { id: direct.id, ...direct.data() } : null;
    } catch (directError) {
      console.warn('Could not load direct merch store:', directError);
      throw queryError;
    }
  }
}

function createActionButton(label, handler, className = 'button primary') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function createMerchLoginLink() {
  const link = document.createElement('a');
  link.className = 'button primary';
  link.href = 'login.html?returnTo=merch.html';
  link.textContent = 'LOGIN / CREATE ACCOUNT';
  return link;
}

function createAccountSwitchButton(label = 'SWITCH ACCOUNT', destination = 'login.html?returnTo=merch.html') {
  return createActionButton(label, async event => {
    event.currentTarget.disabled = true;
    try {
      await signOut(auth);
      location.href = destination;
    } catch (error) {
      console.error('Could not switch merch account:', error);
      event.currentTarget.disabled = false;
      setOwnerMessage('That account could not be signed out. Please refresh and try again.', true);
    }
  }, 'button secondary');
}

function populateStoreForm() {
  document.getElementById('store-contact-email').value = ownedStore?.contactEmail || currentUser?.email || '';
  document.getElementById('store-website').value = ownedStore?.websiteUrl || ownedBand?.website || '';
  document.getElementById('store-description').value = ownedStore?.storeDescription || '';
  document.getElementById('store-agreement').checked = ownedStore?.sellerAgreementAccepted === true;
}

function renderStoreApplication(status) {
  storeForm.hidden = false;
  requestStoreButton.textContent = ownedStore ? 'SAVE STORE DETAILS' : 'SUBMIT STORE';
  populateStoreForm();

  if (isAdminManagingStore()) {
    ownerSummary.textContent = `ADMIN MODE — managing ${ownedStore.bandName || ownedBand?.displayName || 'this artist'}'s store. Changes save directly to their storefront record.`;
    return;
  }

  if (!ownedStore) {
    ownerSummary.textContent = `${ownedBand.displayName} can submit a storefront and prepare up to ${MAX_PRODUCTS} products. Nothing goes public until BANDtroductions approves it.`;
    return;
  }

  if (status === 'pending' && ownedStore?.applicationStatus === 'payment_review') ownerSummary.textContent = `${ownedBand.displayName}'s checkout was received, but the billing email needs review. Your draft products remain saved.`;
  else if (status === 'pending' && ownedStore?.billingVerified === true) ownerSummary.textContent = `${ownedBand.displayName}'s subscription is confirmed and the store is awaiting final approval. You can add and update draft products below.`;
  else if (status === 'pending') ownerSummary.textContent = `${ownedBand.displayName}'s store submission is awaiting payment verification and approval. You can add and update draft products below.`;
  else if (status === 'past_due' || status === 'paused') ownerSummary.textContent = `${ownedBand.displayName}'s storefront is hidden until billing is active again. Store details and products can still be updated.`;
  else if (status === 'comped') ownerSummary.textContent = `${ownedBand.displayName} is active as a launch-partner store with no monthly charge.`;
  else ownerSummary.textContent = `${ownedBand.displayName}'s merch store is active. Add or manage products below.`;
}

async function requestStore(event) {
  event?.preventDefault();
  if (!currentUser || !ownedBand) return;
  const contactEmail = document.getElementById('store-contact-email').value.trim();
  const websiteUrl = document.getElementById('store-website').value.trim();
  const storeDescription = document.getElementById('store-description').value.trim();
  const agreementAccepted = document.getElementById('store-agreement').checked;
  if (!contactEmail || (websiteUrl && !isValidWebUrl(websiteUrl)) || !agreementAccepted) {
    setOwnerMessage('Add a contact email, use a valid website link, and accept the seller agreement.', true);
    return;
  }
  requestStoreButton.disabled = true;
  setOwnerMessage('Saving your store request…');
  try {
    const storeRef = doc(db, 'merchStores', ownedBand.id);
    const storeOwnerId = ownedStore?.ownerId || currentUser.uid;
    const existingStatus = ownedStore?.subscriptionStatus || '';
    const status = existingStatus && existingStatus !== 'canceled' ? existingStatus : 'pending';
    const batch = writeBatch(db);
    batch.set(storeRef, {
      ownerId: storeOwnerId,
      profileId: ownedBand.id,
      profileType: ownedBand.accountType || 'band',
      bandName: ownedBand.displayName || 'BANDtroductions Band',
      coverImageUrl: ownedBand.imageUrl || ownedBand.bannerImageUrl || '',
      contactEmail,
      websiteUrl,
      storeDescription,
      sellerAgreementAccepted: true,
      sellerAgreementAcceptedAt: ownedStore?.sellerAgreementAcceptedAt || serverTimestamp(),
      subscriptionStatus: status,
      subscriptionPrice: SUBSCRIPTION_PRICE,
      introPrice: INTRO_PRICE,
      introMonths: INTRO_MONTHS,
      renewalPrice: SUBSCRIPTION_PRICE,
      offerCode: 'two-months-free-then-15-monthly',
      applicationStatus: ACTIVE_STATUSES.has(status) ? 'approved' : 'pending',
      published: ACTIVE_STATUSES.has(status),
      updatedAt: serverTimestamp(),
      ...(ownedStore ? {} : { createdAt: serverTimestamp() })
    }, { merge: true });
    if (ACTIVE_STATUSES.has(status)) {
      batch.set(doc(db, 'merchStorefronts', ownedBand.id), {
        profileId: ownedBand.id,
        profileType: ownedBand.accountType || 'band',
        bandName: ownedBand.displayName || 'BANDtroductions Band',
        coverImageUrl: ownedBand.imageUrl || ownedBand.bannerImageUrl || '',
        websiteUrl,
        storeDescription,
        published: true,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();
    await loadOwnerState(currentUser);
    const checkoutUrl = storeSubscriptionCheckoutUrl();
    if (checkoutUrl && !ACTIVE_STATUSES.has(status)) location.href = checkoutUrl;
    else setOwnerMessage(ACTIVE_STATUSES.has(status) ? 'Store details saved.' : 'Store submitted. Add your merchandise below while it awaits approval.');
  } catch (error) {
    console.error(error);
    setOwnerMessage('Your store request could not be saved. Please try again.', true);
    requestStoreButton.disabled = false;
  }
}

function resetProductForm() {
  editingProductId = null;
  productForm.reset();
  document.getElementById('product-published').checked = true;
  productImageInput.required = true;
  productEditorTitle.textContent = 'Add Merchandise';
  productEditorNote.textContent = 'Add each item separately. Draft items can be prepared while your store is awaiting approval.';
  productImageLabel.firstChild.textContent = 'Product image';
  saveProductButton.textContent = 'ADD PRODUCT';
  cancelProductEditButton.hidden = true;
  saveProductButton.disabled = ownedProducts.length >= MAX_PRODUCTS;
}

function startProductEdit(product) {
  editingProductId = product.id;
  document.getElementById('product-name').value = product.name || '';
  document.getElementById('product-price').value = product.price || '';
  document.getElementById('product-description').value = product.description || '';
  document.getElementById('product-options').value = product.options || '';
  document.getElementById('product-buy-url').value = product.buyUrl || '';
  document.getElementById('product-published').checked = product.published === true;
  productImageInput.value = '';
  productImageInput.required = false;
  productEditorTitle.textContent = `Edit ${product.name || 'Merchandise'}`;
  productEditorNote.textContent = 'Update the product details below. Leave the image empty to keep the current photo.';
  productImageLabel.firstChild.textContent = 'Replace product image (optional)';
  saveProductButton.textContent = 'SAVE CHANGES';
  saveProductButton.disabled = false;
  cancelProductEditButton.hidden = false;
  setOwnerMessage('Editing product.');
  productEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const visibility = product.published
    ? (ACTIVE_STATUSES.has(ownedStore?.subscriptionStatus) ? 'Published' : 'Ready when approved')
    : 'Hidden';
  meta.textContent = `${product.price || 'No price'} · ${visibility}`;
  copy.append(name, meta);
  const actions = document.createElement('div');
  actions.className = 'owner-actions';
  const edit = createActionButton('EDIT', () => startProductEdit(product), 'button primary');
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
      if (editingProductId === product.id) resetProductForm();
      await loadOwnerProducts();
      setOwnerMessage('Product removed.');
    } catch (error) {
      console.error(error);
      setOwnerMessage('That product could not be removed.', true);
      remove.disabled = false;
    }
  }, 'button danger');
  actions.append(edit, toggle, remove);
  row.append(image, copy, actions);
  return row;
}

async function loadOwnerProducts() {
  if (!ownedBand || !currentUser) return;
  try {
    const snapshot = await getDocs(query(collection(db, 'merchProducts'), where('storeId', '==', ownedBand.id)));
    ownedProducts = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .filter(product => isAdminManagingStore() || product.ownerId === currentUser.uid)
      .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt));
    ownerProducts.replaceChildren();
    if (!ownedProducts.length) {
      const empty = document.createElement('div');
      empty.className = 'market-status';
      empty.textContent = 'No products added yet.';
      ownerProducts.appendChild(empty);
    } else ownedProducts.forEach(product => ownerProducts.appendChild(renderOwnerProduct(product)));
    saveProductButton.disabled = !editingProductId && ownedProducts.length >= MAX_PRODUCTS;
    if (!editingProductId && ownedProducts.length >= MAX_PRODUCTS) setOwnerMessage(`This store has reached its ${MAX_PRODUCTS}-product limit.`);
    if (isAdminManagingStore()) renderAdminStorePreview();
  } catch (error) {
    console.error(error);
    setOwnerMessage('Your current products could not be loaded.', true);
  }
}

async function loadOwnerState(user) {
  currentUser = user;
  currentUserIsAdmin = isAdminAccount(user);
  adminManagedStoreId = currentUserIsAdmin
    ? new URLSearchParams(location.search).get('manage') || ''
    : '';
  ownedBand = null;
  ownedStore = null;
  ownedProducts = [];
  editingProductId = null;
  productForm.reset();
  productImageInput.required = true;
  storeForm.hidden = true;
  productEditor.hidden = true;
  requestStoreButton.disabled = false;
  ownerProducts.replaceChildren();
  ownerActions.replaceChildren();
  setOwnerMessage('');

  if (!user) {
    ownerSummary.textContent = 'Log in with the account that owns your band or musician profile, or create an artist account to begin.';
    ownerActions.appendChild(createMerchLoginLink());
    return;
  }

  ownerSummary.textContent = 'Checking your artist profile and store access…';
  try {
    if (adminManagedStoreId) {
      const managedStoreSnapshot = await getDoc(doc(db, 'merchStores', adminManagedStoreId));
      if (!managedStoreSnapshot.exists()) {
        ownerSummary.textContent = 'ADMIN MODE — that merch store could not be found.';
        const back = document.createElement('a');
        back.className = 'button secondary';
        back.href = 'admin.html';
        back.textContent = 'BACK TO CONTROL ROOM';
        ownerActions.appendChild(back);
        return;
      }

      ownedStore = { id: managedStoreSnapshot.id, ...managedStoreSnapshot.data() };
      const managedProfileId = ownedStore.profileId || adminManagedStoreId;
      const managedProfileSnapshot = await getDoc(doc(db, 'profiles', managedProfileId));
      ownedBand = managedProfileSnapshot.exists()
        ? { id: managedProfileSnapshot.id, ...managedProfileSnapshot.data() }
        : {
            id: managedProfileId,
            displayName: ownedStore.bandName || 'BANDtroductions Band',
            imageUrl: ownedStore.coverImageUrl || '',
            bannerImageUrl: ''
          };
      const status = ownedStore.subscriptionStatus || 'pending';
      renderStoreApplication(status);

      const back = document.createElement('a');
      back.className = 'button secondary';
      back.href = 'admin.html';
      back.textContent = 'BACK TO CONTROL ROOM';
      ownerActions.appendChild(back);
      ownerActions.appendChild(createActionButton('PREVIEW STORE', () => {
        renderAdminStorePreview();
        selectedStoreSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));

      productEditor.hidden = false;
      productPublishLabel.textContent = ACTIVE_STATUSES.has(status)
        ? 'Publish this product immediately'
        : 'Show this item when the store is approved';
      await loadOwnerProducts();
      return;
    }

    ownedBand = await findOwnedMerchProfile(user);
    if (!ownedBand) {
      ownerSummary.textContent = `You are signed in as ${user.email || 'a BANDtroductions member'}, but this account does not own a published band or musician profile. Sign in with the artist's account to open their merch store.`;
      ownerActions.appendChild(createAccountSwitchButton());
      ownerActions.appendChild(createAccountSwitchButton('CREATE ARTIST ACCOUNT', 'signup.html?returnTo=merch.html'));
      if (currentUserIsAdmin) {
        const adminLink = document.createElement('a');
        adminLink.className = 'button primary';
        adminLink.href = 'admin.html';
        adminLink.textContent = 'OPEN MERCH ADMIN';
        ownerActions.appendChild(adminLink);
      }
      return;
    }
    ownedStore = await findOwnedMerchStore(user, ownedBand.id);
    const status = ownedStore?.subscriptionStatus || 'not_started';

    renderStoreApplication(status);

    if (ACTIVE_STATUSES.has(status)) {
      const viewStore = document.createElement('a');
      viewStore.className = 'button primary';
      viewStore.href = `merch.html?band=${encodeURIComponent(ownedBand.id)}`;
      viewStore.textContent = 'VIEW MY STORE';
      ownerActions.appendChild(viewStore);
    }

    if (ownedStore && status !== 'comped' && status !== 'pending') {
      ownerActions.appendChild(createActionButton('MANAGE BILLING', () => {
        if (BILLING_PORTAL_URL) window.open(BILLING_PORTAL_URL, '_blank', 'noopener');
        else alert('The subscription management link is being connected with the live checkout.');
      }, 'button secondary'));
    }

    if (ownedStore && PRODUCT_EDIT_STATUSES.has(status)) {
      productEditor.hidden = false;
      productPublishLabel.textContent = ACTIVE_STATUSES.has(status)
        ? 'Publish this product immediately'
        : 'Show this item when the store is approved';
      await loadOwnerProducts();
    }
    if (new URLSearchParams(location.search).get('checkout') === 'success') {
      setOwnerMessage(ownedStore?.billingVerified === true
        ? 'Subscription confirmed. Your store is awaiting final approval.'
        : 'Checkout complete. Stripe is verifying your subscription; refresh this page in a moment.');
    }
  } catch (error) {
    console.error('Could not load merch owner tools:', error);
    ownerSummary.textContent = 'Your store access could not be checked right now.';
    setOwnerMessage('Please refresh and try again.', true);
  }
}

storeForm.addEventListener('submit', requestStore);
cancelProductEditButton.addEventListener('click', () => {
  resetProductForm();
  setOwnerMessage('Product edit canceled.');
});

productForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser || !ownedBand || !ownedStore || (!PRODUCT_EDIT_STATUSES.has(ownedStore.subscriptionStatus) && !isAdminManagingStore())) {
    setOwnerMessage('Submit your artist store before adding products.', true);
    return;
  }
  if (!editingProductId && ownedProducts.length >= MAX_PRODUCTS) {
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
  const editingProduct = editingProductId ? ownedProducts.find(product => product.id === editingProductId) : null;
  if (!name || !price || (!editingProduct && !file) || !isValidWebUrl(buyUrl)) {
    setOwnerMessage(`Add a product name, price, valid checkout link${editingProduct ? '' : ', and product image'}.`, true);
    return;
  }
  if (!validation.ok) {
    setOwnerMessage(validation.message, true);
    return;
  }

  saveProductButton.disabled = true;
  setOwnerMessage(file ? 'Uploading product image…' : 'Saving product…');
  try {
    const imageUrl = file
      ? await uploadUserImage({ userId: currentUser.uid, folder: 'merch-products', file })
      : editingProduct?.imageUrl || '';
    const productDetails = {
      name,
      price,
      description,
      options,
      buyUrl,
      imageUrl,
      published,
      updatedAt: serverTimestamp()
    };
    if (editingProduct) {
      await updateDoc(doc(db, 'merchProducts', editingProduct.id), productDetails);
    } else {
      await addDoc(collection(db, 'merchProducts'), {
        storeId: ownedBand.id,
        ownerId: ownedStore.ownerId || currentUser.uid,
        bandName: ownedStore.bandName || ownedBand.displayName || 'BANDtroductions Band',
        ...productDetails,
        sortOrder: ownedProducts.length + 1,
        createdAt: serverTimestamp()
      });
    }
    const wasEditing = Boolean(editingProduct);
    resetProductForm();
    await loadOwnerProducts();
    if (wasEditing) setOwnerMessage('Product changes saved.');
    else setOwnerMessage(ACTIVE_STATUSES.has(ownedStore.subscriptionStatus)
      ? 'Product added to your store.'
      : 'Draft product saved. It will stay hidden until your store is approved.');
  } catch (error) {
    console.error(error);
    setOwnerMessage(storageUnavailableMessage(error), true);
  } finally {
    saveProductButton.disabled = !editingProductId && ownedProducts.length >= MAX_PRODUCTS;
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
