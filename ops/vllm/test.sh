#!/bin/sh
# Tests for metrics.sh against a real snapshot taken from loon on 2026-10-08.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
script="$here/metrics.sh"
fixture="$here/testdata/2026-10-08.prom"
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
trap 'exit 130' INT TERM
failures=0

expect() {
  output=$1
  line=$2
  if printf '%s\n' "$output" | grep -qx -- "$line"; then
    return 0
  fi
  echo "FAIL [$3]: expected '$line'" >&2
  printf '%s\n' "$output" | sed 's/^/    /' >&2
  failures=$((failures + 1))
}

totals=$("$script" "$fixture")
expect "$totals" "requests=133" totals
expect "$totals" "finished_stop=133" totals
expect "$totals" "prompt_tokens_mean=7057.744" totals
expect "$totals" "generation_tokens_mean=534.038" totals
expect "$totals" "max_tokens_param_mean=24281.669" totals
expect "$totals" "prefix_cache_hit_rate=0.202" totals
expect "$totals" "spec_acceptance_rate=0.860" totals
expect "$totals" "spec_tokens_per_step=1.860" totals
expect "$totals" "ttft_mean_s=0.407" totals
expect "$totals" "ttft_p50_s=0.354" totals
expect "$totals" "ttft_p95_s=0.924" totals
expect "$totals" "step_latency_mean_ms=14.381" totals
expect "$totals" "tpot_mean_ms=12.548" totals
expect "$totals" "preemptions=0" totals

same=$("$script" "$fixture" "$fixture")
expect "$same" "requests=0" same-snapshot
expect "$same" "prefix_cache_hit_rate=n/a" same-snapshot
expect "$same" "ttft_p95_s=n/a" same-snapshot

cat > "$tmpdir/base.prom" <<'EOF'
# TYPE vllm:prefix_cache_hits_total counter
vllm:prefix_cache_queries_total{engine="0",model_name="m"} 1000.0
vllm:prefix_cache_hits_total{engine="0",model_name="m"} 100.0
vllm:spec_decode_num_drafts_total{engine="0",model_name="m"} 100.0
vllm:spec_decode_num_draft_tokens_total{engine="0",model_name="m"} 200.0
vllm:spec_decode_num_accepted_tokens_total{engine="0",model_name="m"} 150.0
vllm:request_success_total{engine="0",finished_reason="stop",model_name="m"} 10.0
vllm:request_success_total{engine="0",finished_reason="length",model_name="m"} 1.0
vllm:time_to_first_token_seconds_bucket{engine="0",le="0.5",model_name="m"} 10.0
vllm:time_to_first_token_seconds_bucket{engine="0",le="1.0",model_name="m"} 11.0
vllm:time_to_first_token_seconds_bucket{engine="0",le="+Inf",model_name="m"} 11.0
vllm:kv_cache_usage_perc{engine="0",model_name="m"} 0.5
EOF

cat > "$tmpdir/after.prom" <<'EOF'
vllm:prefix_cache_queries_total{engine="0",model_name="m"} 3000.0
vllm:prefix_cache_hits_total{engine="0",model_name="m"} 1700.0
vllm:spec_decode_num_drafts_total{engine="0",model_name="m"} 200.0
vllm:spec_decode_num_draft_tokens_total{engine="0",model_name="m"} 400.0
vllm:spec_decode_num_accepted_tokens_total{engine="0",model_name="m"} 270.0
vllm:request_success_total{engine="0",finished_reason="stop",model_name="m"} 18.0
vllm:request_success_total{engine="0",finished_reason="length",model_name="m"} 3.0
vllm:time_to_first_token_seconds_bucket{engine="0",le="0.5",model_name="m"} 10.0
vllm:time_to_first_token_seconds_bucket{engine="0",le="1.0",model_name="m"} 11.0
vllm:time_to_first_token_seconds_bucket{engine="0",le="+Inf",model_name="m"} 21.0
vllm:kv_cache_usage_perc{engine="0",model_name="m"} 0.25
EOF

delta=$("$script" "$tmpdir/base.prom" "$tmpdir/after.prom")
expect "$delta" "requests=10" delta
expect "$delta" "finished_stop=8" delta
expect "$delta" "finished_length=2" delta
expect "$delta" "prefix_cache_hit_rate=0.800" delta
expect "$delta" "spec_acceptance_rate=0.600" delta
expect "$delta" "spec_tokens_per_step=2.200" delta
expect "$delta" "ttft_p50_s=>1.000" delta-overflow-bucket

if "$script" >/dev/null 2>&1; then
  echo "FAIL [usage]: no arguments should exit non-zero" >&2
  failures=$((failures + 1))
fi

if "$script" "$tmpdir/missing.prom" >/dev/null 2>&1; then
  echo "FAIL [missing]: unreadable snapshot should exit non-zero" >&2
  failures=$((failures + 1))
fi

: > "$tmpdir/empty.prom"
if "$script" "$tmpdir/empty.prom" "$fixture" >/dev/null 2>&1; then
  echo "FAIL [empty]: empty snapshot should exit non-zero" >&2
  failures=$((failures + 1))
fi

if "$script" "$tmpdir/after.prom" "$tmpdir/base.prom" >/dev/null 2>&1; then
  echo "FAIL [restart]: counters going backwards should exit non-zero" >&2
  failures=$((failures + 1))
fi

if [ "$failures" -ne 0 ]; then
  echo "$failures failure(s)" >&2
  exit 1
fi
echo "ok"
