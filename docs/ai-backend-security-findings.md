# AI backend security findings

## Current status: backend `c348e7e` — all 15 previously reported defects are fixed

`npm run test:ai-access` against the **unmodified** backend `c348e7e3338f74a256ebc6c8559d08458e7d6791`:
**86/86 checks, 0 defects (0 LEAK, 0 CONTRACT), exit code 0**, identical on two consecutive runs (index emptied before
each). Negative control: the identical suite against the previous backend `42d7808` exits 1 with 15 defects
(6 LEAK, 9 CONTRACT) and 2 route-registration failures, so the suite does detect what it claims to.

| Previously reported defect | Evidence on `c348e7e` (status \| provider calls \| canary in prompt \| in response) |
|---|---|
| flashcards/summarise `week_id` without `module_id` (non-member) | 403 \| 0 \| none \| none |
| flashcards/summarise `document_id` without `module_id` | 422 \| 0 \| none \| none |
| flashcards/summarise random document UUID | 422 \| 0 \| none \| none |
| flashcards/summarise conflicting `module_id` + `week_id` (both directions) | 403 \| 0 \| none \| none |
| flashcards/summarise conflicting `module_id` + `document_id` | 422 \| 0 \| none \| none |
| flashcards/summarise nonexistent `week_id` | 404 \| 0 \| none \| none |
| `/api/chat/general` and `/api/chat/transcribe` unreachable | registered in the running service's OpenAPI; general chat 200, no module material; transcribe 401 unauthenticated / 400 invalid audio (not 404) |

Remaining backend issues (not security leaks): `tests/test_studymind_ai_module_authorization.py` still asserts the old
guard source string and fails; the other backend security tests are source-text assertions; and
`tests/test_v1_usage_policy.py::TestFailuresAndBudget::test_budget_enforced_and_never_exceeded` fails in a clean test
database (backend suite: 512 passed, 2 failed).

---

# History: findings on `42d7808` (fixed in `c348e7e`)

## Findings on `42d7808` (superseded)

Method: `tests/integration/ai-access.integration.mjs` (`npm run test:ai-access`) sends real HTTP requests straight to
the **unmodified** backend (no Web in the path) against a disposable Postgres and a real Typesense that the suite
empties first. Documents are indexed through the real upload path. The OpenAI provider is a **recording stand-in**
(`tests/fixtures/openai-stub.mjs`): it counts every provider call and echoes its prompt, so "reached the AI" and
"leaked" are observable. It is not live OpenAI. Every probe records HTTP status, provider calls, and canary phrases
found in the provider PROMPT and in the RESPONSE. Positive controls prove retrieval works, so "no leak" is conclusive.
Result on `42d7808`: **69/69 checks run; 15 defects (6 LEAK, 9 CONTRACT)**, identical on two consecutive runs.

LEAK = unauthorized material reached the provider and/or response. CONTRACT = a fail-closed rule is not enforced but
no foreign material moved.

## Verified fixed
- Backend boots (`import app.api.main` OK; the earlier `IndentationError` is gone).
- `module_id` requests, all five endpoints: owner/enrolled/self-learner authorized; non-member, unrelated lecturer and
  other users' private modules **403**; unauthenticated **401**; nonexistent module **404**; refused requests never call
  the provider (45/45).
- `/api/quiz/generate`: every scope probe is refused with zero provider calls (week-only 403, document-only 422,
  random document 422, conflicting module+week 403, conflicting module+document 422, nonexistent week 404).
- `/api/chat` and `/api/chat/stream`: no `module_id` -> 422 and no provider call (also with an existing session id and
  for members); course-code collision no longer leaks; another user's session 404; own session + foreign module 403;
  scope-mode broadening cannot widen retrieval.
- Retrieval isolation (real index, prompts and responses inspected): enrolled student, non-enrolled student, lecturers
  (incl. one whose module shares a course code with another), self-learner private module and a second learner in the
  same module each see only their own module; a learner's personal note never reaches another learner or the lecturer.
- Valid week-only generation works for members/owners and stays inside the week's module.

## Remaining defects

### D1 [LEAK] `/api/flashcards/generate` and `/api/summarise` still use the old guard
`app/api/features.py`: `_authorize_generation_scope` is applied only in `generate_quiz_endpoint` (line ~88);
`generate_flashcards_endpoint` (~295) and `summarise_endpoint` (~477) still have
`if req.module_id is not None: await _get_accessible_module(...)`. Attacker = student **not** enrolled in the module.

| Request | Expected | Actual |
|---|---|---|
| `POST /api/summarise {"week_id":"<week of M>","scope":"week"}` | 403, no provider call | **201**; 2 provider calls; M's text in prompt **and response** |
| `POST /api/summarise {"document_id":"<doc of M>","scope":"document"}` | 422, no provider call | **201**; M, N, N2 text in prompt **and response** |
| `POST /api/summarise {"document_id":"<random uuid>"}` | 422/404, no provider call | 500; 2 provider calls; M, N, N2 text in prompt |
| `POST /api/flashcards/generate {"week_id":"<week of M>"}` | 403, no provider call | 422 (stand-in output not JSON); 2 provider calls; M text in prompt |
| `POST /api/flashcards/generate {"document_id":"<doc of M or random>"}` | 422, no provider call | 422; 2 provider calls; M, N, N2 text in prompt |

Fix: call `await _authorize_generation_scope(req, current_user, db)` at the top of both handlers (replace the
`if req.module_id is not None` block). That one change resolves all LEAK items and most CONTRACT items below.

### D2 [CONTRACT] fail-closed rules not enforced on flashcards/summarise (same root cause as D1)
Conflicting `module_id`+`week_id` returns 422 with one provider call instead of 403 with none (no foreign content moves
because the filters are ANDed); `module_id`+`document_id` calls the provider (only the caller's own module content);
nonexistent `week_id` calls the provider instead of returning 404.

### D3 [CONTRACT, regression] `/api/chat/general` and `/api/chat/transcribe` are unreachable
Since commit `775817d` (opt-in quota guard) both route decorators and `GeneralChatRequest` are nested inside
`extract_text_from_image` (indented one level), so FastAPI never registers them: `POST /api/chat/general` -> **404**.
On `origin/main` they are module level and reachable. Dedent the block from `class TranscribeRequest`/`transcribe_audio`
onwards to column 0.

### D4 [test quality] backend authorization tests assert source text
`tests/test_studymind_ai_module_authorization.py` hard-codes the old guard string and now **fails** on the fixed code;
the other security tests read source text and never exercise a request. Replace with request-level tests (TestClient)
like the ones in `tests/integration/ai-access.integration.mjs`, and add `python -c "import app.api.main"` to CI.
Also: `tests/test_v1_usage_policy.py::TestFailuresAndBudget::test_budget_enforced_and_never_exceeded` fails
(`budget_exhausted` is False) in a clean test database; unrelated to module authorization.

## Web
Web is not exposed to D1/D2: its proxy always sends the URL's `module_id` (after its own access check) and never
forwards `week_id`, `document_id` or an absent module. Re-verified: Web -> real backend 120/120, fixture mode 123/123,
browser 48/48.
