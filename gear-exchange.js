import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { isAdminAccount } from './admin-access.js';

const grid=document.getElementById('gear-listings'),status=document.getElementById('gear-status'),count=document.getElementById('gear-result-count');
const search=document.getElementById('gear-search'),category=document.getElementById('gear-category'),condition=document.getElementById('gear-condition'),sort=document.getElementById('gear-sort'),mineButton=document.getElementById('my-listings-button');
let listings=[],currentUser=null,mineOnly=false;
const categories=['Guitar','Bass','Drums / Percussion','Amp / Cabinet','Pedals / Effects','PA / Live Sound','Recording Gear','Keys / Synth','Microphones','Accessories','Other'];
categories.forEach(value=>category.add(new Option(value,value)));

function esc(value=''){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char]));}
function millis(stamp){return stamp?.toMillis?.()||stamp?.seconds*1000||0;}
function money(value){const number=Number(value);return Number.isFinite(number)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(number):'$—';}
function isActiveFeatured(item){return item.featured===true&&(!item.featuredUntil||millis(item.featuredUntil)>Date.now());}
function isExpired(item){return item.status==='active'&&item.expiresAt&&millis(item.expiresAt)<Date.now();}
function when(stamp){if(!stamp?.toDate)return 'Recently';return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(stamp.toDate());}
function detailsUrl(item){return `gear-detail.html?id=${encodeURIComponent(item.id)}`;}

function filtered(){
  const term=search.value.trim().toLowerCase();
  return listings.filter(item=>{
    if(item.published===false||item.status==='removed'||isExpired(item))return false;
    if(mineOnly&&item.sellerId!==currentUser?.uid)return false;
    if(category.value&&item.category!==category.value)return false;
    if(condition.value&&item.condition!==condition.value)return false;
    if(term&&!([item.title,item.description,item.category,item.city,item.state,item.sellerName].filter(Boolean).join(' ').toLowerCase().includes(term)))return false;
    return true;
  }).sort((a,b)=>{
    const feature=Number(isActiveFeatured(b))-Number(isActiveFeatured(a));if(feature)return feature;
    if(sort.value==='price-low')return Number(a.price||0)-Number(b.price||0);
    if(sort.value==='price-high')return Number(b.price||0)-Number(a.price||0);
    return millis(b.createdAt)-millis(a.createdAt);
  });
}

function ownerTools(item){
  const owner=currentUser?.uid===item.sellerId,admin=isAdminAccount(currentUser);if(!owner&&!admin)return '';
  const premiumAction=admin&&item.premiumRequested&&!isActiveFeatured(item)?`<button data-action="feature">ACTIVATE FEATURED</button>`:'';
  const soldAction=owner&&item.status!=='sold'?`<button data-action="sold">MARK SOLD</button>`:'';
  const renewAction=owner?`<button data-action="renew">RENEW 30 DAYS</button>`:'';
  return `<div class="gear-owner-tools">${soldAction}${renewAction}${premiumAction}<button class="danger" data-action="remove">REMOVE</button></div>`;
}

function card(item){
  const featured=isActiveFeatured(item),sold=item.status==='sold';
  const article=document.createElement('article');article.className=`gear-card-live${featured?' is-featured':''}`;article.dataset.id=item.id;
  article.innerHTML=`<a class="gear-card-image" href="${detailsUrl(item)}"><img src="${esc(item.imageUrl)}" alt="${esc(item.title)}" loading="lazy">${featured?'<span class="gear-featured-badge">FEATURED</span>':''}${sold?'<span class="gear-sold-badge">SOLD</span>':''}</a><div class="gear-card-body"><div class="gear-card-top"><h3>${esc(item.title)}</h3><div class="gear-card-price">${money(item.price)}</div></div><div class="gear-card-meta"><span>${esc(item.condition)}</span><span>${esc(item.category)}</span><span>${esc(item.saleType||'For Sale')}</span></div><div class="gear-card-location">📍 ${esc([item.city,item.state].filter(Boolean).join(', '))}</div><div class="gear-card-seller"><span>By ${esc(item.sellerName||'BANDtroductions Member')}</span><span>Listed ${esc(when(item.createdAt))}</span></div><div class="gear-card-actions"><a class="gear-button" href="${detailsUrl(item)}">VIEW</a>${!sold?`<a class="gear-button gear-button-primary" href="messages.html?to=${encodeURIComponent(item.sellerId||'')}">MESSAGE</a>`:''}</div></div>${ownerTools(item)}`;
  article.addEventListener('click',handleCardAction);return article;
}

function render(){
  const visible=filtered();grid.replaceChildren();count.textContent=`${visible.length} LISTING${visible.length===1?'':'S'}`;status.hidden=true;
  if(!visible.length){const empty=document.createElement('div');empty.className='gear-empty';empty.innerHTML=`<h3>${mineOnly?'You have no active listings yet.':'No gear matches those filters.'}</h3><p>${mineOnly?'List something and we’ll share it with the Community automatically.':'Try clearing a filter or be the first to fill this rack.'}</p><a class="gear-button gear-button-primary" href="submit-gear.html">LIST GEAR FREE</a>`;grid.appendChild(empty);return;}
  visible.forEach(item=>grid.appendChild(card(item)));
}

async function syncCommunityStatus(item,nextStatus){if(!item.communityPostId)return;const label=nextStatus==='sold'?'🔴 SOLD':'🎸 NEW GEAR LISTING';const content=`${label}\n${item.title} — ${money(item.price)}\n${[item.city,item.state].filter(Boolean).join(', ')} · ${item.condition}\nView the listing or message the seller on BANDtroductions.`;try{await updateDoc(doc(db,'posts',item.communityPostId),{content,gearStatus:nextStatus,updatedAt:serverTimestamp()});}catch(error){console.warn('Gear status changed, but Community post could not be updated.',error);}}
async function handleCardAction(event){
  const button=event.target.closest('button[data-action]');if(!button)return;event.preventDefault();const item=listings.find(row=>row.id===button.closest('[data-id]')?.dataset.id);if(!item||!currentUser)return;const action=button.dataset.action;button.disabled=true;
  try{
    if(action==='sold'){if(!confirm(`Mark “${item.title}” sold?`))return;await updateDoc(doc(db,'gearListings',item.id),{status:'sold',soldAt:serverTimestamp(),updatedAt:serverTimestamp()});await syncCommunityStatus(item,'sold');}
    if(action==='renew'){const expires=new Date();expires.setDate(expires.getDate()+30);await updateDoc(doc(db,'gearListings',item.id),{status:'active',published:true,expiresAt:Timestamp.fromDate(expires),renewedAt:serverTimestamp(),updatedAt:serverTimestamp()});}
    if(action==='remove'){if(!confirm(`Remove “${item.title}” from the Gear Exchange?`))return;await updateDoc(doc(db,'gearListings',item.id),{published:false,status:'removed',removedAt:serverTimestamp(),updatedAt:serverTimestamp()});if(item.communityPostId)await updateDoc(doc(db,'posts',item.communityPostId),{published:false,updatedAt:serverTimestamp()}).catch(()=>{});}
    if(action==='feature'){if(!confirm(`Confirm payment and feature “${item.title}” for 7 days?`))return;const until=new Date();until.setDate(until.getDate()+7);await updateDoc(doc(db,'gearListings',item.id),{featured:true,premiumRequested:false,featuredAt:serverTimestamp(),featuredUntil:Timestamp.fromDate(until),updatedAt:serverTimestamp()});await addDoc(collection(db,'notifications'),{recipientId:item.sellerId,actorId:currentUser.uid,actorName:'BANDtroductions Admin',type:'gear-featured',message:`Your ${item.title} listing is now featured for 7 days.`,linkUrl:detailsUrl(item),read:false,createdAt:serverTimestamp()});}
  }catch(error){console.error(error);alert(error?.code==='permission-denied'?'The Gear Exchange permissions blocked that change.':'That listing could not be updated.');}finally{button.disabled=false;}
}

[search,category,condition,sort].forEach(control=>control.addEventListener(control===search?'input':'change',render));
mineButton.addEventListener('click',()=>{if(!currentUser){location.href=`login.html?returnTo=${encodeURIComponent('gear-exchange.html')}`;return}mineOnly=!mineOnly;mineButton.textContent=mineOnly?'SHOW ALL LISTINGS':'MY LISTINGS';mineButton.classList.toggle('gear-button-primary',mineOnly);render();});
onAuthStateChanged(auth,user=>{currentUser=user;render();});
onSnapshot(query(collection(db,'gearListings'),where('published','==',true)),snapshot=>{listings=snapshot.docs.map(item=>({id:item.id,...item.data()}));render();},error=>{console.error(error);status.hidden=false;status.textContent=error?.code==='permission-denied'?'Gear Exchange database permissions need to be enabled.':'The Gear Exchange could not load. Please try again.';count.textContent='UNAVAILABLE';});
