import { app, auth, db } from './firebase-dev.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';
import { collection, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { uploadUserImage, validateImageFile, storageUnavailableMessage } from './storage-upload.js';
import { isAdminAccount } from './admin-access.js';

const ACTIVE_STATUSES = new Set(['active', 'comped']);
const functions = getFunctions(app, 'us-central1');
const saveBusinessStoreRequest = httpsCallable(functions, 'saveBusinessStoreRequest');
const getBusinessStore = httpsCallable(functions, 'getBusinessStore');

const businessGrid = document.getElementById('business-store-grid');
const selectedSection = document.getElementById('selected-business');
const selectedHead = document.getElementById('selected-business-head');
const selectedBody = document.getElementById('selected-business-body');
const ownerSummary = document.getElementById('owner-summary');
const ownerActions = document.getElementById('owner-actions');
const ownerMessage = document.getElementById('owner-message');
const businessForm = document.getElementById('business-form');
const submitButton = document.getElementById('submit-business');
const logoInput = document.getElementById('business-logo');
const logoLabel = document.getElementById('business-logo-label');

let publicBusinesses = [];
let currentUser = null;
let ownedStore = null;
let currentUserIsAdmin = false;
let adminManagedStoreId = '';

function clean(value) {
  return String(value || '').trim();
}

function initials(name) {
  return clean(name).split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'BT';
}

function isValidWebUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch (_) {
    return false;
  }
}

function setOwnerMessage(message, isError = false) {
  ownerMessage.textContent = message || '';
  ownerMessage.classList.toggle('error', Boolean(isError));
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

function createBusinessImage(store, className = '') {
  if (!store.logoImageUrl) {
    const fallback = document.createElement('div');
    fallback.className = className || 'business-fallback';
    fallback.textContent = initials(store.businessName);
    fallback.setAttribute('aria-hidden', 'true');
    return fallback;
  }
  const image = document.createElement('img');
  image.className = className;
  image.src = store.logoImageUrl;
  image.alt = `${store.businessName || 'Music business'} logo`;
  image.loading = 'lazy';
  return image;
}

function addExternalLink(container, label, href, className = 'button primary') {
  if (!href) return;
  const link = document.createElement('a');
  link.className = className;
  link.href = href;
  link.textContent = label;
  link.target = '_blank';
  link.rel = 'noopener';
  container.appendChild(link);
}

function renderBusinesses() {
  businessGrid.replaceChildren();
  if (!publicBusinesses.length) {
    showEmpty(businessGrid, 'The first music-business storefronts are coming soon.', 'Studios, print shops, builders and other scene-supporting businesses will appear here after approval.');
    return;
  }

  publicBusinesses.forEach(store => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'business-card';
    button.classList.toggle('featured', store.featured === true);
    button.dataset.storeId = store.id;
    button.appendChild(createBusinessImage(store));
    const copy = document.createElement('span');
    copy.className = 'business-card-copy';
    if (store.featured === true) {
      const badge = document.createElement('em');
      badge.className = 'featured-badge';
      badge.textContent = 'FEATURED SCENE PARTNER';
      copy.appendChild(badge);
    }
    const name = document.createElement('strong');
    name.textContent = store.businessName || 'Music Business';
    const category = document.createElement('small');
    category.textContent = store.category || 'Music Service';
    const location = document.createElement('span');
    location.textContent = store.location || 'Serving the independent music scene';
    copy.append(name, category, location);
    if (store.featured === true && store.memberOffer) {
      const offer = document.createElement('span');
      offer.textContent = store.memberOffer;
      copy.appendChild(offer);
    }
    button.appendChild(copy);
    button.addEventListener('click', () => openBusiness(store.id, true));
    businessGrid.appendChild(button);
  });
}

function renderBusinessPresentation(store, previewNote = '') {
  selectedHead.replaceChildren();
  selectedBody.replaceChildren();
  const logo = createBusinessImage(store, 'store-logo');
  const title = document.createElement('div');
  title.className = 'store-title';
  const heading = document.createElement('h2');
  heading.textContent = store.businessName || 'Music Business';
  const category = document.createElement('p');
  category.className = 'category';
  category.textContent = store.category || 'Music Service';
  const location = document.createElement('p');
  location.className = 'store-location';
  location.textContent = store.location || '';
  title.append(heading, category, location);
  selectedHead.append(logo, title);

  if (previewNote) {
    const preview = document.createElement('strong');
    preview.className = 'store-preview-note';
    preview.textContent = previewNote;
    selectedBody.appendChild(preview);
  }
  const divider = document.createElement('div');
  divider.className = 'store-divider';
  divider.setAttribute('aria-hidden', 'true');
  selectedBody.appendChild(divider);

  if (store.memberOffer) {
    const offer = document.createElement('p');
    offer.className = 'store-offer';
    offer.textContent = `BANDtroductions offer: ${store.memberOffer}`;
    selectedBody.appendChild(offer);
  }
  if (store.tagline) {
    const tagline = document.createElement('p');
    tagline.className = 'store-offer';
    tagline.textContent = store.tagline;
    selectedBody.appendChild(tagline);
  }
  const description = document.createElement('p');
  description.className = 'store-description';
  description.textContent = store.businessDescription || 'This business supports the independent music scene.';
  selectedBody.appendChild(description);

  const actions = document.createElement('div');
  actions.className = 'store-actions';
  if (isValidWebUrl(store.websiteUrl)) addExternalLink(actions, 'VISIT BUSINESS', store.websiteUrl);
  if (store.contactEmail) addExternalLink(actions, 'EMAIL BUSINESS', `mailto:${store.contactEmail}`, 'button secondary');
  selectedBody.appendChild(actions);
}

function openBusiness(storeId, updateHistory = false) {
  const store = publicBusinesses.find(item => item.id === storeId);
  if (!store) return;
  selectedSection.hidden = false;
  renderBusinessPresentation(store);
  if (updateHistory) {
    const url = new URL(location.href);
    url.searchParams.set('business', store.id);
    history.pushState({ businessId: store.id }, '', url);
  }
  selectedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

onSnapshot(query(collection(db, 'merchStorefronts'), where('published', '==', true)), snapshot => {
  publicBusinesses = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
    .filter(store => store.published === true && store.storeKind === 'business')
    .sort((a, b) => Number(b.featured === true) - Number(a.featured === true) || clean(a.businessName).localeCompare(clean(b.businessName)));
  renderBusinesses();
  const requested = new URLSearchParams(location.search).get('business');
  if (requested && publicBusinesses.some(store => store.id === requested)) openBusiness(requested, false);
}, error => {
  console.error('Could not load business storefronts:', error);
  showEmpty(businessGrid, 'Business storefronts could not be loaded.', 'Please refresh the page and try again.');
});

function createActionButton(label, handler, className = 'button primary') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function createLoginLink() {
  const link = document.createElement('a');
  link.className = 'button primary';
  link.href = 'login.html?returnTo=business-hub.html';
  link.textContent = 'LOGIN / CREATE ACCOUNT';
  return link;
}

function createSwitchButton() {
  return createActionButton('SWITCH ACCOUNT', async event => {
    event.currentTarget.disabled = true;
    try {
      await signOut(auth);
      location.href = 'login.html?returnTo=business-hub.html';
    } catch (error) {
      console.error(error);
      event.currentTarget.disabled = false;
      setOwnerMessage('That account could not be signed out. Please refresh and try again.', true);
    }
  }, 'button secondary');
}

function populateForm() {
  document.getElementById('business-name').value = ownedStore?.businessName || '';
  document.getElementById('business-category').value = ownedStore?.category || '';
  document.getElementById('business-email').value = ownedStore?.contactEmail || currentUser?.email || '';
  document.getElementById('business-location').value = ownedStore?.location || '';
  document.getElementById('business-website').value = ownedStore?.websiteUrl || '';
  document.getElementById('business-tagline').value = ownedStore?.tagline || '';
  document.getElementById('business-description').value = ownedStore?.businessDescription || '';
  document.getElementById('business-offer').value = ownedStore?.memberOffer || '';
  document.getElementById('business-agreement').checked = ownedStore?.sellerAgreementAccepted === true;
  logoInput.required = !ownedStore?.logoImageUrl;
  logoLabel.firstChild.textContent = ownedStore?.logoImageUrl ? 'Replace business logo or storefront image (optional)' : 'Business logo or storefront image';
}

function renderStoreApplication() {
  businessForm.hidden = false;
  submitButton.textContent = ownedStore ? 'SAVE BUSINESS DETAILS' : 'SUBMIT BUSINESS';
  populateForm();
  if (currentUserIsAdmin && adminManagedStoreId) {
    ownerSummary.textContent = `ADMIN MODE — managing ${ownedStore?.businessName || 'this business'} storefront.`;
    return;
  }
  if (!ownedStore) ownerSummary.textContent = 'Submit your music-related business for review. Nothing appears publicly until BANDtroductions approves it.';
  else if (ownedStore.subscriptionStatus === 'comped') ownerSummary.textContent = `${ownedStore.businessName} is active as a billing-exempt launch partner.`;
  else if (ownedStore.subscriptionStatus === 'active') ownerSummary.textContent = `${ownedStore.businessName}'s Business Hub storefront is active.`;
  else if (ownedStore.subscriptionStatus === 'paused') ownerSummary.textContent = `${ownedStore.businessName}'s storefront is paused. Your business information remains saved.`;
  else ownerSummary.textContent = `${ownedStore.businessName}'s submission is awaiting approval and subscription confirmation.`;
}

async function findOwnedStore(user) {
  const result = await getBusinessStore({ storeId: adminManagedStoreId || '' });
  return result.data?.store || null;
}

async function loadOwnerState(user) {
  currentUser = user;
  currentUserIsAdmin = isAdminAccount(user);
  adminManagedStoreId = currentUserIsAdmin ? new URLSearchParams(location.search).get('manage') || '' : '';
  ownedStore = null;
  businessForm.hidden = true;
  ownerActions.replaceChildren();
  setOwnerMessage('');
  submitButton.disabled = false;

  if (!user) {
    ownerSummary.textContent = 'Log in or create a BANDtroductions account to submit your music-related business.';
    ownerActions.appendChild(createLoginLink());
    return;
  }

  ownerSummary.textContent = 'Checking your Business Hub access…';
  try {
    if (adminManagedStoreId) {
      ownedStore = await findOwnedStore(user);
      if (!ownedStore) {
        ownerSummary.textContent = 'ADMIN MODE — that business storefront could not be found.';
        return;
      }
      renderStoreApplication();
      const back = document.createElement('a');
      back.className = 'button secondary';
      back.href = 'admin.html';
      back.textContent = 'BACK TO CONTROL ROOM';
      ownerActions.appendChild(back);
      ownerActions.appendChild(createActionButton('PREVIEW STOREFRONT', () => {
        selectedSection.hidden = false;
        renderBusinessPresentation(ownedStore, ACTIVE_STATUSES.has(ownedStore.subscriptionStatus) ? 'Current public storefront' : 'ADMIN PREVIEW — hidden from visitors');
        selectedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
      return;
    }

    ownedStore = await findOwnedStore(user);
    renderStoreApplication();
    if (ownedStore && ACTIVE_STATUSES.has(ownedStore.subscriptionStatus)) {
      const view = document.createElement('a');
      view.className = 'button primary';
      view.href = `business-hub.html?business=${encodeURIComponent(ownedStore.id)}`;
      view.textContent = 'VIEW MY STOREFRONT';
      ownerActions.appendChild(view);
    }
    ownerActions.appendChild(createSwitchButton());
  } catch (error) {
    console.error('Could not load Business Hub owner tools:', error);
    ownerSummary.textContent = 'Your Business Hub access could not be checked right now.';
    setOwnerMessage('Please refresh and try again.', true);
  }
}

businessForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser) return;
  const businessName = clean(document.getElementById('business-name').value);
  const category = clean(document.getElementById('business-category').value);
  const contactEmail = clean(document.getElementById('business-email').value);
  const businessLocation = clean(document.getElementById('business-location').value);
  const websiteUrl = clean(document.getElementById('business-website').value);
  const tagline = clean(document.getElementById('business-tagline').value);
  const businessDescription = clean(document.getElementById('business-description').value);
  const memberOffer = clean(document.getElementById('business-offer').value);
  const agreementAccepted = document.getElementById('business-agreement').checked;
  const file = logoInput.files?.[0];
  const validation = validateImageFile(file);
  if (!businessName || !category || !contactEmail || !businessLocation || !isValidWebUrl(websiteUrl) || !businessDescription || !agreementAccepted || (!ownedStore?.logoImageUrl && !file)) {
    setOwnerMessage('Complete the required business information, add a valid website and accept the seller agreement.', true);
    return;
  }
  if (!validation.ok) {
    setOwnerMessage(validation.message, true);
    return;
  }

  submitButton.disabled = true;
  setOwnerMessage(file ? 'Uploading your business image…' : 'Saving your business storefront…');
  try {
    const logoImageUrl = file ? await uploadUserImage({ userId: currentUser.uid, folder: 'business-storefronts', file }) : ownedStore.logoImageUrl;
    const result = await saveBusinessStoreRequest({
      storeId: adminManagedStoreId || '',
      businessName,
      category,
      contactEmail,
      location: businessLocation,
      websiteUrl,
      tagline,
      businessDescription,
      memberOffer,
      logoImageUrl,
      sellerAgreementAccepted: agreementAccepted
    });
    const status = result.data?.subscriptionStatus || 'pending';
    await loadOwnerState(currentUser);
    setOwnerMessage(ACTIVE_STATUSES.has(status) ? 'Business storefront details saved.' : 'Business submitted. BANDtroductions will review it and connect the $35/month subscription before it goes live.');
  } catch (error) {
    console.error(error);
    const message = clean(error?.message).replace(/^Firebase(?:Error)?:\s*/i, '').replace(/\s*\([^)]*\)\.?$/, '').trim();
    setOwnerMessage(message || storageUnavailableMessage(error), true);
    submitButton.disabled = false;
  }
});

window.addEventListener('popstate', event => {
  const storeId = event.state?.businessId || new URLSearchParams(location.search).get('business');
  if (storeId) openBusiness(storeId, false);
  else selectedSection.hidden = true;
});

onAuthStateChanged(auth, loadOwnerState);
