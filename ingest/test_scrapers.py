"""Frontmatter and pruning/refresh tests for ../scrape_kb.py, ../scrape_www.py and ../scrape_catalog.py.

Run from ingest/:
  uv run --no-project --with requests --with trafilatura --with html2text \
    python -m unittest test_scrapers

Only the HTTP fetch boundary is faked; slugging, extraction, writing and pruning are real.
"""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import scrape_kb
import scrape_www
import scrape_catalog

WWW = "https://www.swarthmore.edu"
PARAGRAPH = (
    "Students should contact the office during regular business hours for help with "
    "registration, enrollment verification, transcripts and related academic records. "
)


def page(title):
    paragraphs = "".join(f"<p>{title}: {PARAGRAPH}{n}</p>" for n in range(4))
    return (
        f'<html lang="en"><head><title>{title} | Swarthmore College</title></head>'
        f"<body><main><article><h1>{title}</h1>{paragraphs}</article></main></body></html>"
    )


QUOTED_TITLE = 'Printing "Policies" \\ FAQ'
QUOTED_YAML = 'title: "Printing \\"Policies\\" \\\\ FAQ"'


class TitleQuotingTest(unittest.TestCase):
    """Every scraper escapes the YAML title instead of swapping quotes, so it still equals the H1."""

    def test_kb_frontmatter_escapes_quotes_and_backslashes(self):
        text = scrape_kb.frontmatter(QUOTED_TITLE, "https://kb.swarthmore.edu/wiki/Printing", 7, ["Printing"])
        self.assertIn(QUOTED_YAML, text.splitlines())
        self.assertEqual(text.splitlines()[-1], "---")

    def test_www_frontmatter_escapes_quotes_and_backslashes(self):
        text = scrape_www.frontmatter(QUOTED_TITLE, f"{WWW}/registrar", "registrar", "body")
        self.assertIn(QUOTED_YAML, text.splitlines())

    def test_catalog_quote_escapes_quotes_and_backslashes(self):
        self.assertEqual(f"title: {scrape_catalog.quote(QUOTED_TITLE)}", QUOTED_YAML)
        self.assertEqual(scrape_catalog.quote("plain"), '"plain"')


class TempOutDir(unittest.TestCase):
    module = None

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = Path(self.tmp.name)
        self.patch(self.module, "OUT_DIR", self.out)

    def patch(self, target, name, value):
        patcher = mock.patch.object(target, name, value)
        patcher.start()
        self.addCleanup(patcher.stop)

    def files(self):
        return {p.name for p in self.out.glob("*.md")}


class ScrapeWwwTest(TempOutDir):
    module = scrape_www

    def setUp(self):
        super().setUp()
        self.patch(scrape_www, "SLEEP", 0)
        self.patch(scrape_www, "RESUME", False)
        self.fetched = []

    def run_scraper(self, urls, failing=()):
        def fetch(url):
            self.fetched.append(url)
            if url in failing:
                raise RuntimeError("503 Service Unavailable")
            return page(url.rsplit("/", 1)[-1])

        self.patch(scrape_www, "sitemap_urls", lambda: list(urls))
        self.patch(scrape_www, "fetch", fetch)
        scrape_www.main()

    def seed(self, *stems):
        for stem in stems:
            (self.out / f"{stem}.md").write_text("---\ntitle: old\n---\n\nold copy\n")

    def test_failed_fetch_keeps_existing_pages(self):
        self.seed("registrar-transcripts", "registrar-grades", "registrar-retired")
        self.run_scraper(
            [f"{WWW}/registrar/transcripts", f"{WWW}/registrar/grades"],
            failing={f"{WWW}/registrar/grades"},
        )
        self.assertEqual(
            self.files(),
            {"registrar-transcripts.md", "registrar-grades.md", "registrar-retired.md"},
        )
        self.assertIn("old copy", (self.out / "registrar-grades.md").read_text())

    def test_clean_run_prunes_removed_pages(self):
        stems = [f"registrar-page{n}" for n in range(9)]
        self.seed(*stems, "registrar-retired")
        self.patch(scrape_www, "MAX_PRUNE_RATIO", 0.5)
        self.run_scraper([f"{WWW}/registrar/page{n}" for n in range(9)])
        self.assertEqual(self.files(), {f"{stem}.md" for stem in stems})

    def test_mass_prune_is_skipped(self):
        self.seed(*(f"its-page{n}" for n in range(5)))
        self.run_scraper([f"{WWW}/registrar/only"])
        self.assertEqual(len(self.files()), 6)

    def test_empty_allowlist_refuses_to_run(self):
        self.seed("registrar-transcripts")
        with self.assertRaises(SystemExit):
            self.run_scraper([f"{WWW}/news/story"])
        self.assertEqual(self.files(), {"registrar-transcripts.md"})

    def test_resume_keeps_collision_variant(self):
        dashed, nested = f"{WWW}/registrar/a-b", f"{WWW}/registrar/a/b"
        self.run_scraper([dashed, nested])
        variant = f"registrar-a-b-{scrape_www.url_hash(nested)}.md"
        self.assertEqual(self.files(), {"registrar-a-b.md", variant})

        self.fetched.clear()
        self.patch(scrape_www, "RESUME", True)
        self.run_scraper([dashed, nested])
        self.assertEqual(self.fetched, [])
        self.assertEqual(self.files(), {"registrar-a-b.md", variant})


class ScrapeKbTest(TempOutDir):
    module = scrape_kb

    def setUp(self):
        super().setUp()
        self.patch(scrape_kb, "SLEEP", 0)

    def run_scraper(self, titles, failing=()):
        def fetch_page(title):
            if title in failing:
                raise RuntimeError("HTTP 503")
            return {"text": f"<h1>{title}</h1><p>{title}: {PARAGRAPH}</p>", "categories": []}

        pages = [{"title": title, "pageid": 1000 + n} for n, title in enumerate(titles)]
        self.patch(scrape_kb, "list_all_pages", lambda: pages)
        self.patch(scrape_kb, "fetch_page", fetch_page)
        scrape_kb.main()

    def seed(self, *stems):
        for stem in stems:
            (self.out / f"{stem}.md").write_text("---\ntitle: old\n---\n\nold copy\n")

    def test_clean_run_prunes_removed_articles(self):
        self.seed("eduroam", "vpn", "retired-article")
        self.patch(scrape_kb, "MAX_PRUNE_RATIO", 0.5)
        self.run_scraper(["Eduroam", "VPN"])
        self.assertEqual(self.files(), {"eduroam.md", "vpn.md"})
        self.assertIn("# Eduroam", (self.out / "eduroam.md").read_text())

    def test_failed_fetch_keeps_every_existing_article(self):
        self.seed("eduroam", "vpn", "retired-article")
        self.run_scraper(["Eduroam", "VPN"], failing={"VPN"})
        self.assertEqual(self.files(), {"eduroam.md", "vpn.md", "retired-article.md"})
        self.assertIn("old copy", (self.out / "vpn.md").read_text())

    def test_mass_prune_is_skipped(self):
        self.seed(*(f"article{n}" for n in range(5)))
        self.run_scraper(["Eduroam"])
        self.assertEqual(len(self.files()), 6)

    def test_subdirectories_are_never_pruned(self):
        (self.out / "www").mkdir()
        (self.out / "www" / "page.md").write_text("---\ntitle: www\n---\n")
        self.run_scraper(["Eduroam"])
        self.assertTrue((self.out / "www" / "page.md").exists())


CATOID = 9
OLD_CATOID = 8
COURSES = {501: "CPSC 035. Data Structures", 502: "MATH 015. Calculus"}
PROGRAMS = {701: "Computer Science"}


class FakeAcalog:
    def __init__(self):
        self.calls = []
        self.failing = set()
        self.course_index_error = False
        self.course_ids = list(COURSES)

    def fetch(self, path, params):
        self.calls.append((path, dict(params)))
        if path == "index.php" and not params:
            return f'<option value="{CATOID}" selected>College Bulletin 2027-2028 <'
        if path == "index.php":
            return "".join(
                f'<a href="/content.php?catoid={CATOID}&navoid={navoid}">{label}</a>'
                for navoid, label in ((100, "Course Search"), (101, "Departments and Programs"), (102, "Degree Requirements"))
            )
        if path == "ajax/preview_filter.php" and params["nav_oid"] == "101":
            return "".join(
                f'<a href="preview_program.php?catoid={CATOID}&poid={poid}&returnto=101">{name}</a>'
                for poid, name in PROGRAMS.items()
            )
        if path == "ajax/preview_filter.php":
            if self.course_index_error:
                raise RuntimeError("still throttled after backoff cap")
            return "".join(f"showCourse('{CATOID}', '{coid}'" for coid in self.course_ids)
        if path == "ajax/preview_course.php":
            coid = int(params["coid"])
            if coid in self.failing:
                raise RuntimeError("HTTP 500")
            return f"<h3>{COURSES[coid]}</h3><p>Fresh 2027 description. 1 credit.</p>"
        if path == "ajax/preview_program.php":
            return "<h1>Computer Science</h1><p>Fresh program text.</p>"
        if path == "ajax/preview_page.php":
            return '<h2 class="acalog-permalink-title">Degree Requirements</h2><p>Fresh policy.</p>'
        raise AssertionError(f"unexpected fetch {path} {params}")


class ScrapeCatalogTest(TempOutDir):
    module = scrape_catalog

    def setUp(self):
        super().setUp()
        self.acalog = FakeAcalog()
        self.patch(scrape_catalog, "fetch", self.acalog.fetch)
        self.patch(scrape_catalog, "REQUEST_PACING", 0)
        self.patch(scrape_catalog, "RESUME", False)

    def seed(self, filename, kind, catoid, item_id, text="Stale description."):
        param = {"course": "coid", "program": "poid", "policy": "navoid"}[kind]
        (self.out / filename).write_text(
            f'---\ntitle: "x"\nsource: {scrape_catalog.BASE}/p.php?catoid={catoid}&{param}={item_id}\n'
            f"type: {kind}\ncatalog_year: 2026-2027\n---\n\n{text}\n"
        )

    def read(self, filename):
        return (self.out / filename).read_text()

    def expected_files(self):
        return {
            "cpsc-035-data-structures.md",
            "math-015-calculus.md",
            "program-computer-science.md",
            "policy-degree-requirements.md",
        }

    def test_rollover_replaces_old_year_without_suffix(self):
        self.seed("cpsc-035-data-structures.md", "course", OLD_CATOID, 401)
        self.seed("hist-001-retired-course.md", "course", OLD_CATOID, 402)
        scrape_catalog.main()
        self.assertEqual(self.files(), self.expected_files())
        self.assertIn("catalog_year: 2027-2028", self.read("cpsc-035-data-structures.md"))
        self.assertIn("Fresh 2027", self.read("cpsc-035-data-structures.md"))

    def test_same_year_rerun_refreshes_content(self):
        self.seed("cpsc-035-data-structures.md", "course", CATOID, 501)
        scrape_catalog.main()
        self.assertNotIn("Stale", self.read("cpsc-035-data-structures.md"))
        self.assertEqual(self.files(), self.expected_files())

    def test_resume_skips_current_catalog_items(self):
        self.seed("cpsc-035-data-structures.md", "course", CATOID, 501)
        self.patch(scrape_catalog, "RESUME", True)
        scrape_catalog.main()
        fetched = {c[1].get("coid") for c in self.acalog.calls if c[0] == "ajax/preview_course.php"}
        self.assertEqual(fetched, {"502"})
        self.assertIn("Stale", self.read("cpsc-035-data-structures.md"))
        self.assertEqual(self.files(), self.expected_files())

    def test_failed_item_keeps_existing_file(self):
        self.seed("cpsc-035-old-title.md", "course", CATOID, 501)
        self.seed("hist-001-retired-course.md", "course", OLD_CATOID, 402)
        self.acalog.failing.add(501)
        scrape_catalog.main()
        self.assertIn("cpsc-035-old-title.md", self.files())
        self.assertNotIn("hist-001-retired-course.md", self.files())

    def test_index_failure_skips_pruning(self):
        self.seed("hist-001-retired-course.md", "course", OLD_CATOID, 402)
        self.acalog.course_index_error = True
        scrape_catalog.main()
        self.assertIn("hist-001-retired-course.md", self.files())

    def test_empty_index_skips_pruning(self):
        self.seed("hist-001-retired-course.md", "course", OLD_CATOID, 402)
        self.acalog.course_ids = []
        scrape_catalog.main()
        self.assertIn("hist-001-retired-course.md", self.files())


if __name__ == "__main__":
    unittest.main()
