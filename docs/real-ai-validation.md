# Real-AI validation (OpenAI embeddings + Typesense + cited answers)

**Status: BLOCKED — no OpenAI development key was available.** Everything that does not need OpenAI has been
verified; everything that does is listed below as *not verified*. Seeded or mocked data does **not** count as
evidence of real indexing.

## What is verified (no OpenAI needed)

| Area | Evidence |
|---|---|
| PDF and DOCX text extraction | Backend `_extract_text` on the synthetic fixtures: all expected facts and the canary phrase survive; no foreign canary. |
| Chunking | Backend `_chunk_text` (chunk size 512, overlap 64): Physics PDF → 2 chunks (480 + 297 tokens), Biology DOCX → 2 chunks (487 + 179 tokens). |
| Failure *before* embedding | Truncated/garbage PDF, non-zip/truncated DOCX, whitespace-only text and a text-less PDF all fail inside extraction (`PdfStreamError`, `BadZipFile`, "Extracted text is empty") — before any OpenAI call. |
| Failure handling through Web | For each of those files: accepted, reported `failed`, 0 chunk rows, nothing in the search index, no provider/stack/credential text in Web or AI responses. |
| Typesense outage | Web still lists and accepts uploads; a delete fails with a 5xx, leaves the row intact and leaks nothing; after recovery the same delete succeeds (real Typesense container stopped/started). |

## What is NOT verified (needs a real key)

1. OpenAI embeddings are generated for the Physics PDF and Biology DOCX (`text-embedding-3-large`, 3072 dims).
2. Chunks reach Typesense with the right metadata (`module_id`, `visibility`, `owner_id`, `doc_version`, `is_latest`).
3. Documents show `indexed` with a chunk count in the Web UI after a refresh.
4. Retrieval returns the right chunks; answers cite the uploaded documents; unrelated or private content is not retrieved.
5. Real retrieval isolation (class vs personal, lecturer vs learner, same-named files, superseded versions).
6. Ingestion duration, answer latency and token usage.

## AI study tools in Web (implemented; live AI unverified)

Web now has the four AI tools on each module page (AI Tutor with citations, Quiz, Flashcards, Summary), adapted
from `studymind-react` and wired to the canonical JWT endpoints through `/api/studymind/modules/[id]/ai/*`.
Their tests use a **controlled fixture AI** (`tests/fixtures/ai-shim.mjs`), so they prove the Web proxy, access
control, payload mapping and UI — not that OpenAI-backed answers are correct. The acceptance checks below
(answers cite the right documents, no cross-user leakage in real retrieval) still need a real key.

## Running it once a key exists

Requirements: an OpenAI **development/staging** key supplied only as an environment variable of the local
backend process (never committed, never written to a file in this repo), the disposable Postgres and the
dedicated Typesense described in `integration-testing.md`, and `docker`.

```sh
# 1. fixtures (needs python-docx, e.g. the AI venv)
<ai-venv>/bin/python tests/fixtures/real-ai/make_fixtures.py ./fixtures

# 2. start the stack as in integration-testing.md, but with the real key:
#    OPENAI_API_KEY=<dev key> ... uvicorn app.api.main:app

# 3. rerun the integration suite with fixtures and the outage simulation
FIXTURES=./fixtures TS_URL=http://127.0.0.1:18108 TS_KEY=local-test-key TS_CONTAINER=studymind-it-typesense \
  WEB_URL=http://127.0.0.1:3100 AI_URL=http://127.0.0.1:8000 AI_PSQL="psql ..." npm run test:integration
# -> the "valid Physics PDF and Biology DOCX" check prints the AI's real status ("indexed" with a working key)
```

Then verify, using the canary phrases `PHYSICS-CANARY-7F3A` and `BIOLOGY-CANARY-91C2`:

```sh
# chunks and status in Postgres
psql ... -c "select d.filename, d.status, d.chunk_count, d.indexed_at from documents d where d.filename like '%notes%'"
# chunks in Typesense (metadata + visibility)
curl -s -H "X-TYPESENSE-API-KEY: $TS_KEY" \
  "$TS_URL/collections/document_chunks/documents/search?q=*&query_by=content&filter_by=document_id:=<id>&per_page=5"
# answers (direct API, or through the Web proxy POST /api/studymind/modules/<module>/ai/chat)
curl -s -X POST $AI_URL/api/chat -H "Authorization: Bearer <learner token>" -H 'Content-Type: application/json' \
  -d '{"module_id":"<module>","message":"A mass of 5 kg accelerates at 3 m/s^2. What is the force?","scope_mode":"class_only"}'
```

Acceptance checks: Physics answers cite `physics-notes.pdf` and give 15 N; Biology answers cite
`biology-notes.docx` (A–T, G–C, helicase, polymerase, Okazaki fragments); a Physics question in the Biology
module returns "not supported"/no Physics text; neither canary ever appears in another user's or module's
results; a superseded version's chunks are absent after a new version is uploaded.

## Cost basis (measured, not estimated)

Embedding input for the two fixtures: **1,443 tokens** (777 + 666, `cl100k_base`, the tokenizer used by the
OpenAI embedding models). At an *assumed* list price of US$0.13 per million tokens for `text-embedding-3-large`
(verify against OpenAI's current pricing page) that is about US$0.0002. Chat cost must be taken from the
`usage` figures the API returns (the backend stores `token_count` per message); no price is assumed here.
