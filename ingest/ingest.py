#!/usr/bin/env python3
"""SwatGPT KB ingestion: markdown -> chunks -> TEI embeddings -> Qdrant.

Offline batch pipeline. LlamaIndex is used for chunking only and is never
imported on the query path.
"""

import os
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

ALIAS = "kb"
VECTOR_DIM = 768
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


def section_path(node, title):
    parts = [p for p in node.metadata.get("header_path", "").split("/") if p]
    first_line = node.get_content(metadata_mode=MetadataMode.NONE).lstrip().split("\n", 1)[0]
    if first_line.startswith("#"):
        parts.append(first_line.lstrip("#").strip())
    if parts and parts[0] == title:
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


def create_collection(qdrant):
    name = f"kb_{time.strftime('%Y%m%d%H%M%S')}"
    qdrant.create_collection(
        collection_name=name,
        vectors_config=models.VectorParams(size=VECTOR_DIM, distance=models.Distance.COSINE),
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
                models.PointStruct(id=p["id"], vector=vec, payload=p["payload"])
                for p, vec in zip(batch, vectors[start : start + UPSERT_BATCH_SIZE])
            ],
        )


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
        if collection.name.startswith("kb_") and collection.name != keep:
            qdrant.delete_collection(collection.name)
            print(f"  deleted old collection {collection.name}")


def ingest():
    started = time.monotonic()
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

    total_docs = sum(doc_counts.values())
    print(f"parsed {total_docs} docs -> {len(points)} chunks")
    for doc_type in sorted(chunk_counts):
        print(f"  {doc_type}: {doc_counts[doc_type]} docs, {chunk_counts[doc_type]} chunks")

    with httpx.Client(timeout=120) as http:
        check_tei(http)
        vectors = embed_all(http, points)

    qdrant = QdrantClient(url=QDRANT_URL, timeout=120)
    name = create_collection(qdrant)
    print(f"created collection {name}")
    upsert_all(qdrant, name, points, vectors)
    print(f"upserted {len(points)} points")
    swap_alias(qdrant, name)
    print(f"alias '{ALIAS}' -> {name}")
    drop_old_collections(qdrant, keep=name)
    print(f"done in {time.monotonic() - started:.1f}s")


def verify():
    qdrant = QdrantClient(url=QDRANT_URL, timeout=30)
    with httpx.Client(timeout=30) as http:
        check_tei(http)
        for query in SMOKE_QUERIES:
            vector = embed_batch(http, [query])[0]
            result = qdrant.query_points(
                collection_name=ALIAS,
                query=vector,
                limit=5,
                with_payload=["title", "source"],
            )
            print(f"\nQ: {query}")
            for point in result.points:
                print(f"  {point.score:.4f}  {point.payload.get('title')}  ({point.payload.get('source')})")


def main():
    parser = argparse.ArgumentParser(description="SwatGPT KB ingestion pipeline")
    parser.add_argument(
        "--verify",
        action="store_true",
        help="run smoke queries against the 'kb' alias instead of ingesting",
    )
    args = parser.parse_args()
    if args.verify:
        verify()
        return
    ingest()


if __name__ == "__main__":
    main()
