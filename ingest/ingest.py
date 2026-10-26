#!/usr/bin/env python3
"""SwatGPT KB ingestion: markdown -> chunks -> TEI embeddings -> Qdrant.

Offline batch pipeline. LlamaIndex is used for chunking only and is never
imported on the query path.
"""

import os
import re
import sys
import time
import uuid
import argparse
from pathlib import Path

import httpx
import frontmatter
from qdrant_client import QdrantClient, models
from llama_index.core.schema import Document, MetadataMode
from llama_index.core.node_parser import MarkdownNodeParser, SentenceSplitter

TEI_URL = os.environ.get("TEI_EMBEDDINGS_URL", "http://loon.sccs.swarthmore.edu:8001").rstrip("/")
QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
INFORMATION_DIR = Path(
    os.environ.get("INFORMATION_DIR", str(Path(__file__).resolve().parent.parent / "information"))
)
EMBED_BATCH_SIZE = int(os.environ.get("EMBED_BATCH_SIZE", "32"))
UPSERT_BATCH_SIZE = int(os.environ.get("UPSERT_BATCH_SIZE", "256"))
MIN_POINTS = int(os.environ.get("MIN_POINTS", "5000"))
MIN_RATIO = float(os.environ.get("MIN_RATIO", "0.8"))

ALIAS = "kb"
VECTOR_DIM = 768
DENSE_VECTOR = "dense"
SPARSE_VECTOR = "sparse"
FNV_OFFSET = 2166136261
FNV_PRIME = 16777619
MIN_TOKEN_LENGTH = 2
TOKEN_RE = re.compile(r"[a-z0-9]+")
CHUNK_SIZE = 512
CHUNK_OVERLAP = 64
GROUPS = (("", "kb"), ("www", "www"), ("catalog", "course"))
OPTIONAL_FIELDS = ("content_hash", "categories", "pageid", "dept", "number", "credits", "catalog_year")
SMOKE_QUERIES = (
    "How do I connect to eduroam wifi?",
    "When is Sharples dining hall open?",
    "reset my Swarthmore password",
    "What courses does the Computer Science department offer?",
)


def iter_docs():
    for subdir, doc_type in GROUPS:
        base = INFORMATION_DIR / subdir if subdir else INFORMATION_DIR
        for path in sorted(base.glob("*.md")):
            yield path, doc_type


LEGACY_QUOTES = str.maketrans('"', "'")


def is_title_heading(heading, title):
    """Scrapers used to write titles with every double quote turned into a single quote."""
    return heading == title or heading.translate(LEGACY_QUOTES) == title


def section_path(node, title):
    parts = [p for p in node.metadata.get("header_path", "").split("/") if p]
    first_line = node.get_content(metadata_mode=MetadataMode.NONE).lstrip().split("\n", 1)[0]
    if first_line.startswith("#"):
        parts.append(first_line.lstrip("#").strip())
    if parts and is_title_heading(parts[0], title):
        parts = parts[1:]
    return " › ".join(parts)


def chunk_doc(path, doc_type, post, md_parser, splitter, duplicate_sources):
    meta = post.metadata
    title = str(meta.get("title", path.stem))
    source = str(meta.get("source", path.as_posix()))

    base_payload = {"title": title, "source": source, "doc_type": doc_type}
    for field in OPTIONAL_FIELDS:
        if field in meta and meta[field] is not None:
            base_payload[field] = meta[field]

    chunks = []
    nodes = md_parser.get_nodes_from_documents([Document(text=post.content)])
    for node in nodes:
        text = node.get_content(metadata_mode=MetadataMode.NONE).strip()
        if not text:
            continue
        section = section_path(node, title)
        for piece in splitter.split_text(text):
            chunks.append((section, piece.strip()))

    id_root = f"{source}#{path.stem}" if source in duplicate_sources else source
    points = []
    for chunk_index, (section, text) in enumerate(chunks):
        payload = dict(base_payload, text=text, chunk_index=chunk_index)
        if section:
            payload["section"] = section
        breadcrumb = f"{title} › {section}" if section else title
        points.append(
            {
                "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{id_root}#{chunk_index}")),
                "embed_text": f"{breadcrumb}\n\n{text}",
                "payload": payload,
            }
        )
    return points


def fnv1a(token):
    """FNV-1a 32-bit. Must stay byte-identical to packages/api/src/rag/lexical.ts."""
    h = FNV_OFFSET
    for byte in token.encode():
        h = ((h ^ byte) * FNV_PRIME) & 0xFFFFFFFF
    return h


def sparse_vector(text):
    counts = {}
    for token in TOKEN_RE.findall(text.lower()):
        if len(token) < MIN_TOKEN_LENGTH:
            continue
        token_id = fnv1a(token)
        counts[token_id] = counts.get(token_id, 0) + 1
    return models.SparseVector(
        indices=list(counts.keys()), values=[float(v) for v in counts.values()]
    )


TOKENIZER_GOLDEN = {"eduroam": 617671246, "sharples": 462714589, "cs": 1177122803}


def _selfcheck():
    """Abort if the tokenizer drifted from the golden values pinned in packages/api/src/rag/lexical.spec.ts."""
    drifted = [t for t, expected in TOKENIZER_GOLDEN.items() if fnv1a(t) != expected]
    sample = sparse_vector("CS cs, a!")
    if drifted or sample.indices != [TOKENIZER_GOLDEN["cs"]] or sample.values != [2.0]:
        sys.exit(
            "Sparse tokenizer no longer matches packages/api/src/rag/lexical.ts "
            f"(drifted: {drifted or 'sparse_vector'}). Fix it before ingesting."
        )


def check_tei(client):
    resp = client.get(f"{TEI_URL}/health")
    if resp.status_code != 200:
        sys.exit(f"TEI health check failed at {TEI_URL}/health: HTTP {resp.status_code}")


def embed_batch(client, texts):
    resp = client.post(f"{TEI_URL}/v1/embeddings", json={"input": texts})
    resp.raise_for_status()
    data = sorted(resp.json()["data"], key=lambda item: item["index"])
    return [item["embedding"] for item in data]


def embed_all(client, points):
    vectors = []
    for start in range(0, len(points), EMBED_BATCH_SIZE):
        batch = points[start : start + EMBED_BATCH_SIZE]
        vectors.extend(embed_batch(client, [p["embed_text"] for p in batch]))
        done = start + len(batch)
        if done % (EMBED_BATCH_SIZE * 25) == 0 or done == len(points):
            print(f"  embedded {done}/{len(points)} chunks")
    return vectors


def new_collection_name():
    return f"kb_{time.strftime('%Y%m%d%H%M%S')}"


def create_collection(qdrant):
    name = new_collection_name()
    qdrant.create_collection(
        collection_name=name,
        vectors_config={
            DENSE_VECTOR: models.VectorParams(size=VECTOR_DIM, distance=models.Distance.COSINE)
        },
        sparse_vectors_config={
            SPARSE_VECTOR: models.SparseVectorParams(modifier=models.Modifier.IDF)
        },
    )
    qdrant.create_payload_index(
        collection_name=name,
        field_name="doc_type",
        field_schema=models.PayloadSchemaType.KEYWORD,
    )
    return name


def upsert_all(qdrant, name, points, vectors):
    for start in range(0, len(points), UPSERT_BATCH_SIZE):
        batch = points[start : start + UPSERT_BATCH_SIZE]
        qdrant.upsert(
            collection_name=name,
            wait=True,
            points=[
                models.PointStruct(
                    id=p["id"],
                    vector={DENSE_VECTOR: vec, SPARSE_VECTOR: sparse_vector(p["embed_text"])},
                    payload=p["payload"],
                )
                for p, vec in zip(batch, vectors[start : start + UPSERT_BATCH_SIZE], strict=True)
            ],
        )


def current_target(qdrant):
    for alias in qdrant.get_aliases().aliases:
        if alias.alias_name == ALIAS:
            return alias.collection_name
    return None


def point_count(qdrant, name):
    return qdrant.count(collection_name=name, exact=True).count


def missing_dirs():
    if not INFORMATION_DIR.is_dir():
        return [INFORMATION_DIR]
    return [INFORMATION_DIR / subdir for subdir, _ in GROUPS if not (INFORMATION_DIR / subdir).is_dir()]


def corpus_problems(doc_counts, total_points):
    problems = [
        f"no '{doc_type}' docs found under {INFORMATION_DIR / subdir}"
        for subdir, doc_type in GROUPS
        if doc_counts.get(doc_type, 0) == 0
    ]
    if total_points < MIN_POINTS:
        problems.append(f"only {total_points} chunks, below MIN_POINTS={MIN_POINTS}")
    return problems


def shrink_problem(total_points, current_count):
    if current_count and total_points < MIN_RATIO * current_count:
        return (
            f"{total_points} chunks is under {MIN_RATIO:.0%} of the {current_count} points "
            f"behind '{ALIAS}' (pass --force if the shrink is intended)"
        )
    return None


def smoke_failures(qdrant, embed, collection_name):
    return [
        query
        for query in SMOKE_QUERIES
        if not qdrant.query_points(
            collection_name=collection_name, query=embed(query), using=DENSE_VECTOR, limit=1
        ).points
    ]


def check_new_collection(qdrant, embed, name, expected):
    stored = point_count(qdrant, name)
    if stored != expected:
        return [f"{name} holds {stored} points, expected {expected}"]
    return [f"smoke query returned nothing: {q!r}" for q in smoke_failures(qdrant, embed, name)]


def swap_alias(qdrant, name):
    existing = {alias.alias_name for alias in qdrant.get_aliases().aliases}
    ops = []
    if ALIAS in existing:
        ops.append(models.DeleteAliasOperation(delete_alias=models.DeleteAlias(alias_name=ALIAS)))
    ops.append(
        models.CreateAliasOperation(
            create_alias=models.CreateAlias(collection_name=name, alias_name=ALIAS)
        )
    )
    qdrant.update_collection_aliases(change_aliases_operations=ops)


def drop_old_collections(qdrant, keep):
    for collection in qdrant.get_collections().collections:
        if collection.name.startswith("kb_") and collection.name not in keep:
            qdrant.delete_collection(collection.name)
            print(f"  deleted old collection {collection.name}")


def abort(reasons):
    sys.exit("refusing to swap the alias:\n  " + "\n  ".join(reasons))


def parse_corpus():
    md_parser = MarkdownNodeParser()
    splitter = SentenceSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)

    docs = [(path, doc_type, frontmatter.load(path)) for path, doc_type in iter_docs()]
    source_counts = {}
    for _, _, post in docs:
        source = str(post.metadata.get("source", ""))
        source_counts[source] = source_counts.get(source, 0) + 1
    duplicate_sources = {source for source, count in source_counts.items() if count > 1}
    if duplicate_sources:
        print(f"warning: {len(duplicate_sources)} source URL(s) shared by multiple docs; "
              "point ids for those docs include the file stem")

    points = []
    doc_counts = {}
    chunk_counts = {}
    for path, doc_type, post in docs:
        doc_points = chunk_doc(path, doc_type, post, md_parser, splitter, duplicate_sources)
        points.extend(doc_points)
        doc_counts[doc_type] = doc_counts.get(doc_type, 0) + 1
        chunk_counts[doc_type] = chunk_counts.get(doc_type, 0) + len(doc_points)

    print(f"parsed {sum(doc_counts.values())} docs -> {len(points)} chunks from {INFORMATION_DIR}")
    for doc_type in sorted(chunk_counts):
        print(f"  {doc_type}: {doc_counts[doc_type]} docs, {chunk_counts[doc_type]} chunks")
    return points, doc_counts


def fill_and_check(qdrant, http, name, points, vectors):
    upsert_all(qdrant, name, points, vectors)
    print(f"upserted {len(points)} points")
    return check_new_collection(
        qdrant, lambda query: embed_batch(http, [query])[0], name, len({p["id"] for p in points})
    )


def ingest(qdrant, http, force=False):
    started = time.monotonic()
    missing = missing_dirs()
    if missing:
        abort([f"missing directory {path} (INFORMATION_DIR={INFORMATION_DIR})" for path in missing])

    points, doc_counts = parse_corpus()
    previous = current_target(qdrant)
    current_count = point_count(qdrant, previous) if previous else 0
    problems = corpus_problems(doc_counts, len(points))
    shrink = shrink_problem(len(points), current_count)
    if shrink and not force:
        problems.append(shrink)
    if problems:
        abort(problems)

    check_tei(http)
    vectors = embed_all(http, points)

    name = create_collection(qdrant)
    print(f"created collection {name}")
    try:
        failures = fill_and_check(qdrant, http, name, points, vectors)
    except BaseException:
        qdrant.delete_collection(name)
        print(f"deleted {name}; '{ALIAS}' still -> {previous}", file=sys.stderr)
        raise
    if failures:
        qdrant.delete_collection(name)
        abort([*failures, f"deleted {name}; '{ALIAS}' still -> {previous}"])

    swap_alias(qdrant, name)
    print(f"alias '{ALIAS}' -> {name} (previous: {previous})")
    drop_old_collections(qdrant, keep={name, previous})
    print(f"done in {time.monotonic() - started:.1f}s")


def rollback(qdrant):
    current = current_target(qdrant)
    candidates = sorted(
        c.name for c in qdrant.get_collections().collections
        if c.name.startswith("kb_") and c.name != current and point_count(qdrant, c.name) > 0
    )
    if not candidates:
        sys.exit(f"no previous non-empty kb_* collection to roll back to ('{ALIAS}' -> {current})")
    target = candidates[-1]
    swap_alias(qdrant, target)
    print(f"alias '{ALIAS}' -> {target} (was {current})")


def verify(qdrant, http, collection_name=ALIAS):
    check_tei(http)
    for query in SMOKE_QUERIES:
        vector = embed_batch(http, [query])[0]
        result = qdrant.query_points(
            collection_name=collection_name,
            query=vector,
            using=DENSE_VECTOR,
            limit=5,
            with_payload=["title", "source"],
        )
        print(f"\nQ: {query}")
        if not result.points:
            print("  (no results)")
        for point in result.points:
            print(f"  {point.score:.4f}  {point.payload.get('title')}  ({point.payload.get('source')})")


def main():
    parser = argparse.ArgumentParser(description="SwatGPT KB ingestion pipeline")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--verify",
        action="store_true",
        help="run smoke queries against the 'kb' alias instead of ingesting",
    )
    mode.add_argument(
        "--rollback",
        action="store_true",
        help="point the 'kb' alias back at the newest other kb_* collection",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help=f"swap even if the new corpus is under {MIN_RATIO:.0%} of the current one",
    )
    args = parser.parse_args()
    _selfcheck()
    qdrant = QdrantClient(url=QDRANT_URL, timeout=120)
    if args.rollback:
        rollback(qdrant)
        return
    with httpx.Client(timeout=120) as http:
        if args.verify:
            verify(qdrant, http)
            return
        ingest(qdrant, http, force=args.force)


if __name__ == "__main__":
    main()
