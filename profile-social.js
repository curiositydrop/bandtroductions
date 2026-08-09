import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const profileId = new URLSearchParams(location.search).get('id');
let currentUser = null;
let loadedProfile = null;

const style = document.createElement('style');
style.textContent = `
  .profile-social-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:10px}
  .profile-social-button{border:1px solid #0ccfbd;border-radius:999px;padding:10px 16px;background:#101010;color:#0ccfbd;font:inherit;font-weight:900;cursor:pointer}
  .profile-social-button.is-active{background:#0ccfbd;color:#06110f}
  .profile-posts-list{display:grid;gap:12px}.profile-post-card{padding:14px;border:1px solid #333;border-radius:13px;background:#0d0d0d}
  .profile-post-card p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55;margin:8px 0 0}.profile-post-meta{color:#888;font-size:.8rem}
  .profile-collection-links{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:10px}
`;
document.head.appendChild(style);

const normalizeType = type => type === 'fan' ? 'Scene Supporter' : (type || 'member').replace(/\b\w/g, c => c.toUpperCase());
const formatDate = timestamp => !timestamp?.toDate ? 'Just now' : new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(timestamp.toDate());
const followId = (followerId, targetId) => `${followerId}_${targetId}`;
const favoriteId = (userId, targetId) => `${userId}_${targetId}`;
const ownsLoadedProfile = () => Boolean(currentUser && loadedProfile && (currentUser.uid === profileId || loadedProfile.ownerId === currentUser.uid));

async function waitForProfile() {
  if (!profileId) return;
  for (let i = 0; i < 40; i += 1) {
    const content = document.getElementById('profile-content');
    if (content && !content.hidden) break;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  const snap = await getDoc(doc(db,'profiles',profileId));
  if (!snap.exists()) return;
  loadedProfile = { id: snap.id, ...snap.data() };
  installActions();
  installPosts();
}

function makeButton(label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'profile-social-button';
  button.textContent = label;
  return button;
}

async function installActions() {
  const actionArea = document.querySelector('.profile-identity .profile-actions');
  if (!actionArea || document.getElementById('profile-social-actions')) return;
  const wrap = document.createElement('div');
  wrap.id = 'profile-social-actions';
  wrap.className = 'profile-social-actions';
  actionArea.insertAdjacentElement('afterend', wrap);

  if (ownsLoadedProfile()) {
    const links = document.createElement('div');
    links.className = 'profile-collection-links';
    links.innerHTML = '<a class="auth-button auth-button-secondary" href="following.html">Following</a><a class="auth-button auth-button-secondary" href="favorites.html">Favorites</a>';
    wrap.appendChild(links);
    return;
  }

  if (!currentUser) {
    const login = document.createElement('a');
    login.className = 'auth-button auth-button-secondary';
    login.href = `login.html?returnTo=${encodeURIComponent(`profile.html?id=${profileId}`)}`;
    login.textContent = 'Log in to Follow';
    wrap.appendChild(login);
    return;
  }

  const followButton = makeButton('Follow');
  const favoriteButton = makeButton('☆ Favorite');
  wrap.append(followButton, favoriteButton);
  const fRef = doc(db,'follows',followId(currentUser.uid,profileId));
  const favRef = doc(db,'favorites',favoriteId(currentUser.uid,profileId));

  async function refresh() {
    const [followSnap,favSnap] = await Promise.all([getDoc(fRef),getDoc(favRef)]);
    followButton.classList.toggle('is-active',followSnap.exists());
    followButton.textContent = followSnap.exists() ? 'Following' : 'Follow';
    favoriteButton.classList.toggle('is-active',favSnap.exists());
    favoriteButton.textContent = favSnap.exists() ? '★ Favorited' : '☆ Favorite';
  }

  followButton.addEventListener('click',async()=>{
    followButton.disabled = true;
    try {
      const snap = await getDoc(fRef);
      if (snap.exists()) await deleteDoc(fRef);
      else {
        const actorName = currentUser.displayName || 'BANDtroductions Member';
        await setDoc(fRef,{
          followerId:currentUser.uid,
          targetId:profileId,
          targetName:loadedProfile.displayName||'Profile',
          targetType:loadedProfile.accountType||'member',
          targetImage:loadedProfile.imageUrl||loadedProfile.profileImageUrl||'',
          targetLocation:loadedProfile.location||'',
          createdAt:serverTimestamp()
        });
        const recipientId = loadedProfile.ownerId || profileId;
        if (recipientId && recipientId !== currentUser.uid) {
          await setDoc(doc(db,'notifications',`follow_${currentUser.uid}_${profileId}`),{
            recipientId,
            actorId:currentUser.uid,
            actorName,
            type:'follow',
            message:`${actorName} started following you.`,
            linkUrl:`profile.html?id=${encodeURIComponent(currentUser.uid)}`,
            read:false,
            createdAt:serverTimestamp()
          },{merge:true});
        }
      }
      await refresh();
    } catch (error) { console.error(error); alert(error?.code==='permission-denied'?'Follow permissions are not enabled yet.':'Follow could not be updated.'); }
    finally { followButton.disabled = false; }
  });

  favoriteButton.addEventListener('click',async()=>{
    favoriteButton.disabled = true;
    try {
      const snap = await getDoc(favRef);
      if (snap.exists()) await deleteDoc(favRef);
      else await setDoc(favRef,{
        userId:currentUser.uid,
        targetId:profileId,
        targetName:loadedProfile.displayName||'Profile',
        targetType:loadedProfile.accountType||'member',
        targetImage:loadedProfile.imageUrl||loadedProfile.profileImageUrl||'',
        targetLocation:loadedProfile.location||'',
        createdAt:serverTimestamp()
      });
      await refresh();
    } catch (error) { console.error(error); alert(error?.code==='permission-denied'?'Favorite permissions are not enabled yet.':'Favorite could not be updated.'); }
    finally { favoriteButton.disabled = false; }
  });
  refresh().catch(console.error);
}

function installPosts() {
  const content = document.getElementById('profile-content');
  if (!content || document.getElementById('profile-posts-section')) return;
  const section = document.createElement('section');
  section.id = 'profile-posts-section';
  section.className = 'profile-card';
  section.innerHTML = '<h2>Posts</h2><div id="profile-posts-list" class="profile-posts-list"><p class="profile-side-note">Loading posts…</p></div>';
  content.appendChild(section);
  const list = section.querySelector('#profile-posts-list');
  const authorIds = [...new Set([profileId, loadedProfile?.ownerId].filter(Boolean))];
  const q = authorIds.length > 1
    ? query(collection(db,'posts'),where('authorId','in',authorIds))
    : query(collection(db,'posts'),where('authorId','==',authorIds[0]));
  onSnapshot(q,snapshot=>{
    const posts = snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    list.replaceChildren();
    if (!posts.length) { list.innerHTML = '<p class="profile-side-note">No community posts yet.</p>'; return; }
    posts.forEach(post=>{
      const card = document.createElement('article');
      card.className = 'profile-post-card';
      const meta = document.createElement('div');
      meta.className = 'profile-post-meta';
      meta.textContent = `${normalizeType(post.accountType)} • ${(post.category||'general').replace(/\b\w/g,c=>c.toUpperCase())} • ${formatDate(post.createdAt)}`;
      const body = document.createElement('p');
      body.textContent = post.content || '';
      card.append(meta,body);
      if (post.imageUrl) { const img=document.createElement('img');img.className='community-post-image';img.src=post.imageUrl;img.alt='';img.loading='lazy';card.appendChild(img); }
      list.appendChild(card);
    });
  },error=>{console.error(error);list.innerHTML='<p class="auth-message">Posts could not be loaded.</p>';});
}

onAuthStateChanged(auth,user=>{currentUser=user;waitForProfile().catch(console.error);});