const sponsorCard = document.querySelector('.bt-card-grid .bt-sponsor-card');

if (sponsorCard) {
  const slides = [
    {
      type: 'message',
      title: 'Thank you to our sponsors',
      text: 'Helping keep BANDtroductions free for bands, fans, and independent music supporters.',
      url: 'sponsors.html'
    },
    {
      type: 'image',
      image: 'ff796046372b48681a359daff6375626.jpeg',
      alt: 'Rock Rage Radio',
      url: 'sponsors.html'
    },
    {
      type: 'image',
      image: 'IMG_0908.jpeg',
      alt: 'The Plowzone Radio Show',
      url: 'sponsors.html'
    },
    {
      type: 'image',
      image: 'IMG_0699.jpeg',
      alt: 'Gone Rogue Records',
      url: 'sponsors.html'
    },
    {
      type: 'image',
      image: '9A3AD6D7-8C0C-4C27-BE09-A19C2F0834AE.png',
      alt: 'New Leaf Painting Company',
      url: 'sponsors.html'
    }
  ];

  const style = document.createElement('style');
  style.textContent = `
    .bt-card.bt-sponsor-card {
      position: relative;
      display: block;
      padding: 0 !important;
      overflow: hidden;
      border-radius: 18px;
      background: #111;
      min-height: 100%;
    }

    .home-sponsor-slide {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      padding: 18px;
      box-sizing: border-box;
      opacity: 0;
      transition: opacity .45s ease;
      text-align: center;
    }

    .home-sponsor-slide.is-active { opacity: 1; }

    .home-sponsor-slide img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      border-radius: 14px;
    }

    .home-sponsor-message {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle at center, rgba(12,207,189,.16), transparent 68%);
      border-radius: 14px;
    }

    .home-sponsor-message h3 {
      margin: 0;
      color: #0ccfbd;
      font-size: 1.18rem;
      line-height: 1.15;
    }

    .home-sponsor-message p {
      margin: 0;
      color: #bbb;
      font-size: .82rem;
      line-height: 1.35;
      max-width: 240px;
    }
  `;
  document.head.appendChild(style);

  sponsorCard.replaceChildren();
  sponsorCard.setAttribute('aria-label', 'BANDtroductions sponsors');

  const slideElements = slides.map((slide, index) => {
    const item = document.createElement('div');
    item.className = `home-sponsor-slide${index === 0 ? ' is-active' : ''}`;

    if (slide.type === 'image') {
      const image = document.createElement('img');
      image.src = slide.image;
      image.alt = slide.alt;
      image.loading = index === 1 ? 'eager' : 'lazy';
      item.appendChild(image);
    } else {
      const message = document.createElement('div');
      message.className = 'home-sponsor-message';

      const title = document.createElement('h3');
      title.textContent = slide.title;

      const text = document.createElement('p');
      text.textContent = slide.text;

      message.append(title, text);
      item.appendChild(message);
    }

    sponsorCard.appendChild(item);
    return item;
  });

  let activeIndex = 0;
  sponsorCard.href = slides[0].url;

  window.setInterval(() => {
    slideElements[activeIndex].classList.remove('is-active');
    activeIndex = (activeIndex + 1) % slideElements.length;
    slideElements[activeIndex].classList.add('is-active');
    sponsorCard.href = slides[activeIndex].url;
  }, 4000);
}
