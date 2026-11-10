# Controlled live-OpenAI validation (development only)

Run on 2026-11-10 against backend `a993f94` (`feat/web-integration-overview`) and Web `feat/canonical-ai-auth`.
Synthetic documents, two throwaway accounts, a disposable Postgres and a throwaway Typesense. No production data,
users, Stripe or quotas. The API key lived only in the budget proxy process; the backend was given a dummy key.

## Cost controls (all verified before any paid call)

| Control | Mechanism | Verified |
|---|---|---|
| $5 ceiling | `tests/fixtures/openai-budget-proxy.mjs`: measured spend + worst-case reservation, refused locally before forwarding | unit tests; real upstream with a $0.000001 ceiling forwarded nothing |
| Call caps | proxy chat / embedding caps (30 / 40); harness `LiveBudget`: 20 generation attempts, 5 uploads | unit tests; real upstream with a 1-call cap refused call 2 |
| Concurrency 1 | proxy queue + `LiveBudget` chain | unit tests |
| Bounded retries | backend `OPENAI_LLM_MAX_RETRIES` / `OPENAI_EMBED_MAX_RETRIES` / `OPENAI_TIMEOUT_SECONDS` (defaults unchanged: 3 / 10 / 60s); run used 1 / 1 / 60s | backend test |
| Fail closed | no key, unreachable proxy, looser ceiling or dirty ledger: refuses to start / forward | unit tests; real host without key |
| Usage report | proxy ledger (model, input/output tokens, estimated cost per call) | per-step table below |
| OpenAI-side hard limit | **not verified** (dashboard setting); the local proxy ceiling was the only enforced cap | - |

Pricing used: gpt-4.1-mini $0.40 / $1.60 per 1M tokens (matches OpenAI's model page); text-embedding-3-large
$0.13 per 1M (third-party source, unconfirmed). Estimates only.

## Result

15 provider chat calls + 24 embedding calls, 6,569 input / 4,284 output tokens, **about $0.009**. 16 generation
attempts (cap 20), 3 uploads (cap 5), 0 provider failures, 0 proxy refusals.

Ingestion (real upload path): 3 DOCX files extracted, chunked (1 chunk each), embedded with real OpenAI
embeddings, indexed in Typesense, `indexed` in the Web UI. Each module's canary was found only under its own
module; personal notes only under the personal module.

| Feature | Outcome |
|---|---|
| Tutor | Correct, cited the right document, follow-up kept the session, personal notes answered only in the personal module, personal facts did **not** leak into the class module, a non-enrolled module was refused with 403 and **0 provider calls**. |
| Quiz | 5 factually correct MCQs with explanations; answers withheld until submit; scoring consistent. Observed answer-position bias: correct options were b, c, b, b, b (never a). |
| Flashcards | 6 distinct, correct cards, no foreign content. |
| Summary | Structured, covers the document, no foreign content; "Exam Tips" adds mild unsupported advice (e.g. "don't confuse osmosis with diffusion" - diffusion is not in the document). |

## Findings

1. **Retrieval recall (medium, backend).** `similarity_threshold = 0.25` dropped a relevant chunk for "What is
   osmosis?" (score 0.246); neighbouring questions scored 0.29-0.33 and an unrelated one 0.068. The tutor then
   answered from general knowledge with the UI correctly saying "No matching study material was found". The browser
   run used `SIMILARITY_THRESHOLD=0.15` (environment only) and cited the document. Needs a tuning decision
   (lower threshold and/or enable `fallback_top_k` for chat) - not changed here.
2. **Tutor answers outside the material (low/medium, product decision).** For out-of-scope questions it says the
   materials do not cover it, then answers from general knowledge (no invented sources, `no_content_found: true`).
3. Web header shows "Sign in / Get started" while signed in (low, cosmetic); the Summary tab is clipped on narrow
   screens (low).

## Not verified

Large or messy real documents, multi-chunk retrieval quality, long-run latency/cost, an OpenAI-side spend limit,
other models (the run used `gpt-4.1-mini`; the deployed config's chat model name could not be confirmed).

## Reproduce

Start the stack as in `integration-testing.md` with the backend's OpenAI base URL pointing at the proxy, then:
`STAGE=ingest ... node tests/live/live-ai.mjs`, `STAGE=generate STATE=<ingest report> ... node tests/live/live-ai.mjs`,
`STATE=<ingest report> npx playwright test -c tests/live/playwright.live.config.ts`. Security regression (no credits):
`npm run test:ai-access` against the stand-in: 86/86, 0 defects on `a993f94`.
