#!/bin/sh
# Summarise vLLM Prometheus counters for before/after comparisons of a flag change.
#
#   ops/vllm/metrics.sh SNAPSHOT            totals since the engine started
#   ops/vllm/metrics.sh BASE SNAPSHOT       delta between two snapshots
#
# SNAPSHOT/BASE are files saved from /metrics or http(s) URLs, e.g.
#   curl -s http://loon.sccs.swarthmore.edu:8000/metrics > before.prom
# Counters reset when vLLM restarts, so take BASE after the restart that applies a change.
set -eu

usage() {
  echo "usage: $0 [BASE] SNAPSHOT  (file or http(s) URL)" >&2
  exit 2
}

[ $# -ge 1 ] && [ $# -le 2 ] || usage

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
trap 'exit 130' INT TERM

resolve() {
  case "$1" in
    http://* | https://*)
      out="$tmpdir/$2.prom"
      curl -fsS -m 15 "$1" > "$out"
      echo "$out"
      ;;
    *)
      [ -r "$1" ] || { echo "cannot read $1" >&2; exit 2; }
      [ -s "$1" ] || { echo "empty snapshot $1" >&2; exit 2; }
      echo "$1"
      ;;
  esac
}

if [ $# -eq 2 ]; then
  base=$(resolve "$1" base)
  cur=$(resolve "$2" cur)
  set -- "$base" "$cur"
else
  cur=$(resolve "$1" cur)
  set -- "$cur"
fi

awk -v nfiles="$#" '
FNR == 1 { fileidx++ }
/^#/ || NF < 2 { next }
{
  value = $NF
  if (value !~ /^[-+]?[0-9.]+([eE][-+]?[0-9]+)?$/) next
  series = $0
  sub(/[ \t]+[^ \t]+$/, "", series)
  name = series
  sub(/\{.*/, "", name)
  key = name
  if (name ~ /_bucket$/ && match(series, /le="[^"]*"/)) {
    key = name "|" substr(series, RSTART + 4, RLENGTH - 5)
  } else if (name == "vllm:request_success_total" && match(series, /finished_reason="[^"]*"/)) {
    key = name "|" substr(series, RSTART + 17, RLENGTH - 18)
  }
  gauge = (name == "vllm:kv_cache_usage_perc" || name ~ /^vllm:num_requests_(running|waiting)$/)
  if (nfiles == 2 && fileidx == 1) {
    if (!gauge) m[key] -= value
  } else {
    m[key] += value
  }
}

function ratio(num, den, scale) {
  if (den <= 0) return "n/a"
  return sprintf("%.3f", (num / den) * scale)
}

function quantile(q, metric,    k, n, i, j, les, cnt, le, total, rank, prevle, prevcnt, tmpl, tmpc) {
  n = 0
  for (k in m) {
    if (index(k, metric "_bucket|") != 1) continue
    le = substr(k, length(metric "_bucket|") + 1)
    n++
    les[n] = (le == "+Inf") ? 1e300 : le + 0
    cnt[n] = m[k]
  }
  for (i = 2; i <= n; i++) {
    tmpl = les[i]; tmpc = cnt[i]
    for (j = i - 1; j >= 1 && les[j] > tmpl; j--) { les[j + 1] = les[j]; cnt[j + 1] = cnt[j] }
    les[j + 1] = tmpl; cnt[j + 1] = tmpc
  }
  if (n == 0) return "n/a"
  total = cnt[n]
  if (total <= 0) return "n/a"
  rank = q * total
  prevle = 0; prevcnt = 0
  for (i = 1; i <= n; i++) {
    if (cnt[i] >= rank) {
      if (les[i] == 1e300) return sprintf(">%.3f", prevle)
      if (cnt[i] == prevcnt) return sprintf("%.3f", les[i])
      return sprintf("%.3f", prevle + (les[i] - prevle) * (rank - prevcnt) / (cnt[i] - prevcnt))
    }
    prevle = les[i]; prevcnt = cnt[i]
  }
  return "n/a"
}

END {
  for (k in m) {
    if (nfiles == 2 && m[k] < 0) {
      print "counter " k " went backwards: vLLM restarted between the two snapshots" > "/dev/stderr"
      exit 3
    }
  }
  requests = m["vllm:request_success_total|stop"] + m["vllm:request_success_total|length"] \
    + m["vllm:request_success_total|abort"] + m["vllm:request_success_total|error"] \
    + m["vllm:request_success_total|repetition"]
  printf "requests=%d\n", requests
  printf "finished_stop=%d\n", m["vllm:request_success_total|stop"]
  printf "finished_length=%d\n", m["vllm:request_success_total|length"]
  printf "finished_abort=%d\n", m["vllm:request_success_total|abort"]
  printf "finished_error=%d\n", m["vllm:request_success_total|error"]
  printf "prompt_tokens_mean=%s\n", ratio(m["vllm:request_prompt_tokens_sum"], m["vllm:request_prompt_tokens_count"], 1)
  printf "generation_tokens_mean=%s\n", ratio(m["vllm:request_generation_tokens_sum"], m["vllm:request_generation_tokens_count"], 1)
  printf "max_tokens_param_mean=%s\n", ratio(m["vllm:request_params_max_tokens_sum"], m["vllm:request_params_max_tokens_count"], 1)
  printf "prefix_cache_hit_rate=%s\n", ratio(m["vllm:prefix_cache_hits_total"], m["vllm:prefix_cache_queries_total"], 1)
  printf "spec_acceptance_rate=%s\n", ratio(m["vllm:spec_decode_num_accepted_tokens_total"], m["vllm:spec_decode_num_draft_tokens_total"], 1)
  drafts = m["vllm:spec_decode_num_drafts_total"]
  printf "spec_tokens_per_step=%s\n", (drafts > 0) ? sprintf("%.3f", 1 + m["vllm:spec_decode_num_accepted_tokens_total"] / drafts) : "n/a"
  printf "ttft_mean_s=%s\n", ratio(m["vllm:time_to_first_token_seconds_sum"], m["vllm:time_to_first_token_seconds_count"], 1)
  printf "ttft_p50_s=%s\n", quantile(0.50, "vllm:time_to_first_token_seconds")
  printf "ttft_p95_s=%s\n", quantile(0.95, "vllm:time_to_first_token_seconds")
  printf "step_latency_mean_ms=%s\n", ratio(m["vllm:inter_token_latency_seconds_sum"], m["vllm:inter_token_latency_seconds_count"], 1000)
  printf "tpot_mean_ms=%s\n", ratio(m["vllm:request_time_per_output_token_seconds_sum"], m["vllm:request_time_per_output_token_seconds_count"], 1000)
  printf "queue_time_mean_ms=%s\n", ratio(m["vllm:request_queue_time_seconds_sum"], m["vllm:request_queue_time_seconds_count"], 1000)
  printf "e2e_mean_s=%s\n", ratio(m["vllm:e2e_request_latency_seconds_sum"], m["vllm:e2e_request_latency_seconds_count"], 1)
  printf "preemptions=%d\n", m["vllm:num_preemptions_total"]
}
' "$@"
