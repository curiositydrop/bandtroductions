import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { doc, getDoc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const WELCOME_VERSION = 2;
const LEGACY_WELCOME_KEY = 'bandtroductions-welcome-v1';

// v2 permanently replaces the original one-time welcome popup.
try { localStorage.setItem(LEGACY_WELCOME_KEY, 'seen'); } catch {}

const PRESENTED_KEY = 'btWelcomeV2Presented';
const MEMBER_DEVICE_KEY = 'btWelcomeV2MemberSeen';
const params = new URLSearchParams(location.search);
const forcePreview = params.get('welcomePopup') === '1';

const safeGet = key => { try { return localStorage.getItem(key); } catch { return null; } };
const safeSet = (key,value) => { try { localStorage.setItem(key,value); } catch {} };
const safeRemove = key => { try { localStorage.removeItem(key); } catch {} };

function markPresented(){
  safeSet(PRESENTED_KEY,String(WELCOME_VERSION));
}

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

function mountWelcome(user){
  markPresented();

  const oldOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';

  const host=document.createElement('div');
  host.id='bt-welcome-v2-host';
  host.style.position='fixed';
  host.style.inset='0';
  host.style.zIndex='120000';

  const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML=`<style>
:host{--teal:#35e4de;--teal2:#7afff7;--black:#020708}
*{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;background:#000;color:#fff;font-family:Arial,Helvetica,sans-serif;overflow:hidden}
.site{position:fixed;inset:0;background:#050808}
.site:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 15%,#1a3030,#060909 45%,#020303)}
.overlay{position:fixed;inset:0;z-index:10;display:grid;place-items:center;padding:8px;background:rgba(0,0,0,.35);backdrop-filter:blur(4px)}
.overlay.hidden{display:none}

.popup{
  position:relative;
  width:min(96vw,calc((100dvh - 16px)*.5612));
  aspect-ratio:665/1185;
  max-height:calc(100dvh - 16px);
  overflow:hidden;
  border:2px solid rgba(53,228,222,.86);
  border-radius:24px;
  background:
    radial-gradient(circle at 50% 18%,rgba(10,47,49,.55),rgba(3,15,16,.95) 48%,#020707 100%);
  box-shadow:0 24px 70px rgba(0,0,0,.82),0 0 28px rgba(53,228,222,.15);
}
.popup:after{
  content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(180deg,transparent 0 24%,rgba(0,0,0,.05) 30%,rgba(0,0,0,.42) 39%,rgba(0,0,0,.74) 52%,rgba(0,0,0,.22) 100%);
}
.hero-art{
  position:absolute;z-index:1;left:0;right:0;top:9.2%;height:19.3%;
  background:url("welcome-popup/hero.webp") center/cover no-repeat;
}
.close{
  position:absolute;z-index:20;right:2.1%;top:1.5%;
  width:45px;height:45px;border-radius:50%;
  border:2px solid var(--teal);background:rgba(3,16,17,.72);color:#fff;
  font:700 29px/1 Arial;cursor:pointer;
}

.brandrow{
  position:absolute;z-index:10;left:3.7%;right:7.5%;top:3.0%;height:7.7%;
  display:flex;align-items:center;justify-content:center;gap:7px;
}
.logo{height:100%;width:auto;max-width:17%;object-fit:cover}
.brandcopy{min-width:0}
.brand{
  font-size:clamp(27px,7.1vw,52px);font-weight:1000;letter-spacing:-2.2px;
  line-height:.95;white-space:nowrap;text-shadow:0 2px 7px #000;
}
.brand span{color:var(--teal)}
.tag{
  margin-top:4px;color:#68e9e3;font-size:clamp(9px,2.55vw,15px);
  font-weight:900;white-space:nowrap;text-shadow:0 2px 6px #000;
}

.desc{
  position:absolute;z-index:10;left:8%;right:8%;top:26.4%;height:8.1%;
  display:flex;align-items:center;justify-content:center;text-align:center;
  font-size:clamp(12px,2.95vw,18px);line-height:1.42;text-shadow:0 2px 8px #000;
}
.desc strong{color:var(--teal2)}
.desc-copy{display:inline;}
.desc-tail{white-space:nowrap}

.actions{
  position:absolute;z-index:12;left:10.2%;right:10.2%;top:35.1%;height:18.4%;
  display:grid;grid-template-rows:repeat(3,1fr);gap:8px;
}
.action{
  width:100%;height:100%;border:2px solid rgba(53,228,222,.84);border-radius:16px;
  background:rgba(2,14,15,.88);color:#fff;text-decoration:none;
  display:grid;grid-template-columns:40px 1fr 25px;align-items:center;padding:0 14px;
  font-weight:1000;font-size:clamp(13px,3.55vw,20px);cursor:pointer;
}
.action.primary{
  background:linear-gradient(180deg,#62f0eb,#2bd8d3);
  border-color:#85fff9;color:#031111;box-shadow:0 0 18px rgba(53,228,222,.22);
}
.action .ico{display:flex;align-items:center;justify-content:center;line-height:1}
.action .label{text-align:center;line-height:1.05}
.action .arr{justify-self:end;font-size:1.3em}

.upgrade{
  position:absolute;z-index:12;left:17%;right:17%;top:55.0%;height:4.2%;
  border:2px solid #62f2ec;border-radius:999px;
  background:linear-gradient(180deg,rgba(25,79,77,.98),rgba(4,24,25,.98));
  color:#fff;display:grid;grid-template-columns:26px 1fr 19px;align-items:center;
  padding:0 11px;font-weight:1000;font-size:clamp(10px,2.85vw,16px);
  white-space:nowrap;cursor:pointer;
  box-shadow:0 0 18px rgba(53,228,222,.37),inset 0 0 10px rgba(53,228,222,.08);
}
.upgrade .label{text-align:center}

.eq-row{
  position:absolute;z-index:12;left:18%;right:18%;top:60.2%;height:2.9%;
  display:flex;align-items:center;gap:11px;
}
.eq-row:before,.eq-row:after{
  content:"";height:1px;flex:1;background:linear-gradient(90deg,transparent,rgba(53,228,222,.75));
}
.eq-row:after{background:linear-gradient(90deg,rgba(53,228,222,.75),transparent)}
.eq{height:28px;display:flex;align-items:center;gap:4px}
.eq i{display:block;width:4px;border-radius:99px;background:var(--teal);box-shadow:0 0 8px rgba(53,228,222,.55)}
.eq i:nth-child(1),.eq i:nth-child(5){height:10px}
.eq i:nth-child(2),.eq i:nth-child(4){height:18px}
.eq i:nth-child(3){height:28px}

.swipe{
  position:absolute;z-index:12;left:8%;right:8%;top:63.2%;height:2.4%;
  display:flex;align-items:center;justify-content:center;
  color:#dce6e5;font-size:clamp(9px,2.35vw,13px);
}
.swipe b{color:var(--teal);font-size:1.3em;padding:0 8%}

.carousel{
  position:absolute;z-index:12;left:2.7%;right:2.7%;top:66.4%;height:28.8%;
  display:flex;gap:9px;overflow-x:auto;scroll-snap-type:x mandatory;
  -webkit-overflow-scrolling:touch;scrollbar-width:none;padding:1px;
}
.carousel::-webkit-scrollbar{display:none}
.card{
  flex:0 0 calc((100% - 18px)/3);min-width:0;scroll-snap-align:start;
  border:1.5px solid rgba(53,228,222,.82);border-radius:16px;overflow:hidden;
  background:rgba(3,14,15,.96);pointer-events:none;
}
.art{height:42%;background-size:cover;background-position:center}
.card:nth-child(1) .art{background-image:url("welcome-popup/card-1.webp")}
.card:nth-child(2) .art{background-image:url("welcome-popup/card-2.webp")}
.card:nth-child(3) .art{background-image:url("welcome-popup/card-3.webp")}
.card:nth-child(4) .art{background-image:url("welcome-popup/card-4.webp")}
.card:nth-child(5) .art{background-image:url("welcome-popup/card-5.webp")}
.card:nth-child(6) .art{background-image:url("welcome-popup/card-6.webp")}
.cardbody{padding:0 8px 8px}
.cardicon{
  width:39px;height:39px;margin-top:-19px;margin-bottom:6px;
  border:2px solid var(--teal);border-radius:50%;background:#061011;
  display:grid;place-items:center;font-size:17px;
}
.card h3{margin:0 0 5px;font-size:clamp(10px,2.75vw,15px);line-height:1.05}
.card p{margin:0;color:#dce5e4;font-size:clamp(7.2px,1.95vw,10.5px);line-height:1.28}

.dots{
  position:absolute;z-index:12;left:0;right:0;top:96.4%;height:2%;
  display:flex;align-items:center;justify-content:center;gap:10px;
}
.dot{width:10px;height:10px;border-radius:50%;background:#687170}
.dot.active{background:var(--teal);box-shadow:0 0 8px rgba(53,228,222,.45)}

/* upgrade info modal */
.info{
  position:fixed;inset:0;z-index:30;display:none;place-items:center;padding:16px;
  background:rgba(0,0,0,.76);backdrop-filter:blur(7px);
}
.info.open{display:grid}
.info-card{
  width:min(430px,94vw);max-height:88dvh;overflow:auto;
  border:1.5px solid var(--teal);border-radius:18px;background:#061112;padding:18px;
  box-shadow:0 20px 60px #000b;
}
.info-card h2{margin:0;color:#6bf0ea}
.info-card p{font-size:13px;color:#d8e2e1;line-height:1.45}
.features{display:grid;gap:7px}
.feature{padding:9px;border:1px solid rgba(53,228,222,.25);border-radius:9px;background:#0b1919;font-size:11px}
.info-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.mini{border:1px solid var(--teal);border-radius:999px;padding:9px 12px;font-weight:900;cursor:pointer}
.mini.secondary{background:transparent;color:#fff}
.mini.primary{background:var(--teal);color:#031111}

@media(max-width:430px){
  .close{width:42px;height:42px;font-size:27px}
  .brand{font-size:clamp(26px,7.4vw,37px)}
  .tag{font-size:clamp(9px,2.45vw,12px)}
  .actions{gap:7px}
  .upgrade{left:16%;right:16%;font-size:clamp(9px,2.65vw,13px)}
  .carousel{gap:8px}
  .card{flex-basis:calc((100% - 16px)/3)}
}
</style><div class="overlay" id="overlay">
  <section class="popup" role="dialog" aria-modal="true" aria-label="Welcome to BANDtroductions">
    <div class="hero-art"></div>
    <button class="close" id="closeBtn" type="button" aria-label="Close">×</button>

    <div class="brandrow">
      <img class="logo" src="IMG_9367.png" alt="BANDtroductions logo">
      <div class="brandcopy">
        <div class="brand">BAND<span>troductions</span></div>
        <div class="tag">The Social Platform for Local Music. Everywhere.</div>
      </div>
    </div>

    <div class="desc">
      <span class="desc-copy">Discover independent bands, musicians, venues, music videos, shows, merch, community, radio and band websites — <strong class="desc-tail">all in one place.</strong></span>
    </div>

    <div class="actions">
      <a class="action primary" href="signup.html?returnTo=index.html">
        <span class="ico">👤+</span><span class="label">Join the Scene — Free</span><span class="arr">›</span>
      </a>
      <a class="action" href="login.html?returnTo=index.html">
        <span class="ico">⇥</span><span class="label">Log In</span><span class="arr">›</span>
      </a>
      <button class="action" id="exploreBtn" type="button">
        <span class="ico">⌖</span><span class="label">Explore BANDtroductions</span><span class="arr">›</span>
      </button>
    </div>

    <button class="upgrade" id="upgradeBtn" type="button">
      <span>♛</span><span class="label">Upgrade Profile · Learn More</span><span>›</span>
    </button>

    <div class="eq-row" aria-hidden="true">
      <span class="eq"><i></i><i></i><i></i><i></i><i></i></span>
    </div>

    <div class="swipe"><b>←</b> Swipe to explore features <b>→</b></div>

    <div class="carousel" id="carousel" aria-label="BANDtroductions features">
      <article class="card"><div class="art"></div><div class="cardbody"><div class="cardicon">👥</div><h3>Discover Bands</h3><p>Find new music, follow your favorites and support local talent.</p></div></article>
      <article class="card"><div class="art"></div><div class="cardbody"><div class="cardicon">▶</div><h3>Music Videos</h3><p>Watch and share local music videos from emerging artists.</p></div></article>
      <article class="card"><div class="art"></div><div class="cardbody"><div class="cardicon">▣</div><h3>Live Shows</h3><p>Find upcoming shows near you and never miss a performance.</p></div></article>
      <article class="card"><div class="art"></div><div class="cardbody"><div class="cardicon">💬</div><h3>Community</h3><p>Post, connect, tag, follow and build relationships around music.</p></div></article>
      <article class="card"><div class="art"></div><div class="cardbody"><div class="cardicon">♫</div><h3>BANDtroductions Radio</h3><p>Hear independent artists and discover music already inside the community.</p></div></article>
      <article class="card"><div class="art"></div><div class="cardbody"><div class="cardicon">↗</div><h3>Artist Tools</h3><p>Booking, merch, domains and an optional customizable band website template.</p></div></article>
    </div>

    <div class="dots"><span class="dot active"></span><span class="dot"></span></div>
  </section>
</div>

<div class="info" id="info">
  <section class="info-card" role="dialog" aria-modal="true" aria-label="Upgrade your profile">
    <h2>Upgrade Your Profile</h2>
    <p>Turn your BANDtroductions profile into a stronger home for your band with built-in tools for your website, booking, merch, domain, music, videos and promotion.</p>
    <div class="features">
      <div class="feature"><b>Customizable band website template</b></div>
      <div class="feature"><b>Booking tools</b></div>
      <div class="feature"><b>Merch integration</b></div>
      <div class="feature"><b>Custom domain connection</b></div>
      <div class="feature"><b>Music, videos & promotion</b></div>
    </div>
    <div class="info-actions">
      <button class="mini secondary" id="gotIt" type="button">Got it</button>
      <button class="mini primary" id="upgradeNow" type="button">Upgrade Now</button>
    </div>
  </section>
</div>

`;

  const overlay=shadow.getElementById('overlay');
  const info=shadow.getElementById('info');
  const closeBtn=shadow.getElementById('closeBtn');
  const exploreBtn=shadow.getElementById('exploreBtn');
  const upgradeBtn=shadow.getElementById('upgradeBtn');
  const gotIt=shadow.getElementById('gotIt');
  const upgradeNow=shadow.getElementById('upgradeNow');
  const carousel=shadow.getElementById('carousel');
  const dots=[...shadow.querySelectorAll('.dot')];

  let closed=false;
  const closeWelcome=()=>{
    if(closed) return;
    closed=true;
    document.removeEventListener('keydown',onKeydown);
    host.remove();
    document.body.style.overflow=oldOverflow;
  };
  const closeInfo=()=>info?.classList.remove('open');
  const onKeydown=event=>{
    if(event.key!=='Escape') return;
    if(info?.classList.contains('open')) closeInfo();
    else closeWelcome();
  };

  closeBtn?.addEventListener('click',closeWelcome);
  exploreBtn?.addEventListener('click',closeWelcome);
  upgradeBtn?.addEventListener('click',()=>info?.classList.add('open'));
  gotIt?.addEventListener('click',closeInfo);
  info?.addEventListener('click',event=>{ if(event.target===info) closeInfo(); });
  upgradeNow?.addEventListener('click',()=>{
    markPresented();
    if(user){
      location.href=`website.html?id=${encodeURIComponent(user.uid)}`;
      return;
    }
    location.href='login.html?returnTo='+encodeURIComponent('index.html?upgrade=1');
  });

  if(carousel && dots.length){
    carousel.addEventListener('scroll',()=>{
      const max=Math.max(1,carousel.scrollWidth-carousel.clientWidth);
      const ratio=Math.min(1,Math.max(0,carousel.scrollLeft/max));
      const active=Math.min(dots.length-1,Math.round(ratio*(dots.length-1)));
      dots.forEach((dot,index)=>dot.classList.toggle('active',index===active));
    },{passive:true});
  }

  document.addEventListener('keydown',onKeydown);
  document.body.appendChild(host);
  setTimeout(()=>closeBtn?.focus({preventScroll:true}),0);

  if(user && !forcePreview) markMemberSeen(user);
}

function whenThePageCanSpareIt(run){
  // The popup is not part of first paint. Show it after a real visit signal:
  // a scroll, a completed click, or a few seconds — whichever comes first.
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    setTimeout(run, 4500);
    return;
  }
  let done=false;
  const startY=window.scrollY||0;
  const fire=()=>{
    if(done) return;
    done=true;
    cleanup();
    run();
  };
  const onScroll=()=>{ if(Math.abs((window.scrollY||0)-startY)>32) fire(); };
  const cleanup=()=>{
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('click', fire);
    clearTimeout(timer);
  };
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('click', fire);
  const timer=setTimeout(fire, 4500);
}

let handled=false;
onAuthStateChanged(auth,async user=>{
  if(handled) return;
  handled=true;

  if(user && params.get('upgrade')==='1'){
    await markMemberSeen(user);
    location.replace(`website.html?id=${encodeURIComponent(user.uid)}`);
    return;
  }

  if(forcePreview){
    mountWelcome(user||null);
    return;
  }

  if(user){
    // A successful login/signup on this browser is enough to suppress v2 immediately.
    // Firestore remains the cross-device source of truth when available.
    if(Number(safeGet(MEMBER_DEVICE_KEY))>=WELCOME_VERSION){
      safeRemove(PRESENTED_KEY);
      markMemberSeen(user);
      return;
    }
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
    whenThePageCanSpareIt(()=>mountWelcome(user));
    return;
  }

  // A member who already saw v2 on this browser should not be nagged after logout.
  if(Number(safeGet(MEMBER_DEVICE_KEY))>=WELCOME_VERSION) return;

  // Guests see the intro once on this browser, and never during first paint.
  if(Number(safeGet(PRESENTED_KEY))>=WELCOME_VERSION) return;
  whenThePageCanSpareIt(()=>mountWelcome(null));
});
