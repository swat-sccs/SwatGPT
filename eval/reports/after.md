# SwatGPT answer-quality eval

Run 2026-10-08T06:01:09.321Z → 2026-10-08T06:01:48.912Z, retrieval mode **local** (oracle: gold chunks added to the pool), concurrency 2, model `Qwen/Qwen3.6-35B-A3B-FP8` (temperature 0.3, top_p 0.8, top_k 20, max_tokens 1536, enable_thinking false).

> Retrieval: LOCAL approximation — Qdrant was not reachable/selected, so candidates come from BM25 over the information/ markdown (production tokenizer) plus up to 12 chunks of the question's source documents, reranked by the production TEI reranker with the production selection rule and formatContext. No dense channel; chunking approximates the ingest splitter.
> System prompt = librechat.yaml promptPrefix (stable part, then the date tail) + the KB block production appends; Dash MCP tools, MCP server instructions and the directory block are not included, so live-data questions are out of scope.

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
| Expected source cited | 97.5% |
| Answerable cases citing `[n]` entry numbers | 0.0% |
| Cited URL among retrieved sources (answers citing any URL) | 89.1% |
| Expected source in retrieved context | 100.0% |
| Latency p50 / p95 (final turn) | 1092 ms / 2402 ms |
| TTFT p50 / p95 | 341 ms / 452 ms |
| Retrieval p50 / p95 | 38 ms / 52 ms |
| Completion tokens p50 / p95 | 101 / 329 |

## 5 worst cases

### 1. `u-spotify` (unanswerable, fail)

- answered instead of saying it does not know

Expected sources: none (should say it does not know)

**User:** Does ITS offer free Spotify Premium to students?

Retrieval: hit, 8 entries, 35 ms

**Answer:**

```text
No, ITS does not offer free Spotify Premium to students.

While ITS provides free access to **YouTube Premium** for Swarthmore users (which removes ads from YouTube videos), this benefit is specific to YouTube and does not extend to Spotify. Spotify Premium is a separate subscription service that students must purchase individually if they wish to use it.

For more information on digital subscriptions or media resources, you can contact ITS directly or visit the [ITS Help Desk](https://kb.swarthmore.edu).
```

### 2. `firebird-account` (answerable, fail)

- missing fact: ed25519
- did not link the expected source

Expected sources: https://kb.swarthmore.edu/wiki/Requesting_an_Account_on_Firebird, https://kb.swarthmore.edu/wiki/Firebird_Computing_Cluster

**User:** What do I need to do to get an account on Firebird?

Retrieval: hit, 8 entries, 38 ms

**Answer:**

```text
To get an account on Firebird, you need to complete a two-step process:

1.  **Create an SSH key:** You can find instructions on how to do this [here](https://kb.swarthmore.edu/wiki/Create_an_SSH_Key "Create an SSH Key").
2.  **Request an account:** Once you have your key, [complete this form](https://support.swarthmore.edu/support/catalog/items/225) to submit your request.

For more details on accessing the cluster once your account is approved, you can check the [Logging into Firebird](https://kb.swarthmore.edu/wiki/Logging_into_Firebird) page.
```

### 3. `helpdesk-phone` (answerable, pass)


Expected sources: https://kb.swarthmore.edu/wiki/Help_Desk_Hours_of_Operation

**User:** What is the ITS Help Desk phone number?

Retrieval: hit, 8 entries, 56 ms

**Answer:**

```text
The ITS Help Desk phone number is **x4357 (HELP)** or **610-328-8513**.

For phone support specifically, you can also reach them at **x8513** or **610-328-8513**.

Source: [Preparing For Graduation — Contact the Help Desk](https://kb.swarthmore.edu/wiki/Preparing_For_Graduation), [Help Desk Hours of Operation — Phone Support](https://kb.swarthmore.edu/wiki/Help_Desk_Hours_of_Operation)
```

### 4. `wifi-networks` (answerable, pass)


Expected sources: https://kb.swarthmore.edu/wiki/Wireless

**User:** What Wi-Fi networks does Swarthmore have?

Retrieval: hit, 8 entries, 52 ms

**Answer:**

```text
Swarthmore has three Wi-Fi networks:

*   **eduroam**: For users from Swarthmore, Haverford, Bryn Mawr, and other eduroam institutions.
*   **SwatGuest**: For campus guests.
*   **SwatDevice**: For devices such as gaming systems and e-readers.

For connection instructions, you can visit the [Wireless](https://kb.swarthmore.edu/wiki/Wireless) page.
```

### 5. `password-reset-site` (answerable, pass)


Expected sources: https://kb.swarthmore.edu/wiki/Resetting_Passwords, https://kb.swarthmore.edu/wiki/Getting_an_Account, https://kb.swarthmore.edu/wiki/Resetting_Email_and_Network_Passwords

**User:** Where do I go to change my Swarthmore password?

Retrieval: hit, 8 entries, 45 ms

**Answer:**

```text
To set or change your Swarthmore password, please visit [password.swarthmore.edu](https://password.swarthmore.edu).

For step-by-step instructions, you can refer to the [password change instructions](https://kb.swarthmore.edu/wiki/Resetting_Email_and_Network_Passwords).

*   **Students:** You will need your username and student ID number. If you haven't received these, contact the Registrar's Office at registrar@swarthmore.edu.
*   **Faculty & Staff:** You will need your username and employee ID number. If you are new, your hiring manager should have provided instructions.

Your password expires every 180 days and must be reset.
```

## All cases

| Case | Kind | Result | Facts | Refused | Invented URLs | Latency |
|---|---|---|---|---|---|---|
| `helpdesk-phone` | answerable | pass | 1/1 | no | 0 | 1407 ms |
| `wifi-networks` | answerable | pass | 3/3 | no | 0 | 986 ms |
| `password-reset-site` | answerable | pass | 1/1 | no | 0 | 1620 ms |
| `student-no-username` | answerable | pass | 1/1 | no | 0 | 1636 ms |
| `switch-wifi` | answerable | pass | 2/2 | no | 0 | 2817 ms |
| `vpn-session-limit` | answerable | pass | 1/1 | no | 0 | 961 ms |
| `vpn-client` | answerable | pass | 1/1 | no | 0 | 2402 ms |
| `student-print-cost` | answerable | pass | 1/1 | no | 0 | 2442 ms |
| `print-queue-name` | answerable | pass | 1/1 | no | 0 | 822 ms |
| `print-release-expiry` | answerable | pass | 1/1 | no | 0 | 1050 ms |
| `poster-size` | answerable | pass | 1/1 | no | 0 | 1194 ms |
| `poster-party` | answerable | pass | 2/2 | no | 0 | 1908 ms |
| `firebird-nodes` | answerable | pass | 1/1 | no | 0 | 611 ms |
| `firebird-account` | answerable | fail | 1/2 | no | 0 | 1445 ms |
| `moodle-course-retention` | answerable | pass | 1/1 | no | 0 | 1107 ms |
| `moodle-logs` | answerable | pass | 1/1 | no | 0 | 775 ms |
| `phishing-report` | answerable | pass | 1/1 | no | 0 | 1269 ms |
| `personal-laptop-repair` | answerable | pass | 1/1 | no | 0 | 1421 ms |
| `dell-discount` | answerable | pass | 1/1 | no | 0 | 1412 ms |
| `matlab-online` | answerable | pass | 1/1 | no | 0 | 1042 ms |
| `linkedin-learning` | answerable | pass | 1/1 | no | 0 | 2384 ms |
| `make-me-admin` | answerable | pass | 1/1 | no | 0 | 859 ms |
| `zoom-participants` | answerable | pass | 1/1 | no | 0 | 614 ms |
| `gemini-retention` | answerable | pass | 1/1 | no | 0 | 1092 ms |
| `no-ethernet-dorms` | answerable | pass | 3/3 | no | 0 | 881 ms |
| `dash-feedback` | answerable | pass | 1/1 | no | 0 | 761 ms |
| `knowbe4-login` | answerable | pass | 1/1 | no | 0 | 2109 ms |
| `google-storage` | answerable | pass | 1/1 | no | 0 | 866 ms |
| `spring-classes-begin` | answerable | pass | 1/1 | no | 0 | 895 ms |
| `spring-drop-add` | answerable | pass | 1/1 | no | 0 | 1450 ms |
| `individualized-major` | answerable | pass | 2/2 | no | 0 | 1283 ms |
| `mccabe-mile` | answerable | pass | 1/1 | no | 0 | 693 ms |
| `troy-credits` | answerable | pass | 1/1 | no | 0 | 1005 ms |
| `account-extension-research` | answerable | pass | 1/1 | no | 0 | 1034 ms |
| `tri-co` | answerable | pass | 2/2 | no | 0 | 1156 ms |
| `u-firebird-cost` | unanswerable | pass | 0/0 | yes | 0 | 1148 ms |
| `u-its-budget` | unanswerable | pass | 0/0 | yes | 0 | 665 ms |
| `u-turbotax` | unanswerable | pass | 0/0 | yes | 0 | 1468 ms |
| `u-windows12` | unanswerable | pass | 0/0 | yes | 0 | 1086 ms |
| `u-mccabe-aps` | unanswerable | pass | 0/0 | yes | 0 | 741 ms |
| `u-mccabe-mile-winner` | unanswerable | pass | 0/0 | yes | 0 | 1154 ms |
| `u-firebird-pager` | unanswerable | pass | 0/0 | yes | 0 | 1112 ms |
| `u-zoom-license-cost` | unanswerable | pass | 0/0 | yes | 0 | 763 ms |
| `u-spotify` | unanswerable | fail | 0/0 | no | 0 | 1182 ms |
| `u-helpdesk-tickets` | unanswerable | pass | 0/0 | yes | 0 | 1068 ms |
| `f-helpdesk-friday` | followup | pass | 2/2 | no | 0 | 730 ms |
| `f-swatguest-duration` | followup | pass | 1/1 | no | 0 | 739 ms |
| `f-firebird-gpus` | followup | pass | 1/1 | no | 0 | 2018 ms |
| `f-moodle-backups` | followup | pass | 1/1 | no | 0 | 1160 ms |
| `f-panopto-deletion` | followup | pass | 1/1 | no | 0 | 855 ms |
