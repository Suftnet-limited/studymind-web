# Controlled staging deployment: readiness report

Candidate: backend `01f3fc8` + the staging-readiness commit that follows it, Web `99d1634` + its readiness commit.
**Nothing was deployed.** Every result below is from a local staging-candidate stack (same topology and configuration as
`docker-compose.staging.yml`, provider replaced by the recording stand-in) or from static verification. A real staging host,
its database and its Typesense were not visible from here.

## Stage 1: configuration (verified)

`APP_ENV=staging`, `SIMILARITY_THRESHOLD=0.20`, `OPENAI_CHAT_MODEL=gpt-4.1-mini` (priced $0.40/$1.60 per 1M tokens),
`OPENAI_LLM_MAX_RETRIES=1`, `OPENAI_EMBED_MAX_RETRIES=0`, `RETRIEVAL_VECTOR_K=100`, `OPENAI_TIMEOUT_SECONDS=60`. All names are
real settings fields. `scripts/print_model_config.py` confirms them (exit 0). `scripts/verify_staging_env.py` returns
**READY: 0 FAIL, 0 WARN** on the candidate environment and **NOT READY (4 FAIL)** on a production-like one.

**Cost ceiling.** The backend holds only a dummy key and reaches OpenAI through the budget proxy, which holds the real key
and enforces $5, call caps and concurrency 1. A dashboard budget alert is not treated as a cap. New: the ledger is persisted
(`LEDGER_FILE`, mode 600), so a restart cannot reset it. Verified live: identical counts and spend across a restart, and a second
proxy on the same file refused immediately; a corrupt ledger file makes the proxy refuse to start. The verifier fails if the
backend could reach OpenAI directly or holds a real-looking key. Not verified: an OpenAI-side hard limit (dashboard setting).

## Stage 2: deployment readiness

| Area | Result |
|---|---|
| Isolation from production | `docker-compose.staging.yml` renders with 0 shared container names, ports, volumes or env file; all 4 published ports bound to 127.0.0.1; own Postgres (`studymind_staging`), Typesense and proxy. |
| Database | Verifier requires a database name containing "staging" and rejects any `--forbid-host`. |
| Typesense | Collection name `document_chunks` is fixed, so a shared instance would mix environments: staging needs its own. Schema unchanged vs `main`: no reindex. |
| Migrations | Schema diff against `origin/main` (72 commits behind): **2 new tables** (`studymind_entitlements`, `studymind_usage_counters`), **0 changes to existing tables**. `create_all` suffices; `sql/studymind_entitlements_additive.sql` is the reviewed manual equivalent. |
| Secrets | Verifier rejects placeholder/short JWT and Typesense secrets, live Stripe keys, a non-staging Cloudinary folder; prints no values. Billing, quota enforcement, recovery email default off and are forced off in the compose file. |
| Rollback | `docs/staging-runbook.md` (backend): redeploy the previous commit (new tables are additive and harmless), unset the two retrieval variables, `down -v` only on the staging project, stop the proxy to halt paid calls. |

Production-config findings (reported, not changed): `docker-compose.prod.yml` hard-codes and commits the Typesense key
(`rag-typesense-key`), publishes Typesense on all interfaces with `--enable-cors`; the API allows CORS origin `*`.

## Stage 3: retrieval and quality

**Prepared and validated, live metrics not yet run (no OpenAI key).** The corpus is now realistic: 5 class documents of about 900
words (3 chunks each at 512 tokens, up from 1-2), 26 paraphrased questions, confusable topics across documents (mitosis/meiosis,
binary search/binary search tree, hash tables/hashing, TCP/UDP) for wrong-citation tests, and two private documents with unique
canaries (a student's notes and a lecturer's unreleased exam draft). `tests/live/retrieval-ingest.mjs` + `retrieval_eval.py` run end to end.
Without real embeddings only the embedding-independent results are meaningful, and those pass:

* cross-module isolation: 0 foreign chunks in 130 queries x 5 thresholds;
* privacy, deterministic filter check on indexed data: the owner sees their own private document 2/2, **0 leaks** to the student, lecturer, a stranger
  or an anonymous viewer, and class material stays visible to every viewer;
* privacy, retrieval-level: 27 cross-viewer checks, 0 violations (its owner positive control needs real embeddings).

Needs the key (and an upload allowance of 8, not the default 5: 5 class + 2 private documents): recall, wrong-document
citations, general-knowledge fallback and the comparison with the synthetic benchmark (0.20: recall 94-100%, out-of-module wrongly grounded 17-22%).
Earlier incorrect citation found and fixed: keyword-only hits bypassed the threshold (see staging-preparation.md).

## Stage 4: regression on the candidate (stand-in provider)

Backend 812 passed; import/route check OK; Web unit 71/71; `tsc` clean; build compiles; integration 120/120 (real backend) and 123/123 (fixture);
browser 61 passed, 0 failed, 3 skipped by design; **security suite 86/86, 0 defects** (0 leak, 0 contract), with every backend provider call passing through the proxy.
Live verification of Tutor/Quiz/Flashcards/Summary was done on the same code on 2026-11-10 (gpt-4.1-mini and gpt-4o: 33/33 checks); flashcards were not part
of that final live smoke (code unchanged since the earlier live pass) and nothing live was re-run for this report.
