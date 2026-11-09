# AI backend security findings (verified against suftnetrepo/studymind-ai `19982a2`)

Verified with `tests/integration/ai-access.integration.mjs` (real backend, real Postgres, real Typesense, documents
indexed through the real upload path). The OpenAI provider is a **recording stand-in**
(`tests/fixtures/openai-stub.mjs`) that counts every provider call and echoes its prompt, so "reached the AI" and
"leaked" are observable facts. It is not live OpenAI. Run: see `integration-testing.md`.

## 0. Blocker: the service does not boot at `19982a2`

`app/api/chat.py` `/chat/general` (lines ~515-518): the guard line is not indented under its `if` and the
`session = ...` line is dedented, so `import app.api.main` raises `IndentationError`. The new
`tests/test_studymind_ai_module_authorization.py` (and the other security tests) assert on **source text** and
never import the app, so all 16 pass on the broken commit. Fix:

```diff
         if req.module_id is not None:
-        await _get_accessible_module(req.module_id, current_user, db)
+            await _get_accessible_module(req.module_id, current_user, db)
 
-    session = await _get_or_create_session(req.session_id, None, current_user, db)
+        session = await _get_or_create_session(req.session_id, None, current_user, db)
         history = await _load_history(session.id, db)
```

Add a CI step `python -c "import app.api.main"` and behavioural (TestClient) authorization tests.

## 1. Verified fixed (with the indentation fix applied locally): `module_id` requests

All five endpoints (`/api/chat`, `/api/chat/stream`, `/api/quiz/generate`, `/api/flashcards/generate`, `/api/summarise`):
owner, enrolled student and self-learner (own module) are authorised and reach the provider; non-member student,
unrelated lecturer and other users on a private module get **403**; unauthenticated **401**; nonexistent module
**404**. For every refused request the provider received **zero** calls.

## 2. Still vulnerable: scopes other than `module_id` (13 probes)

The guard is `if req.module_id is not None`. Retrieval has no membership logic of its own
(`visibility:=class` only), so anything not covered by that guard is readable by any authenticated user.
Reproduction (attacker = student **not** enrolled in the lecturer's module; target document contains a canary):

| # | Endpoint | Request | Expected | Actual |
|---|---|---|---|---|
| 1 | `/api/summarise` | `{"week_id":"<week of M>","scope":"week"}` | 403 | **201**, response contains M's text |
| 2 | `/api/summarise` | `{"document_id":"<doc of M>","scope":"document"}` | 403 | **201**, response contains M's text |
| 3 | `/api/summarise` | `{"document_id":"<any random uuid>","scope":"document"}` | 403/404 | provider prompt contains M **and** N2 class text (status 500) |
| 4 | `/api/quiz/generate` | `{"week_id":"<week of M>"}` / `{"document_id":"<doc of M>"}` / random `document_id` | 403 | provider prompt contains M (and N2); 422 only because the stand-in is not JSON |
| 5 | `/api/flashcards/generate` | same three as quiz | 403 | same as quiz |
| 6 | `/api/chat`, `/api/chat/stream` | `{"message":"..."}` (no `module_id`) | only the caller's modules | non-member retrieves M and N2 class material (200) |
| 7 | `/api/chat` | `{"session_id":"<own session>","message":"..."}` (no `module_id`) | only the caller's modules | same leak as 6 |
| 8 | `/api/chat` | `{"module_id":"<M>","message":"..."}` as an **enrolled** student when another module N2 shares M's `course_code` | M only | N2's class material also retrieved (course_code takes precedence over module_id in `SearchScope`) |

Root causes: (a) `_retrieve_context(..., document_id=...)` accepts `document_id` but never passes it to
`SearchScope`, so a `document_id`-only call is **unscoped** across all modules; (b) `week_id`/`document_id` are never
resolved to their module and authorised; (c) chat without `module_id` runs unscoped retrieval; (d)
`SearchScope.to_filter` prefers `course_code` over `module_id`, and course codes are not unique.

Suggested fix: require at least one scope; resolve `week_id` -> `Week.module_id` and `document_id` ->
`ModuleDocument.module_id`, call `_get_accessible_module` on the resolved module, and reject conflicting ids;
for unscoped chat pass the caller's accessible `module_ids` (owned + enrolled) to `SearchScope`; always filter by
`module_id` when one is known (AND, not instead of, course_code); pass `document_id` to the retriever or drop it.

Probes that are safe: conflicting `module_id` + foreign `week_id`/`document_id` (no foreign content, though the
request still reaches the provider), `scope_mode=all_semesters` + `include_archived`, another user's chat session
id (404), reusing one's own session with a foreign `module_id` (403), personal notes (never retrieved by other
learners or the lecturer), summaries under a course-code collision.

Web is **not** exposed to 1-7: its proxy always sends the URL's `module_id` (after its own access check) and never
forwards `week_id`, `document_id` or a missing module. Item 8 affects any client, including Web, for modules that
share a course code.
