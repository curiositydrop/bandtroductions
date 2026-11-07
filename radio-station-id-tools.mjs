// A station ID is a short approved audio clip between songs, never over a song.
export function validateStationId(id){
 if(!id||typeof id!=='object'||!id.audioUrl||typeof id.audioUrl!=='string')return {ok:false,reason:'missing-audio'};
 const seconds=Number(id.durationSeconds);
 if(!Number.isFinite(seconds)||seconds<=0||seconds>60)return {ok:false,reason:'invalid-duration'};
 return {ok:true};
}
export function insertStationId(items,id,afterIndex,{linkToNextSong=false}={}){
 if(!Array.isArray(items)||afterIndex< -1||afterIndex>=items.length)return {ok:false,reason:'invalid-position'};
 const check=validateStationId(id);if(!check.ok)return check;
 if(afterIndex>=0&&items[afterIndex]?.type!=='track')return {ok:false,reason:'not-between-songs'};
 const next=items[afterIndex+1];
 if(linkToNextSong&&(!next||next.type!=='track'||(id.artistId&&id.artistId!==next.artistId)))return {ok:false,reason:'invalid-song-link'};
 const entry={...id,type:'stationId',linkedSongId:linkToNextSong?next.id||'':null};
 const result=[...items];result.splice(afterIndex+1,0,entry);
 return {ok:true,items:result,warning:items.some(item=>item.type==='stationId'&&item.id===id.id)?'duplicate-station-id':null};
}
export function groupLinkedStationIds(items){
 const groups=[];
 for(let i=0;i<items.length;i++){
  const item=items[i];const next=items[i+1];
  if(item.type==='stationId'&&item.linkedSongId&&next?.type==='track'&&next.id===item.linkedSongId){groups.push([item,next]);i++;}
  else groups.push([item]);
 }
 return groups;
}

/**
 * Shuffle song units while preserving every station ID immediately preceding its song.
 * Sponsor slots remain anchored at their existing indexes. A station ID with no
 * following song is rejected rather than silently orphaned.
 */
export function shufflePlaylistWithStationIds(items, random=Math.random) {
  if(!Array.isArray(items))return {ok:false,reason:'invalid-playlist'};
  const units=[];
  for(let i=0;i<items.length;i++){
    const item=items[i];
    if(item?.type==='stationId'){
      const song=items[i+1];
      if(song?.type!=='track')return {ok:false,reason:'station-id-position'};
      if(item.linkedSongId&&item.linkedSongId!==song.id)return {ok:false,reason:'station-id-link'};
      units.push([item,song]);i++;
    }else units.push([item]);
  }
  // Do not move sponsors, and only shuffle adjacent song units within each
  // sponsor-delimited segment; station IDs travel with their song.
  const output=[];
  let segment=[];
  function flush(){
    for(let i=segment.length-1;i>0;i--){
      const j=Math.min(i,Math.max(0,Math.floor(random()*(i+1))));
      [segment[i],segment[j]]=[segment[j],segment[i]];
    }
    for(const unit of segment)output.push(...unit);
    segment=[];
  }
  for(const unit of units){
    if(unit[0]?.type==='sponsor'){flush();output.push(...unit);}
    else segment.push(unit);
  }
  flush();
  return {ok:true,items:output};
}
