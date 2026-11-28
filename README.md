# personal-site

Personal site for Weston Rosch — [westonrosch.com](https://westonrosch.com).

Static files, no required build step for everyday edits: `index.html`, `styles.css`, `script.js`, images in `img/`, and the embedded Centauri Archive under `archive/`. Open `index.html` or serve the folder locally (for example `npx serve .`).

## Deploy

Deployed by **Cloudflare Workers Builds** from the `main` branch: every push to `main` publishes the site. It is not served by GitHub Pages. `_headers` sets security and cache headers, and `404.html` is the not-found page.

## Bloom chat (`/chat/`, `chat.westonrosch.com`)

`chat/` is a full-screen chat client for every published Centauri Bloom model. It reuses the playground's inference engine (`projects/centauri-bloom/inference.js`, KV cache) in its own worker (`chat/chat-worker.js`), which adds download progress and keeps downloaded weights in the browser's Cache Storage. The model list is read live from the `Centauri-Bloom` Hugging Face organization: each repo's `main` revision plus open or merged PR checkpoints that publish `model.safetensors`, with the original `baseline-001` always available. The newest chat model is the default; `?model=<repo>@<revision>` selects another. Chats and settings are stored only in `localStorage`. All asset paths are absolute (`/chat/…`, `/projects/centauri-bloom/…`), so the page works at both `westonrosch.com/chat/` and the root of `chat.westonrosch.com`.

The custom domain `chat.westonrosch.com` is attached to this site's Worker in Cloudflare (Workers & Pages → Settings → Domains & Routes). The homepage (`index.html`) includes an early redirect: if the hostname is `chat.westonrosch.com` and the path is `/`, it replaces the location with `/chat/` and keeps the query string and hash. Asset paths are already absolute, so no URL rewrite rule is required.

## Checks

Before merging, validate the HTML and check links:

```sh
npx html-validate index.html 404.html vault/index.html vault/week-1/index.html vault/week-2/index.html vault/week-3/index.html vault/week-4/index.html
```

## Public source dashboard

The source dashboard on the [homepage](https://westonrosch.com/#source) is a **read-only view of public GitHub metadata**, not site traffic or an X/Twitter analytics integration.

- `source-dashboard.js` requests the current `main` file trees of `InterstellarNerd8760/personal-site` and `InterstellarNerd8760/lunar-atlas` using GitHub's unauthenticated public REST API. The total is the sum of blob sizes on those branches (decimal MB), excluding Git history, external hosted content, and other repositories. It checks when the page opens, every 10 minutes while visible, when a hidden tab becomes visible again (subject to a 60-second minimum interval), or via the **Refresh bytes** control. GitHub is not real-time; a push shows on a visitor's next successful check. The page contains a dated fallback snapshot for offline/API-limit scenarios, and any partial update is disclosed.
- The contribution heatmap requests daily public-profile contribution counts from `https://github-contributions-api.jogruber.de/v4/InterstellarNerd8760?y=last`. Each calendar square has a keyboard-accessible, hover/tap tooltip with its exact date and the **provider's daily contributions count**. These numbers include activity beyond commits; do not label them as commits-only. The third-party endpoint is cached (usually around an hour), may fail or be unavailable, and is rechecked hourly while visible; visitors still have a link to the official GitHub profile. The site displays the provider's data, not fabricated or locally inferred contributions.
- No access tokens, private analytics data, location details or X follower exports are embedded in the client code. Do not put Cloudflare/GA API credentials in browser JavaScript. Publishing aggregated visitor statistics would require a separate authenticated backend or curated snapshot.
- The dashboard is designed to degrade gracefully when JavaScript is disabled. If the public API rate-limits requests, the static snapshot remains visible with a clear date.


## Centauri Archive (`/archive/`)

The canonical Centauri Archive site is `/archive/`. Edit archive pages and records in the [`centauri-archive`](https://github.com/InterstellarNerd8760/centauri-archive) repository. Edit the personal site's integration in `tools/sync_centauri_archive.py` and `tools/archive-chrome.css`. The sync regenerates `archive/` from these sources, builds the verified development ZIP and copies the public records, manifest and small format examples. The personal site directs links for the development ZIP to the source repository.

The approved source commit is in `tools/centauri-archive.lock`. The sync builds the exact committed tree in a temporary checkout and fails if the requested ref cannot be resolved. A local clone can supply that commit without reading the clone's uncommitted changes.

```sh
# Preview a review commit without touching the published copy or pin.
preview_dir=$(mktemp -d)
python3 tools/sync_centauri_archive.py --repo /path/to/centauri-archive --ref <sha> --output "$preview_dir/archive"

# Regenerate the in-repository copy from the approved pin.
python3 tools/sync_centauri_archive.py
```

For a browser preview, serve the output under `/archive/` alongside the personal site's root `styles.css`, `script.js`, favicon files and `img/`. The sync uses the source archive's navigation inside the personal-site header and footer layout. The landing page and project brief follow the selected theme. Interactive exhibits retain their Deep Space palette. Cloudflare Workers serves individual HTML files at extensionless URLs and directory indexes with trailing slashes. The generated canonical and social URLs follow those routes. [Cloudflare Workers HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)

When publishing coordinated changes, land the archive source changes first. If the archive commit SHA changes when its pull request is merged, update the lockfile to the resulting commit and regenerate `archive/` before merging the personal-site pull request. Review the lockfile, generated files and any affected sitemap entries together. Run `python3 -m unittest discover -s tools -p 'test_*.py'` for the sync checks.

Project listings link directly to `/archive/`. The former `/projects/centauri-archive/` address redirects to the archive, with a static redirect page for hosts that do not apply Cloudflare's `_redirects` file.
