# Render deploy audit (quick), 2026-11-13

Scope: Web `feat/ai-content-renderer` (stacked on `feat/canonical-ai-auth`) and backend `feat/dashboard-enrolled-at` (stacked on
`feat/ai-math-formatting` on `feat/document-sections`). **Nothing was deployed, pushed or merged.** Static checks plus the existing test suites.

## Verdict: not ready to deploy yet. Six blockers, all small, none are code defects.

| # | Blocker | Why it matters | Fix |
|---|---|---|---|
| 1 | **No lockfile is committed** (`package-lock.json` and `yarn.lock` are both untracked) | Render would run an unpinned `npm install`; versions drift between builds (we saw Playwright and jose move during this work) | Pick one (npm), regenerate, commit it, delete the other |
| 2 | **Web Prisma migrations do not create the base tables** (only `StripeWebhookEvent`; User, Module, Enrolment, StudyDocument, AccessPass come from `prisma db push` in local UAT) | `prisma migrate deploy` on an empty Render database gives a half-built schema; the older `/sign-in`, `/modules` and `/billing` flows would fail | Either add a baseline migration, or run `prisma db push` once on the new database; decide whether the older account flows ship at all |
| 3 | **`render.yaml` (backend) defines only the API service** (Docker, starter, Frankfurt, `autoDeploy: true`, only `PORT` set) | No Web service, no Postgres, no Typesense, no environment variables in code; `autoDeploy` ships every push to the tracked branch | Add Web and a Postgres to the blueprint (or create them by hand), run Typesense as its own persistent service, set `autoDeploy: false` for the first release |
| 4 | **Branches are not merged, two are local-only** | Web `feat/ai-content-renderer` and backend `feat/ai-math-formatting` + `feat/dashboard-enrolled-at` exist only on this machine; backend `main` is 3 behind `origin`, Web `main` 6 behind | Push, open PRs in order (backend: document-sections, then ai-math-formatting, then dashboard-enrolled-at; Web: canonical-ai-auth, then ai-content-renderer), merge after review |
| 5 | **Backend production settings** | `jwt_secret_key` defaults to `change-me-in-production…`; CORS is `allow_origins=["*"]`; `APP_ENV` must not be `development`; uploads write to the container disk (lost on redeploy) unless Cloudinary is configured | Set `JWT_SECRET_KEY` (32+ random chars), restrict CORS to the Web origin (Mobile does not need CORS), set Cloudinary variables, `APP_ENV=production` |
| 6 | **Money and cost controls** | Checkout is Stripe **test mode** (page says "Test payments only"); the Managed Payments tax-code decision is still open; quota enforcement is off and the flag is backend-global (also affects Mobile); the $5 OpenAI budget proxy exists only locally | Decide test vs live before launch; set a hard spend cap in the OpenAI dashboard; decide when to enable quotas |

## Decision needed (not a blocker, but changes what ships)

The backend formatting prompts (`feat/ai-math-formatting`) ask for `$…$` maths. The native Mobile app's `RichText` converts that to readable
Unicode (verified by running its converter), so it is compatible. Gaps there: flashcard fronts are plain text and `\begin{…}` or
`\ce{…}` come out garbled. Shipping the prompts is safe; fixing Mobile's flashcard front is a small separate change.

## Environment variables (Web service)

`DATABASE_URL`, `APP_URL` (exact public origin), `SESSION_SECRET` (32+ bytes), `STUDYMIND_AI_BASE_URL` (no `/api/v1`),
`STUDYMIND_AI_PLATFORM_API_KEY` (must match the backend), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_ACCESS_PRICE_ID`,
`ACCESS_PASS_DAYS`, optional `ACCESS_PASS_DISPLAY_PRICE` / `ACCESS_PASS_DISPLAY_CURRENCY`. Cookies are `httpOnly`, `sameSite=lax`,
`secure` when `NODE_ENV=production` (Render sets it). Build: `npm ci && npx prisma generate && npm run build`; start: `npm start`.
Backend: database, Typesense (host, port, key), OpenAI key and model, `JWT_SECRET_KEY`, platform API key, Cloudinary, `APP_ENV`.
Typesense: its own instance (collection name `document_chunks` is fixed); its schema is unchanged by this work, so no reindex.

## What passes

| Check | Result |
|---|---|
| Secret scan of tracked Web files (Stripe, OpenAI, AWS key patterns) | clean |
| TypeScript, Web unit tests | clean, 101/101 |
| Production build (`next build`) | compiles |
| Backend tests | 863 passed |
| Browser tests (last full run 161 passed, 3 history-spec flakes that pass alone; targeted reruns since: all green) | pass |
| Real-AI check on UAT (gpt-4.1-mini): 40 flashcards, a 5-question quiz, a tutor answer, desktop and phone viewport | pass |
| Chapter detection on a real Word upload | pass |
| Database changes in this work | none to existing tables; one optional response field (`enrolled_at`), optional request fields (`sections`, `topic`, `balanced`), no migration, Typesense schema untouched |

## Known, not blocking

* `npm audit` (production): 5 findings (prisma CLI chain via `deepmerge-ts`, PostCSS inside Next, one moderate on Next). All are build-time or CLI paths; the fixes need Next 16 or Prisma 7 (breaking). Next 15.5.29 is the latest 15.x. Plan an upgrade after launch.
* No ESLint configuration in the repo (`npm run lint` has nothing to run); one pre-existing lint error in `src/lib/module-access.ts`.
* Dead `OPENAI_*` lines in local `.env` files (never committed; do not copy them to Render).
* The Stripe live-key guard exists in the local scripts only; set live keys deliberately, never by copying a local file.
* Legacy Prisma account flows (`/sign-in`, `/modules`, `/billing`, `/dashboard`) still exist beside the new canonical ones.
* The sign-in, billing and Stripe specs in `tests/live` were updated for the new screens but can only run against the live Stripe stack; they were not run.

## Suggested order

1. Commit one lockfile; decide on the legacy Prisma flows and the baseline migration.
2. Push branches, review and merge the PRs in the order above.
3. Create Postgres (Web and backend), Typesense, backend service (`autoDeploy` off), Web service; set the variables above.
4. Smoke test on Render with Stripe test mode: register, join a class, upload a file, chat, quiz, flashcards, summary, plans, allowances; check Mobile against the same backend.
5. Only then decide live Stripe and quotas.
