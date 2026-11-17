# personal-site

Personal site for Weston Rosch — [westonrosch.com](https://westonrosch.com).

Static files, no build step: `index.html`, `styles.css`, `script.js`, plus images in `img/`. Open `index.html` or serve the folder locally (for example `npx serve .`).

## Deploy

Deployed by **Cloudflare Workers Builds** from the `main` branch: every push to `main` publishes the site. It is not served by GitHub Pages. `_headers` sets security and cache headers, and `404.html` is the not-found page.

## Checks

Before merging, validate the HTML and check links:

```sh
npx html-validate index.html 404.html vault/index.html vault/week-1/index.html vault/week-2/index.html
```

## Public source dashboard

The homepage source dashboard is a **read-only view of public GitHub metadata**, not site traffic or an X/Twitter analytics integration.

- `source-dashboard.js` requests the current `main` file trees of `InterstellarNerd8760/personal-site` and `InterstellarNerd8760/lunar-atlas` using GitHub's unauthenticated public REST API. The total is the sum of blob sizes on those branches (decimal MB), excluding Git history, external hosted content, and other repositories. It checks when the page opens, every 10 minutes while visible, when a hidden tab becomes visible again (subject to a 60-second minimum interval), or via the **Refresh bytes** control. GitHub is not real-time; a push shows on a visitor's next successful check. The page contains a dated fallback snapshot for offline/API-limit scenarios, and any partial update is disclosed.
- The contribution heatmap requests daily public-profile contribution counts from `https://github-contributions-api.jogruber.de/v4/InterstellarNerd8760?y=last`. Each calendar square has a keyboard-accessible, hover/tap tooltip with its exact date and the **provider's daily contributions count**. These numbers include activity beyond commits; do not label them as commits-only. The third-party endpoint is cached (usually around an hour), may fail or be unavailable, and is rechecked hourly while visible; visitors still have a link to the official GitHub profile. The site displays the provider's data, not fabricated or locally inferred contributions.
- No access tokens, private analytics data, location details or X follower exports are embedded in the client code. Do not put Cloudflare/GA API credentials in browser JavaScript. Publishing aggregated visitor statistics would require a separate authenticated backend or curated snapshot.
- The dashboard is designed to degrade gracefully when JavaScript is disabled. If the public API rate-limits requests, the static snapshot remains visible with a clear date.

## X Network Atlas — personal account observatory

The page at `/experiments/x-network-atlas/` is read-only and intentionally scoped to `@rosch_weston`. It **does not use the X API** or collect visitor account information. Historical aggregate numbers come from user-reported November 2026 analytics, with reporting windows and approximation notes. They are stored in `experiments/x-network-atlas/profile-data.json` and displayed with dated static fallbacks in the HTML.

Do not mistake the decorative orbital diagram for a real network graph: ten documented first-degree follower/interaction edges are presented from earlier research in `network-nodes.json`, labeled as historical observations rather than current relationships. Do not infer any additional identities or cross-account/community edges from aggregate counts. The page does not accept visitor archive uploads, and is not an analytics service for other accounts.

When updating metrics, change `profile-data.json` and the static HTML fallback together, preserving date, provenance, and approximation notes. The source JSON provides the primary account counts on supported clients; the daily reach bar labels and other narrative observations remain curated editorial summaries. All figures are static until a verified data source is integrated.
