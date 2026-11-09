# Integration and browser testing (local only)

CI runs type-check, unit tests and the production build. The integration and Playwright suites need a
running StudyMind AI backend, so they are run locally (or in a dedicated pipeline with access to the private
`suftnetrepo/studymind-ai` repository). **Never point them at production or at real accounts** — the scripts
refuse non-loopback hosts and create throwaway users with random `@example.com` emails.

## Requirements

- Node 22, `npm install`, `npx playwright install chromium`
- A checkout of `suftnetrepo/studymind-ai` on `feat/web-integration-overview` (do not modify it) and Python deps
  (`pip install -r requirements.txt` in a venv)
- PostgreSQL (a disposable cluster/database)
- Do **not** load a real `.env`. Typesense and OpenAI are not needed; document indexing then reports `failed`,
  which is expected. Indexing-success is a separate backend staging task — it is not simulated here.

## 1. Disposable database and AI backend

```sh
initdb -D "$TMP/pgdata" -U sm_test --auth=trust
pg_ctl -D "$TMP/pgdata" -o "-p 55432 -c listen_addresses=127.0.0.1 -k /tmp/smpg" start   # short socket dir
createdb -h 127.0.0.1 -p 55432 -U sm_test studymind_it

cd studymind-ai   # no .env present
env -i PATH="$PATH" OPENAI_API_KEY=sk-test-not-real JWT_SECRET_KEY=local-integration-secret-32-chars-minimum-xx \
  POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55432 POSTGRES_DB=studymind_it POSTGRES_USER=sm_test POSTGRES_PASSWORD=x \
  ENABLED_ROLES=student,lecturer,self_learner TYPESENSE_HOST=127.0.0.1 TYPESENSE_PORT=59999 \
  venv/bin/python -m uvicorn app.api.main:app --host 127.0.0.1 --port 8000
```

## 2. Web (override database and Stripe so nothing real can be reached)

```sh
DATABASE_URL=postgresql://sm_test@127.0.0.1:55432/studymind_it STUDYMIND_AI_BASE_URL=http://127.0.0.1:8000 \
  STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET= STRIPE_ACCESS_PRICE_ID= npx next dev -p 3100
```

## 3. Run the suites

```sh
export AI_PSQL="psql -h 127.0.0.1 -p 55432 -U sm_test -d studymind_it"   # lets tests seed Plus / partial usage
WEB_URL=http://127.0.0.1:3100 AI_URL=http://127.0.0.1:8000 npm run test:integration
E2E_WEB_URL=http://127.0.0.1:3100 E2E_AI_PSQL="$AI_PSQL" E2E_SHOTS=./shots npm run test:e2e
```

`E2E_AI_PSQL` is optional; without it the Plus/partial-allowance browser tests are skipped.
Stop the dev server before `npm run build` (they share `.next`).

## Making this a CI job later

Needs: a token able to check out `studymind-ai`, a Postgres service container, Python 3.12 with the AI
requirements (large install — cache it), and the commands above in order with a readiness wait on
`/api/health` (reports `degraded` without Typesense; that is fine).
