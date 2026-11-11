# Local UAT handover

Candidate: backend `22ee52a28a6adfd23fbf55be2cb9986fe4715454` (`feat/web-integration-overview`), Web `08140ac746b9bde67603b56b5f77eeb4710d9949` (`feat/canonical-ai-auth`) plus the UAT scripts in this folder's commit.
Synthetic data only, isolated database `studymind_uat`, no Render, production, Mobile or Stripe involvement.

**Status: NOT READY for real-AI owner UAT until the development OpenAI key is supplied (see "Enable real AI").**

## URLs
| What | URL |
|---|---|
| Web | http://localhost:3100 |
| Backend health | http://127.0.0.1:8000/api/health |
| Budget-proxy ledger (spend, calls, refusals) | http://127.0.0.1:18301/__ledger |

## Credentials
Generated on first seed and stored only in `~/.studymind-uat/accounts.json` (mode 600). Read it locally; they are never printed by the scripts or committed.
Student `uat.student@example.com` (self-learner, enrolled in Introduction to Biology). Lecturer `uat.lecturer@example.com` (owns all three modules).

## Sample modules (class modules owned by the lecturer)
Introduction to Biology (student enrolled), Introduction to Computer Science and Introduction to Chemistry (student NOT enrolled: used to check module boundaries).
Course documents and a private student note are uploaded by `node scripts/uat-seed.mjs --documents` once real AI is enabled (uploads need real embeddings).

## Run it (3 commands)
```
cd ~/dev/studymind-final && git checkout feat/web-integration-overview && git pull   # once: backend at the tested commit
cd ~/dev/studymind-web && scripts/local-uat.sh start     # Postgres, Typesense, backend, Web, budget proxy, accounts + modules
scripts/local-uat.sh stop                                # when finished (data is kept)
```
`start` creates its own Postgres (`~/.studymind-uat/pgdata`, port 55432) and starts Colima if Docker is down. Other commands: `status`, `docs`.
Fixed settings: `gpt-4.1-mini`, `SIMILARITY_THRESHOLD=0.20`, retries 1 (LLM) / 0 (embeddings), $5 ceiling, concurrency 1, ledger in `~/.studymind-uat/ledger.json`.

## Enable real AI
```
grep '^OPENAI_API_KEY=' ~/dev/studymind-final/.env | cut -d= -f2- > ~/.studymind-uat/openai.key && chmod 600 ~/.studymind-uat/openai.key
scripts/local-uat.sh start      # prints "real AI: enabled"
scripts/local-uat.sh docs       # uploads the 5 course files + 1 private student note (well under $1)
```
The key goes only to the budget proxy; the backend holds a dummy key. Delete `~/.studymind-uat/openai.key` after UAT. Without a key every AI call fails closed (HTTP 502); nothing is faked.

## Verified without paid AI (15/15, run against this stack)
Student and lecturer login, wrong-password rejection, anonymous rejection, student sees only the enrolled module, lecturer sees all owned modules, student blocked from another module's detail/documents/AI, student cannot create a class module, overview counts, AI fails closed with the key absent, logout invalidates the session, log back in.

## Not yet verified (need the key)
Document upload and indexing, AI Tutor, quizzes, flashcards, summaries, citations, private-note privacy at retrieval level, lecturer document management with real files.
