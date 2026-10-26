"""Alias-swap safety tests: run with `uv run python -m unittest test_ingest` from ingest/.

Qdrant runs in local in-memory mode (real client, real alias/collection logic); only the
TEI embeddings HTTP API is faked with an httpx MockTransport.
"""

import json
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import httpx
import frontmatter
from qdrant_client import QdrantClient, models

import ingest


def fake_vector(text):
    digest = hashlib.sha256(text.encode()).digest()
    return [((digest[i % len(digest)] + i) % 251 + 1) / 251 for i in range(ingest.VECTOR_DIM)]


def tei_handler(request):
    if request.url.path == "/health":
        return httpx.Response(200)
    texts = json.loads(request.content)["input"]
    return httpx.Response(
        200, json={"data": [{"index": i, "embedding": fake_vector(t)} for i, t in enumerate(texts)]}
    )


def write_doc(directory, stem, title, sentences=5, hashed=True):
    directory.mkdir(parents=True, exist_ok=True)
    body = f"# {title}\n\n" + " ".join(f"{title} detail sentence number {n}." for n in range(sentences))
    digest = f"content_hash: {hashlib.sha256(body.encode()).hexdigest()}\n" if hashed else ""
    (directory / f"{stem}.md").write_text(
        f'---\ntitle: "{title}"\nsource: https://example.edu/{directory.name}/{stem}\n{digest}---\n\n{body}\n'
    )


def build_corpus(root, kb=2, www=2, catalog=2):
    for i in range(kb):
        write_doc(root, f"kb-{i}", f"KB article {i}")
    for i in range(www):
        write_doc(root / "www", f"www-{i}", f"WWW page {i}")
    for i in range(catalog):
        write_doc(root / "catalog", f"course-{i}", f"Course {i}")
    (root / "www").mkdir(exist_ok=True)
    (root / "catalog").mkdir(exist_ok=True)


def seed_collection(qdrant, name, count, alias=False):
    qdrant.create_collection(
        collection_name=name,
        vectors_config={
            ingest.DENSE_VECTOR: models.VectorParams(size=ingest.VECTOR_DIM, distance=models.Distance.COSINE)
        },
    )
    qdrant.upsert(
        collection_name=name,
        points=[
            models.PointStruct(id=i + 1, vector={ingest.DENSE_VECTOR: fake_vector(str(i))}, payload={})
            for i in range(count)
        ],
    )
    if alias:
        ingest.swap_alias(qdrant, name)


def chunk_file(path):
    from llama_index.core.node_parser import MarkdownNodeParser, SentenceSplitter

    return ingest.chunk_doc(
        path, "kb", frontmatter.load(path), MarkdownNodeParser(), SentenceSplitter(), set()
    )


class SectionPathTest(unittest.TestCase):
    """The H1 repeats the frontmatter title and must not become part of the breadcrumb."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def write(self, yaml_title, heading):
        path = self.root / "printing.md"
        path.write_text(
            f"---\ntitle: {yaml_title}\nsource: https://kb.swarthmore.edu/wiki/Printing\n---\n\n"
            f"# {heading}\n\nIntro paragraph.\n\n## Large format\n\nPosters are 48x35.\n"
        )
        return path

    def assert_breadcrumbs(self, path):
        sections = [point["payload"].get("section") for point in chunk_file(path)]
        self.assertEqual(sections, [None, "Large format"])

    def test_escaped_quotes_in_title_match_the_heading(self):
        self.assert_breadcrumbs(self.write('"Printing \\"Policies\\""', 'Printing "Policies"'))

    def test_legacy_single_quote_substitution_still_matches_the_heading(self):
        self.assert_breadcrumbs(self.write("\"Printing 'Policies'\"", 'Printing "Policies"'))

    def test_unquoted_plain_title_matches_the_heading(self):
        self.assert_breadcrumbs(self.write("Printing Policies", "Printing Policies"))


class TokenizerSelfcheckTest(unittest.TestCase):
    def test_selfcheck_passes_on_pinned_tokenizer(self):
        ingest._selfcheck()

    def test_selfcheck_exits_when_hash_drifts(self):
        with mock.patch.object(ingest, "FNV_PRIME", 16777620), self.assertRaises(SystemExit):
            ingest._selfcheck()

    def test_selfcheck_exits_when_token_rule_drifts(self):
        with mock.patch.object(ingest, "MIN_TOKEN_LENGTH", 1), self.assertRaises(SystemExit):
            ingest._selfcheck()


class IngestSafetyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.qdrant = QdrantClient(":memory:")
        self.http = httpx.Client(transport=httpx.MockTransport(tei_handler), base_url="http://tei")
        self.names = iter(f"kb_2030010100000{i}" for i in range(10))
        for patcher in (
            mock.patch.object(ingest, "INFORMATION_DIR", self.root),
            mock.patch.object(ingest, "MIN_POINTS", 1),
            mock.patch.object(ingest, "TEI_URL", "http://tei"),
            mock.patch.object(ingest, "new_collection_name", lambda: next(self.names)),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def tearDown(self):
        self.http.close()
        self.qdrant.close()
        self.tmp.cleanup()

    def collections(self):
        return {c.name for c in self.qdrant.get_collections().collections}

    def assert_refused(self, force=False):
        before = (self.collections(), ingest.current_target(self.qdrant))
        with self.assertRaises(SystemExit) as ctx:
            ingest.ingest(self.qdrant, self.http, force=force)
        self.assertEqual((self.collections(), ingest.current_target(self.qdrant)), before)
        return str(ctx.exception.code)

    def test_missing_information_dir_is_refused(self):
        seed_collection(self.qdrant, "kb_old", 3, alias=True)
        with mock.patch.object(ingest, "INFORMATION_DIR", self.root / "absent"):
            message = self.assert_refused()
        self.assertIn(str(self.root / "absent"), message)

    def test_missing_subtree_is_refused(self):
        build_corpus(self.root)
        (self.root / "catalog" / "course-0.md").unlink()
        (self.root / "catalog" / "course-1.md").unlink()
        (self.root / "catalog").rmdir()
        self.assertIn("catalog", self.assert_refused(force=True))

    def test_empty_group_is_refused_even_with_force(self):
        build_corpus(self.root, catalog=0)
        self.assertIn("'course'", self.assert_refused(force=True))

    def test_below_min_points_floor_is_refused(self):
        build_corpus(self.root)
        with mock.patch.object(ingest, "MIN_POINTS", 10_000):
            self.assertIn("MIN_POINTS", self.assert_refused(force=True))

    def test_large_shrink_needs_force(self):
        build_corpus(self.root)
        seed_collection(self.qdrant, "kb_old", 100, alias=True)
        self.assertIn("--force", self.assert_refused())

        ingest.ingest(self.qdrant, self.http, force=True)
        self.assertEqual(ingest.current_target(self.qdrant), "kb_20300101000000")

    def test_swap_keeps_previous_and_drops_older(self):
        build_corpus(self.root)
        seed_collection(self.qdrant, "kb_ancient", 1)
        seed_collection(self.qdrant, "kb_old", 1, alias=True)

        ingest.ingest(self.qdrant, self.http)

        new = "kb_20300101000000"
        self.assertEqual(ingest.current_target(self.qdrant), new)
        self.assertEqual(self.collections(), {new, "kb_old"})
        self.assertEqual(ingest.point_count(self.qdrant, new), 6)

        ingest.rollback(self.qdrant)
        self.assertEqual(ingest.current_target(self.qdrant), "kb_old")

    def test_first_ingest_without_alias(self):
        build_corpus(self.root)
        ingest.ingest(self.qdrant, self.http)
        self.assertEqual(ingest.current_target(self.qdrant), "kb_20300101000000")

    def test_incomplete_upsert_never_swaps(self):
        build_corpus(self.root)
        seed_collection(self.qdrant, "kb_old", 1, alias=True)
        with mock.patch.object(ingest, "upsert_all", lambda *args: None):
            message = self.assert_refused()
        self.assertIn("holds 0 points", message)

    def test_crash_mid_upsert_deletes_new_collection(self):
        build_corpus(self.root)
        seed_collection(self.qdrant, "kb_old", 1, alias=True)

        def explode(*args):
            raise RuntimeError("qdrant went away")

        with mock.patch.object(ingest, "upsert_all", explode), self.assertRaises(RuntimeError):
            ingest.ingest(self.qdrant, self.http)
        self.assertEqual(self.collections(), {"kb_old"})
        self.assertEqual(ingest.current_target(self.qdrant), "kb_old")

    def test_diff_reports_added_removed_and_changed_docs_without_writing(self):
        build_corpus(self.root)
        ingest.ingest(self.qdrant, self.http)
        before = self.collections()

        write_doc(self.root, "kb-9", "KB article 9")
        (self.root / "www" / "www-1.md").unlink()
        write_doc(self.root / "catalog", "course-0", "Course 0", sentences=120)

        with mock.patch.object(ingest, "embed_batch", side_effect=AssertionError("TEI called")):
            result = ingest.diff(self.qdrant)

        self.assertEqual(result["added"], [f"https://example.edu/{self.root.name}/kb-9"])
        self.assertEqual(result["removed"], ["https://example.edu/www/www-1"])
        self.assertEqual(result["changed"], ["https://example.edu/catalog/course-0"])
        self.assertEqual(result["live_chunks"], 6)
        self.assertGreater(result["corpus_chunks"], 6)
        self.assertEqual(self.collections(), before)
        self.assertEqual(ingest.current_target(self.qdrant), "kb_20300101000000")

    def test_diff_falls_back_to_chunk_counts_for_unhashed_docs(self):
        live = {"a": {"content_hash": None, "chunks": 2}, "b": {"content_hash": "x", "chunks": 1}}
        corpus = {
            "a": {"content_hash": None, "chunks": 3},
            "b": {"content_hash": "x", "chunks": 2},
        }
        result = ingest.diff_docs(live, corpus)
        self.assertEqual(result["changed"], ["a"])
        self.assertEqual((result["live_chunks"], result["corpus_chunks"]), (3, 5))

    def test_diff_without_live_alias_exits(self):
        build_corpus(self.root)
        with self.assertRaises(SystemExit):
            ingest.diff(self.qdrant)

    def test_rollback_skips_empty_collections(self):
        seed_collection(self.qdrant, "kb_a", 2)
        seed_collection(self.qdrant, "kb_b", 2, alias=True)
        seed_collection(self.qdrant, "kb_c", 0)
        ingest.rollback(self.qdrant)
        self.assertEqual(ingest.current_target(self.qdrant), "kb_a")

    def test_smoke_failures_on_empty_collection(self):
        seed_collection(self.qdrant, "kb_empty", 0)
        failures = ingest.smoke_failures(self.qdrant, fake_vector, "kb_empty")
        self.assertEqual(failures, list(ingest.SMOKE_QUERIES))

    def test_rollback_without_previous_exits(self):
        seed_collection(self.qdrant, "kb_only", 1, alias=True)
        with self.assertRaises(SystemExit):
            ingest.rollback(self.qdrant)
        self.assertEqual(ingest.current_target(self.qdrant), "kb_only")


if __name__ == "__main__":
    unittest.main()
