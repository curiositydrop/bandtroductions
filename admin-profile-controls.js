import { app, auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { deleteDoc, doc, getDoc, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';
import { isAdminAccount } from './admin-access.js';
import { compAccess, compNote, defaultCompExpiresOn, formatCompDate } from './botw-comp-access.mjs?v=1';

const profileId=new URLSearchParams(location.search).get('id');

const style=document.createElement('style');
style.textContent=`
  .admin-profile-panel{border-color:#356b66!important;background:linear-gradient(145deg,#111918,#0d1111)!important}
  .admin-profile-panel h2{color:#0ccfbd}.admin-profile-actions{display:flex;gap:8px;flex-wrap:wrap}
  .admin-profile-actions .auth-button{width:auto!important}.admin-danger{border-color:#8a3d3d!important;color:#ffc0c0!important;background:#180d0d!important}
`;
document.head.appendChild(style);

function waitForContent(){
  return new Promise(resolve=>{
    const content=document.getElementById('profile-content');
    if(content&&!content.hidden){resolve(content);return;}
    const observer=new MutationObserver(()=>{if(content&&!content.hidden){observer.disconnect();resolve(content);}});
    if(content)observer.observe(content,{attributes:true,attributeFilter:['hidden']});
    setTimeout(()=>{observer.disconnect();resolve(content);},8000);
  });
}

onAuthStateChanged(auth,async user=>{
  if(!user||!profileId||!isAdminAccount(user))return;
  const content=await waitForContent();
  if(!content)return;
  const snap=await getDoc(doc(db,'profiles',profileId));
  if(!snap.exists())return;
  const profile=snap.data();
  const dedicatedEditUrl=`profile-setup.html?adminProfile=${encodeURIComponent(profileId)}&editor=3`;

  const ordinaryEdit=document.getElementById('edit-profile');
  if(ordinaryEdit){
    ordinaryEdit.href=dedicatedEditUrl;
    ordinaryEdit.hidden=false;
    ordinaryEdit.style.setProperty('display','inline-flex','important');
  }

  if(document.getElementById('admin-profile-panel'))return;
  const panel=document.createElement('section');
  panel.id='admin-profile-panel';panel.className='profile-card admin-profile-panel';
  const heading=document.createElement('h2');heading.textContent='Admin Controls';
  const note=document.createElement('p');note.className='profile-side-note';note.textContent='These controls are visible only to the BANDtroductions administrator.';
  const actions=document.createElement('div');actions.className='admin-profile-actions';

  const edit=document.createElement('a');edit.className='auth-button';edit.href=dedicatedEditUrl;edit.textContent='Admin Edit';
  const media=document.createElement('a');media.className='auth-button auth-button-secondary';media.href=`media.html?owner=${encodeURIComponent(profileId)}`;media.textContent='Manage Media';
  const publish=document.createElement('button');publish.type='button';publish.className='auth-button auth-button-secondary';publish.textContent=profile.published===false?'Publish Profile':'Unpublish Profile';
  publish.addEventListener('click',async()=>{
    const next=profile.published===false;
    if(!confirm(`${next?'Publish':'Unpublish'} this profile?`))return;
    publish.disabled=true;
    try{await updateDoc(doc(db,'profiles',profileId),{published:next,moderatedAt:serverTimestamp(),moderatedBy:user.uid});location.reload();}
    catch(error){console.error(error);alert('The profile status could not be changed.');publish.disabled=false;}
  });
  const remove=document.createElement('button');remove.type='button';remove.className='auth-button admin-danger';remove.textContent='Delete Profile Listing';
  remove.addEventListener('click',async()=>{
    const label=String(profile.displayName||profile.email||'Unnamed Member').trim();
    if(!confirm(`Delete the public profile listing for "${label}"?\n\nThis cannot be undone, but the member login, posts, and uploaded media will NOT be deleted.`))return;
    remove.disabled=true;
    try{await deleteDoc(doc(db,'profiles',profileId));alert(`The profile listing for "${label}" was deleted. The member login and other content were left intact.`);location.href='community.html';}
    catch(error){console.error(error);alert('The profile listing could not be deleted. Nothing else was changed.');remove.disabled=false;}
  });
  actions.append(edit,media,publish,remove);panel.append(heading,note,actions);
  mountPrizeComp(panel, profile);
  content.appendChild(panel);
});

function callableError(error) {
  return String(error?.message || 'The comp could not be saved.').replace(/^Firebase(?:Error)?:\s*/i, '').replace(/\s*\([^)]*\)\.?$/, '');
}

function mountPrizeComp(panel, profile) {
  const type = String(profile.accountType || '').toLowerCase();
  if (type !== 'band' && type !== 'musician') return;
  const box = document.createElement('div');
  box.style.marginTop = '14px';
  const label = document.createElement('p');
  label.className = 'profile-side-note';
  const date = document.createElement('input');
  date.type = 'date';
  date.setAttribute('aria-label', 'Website + Merch comp end date');
  date.value = defaultCompExpiresOn();
  date.style.cssText = 'padding:8px 10px;border:1px solid #356b66;border-radius:8px;background:#090909;color:#eee;font:inherit;';
  const grant = document.createElement('button');
  grant.type = 'button';
  grant.className = 'auth-button';
  const revoke = document.createElement('button');
  revoke.type = 'button';
  revoke.className = 'auth-button admin-danger';
  revoke.textContent = 'Revoke Website + Merch comp';
  revoke.hidden = true;
  const status = document.createElement('p');
  status.className = 'profile-side-note';
  const actions = document.createElement('div');
  actions.className = 'admin-profile-actions';
  actions.style.marginTop = '8px';
  const setComp = httpsCallable(getFunctions(app, 'us-central1'), 'setBotwWebsiteComp');
  const name = profile.displayName || 'this profile';
  const refreshGrantLabel = () => {
    grant.textContent = `Comp Website + Merch until ${formatCompDate(date.value) || date.value}`;
  };
  date.addEventListener('input', refreshGrantLabel);
  refreshGrantLabel();
  async function loadComp() {
    const snap = await getDoc(doc(db, 'botwWebsiteComps', profileId));
    const comp = snap.exists() ? snap.data() : null;
    const state = compAccess(comp);
    if (state === 'active') {
      label.textContent = compNote(comp);
      date.value = comp.expiresOn;
      refreshGrantLabel();
      revoke.hidden = false;
    } else if (state === 'ended') {
      label.textContent = `The Band of the Week prize for ${name} has ended. Granting again replaces it. No card is stored.`;
      revoke.hidden = true;
    } else {
      label.textContent = 'Grant Website + Merch with no card. It ends on the date below and is not charged. Launch partners and Stripe subscribers are left unchanged.';
      revoke.hidden = true;
    }
  }
  grant.addEventListener('click', async () => {
    const pretty = formatCompDate(date.value) || date.value;
    if (!confirm(`Grant Website + Merch to ${name} through ${pretty}? No card, and no charge. It ends automatically that day.`)) return;
    grant.disabled = true;
    revoke.disabled = true;
    status.textContent = 'Saving the comp…';
    try {
      await setComp({ profileId, expiresOn: date.value });
      status.textContent = `Website + Merch is comped through ${pretty}.`;
      await loadComp();
    } catch (error) {
      console.error(error);
      status.textContent = callableError(error);
    } finally {
      grant.disabled = false;
      revoke.disabled = false;
    }
  });
  revoke.addEventListener('click', async () => {
    if (!confirm(`End the Band of the Week Website + Merch comp for ${name} now? Stripe subscribers and launch partners are not changed.`)) return;
    grant.disabled = true;
    revoke.disabled = true;
    status.textContent = 'Revoking the comp…';
    try {
      await setComp({ profileId, revoke: true });
      status.textContent = 'The Band of the Week comp has ended.';
      await loadComp();
    } catch (error) {
      console.error(error);
      status.textContent = callableError(error);
    } finally {
      grant.disabled = false;
      revoke.disabled = false;
    }
  });
  actions.append(grant, revoke);
  box.append(label, date, actions, status);
  panel.append(box);
  loadComp().catch(error => {
    console.error(error);
    status.textContent = 'The current comp could not be loaded.';
  });
}
