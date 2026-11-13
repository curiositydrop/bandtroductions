# Social preview options

This note is the write-up only. Nothing in it is implemented except the static files already in `/og/` and the meta tags in each public HTML file.

Production `bandtroductions.com` is GitHub Pages (see `CNAME`). `firebase.json` has Functions and Storage only. It has no Hosting block, so it has no rewrites and no headers that could block `facebookexternalhit`, Facebot, or Twitterbot. Do not add a Hosting block there: a full `firebase deploy` would start publishing this repo to Firebase Hosting.

`firebase.preview.json` is the preview-channel config. It also has no rewrites. `/og/*.jpg` is served as `image/jpeg`. GitHub Pages does the same from the `.jpg` extension. `robots.txt` allows `/` for every agent, including the preview crawlers, and does not disallow `/og/`.

`_headers` only marks two unused header fragments `noindex`. GitHub Pages does not apply that file. It does not block images or crawlers.

## What shipped

Every public HTML page now has static Open Graph and Twitter Card tags in the initial file, with absolute `https://bandtroductions.com` URLs. Crawlers do not run the page's JavaScript, so tags injected later (`profile-seo-meta.js`, `website-seo-meta.js`) are not what Facebook or X see.

`/og/botw-current.jpg` is the Band of the Week share image. Today it is a byte-for-byte copy of the branded card `/og/botw.jpg`. The page points at the stable `botw-current.jpg` URL.

The New Leaf Painting Co. logo stays on the Band of the Week page, and the sponsor's other placements are unchanged. It is not referenced by any share tag.

## Band of the Week winner image

The safe version is the one in the repo now.

Each week, replace `og/botw-current.jpg` with a 1200×630 JPEG under about 300 KB and publish the static site the same way the rest of the HTML is published. No Cloud Function, no Storage rule change, no billing change, and no edit to `band-of-the-week.html`. Keep `og/botw.jpg` as the branded card to copy back when there is no winner photo.

After it is live, open the Facebook Sharing Debugger and Scrape Again on `https://bandtroductions.com/band-of-the-week.html`. Facebook caches the image URL, so a replaced file is invisible until that scrape (or until the cache expires). X has its own card cache; revalidate there the same way.

A query string such as `botw-current.jpg?week=2026-11-16` would bust the cache, but the HTML would have to change every week. Replacing the file and scraping again is the smaller step.

Do not point the tag at a band photo with client-side JavaScript. Crawlers will not see it, and the first image in the page is the sponsor logo.

Generating the winner card from Firestore on a schedule would need a new Function or a CI job with a service account. That is the per-profile option below, not something to add for one weekly JPEG.

## Per-profile previews

`profile.html?id=` is one file for every band, musician, and venue. GitHub Pages ignores the query string, so every crawler receives the same head. The static fallback is `/og/profile.jpg` plus a generic title. Legacy static pages (`misbehavin.html`, `crystal-listening-room.html`, and the other hand-built profiles) now use the band, musician, or venue card, still with their own title and description. None of that shows the person's own photo.

`profile-seo-meta.js` already copies the loaded name, bio, and avatar into the tags. That helps a browser. It does not help Facebook, X, iMessage, Slack, or Discord.

### Option A — leave the static fallback (recommended until a server is approved)

Cost: none. Risk: shares of `profile.html?id=` show the generic profile card, not that band's photo. No Functions, Hosting, billing, or rules change.

This is the right default. It already stops the sponsor-logo mis-preview.

### Option B — Cloud Function plus a Hosting rewrite

An `onRequest` function would read the profile and return HTML whose head contains that profile's name and `https` image. Firebase Hosting would rewrite `profile.html` to the function.

Cost: the rewrite cannot branch on user-agent, so every profile view, not just crawlers, invokes the function. Invocation price is small at crawl volume, but browser traffic adds CPU time, cold starts, and a new public endpoint. Functions v2 already requires the Blaze plan; this project has Functions, so the plan may already be Blaze. A new function is still a Functions config change, a Hosting config change, and a new quota. Out of scope for the metadata fix, and it was not added.

Risk: a bug in the function breaks every profile page. The function would read profiles by id, so private fields must be stripped. Relative or missing photos must fall back to `/og/band.jpg`, `/og/musician.jpg`, or `/og/venue.jpg`, never to whatever `<img>` happens to be first. Cache the HTML briefly or Facebook will hammer Firestore.

### Option C — build step that writes one HTML file per profile

A script or GitHub Action can render `/p/<id>.html` (or a slug) with the right tags and a copied image.

Cost: Actions minutes and repo size. No Firebase billing change if the job only commits static files. It does need a credential that can read the public profile fields.

Risk: the URLs people already share are `profile.html?id=`. New files do not change what those URLs return. Share buttons and existing links would have to move to the new path, and the files go stale until the next build. Fine for a directory of a few dozen legacy pages. A poor fit for every Firestore profile.

### Option D — edge worker in front of GitHub Pages

A Cloudflare Worker (or similar) on `bandtroductions.com` can detect a preview crawler, fetch the profile, and inject meta, while humans still receive the static file.

Cost: usually inside a free request tier. No Firebase Function and no change to security rules. It does put a proxy on the domain, which is new infrastructure and a DNS change.

Risk: the worker must fail open to the static file, must not leak private fields, and must refuse non-https or unexpected image hosts. This is the only option that keeps `profile.html?id=` and still varies the tags, without a Firebase Hosting rewrite.

### Recommendation

Stay on option A. Revisit option D if per-profile photos in iMessage and Facebook matter more than adding a proxy. Use option B only with an explicit decision to put profile traffic on a Cloud Function. Do not use option C unless share links move off `profile.html?id=`.
