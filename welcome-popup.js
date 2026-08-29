(() => {
  const STORAGE_KEY = 'bandtroductions-welcome-v1';
  const params = new URLSearchParams(location.search);
  const forcePreview = params.get('welcomePopup') === '1';

  if (!forcePreview) {
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'seen') return;
    } catch {}
  }

  const style = document.createElement('style');
  style.textContent = `
    .bt-welcome-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.82);backdrop-filter:blur(5px)}
    .bt-welcome-card{position:relative;width:min(760px,94vw);overflow:hidden;border:1px solid rgba(37,199,193,.75);border-radius:22px;background:#080909;box-shadow:0 28px 90px rgba(0,0,0,.85),0 0 38px rgba(37,199,193,.12);isolation:isolate}
    .bt-welcome-card::before{content:'';position:absolute;inset:0;z-index:-2;background:radial-gradient(circle at 14% 14%,rgba(37,199,193,.38),transparent 28%),radial-gradient(circle at 82% 18%,rgba(130,80,255,.32),transparent 26%),radial-gradient(circle at 50% 100%,rgba(190,35,35,.34),transparent 38%),linear-gradient(155deg,#111 0%,#050606 62%,#111 100%)}
    .bt-welcome-card::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.76)),repeating-linear-gradient(104deg,transparent 0 46px,rgba(255,255,255,.025) 47px 48px)}
    .bt-welcome-content{padding:34px 34px 28px;text-align:center}
    .bt-welcome-kicker{display:inline-block;margin-bottom:11px;color:#25c7c1;font-size:12px;font-weight:950;letter-spacing:.13em;text-transform:uppercase}
    .bt-welcome-title{margin:0;color:#fff;font-size:clamp(30px,6vw,58px);line-height:.94;font-weight:1000;letter-spacing:-.04em;text-transform:uppercase;text-shadow:0 5px 22px rgba(0,0,0,.75)}
    .bt-welcome-title span{color:#25c7c1}
    .bt-welcome-copy{max-width:610px;margin:18px auto 0;color:#e3e3e3;font-size:clamp(14px,2.3vw,18px);line-height:1.55}
    .bt-welcome-copy strong{color:#25c7c1}
    .bt-welcome-tag{margin:16px 0 0;color:#aaa;font-size:13px;font-weight:800}
    .bt-welcome-actions{display:grid;grid-template-columns:1fr 1fr 1.25fr;gap:9px;margin-top:25px}
    .bt-welcome-btn{appearance:none;border:1px solid #25c7c1;background:#0b0d0d;color:#25c7c1;padding:12px 10px;text-decoration:none;font:inherit;font-size:12px;font-weight:950;letter-spacing:.02em;cursor:pointer;text-align:center}
    .bt-welcome-btn.primary{background:#25c7c1;color:#04100f}
    .bt-welcome-btn:hover{filter:brightness(1.12)}
    .bt-welcome-once{margin:11px 0 0;color:#fff;font-size:11px;font-weight:700;opacity:.9}
    .bt-welcome-note{min-height:18px;margin:7px 0 0;color:#9ca3a3;font-size:11px}
    @media(max-width:600px){.bt-welcome-overlay{padding:9px}.bt-welcome-content{padding:25px 16px 18px}.bt-welcome-title{font-size:32px}.bt-welcome-copy{font-size:13px;line-height:1.48}.bt-welcome-actions{grid-template-columns:1fr 1fr;gap:6px}.bt-welcome-actions .bt-welcome-close{grid-column:1/-1}.bt-welcome-btn{padding:10px 6px;font-size:10px}.bt-welcome-once{font-size:10px}}
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'bt-welcome-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Welcome to BANDtroductions Social');
  overlay.innerHTML = `
    <section class="bt-welcome-card">
      <div class="bt-welcome-content">
        <div class="bt-welcome-kicker">Built for the scene. Not the algorithm.</div>
        <h1 class="bt-welcome-title">Welcome to BANDtroductions Social <span>A social platform for the music scene.</span></h1>
        <p class="bt-welcome-copy">BANDtroductions Social is a music-first community for <strong>bands, musicians, venues, photographers, promoters and fans</strong>. No politics. No algorithm deciding what you see. No unrelated bullshit. Just music, shows, connections, community — and BANDtroductions Radio while you browse.</p>
        <p class="bt-welcome-tag">The Social Platform for Local Music. Everywhere. 🤘</p>
        <div class="bt-welcome-actions">
          <button type="button" class="bt-welcome-btn" data-action="share">SHARE</button>
          <a class="bt-welcome-btn primary" data-action="signup" href="signup.html">CREATE ACCOUNT</a>
          <button type="button" class="bt-welcome-btn bt-welcome-close" data-action="close">CLOSE & EXPLORE</button>
        </div>
        <p class="bt-welcome-once">Don’t worry — this is a one-time welcome. You won’t see it every visit.</p>
        <p class="bt-welcome-note" aria-live="polite"></p>
      </div>
    </section>`;

  const markSeen = () => {
    if (forcePreview) return;
    try { localStorage.setItem(STORAGE_KEY, 'seen'); } catch {}
  };
  const close = () => { markSeen(); overlay.remove(); style.remove(); };

  overlay.querySelector('[data-action="close"]').addEventListener('click', close);
  overlay.querySelector('[data-action="signup"]').addEventListener('click', markSeen);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', function esc(event){ if(event.key==='Escape'){document.removeEventListener('keydown',esc);close();} });

  const shareButton = overlay.querySelector('[data-action="share"]');
  const note = overlay.querySelector('.bt-welcome-note');
  shareButton.addEventListener('click', async () => {
    const shareData = {
      title: 'BANDtroductions Social',
      text: 'Check out BANDtroductions Social — social media built for the music scene.',
      url: location.origin + '/'
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        markSeen();
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareData.url);
        note.textContent = 'BANDtroductions link copied — thank you for sharing. 🤘';
      } else {
        note.textContent = shareData.url;
      }
    } catch (error) {
      if (error?.name !== 'AbortError') note.textContent = 'Share was unavailable. You can still copy bandtroductions.com.';
    }
  });

  document.body.appendChild(overlay);
})();
