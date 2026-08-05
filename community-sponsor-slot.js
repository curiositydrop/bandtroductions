const intro = document.querySelector('.community-intro');

if (intro && !document.getElementById('community-sponsor-hero')) {
  const sponsors = [
    { image: 'ff796046372b48681a359daff6375626.jpeg', name: 'Rock Rage Radio', url: 'sponsors.html' },
    { image: 'IMG_0908.jpeg', name: 'The Plowzone Radio Show', url: 'sponsors.html' },
    { image: 'IMG_0699.jpeg', name: 'Gone Rogue Records', url: 'sponsors.html' },
    { image: '9A3AD6D7-8C0C-4C27-BE09-A19C2F0834AE.png', name: 'New Leaf Painting Company', url: 'sponsors.html' }
  ];

  const style = document.createElement('style');
  style.id = 'community-sponsor-hero-styles';
  style.textContent = `
    .community-hero-row{
      display:grid;
      grid-template-columns:minmax(0,3fr) minmax(0,2fr);
      gap:8px;
      align-items:stretch;
      margin-bottom:7px;
      min-height:104px;
    }
    .community-hero-row .community-intro{
      min-width:0;
      margin:0!important;
      padding:8px 8px 8px 2px;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      box-shadow:none!important;
      display:flex;
      flex-direction:column;
      justify-content:center;
    }
    .community-hero-row .community-intro .profile-meta{display:none}
    .community-hero-row .community-intro h1{
      margin:0 0 8px;
      font-size:clamp(1.38rem,4vw,1.95rem);
      line-height:1.05;
    }
    .community-hero-row .community-intro .auth-subtitle{
      margin:0;
      color:#c8c8c8;
      font-size:.8rem;
      line-height:1.35;
    }
    .community-sponsor-hero{
      position:relative;
      min-width:0;
      min-height:104px;
      overflow:hidden;
      border:1px solid #2f625e;
      border-radius:14px;
      background:radial-gradient(circle at center,rgba(12,207,189,.14),transparent 72%),linear-gradient(145deg,#171717,#0d0d0d);
      box-shadow:0 7px 18px rgba(0,0,0,.24);
      color:inherit;
      text-decoration:none;
    }
    .community-sponsor-kicker{
      position:absolute;
      z-index:10;
      top:7px;
      left:7px;
      right:7px;
      color:#0ccfbd;
      font-size:.52rem;
      font-weight:900;
      letter-spacing:.08em;
      line-height:1.1;
      text-transform:uppercase;
      text-align:center;
    }
    .community-sponsor-hero-slide{
      position:absolute;
      inset:0;
      z-index:1;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:5px;
      padding:24px 8px 8px;
      box-sizing:border-box;
      opacity:0;
      visibility:hidden;
      pointer-events:none;
      text-align:center;
    }
    .community-sponsor-hero-slide.is-active{
      z-index:2;
      opacity:1;
      visibility:visible;
      pointer-events:auto;
    }
    .community-sponsor-hero-slide img{
      display:block;
      width:100%;
      height:62px;
      object-fit:contain;
      border-radius:7px;
    }
    .community-sponsor-hero-name{
      display:block;
      max-width:100%;
      color:#fff;
      font-size:.65rem;
      font-weight:900;
      line-height:1.1;
      text-align:center;
    }
    @media(max-width:560px){
      .community-hero-row{
        grid-template-columns:minmax(0,3fr) minmax(0,2fr);
        gap:7px;
        min-height:102px;
      }
      .community-hero-row .community-intro{padding:7px 6px 7px 2px}
      .community-hero-row .community-intro h1{
        margin-bottom:7px;
        font-size:1.18rem;
      }
      .community-hero-row .community-intro .auth-subtitle{
        font-size:.69rem;
        line-height:1.35;
      }
      .community-sponsor-hero{min-height:102px}
      .community-sponsor-kicker{
        top:7px;
        left:4px;
        right:4px;
        font-size:.45rem;
        letter-spacing:.04em;
      }
      .community-sponsor-hero-slide{padding:23px 5px 6px}
      .community-sponsor-hero-slide img{height:59px}
      .community-sponsor-hero-name{font-size:.55rem}
    }
  `;
  document.head.appendChild(style);

  // Build the hero row in one detached fragment and insert it once. This keeps
  // the same layout/behavior while reducing intermediate DOM states on startup.
  const row = document.createElement('section');
  row.className = 'community-hero-row';

  const slot = document.createElement('a');
  slot.id = 'community-sponsor-hero';
  slot.className = 'community-sponsor-hero';
  slot.href = sponsors[0].url;
  slot.setAttribute('aria-label', `Social platform supported by ${sponsors[0].name}`);

  const kicker = document.createElement('span');
  kicker.className = 'community-sponsor-kicker';
  kicker.textContent = 'Social supported by';
  slot.appendChild(kicker);

  const slides = sponsors.map((sponsor, index) => {
    const slide = document.createElement('span');
    slide.className = `community-sponsor-hero-slide${index === 0 ? ' is-active' : ''}`;

    const image = document.createElement('img');
    image.src = sponsor.image;
    image.alt = sponsor.name;
    image.loading = index === 0 ? 'eager' : 'lazy';

    const name = document.createElement('span');
    name.className = 'community-sponsor-hero-name';
    name.textContent = sponsor.name;

    slide.append(image, name);
    slot.appendChild(slide);
    return slide;
  });

  const parent = intro.parentNode;
  parent.insertBefore(row, intro);
  row.append(intro, slot);

  const heading = intro.querySelector('h1');
  if (heading) heading.textContent = 'BANDtroductions Social';
  const subtitle = intro.querySelector('.auth-subtitle');
  if (subtitle) subtitle.innerHTML = 'No algorithms. No politics. No bullshit.<br>Just people connecting through music.';

  let activeIndex = 0;
  window.setInterval(() => {
    slides[activeIndex].classList.remove('is-active');
    activeIndex = (activeIndex + 1) % slides.length;
    slides[activeIndex].classList.add('is-active');
    slot.href = sponsors[activeIndex].url;
    slot.setAttribute('aria-label', `Social platform supported by ${sponsors[activeIndex].name}`);
  }, 5000);
}