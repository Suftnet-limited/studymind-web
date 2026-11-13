# Staging preparation (retrieval tuning, Tutor/Quiz/Summary behaviour, Web fixes)

Built on the controlled live run in [live-openai-validation.md](live-openai-validation.md). Development only: synthetic
documents, disposable Postgres/Typesense, a budget-enforcing proxy holding the only copy of the key (now removed).

## 1. Retrieval threshold (measured)

Corpus: 5 DOCX files, 3 modules, 10 topics each. Real OpenAI embeddings, real Typesense, the backend's real retriever;
no LLM calls. 104 queries: 50 relevant (one per topic), 36 off-topic (12 x 3 modules), 18 about a different module.
A real-retriever sample (42 runs per corpus) matched the client-side threshold filter exactly.

| τ | recall: 512-token chunks (1-2/doc) | recall: 128-token chunks (6-9/doc) | out-of-module questions wrongly grounded | wrong-document share of citations | off-topic wrongly grounded |
|---|---|---|---|---|---|
| 0.15 | 100% | 100% | 28% / 39% | 31% / 15% | 0% / 0% |
| **0.20** | **94%** | **100%** | **17% / 22%** | **17% / 8%** | **0% / 0%** |
| 0.25 | 84% | 100% | 0% / 6% | 2% / 4% | 0% / 0% |

(pairs are 512-token / 128-token chunks.) Isolation: 0 chunks from another module in all 104 queries at every threshold.
Best-score ranges, 512-token corpus: relevant 0.17-0.48, off-topic 0.02-0.13, other-module 0.09-0.25.

**Recommendation: `SIMILARITY_THRESHOLD=0.20`**, configurable (default in code left at 0.25). 0.25 loses 16% of relevant
questions on dense chunks; 0.15 (the value first suggested) wrongly grounds 28-39% of out-of-module questions, and a spurious
citation is worse than a missing one because an ungrounded answer is now labelled. Re-tune on real staging documents.

**Defect found and fixed on the way.** With more chunks than `k`, a chunk matched by keyword only had no vector distance and
was given an invented similarity of 0.75, so *any* keyword hit passed *any* threshold (41% of off-topic questions were
"grounded" at every τ). Fixed in the backend: deeper vector candidate set (`RETRIEVAL_VECTOR_K`, default 100) and a missing
distance now scores 0.0. Before the fix the multi-chunk comparison was meaningless; the numbers above are after it.

## 2. Tutor

General-knowledge answering is kept. When nothing was retrieved (`no_content_found`) the answer is labelled
"General knowledge — not from your study materials" and **never carries citations**, even if the upstream payload contained
some (Web drops them). Module authorization is unchanged. Live (gpt-4.1-mini and gpt-4o): grounded answer cites the right
file; World Cup question labelled, no sources; another module's topic asked in Biology: not grounded, no citation, no
foreign document; non-enrolled module: 403 with 0 provider calls.

## 3. Quiz and Summary

Quiz: the correct answer is moved to an evenly cycled position (order-dependent options such as "all of the above" are left
alone; ids, `correct_answer` and "option b" references follow). Live, 10 questions per model: gpt-4.1-mini c2 a2 b3 d3;
gpt-4o a3 b2 c2 d3 (before: b, c, b, b, b). Every keyed answer re-checked against the source text. Summary: "Exam Tips" is
gone from the grounded part; a separately headed "General study advice (not from your documents)" holds only study technique
(no subject facts) and Web shows it in its own labelled block. No extra OpenAI call in either feature.

## 4. Web corrections

* Header: a signed-in canonical user no longer sees "Sign in / Get started" (server cookie hint, confirmed by
  `/api/studymind/auth/status`, refreshed on sign-in/out). No second "Sign out" button was added.
* Summary tab no longer clipped at 320/360/393px (tested).
* **Concurrent token refresh.** Refresh tokens are single-use; two simultaneous requests that both found the access token
  expired both refreshed, the second failed and signed the user out. The header's extra call made this certain, so refreshes
  are now shared per refresh token (in-flight + 15 s reuse). Regression test added.
* Pre-existing, not changed: `button,input{font:inherit}` in `globals.css` is unlayered, so it beats every Tailwind font-size
  utility on buttons and inputs app-wide (e.g. the tabs' `text-sm` never applied). The tabs use `!` modifiers locally;
  wrapping the rule in `@layer base` would fix it everywhere but changes the look of every button, so it is left for a decision.

## 4b. Cost and models

Cost of this phase: 6 chat + 454 embedding calls on gpt-4.1-mini/embeddings, then 6 chat calls on gpt-4o: about **$0.05**
(estimates; gpt-4o $2.50/$10 per 1M tokens). Provider calls per feature unchanged: 1 chat + 1 embedding (asserted per
step); refused/unauthorised requests: 0 provider calls. The $5 ceiling, call caps and fail-closed behaviour were re-verified
against the real upstream. **Models:** code default `gpt-4.1-mini`; a local backend `.env` sets `OPENAI_CHAT_MODEL=gpt-4o`
(~6x the price); both were exercised live. The real staging value was not visible: run
`python scripts/print_model_config.py` there.

## 5. Regression totals (final code)

Backend 787 passed (CI: import/route check, price-table check, full suite); Web unit 67/67; `tsc` clean; build compiles;
integration 120/120 (real backend + stand-in) and 123/123 (fixture shim); browser 61 passed, 0 failed, 3 skipped by design
(desktop-only); `npm run test:ai-access` 86/86 with 0 defects (0 leak, 0 contract).
