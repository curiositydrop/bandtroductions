export const FEATURED_CACHE_KEY = 'btFeaturedBands:v1';
export const FEATURED_CACHE_LIMIT = 24;

export function isSafeFeaturedHref(href){
  const value=String(href||'').trim();
  if(!value||/\s/.test(value)||value.includes('..'))return false;
  if(/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)||value.startsWith('//'))return false;
  return /^profile\.html\?id=[^#?&/]+$/.test(value);
}

export function isSafeImageUrl(url){
  const value=String(url||'').trim();
  if(!value)return true;
  if(value.startsWith('//')||/^javascript:/i.test(value)||/\s/.test(value))return false;
  if(/^https?:\/\//i.test(value))return true;
  if(/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value))return false;
  return !value.includes('..');
}

export function normalizeFeaturedEntry(entry){
  if(!entry||typeof entry!=='object')return null;
  const uid=String(entry.uid||entry.id||'').trim();
  const name=String(entry.name||entry.displayName||'').trim();
  if(!uid||!name)return null;
  const href=String(entry.href||entry.link||`profile.html?id=${encodeURIComponent(uid)}`).trim();
  if(!isSafeFeaturedHref(href))return null;
  const imageUrl=String(entry.imageUrl||'').trim();
  if(!isSafeImageUrl(imageUrl))return null;
  return {
    uid,
    name,
    imageUrl,
    location:String(entry.location||'').trim(),
    genre:String(entry.genre||'').trim(),
    href
  };
}

export function toFeaturedCacheEntry(id,profile){
  const uid=String(id||'').trim();
  return normalizeFeaturedEntry({
    uid,
    name:String(profile?.displayName||'').trim()||'Unnamed Band',
    imageUrl:String(profile?.imageUrl||'').trim(),
    location:String(profile?.location||'').trim(),
    genre:String(profile?.genre||'').trim(),
    href:`profile.html?id=${encodeURIComponent(uid)}`
  });
}

export function parseFeaturedCache(raw){
  if(typeof raw!=='string'||!raw)return [];
  try{
    const data=JSON.parse(raw);
    if(!Array.isArray(data))return [];
    return data.map(normalizeFeaturedEntry).filter(Boolean).slice(0,FEATURED_CACHE_LIMIT);
  }catch{
    return [];
  }
}

export function serializeFeaturedList(entries){
  return JSON.stringify((Array.isArray(entries)?entries:[])
    .map(normalizeFeaturedEntry)
    .filter(Boolean)
    .slice(0,FEATURED_CACHE_LIMIT));
}

export function readFeaturedCache(storage){
  try{
    const store=storage||globalThis.localStorage;
    if(!store||typeof store.getItem!=='function')return [];
    return parseFeaturedCache(store.getItem(FEATURED_CACHE_KEY));
  }catch{
    return [];
  }
}

export function writeFeaturedCache(entries,storage){
  try{
    const store=storage||globalThis.localStorage;
    if(!store)return;
    const list=(Array.isArray(entries)?entries:[])
      .map(normalizeFeaturedEntry)
      .filter(Boolean)
      .slice(0,FEATURED_CACHE_LIMIT);
    if(!list.length){
      if(typeof store.removeItem==='function')store.removeItem(FEATURED_CACHE_KEY);
      return;
    }
    store.setItem(FEATURED_CACHE_KEY,JSON.stringify(list));
  }catch{ /* private mode */ }
}

export function featuredListsMatch(a,b){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
  return a.every((item,index)=>{
    const other=b[index];
    return !!other
      && item.uid===other.uid
      && item.name===other.name
      && item.imageUrl===other.imageUrl
      && item.location===other.location
      && item.genre===other.genre
      && item.href===other.href;
  });
}

export function readRenderedFeatured(grid){
  if(!grid)return [];
  return [...grid.querySelectorAll('.profile-card:not(.is-featured-skeleton)')].map(card=>{
    const button=card.querySelector(':scope > .button');
    const paragraphs=[...card.querySelectorAll(':scope > p')];
    const locationText=paragraphs[0]?.textContent||'';
    const genreText=paragraphs[1]?.textContent||'';
    return normalizeFeaturedEntry({
      uid:card.dataset.profileId||'',
      name:card.querySelector('h3')?.textContent||'',
      imageUrl:card.querySelector(':scope > img')?.src||'',
      location:locationText.replace(/^\s*Location:\s*/i,'').trim(),
      genre:genreText.replace(/^\s*Genre:\s*/i,'').trim(),
      href:button?.getAttribute('href')||''
    });
  }).filter(Boolean);
}
