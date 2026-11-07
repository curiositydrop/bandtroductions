// Pure planning for up to two commercials in an existing one-minute break.
// No database or audio side effects: safe to exercise on preview builds.
export function planCommercialBreak(ads, breakSeconds=60) {
  if (!Array.isArray(ads)) return {ok:false,reason:'invalid-library',slots:[]};
  if (!Number.isFinite(breakSeconds)||breakSeconds<=0||breakSeconds>60) return {ok:false,reason:'invalid-break',slots:[]};
  const active=ads.filter(ad=>ad?.active===true);
  if(active.length===0)return {ok:false,reason:'no-active-ads',slots:[]};
  if(active.length>2)return {ok:false,reason:'too-many-ads',slots:[]};
  if(active.some(ad=>!ad.audioUrl||!Number.isFinite(Number(ad.durationSeconds))||Number(ad.durationSeconds)<=0||!Number.isInteger(Number(ad.durationSeconds))||Number(ad.durationSeconds)>60))return {ok:false,reason:'invalid-media',slots:[]};
  let offset=0;const slots=[];
  for(const ad of active){const duration=Number(ad.durationSeconds);if(offset+duration>breakSeconds)return {ok:false,reason:'overfull-break',slots:[]};slots.push({...ad,startSeconds:offset,endSeconds:offset+duration});offset+=duration;}
  return {ok:true,slots,usedSeconds:offset,remainingSeconds:breakSeconds-offset};
}
export function commercialAtOffset(plan, offsetSeconds){
  if(!plan?.ok||!Number.isFinite(offsetSeconds)||offsetSeconds<0)return null;
  const slot=plan.slots.find(s=>offsetSeconds>=s.startSeconds&&offsetSeconds<s.endSeconds);
  return slot?{...slot,offsetSeconds:offsetSeconds-slot.startSeconds}:null;
}
