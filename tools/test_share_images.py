#!/usr/bin/env python3
"""Checks that public pages have unique 1200x630 Open Graph screenshots."""
from __future__ import annotations

import re
import unittest
from pathlib import Path

from sync_centauri_archive import SITE_ORIGIN, share_head

ROOT = Path(__file__).resolve().parents[1]

# Public pages that should have their own share preview. Keep this list to
# pages we intentionally publish previews for.
PUBLIC_PAGES = {
    "index.html": "/og/home.png",
    "about/index.html": "/og/about.png",
    "projects/index.html": "/og/projects.png",
    "projects/centauri-academy/index.html": "/og/centauri-academy.png",
    "projects/centauri-bloom/index.html": "/og/centauri-bloom.png",
    "projects/lunar-atlas/index.html": "/og/lunar-atlas.png",
    "projects/lunar-atlas/roadmap/index.html": "/og/lunar-atlas-roadmap.png",
    "projects/lunar-atlas/photos/index.html": "/og/lunar-atlas-photos.png",
    "projects/lunar-atlas/slides/index.html": "/og/lunar-atlas-slides.png",
    "projects/wall-e/index.html": "/og/wall-e.png",
    "projects/wall-e/wiring/index.html": "/og/wall-e-wiring.png",
    "experiments/index.html": "/og/experiments.png",
    "writing/index.html": "/og/writing.png",
    "writing/poetry/index.html": "/og/poetry.png",
    "writing/ai-and-the-future-of-humanity/index.html": "/og/ai-and-the-future-of-humanity.png",
    "chat/index.html": "/og/chat.png",
    "vault/index.html": "/og/vault.png",
    "vault/week-1/index.html": "/og/vault-week-1.png",
    "vault/week-2/index.html": "/og/vault-week-2.png",
    "vault/week-3/index.html": "/og/vault-week-3.png",
    "vault/week-4/index.html": "/og/vault-week-4.png",
    "archive/index.html": "/og/archive.png",
    "archive/brief.html": "/og/archive-brief.png",
    "archive/encyclopedia.html": "/og/archive-encyclopedia.png",
    "archive/images.html": "/og/archive-images.png",
    "archive/engineering.html": "/og/archive-engineering.png",
    "archive/guide.html": "/og/archive-guide.png",
    "archive/discovery.html": "/og/archive-discovery.png",
    "archive/library.html": "/og/archive-library.png",
    "archive/proposal.html": "/og/archive-proposal.png",
    "archive/vocabulary.html": "/og/archive-vocabulary.png",
}


def meta(html: str, key: str) -> list[str]:
    return re.findall(rf'(?:property|name)="{re.escape(key)}"\s+content="([^"]*)"', html)


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", path
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


class ShareImageTests(unittest.TestCase):
    def test_each_public_page_has_a_unique_absolute_screenshot(self):
        seen: dict[str, str] = {}
        for rel, image in PUBLIC_PAGES.items():
            html = (ROOT / rel).read_text(encoding="utf-8")
            og = meta(html, "og:image")
            twitter = meta(html, "twitter:image")
            self.assertEqual(og, [SITE_ORIGIN + image], rel)
            self.assertEqual(twitter, [SITE_ORIGIN + image], rel)
            self.assertEqual(meta(html, "og:image:width"), ["1200"], rel)
            self.assertEqual(meta(html, "og:image:height"), ["630"], rel)
            self.assertEqual(meta(html, "og:image:type"), ["image/png"], rel)
            self.assertEqual(meta(html, "twitter:card"), ["summary_large_image"], rel)
            self.assertGreater(len(meta(html, "og:image:alt")[0].strip()), 8, rel)
            self.assertEqual(meta(html, "og:image:alt"), meta(html, "twitter:image:alt"), rel)
            self.assertNotIn(image, seen, f"{rel} shares {image} with {seen.get(image)}")
            seen[image] = rel
            path = ROOT / image.lstrip("/")
            self.assertTrue(path.is_file(), path)
            self.assertEqual(png_size(path), (1200, 630), path)

    def test_chat_canonical_stays_on_the_chat_subdomain(self):
        html = (ROOT / "chat/index.html").read_text(encoding="utf-8")
        self.assertIn('<link rel="canonical" href="https://chat.westonrosch.com/">', html)
        self.assertEqual(meta(html, "og:url"), ["https://chat.westonrosch.com/"])
        self.assertEqual(meta(html, "og:image"), [SITE_ORIGIN + "/og/chat.png"])

    def test_archive_sync_emits_per_page_share_tags(self):
        brief = share_head("brief.html")
        landing = share_head("index.html")
        unknown = share_head("future-exhibit.html")
        self.assertIn("https://westonrosch.com/og/archive-brief.png", brief)
        self.assertIn("https://westonrosch.com/og/archive.png", landing)
        self.assertIn('twitter:image:alt', brief)
        self.assertNotEqual(brief, landing)
        self.assertIn("https://westonrosch.com/og/archive.png", unknown)
        self.assertIn("image/png", brief)
        self.assertIn("1200", brief)
        self.assertIn("630", brief)


if __name__ == "__main__":
    unittest.main()
