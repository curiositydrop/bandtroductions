const hero = document.querySelector('.home-page .hero');

if (hero) {
  hero.classList.add('social-hero');
  hero.innerHTML = `
    <p class="social-hero-kicker">Now Featuring</p>
    <h1>BANDtroductions Social</h1>
    <p class="social-hero-lead">Connecting you to local music scenes everywhere.</p>
    <p class="social-hero-copy">Discover bands, connect with musicians, find venues, and join a community built entirely around music.</p>
    <a class="social-hero-cta" href="community.html">Join Our Community →</a>
    <a class="social-hero-claim" href="claim-existing-profile.html">Already listed? Claim Your Profile</a>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .home-page .hero.social-hero {
      padding: clamp(22px, 4vw, 34px) clamp(18px, 4vw, 34px) !important;
    }
    .social-hero-kicker {
      margin: 0 0 1px !important;
      color: #b8b8b8 !important;
      font-size: clamp(.82rem, 2.4vw, .95rem) !important;
      font-weight: 700;
      letter-spacing: .03em;
      text-transform: uppercase;
    }
    .home-page .hero.social-hero h1 {
      margin: 0 0 8px !important;
      font-size: clamp(2rem, 6.5vw, 3.2rem) !important;
      line-height: 1.06 !important;
      white-space: nowrap;
    }
    .social-hero-lead {
      margin: 0 0 7px !important;
      color: #fff !important;
      font-size: clamp(1.08rem, 3.7vw, 1.42rem) !important;
      font-weight: 800;
      line-height: 1.28 !important;
    }
    .social-hero-copy {
      margin: 0 auto 11px !important;
      max-width: 660px;
      color: #d7d7d7 !important;
      font-size: clamp(.95rem, 3.3vw, 1.12rem) !important;
      line-height: 1.4 !important;
    }
    .social-hero-cta {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      padding: 6px 12px;
      border-radius: 999px;
      background: #0ccfbd;
      color: #050505;
      font-size: .82rem;
      font-weight: 900;
      text-decoration: none;
      box-shadow: 0 0 14px rgba(12, 207, 189, .2);
    }
    .social-hero-claim {
      display: block;
      width: fit-content;
      margin: 10px auto 0;
      color: #0ccfbd;
      font-size: .8rem;
      font-weight: 850;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .social-hero-claim:hover,
    .social-hero-claim:focus {
      color: #fff;
    }
    @media (max-width: 520px) {
      .home-page .hero.social-hero {
        padding: 21px 16px !important;
      }
      .home-page .hero.social-hero h1 {
        font-size: clamp(1.62rem, 7vw, 2rem) !important;
      }
    }
  `;
  document.head.appendChild(style);
}