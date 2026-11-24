#!/usr/bin/env python3
"""Rebuild westonrosch.com/archive/ from the Centauri Archive repository.

The archive's public site (encyclopedia, image library, decoding lab, brief,
and supporting records) is copied into this repo at archive/. The development
ZIP is built during the sync so records and the manifest can be verified, but
the ZIP itself is not published here.

Usage:
  python3 tools/sync_centauri_archive.py
  python3 tools/sync_centauri_archive.py --repo /path/to/centauri-archive
  python3 tools/sync_centauri_archive.py --repo https://github.com/InterstellarNerd8760/centauri-archive --ref da2cddb

By default the script clones the source SHA recorded in
tools/centauri-archive.lock.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = Path(__file__).resolve().with_name("centauri-archive.lock")
CHROME_CSS = Path(__file__).resolve().with_name("archive-chrome.css")
DEST = ROOT / "archive"
SOURCE_REPO = "https://github.com/InterstellarNerd8760/centauri-archive"
SITE_ORIGIN = "https://westonrosch.com"
GITHUB_SOURCE = "https://github.com/InterstellarNerd8760/centauri-archive"

GTAG = """  <script async src="https://www.googletagmanager.com/gtag/js?id=G-Q6MDTRSW0F"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-Q6MDTRSW0F');</script>
"""

HEAD_COMMON = """  <meta name="author" content="Weston Rosch">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Weston Rosch">
  <meta property="og:locale" content="en_US">
  <meta property="og:image" content="https://westonrosch.com/og.jpg">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@rosch_weston">
  <meta name="twitter:creator" content="@rosch_weston">
  <meta name="twitter:image" content="https://westonrosch.com/og.jpg">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
"""

SITE_HEADER = """  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="wordmark" href="/">Weston Rosch</a>
    <nav id="site-nav" class="site-nav" aria-label="Main">
      <a href="https://moon.westonrosch.com">Moon</a>
      <a href="/projects/" aria-current="page">Projects</a>
      <a href="/vault/">Vault</a>
      <a href="/writing/">Writing</a>
      <a href="/experiments/">Experiments</a>
      <a href="/about/">About</a>
    </nav>
    <span class="callsign">KO6OGZ<small>amateur radio</small></span>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open navigation"><span></span><span></span></button>
  </header>
"""

SITE_FOOTER = """  <footer class="site-footer">
  <div class="footer-moon">
    <img src="/img/moon-footer.webp" alt="" width="1600" height="280" loading="lazy" decoding="async">
    <p class="footer-moon-credit">Moon: NASA</p>
  </div>
    <div class="wrap footer-inner">
      <span>© 2026 Weston Rosch</span>
      <nav class="footer-links" aria-label="Contact">
        <a href="mailto:hello@westonrosch.com">hello@westonrosch.com</a>
        <a href="https://github.com/InterstellarNerd8760" target="_blank" rel="noreferrer">GitHub</a>
        <a href="https://x.com/rosch_weston" target="_blank" rel="noreferrer">X</a>
        <a href="https://instagram.com/rosch_weston" target="_blank" rel="noreferrer">Instagram</a>
        <a href="/resume.pdf" target="_blank" rel="noopener">Resume</a>
      </nav>
      <span>Earth imagery: NASA / ISS crew</span>
    </div>
  </footer>
  <script src="/script.js" defer></script>
"""

SUBNAV_ITEMS = [
    ("index.html", "Overview", "/archive/"),
    ("encyclopedia.html", "Encyclopedia", "/archive/encyclopedia.html"),
    ("images.html", "Image library", "/archive/images.html"),
    ("guide.html", "Decoding", "/archive/guide.html"),
    ("brief.html", "Project brief", "/archive/brief.html"),
]

PAGE_PATHS = {
    "index.html": "/archive/",
    "encyclopedia.html": "/archive/encyclopedia.html",
    "images.html": "/archive/images.html",
    "guide.html": "/archive/guide.html",
    "brief.html": "/archive/brief.html",
    "library.html": "/archive/library.html",
}

ZIP_HREF = re.compile(r'href="downloads/centauri\.zip"')
GITHUB_LINK = f'href="{GITHUB_SOURCE}" target="_blank" rel="noreferrer"'


def load_lock():
    data = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    return data["repository"], data["sha"]


def run(cmd, cwd=None):
    subprocess.check_call(cmd, cwd=cwd)


def resolve_source(repo: str | None, ref: str | None) -> tuple[Path, str, str, tempfile.TemporaryDirectory | None]:
    lock_repo, lock_sha = load_lock()
    repo = repo or lock_repo
    ref = ref or lock_sha
    tmp = None
    source = Path(repo).expanduser()
    if source.exists() and (source / ".git").exists():
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
        if ref and sha != ref and not ref.startswith(sha):
            print(f"Note: local repo is at {sha}, lock/requested ref is {ref}", file=sys.stderr)
        return source, sha, repo if "://" in repo else str(source), None
    tmp = tempfile.TemporaryDirectory(prefix="centauri-archive-")
    clone = Path(tmp.name) / "centauri-archive"
    run(["git", "clone", "--depth", "1", "--branch", "main", repo, str(clone)])
    # If the lock SHA is not the tip of the shallow clone, fetch that commit.
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=clone, text=True).strip()
    if ref and sha != ref and not sha.startswith(ref) and not ref.startswith(sha):
        try:
            run(["git", "fetch", "--depth", "1", "origin", ref], cwd=clone)
            run(["git", "checkout", "--detach", ref], cwd=clone)
            sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=clone, text=True).strip()
        except subprocess.CalledProcessError:
            print(f"Could not check out {ref}; using {sha}", file=sys.stderr)
    return clone, sha, repo, tmp


def build_archive_site(source: Path) -> Path:
    run([sys.executable, "tools/build_site.py"], cwd=source)
    built = source / "build" / "site"
    if not built.exists():
        raise SystemExit(f"Build did not produce {built}")
    return built


def copy_site(built: Path):
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir(parents=True)
    skip_names = {"centauri.zip"}
    for path in built.rglob("*"):
        rel = path.relative_to(built)
        if path.is_dir():
            (DEST / rel).mkdir(parents=True, exist_ok=True)
            continue
        if path.name in skip_names:
            continue
        target = DEST / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
    shutil.copyfile(CHROME_CSS, DEST / "site-chrome.css")


def subnav(current: str) -> str:
    links = []
    for filename, label, href in SUBNAV_ITEMS:
        current_attr = ' aria-current="page"' if filename == current else ""
        links.append(f'<a href="{href}"{current_attr}>{label}</a>')
    links.append(f'<a class="archive-source" href="{GITHUB_SOURCE}" target="_blank" rel="noreferrer">Source ↗</a>')
    return '<nav class="archive-subnav" aria-label="Centauri Archive">\n    ' + "\n    ".join(links) + "\n  </nav>\n"


def extra_stylesheets(html: str) -> str:
    sheets = []
    for match in re.finditer(r'<link rel="stylesheet" href="([^"]+)"[^>]*>', html):
        href = match.group(1)
        if href.startswith("http") or href.startswith("/") or "fonts.googleapis.com" in href:
            continue
        if href == "style.css" or href.startswith("style.css?"):
            href = "style.css"
        sheets.append(href)
    # Preserve query-less local CSS in a stable order, then chrome.
    ordered = []
    for name in ("style.css", "encyclopedia.css", "image-detail.css"):
        if name in sheets and name not in ordered:
            ordered.append(name)
    for name in sheets:
        if name not in ordered:
            ordered.append(name)
    tags = "".join(f'  <link rel="stylesheet" href="{name}">\n' for name in ordered)
    tags += '  <link rel="stylesheet" href="site-chrome.css">\n'
    return tags


def extra_scripts(html: str) -> str:
    tags = []
    for match in re.finditer(r'<script([^>]*)>\s*</script>|<script([^>]*)></script>|<script([^>]*) defer src="([^"]+)"></script>|<script defer src="([^"]+)"></script>', html):
        pass
    for match in re.finditer(r'<script([^>]*)src="([^"]+)"([^>]*)></script>', html):
        src = match.group(2)
        if src.startswith("http") or src.startswith("/"):
            continue
        tags.append(f'  <script defer src="{src}"></script>\n')
    return "".join(tags)


def body_classes(html: str) -> str:
    match = re.search(r"<body([^>]*)>", html, re.I)
    classes = ["subpage", "archive-page"]
    if match:
        attr = match.group(1)
        existing = re.search(r'class="([^"]*)"', attr)
        if existing:
            for name in existing.group(1).split():
                if name not in classes:
                    classes.append(name)
    return " ".join(classes)


def extract_title(html: str) -> str:
    match = re.search(r"<title>([^<]+)</title>", html, re.I)
    return match.group(1).strip() if match else "Centauri Archive · Weston Rosch"


def extract_description(html: str) -> str:
    match = re.search(r'<meta name="description" content="([^"]+)"', html, re.I)
    return match.group(1).strip() if match else "Centauri Archive, an independent record of Earth, life, and human civilization."


def extract_main(html: str) -> str:
    match = re.search(r"(<main\b.*</main>)", html, re.I | re.S)
    if not match:
        raise ValueError("no <main> found")
    return match.group(1)


def extract_trailing_scripts(html: str) -> str:
    """Keep inline scripts that sit after main or after the original footer."""
    scripts = re.findall(r"<script\b(?![^>]*\bsrc=)[^>]*>.*?</script>", html, re.I | re.S)
    kept = []
    for script in scripts:
        # Keep page-specific inline scripts; drop analytics snippets if any.
        if "dataLayer" in script or "gtag(" in script:
            continue
        kept.append(script)
    if not kept:
        return ""
    return "\n" + "\n".join(kept) + "\n"


def rewrite_zip_links(html: str) -> str:
    html = ZIP_HREF.sub(GITHUB_LINK, html)
    html = html.replace("Complete verified archive ZIP ↗", "Source repository on GitHub ↗")
    html = html.replace("Download the development ZIP ↗", "Build the development ZIP from the source repository ↗")
    html = html.replace("Download the archive", "Open the source repository")
    html = html.replace(
        "Each source file also lives in the verified ZIP. This browser view does not demonstrate interstellar decoding.",
        "Each source file also lives as a raw record on this page. This browser view does not demonstrate interstellar decoding.",
    )
    html = re.sub(
        r"Digital edition __EDITION__ · __SIZE__ MB · Uncompressed development ZIP",
        "Digital edition __EDITION__ · Development package verified in the source repository",
        html,
    )
    html = re.sub(
        r"Digital edition ([0-9.]+) · [0-9.]+ MB · Uncompressed development ZIP",
        r"Digital edition \1 · Development package verified in the source repository",
        html,
    )
    return html


def decorate_page(path: Path):
    html = path.read_text(encoding="utf-8")
    html = rewrite_zip_links(html)
    title = extract_title(html)
    if "Weston Rosch" not in title:
        title = f"{title} · Weston Rosch" if "Centauri Archive" in title else f"{title} · Centauri Archive · Weston Rosch"
    description = extract_description(html)
    page_url = SITE_ORIGIN + PAGE_PATHS.get(path.name, f"/archive/{path.name}")
    body_class = body_classes(html)
    main = extract_main(html)
    trailing = extract_trailing_scripts(html)
    styles = extra_stylesheets(html)
    scripts = extra_scripts(html)

    built = f"""<!DOCTYPE html>
<html lang="en">
<head>
{GTAG}  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#05080f">
  <meta name="description" content="{description}">
  <title>{title}</title>
{HEAD_COMMON}  <link rel="canonical" href="{page_url}">
  <meta property="og:url" content="{page_url}">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{description}">
{styles}{scripts}</head>
<body class="{body_class}">
{SITE_HEADER}{subnav(path.name)}
{main}
{trailing}{SITE_FOOTER}
</body>
</html>
"""
    # Normalize overly blank lines
    built = re.sub(r"\n{3,}", "\n\n", built)
    path.write_text(built, encoding="utf-8")


def write_stamp(sha: str, repo: str, edition: str | None):
    text = (
        f"Source: {repo}\n"
        f"Commit: {sha}\n"
        f"Edition: {edition or 'unknown'}\n"
        "This directory is generated by tools/sync_centauri_archive.py.\n"
        "The development ZIP is not published here; build it from the source repository.\n"
    )
    (DEST / "SOURCE.txt").write_text(text, encoding="utf-8")


def detect_edition(built: Path) -> str | None:
    index = built / "index.html"
    if index.exists():
        match = re.search(r"EDITION\s+([0-9.]+)", index.read_text(encoding="utf-8"))
        if match:
            return match.group(1)
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", help="Local clone or git URL of centauri-archive")
    parser.add_argument("--ref", help="Commit SHA or tag to sync")
    args = parser.parse_args()

    source, sha, repo, tmp = resolve_source(args.repo, args.ref)
    try:
        print(f"Building Centauri Archive from {source} ({sha[:12]})")
        built = build_archive_site(source)
        edition = detect_edition(built)
        copy_site(built)
        for name in PAGE_PATHS:
            page = DEST / name
            if page.exists():
                decorate_page(page)
        write_stamp(sha, repo, edition)
    finally:
        if tmp is not None:
            tmp.cleanup()
    zip_left = list(DEST.rglob("*.zip"))
    if zip_left:
        raise SystemExit(f"ZIP files were copied into the site: {zip_left}")
    print(f"Wrote {DEST} (edition {edition or 'unknown'}, source {sha})")


if __name__ == "__main__":
    main()
