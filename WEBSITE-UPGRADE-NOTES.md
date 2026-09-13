# Website upgrade preview

Preview: https://bandtroductions.com/website-upgrade-preview.html?id=19MH0ZzVlPVN4ediF4PesZR5TY13&edit=1

The existing website.html, profile loader, homepage player, admin approval handler and Firestore rules remain unchanged.

## Included

- Profile image/video galleries merged with website extras.
- Full calendar, age markers, show details dialog and owner/admin show editor. Uses existing posts/event records.
- Band music player, album art and radio branding.
- Song upload form using radio-submissions/{uid}/ and radioSubmissions, existing permissions plus website/radio consent. Existing admin approval copies websiteProfileId to radioApprovedTracks.
- Read-only getWebsiteRadioTracks callable: filters approved records by published profile and returns a public-field whitelist.

## Activation blocker

A live unsigned read verified that radioApprovedTracks is private. Do not relax its read rules: records contain contact/submission details.

Deploy only the new function using an authenticated Firebase deployment environment:

```sh
firebase deploy --only functions:getWebsiteRadioTracks --project bandtroductions-dev
```

This session has GitHub access but no Firebase deployment environment/credentials. Function source is prepared, not deployed. Until activation, the preview player shows its connection message; no private library reads are attempted from website visitors.

After deployment, verify the callable returns approved, public-only songs; then promote website-upgrade-preview.html to website.html, retaining the generic profile-ID routing. The preview does not change paid-access behavior.

## Verification

Website workflow exercises mobile rendering, original and extra galleries, create/edit show using a single post, clickable age markers, appearance publish, mocked song uploads and approval, band isolation, public-field sanitization and logged-out editor access. Real database checks are read-only. No real shows, submissions, notifications or payments were created by the tests.

Undo branch: undo/website-calendar-player-20260913.
