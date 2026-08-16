# KB Ingestion

Offline batch pipeline: `information/` markdown → heading-aware chunks (LlamaIndex, ingest-only)
→ TEI embeddings (`Alibaba-NLP/gte-modernbert-base`, 768-dim) → Qdrant.

## Run

```bash
cd ingest
uv sync
uv run python ingest.py            # full ingestion
uv run python ingest.py --verify   # smoke queries against the `kb` alias
```

## Config (env, all optional)

| Variable | Default |
|---|---|
| `TEI_EMBEDDINGS_URL` | `http://loon.sccs.swarthmore.edu:8001` |
| `QDRANT_URL` | `http://localhost:6333` |
| `INFORMATION_DIR` | `../information` (relative to this directory) |
| `EMBED_BATCH_SIZE` | `32` (TEI `max_client_batch_size`) |

## Behavior

- Each run creates a fresh `kb_<timestamp>` collection, ingests fully, atomically points the
  `kb` alias at it, then deletes older `kb_*` collections — zero downtime, idempotent.
  Never write to the alias directly.
- Deterministic point ids (`uuid5(source#chunk_index)`), payload indexed on `doc_type`
  (`kb` | `www` | `course`).

## When and where

- Re-run after re-scraping `information/` (KB, www, or catalog changes). It is a full rebuild;
  there is no incremental mode.
- Production: runs on `eagle`, where Qdrant is local to the app host (`QDRANT_URL` default
  works). TEI stays on `loon`.
