# SwatGPT answer-quality eval

Run 2026-10-08T04:09:46.860Z → 2026-10-08T04:10:27.676Z, retrieval mode **local** (oracle: gold chunks added to the pool), concurrency 2, model `Qwen/Qwen3.6-35B-A3B-FP8` (temperature 0.3, top_p 0.8, top_k 20, max_tokens 1536, enable_thinking false).

> Retrieval: LOCAL approximation — Qdrant was not reachable/selected, so candidates come from BM25 over the information/ markdown (production tokenizer) plus up to 12 chunks of the question's source documents, reranked by the production TEI reranker with the production selection rule and formatContext. No dense channel; chunking approximates the ingest splitter.
> System prompt = librechat.yaml promptPrefix + the KB block production appends; Dash MCP tools, MCP server instructions and the directory block are not included, so live-data questions are out of scope.
> Re-scored 2026-10-08T04:13:47.217Z without new generations.

## Summary

| Metric | Value |
|---|---|
| Cases (errors) | 50 (0) |
| Accuracy, answerable + follow-up (all facts, nothing invented) | 97.5% of 40 |
| Mean fact recall | 98.8% |
| Refusal correctness, unanswerable | 90.0% of 10 |
| False refusals, answerable | 0.0% |
| Answers with an invented URL | 0.0% (0 URLs) |
| Answers with an invented email | 0.0% |
| Answers with an invented phone number | 0.0% |
| Expected source cited | 85.0% |
| Answerable cases citing `[n]` entry numbers | 15.0% |
| Cited URL among retrieved sources (answers citing any URL) | 92.9% |
| Expected source in retrieved context | 100.0% |
| Latency p50 / p95 (final turn) | 1137 ms / 2704 ms |
| TTFT p50 / p95 | 347 ms / 454 ms |
| Retrieval p50 / p95 | 39 ms / 53 ms |
| Completion tokens p50 / p95 | 107 / 329 |

## 5 worst cases

### 1. `u-spotify` (unanswerable, fail)

- answered instead of saying it does not know

Expected sources: none (should say it does not know)

**User:** Does ITS offer free Spotify Premium to students?

Retrieval: hit, 8 entries, 37 ms

**Answer:**

```text
No, ITS does not offer free Spotify Premium to students.

While ITS provides free access to other services like YouTube Premium (via a Google Workspace license that removes ads, though it doesn't cover the full subscription cost for Spotify) and iClicker software, Spotify Premium is not included in the College's institutional licenses. Students interested in Spotify Premium would need to purchase a personal subscription.

For more information on digital resources provided by ITS, you can visit the [ITS Knowledge Base](https://kb.swarthmore.edu/).
```

### 2. `firebird-account` (answerable, fail)

- missing fact: ed25519

Expected sources: https://kb.swarthmore.edu/wiki/Requesting_an_Account_on_Firebird, https://kb.swarthmore.edu/wiki/Firebird_Computing_Cluster

**User:** What do I need to do to get an account on Firebird?

Retrieval: hit, 8 entries, 40 ms

**Answer:**

```text
To get an account on Firebird, you need to complete a two-step process:

1.  **Create an SSH key:** You can find instructions on how to do this [here](https://kb.swarthmore.edu/wiki/Create_an_SSH_Key).
2.  **Request an account:** Complete the request form [here](https://support.swarthmore.edu/support/catalog/items/225).

Once your account is created, you can access Firebird via terminal or Open OnDemand. For more details, see the [Firebird Computing Cluster](https://kb.swarthmore.edu/wiki/Firebird_Computing_Cluster) page.
```

### 3. `student-no-username` (answerable, pass)

- did not link the expected source
- cites context entries as [n] instead of URLs

Expected sources: https://kb.swarthmore.edu/wiki/Getting_an_Account, https://kb.swarthmore.edu/wiki/Resetting_Passwords

**User:** I'm a new student and never received a Swarthmore username. Who should I contact?

Retrieval: hit, 8 entries, 37 ms

**Answer:**

```text
If you are a new student and have not received your Swarthmore username, you should contact the **Registrar's Office** at **registrar@swarthmore.edu** [1][2][3].

Additionally, if you are referring to the new student forms email sent on May 15, 2025, that message indicates your username is listed at the bottom of the message and your Student ID number will be provided in a separate email [7][8]. If you cannot locate these, you can also email the College’s Helpdesk at **support@swarthmore.edu** or **new_student_question@swarthmore.edu** for general questions [8].
```

### 4. `spring-classes-begin` (answerable, pass)

- did not link the expected source
- cites context entries as [n] instead of URLs

Expected sources: https://www.swarthmore.edu/academics/2027-spring-semester

**User:** When do classes begin for the spring 2027 semester?

Retrieval: hit, 8 entries, 45 ms

**Answer:**

```text
Classes for the Spring 2027 semester begin on **January 19, 2027** [1][2][5].
```

### 5. `tri-co` (answerable, pass)

- did not link the expected source
- cites context entries as [n] instead of URLs

Expected sources: https://www.swarthmore.edu/academics/tri-college-consortium

**User:** Which colleges are in the Tri-College Consortium with Swarthmore?

Retrieval: hit, 8 entries, 45 ms

**Answer:**

```text
The Tri-College Consortium (Tri-Co) includes **Bryn Mawr College** and **Haverford College** alongside Swarthmore College [1][2].

Additionally, Swarthmore students have cross-registration opportunities with the **University of Pennsylvania** [1][2].
```

## All cases

| Case | Kind | Result | Facts | Refused | Invented URLs | Latency |
|---|---|---|---|---|---|---|
| `helpdesk-phone` | answerable | pass | 1/1 | no | 0 | 1078 ms |
| `wifi-networks` | answerable | pass | 3/3 | no | 0 | 1059 ms |
| `password-reset-site` | answerable | pass | 1/1 | no | 0 | 1861 ms |
| `student-no-username` | answerable | pass | 1/1 | no | 0 | 1420 ms |
| `switch-wifi` | answerable | pass | 2/2 | no | 0 | 2989 ms |
| `vpn-session-limit` | answerable | pass | 1/1 | no | 0 | 993 ms |
| `vpn-client` | answerable | pass | 1/1 | no | 0 | 2754 ms |
| `student-print-cost` | answerable | pass | 1/1 | no | 0 | 2027 ms |
| `print-queue-name` | answerable | pass | 1/1 | no | 0 | 872 ms |
| `print-release-expiry` | answerable | pass | 1/1 | no | 0 | 1022 ms |
| `poster-size` | answerable | pass | 1/1 | no | 0 | 1304 ms |
| `poster-party` | answerable | pass | 2/2 | no | 0 | 1802 ms |
| `firebird-nodes` | answerable | pass | 1/1 | no | 0 | 653 ms |
| `firebird-account` | answerable | fail | 1/2 | no | 0 | 1436 ms |
| `moodle-course-retention` | answerable | pass | 1/1 | no | 0 | 1003 ms |
| `moodle-logs` | answerable | pass | 1/1 | no | 0 | 835 ms |
| `phishing-report` | answerable | pass | 1/1 | no | 0 | 1256 ms |
| `personal-laptop-repair` | answerable | pass | 1/1 | no | 0 | 1345 ms |
| `dell-discount` | answerable | pass | 1/1 | no | 0 | 1512 ms |
| `matlab-online` | answerable | pass | 1/1 | no | 0 | 949 ms |
| `linkedin-learning` | answerable | pass | 1/1 | no | 0 | 2119 ms |
| `make-me-admin` | answerable | pass | 1/1 | no | 0 | 1179 ms |
| `zoom-participants` | answerable | pass | 1/1 | no | 0 | 641 ms |
| `gemini-retention` | answerable | pass | 1/1 | no | 0 | 1572 ms |
| `no-ethernet-dorms` | answerable | pass | 3/3 | no | 0 | 747 ms |
| `dash-feedback` | answerable | pass | 1/1 | no | 0 | 509 ms |
| `knowbe4-login` | answerable | pass | 1/1 | no | 0 | 2704 ms |
| `google-storage` | answerable | pass | 1/1 | no | 0 | 1198 ms |
| `spring-classes-begin` | answerable | pass | 1/1 | no | 0 | 599 ms |
| `spring-drop-add` | answerable | pass | 1/1 | no | 0 | 1371 ms |
| `individualized-major` | answerable | pass | 2/2 | no | 0 | 2431 ms |
| `mccabe-mile` | answerable | pass | 1/1 | no | 0 | 509 ms |
| `troy-credits` | answerable | pass | 1/1 | no | 0 | 791 ms |
| `account-extension-research` | answerable | pass | 1/1 | no | 0 | 1714 ms |
| `tri-co` | answerable | pass | 2/2 | no | 0 | 755 ms |
| `u-firebird-cost` | unanswerable | pass | 0/0 | yes | 0 | 1137 ms |
| `u-its-budget` | unanswerable | pass | 0/0 | yes | 0 | 683 ms |
| `u-turbotax` | unanswerable | pass | 0/0 | yes | 0 | 792 ms |
| `u-windows12` | unanswerable | pass | 0/0 | yes | 0 | 1169 ms |
| `u-mccabe-aps` | unanswerable | pass | 0/0 | yes | 0 | 656 ms |
| `u-mccabe-mile-winner` | unanswerable | pass | 0/0 | yes | 0 | 1218 ms |
| `u-firebird-pager` | unanswerable | pass | 0/0 | yes | 0 | 1593 ms |
| `u-zoom-license-cost` | unanswerable | pass | 0/0 | yes | 0 | 601 ms |
| `u-spotify` | unanswerable | fail | 0/0 | no | 0 | 1283 ms |
| `u-helpdesk-tickets` | unanswerable | pass | 0/0 | yes | 0 | 1016 ms |
| `f-helpdesk-friday` | followup | pass | 2/2 | no | 0 | 731 ms |
| `f-swatguest-duration` | followup | pass | 1/1 | no | 0 | 755 ms |
| `f-firebird-gpus` | followup | pass | 1/1 | no | 0 | 2038 ms |
| `f-moodle-backups` | followup | pass | 1/1 | no | 0 | 1068 ms |
| `f-panopto-deletion` | followup | pass | 1/1 | no | 0 | 1484 ms |
