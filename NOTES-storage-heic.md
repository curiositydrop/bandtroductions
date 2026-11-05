# Storage rules + HEIC pickers (preview/storage-heic) — PREVIEW ONLY

## Live Storage rules status
- LIVE on bandtroductions-dev since 2026-11-04 9:32 PM ET: ruleset 488b92cc (previous fe047582).
- profile-media/{uid}/: photos jpeg/png/webp/gif/heic/heif ≤20 MB, videos mp4/mov/webm ≤100 MB, owner's own folder only, size > 0. Read public.
- This fixed "Media upload is blocked by Firebase Storage rules" for community video posts.
- Nothing about Storage rules was deployed tonight.

## What the repo commit should contain
- storage.rules on this branch = the rules that are live now (byte-identical to growth/community-media/storage.rules.proposed).
- origin/main still has the OLD weaker file (images only, no isVerifiedAdmin). If anyone deploys from main as it is now, the video/HEIC fix gets REVERTED. Merge this branch (or just storage.rules) to keep the repo matching what's live.
- Other paths (users/{uid}/..., show-flyers, website images) still allow jpeg/png/webp(/gif) only. Avatar/banner tools resize in the browser through a canvas, so iPhone Safari uploads JPEG anyway.

## HEIC picker changes (UI only)
accept="image/*,image/heic,image/heif" (plus mp4/webm/mov where video is allowed) on:
- Home "Create a Post" image (dashboard-media-upload.js)
- Community "Upload New" (community-media.js), Media Library (media.html)
- Profile media editor (profile-media-editor.js), dashboard avatar/banner (dashboard.html), profile setup (profile-setup.html)

## HEIC caveats
- iPhone Safari usually converts HEIC to JPEG on its own when you pick a photo. These accept values make sure HEIC/HEIF files show up and can be picked everywhere (Files app, Chrome on iOS, Mac).
- Create a Post re-encodes photos to JPEG through a canvas. Safari can decode HEIC, so the result is a normal JPEG. In other browsers the original HEIC may get uploaded as-is.
- Community "Upload New" and Media Library upload the original file. A raw .heic is allowed by the rules, but Chrome/Firefox/Android can't display it (Safari 17+ can). Future fix: convert in the browser (e.g. heic2any) or add a Cloud Function that converts to JPEG.

## How to test (iPhone)
1. Open the preview URL and log in.
2. Home > Create a Post > UPLOAD IMAGE > Photo Library > pick a normal iPhone photo > post. It should show up in the feed.
3. Do the same with a short video (under 100 MB).
4. Optional: Files app > choose a .heic file > post. Then open that post on a desktop Chrome browser to check that it displays.
Note: the preview uses the dev project's live Firebase backend, so test posts are real. Delete them after testing.

## Rollback
- UI: discard this preview channel or branch. Nothing is live.
- Storage rules (if ever needed): cp /workspace/growth/community-media/storage.rules.live-backup storage.rules && npx -y firebase-tools deploy --only storage --project bandtroductions-dev (only with Mike's OK), or roll back in Console > Storage > Rules history to fe047582.
