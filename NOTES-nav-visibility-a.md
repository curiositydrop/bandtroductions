# Nav visibility preview (Option A) — do not merge

Preview only. Nothing here is on `main` or bandtroductions.com.

## What this branch changes
- `global-header-v2.html`: SHOWS, COLLAGE, and BTV sit in the primary nav after RADIO.
- The nav grid is 7 columns so 14 links stay on **two rows** (7 + 7) at every width, including 320px and 375px. This is the straight 7-column add. A MORE menu was not needed.
- `shows.html` keeps its own short top bar (it does not load the shared header). SHOWS in the shared nav still opens that page. COLLAGE and BTV highlight themselves because those pages load the shared header.
- Phone type stays 9px through a 375px-wide screen (padding tightened to 7px 0, letter-spacing -0.02em). At 360px and narrower it drops to 8px so MUSICIANS and SPONSORS still fit in a 7-column cell.
- `BUY•SELL•TRADE` can wrap on the bullets (`<wbr>`) when the cell is narrow. The words are unchanged.
- Header HTML cache key bumped to `?v=20261105-nav` in `global-header-v2.js` and `global.js`.
- Home left-column Collage / BTV cards and SEE ALL SHOWS are untouched.
- Stripe, schedules, playlists, Storage rules, and user data are untouched.

## Preview channel
This environment has no Firebase login, so the Hosting preview channel was **not** published. `main` and bandtroductions.com were not deployed.

When a machine is logged into project `bandtroductions-dev`, publish a channel only (never the live Hosting channel):

```
npx firebase-tools hosting:channel:deploy nav-visibility-a --project bandtroductions-dev --expires 14d
```

That command needs a `hosting` block in `firebase.json` (`public` is the repo root, ignore `functions/`, dotfiles, and `node_modules`). Do not run `firebase deploy --only hosting`. That would update the project's live Hosting site. bandtroductions.com is GitHub Pages and is not this channel.

## Rollback
Production is unchanged. To drop this idea:

1. Do not merge this branch.
2. No preview channel was published from this branch. If one is created later, delete channel `nav-visibility-a`. It is not the live site.
3. The pre-change main tip is the annotated tag `pre-nav-collage-shows-btv-2026-11-05` (commit `1e56b8bda91dfe2e2049985ede022661422f7608`).

Restoring the header in git, if this branch were ever merged by mistake:

```
git checkout pre-nav-collage-shows-btv-2026-11-05 -- global-header-v2.html global-header-v2.js global.js index.html
```

That returns the 11-link, 6-column nav. Then redeploy only if a preview channel was published from the merged code. Do not deploy hosting to the live channel.
