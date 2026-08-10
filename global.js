// Keep data-driven Social/Profile areas from flashing their raw placeholder state
// while Firebase auth, profile data, posts, and remote images finish resolving.
(function stabilizeInitialRendering(){
  const isCommunity=location.pathname.endsWith('/community.html');
  const isProfile=location.pathname.endsWith('/profile.html');

  if(isCommunity){
    const style=document.createElement('style');
    style.id='community-boot-stability';
    style.textContent=`
      html.bt-community-booting .community-tools-wrap,
      html.bt-community-booting #post-composer,
      html.bt-community-booting #feed,
      html.bt-community-booting #feed-status{visibility:hidden!important}
    `;
    document.head.appendChild(style);
    document.documentElement.classList.add('bt-community-booting');

    const releaseWhenReady=()=>{
      const feed=document.getElementById('feed');
      const feedStatus=document.getElementById('feed-status');
      const composer=document.getElementById('post-composer');
      const guest=document.getElementById('guest-prompt');
      const composerName=document.getElementById('composer-name');
      if(!feed||!feedStatus||!composer||!guest)return false;

      const feedResolved=feedStatus.hidden || !/loading the community feed/i.test(feedStatus.textContent||'');
      const signedInReady=!composer.hidden && (composerName?.textContent||'').trim() && (composerName?.textContent||'').trim()!=='Create a post';
      const guestReady=!guest.hidden;
      if(feedResolved && (signedInReady||guestReady)){
        document.documentElement.classList.remove('bt-community-booting');
        return true;
      }
      return false;
    };

    const observer=new MutationObserver(()=>{if(releaseWhenReady())observer.disconnect()});
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
    document.addEventListener('DOMContentLoaded',releaseWhenReady,{once:true});
    setTimeout(()=>{document.documentElement.classList.remove('bt-community-booting');observer.disconnect()},6000);
  }

  if(isProfile){
    document.addEventListener('DOMContentLoaded',()=>{
      const content=document.getElementById('profile-content');
      const status=document.getElementById('profile-status');
      if(!content)return;
      let intercepted=false;
      const preload=url=>new Promise(resolve=>{if(!url){resolve();return}const image=new Image();image.onload=()=>resolve();image.onerror=()=>resolve();image.src=url;if(image.complete)resolve();});
      const observer=new MutationObserver(async()=>{
        if(content.dataset.assetsReady==='true'){observer.disconnect();return;}
        if(intercepted||content.hidden)return;
        intercepted=true;content.hidden=true;if(status){status.hidden=false;status.textContent='Loading profile…'}
        const avatarUrl=content.querySelector('#profile-avatar img')?.src||'';
        const cover=document.getElementById('profile-cover');
        const background=cover?.style.backgroundImage||'';
        const matches=[...background.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
        const bannerUrl=matches.length?matches[matches.length-1][1]:'';
        await Promise.race([Promise.all([preload(avatarUrl),preload(bannerUrl)]),new Promise(resolve=>setTimeout(resolve,2500))]);
        observer.disconnect();content.hidden=false;if(status)status.hidden=true;
      });
      observer.observe(content,{attributes:true,attributeFilter:['hidden']});
    },{once:true});
  }
})();

fetch('global.html?v=8')
  .then(response => response.text())
  .then(async data => {
    const temp = document.createElement('div');temp.innerHTML = data;
    const header = temp.querySelector('#site-header'),footer = temp.querySelector('#site-footer'),headerTarget = document.getElementById('global-header'),footerTarget = document.getElementById('global-footer');
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
if(location.pathname.endsWith('/profile-setup.html')){import('./profile-image-processing.js?v=2').catch(error=>console.error('Error loading profile image processing:',error));import('./profile-submission-flow.js?v=4').catch(error=>console.error('Error loading profile submission workflow:',error))}
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
import('./presence.js?v=1').catch(error=>console.error('Error loading online presence:',error));