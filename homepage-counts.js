import { db } from './firebase-dev.js';
import { collection, getCountFromServer, query, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

// Social proof only. A single-digit count reads as an empty room, so it stays hidden.
const MIN_PUBLIC_COUNT = 10;

const host = document.getElementById('home-counts');
if (host) {
  const specs = [
    ['band', 'Bands'],
    ['musician', 'Musicians'],
    ['venue', 'Venues'],
    ['fan', 'Fans']
  ];

  const results = await Promise.all(specs.map(async ([accountType, label]) => {
    try {
      const snap = await getCountFromServer(query(
        collection(db, 'profiles'),
        where('published', '==', true),
        where('accountType', '==', accountType)
      ));
      const count = Number(snap.data().count);
      return Number.isFinite(count) ? { label, count } : null;
    } catch (error) {
      console.warn(`Homepage ${accountType} count unavailable.`, error);
      return null;
    }
  }));

  const shown = results.filter(item => item && item.count >= MIN_PUBLIC_COUNT);
  if (!shown.length) {
    host.remove();
  } else {
    host.replaceChildren(...shown.map(item => {
      const stat = document.createElement('span');
      stat.className = 'home-count';
      const number = document.createElement('b');
      number.textContent = item.count.toLocaleString('en-US');
      const name = document.createElement('span');
      name.textContent = item.label;
      stat.append(number, name);
      return stat;
    }));
    host.hidden = false;
  }
}
