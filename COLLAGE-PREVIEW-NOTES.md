# Show Collage Wall — preview notes (2026-11-05)

## What shipped in this preview
- `collage.html` + `collage.js` — framed Polaroid wall, Stick It On The Wall, live update, Save This Collage
- Seed Polaroids in `assets/collage/seed-01.jpg` … `seed-08.jpg`
- Modest links: global header news ticker + homepage secondary card next to “Vote”
- **No production deploy. No rules deploy. No merge to main.**

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
