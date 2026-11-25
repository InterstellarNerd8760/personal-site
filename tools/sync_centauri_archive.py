#!/usr/bin/env python3
"""Rebuild westonrosch.com/archive/ from the Centauri Archive repository.

The archive's public site (encyclopedia, image library, decoding lab, brief,
and supporting records) is copied into this repo at archive/. The development
ZIP is built during the sync so records and the manifest can be verified, but
the ZIP itself is not published here.

Usage:
  python3 tools/sync_centauri_archive.py
  python3 tools/sync_centauri_archive.py --repo /path/to/centauri-archive
  python3 tools/sync_centauri_archive.py --repo /path/to/centauri-archive --ref <commit> --output /tmp/preview/archive

By default the script clones the source SHA recorded in
tools/centauri-archive.lock.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from html import escape, unescape
import json
import posixpath
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

LEGACY_SUBNAV_ITEMS = (
    ("index.html", "Centauri Archive"),
    ("brief.html", "Project brief"),
    ("encyclopedia.html", "Encyclopedia"),
    ("images.html", "Image library"),
    ("engineering.html", "Decoding and engineering"),
)
SOURCE_NAV = re.compile(
    r'<header class="header">\s*(<a class="brand"[^>]*>.*?</a>)\s*'
    r'<nav aria-label="Centauri Archive">(.*?)</nav>',
    re.S,
)

ZIP_HREF = re.compile(r'''href=(["'])(?:/archive/|(?:\.{1,2}/)*)downloads/centauri\.zip(?:[?#][^"']*)?\1''', re.I)
PAGE_HREF = re.compile(r'''(\s+href=)(["'])([^"'?#]+\.html)([?#][^"']*)?\2''', re.I)
GITHUB_LINK = f'href="{GITHUB_SOURCE}"'


def load_lock():
    data = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    return data["repository"], data["sha"]


def run(cmd, cwd=None):
    subprocess.check_call(cmd, cwd=cwd)


def resolve_commit(source: Path, ref: str) -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "--verify", "--end-of-options", f"{ref}^{{commit}}"],
        cwd=source, text=True,
    ).strip()


@contextmanager
def source_checkout(repo: str, ref: str):
    """Resolve exactly one committed tree and build it in a disposable checkout."""
    with tempfile.TemporaryDirectory(prefix="centauri-archive-") as directory:
        clone = Path(directory) / "source"
        source = Path(repo).expanduser()
        if source.is_dir():
            sha = resolve_commit(source, ref)
            run(["git", "clone", "--quiet", "--shared", "--no-checkout", "--", str(source.resolve()), str(clone)])
        else:
            run(["git", "init", "--quiet", str(clone)])
            run(["git", "fetch", "--quiet", "--depth=1", "--no-tags", "--", repo, ref], cwd=clone)
            sha = resolve_commit(clone, "FETCH_HEAD")
            if re.fullmatch(r"[0-9a-f]{40}", ref, re.I) and sha != ref.lower():
                raise ValueError(f"Source returned {sha} for requested commit {ref}")
        run(["git", "checkout", "--quiet", "--detach", sha], cwd=clone)
        yield clone, sha


def build_archive_site(source: Path) -> Path:
    run([sys.executable, "tools/build_site.py"], cwd=source)
    built = source / "build" / "site"
    if not built.exists():
        raise SystemExit(f"Build did not produce {built}")
    return built


def copy_site(built: Path, output: Path):
    def ignore_zip(_directory, names):
        return [name for name in names if Path(name).suffix.lower() == ".zip"]

    shutil.copytree(built, output, ignore=ignore_zip)
    shutil.copyfile(CHROME_CSS, output / "site-chrome.css")


def page_path(filename: str) -> str:
    # Cloudflare Workers serves file.html at /file and index.html at its folder.
    if Path(filename).name == "index.html":
        return "/archive/" + filename.removesuffix("index.html")
    return "/archive/" + filename.removesuffix(".html")


def subnav(html: str, current: str, pages: set[str]) -> str:
    source_nav = SOURCE_NAV.search(html)
    if source_nav:
        brand, links = source_nav.groups()
        brand = brand.replace('class="brand"', 'class="archive-brand"', 1)
        content = rewrite_page_links(f"{brand}{links}", current, pages)
        return f'<nav class="archive-subnav" aria-label="Centauri Archive">\n    {content}</nav>\n'

    # A preview can still build commits from before the archive generated a shared header.
    links = []
    for filename, label in LEGACY_SUBNAV_ITEMS:
        if filename not in pages:
            continue
        current_attr = ' aria-current="page"' if filename == current else ""
        css_class = ' class="archive-brand"' if filename == "index.html" else ""
        links.append(f'<a{css_class} href="{page_path(filename)}"{current_attr}>{label}</a>')
    return '<nav class="archive-subnav" aria-label="Centauri Archive">\n    ' + "\n    ".join(links) + "\n  </nav>\n"


def rewrite_page_links(html: str, filename: str, pages: set[str]) -> str:
    """Translate built HTML page links to their public routes on Cloudflare."""
    def public_link(match: re.Match) -> str:
        prefix, quote, href, suffix = match.groups()
        if ":" in href or href.startswith("//"):
            return match[0]
        if href.startswith("/archive/"):
            target = href.removeprefix("/archive/")
        elif href.startswith("/"):
            return match[0]
        else:
            target = posixpath.normpath(posixpath.join(posixpath.dirname(filename), href))
        if target not in pages:
            return match[0]
        return f"{prefix}{quote}{page_path(target)}{suffix or ''}{quote}"

    return PAGE_HREF.sub(public_link, html)


def extra_stylesheets(html: str) -> str:
    sheets = []
    for match in re.finditer(r'<link rel="stylesheet" href="([^"]+)"[^>]*>', html):
        href = match.group(1)
        if href.startswith("http") or href.startswith("/") or "fonts.googleapis.com" in href:
            continue
        if href == "style.css" or href.startswith("style.css?"):
            href = "style.css"
        sheets.append(href)
    # Keep the archive's original dependency/cascade order, then apply chrome.
    tags = "".join(f'  <link rel="stylesheet" href="{name}">\n' for name in dict.fromkeys(sheets))
    tags += '  <link rel="stylesheet" href="/archive/site-chrome.css">\n'
    return tags


def extra_scripts(html: str) -> str:
    tags = []
    for match in re.finditer(r'<script\b([^>]*\bsrc="([^"]+)"[^>]*)>\s*</script>', html, re.I):
        attributes, src = match.groups()
        if src.startswith("http") or src.startswith("/"):
            continue
        module = ' type="module"' if re.search(r'\btype="module"', attributes) else ""
        tags.append(f'  <script{module} defer src="{src}"></script>\n')
    return "".join(tags)


def body_classes(html: str, filename: str) -> str:
    match = re.search(r"<body([^>]*)>", html, re.I)
    classes = ["subpage", "archive-page"]
    if filename in {"index.html", "brief.html"}:
        classes.append("archive-editorial")
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


def decorate_page(path: Path, filename: str, pages: set[str]):
    html = path.read_text(encoding="utf-8")
    html = rewrite_zip_links(html)
    title = unescape(extract_title(html))
    if "Weston Rosch" not in title:
        title = f"{title} · Weston Rosch" if "Centauri Archive" in title else f"{title} · Centauri Archive · Weston Rosch"
    title = escape(title)
    description = escape(unescape(extract_description(html)))
    page_url = SITE_ORIGIN + page_path(filename)
    body_class = body_classes(html, filename)
    main = extract_main(html)
    outside_main = html.replace(main, "", 1)
    trailing = extract_trailing_scripts(outside_main)
    styles = extra_stylesheets(html)
    scripts = extra_scripts(outside_main)

    built = f"""<!DOCTYPE html>
<html lang="en" class="embedded-archive">
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
{SITE_HEADER}{subnav(outside_main, filename, pages)}
{rewrite_page_links(main, filename, pages)}
{trailing}{SITE_FOOTER}
</body>
</html>
"""
    # Normalize overly blank lines
    built = re.sub(r"\n{3,}", "\n\n", built)
    path.write_text(built, encoding="utf-8")


def write_stamp(output: Path, sha: str, repo: str, edition: str | None):
    text = (
        f"Source: {repo}\n"
        f"Commit: {sha}\n"
        f"Edition: {edition or 'unknown'}\n"
        "This directory is generated by tools/sync_centauri_archive.py.\n"
        "The development ZIP is not published here; build it from the source repository.\n"
    )
    (output / "SOURCE.txt").write_text(text, encoding="utf-8")


def detect_edition(built: Path) -> str | None:
    manifest = built / "downloads" / "manifest.json"
    data = json.loads(manifest.read_text(encoding="utf-8"))
    return data.get("archive_version")


def install_site(built: Path, destination: Path, sha: str, upstream: str, edition: str | None):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".archive-sync-", dir=destination.parent) as directory:
        temporary = Path(directory)
        output = temporary / "site"
        copy_site(built, output)
        pages = {path.relative_to(output).as_posix() for path in output.rglob("*.html")}
        if "index.html" not in pages:
            raise ValueError("Archive site is missing index.html")
        for name in sorted(pages):
            decorate_page(output / name, name, pages)
        write_stamp(output, sha, upstream, edition)

        if destination.exists() or destination.is_symlink():
            stamp = destination / "SOURCE.txt"
            if destination.is_symlink() or not stamp.is_file() or "generated by tools/sync_centauri_archive.py" not in stamp.read_text(encoding="utf-8"):
                raise ValueError(f"Refusing to replace a directory without an archive source stamp: {destination}")
            backup = temporary / "previous"
            destination.rename(backup)
            try:
                output.rename(destination)
            except OSError:
                backup.rename(destination)
                raise
        else:
            output.rename(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", help="Local clone or git URL of centauri-archive")
    parser.add_argument("--ref", help="Git commit, branch or tag to sync (use full SHA for a remote commit)")
    parser.add_argument("--output", type=Path, help="Separate destination for a local review build")
    args = parser.parse_args()

    upstream, locked_sha = load_lock()
    destination = args.output or DEST
    try:
        with source_checkout(args.repo or upstream, args.ref or locked_sha) as (source, sha):
            if destination.resolve() == DEST and sha != locked_sha:
                raise ValueError("Use --output to preview a commit other than the approved pin")
            print(f"Building Centauri Archive at {sha}")
            built = build_archive_site(source)
            edition = detect_edition(built)
            install_site(built, destination, sha, upstream, edition)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Archive sync failed: {error}\n")
    print(f"Wrote {destination} (edition {edition or 'unknown'}, source {sha})")


if __name__ == "__main__":
    main()
