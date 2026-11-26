import subprocess
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
from xml.etree import ElementTree

from sync_centauri_archive import ROOT, SITE_ORIGIN, install_site, load_lock, page_path, source_checkout


class PageLinks(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.links = []
        self.references = []
        self.canonical = None
        self.refresh = None
        self.feed(path.read_text(encoding='utf-8'))

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.references.extend(attrs[key] for key in ('href', 'src', 'poster') if attrs.get(key))
        if tag == 'a' and 'href' in attrs:
            self.links.append(attrs['href'])
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical = attrs.get('href')
        if tag == 'meta' and attrs.get('http-equiv', '').lower() == 'refresh':
            self.refresh = attrs.get('content')


class SourceCheckoutTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.source = Path(temporary.name)
        self.git('init', '--quiet')
        self.git('config', 'user.name', 'Archive Sync Test')
        self.git('config', 'user.email', 'test@example.invalid')
        self.record = self.source / 'record.txt'
        self.first = self.commit('reviewed')
        self.git('tag', 'reviewed', self.first)
        self.latest = self.commit('later')
        self.record.write_text('dirty', encoding='utf-8')

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.source, text=True).strip()

    def commit(self, contents):
        self.record.write_text(contents, encoding='utf-8')
        self.git('add', self.record.name)
        self.git('commit', '--quiet', '-m', contents)
        return self.git('rev-parse', 'HEAD')

    def test_exact_ref_from_dirty_local_clone(self):
        with source_checkout(str(self.source), self.first[:10]) as (checkout, sha):
            self.assertEqual(sha, self.first)
            self.assertEqual((checkout / self.record.name).read_text(), 'reviewed')
        self.assertFalse(checkout.exists())
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.latest)
        self.assertEqual(self.record.read_text(), 'dirty')

    def test_remote_tag_and_full_commit_with_file_transport(self):
        for ref in (self.first, 'reviewed'):
            with self.subTest(ref=ref), source_checkout(self.source.as_uri(), ref) as (checkout, sha):
                self.assertEqual(sha, self.first)
                self.assertEqual((checkout / self.record.name).read_text(), 'reviewed')

    def test_unavailable_refs_do_not_fall_back(self):
        for repo in (str(self.source), self.source.as_uri()):
            with self.subTest(repo=repo), self.assertRaises(subprocess.CalledProcessError):
                with source_checkout(repo, 'unavailable'):
                    self.fail('An unavailable ref returned a checkout')


class InstallSiteTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.built = root / 'built'
        self.built.mkdir()
        self.output = root / 'preview' / 'archive'

    def page(self, path, main='<!doctype html><main id="main">Test</main>'):
        destination = self.built / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(main, encoding='utf-8')

    def install(self):
        install_site(self.built, self.output, 'a' * 40, 'https://example.invalid/archive', '0.7.0')

    def test_navigation_nested_routes_downloads_and_source_stamp(self):
        self.page('index.html')
        self.page('engineering.html')
        self.page('brief.html')
        self.page('encyclopedia.html')
        self.page('images.html')
        self.page('discovery.html')
        self.page('proposal.html', '''<header class="header">
  <a class="brand" href="index.html">Centauri Archive</a>
  <nav aria-label="Centauri Archive">
    <a href="brief.html" aria-current="location">Project brief</a>
    <a href="encyclopedia.html">Encyclopedia</a>
    <a href="images.html">Image library</a>
    <a href="engineering.html">Decoding and engineering</a>
  </nav>
</header><main id="main">Proposal</main>''')
        self.page('vocabulary.html')
        self.page('knowledge/index.html')
        self.page('knowledge/life.html', '''<!doctype html>
<head><title>Life &amp; Earth</title><meta name="description" content="Quote &quot; and &amp;">
<link rel="stylesheet" href="../style.css"><link rel="stylesheet" href="knowledge.css">
<script src="../visual-explainers.js"></script></head>
<main id="main"><a href='../downloads/centauri.zip?download'>Download the archive</a>
<a href="../index.html#archive">Overview</a><a href="index.html#life">Knowledge index</a>
<a href="../images.html?record=photos/earth.jpg&amp;category=earth#result">Image</a>
<a href="https://example.org/edition.html">External edition</a>
<script src="inside.js"></script></main>''')
        self.page('downloads/centauri.zip', 'omit')
        self.page('downloads/extra.ZIP', 'omit')
        self.page('photo-reconstruction/reference.car', 'keep')
        self.install()
        self.assertEqual((self.output / 'photo-reconstruction/reference.car').read_text(), 'keep')
        self.assertFalse(any(path.suffix.lower() == '.zip' for path in self.output.rglob('*')))
        self.assertIn('Commit: ' + 'a' * 40, (self.output / 'SOURCE.txt').read_text())
        expected = {
            'index.html': '/archive/', 'discovery.html': '/archive/discovery',
            'engineering.html': '/archive/engineering', 'proposal.html': '/archive/proposal',
            'brief.html': '/archive/brief', 'encyclopedia.html': '/archive/encyclopedia',
            'images.html': '/archive/images',
            'vocabulary.html': '/archive/vocabulary', 'knowledge/index.html': '/archive/knowledge/',
            'knowledge/life.html': '/archive/knowledge/life',
        }
        for filename, route in expected.items():
            with self.subTest(filename=filename):
                html = (self.output / filename).read_text()
                self.assertIn(f'<link rel="canonical" href="https://westonrosch.com{route}">', html)
                self.assertIn('<meta property="og:url" content="https://westonrosch.com' + route + '">', html)
                self.assertIn('class="site-header"', html)
                self.assertIn('href="/archive/site-chrome.css"', html)
                self.assertIn('href="/archive/brief"', html)
                self.assertIn('href="/archive/encyclopedia"', html)
                self.assertIn('href="/archive/images"', html)
                self.assertIn('href="/archive/engineering"', html)
                self.assertNotIn('href="/archive/discovery"', html)
        nested = (self.output / 'knowledge/life.html').read_text()
        proposal = (self.output / 'proposal.html').read_text()
        self.assertIn('class="archive-brand" href="/archive/"', proposal)
        self.assertIn('href="/archive/brief" aria-current="location"', proposal)
        self.assertIn('Life &amp; Earth', nested)
        self.assertIn('Quote &quot; and &amp;', nested)
        self.assertLess(nested.index('href="../style.css"'), nested.index('href="knowledge.css"'))
        self.assertIn('defer src="../visual-explainers.js"', nested)
        self.assertEqual(nested.count('src="inside.js"'), 1)
        self.assertNotIn('centauri.zip', nested)
        self.assertIn('href="/archive/#archive"', nested)
        self.assertIn('href="/archive/knowledge/#life"', nested)
        self.assertIn('href="/archive/images?record=photos/earth.jpg&amp;category=earth#result"', nested)
        self.assertIn('href="https://example.org/edition.html"', nested)

    def test_pinned_legacy_menu_only_includes_built_pages(self):
        self.page('index.html')
        self.page('brief.html')
        self.install()
        html = (self.output / 'index.html').read_text()
        self.assertIn('href="/archive/" aria-current="page"', html)
        self.assertIn('href="/archive/brief"', html)
        self.assertNotIn('href="/archive/proposal"', html)
        self.assertNotIn('href="/archive/engineering"', html)

    def test_unstamped_destinations_are_preserved(self):
        self.page('index.html')
        self.output.mkdir(parents=True)
        keep = self.output / 'unrelated.txt'
        keep.write_text('untouched', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'archive source stamp'):
            self.install()
        self.assertEqual(keep.read_text(), 'untouched')

    def test_failing_decoration_preserves_existing_site(self):
        self.page('index.html')
        self.install()
        previous = (self.output / 'index.html').read_bytes()
        self.page('engineering.html', '<p>No main landmark</p>')
        with self.assertRaisesRegex(ValueError, 'no <main>'):
            self.install()
        self.assertEqual((self.output / 'index.html').read_bytes(), previous)


class PublishedRoutesTests(unittest.TestCase):
    def test_project_listings_link_directly_to_archive(self):
        for filename in ('index.html', 'projects/index.html'):
            with self.subTest(filename=filename):
                page = PageLinks(ROOT / filename)
                self.assertIn('/archive/', page.links)
                self.assertFalse(any(href.startswith('/projects/centauri-archive') for href in page.links))

    def test_legacy_project_url_redirects_to_archive(self):
        aliases = ('/projects/centauri-archive', '/projects/centauri-archive/', '/projects/centauri-archive/index.html')
        rules = {tuple(line.split()) for line in (ROOT / '_redirects').read_text().splitlines()}
        for alias in aliases:
            self.assertIn((alias, '/archive/', '301'), rules)
        fallback = PageLinks(ROOT / 'projects/centauri-archive/index.html')
        self.assertEqual(fallback.canonical, SITE_ORIGIN + '/archive/')
        self.assertEqual(fallback.refresh, '0; url=/archive/')
        self.assertIn('/archive/', fallback.links)

    def test_archive_sitemap_matches_published_canonicals(self):
        sitemap = ElementTree.parse(ROOT / 'sitemap.xml')
        locations = {element.text for element in sitemap.findall('.//{*}loc') if element.text}
        self.assertNotIn(SITE_ORIGIN + '/projects/centauri-archive/', locations)
        routes = ('/archive/', '/archive/brief', '/archive/encyclopedia', '/archive/images', '/archive/engineering')
        self.assertTrue({SITE_ORIGIN + route for route in routes}.issubset(locations))
        for url in sorted(locations):
            if url.startswith(SITE_ORIGIN + '/archive/'):
                with self.subTest(url=url):
                    route = url.removeprefix(SITE_ORIGIN).lstrip('/')
                    file = route + ('index.html' if route.endswith('/') else '.html')
                    self.assertEqual(PageLinks(ROOT / file).canonical, url)

    def test_generated_archive_matches_lock_and_chrome(self):
        repository, sha = load_lock()
        stamp = (ROOT / 'archive/SOURCE.txt').read_text()
        self.assertIn(f'Source: {repository}\n', stamp)
        self.assertIn(f'Commit: {sha}\n', stamp)
        self.assertEqual((ROOT / 'tools/archive-chrome.css').read_bytes(), (ROOT / 'archive/site-chrome.css').read_bytes())
        self.assertFalse(any(path.suffix.lower() == '.zip' for path in (ROOT / 'archive').rglob('*')))

    def test_embedded_archive_local_links_and_assets_resolve(self):
        archive = ROOT / 'archive'
        for file in sorted(archive.rglob('*.html')):
            origin = SITE_ORIGIN + page_path(file.relative_to(archive).as_posix())
            for reference in PageLinks(file).references:
                target = urlsplit(urljoin(origin, reference))
                if target.netloc != urlsplit(SITE_ORIGIN).netloc:
                    continue
                path = ROOT / unquote(target.path.lstrip('/'))
                with self.subTest(file=file.relative_to(ROOT), reference=reference):
                    self.assertTrue(
                        path.is_file() or (path / 'index.html').is_file() or path.with_suffix('.html').is_file(),
                        f'No static asset or clean route for {target.path}',
                    )


if __name__ == '__main__':
    unittest.main()
