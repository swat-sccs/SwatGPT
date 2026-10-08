# KB Ingestion

Offline batch pipeline: `information/` markdown → heading-aware chunks (LlamaIndex, ingest-only)
→ TEI embeddings (`Alibaba-NLP/gte-modernbert-base`, 768-dim) → Qdrant.

## Run

```bash
cd ingest
uv sync
uv run python ingest.py            # full ingestion
uv run python ingest.py --verify   # smoke queries against the `kb` alias
uv run python ingest.py --force    # accept a corpus under MIN_RATIO of the live one
uv run python ingest.py --rollback # point `kb` at the newest other non-empty kb_* collection
uv run python -m unittest test_ingest  # safety tests (in-memory Qdrant, fake TEI)
uv run --no-project --with requests --with trafilatura --with html2text \
  python -m unittest test_scrapers     # prune/refresh tests for ../scrape_www.py, ../scrape_catalog.py
```

## Config (env, all optional)

| Variable | Default |
|---|---|
| `TEI_EMBEDDINGS_URL` | `http://loon.sccs.swarthmore.edu:8001` |
| `QDRANT_URL` | `http://localhost:6333` |
| `INFORMATION_DIR` | `../information` (relative to this directory) |
| `EMBED_BATCH_SIZE` | `32` (TEI `max_client_batch_size`) |
| `MIN_POINTS` | `5000` (absolute chunk floor; the full corpus is ~11k) |
| `MIN_RATIO` | `0.8` (new chunk count vs. points behind `kb`; `--force` overrides) |

## Behavior

- Every mode (`--verify` and `--rollback` included) first checks the sparse tokenizer against
  golden hashes (`eduroam`, `sharples`, `cs`, and `"CS cs, a!"`) pinned in
  `packages/api/src/rag/lexical.spec.ts`, and exits if `fnv1a`/`sparse_vector` no longer match the
  query-side tokenizer.
- Before touching TEI or Qdrant writes, the run aborts if `INFORMATION_DIR` or any of its
  `www/` / `catalog/` subtrees is missing, if any group (`kb`, `www`, `course`) parsed zero docs,
  if the chunk count is under `MIN_POINTS`, or (unless `--force`) if it is under `MIN_RATIO` of
  the collection currently behind `kb`.
- Each run creates a fresh `kb_<timestamp>` collection and ingests fully. Before the swap it
  checks the stored point count and runs the smoke queries against the new collection; any
  failure (or a crash mid-upsert) deletes the new collection and leaves `kb` untouched.
- The `kb` alias is then atomically repointed. The previous target is kept and every older
  `kb_*` collection is deleted, so `--rollback` is a single alias re-point (run it again to go
  forward). Never write to the alias directly.
- Deterministic point ids (`uuid5(source#chunk_index)`), payload indexed on `doc_type`
  (`kb` | `www` | `course`).

## When and where

- Re-run after re-scraping `information/` (KB, www, or catalog changes). It is a full rebuild;
  there is no incremental mode.
- Production: runs on `eagle`, where Qdrant is local to the app host (`QDRANT_URL` default
  works). TEI stays on `loon`.
