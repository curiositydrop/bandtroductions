(function exposeVenueCampaignUtilities(global) {
  'use strict';

  function clean(value) {
    return String(value || '').trim();
  }

  function slug(value) {
    return clean(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);
  }

  function parseEvent(id, row) {
    if (!row || typeof row !== 'object') return null;
    let payload = null;
    try {
      payload = typeof row.message === 'string' ? JSON.parse(row.message) : row.message;
    } catch (_) {
      return null;
    }
    if (!payload || typeof payload !== 'object') return null;
    const venueName = clean(payload.venueName || row.name);
    const venueSlug = clean(payload.venueSlug) || slug(venueName);
    const venueId = clean(payload.venueId || payload.i) || venueSlug;
    const voterId = clean(payload.voterId || payload.u);
    const actId = clean(payload.actId || payload.a);
    const actName = clean(payload.actName || payload.n);
    const deleted = payload.deleted === true || payload.d === 1;
    if (!venueName || !venueId || !voterId || (!deleted && (!actId || !actName))) return null;
    const source = payload.source === 'general-discovery' || payload.s === 'g' ? 'general-discovery' : 'venue-qr';
    const firstSource = payload.firstSource === 'general-discovery' || payload.f === 'g' ? 'general-discovery' : source;
    return {
      id,
      venueId,
      venueSlug,
      venueName,
      venueLocation: clean(payload.venueLocation || payload.l),
      venueProfileUrl: clean(payload.venueProfileUrl || payload.r),
      voterId,
      actId,
      actName,
      profileUrl: clean(payload.profileUrl || payload.p),
      previousActId: clean(payload.previousActId),
      deleted,
      source,
      firstSource,
      createdAt: Number(row.createdAt || payload.createdAt || 0)
    };
  }

  function aggregate(rows) {
    const entries = Array.isArray(rows) ? rows.map((row, index) => [String(index), row]) : Object.entries(rows || {});
    const latestByVenueVoter = new Map();

    entries.forEach(([id, row]) => {
      const event = parseEvent(id, row);
      if (!event) return;
      const key = `${event.venueId}::${event.voterId}`;
      const previous = latestByVenueVoter.get(key);
      if (!previous || event.createdAt >= previous.createdAt) latestByVenueVoter.set(key, event);
    });

    const venues = new Map();
    latestByVenueVoter.forEach(event => {
      if (event.deleted) return;
      if (!venues.has(event.venueId)) {
        venues.set(event.venueId, {
          venueId: event.venueId,
          venueSlug: event.venueSlug,
          venueName: event.venueName,
          venueLocation: event.venueLocation,
          venueProfileUrl: event.venueProfileUrl,
          uniqueVoters: 0,
          preCampaignDemand: 0,
          campaignParticipants: 0,
          latestActivity: 0,
          acts: new Map()
        });
      }
      const venue = venues.get(event.venueId);
      if (event.venueName) venue.venueName = event.venueName;
      if (event.venueLocation) venue.venueLocation = event.venueLocation;
      if (event.venueProfileUrl) venue.venueProfileUrl = event.venueProfileUrl;
      venue.uniqueVoters += 1;
      if (event.firstSource === 'general-discovery') venue.preCampaignDemand += 1;
      if (event.source === 'venue-qr') venue.campaignParticipants += 1;
      venue.latestActivity = Math.max(venue.latestActivity, event.createdAt);
      const act = venue.acts.get(event.actId) || { actId: event.actId, actName: event.actName, profileUrl: event.profileUrl, votes: 0 };
      act.votes += 1;
      if (event.actName) act.actName = event.actName;
      if (event.profileUrl) act.profileUrl = event.profileUrl;
      venue.acts.set(event.actId, act);
    });

    return [...venues.values()].map(venue => ({
      ...venue,
      acts: [...venue.acts.values()].sort((a, b) => b.votes - a.votes || a.actName.localeCompare(b.actName))
    })).sort((a, b) => b.preCampaignDemand - a.preCampaignDemand || b.uniqueVoters - a.uniqueVoters || a.venueName.localeCompare(b.venueName));
  }

  global.BTVenueCampaign = Object.freeze({ aggregate, clean, parseEvent, slug });
})(globalThis);
