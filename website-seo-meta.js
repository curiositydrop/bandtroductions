/* SEO helper for website-pilot.html. Read-only: uses the already-loaded public profile,
   never fetches, never changes rendering or load logic.
   Robots stays noindex (from the static HTML) unless this is a published, plan-active public site
   opened without owner/editor parameters. */
const SITE='https://bandtroductions.com/';
const PILOT='19MH0ZzVlPVN4ediF4PesZR5TY13';
const ACTIVE=new Set(['active','trialing','comped']);
const SOCIAL_KEYS=['website','youtubeUrl','youtube','instagram','instagramUrl','facebook','facebookUrl','spotify','spotifyUrl','bandcamp','bandcampUrl','soundcloud','soundcloudUrl','tiktok','tiktokUrl','twitter','twitterUrl','appleMusicUrl'];
function https(v){try{const u=new URL(String(v||''));return u.protocol==='https:'?u.href:'';}catch{return '';}}
function meta(attr,key,val){if(!val)return;let el=document.head.querySelector(`meta[${attr}="${key}"]`);if(!el){el=document.createElement('meta');el.setAttribute(attr,key);document.head.appendChild(el);}el.setAttribute('content',val);}
function clip(s){s=String(s||'').replace(/\s+/g,' ').trim();return s.length>155?s.slice(0,152).replace(/\s+\S*$/,'')+'…':s;}
export function isPublicIndexable(profileId,profile){
 if(!profileId||!profile||profile.published!==true)return false;
 const q=new URLSearchParams(location.search);
 if(q.get('edit')==='1'||q.has('area')||q.has('preview')||q.has('draft'))return false;
 const plan=String(profile.websitePlanStatus||profile.artistPlan?.status||'').toLowerCase();
 return profileId===PILOT||(profile.websiteEnabled===true&&ACTIVE.has(plan));
}
export function applyWebsiteSeo({profileId,profile,view}){
 try{
  const p=view||profile||{};
  const name=String(p.displayName||'').trim();if(!name)return;
  const url=SITE+'website-pilot.html?id='+encodeURIComponent(profileId);
  const genre=Array.isArray(p.genre)?p.genre.join(', '):String(p.genre||'').trim();
  const place=String(p.location||[p.city,p.region,p.country].filter(Boolean).join(', ')).trim();
  const desc=clip(p.bio)||clip(`${name}${genre?' — '+genre:''}${place?' from '+place:''}. Official band website with music, shows, merch and booking on BANDtroductions.`);
  const image=https(p.bannerImageUrl||p.coverImageUrl)||https(p.imageUrl||p.avatarUrl||p.photoURL);
  const title=`${name} | Official Band Website`;
  meta('name','description',desc);
  meta('property','og:title',title);meta('property','og:description',desc);meta('property','og:url',url);meta('property','og:type','profile');meta('property','og:site_name','BANDtroductions');
  meta('name','twitter:card',image?'summary_large_image':'summary');meta('name','twitter:title',title);meta('name','twitter:description',desc);
  if(image){meta('property','og:image',image);meta('name','twitter:image',image);}
  if(!isPublicIndexable(profileId,profile))return; // keep static noindex, no canonical/JSON-LD
  meta('name','robots','index,follow');
  let link=document.head.querySelector('link[rel="canonical"]');if(!link){link=document.createElement('link');link.rel='canonical';document.head.appendChild(link);}link.href=url;
  const sameAs=[...new Set([...SOCIAL_KEYS.map(k=>https(p[k])),...(Array.isArray(p.socialLinks)?p.socialLinks.map(s=>https(s?.url||s)):[])].filter(Boolean))];
  const ld={'@context':'https://schema.org','@type':'MusicGroup',name,url,description:desc,
   mainEntityOfPage:url};
  if(genre)ld.genre=genre;if(place)ld.location={'@type':'Place',name:place};if(image)ld.image=image;if(sameAs.length)ld.sameAs=sameAs;
  let s=document.getElementById('bt-website-jsonld');if(!s){s=document.createElement('script');s.type='application/ld+json';s.id='bt-website-jsonld';document.head.appendChild(s);}
  s.textContent=JSON.stringify(ld);
 }catch(error){console.warn('Website SEO meta skipped.',error);}
}
