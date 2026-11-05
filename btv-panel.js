// Shows "Upload to BTV" in the member panel for band/musician accounts (and admin).
import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
onAuthStateChanged(auth, async (u) => {
  const a = document.getElementById('btv-upload-link'); if (!a) return;
  if (!u) { a.hidden = true; a.style.display = 'none'; return; }
  let t = '';
  try { const s = await getDoc(doc(db, 'profiles', u.uid)); t = String(s.data()?.profileType || s.data()?.accountType || '').toLowerCase(); } catch {}
  const admin = u.uid === 'PJXufsvdCCgRpfKcLtxPH3jEQN83' || /^mbe?rgeron79@gmail\.com$/i.test(u.email || '');
  a.hidden = !(admin || ['band', 'musician', 'artist'].includes(t)); a.style.display = a.hidden ? 'none' : '';
});
