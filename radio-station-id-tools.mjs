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
