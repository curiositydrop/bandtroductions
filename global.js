fetch('global.html?v=7')
  .then(response => response.text())
  .then(async data => {
    const temp = document.createElement('div');
    temp.innerHTML = data;
    const header = temp.querySelector('#site-header');
    const footer = temp.querySelector('#site-footer');
    const headerTarget = document.getElementById('global-header');
    const footerTarget = document.getElementById('global-footer');
    if (header && headerTarget) { headerTarget.innerHTML = header.innerHTML; await initializeAuthNavigation(); }
    if (footer && footerTarget) footerTarget.innerHTML = footer.innerHTML;
  })
  .catch(error => console.error('Error loading global header/footer:', error));

async function initializeAuthNavigation() {
  const accountBar=document.getElementById('auth-account-bar'),loginLink=document.getElementById('auth-login-link'),accountLink=document.getElementById('auth-account-link'),profileLink=document.getElementById('auth-profile-link'),logoutLink=document.getElementById('auth-logout-link'),accountStatus=document.getElementById('auth-account-status');
  if(!accountBar||!loginLink||!accountLink||!profileLink||!logoutLink)return;
  try{
    const [{auth},{onAuthStateChanged,signOut}]=await Promise.all([import('./firebase-dev.js'),import('https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js')]);
    onAuthStateChanged(auth,user=>{const signedIn=Boolean(user);loginLink.hidden=signedIn;accountLink.hidden=signedIn;profileLink.hidden=!signedIn;logoutLink.hidden=!signedIn;if(accountStatus)accountStatus.textContent=signedIn?'Signed in':'Browsing as a guest';if(user)profileLink.href=`profile.html?id=${encodeURIComponent(user.uid)}`;accountBar.hidden=false;accountBar.style.display='flex'});
    logoutLink.addEventListener('click',async event=>{event.preventDefault();logoutLink.textContent='Logging Out…';logoutLink.style.pointerEvents='none';try{await signOut(auth);if(location.pathname.endsWith('/community.html'))location.replace(`community.html?fresh=${Date.now()}`);else location.href='login.html'}catch(error){console.error('Could not log out:',error);logoutLink.textContent='Log Out';logoutLink.style.pointerEvents='';alert('You could not be logged out. Please try again.')}});
  }catch(error){console.error('Error loading account navigation:',error);accountBar.hidden=true}
}

function toggleWatchNav(){const nav=document.getElementById('mainNav');if(nav)nav.classList.toggle('show-watch-nav')}
async function shareCurrentPage(){const shareData={title:document.title,text:'Check this out on BANDtroductions',url:location.href};if(navigator.share){try{await navigator.share(shareData)}catch(error){if(error?.name!=='AbortError')console.error('Could not open share options:',error)}return}try{await navigator.clipboard.writeText(location.href);alert('Page link copied.')}catch(error){console.error('Could not copy page link:',error);prompt('Copy this page link:',location.href)}}

document.addEventListener('DOMContentLoaded',()=>{const popup=document.getElementById('featured-popup');if(popup){popup.classList.add('is-hidden');popup.style.display='none'}});
function removeLegacyComposerAvatar(){const heading=document.querySelector('.community-composer-heading');if(!heading)return;heading.querySelectorAll('.community-composer-identity').forEach(legacy=>{const nameBlock=legacy.querySelector('#composer-name')?.parentElement,currentPerson=heading.querySelector('.community-composer-person');if(nameBlock&&currentPerson&&!currentPerson.contains(nameBlock))currentPerson.appendChild(nameBlock);legacy.remove()});const avatars=[...heading.querySelectorAll('.community-author-avatar')],preferred=heading.querySelector('.community-composer-person > .community-author-avatar');avatars.forEach(avatar=>{if(preferred&&avatar!==preferred)avatar.remove()})}

if(location.pathname.endsWith('/community.html')){
  import('./post-owner-controls.js?v=11').then(()=>{removeLegacyComposerAvatar();const composer=document.getElementById('post-composer');if(composer)new MutationObserver(removeLegacyComposerAvatar).observe(composer,{childList:true,subtree:true})}).catch(error=>console.error('Error loading post owner controls:',error));
  import('./admin-comment-controls.js?v=5').catch(error=>console.error('Error loading comment controls:',error));
  import('./community-notification-target.js?v=1').catch(error=>console.error('Error opening notification target:',error));
  import('./community-profile-count.js?v=2').catch(error=>console.error('Error loading community profile count:',error));
  import('./admin-post-controls.js?v=4').catch(error=>console.error('Error loading admin post controls:',error));
  import('./community-read-more.js?v=1').catch(error=>console.error('Error loading long-post controls:',error));
  import('./community-guest-mode.js?v=5').catch(error=>console.error('Error loading community guest mode:',error));
  import('./community-media.js?v=3').then(()=>import('./community-post-types.js?v=1')).catch(error=>console.error('Error loading community post tools:',error));
  import('./community-sponsor-slot.js?v=4').catch(error=>console.error('Error loading community sponsor slot:',error));
  import('./community-welcome-links.js?v=1').catch(error=>console.error('Error linking welcome posts:',error));
}
if(location.pathname.endsWith('/profile.html')){import('./profile-owner-guard.js?v=2').catch(error=>console.error('Error loading profile ownership guard:',error));import('./profile-media-section.js?v=1').catch(error=>console.error('Error loading profile media section:',error));import('./admin-profile-controls.js?v=2').catch(error=>console.error('Error loading admin profile controls:',error))}
if(location.pathname.endsWith('/profile-setup.html')){import('./profile-image-processing.js?v=2').catch(error=>console.error('Error loading profile image processing:',error));import('./profile-submission-flow.js?v=3').catch(error=>console.error('Error loading profile submission workflow:',error))}
if(location.pathname.endsWith('/profile-setup.html')&&new URLSearchParams(location.search).has('adminProfile'))import('./profile-admin-edit.js?v=2').catch(error=>console.error('Error loading admin profile editor:',error));
if(location.pathname.endsWith('/bands.html'))import('./bands-live-directory.js?v=1').catch(error=>console.error('Error loading live Bands directory:',error));
if(location.pathname.endsWith('/musicians.html'))import('./musicians-live-directory.js?v=1').catch(error=>console.error('Error loading live Musicians directory:',error));
if(location.pathname.endsWith('/venues.html'))import('./venues-live-directory.js?v=1').catch(error=>console.error('Error loading live Venues directory:',error));
if(location.pathname.endsWith('/bands.html')||location.pathname.endsWith('/musicians.html')||location.pathname.endsWith('/venues.html'))import('./legacy-profile-claim-links.js?v=3').catch(error=>console.error('Error loading legacy profile claim links:',error));
if(location.pathname.endsWith('/admin.html')){import('./admin-claims.js?v=4').catch(error=>console.error('Error loading ownership claims queue:',error));import('./admin-managed-profiles.js?v=1').catch(error=>console.error('Error loading managed profiles dashboard:',error))}
if(location.pathname==='/'||location.pathname.endsWith('/index.html')){import('./home-social-hero.js?v=2').catch(error=>console.error('Error loading home social hero:',error));import('./home-sponsor-rotator.js?v=1').catch(error=>console.error('Error loading home sponsor rotator:',error));import('./home-community-card.js?v=1').catch(error=>console.error('Error loading home community card:',error))}
import('./admin-access.js?v=3').catch(error=>console.error('Error loading account role rules:',error));
import('./account-role-ui-fix.js?v=1').catch(error=>console.error('Error loading resilient account controls:',error));
import('./admin-navigation.js?v=3').catch(error=>console.error('Error loading admin navigation:',error));
import('./social-interactions.js?v=3').catch(error=>console.error('Error loading social interactions:',error));