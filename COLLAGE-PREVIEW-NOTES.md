# Show Collage Wall — preview notes (2026-11-05)

## What shipped in this preview
- `collage.html` + `collage.js` — framed Polaroid wall, Stick It On The Wall, live update, Save This Collage
- Seed Polaroids in `assets/collage/seed-01.jpg` … `seed-08.jpg`
- Modest links: global header news ticker + homepage secondary card next to “Vote”
- **No production deploy. No rules deploy. No merge to main.**

## Generic seeds + admin hide (2026-11-05, preview only)

The eight starter JPGs are generic show scenes (stage light, crowd silhouettes, fog, a guitar and amp, a microphone). Captions stay **Scene seed**. No band names, logos, or branded posters. Image URLs are cache-busted with `?v=20261105-generic`.

### License
All eight photos are from Unsplash and used under the [Unsplash License](https://unsplash.com/license): free to use, including commercially. Attribution is not required. Source files (square-cropped to 800px JPEG for the wall):

| Seed | Scene | Source |
|---|---|---|
| seed-01 | Spotlight and crowd silhouette | https://images.unsplash.com/photo-1758979141086-1c32a2885d06 |
| seed-02 | Crowd, fog, and stage lights | https://images.unsplash.com/photo-1540039155733-5bb30b53aa14 |
| seed-03 | Hands up in warm stage light | https://images.unsplash.com/photo-1507874457470-272b3c8d8ee2 |
| seed-04 | Fog and a stage light bar | https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b |
| seed-05 | Performers as silhouettes | https://images.unsplash.com/photo-1501612780327-45045538702b |
| seed-06 | Festival crowd facing the stage | https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3 |
| seed-07 | Electric guitar and amp | https://images.unsplash.com/photo-1550291652-6ea9114a47b1 |
| seed-08 | Dynamic microphone | https://images.unsplash.com/photo-1516280440614-37939bbacd81 |

seed-01’s Unsplash page credits Massiel Castro. The other seven are the Unsplash photo ids above.

### How admin seed remove persists
Live uploads are still `media` docs with `gallery: 'collage'`. Admin Remove on those still `deleteDoc`s the media doc (and best-effort deletes Storage).

Starter seeds are not Firestore docs. Hiding one writes its id into `profiles/PJXufsvdCCgRpfKcLtxPH3jEQN83.collageHiddenSeedIds` with `arrayUnion`. Every visitor (logged out included) subscribes to that profile doc and drops those ids when the wall is built. The `live.length >= 12` auto-drop is unchanged and still runs; a manual hide works below 12 live photos.

Why this path, with no rules change:

- Anonymous `get` of that profile already succeeds (the profile is `published: true`).
- Anonymous `update` of that profile is denied.
- Admin profile edits elsewhere already `updateDoc` arbitrary fields (`adminNote`, `published`, and so on), so a new array field does not need a new ruleset.
- A new collection would need a rules deploy. A `media` doc any signed-in member can create would let a non-admin hide seeds for everyone. The admin profile does not.

The Remove control is the same as live uploads: an admin clicks the Polaroid, then Remove in the admin strip. Non-admins never get that click handler, and the strip stays hidden. Only the two admin emails and the admin UID are treated as admin in the client. The write still has to pass Firestore rules, which limit profile updates to the owner and admins.

## Preview-safe data path (works with CURRENT rules)
Uploads intentionally reuse paths that already allow signed-in members:

| Layer | Path / collection | Why |
|---|---|---|
| Storage | `profile-media/{uid}/collage-{ts}-{name}` | Existing profile-media image create rules |
| Firestore | `media` docs with `gallery: 'collage'`, `mediaType: 'image'`, `published: true`, `ownerId` | Existing media create/read/delete rules |

Live wall: `onSnapshot(query(media where gallery == 'collage'))`.
Admin remove: same admin email / UID checks used elsewhere; `deleteDoc` on the media doc (+ best-effort Storage delete).

## Caps
- 8 MB client cap (JPEG/PNG/WebP/GIF)
- Newest ~48 Polaroids rendered
- HEIC called out in UI (convert to JPEG first)

## Production rules Mike must approve BEFORE go-live (optional cleanup)
Dedicated path is cleaner long-term. **Do not deploy until Mike says yes.**

### Storage snippet (add; keep existing rules)
```
/* SHOW COLLAGE WALL */
match /collage/{userId}/{fileName} {
  allow read: if true;
  allow create, update: if request.auth != null
                        && request.auth.uid == userId
                        && request.resource.size > 0
                        && request.resource.size < 8 * 1024 * 1024
                        && request.resource.contentType.matches('image/(jpeg|png|webp|gif)');
  allow delete: if request.auth != null
                && (request.auth.uid == userId || isVerifiedAdmin());
}
```
(`isVerifiedAdmin` already exists in the hardened storage.rules draft; production HEAD may still inline the admin email check.)

### Firestore snippet (add before the catch-all deny)
```
match /collageItems/{itemId} {
  allow read: if true;
  allow create: if isSignedIn()
                && request.resource.data.uid == request.auth.uid
                && request.resource.data.url is string
                && request.resource.data.published == true;
  allow update: if isAdmin();
  allow delete: if isSignedIn()
                && (resource.data.uid == request.auth.uid || isAdmin());
}
```

Until those land, the preview path above is intentional and documented.

## How to test
1. Open the Firebase Hosting preview URL `/collage.html`
2. Confirm seed Polaroids inside the frame
3. Logged out → Stick It On The Wall → login/signup prompt
4. Log in free → pick a JPEG/PNG → watch it appear live (second tab optional)
5. Save This Collage → downloads a JPG of the framed wall
6. Admin (Mike) → click a live Polaroid → Remove

## Out of scope this preview
Stripe, schedules, playlists, panel code, production hosting, GitHub Pages/main merge.
