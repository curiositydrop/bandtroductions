fetch('/bandtroductions/global.html?v=1')
  .then(response => response.text())
  .then(data => {
    const temp = document.createElement('div');
    temp.innerHTML = data;

    const header = temp.querySelector('#site-header');
    const footer = temp.querySelector('#site-footer');

    const headerTarget = document.getElementById('global-header');
    const footerTarget = document.getElementById('global-footer');

    if (header && headerTarget) {
      headerTarget.innerHTML = header.innerHTML;
    }

    if (footer && footerTarget) {
      footerTarget.innerHTML = footer.innerHTML;
    }
  })
  .catch(error => {
    console.error('Error loading global header/footer:', error);
  });

function toggleWatchNav() {
  const nav = document.getElementById('mainNav');
  if (nav) {
    nav.classList.toggle('show-watch-nav');
  }
}

/* 🔥 UPDATED SHARE FUNCTION (mobile + desktop friendly) */
function shareCurrentPage() {
  const path = window.location.pathname;
  const fullUrl = 'https://curiositydrop.com' + path;

  // Mobile (iPhone, etc.)
  if (navigator.share) {
    navigator.share({
      title: document.title,
      url: fullUrl
    }).catch(() => {});
    return;
  }

  // Desktop fallback (Facebook share)
  window.open(
    'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(fullUrl),
    '_blank',
    'width=600,height=500'
  );
}

/* 🎸 FALLING GUITAR SYSTEM */

const fallingGuitarEnabled = true;

const guitarMinDelay = 10000;
const guitarMaxDelay = 15000;

const guitarMinDuration = 7000;
const guitarMaxDuration = 11000;

let guitarPopupOpen = false;

const musicFacts = [
  {
    text: "The first music video aired on MTV was 'Video Killed the Radio Star.'",
    source: "The Buggles — MTV launch era (1981)"
  },
  {
    text: "The world's largest rock band had 1,000 musicians perform 'Learn to Fly.'",
    source: "Rockin’1000 — Cesena, Italy (2015)"
  },
  {
    text: "6gig came out of Portland, Maine, and their song 'Hit the Ground' received MTV2 airplay.",
    source: "6gig — Portland, Maine / MTV2 era"
  },
  {
    text: "Howie Day is a Maine artist who started performing across New England as a teenager before breaking out nationally.",
    source: "Howie Day — Bangor/Brewer, Maine"
  },
  {
    text: "Rustic Overtones grew out of Portland’s music scene and later landed an Arista deal backed by Clive Davis.",
    source: "Rustic Overtones — Portland, Maine / Arista"
  },
  {
    text: "A piano has 88 keys.",
    source: "Standard modern piano layout"
  },
  {
    text: "Drums are among the oldest known musical instruments in human history.",
    source: "Ancient percussion traditions"
  },
  {
    text: "Freddie Mercury’s extra teeth are often credited as part of what helped shape his vocal sound.",
    source: "Freddie Mercury — vocal lore"
  }
];

const musicRiddles = [
  { question: "I have keys but no locks. What am I?", answer: "A keyboard" },
  { question: "What band doesn’t play music?", answer: "A rubber band" },
  { question: "What has strings but can't tie?", answer: "A guitar" }
];

function getRandomItem(arr){
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomContent(){
  const showFact = Math.random() < 0.85;

  if(showFact){
    const fact = getRandomItem(musicFacts);
    return `
      <h3>🎵 Music Fact</h3>
      <p>${fact.text}</p>
      <p style="margin-top:10px; font-size:14px; opacity:0.7;">
        ${fact.source}
      </p>
    `;
  }

  const riddle = getRandomItem(musicRiddles);

  return `
    <h3>🤔 Music Riddle</h3>
    <p>${riddle.question}</p>
    <button onclick="revealAnswer(this,'${riddle.answer}')">
      Reveal Answer
    </button>
  `;
}

function revealAnswer(btn, answer){
  const p = document.createElement("p");
  p.innerHTML = "<strong>Answer:</strong> " + answer;
  p.style.marginTop = "10px";
  btn.after(p);
  btn.remove();
}

function openGuitarPopup(){
  const overlay = document.getElementById("guitar-popup-overlay");
  const content = document.getElementById("guitar-popup-content");

  guitarPopupOpen = true;

  content.innerHTML = getRandomContent();
  overlay.style.display = "flex";
}

function closeGuitarPopup(){
  document.getElementById("guitar-popup-overlay").style.display = "none";
  guitarPopupOpen = false;

  scheduleNext();
}

function spawnGuitar(){
  if(!fallingGuitarEnabled) return;

  const layer = document.getElementById("falling-guitar-layer");
  if(!layer) return;

  if(document.querySelector(".falling-guitar")){
    scheduleNext();
    return;
  }

  const g = document.createElement("div");
  g.className = "falling-guitar";
  g.innerHTML = "🎸";

  g.style.left = Math.random()*window.innerWidth + "px";
  g.style.fontSize = (30 + Math.random()*20) + "px";
  g.style.animationDuration = (guitarMinDuration + Math.random()*4000) + "ms";

  g.onclick = () => {
    g.remove();
    openGuitarPopup();
  };

  g.onanimationend = () => {
    g.remove();
    scheduleNext();
  };

  layer.appendChild(g);
}

function scheduleNext(){
  if(!fallingGuitarEnabled) return;
  if(guitarPopupOpen) return;

  const delay = guitarMinDelay + Math.random()*(guitarMaxDelay-guitarMinDelay);
  setTimeout(spawnGuitar, delay);
}

window.addEventListener("load", scheduleNext);
