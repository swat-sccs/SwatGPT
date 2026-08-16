See CLAUDE.md.

## SwatGPT

This LibreChat fork is being built into **SwatGPT**, an AI assistant for Swarthmore College.

- **Inference server**: self-hosted vLLM (v0.21.0) on `loon`, OpenAI-compatible API at `http://loon.sccs.swarthmore.edu:8000/v1`. Serving confirmed working.
- **Model**: `Qwen/Qwen3.6-35B-A3B-FP8` (reasoning model — responses include a `reasoning` field).
- **GPU**: NVIDIA RTX PRO 6000 Blackwell (96 GB VRAM), passthrough to `loon`.
- **Knowledge base**: `scrape_kb.py` → `information/` (~489 markdown articles from kb.swarthmore.edu, YAML frontmatter, for RAG ingestion).

### SCCS Infrastructure (summary — full details in CLAUDE.md)

- `nest` — physical Proxmox VE 9.1.4 host: 2× Xeon Gold 6430 (128 threads), 503 GiB RAM. Runs nearly all VMs (~15). **RAM is overcommitted** (swap + KSM) — size new VMs modestly. Storage pools: `local-zfs` (SSD ~1.67 TB, VM disks), `hdd-pool` (HDD ~68 TB bulk). Storage is node-local.
- `heron` — second physical Proxmox host, currently **down**.
- `sccs-5090` — bare-metal Docker swarm worker with RTX 5090 (~32 GB VRAM). **Not available for SwatGPT.**
- `ibis` — Proxmox Backup Server (PBS).
- `loon` (VM 109 on nest) — 96 GB GPU; hosts ALL SwatGPT GPU workloads (generation + embeddings).
- `goose` (VM on nest) — small slice running Dokploy; not for heavy workloads.
- VRAM is ~128 GB aggregate but split across two machines, not pooled.

### RAG Stack

Custom RAG — **LibreChat's built-in `rag_api` is NOT used** (too slow). No framework on the query path.

- **Generation**: vLLM + Qwen3.6-35B on `loon` (done), `--gpu-memory-utilization 0.85` to leave ~13 GB for TEI.
- **Embeddings + reranker**: TEI on `loon` sharing the GPU (start vLLM first) — `Qwen/Qwen3-Embedding-0.6B` (~2–3 GB) and `BAAI/bge-reranker-v2-m3` (~2 GB).
- **Vector DB**: Qdrant on the `swatgpt` VM (~5k chunks in RAM, sub-ms search).
- **Retrieval**: custom TypeScript in `packages/api`, runs on every message — embed query → Qdrant top-20 → rerank → top-5 injected into the system prompt before the single vLLM call (<30 ms overhead, no tool-call round trip).
- **Hosting**: dedicated `swatgpt` VM on `nest` (~8 vCPU / 16 GiB, `local-zfs` SSD) running LibreChat + MongoDB + Meilisearch + Qdrant; backups to `ibis`. Databases never on `goose` or `hdd-pool`.
- **Ingestion**: one-time offline LlamaIndex script (MarkdownNodeParser, frontmatter → metadata for citations) → TEI batch embed → Qdrant. Ingest-only; LlamaIndex never runs at query time.

## Frontend theming and styling

For frontend work, compose existing `@librechat/client` primitives and variants before adding
feature-local styles. Use semantic theme/Tailwind roles for color and shared appearance; do not
introduce raw palette utilities, hard-coded colors, or arbitrary theme CSS. If the system cannot
express a reusable design need, deepen the shared primitive or versioned theme-token registry
instead of copying classes into a feature. Keep genuine layout and behavior local, and document
why any new custom CSS cannot be expressed by the shared system. See the detailed policy in
`CLAUDE.md` under “Theming and styling.”

When adding or changing code that mutates user documents, invalidate the auth user document cache for affected users. This includes single-user updates and bulk role/user mutations; otherwise OpenID JWT request burst caching can serve a stale `req.user` until its TTL expires.
