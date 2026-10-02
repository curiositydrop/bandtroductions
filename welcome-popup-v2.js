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
  :root{--btw2-teal:#2bded8;--btw2-teal2:#6feee8}
  .bt-w2-overlay{position:fixed;inset:0;z-index:120000;display:grid;place-items:center;padding:8px;background:rgba(0,0,0,.46);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
  .bt-w2-card{position:relative;width:min(calc(100vw - 14px),calc((100dvh - 14px)*.60));aspect-ratio:795/1325;max-height:calc(100dvh - 14px);border:2px solid rgba(43,222,216,.78);border-radius:24px;overflow:hidden;background:linear-gradient(180deg,rgba(1,7,8,.03) 0%,rgba(1,7,8,.04) 30%,rgba(1,7,8,.5) 48%,rgba(1,7,8,.91) 68%,rgba(1,7,8,.97) 100%),url("bt-wide-crowd.jpg?v=20260907b") center 15%/cover no-repeat;box-shadow:0 18px 60px rgba(0,0,0,.72),0 0 22px rgba(43,222,216,.13)}
  .bt-w2-card:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,transparent 0 33%,rgba(0,0,0,.02) 39%,rgba(0,0,0,.32) 49%,rgba(0,0,0,.82) 63%,rgba(0,0,0,.95) 100%)}
  .bt-w2-close{position:absolute;right:2%;top:1.7%;z-index:5;width:49px;height:49px;border-radius:50%;border:2px solid var(--btw2-teal);background:rgba(0,7,8,.38);color:#fff;font:700 32px/1 Arial;cursor:pointer}
  .bt-w2-inner{position:absolute;inset:0;z-index:2;padding:4.3% 4.4% 2.6%;display:flex;flex-direction:column}
  .bt-w2-brandrow{display:flex;align-items:center;justify-content:center;gap:10px}
  .bt-w2-logo{width:11.5%;max-width:86px;object-fit:contain}
  .bt-w2-brand{margin:0;color:#fff;font-size:clamp(30px,7vw,73px);font-weight:900;letter-spacing:-3px;white-space:nowrap;line-height:.95}.bt-w2-brand span{color:var(--btw2-teal)}
  .bt-w2-tag{margin:.65% 0 0;text-align:center;color:#61e8e2;font-weight:800;font-size:clamp(11px,2.45vw,24px)}
  .bt-w2-hero-gap{flex:0 0 20.5%}
  .bt-w2-copy{max-width:84%;margin:0 auto;text-align:center;color:#f3f6f6;font-size:clamp(12px,2.35vw,26px);line-height:1.46;text-shadow:0 2px 8px #000}.bt-w2-copy strong{color:var(--btw2-teal2)}
  .bt-w2-actions{width:82%;margin:3% auto 0;display:grid;gap:10px}
  .bt-w2-btn{min-height:57px;border-radius:17px;border:2px solid rgba(43,222,216,.82);background:rgba(1,8,9,.74);color:#fff;display:grid;grid-template-columns:42px 1fr 20px;align-items:center;padding:0 18px;font:900 clamp(14px,2.5vw,26px)/1.1 Arial;text-decoration:none;cursor:pointer;text-align:center}
  .bt-w2-btn.primary{background:linear-gradient(180deg,#58eeea,#27d8d2);color:#031111;border-color:#7cf4ef}.bt-w2-btn:hover{filter:brightness(1.06)}
  .bt-w2-btn-icon{font-size:1.05em}.bt-w2-btn-arrow{font-size:1.3em}
  .bt-w2-upgrade{display:block;margin:.8% auto 0;padding:5px 14px;border:1.5px solid rgba(43,222,216,.82);border-radius:999px;background:rgba(1,8,9,.55);color:#fff;font:900 clamp(10px,1.8vw,16px)/1.1 Arial;cursor:pointer}
  .bt-w2-eq{display:flex;align-items:center;justify-content:center;gap:5px;margin:1.4% 0 .4%}.bt-w2-eq:before,.bt-w2-eq:after{content:"";height:1px;width:31%;background:rgba(255,255,255,.25)}.bt-w2-eq i{display:block;width:4px;background:var(--btw2-teal);border-radius:3px}.bt-w2-eq i:nth-child(1){height:13px}.bt-w2-eq i:nth-child(2){height:22px}.bt-w2-eq i:nth-child(3){height:11px}
  .bt-w2-swipe-label{text-align:center;font-size:clamp(10px,1.8vw,17px);color:#dbe7e6;margin-bottom:1.2%}.bt-w2-swipe-label span{color:var(--btw2-teal);padding:0 5%;font-size:1.4em}
  .bt-w2-cards{display:flex;gap:10px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;margin-top:auto;padding:0 1px 1px}.bt-w2-cards::-webkit-scrollbar{display:none}
  .bt-w2-feature{flex:0 0 31.5%;min-width:138px;scroll-snap-align:start;border:1.5px solid rgba(43,222,216,.8);border-radius:16px;overflow:hidden;background:rgba(2,9,10,.89);pointer-events:none}
  .bt-w2-feature-art{height:43%;min-height:78px;background-size:cover;background-position:center}
  .bt-w2-feature:nth-child(1) .bt-w2-feature-art{background-image:url("bt-hero-concert.jpg")}
  .bt-w2-feature:nth-child(2) .bt-w2-feature-art{background-image:url("bt-radio-stage.jpg")}
  .bt-w2-feature:nth-child(3) .bt-w2-feature-art{background-image:url("bt-shows-crowd.jpg?v=20260907b")}
  .bt-w2-feature:nth-child(4) .bt-w2-feature-art{background-image:url("bt-header-stage-clean.webp?v=20260907-header11")}
  .bt-w2-feature:nth-child(5) .bt-w2-feature-art{background-image:url("bt-radio-speaker-frame.webp?v=20260907-radio2")}
  .bt-w2-feature:nth-child(6) .bt-w2-feature-art{background-image:url("bt-wide-crowd.jpg?v=20260907b")}
  .bt-w2-feature-body{position:relative;padding:0 8% 8%}.bt-w2-feature-icon{width:42px;height:42px;margin-top:-21px;margin-bottom:6px;border:2px solid var(--btw2-teal);border-radius:50%;display:grid;place-items:center;background:#061011;color:#fff;font-size:20px}.bt-w2-feature b{display:block;color:#fff;font-size:clamp(11px,2.3vw,21px);margin:0 0 6px}.bt-w2-feature span{display:block;color:#e0e9e8;font-size:clamp(8px,1.5vw,14px);line-height:1.35}
  .bt-w2-dots{display:flex;justify-content:center;gap:9px;padding-top:1.3%}.bt-w2-dot{width:10px;height:10px;border-radius:50%;background:#5f6a69}.bt-w2-dot.active{background:var(--btw2-teal)}
  .bt-w2-info{position:fixed;inset:0;z-index:120010;display:none;place-items:center;padding:18px;background:rgba(0,0,0,.72);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)}
  .bt-w2-info.is-open{display:grid}.bt-w2-info-card{width:min(440px,94vw);max-height:90dvh;overflow:auto;border:1.5px solid #25c7c1;border-radius:20px;background:#061112;box-shadow:0 18px 60px #000b;padding:21px}
  .bt-w2-info-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.bt-w2-info h2{margin:0;color:#67e8e2;font-size:23px}.bt-w2-info-x{width:36px;height:36px;border-radius:50%;border:1px solid #25c7c1;background:#061112;color:#fff;font-size:23px;cursor:pointer}
  .bt-w2-info-copy{color:#d8e2e1;font-size:13px;line-height:1.48}.bt-w2-info-list{display:grid;gap:7px}.bt-w2-info-item{padding:9px 10px;border:1px solid #25c7c138;border-radius:10px;background:#0b1919}.bt-w2-info-item b{display:block;font-size:12px}.bt-w2-info-item span{display:block;margin-top:2px;color:#9fb0ae;font-size:11px;line-height:1.35}
  .bt-w2-info-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px;padding-top:13px;border-top:1px solid #25c7c136}.bt-w2-price{font-size:20px;font-weight:1000}.bt-w2-price small{display:block;color:#91a3a1;font-size:9px;font-weight:700}.bt-w2-info-actions{display:flex;gap:7px}.bt-w2-mini{white-space:nowrap;border:1px solid #25c7c1;border-radius:999px;padding:9px 12px;font-size:11px;font-weight:900;cursor:pointer}.bt-w2-mini.secondary{background:transparent;color:#dffffd}.bt-w2-mini.primary{background:#25c7c1;color:#031110}
  @media(max-width:650px){.bt-w2-card{width:min(calc(100vw - 10px),calc((100dvh - 10px)*.60));max-height:calc(100dvh - 10px)}.bt-w2-close{width:42px;height:42px;font-size:28px}.bt-w2-inner{padding:4.7% 3.4% 2.4%}.bt-w2-brand{font-size:clamp(27px,6.9vw,43px);letter-spacing:-2px}.bt-w2-tag{font-size:clamp(10px,3vw,16px)}.bt-w2-hero-gap{flex-basis:20%}.bt-w2-copy{max-width:90%;font-size:clamp(11px,3vw,16px)}.bt-w2-actions{width:84%;gap:8px}.bt-w2-btn{min-height:49px;border-radius:14px;font-size:clamp(13px,3.5vw,18px);grid-template-columns:31px 1fr 16px;padding:0 13px}.bt-w2-upgrade{font-size:10px}.bt-w2-feature{flex-basis:31%;min-width:120px}.bt-w2-feature-icon{width:38px;height:38px;margin-top:-19px;font-size:18px}.bt-w2-feature b{font-size:clamp(11px,3vw,16px)}.bt-w2-feature span{font-size:clamp(8px,2.2vw,11px)}}
  `;
  document.head.appendChild(style);
  return style;
}
function feature(title,copy,icon){return `<article class="bt-w2-feature"><div class="bt-w2-feature-art"></div><div class="bt-w2-feature-body"><div class="bt-w2-feature-icon">${icon}</div><b>${title}</b><span>${copy}</span></div></article>`; }
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
      <div class="bt-w2-inner">
        <div class="bt-w2-brandrow">
          <img class="bt-w2-logo" src="IMG_9367.png" alt="">
          <h1 class="bt-w2-brand">BAND<span>troductions</span></h1>
        </div>
        <p class="bt-w2-tag">The Social Platform for Local Music. Everywhere.</p>
        <div class="bt-w2-hero-gap"></div>
        <p class="bt-w2-copy">Discover independent bands, musicians, venues, music videos, shows, merch, community, radio and band websites — <strong>all in one place.</strong></p>
        <div class="bt-w2-actions">
          <a class="bt-w2-btn primary" href="signup.html?returnTo=index.html"><span class="bt-w2-btn-icon">👤+</span><span>JOIN THE SCENE — FREE</span><span class="bt-w2-btn-arrow">›</span></a>
          <a class="bt-w2-btn" href="login.html?returnTo=index.html"><span class="bt-w2-btn-icon">⇥</span><span>LOG IN</span><span class="bt-w2-btn-arrow">›</span></a>
          <button class="bt-w2-btn" type="button" data-explore><span class="bt-w2-btn-icon">⌖</span><span>EXPLORE BANDTRODUCTIONS</span><span class="bt-w2-btn-arrow">›</span></button>
        </div>
        <button class="bt-w2-upgrade" type="button" data-upgrade>UPGRADE PROFILE · LEARN MORE</button>
        <div class="bt-w2-eq"><i></i><i></i><i></i></div>
        <div class="bt-w2-swipe-label"><span>←</span>Swipe to explore features<span>→</span></div>
        <div class="bt-w2-cards" aria-label="BANDtroductions features">
          ${feature('Discover Bands','Find new music, follow your favorites and support local talent.','👥')}
          ${feature('Music Videos','Watch and share local music videos from emerging artists.','▶')}
          ${feature('Live Shows','Find upcoming shows near you and never miss a performance.','▣')}
          ${feature('Community','Join the conversation with the local music scene.','💬')}
          ${feature('BANDtroductions Radio','Hear independent artists while you browse.','♫')}
          ${feature('Artist Tools','Booking, merch, domains and website tools.','⚙')}
        </div>
        <div class="bt-w2-dots"><i class="bt-w2-dot active"></i><i class="bt-w2-dot"></i><i class="bt-w2-dot"></i></div>
      </div>
    </section>`

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
