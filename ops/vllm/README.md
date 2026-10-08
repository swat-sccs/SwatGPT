# vLLM serving review (loon)

This is a read-only review of how `Qwen/Qwen3.6-35B-A3B-FP8` is served on `loon`, followed by a proposed set of flag changes. Nothing here has been applied.

The service is the swarm stack `swatgpt_vllm`, defined in `/srv/swatgpt_model_hosting/compose.yml` on **gull** (root-owned; loon is only a swarm worker). Any change means editing that file and running `docker stack deploy` on gull, which needs a planned, approved change window. Each restart takes about **12 minutes**: 5 minutes of weight load, about 4 minutes of compile, profiling and warmup, and model download checks. SwatGPT has no inference for that whole time.

Evidence was collected on 2026-10-08 from `docker inspect`, `docker logs` (engine started 2026-09-18 19:36), `nvidia-smi`, the live `/metrics` endpoint, the model's own `config.json`, `generation_config.json` and `chat_template.jinja`, and `vllm serve --help=all` from the running image.

## 1. What runs today

| | |
|---|---|
| Image | `vllm/vllm-openai:latest`. The running image id `61fc8a896b0a` is **v0.28.0** (`VLLM_IMAGE_TAG`, build `2cf0a691`) |
| GPU | RTX PRO 6000 Blackwell, 97,887 MiB. vLLM uses 88,692 MiB; `tei-embeddings` and `tei-reranker` use 916 MiB each; about 7.2 GiB is free |
| Model | Hybrid MoE: 40 layers, of which only 10 are full attention (`full_attention_interval: 4`, 2 KV heads × 256); the other 30 are Gated-DeltaNet (Mamba-style state). 256 experts, 8 active. Ships 1 MTP layer |
| Volumes | `swatgpt_vllm_huggingface_cache:/root/.cache/huggingface`, `/dev/shm` tmpfs 16 GiB. **`/root/.cache/vllm` and `/root/.triton` are not persisted** |
| Logging | `json-file`, no `max-size` (`/etc/docker/daemon.json` sets no default either). No healthcheck |

### Exact current command (container `Cmd`, via `/bin/sh -ec`)

```sh
exec vllm serve Qwen/Qwen3.6-35B-A3B-FP8 \
  --max-model-len 32768 \
  --max-num-seqs 96 \
  --gpu-memory-utilization 0.9 \
  --reasoning-parser qwen3 \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_coder \
  --api-key "$(cat /run/secrets/vllm_api_key)" \
  --host 0.0.0.0 \
  --port 8000 \
  --speculative-config '{"method":"mtp","num_speculative_tokens":1}'
```

### Effective settings resolved at startup (from logs and `vllm:cache_config_info`)

| Setting | Value | Note |
|---|---|---|
| Prefix caching | **on** (default) | `mamba_cache_mode=align`, `prefix_caching_hash_algo=sha256` |
| Attention block size | **1056 tokens** | Forced up so that an attention page is at least as large as a Mamba page. Prefix-cache hits only happen in whole 1056-token blocks |
| Chunked prefill | on, `max_num_batched_tokens=8192` | |
| KV cache | 47.52 GiB, **1,713,526 tokens**, dtype `auto` (bf16) | 52× concurrency at 32k |
| CUDA graphs | PIECEWISE up to 384, FULL decode up to 192 (= 96 × (1+1)) | 0.72 GiB |
| Sampling defaults | Taken from the model's `generation_config.json`: `temperature 1.0, top_p 0.95, top_k 20` | These apply to any request that omits a parameter |
| MoE GEMM | DeepGEMM for MoE; DeepGEMM for dense was auto-disabled on Blackwell for this model (accuracy) | Leave as is |
| Multimodal | Vision encoder loaded, 16,384-token encoder cache, about 24 s of multimodal warmup | SwatGPT never sends images (`agents.capabilities: ['tools']`) |

### Observed workload (`/metrics` since 2026-09-18; reproduce with `ops/vllm/metrics.sh`)

```
requests=133              finished_length=0   preemptions=0
prompt_tokens_mean=7058   generation_tokens_mean=534
max_tokens_param_mean=24282          <- almost no client sends max_tokens
prefix_cache_hit_rate=0.202
spec_acceptance_rate=0.860  spec_tokens_per_step=1.860
ttft_mean_s=0.407  ttft_p50_s=0.354  ttft_p95_s=0.924
step_latency_mean_ms=14.4  tpot_mean_ms=12.5  queue_time_mean_ms=0.1
```

What these numbers say:

- **Load is tiny**: queue time is about 0 and nothing is preempted. Latency is set by the single-stream decode speed and by prefill, not by batching, so `max-num-seqs` and the KV size are not the bottleneck.
- **MTP is very effective.** At k=1 the draft is accepted 86% of the time. That is strong evidence that k=2 will pay off.
- **Prefix caching barely helps (20%)**, even though every request starts with the same long system prompt and tool list. The reason is prompt order in the app, not a vLLM flag (see §4).
- **Almost no request sets `max_tokens`.** When a request omits it, vLLM uses `32768 − prompt`; with a mean prompt of 7,058 that would average 25,710. The observed mean is 24,282, so only a handful of requests (about 6%, plausibly title generation) send a limit. The chat preset's `max_tokens: 1536` does not reach vLLM, so a runaway chat generation can run for about 25k tokens.

## 2. Proposed command

```sh
export VLLM_API_KEY="$(cat /run/secrets/vllm_api_key)"
exec vllm serve Qwen/Qwen3.6-35B-A3B-FP8 \
  --max-model-len 32768 \
  --max-num-seqs 96 \
  --max-num-batched-tokens 8192 \
  --enable-prefix-caching \
  --gpu-memory-utilization 0.85 \
  --kv-cache-dtype auto \
  --speculative-config '{"method":"mtp","num_speculative_tokens":2}' \
  --reasoning-parser qwen3 \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_coder \
  --default-chat-template-kwargs '{"enable_thinking": false}' \
  --override-generation-config '{"temperature": 0.7, "top_p": 0.8, "top_k": 20, "max_new_tokens": 4096}' \
  --enable-prompt-tokens-details \
  --language-model-only \
  --safetensors-load-strategy prefetch \
  --disable-fastapi-docs \
  --disable-access-log-for-endpoints /metrics,/health \
  --host 0.0.0.0 \
  --port 8000
```

Compose-level changes, to merge into the `vllm` service in gull's `/srv/swatgpt_model_hosting/compose.yml`:

```yaml
    image: vllm/vllm-openai:v0.28.0          # was :latest
    volumes:
      # keep every existing entry (huggingface_cache and the 16 GiB /dev/shm tmpfs); add only these two
      - vllm_cache:/root/.cache/vllm         # torch.compile, FlashInfer autotune, DeepGEMM
      - triton_cache:/root/.triton           # Triton JIT kernels
    logging:
      driver: json-file
      options: { max-size: "50m", max-file: "5" }
    healthcheck:
      test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5)"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 25m
# top level: add to the existing volumes map
volumes:
  vllm_cache:
  triton_cache:
```

Every flag above was checked against `vllm serve --help=all` from the running v0.28.0 image.

## 3. Change-by-change

Restart cost applies to every row: about 12 minutes of no inference, fewer once the cache volumes from row C1 exist.

### Performance

| # | Change | Expected effect | Risk | Rollback |
|---|---|---|---|---|
| P1 | `num_speculative_tokens` 1 → **2** | Position-0 acceptance is already 0.86. If position-1 acceptance is around 0.65–0.75, tokens per step go from 1.86 to about 2.4–2.6, while step latency rises about 5–10%. That gives roughly **15–25% lower TPOT** (about 12.5 → 10 ms/token) at the current low concurrency. CUDA graphs are re-sized automatically (FULL largest should become 288) | Gains shrink, and can turn into a small throughput loss, above about 30–40 concurrent decodes, because rejected drafts waste compute. Startup is slightly longer and graph memory slightly larger. `min_p` and `logit_bias` still do not work with spec decode (already true today; the app sends neither) | Set back to `1`. Try `3` only if `spec_tokens_per_step` at k=2 is above 2.3 |
| P2 | `--gpu-memory-utilization` 0.9 → **0.85** | KV drops from about 47.5 to about 42 GiB, which is still about 1.5M tokens (46× at 32k, or more than 96 seqs × 16k). It frees about 4.7 GiB for TEI batch spikes and keeps loon from running at 92% VRAM. No latency change at the current load | A smaller pool evicts old prefix-cache blocks sooner. That does not matter at 1.5M tokens and this traffic. Watch `vllm:kv_cache_usage_perc` | Set back to `0.9` |
| P3 | Pin `--max-num-batched-tokens 8192`, `--enable-prefix-caching`, `--kv-cache-dtype auto` | No change today: these are the values already in effect. Writing them down protects against defaults changing across versions | None | Remove the flags |
| P4 | `--language-model-only` | Skips the vision encoder cache (16k tokens) and about 24 s of multimodal warmup per restart. Check in the startup log whether vision-tower weights are also skipped (`Model loading took … GiB`) | Image or video inputs get a 400. SwatGPT does not send any; re-check if file or vision uploads are ever enabled in `librechat.yaml` | Remove the flag |
| P5 | `--safetensors-load-strategy prefetch` | The weight load took **306 s** for 34.9 GiB (about 115 MB/s via mmap on EXT4). Sequential prefetch into page cache (115 GiB RAM available) should cut restart outages noticeably. Measure with `Loading weights took` | Uses about 35 GiB of page cache temporarily | Remove the flag |
| P6 | Volumes for `/root/.cache/vllm` and `/root/.triton` (compose) | Today every task recreate recompiles (about 48 s of torch.compile plus autotune). The log also shows Triton JIT compiling **during the first live requests** (`precopy_mamba_align_fused_kernel`, `eagle_prepare_inputs_padded_kernel`, `_count_expert_num_tokens`), which causes latency spikes on the first user messages after a restart. Persisting both caches removes that cost after the first run | The cache key covers the vLLM version and config, so a stale cache is ignored rather than misused | Remove the volume mounts |
| — | **Not proposed: `--kv-cache-dtype fp8`** | KV is not the bottleneck (52× headroom, about 0% usage). Only 10 of 40 layers have a KV cache at all, so decode bandwidth is dominated by expert weights | The checkpoint ships no calibrated KV scales, so the default scale of 1.0 costs accuracy. On this GPU the FLASH_ATTN (FA2) backend has no fp8 KV, which would force a backend switch | n/a |
| — | **Not proposed: changing `--max-num-seqs`** | 96 is not KV-limited (about 225 average-size requests fit), and queue time is about 0 | Lowering it only matters if spec decode at high batch hurts; revisit with P1 data | n/a |
| — | **Not proposed: `--prefix-caching-hash-algo xxhash`** | Hashing time is negligible here | Non-cryptographic hash across users' prompts | n/a |

### Defaults and correctness

| # | Change | Expected effect | Risk | Rollback |
|---|---|---|---|---|
| G1 | `--default-chat-template-kwargs '{"enable_thinking": false}'` | Every client (LibreChat chat, title generation, eval scripts, `curl`) gets non-thinking mode unless it asks otherwise. That matches what `librechat.yaml` already forces through `addParams`, and avoids surprise multi-thousand-token `<think>` blocks from any caller that forgets to send it | Callers that want thinking must now send `chat_template_kwargs: {enable_thinking: true}` explicitly. Keep `--reasoning-parser qwen3` so `reasoning` is still split out when thinking is on | Remove the flag |
| G2 | `--override-generation-config '{"temperature":0.7,"top_p":0.8,"top_k":20,"max_new_tokens":4096}'` | Server defaults become Qwen's recommended **non-thinking** sampling instead of the checkpoint's thinking-mode `temperature 1.0 / top_p 0.95`. These only apply to requests that omit a parameter; the SwatGPT preset still sends `0.3 / 0.8 / 20`. `max_new_tokens` becomes a **server-wide cap** (per `--help`), which bounds runaway generations at 4096 tokens even though the app sends no `max_tokens` today (mean generation is 534, and 0 requests hit a length stop) | If thinking is turned back on, raise the cap (for example to 16384) or reasoning will be cut short with `finish_reason=length`. Verify after restart that a request with `max_tokens: 10000` comes back capped | Remove the flag (back to the checkpoint's `generation_config.json`) |
| G3 | `--enable-prompt-tokens-details` | Responses include `usage.prompt_tokens_details.cached_tokens`, so the usage ledger and eval can measure prefix-cache hits per request | Slightly larger response payloads | Remove the flag |

### Security and operations

| # | Change | Why | Risk | Rollback |
|---|---|---|---|---|
| S1 | Pass the key through `VLLM_API_KEY` (exported inside `sh -c`) instead of `--api-key "$(cat …)"` | vLLM prints every non-default CLI arg at startup (`non-default args: {…}`), so a key passed with `--api-key` ends up in the container log, readable by anyone with Docker or Portainer log access. An env var exported inside the shell is not logged and does not appear in `docker inspect` | None functionally. Afterwards **rotate** the key (swarm secret on gull plus `VLLM_API_KEY` in eagle's `.env`), because earlier logs may already hold it | Restore `--api-key "$(cat /run/secrets/vllm_api_key)"` |
| S2 | Restrict who can reach `loon:8000/8001/8002` (firewall or `DOCKER-USER` to eagle and gull only; for 8000 publish in `mode: host` so source IPs are visible) | Per vLLM's own `--help`, `--api-key` only guards the `/v1`, `/v2` and `/inference` prefixes; every other route is outside it, so the key alone is not an access control. TEI has no auth option in use. Network restriction is the real boundary. Prometheus on gull needs to keep access to `/metrics` | A wrong rule cuts eagle off from inference or retrieval. Test from eagle and gull before saving the rules | Delete the rules |
| S3 | `--disable-fastapi-docs` | Removes `/docs`, `/redoc` and `/openapi.json` from the exposed port | None | Remove the flag |
| S4 | Pin `vllm/vllm-openai:v0.28.0` (ideally by digest) | `:latest` means any task reschedule or node change can silently pull a newer vLLM with different defaults, kernels or parser behaviour, plus a cold 12-minute start | Upgrades become deliberate | Set the tag back to `:latest` |
| S5 | Log rotation (`max-size: 50m`, `max-file: 5`) plus `--disable-access-log-for-endpoints /metrics,/health` | The log grows forever: a Prometheus scrape line every 15 s, plus scanner noise, on a root disk at 79%. Dropping scrape lines keeps the real request log readable | Older logs roll off | Remove the options |
| S6 | Healthcheck with `start_period: 25m` | Swarm currently cannot tell a wedged engine from a healthy one | A too-tight healthcheck would loop 12-minute restarts. `start_period` and `retries` are deliberately generous | Remove the healthcheck |

## 4. App-side changes that matter more than any flag (not in this area; recorded for the owners)

The 20% prefix-cache hit rate comes from prompt order. The Qwen template renders `<tools>…</tools>` first, then the system message. LibreChat's system message is the preset `promptPrefix`, which contains `Current date and time: {{current_datetime}}` **about one third of the way in**, followed by the per-message KB context, directory block and MCP instructions (`api/server/controllers/agents/client.js` `sharedRunContextParts`, appended to the system message). As a result:

1. Only the tools block plus the first part of the prompt, about 1.4k tokens (one 1056-token block), is ever reusable across users.
2. Because the KB context changes every turn and sits in the **system** message, **no earlier turn of a conversation is reusable either**: every follow-up re-prefills the whole history.

Proposed (owners: `librechat.yaml` / rag / agents):

- Move `Current date and time: {{current_datetime}}` and the three sentences after it to the **end** of `promptPrefix`, or better, into the per-turn context with the KB block.
- Put the per-turn KB, directory and datetime context into the **latest user message** (or a message right before it) instead of the system message. The system message plus tools then stays byte-identical across all users, and each conversation's history stays a stable prefix.

Expected effect: the hit rate rises from about 20% to about 60–80% for multi-turn chats, which cuts most of the prefill work. Mean TTFT is 0.41 s today; the 7k-token average prompt would mostly come from cache. Measure with `prefix_cache_hit_rate` and `ttft_p95_s`.

Other app-side items:

- `max_tokens: 1536` in the `swatgpt` model spec preset never reaches vLLM (the mean requested `max_tokens` is 24,282). Find out why the preset value is dropped for the custom endpoint, or set it under `addParams`. G2's server cap is the backstop.
- The log shows **47 HTTP 400 responses on `/v1/chat/completions`** (against 135 successes), clustered on about 09-23, 09-24 and 09-27, with none since. vLLM does not log the reason at INFO. Check LibreChat's logs on eagle for those dates to rule out a recurring request-shape bug (tool schema, context length).

## 5. Rollout and rollback

Do this on **gull**, inside an approved change window. Each step is one restart of about 12 minutes.

1. Baseline: counters are totals since the engine started, so `ops/vllm/metrics.sh http://loon.sccs.swarthmore.edu:8000/metrics` just before the change window summarises the current config. Save that output.
2. Back up: `sudo cp /srv/swatgpt_model_hosting/compose.yml /srv/swatgpt_model_hosting/compose.yml.bak-$(date +%F)`.
3. **Restart 1 (low risk):** S1, S3, S4, S5, S6, P2, P3, P4, P5, P6, G1, G2, G3, keeping `num_speculative_tokens: 1`. Then `sudo docker stack deploy -c /srv/swatgpt_model_hosting/compose.yml swatgpt_vllm`.
4. Verify:
   - The startup log has no `api_key` value.
   - `Loading weights took` is lower than 306 s.
   - `/v1/models` returns 200 with the key and 401 without it.
   - A chat from SwatGPT works, and `reasoning` is still split out when `enable_thinking: true` is sent.
   - `nvidia-smi` shows about 4–5 GiB more free.
5. Rotate the API key (swarm secret plus eagle `.env`, then restart eagle's api). Apply S2's firewall rules.
6. **Restart 2 (A/B):** P1 (k=2) alone, after a week of baseline traffic on restart 1. Compare `spec_tokens_per_step`, `tpot_mean_ms` and `ttft_p95_s` from `metrics.sh` for the same length of window.
7. **Rollback, any step:** `sudo cp compose.yml.bak-<date> compose.yml && sudo docker stack deploy -c /srv/swatgpt_model_hosting/compose.yml swatgpt_vllm`, or revert a single flag using the Rollback column. A rollback is also a restart of about 12 minutes.

## 6. Measuring

`ops/vllm/metrics.sh` summarises one snapshot (totals since the engine started) or the delta between two, from files or URLs:

```sh
ops/vllm/metrics.sh http://loon.sccs.swarthmore.edu:8000/metrics
ops/vllm/metrics.sh before.prom after.prom
```

It refuses an empty snapshot and a pair whose counters went backwards (vLLM restarted between them). `ops/vllm/test.sh` checks it against `testdata/2026-10-08.prom`, a trimmed real snapshot. It runs under bash, dash and busybox `sh`/`awk`, and needs no Node.
