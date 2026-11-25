import subprocess
import tempfile
import unittest
from pathlib import Path

from sync_centauri_archive import install_site, source_checkout


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
        self.page('discovery.html')
        self.page('proposal.html')
        self.page('vocabulary.html')
        self.page('knowledge/index.html')
        self.page('knowledge/life.html', '''<!doctype html>
<head><title>Life &amp; Earth</title><meta name="description" content="Quote &quot; and &amp;">
<link rel="stylesheet" href="../style.css"><link rel="stylesheet" href="knowledge.css">
<script src="../visual-explainers.js"></script></head>
<main id="main"><a href='../downloads/centauri.zip?download'>Download the archive</a>
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
                self.assertIn('href="/archive/discovery.html"', html)
                self.assertNotIn('href="/archive/brief.html"', html)
        nested = (self.output / 'knowledge/life.html').read_text()
        self.assertIn('href="/archive/discovery.html" aria-current="location"', nested)
        self.assertIn('Life &amp; Earth', nested)
        self.assertIn('Quote &quot; and &amp;', nested)
        self.assertLess(nested.index('href="../style.css"'), nested.index('href="knowledge.css"'))
        self.assertIn('defer src="../visual-explainers.js"', nested)
        self.assertEqual(nested.count('src="inside.js"'), 1)
        self.assertNotIn('centauri.zip', nested)

    def test_pinned_legacy_menu_only_includes_built_pages(self):
        self.page('index.html')
        self.page('brief.html')
        self.install()
        html = (self.output / 'index.html').read_text()
        self.assertIn('href="/archive/" aria-current="page"', html)
        self.assertIn('href="/archive/brief.html"', html)
        self.assertNotIn('href="/archive/proposal.html"', html)
        self.assertNotIn('href="/archive/engineering.html"', html)

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


if __name__ == '__main__':
    unittest.main()
