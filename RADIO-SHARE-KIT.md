# Radio Share Kit

Preview for bands that already have approved music on BANDtroductions Radio. The card is drawn in the browser. Nothing in this kit writes radio schedules, playlists, approvals, ads, Firestore, or Storage.

## Where it shows

- Band owner, on their profile (`profile.html`) and on their band website (`website-pilot.html`), after sign-in.
- Administrators, in The Control Room → Radio, above the existing radio tools.

Fans never see the buttons. A band with no approved song does not see them either.

## Eligibility

A song counts only when `approved === true`. That is the same flag the Radio Control Room uses for the Approved Songs library.

Songs are stored in two existing places:

- Firestore `radioApprovedTracks` (current approvals). Pending songs stay in `radioSubmissions` until an admin approves them, which copies the record here and sets `approved: true` plus `reviewStatus: 'approved'`.
- Realtime Database `RadioTracks` (older library). The control room already treats `approved === true` rows, other than `__station`, as approved songs.

The band link is `websiteProfileId`, or `profile.html?id=` inside `profileUrl` (including when that URL was saved from a preview host). A legacy `bandtroductions.com/*.html` profile URL is used when that is all the song has. `submittedByUid` is not treated as the band, because admin uploads store the admin’s account there and leave `profileUrl` empty.

Owner check, read-only, and only through paths the site already uses:

1. `getWebsiteRadioTracks` for a published profile. That callable already returns approved songs with public fields only. It is not called for an unpublished profile, because the function rejects those.
2. One read of public `RadioTracks`, the same library the homepage player reads, matched to this profile id.

The owner page does not query `radioApprovedTracks`. That collection stays private because the records contain contact details. No security rules were changed.

Admin check: the same read-only listeners the Radio Control Room already uses for `radioApprovedTracks` and `RadioTracks`. Any band with at least one linked approved song can be selected. The panel does not approve, reject, schedule, or edit those songs.

Owner accounts see the kit when `accountType` is `band` or `musician` (missing type is treated as `band`). Venue, fan, and business profiles stay hidden even if a song record points at them.

## Share link and UTM convention

Shared links always use the public site, not the page the owner happened to be on:

`https://bandtroductions.com/profile.html?id={profileId}&utm_source=band_share&utm_medium=social&utm_campaign=radio_share_kit&utm_content={profileId}`

| Param | Value | Meaning |
| --- | --- | --- |
| `utm_source` | `band_share` | The band shared it (not a house ad or the radio player). |
| `utm_medium` | `social` | Social post, story, or message. |
| `utm_campaign` | `radio_share_kit` | This share kit, so it stays separate from other profile shares. |
| `utm_content` | profile id, or the legacy page name | Which band the click came from. |

Legacy pages without a profile id use that page on `bandtroductions.com` and put the filename in `utm_content`.

## Analytics

Events go through `bt-analytics.js` (`window.btTrack`, measurement id `G-60112G8RH3`). On a Firebase preview host they already include `debug_mode`.

| Event | When |
| --- | --- |
| `share_kit_share` | The share sheet opens, or the no-share-sheet fallback saves the PNG. `method` is `web_share_files`, `web_share`, or `download_fallback`. |
| `share_kit_download` | Download is tapped and the PNG is saved. |
| `share_kit_copy_link` | Copy Link succeeds. |

Parameters: `profile_id`, `song_count`, `surface` (`owner` or `admin`), and `event_category` `Radio Share Kit`. Canceled share sheets are not counted. Contact fields are not sent.

## Card

1080×1080 PNG, client-side, using `share-card.js` (the Band of the Week “I voted” canvas). It draws the band name, the band photo when it loads, a monogram if there is no photo or the image is blocked by CORS, and the line “We're on BANDtroductions Radio!”.

Share uses the Web Share API with the PNG attached when `navigator.canShare` allows files (iPhone Safari). Otherwise it shares the link, then falls back to downloading the PNG and copying the link. Download always saves the PNG. Copy Link copies the UTM URL.

## Preview deploy

This branch does not deploy. From a machine that is already logged into Firebase:

```sh
firebase hosting:channel:deploy share-kit --project bandtroductions-dev --config firebase.preview.json --expires 7d
```

Sample UI with fictional bands (no radio reads or writes): `radio-share-kit-preview.html?view=owner` and `?view=admin`.

## Rollback

Do not merge the pull request. The kit adds no records. Removing `radio-share-kit-owner.js` from `profile.html` and `website-pilot.html`, and the admin import in `control-room-radio.js`, turns it off. Band of the Week still draws its card if `share-card.js` stays.

## Limitations

- Instagram, and most other apps, cannot be posted to directly from the mobile browser. The owner downloads the PNG and pastes the link in the app.
- Unpublished profiles do not get the Firestore approved-song check. `getWebsiteRadioTracks` only serves published profiles, and this preview does not change that function or the security rules.
- Songs with no profile id and no profile URL (including admin uploads that never picked a band) do not get a kit, because there is no profile to send fans to.
- A second admin listener watches the approved library. It is read-only and separate from scheduling code so this kit cannot change a playlist.
