import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { doc, getDoc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const WELCOME_VERSION = 2;
const PRESENTED_KEY = 'btWelcomeV2Presented';
const MEMBER_DEVICE_KEY = 'btWelcomeV2MemberSeen';
const params = new URLSearchParams(location.search);

const safeGet = key => { try { return localStorage.getItem(key); } catch { return null; } };
const safeSet = (key,value) => { try { localStorage.setItem(key,value); } catch {} };
const safeRemove = key => { try { localStorage.removeItem(key); } catch {} };

function markPresented(){ safeSet(PRESENTED_KEY,String(WELCOME_VERSION)); }

async function markMemberSeen(user){
  if(!user) return;
  try{
    await setDoc(doc(db,'users',user.uid),{
      welcomeIntroVersion:WELCOME_VERSION,
      welcomeIntroSeenAt:serverTimestamp()
    },{merge:true});
    safeSet(MEMBER_DEVICE_KEY,String(WELCOME_VERSION));
    safeRemove(PRESENTED_KEY);
  }catch(error){
    console.warn('Could not save BANDtroductions welcome state.',error);
  }
}

function styles(){
  const style=document.createElement('style');
  style.id='bt-welcome-v2-style';
  style.textContent=`
  .bt-w2-overlay{position:fixed;inset:0;z-index:120000;display:grid;place-items:center;padding:10px;background:rgba(0,0,0,.82);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
  .bt-w2-card{position:relative;width:min(680px,calc(100vw - 16px));max-height:calc(100dvh - 16px);overflow:hidden;border:1.5px solid #25c7c1;border-radius:22px;background:#041011;box-shadow:0 22px 70px #000d,0 0 24px #25c7c12e}
  .bt-w2-close{position:absolute;right:12px;top:10px;z-index:4;width:38px;height:38px;border-radius:50%;border:1px solid #25c7c1;background:#071516;color:#fff;font:700 25px/1 Arial;cursor:pointer}
  .bt-w2-hero{padding:20px 20px 14px;text-align:center;background:linear-gradient(180deg,rgba(1,8,9,.24),rgba(1,8,9,.92)),url("bt-hero-horns-user.jpg?v=20260907c") center/cover no-repeat}
  .bt-w2-logo{width:70px;height:70px;object-fit:contain;display:block;margin:0 auto 4px}
  .bt-w2-brand{margin:0;color:#fff;font-size:clamp(31px,7vw,54px);font-weight:1000;letter-spacing:-.045em;line-height:.98}.bt-w2-brand span{color:#25c7c1}
  .bt-w2-tag{margin:7px 0 0;color:#78fff8;font-weight:900;font-size:clamp(11px,2.7vw,15px)}
  .bt-w2-copy{max-width:590px;margin:14px auto 0;color:#eef5f4;font-size:clamp(12px,2.6vw,16px);line-height:1.45}.bt-w2-copy strong{color:#4ce1da}
  .bt-w2-actions{display:grid;gap:8px;margin:15px auto 0;max-width:470px}
  .bt-w2-btn{display:flex;align-items:center;justify-content:center;min-height:43px;padding:9px 14px;border:1px solid #25c7c1;border-radius:8px;background:#071213;color:#fff;text-decoration:none;font:900 clamp(11px,2.7vw,14px)/1.1 Arial;cursor:pointer}
  .bt-w2-btn.primary{background:#25c7c1;color:#031110}.bt-w2-btn:hover{filter:brightness(1.08)}
  .bt-w2-upgrade{margin:9px auto 0;min-height:36px;width:min(330px,88%);border-radius:999px;color:#dffffd}
  .bt-w2-swipe-label{margin:10px 0 7px;text-align:center;color:#6ce8e2;font-size:10px;font-weight:900;letter-spacing:.04em}
  .bt-w2-cards{display:flex;gap:9px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:0 14px 15px}.bt-w2-cards::-webkit-scrollbar{display:none}
  .bt-w2-feature{flex:0 0 min(31%,175px);min-width:142px;scroll-snap-align:start;border:1px solid #25c7c17a;border-radius:13px;overflow:hidden;background:#071111;pointer-events:none}
  .bt-w2-feature-art{height:78px;background:linear-gradient(180deg,#0001,#0008),url("bt-wide-crowd.jpg?v=20260907b") center/cover no-repeat}
  .bt-w2-feature:nth-child(2) .bt-w2-feature-art{background-image:linear-gradient(180deg,#0001,#0008),url("bt-hero-concert.jpg")}
  .bt-w2-feature:nth-child(3) .bt-w2-feature-art{background-image:linear-gradient(180deg,#0001,#0008),url("bt-shows-crowd.jpg?v=20260907b")}
  .bt-w2-feature:nth-child(4) .bt-w2-feature-art{background-image:linear-gradient(180deg,#0001,#0008),url("bt-header-stage-clean.webp?v=20260907-header11")}
  .bt-w2-feature:nth-child(5) .bt-w2-feature-art{background-image:linear-gradient(180deg,#0001,#0008),url("bt-radio-speaker-frame.webp?v=20260907-radio2")}
  .bt-w2-feature:nth-child(6) .bt-w2-feature-art{background-image:linear-gradient(180deg,#0001,#0008),url("bt-wide-crowd.jpg?v=20260907b")}
  .bt-w2-feature-body{padding:8px 8px 10px}.bt-w2-feature b{display:block;color:#fff;font-size:12px;margin-bottom:3px}.bt-w2-feature span{display:block;color:#aebbbb;font-size:9px;line-height:1.3}
  .bt-w2-info{position:fixed;inset:0;z-index:120010;display:none;place-items:center;padding:18px;background:rgba(0,0,0,.72);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)}
  .bt-w2-info.is-open{display:grid}.bt-w2-info-card{width:min(440px,94vw);max-height:90dvh;overflow:auto;border:1.5px solid #25c7c1;border-radius:20px;background:#061112;box-shadow:0 18px 60px #000b;padding:21px}
  .bt-w2-info-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.bt-w2-info h2{margin:0;color:#67e8e2;font-size:23px}.bt-w2-info-x{width:36px;height:36px;border-radius:50%;border:1px solid #25c7c1;background:#061112;color:#fff;font-size:23px;cursor:pointer}
  .bt-w2-info-copy{color:#d8e2e1;font-size:13px;line-height:1.48}
  .bt-w2-info-list{display:grid;gap:7px}.bt-w2-info-item{padding:9px 10px;border:1px solid #25c7c138;border-radius:10px;background:#0b1919}.bt-w2-info-item b{display:block;font-size:12px}.bt-w2-info-item span{display:block;margin-top:2px;color:#9fb0ae;font-size:11px;line-height:1.35}
  .bt-w2-info-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px;padding-top:13px;border-top:1px solid #25c7c136}.bt-w2-price{font-size:20px;font-weight:1000}.bt-w2-price small{display:block;color:#91a3a1;font-size:9px;font-weight:700}
  .bt-w2-info-actions{display:flex;gap:7px}.bt-w2-mini{white-space:nowrap;border:1px solid #25c7c1;border-radius:999px;padding:9px 12px;font-size:11px;font-weight:900;cursor:pointer}.bt-w2-mini.secondary{background:transparent;color:#dffffd}.bt-w2-mini.primary{background:#25c7c1;color:#031110}
  @media(max-height:760px){.bt-w2-hero{padding:12px 16px 8px}.bt-w2-logo{width:48px;height:48px}.bt-w2-copy{margin-top:8px}.bt-w2-actions{margin-top:9px;gap:5px}.bt-w2-btn{min-height:34px;padding:6px 10px}.bt-w2-upgrade{min-height:30px;margin-top:6px}.bt-w2-swipe-label{margin:6px 0 4px}.bt-w2-feature-art{height:58px}.bt-w2-cards{padding-bottom:9px}}
  @media(max-width:520px){.bt-w2-feature{flex-basis:31%;min-width:126px}.bt-w2-info-footer{align-items:flex-end}.bt-w2-info-actions{gap:5px}.bt-w2-mini{padding:8px 10px;font-size:10px}}
  `;
  document.head.appendChild(style);
  return style;
}

function feature(title,copy){return `<article class="bt-w2-feature"><div class="bt-w2-feature-art"></div><div class="bt-w2-feature-body"><b>${title}</b><span>${copy}</span></div></article>`; }

function mount(user){
  markPresented();
  document.body.style.overflow='hidden';
  const style=styles();
  const overlay=document.createElement('div');
  overlay.className='bt-w2-overlay';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-label','Welcome to BANDtroductions');
  overlay.innerHTML=`
    <section class="bt-w2-card">
      <button class="bt-w2-close" type="button" aria-label="Close welcome">×</button>
      <div class="bt-w2-hero">
        <img class="bt-w2-logo" src="IMG_9367.png" alt="">
        <h1 class="bt-w2-brand">BAND<span>troductions</span></h1>
        <p class="bt-w2-tag">The Social Platform for Local Music. Everywhere.</p>
        <p class="bt-w2-copy">Discover independent bands, musicians, venues, music videos, shows, merch, community, radio and band websites — <strong>all in one place.</strong></p>
        <div class="bt-w2-actions">
          <a class="bt-w2-btn primary" href="signup.html?returnTo=index.html">JOIN THE SCENE — FREE</a>
          <a class="bt-w2-btn" href="login.html?returnTo=index.html">LOG IN</a>
          <button class="bt-w2-btn" type="button" data-explore>EXPLORE BANDTRODUCTIONS</button>
        </div>
        <button class="bt-w2-btn bt-w2-upgrade" type="button" data-upgrade>UPGRADE PROFILE · LEARN MORE</button>
        <div class="bt-w2-swipe-label">← Swipe to explore features →</div>
      </div>
      <div class="bt-w2-cards" aria-label="BANDtroductions features">
        ${feature('Discover Bands','Find independent artists and new music.')}
        ${feature('Music Videos','Watch performances and artist videos.')}
        ${feature('Live Shows','See upcoming shows and events.')}
        ${feature('Community','Join the conversation with the scene.')}
        ${feature('BANDtroductions Radio','Hear independent artists while you browse.')}
        ${feature('Artist Tools','Booking, merch, domains and website tools.')}
      </div>
    </section>`;

  const info=document.createElement('div');
  info.className='bt-w2-info';
  info.innerHTML=`
    <section class="bt-w2-info-card" role="dialog" aria-modal="true" aria-label="Upgrade your profile">
      <div class="bt-w2-info-head"><h2>Upgrade Your Profile</h2><button class="bt-w2-info-x" type="button" aria-label="Close upgrade information">×</button></div>
      <p class="bt-w2-info-copy">Turn your BANDtroductions profile into a stronger home for your band with built-in tools for your website, booking, merch, domain, music, videos and promotion.</p>
      <div class="bt-w2-info-list">
        <div class="bt-w2-info-item"><b>Customizable band website template</b><span>Personalize the available design options, content, imagery and band information.</span></div>
        <div class="bt-w2-info-item"><b>Booking tools</b><span>Let venues request dates and keep approved shows connected to your calendar.</span></div>
        <div class="bt-w2-info-item"><b>Merch integration</b><span>Bring your band’s store into the same BANDtroductions experience.</span></div>
        <div class="bt-w2-info-item"><b>Custom domain connection</b><span>Use your own band domain with your upgraded BANDtroductions website.</span></div>
        <div class="bt-w2-info-item"><b>Music, videos & promotion</b><span>Keep the content you already add to BANDtroductions working across your band presence.</span></div>
      </div>
      <div class="bt-w2-info-footer">
        <div class="bt-w2-price">$15/month<small>Profile upgrades are optional.</small></div>
        <div class="bt-w2-info-actions"><button class="bt-w2-mini secondary" type="button" data-got-it>Got it</button><button class="bt-w2-mini primary" type="button" data-upgrade-now>Upgrade Now</button></div>
      </div>
    </section>`;

  const close=()=>{overlay.remove();info.remove();style.remove();document.body.style.overflow='';};
  const closeInfo=()=>info.classList.remove('is-open');
  overlay.querySelector('.bt-w2-close').onclick=close;
  overlay.querySelector('[data-explore]').onclick=close;
  overlay.querySelector('[data-upgrade]').onclick=()=>info.classList.add('is-open');
  info.querySelector('.bt-w2-info-x').onclick=closeInfo;
  info.querySelector('[data-got-it]').onclick=closeInfo;
  info.addEventListener('click',event=>{if(event.target===info)closeInfo();});
  info.querySelector('[data-upgrade-now]').onclick=()=>{
    if(user){location.href=`website.html?id=${encodeURIComponent(user.uid)}`;return;}
    markPresented();
    location.href='login.html?returnTo='+encodeURIComponent('index.html?upgrade=1');
  };
  document.addEventListener('keydown',function esc(event){if(event.key!=='Escape')return;if(info.classList.contains('is-open'))closeInfo();else{document.removeEventListener('keydown',esc);close();}});
  document.body.append(overlay,info);
  if(user) markMemberSeen(user);
}

let handled=false;
onAuthStateChanged(auth,async user=>{
  if(handled)return;
  handled=true;

  if(user && params.get('upgrade')==='1'){
    location.replace(`website.html?id=${encodeURIComponent(user.uid)}`);
    return;
  }

  if(user){
    try{
      const snap=await getDoc(doc(db,'users',user.uid));
      const version=Number(snap.exists()?snap.data()?.welcomeIntroVersion:0)||0;
      if(version>=WELCOME_VERSION){
        safeSet(MEMBER_DEVICE_KEY,String(WELCOME_VERSION));
        safeRemove(PRESENTED_KEY);
        return;
      }
    }catch(error){
      console.warn('Could not read BANDtroductions welcome state.',error);
    }
    mount(user);
    return;
  }

  if(Number(safeGet(MEMBER_DEVICE_KEY))>=WELCOME_VERSION)return;
  mount(null);
});
