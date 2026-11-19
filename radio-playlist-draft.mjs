// Playlist Studio must reopen a show from its saved items array.
// Clicking library Add buttons rebuilds the list from whichever source has
// already loaded. A legacy track such as testTrack often has no stored
// duration, so its audio metadata returns later and Add appends it — moving
// it to the end, and appending another copy if that lookup is still in flight
// when the playlist is opened again.

export function restorePlaylistEditorItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(item => ({...item}));
}

export function bumpDraftEpoch(epoch) {
  return (Number.isInteger(epoch) && epoch >= 0 ? epoch : 0) + 1;
}

export function draftMutationIsCurrent(startedEpoch, currentEpoch) {
  return startedEpoch === currentEpoch;
}

// A library Add that had to read audio metadata. If the editor was cleared or
// restored while that read was in flight, the lookup must not append.
export function commitAsyncLibraryAdd(startedEpoch, currentEpoch, draftItems, resolvedItem) {
  const items = Array.isArray(draftItems) ? draftItems : [];
  if (!draftMutationIsCurrent(startedEpoch, currentEpoch)) return {status:'stale', items};
  const duration = Number(resolvedItem?.durationSeconds);
  if (!resolvedItem || typeof resolvedItem !== 'object' || !Number.isFinite(duration) || duration <= 0) {
    return {status:'invalid', items};
  }
  return {status:'added', items:[...items, resolvedItem]};
}
