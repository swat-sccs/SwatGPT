# SwatGPT

An AI assistant for Swarthmore College, run by [SCCS](https://sccs.swarthmore.edu). Live at [chat.sccs.swarthmore.edu](https://chat.sccs.swarthmore.edu) — log in with your SCCS account.

SwatGPT is a fork of [LibreChat](https://github.com/danny-avila/LibreChat) wired up to models we host ourselves on SCCS hardware. Nothing you type leaves campus: generation, embeddings, and reranking all run on our own GPU, and conversations live in our own database. On top of that, every message is grounded against a scraped copy of the [Swarthmore Knowledge Base](https://kb.swarthmore.edu), so it can actually answer questions about printers in McCabe, ITS policies, or how to get on the VPN, with citations.

## How it differs from stock LibreChat

- **Self-hosted inference.** A vLLM server on our GPU box (`loon`) serves Qwen3.6-35B-A3B in FP8 through an OpenAI-compatible API. No OpenAI/Anthropic keys anywhere.
- **Custom retrieval, not `rag_api`.** LibreChat's built-in RAG service is ripped out. Retrieval is a small TypeScript pipeline in `packages/api/src/rag/` that runs on every message: embed the query, run a hybrid dense + lexical search against Qdrant, rerank, and inject the top chunks into the agent's context. It has a hard 1.5 s budget and fails open — a slow or dead vector DB never blocks a chat.
- **Hybrid search.** Dense vectors (gte-modernbert-base, 768-dim) catch topical matches; a sparse IDF-weighted lexical index catches exact campus entities ("Sharples", "Cornell") that embeddings tend to blur. Results are merged, reranked with a cross-encoder, and the best lexical hit gets a guaranteed slot so entity questions always ground.
- **SCCS-only login.** Authentication goes through our Keycloak instance via OIDC. Email registration is off.
- **SCCS look.** The client is rebranded and themed with the SCCS palette, and interface surfaces we don't use are gated off.

## Architecture

Two machines split the work:

- **`loon`** (GPU) — vLLM for generation, plus two [TEI](https://github.com/huggingface/text-embeddings-inference) containers for embeddings and reranking. Everything shares one RTX 6000 Pro.
- **`eagle`** (app VM) — this repo's Docker Compose stack: the LibreChat app, MongoDB (users/conversations), Qdrant (knowledge-base vectors), and Meilisearch (chat search). Traefik on `gull` fronts it as `chat.sccs.swarthmore.edu`.

## Knowledge base pipeline

1. `scrape_kb.py` pulls every main-namespace article from kb.swarthmore.edu through the MediaWiki API and writes markdown with YAML frontmatter into `information/` (~489 articles). `scrape_www.py` and `scrape_catalog.py` do the same for the main site and course catalog.
2. `ingest/ingest.py` chunks the corpus (markdown-aware splitting, 512 tokens with 64 overlap), batch-embeds via TEI, computes the sparse lexical vectors, and writes a fresh timestamped Qdrant collection, then atomically swaps the `kb` alias to it. Re-ingesting is zero-downtime; the full corpus (3,528 docs → ~11k chunks) takes about 20 seconds.

The sparse tokenizer in `packages/api/src/rag/lexical.ts` and `ingest/ingest.py` must stay byte-for-byte identical — query-time and ingest-time hashing have to agree.

## Development

This is a standard LibreChat monorepo. The short version:

```bash
npm run smart-reinstall   # install deps + build packages
npm run backend:dev       # backend on :3080
npm run frontend:dev      # Vite dev server on :3090
```

New backend code goes in `packages/api` (TypeScript); `/api` stays a thin legacy JS layer. See the workspace table in upstream's docs for the full layout. Tests are Jest, run per-workspace (`cd packages/api && npx jest <pattern>`).

You'll need a `.env` pointing at an OpenAI-compatible inference endpoint and (optionally) TEI + Qdrant if you want retrieval locally — without them the RAG layer just fails open and you get a plain chatbot.

## Deploying

Push to `main`. A self-hosted GitHub Actions runner on `eagle` checks out the commit, rebuilds the app image, restarts only the changed containers, and health-checks the app. Deploys take about 90 seconds and never touch data volumes or config.

## Credits

Built on [LibreChat](https://github.com/danny-avila/LibreChat) by Danny Avila and contributors, under the MIT license (see [LICENSE](LICENSE)). Maintained by the [Swarthmore College Computer Society](https://sccs.swarthmore.edu).
