# personal-site

Personal site for Weston Rosch — [westonrosch.com](https://westonrosch.com).

Static files, no required build step for everyday edits: `index.html`, `styles.css`, `script.js`, images in `img/`, and the embedded Centauri Archive under `archive/`. Open `index.html` or serve the folder locally (for example `npx serve .`).

## Deploy

Deployed by **Cloudflare Workers Builds** from the `main` branch: every push to `main` publishes the site. It is not served by GitHub Pages. `_headers` sets security and cache headers, and `404.html` is the not-found page.

## Checks

Before merging, validate the HTML and check links:

```sh
npx html-validate index.html 404.html vault/index.html vault/week-1/index.html vault/week-2/index.html vault/week-3/index.html
```

## Public source dashboard

The source dashboard on the [Experiments](https://westonrosch.com/experiments/#source) page is a **read-only view of public GitHub metadata**, not site traffic or an X/Twitter analytics integration.

- `source-dashboard.js` requests the current `main` file trees of `InterstellarNerd8760/personal-site` and `InterstellarNerd8760/lunar-atlas` using GitHub's unauthenticated public REST API. The total is the sum of blob sizes on those branches (decimal MB), excluding Git history, external hosted content, and other repositories. It checks when the page opens, every 10 minutes while visible, when a hidden tab becomes visible again (subject to a 60-second minimum interval), or via the **Refresh bytes** control. GitHub is not real-time; a push shows on a visitor's next successful check. The page contains a dated fallback snapshot for offline/API-limit scenarios, and any partial update is disclosed.
- The contribution heatmap requests daily public-profile contribution counts from `https://github-contributions-api.jogruber.de/v4/InterstellarNerd8760?y=last`. Each calendar square has a keyboard-accessible, hover/tap tooltip with its exact date and the **provider's daily contributions count**. These numbers include activity beyond commits; do not label them as commits-only. The third-party endpoint is cached (usually around an hour), may fail or be unavailable, and is rechecked hourly while visible; visitors still have a link to the official GitHub profile. The site displays the provider's data, not fabricated or locally inferred contributions.
- No access tokens, private analytics data, location details or X follower exports are embedded in the client code. Do not put Cloudflare/GA API credentials in browser JavaScript. Publishing aggregated visitor statistics would require a separate authenticated backend or curated snapshot.
- The dashboard is designed to degrade gracefully when JavaScript is disabled. If the public API rate-limits requests, the static snapshot remains visible with a clear date.


## Centauri Archive (`/archive/`)

The public Centauri Archive site is embedded at `/archive/` (encyclopedia, image library, decoding lab, project brief, and records). It is generated from the separate [`centauri-archive`](https://github.com/InterstellarNerd8760/centauri-archive) repository. The development ZIP is built during the sync so records can be verified, but the ZIP itself is not published on this site.

The pinned source commit is in `tools/centauri-archive.lock`. To regenerate the embedded pages after a reviewable change in that repo:

```sh
# From a local clone of centauri-archive (optional, faster):
python3 tools/sync_centauri_archive.py --repo /path/to/centauri-archive --ref <sha>

# Or clone the locked commit automatically:
python3 tools/sync_centauri_archive.py
```

Then update `tools/centauri-archive.lock` if you intend to move the pin, and commit the resulting `archive/` files together with the lockfile. Do not add `centauri.zip` to this repository. A short project writeup lives at `/projects/centauri-archive/`.
