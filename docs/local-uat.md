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

**Sign in at http://localhost:3100/my-learning** (the header's "Sign in"). The nav there is **My modules / Plans / AI access**, all StudyMind pages. The older `/dashboard`, `/modules`, `/billing`, `/lecturer`, `/sign-in` and `/sign-up` pages use a separate legacy account system; opening one while signed in to StudyMind redirects to the StudyMind equivalent, and the UAT accounts do not exist in the legacy system. See [uat-auth-fix-report.md](uat-auth-fix-report.md).

Auth regression tests (need the fault-injecting proxy): `FAULT_PROXY=1 scripts/local-uat.sh start && npx playwright test -c tests/live/playwright.uat.config.ts auth-regression`. Restart without `FAULT_PROXY` for normal UAT.

## Billing (Stripe TEST mode) and allowances
Plans now has a working **Get StudyMind Plus — £3.99** button when the stack is started with a Stripe mode:
* `STRIPE_MODE=standin scripts/local-uat.sh start` - works now; Checkout is a local stand-in (**not Stripe**, labelled on the page). Combine with real AI (default) or `OPENAI_STANDIN=1` for free fake AI.
* `STRIPE_MODE=test scripts/local-uat.sh start` - real Stripe test mode; needs your `sk_test_` key in `~/.studymind-uat/stripe.env` (the `.env.local` Stripe values are placeholders). Live keys are refused.
For real AI keep the cumulative ceiling honest: `UAT_MAX_USD=4.96 STRIPE_MODE=standin scripts/local-uat.sh start` ($0.0343 was spent earlier; stand-in AI uses a separate ledger). Both turn on usage limits for this local backend: Free = 10 chats / 2 quizzes / 2 flashcards / 1 summary per month; Plus = 200 / 30 / 30 / 15 for 28 days. Details and results: [stripe-test-mode-uat.md](stripe-test-mode-uat.md). Without a Stripe mode the page keeps the original "Coming soon" wording and limits are off.

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

## Verified (run against this stack, real gpt-4.1-mini + text-embedding-3-large via the budget proxy)
* No paid AI, 15/15: logins, wrong-password and anonymous rejection, module visibility per role, cross-module access blocked, session end and re-login.
* Real AI via API, 25/25 (`node scripts/uat-journeys.mjs`): Tutor grounded with citations, follow-up in the same session, off-topic answer not grounded and uncited,
  other-module topic not answered from foreign material, student retrieves own private note, student cannot reach the lecturer's private draft, not-enrolled module refused (403),
  quiz generate/hide answers/submit/score, flashcards, summary, lecturer retrieves own private draft but not the student's note, document lists respect privacy, student cannot upload class material.
* Real AI in the browser, 2/2 (`npx playwright test -c tests/live/playwright.uat.config.ts --project=desktop`): student Tutor (cited + "General knowledge" label), quiz to score and explanations, flashcards flip, summary, sign out, session ended, sign in again; lecturer sees all three modules and own materials but not the student's note.
* Measured cost of all of the above including seeding: about $0.034 of the $5 ceiling (22 chat, 29 embedding calls, 1 refusal from the no-key start).

## Known limitations / things to know before UAT
* The Web app has no document delete or edit; lecturers can upload and list only.
* The lecturer upload form defaults Visibility to "Personal notes" (private to the uploader). Choose "Class" for material students should see.
* A grounded Tutor answer can list a second, less relevant document as a source (seen on a cell-biology question that also cited genetics). Quiz difficulty is not tuned.
* Mobile layout was not re-checked on this stack (covered earlier by the stand-in browser suite).
* The 2/5 quiz score in the API run is expected (it always picks option 1).
