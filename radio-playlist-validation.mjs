// Pure validation shared by the Radio Control Room and its tests.
export function validatePlaylistItems(draft, startMinutes, endMinutes) {
  if (!Array.isArray(draft) || !draft.length) return {ok:false, reason:'empty'};
  if (draft.some(item => !item || !item.audioUrl)) return {ok:false, reason:'missing-audio'};
  if (draft.some(item => !Number.isFinite(Number(item.durationSeconds)) || Number(item.durationSeconds) <= 0)) return {ok:false, reason:'invalid-duration'};
  if (!Number.isInteger(startMinutes) || !Number.isInteger(endMinutes) || startMinutes < 0 || startMinutes >= 1440 || endMinutes < 0 || endMinutes > 1440 || startMinutes === endMinutes) return {ok:false, reason:'invalid-window'};
  const windowSeconds = (endMinutes === 1440 && startMinutes === 0 ? 1440 : (endMinutes - startMinutes + 1440) % 1440) * 60;
  const totalSeconds = draft.reduce((sum, item) => sum + Number(item.durationSeconds), 0);
  if (totalSeconds > windowSeconds) return {ok:false, reason:'overfull', overBySeconds:totalSeconds-windowSeconds};
  return {ok:true, totalSeconds, windowSeconds};
}
