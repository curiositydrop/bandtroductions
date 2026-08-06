(async function addLiveProfilesToBandfeed(){
  const waitForLegacyLoad=()=>new Promise(resolve=>{
    const started=Date.now();
    const timer=setInterval(()=>{
      const loading=document.getElementById('loadingMessage');
      const ready=!loading || loading.style.display==='none' || /No videos found yet/i.test(loading.textContent||'') || Date.now()-started>30000;
      if(ready){clearInterval(timer);resolve();}
    },350);
  });

  try{
    await waitForLegacyLoad();
    const [{db},{collection,getDocs,query,where}]=await Promise.all([
      import('./firebase-dev.js'),
      import('https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js')
    ]);
    const snap=await getDocs(query(collection(db,'profiles'),where('published','==',true)));
    const existing=new Set((bandfeedItems||[]).flatMap(item=>[
      String(item.profileUrl||'').toLowerCase(),
      String(item.videoId||'').toLowerCase(),
      String(item.title||'').trim().toLowerCase()
    ]).filter(Boolean));

    const additions=[];
    snap.docs.forEach(profileDoc=>{
      const data=profileDoc.data()||{};
      const type=String(data.accountType||data.profileType||'').toLowerCase();
      if(type!=='band'&&type!=='musician')return;
      const rawVideo=data.mediaLink||data.videoUrl||data.youtubeUrl||data.videoLink||data.performanceVideo||data.mediaUrl||'';
      const embedUrl=normalizeYouTubeUrl(rawVideo);
      const videoId=extractYouTubeVideoId(embedUrl);
      if(!videoId)return;
      const title=data.displayName||data.bandName||data.name||'BANDtroductions Artist';
      const profileUrl=`profile.html?id=${encodeURIComponent(profileDoc.id)}`;
      const keyTitle=String(title).trim().toLowerCase();
      if(existing.has(profileUrl.toLowerCase())||existing.has(videoId.toLowerCase())||existing.has(keyTitle))return;
      const image=data.imageUrl||data.avatarUrl||data.photoURL||data.profileImageUrl||'IMG_9383.jpeg';
      const meta=[data.location,data.genre||data.instruments].filter(Boolean).join(' • ')||'BANDtroductions Social';
      additions.push({title,image,profileUrl,meta,embedUrl,videoId,fallbackUrl:null});
      existing.add(profileUrl.toLowerCase());existing.add(videoId.toLowerCase());existing.add(keyTitle);
    });

    if(!additions.length)return;
    const startIndex=bandfeedItems.length;
    bandfeedItems.push(...additions);
    additions.forEach((item,offset)=>browserContainer.appendChild(createVideoItem(item,startIndex+offset)));
    if(loadingMessage)loadingMessage.style.display='none';
    if(!player)buildPlayerIfReady();
    console.log(`BANDfeed added ${additions.length} live profile video(s).`);
  }catch(error){
    console.warn('Live BANDfeed profiles could not be loaded.',error);
  }
})();
