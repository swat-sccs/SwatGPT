# SwatGPT answer-quality eval

Asks SwatGPT a fixed set of questions written from the KB in `information/`, with the
production system prompt, retrieval and sampling parameters, and scores the answers
with automatic checks. Every run writes a JSON report and a Markdown report to
`eval/reports/`.

## What is in here

| Path | Purpose |
|---|---|
| `questions.json` | 50 cases: 35 answerable, 10 the KB cannot answer, 5 two-turn follow-ups |
| `run.ts` | CLI: retrieval, generation, scoring, reports |
| `lib/corpus.ts` | Loads `information/` (KB, `www/`, `catalog/`), chunks it, builds a BM25 index and the set of every URL and email address in the KB |
| `lib/retrieval.ts` | `live` mode (production `retrieveKbContextDetailed`) or `local` mode (see below) |
| `lib/prompt.ts` | Reads the default model spec and endpoint from `librechat.yaml` |
| `lib/chat.ts` | Streaming client for vLLM; measures time to first token |
| `lib/score.ts` | Fact, citation, invented-URL/email and refusal checks |
| `lib/report.ts` | Summary numbers, worst failures, Markdown |
| `lib/recall.ts` | Recall@8 and the retrieval-only report (`--retrieval-only`) |
| `reports/baseline.*` | The committed first run |
| `reports/after.*` | Run after the prompt-caching, grounding, top_p and unnumbered-entry changes (same settings as the baseline) |

### Question format

```json
{
  "id": "helpdesk-phone",
  "kind": "answerable",
  "turns": ["What is the ITS Help Desk phone number?"],
  "docs": ["help-desk-hours-of-operation.md"],
  "facts": [["x8513", "610-328-8513"]]
}
```

- `kind` is `answerable`, `unanswerable` (expects no `docs` or `facts`), or `followup`
  (two or more `turns`; only the last turn is scored, earlier answers become chat history).
- `docs` are paths under `information/`. The expected source URLs come from their frontmatter.
- Each entry in `facts` is a list of alternatives; the fact counts as present when any
  alternative appears in the answer (case-, emphasis- and spacing-insensitive).

The test suite rejects unknown files, duplicate ids and facts that do not appear in the
cited KB files, so edit the set and run `npm test` before a run.

## Scoring

| Check | Meaning |
|---|---|
| Accuracy | Answerable and follow-up cases where every fact is present and no URL, email or phone number was invented |
| Refusal correctness | Unanswerable cases where the answer says it could not find or confirm the information (first person or about the knowledge base; a confident "No, X is not offered" does not count), and invents no contact detail |
| False refusals | Answerable cases that declined and missed a fact |
| Invented URL | A URL (or bare `*.swarthmore.edu` host/path) that is in neither the KB nor the prompt the model saw |
| Invented email, phone | Same, for email addresses and phone numbers (`610-328-XXXX` and `xXXXX` are the same number) |
| `[n]` citations | Answerable cases that cite context entries by number, which users cannot follow |
| Expected source cited | The answer links one of the question's source URLs |
| Cited among retrieved | Of answers that cite a URL, how many cite one from the retrieved context |
| Expected source retrieved | The question's source document was in the context block (retrieval recall). Reported as `n/a (oracle)` in local oracle mode, where the gold chunks are injected into the candidate pool |
| Latency, TTFT | Final-turn wall time and time to the first content token, p50/p95 |

Failures are ranked by severity (invented URLs, emails and phone numbers, then unanswerable questions
answered anyway, then missing facts). The Markdown report prints the five worst verbatim.

## Retrieval modes

- `live` uses the shipped `retrieveKbContextDetailed` from `@librechat/api`, against
  `TEI_EMBEDDINGS_URL`, `TEI_RERANK_URL` and `QDRANT_URL`. Use this wherever Qdrant's
  `kb` collection is reachable.
- `local` is used when Qdrant is not reachable (for example from loon, since Qdrant only
  listens inside eagle's compose network). Candidates are the BM25 top 20 over the
  `information/` markdown for each query production searches with (the current turn, plus
  the combined query on a follow-up), merged round-robin with the production sparse
  tokenizer, plus up to 12 chunks from the question's own source documents ("oracle";
  turn off with `--no-oracle`). They are
  reranked by the production TEI reranker and pass through the production selection rule
  (score floor 0.3, top 8, one lexical slot) and `formatContext`. There is no dense channel,
  and chunking only approximates the ingest splitter, so local mode measures **generation
  quality given realistic context**, not production retrieval.
- `auto` (default) probes `QDRANT_URL` and picks `live` when it answers.

### Retrieval only

`npm run eval -- --retrieval-only` runs production retrieval (live mode, so the stack must be
reachable) for the scored turn of every case and generates nothing, so it needs no
`VLLM_API_KEY` and costs no vLLM time. It reports recall@8 (the share of each case's
expected source URLs among the entries of the context block, averaged over answerable and
follow-up cases), the share of cases with at least one expected source retrieved, the result
counts and retrieval latency p50/p95, written to `eval/reports/eval-<stamp>-retrieval.{json,md}`.

Both modes build the follow-up retrieval queries with production `buildKbQueries` and
`resolveRetrievalQueries`. Neither
mode sends the Dash MCP tools, MCP server instructions or the directory block, so live-data
questions (menus, hours today) are out of scope.

## Running

Production shares loon's GPU with this eval, so concurrency is capped at 2. A run of the
50 cases takes a few minutes.

loon has no host Node. Run inside the dev container, where `/w` is a built copy of the
repo and `/src` is this checkout mounted read-only:

```sh
docker exec swatgpt-fix-eval sh -c 'cd /src && tar cf - eval information librechat.yaml | tar -C /w -xf -'
docker exec -w /w/eval swatgpt-fix-eval npm test
docker exec -w /w/eval swatgpt-fix-eval node run.ts --env-file /src/.env
```

Anywhere with Node 24 and a built repo (`npm run build`), run from `eval/`:

```sh
npm test
npm run typecheck
npm run eval -- --env-file ../.env              # auto mode
npm run eval -- --mode local --no-oracle        # retrieval without the gold chunks
npm run eval -- --only helpdesk-phone,u-turbotax
npm run eval -- --rescore reports/baseline.json # re-score saved answers, no GPU use
npm run eval -- --retrieval-only               # recall@8 and latency of live retrieval, no generation
```

Options: `--questions`, `--kb`, `--config` (librechat.yaml), `--env-file`, `--out`,
`--mode auto|live|local`, `--no-oracle`, `--retrieval-only`, `--concurrency 1|2`, `--only id,id`,
`--base-url` (another OpenAI-compatible endpoint), `--rescore <report.json>` (apply the
current scorer to a saved run without generating anything).

`VLLM_API_KEY` (and the TEI/Qdrant URLs) are read from the environment first, then from
`--env-file`. The key is only sent in the request header and never written to reports.
