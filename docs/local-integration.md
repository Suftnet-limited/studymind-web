# Local integration — StudyMind Web + StudyMind AI

## Two API families (verified from suftnetrepo/studymind-ai)
- `/api/v1/*`: platform API authenticated by `STUDYMIND_AI_PLATFORM_API_KEY` (server-to-server). `/api/v1/courses/ingest` provisions AI content, **not** a student-enrollable module.
- `/api/modules`, `/api/modules/{uuid}/enrolment-code`, `/api/modules/{uuid}/enrol`, `/api/auth/login`: mobile module API authenticated by the StudyMind AI user's JWT, **not** the platform API key. Module IDs are UUIDs, and enrolment codes require the lecturer to belong to an institution.
- Web currently uses independent Prisma users (cuid IDs), independent sessions, local module IDs and local 16-hex codes. These are not interchangeable with mobile UUID module IDs and institution enrolment codes.

## Run locally
1. Clone `suftnetrepo/studymind-ai`; follow its README for Python 3.12, Postgres, Typesense, `.env`, database initialization, then run `uvicorn app.api.main:app --host 127.0.0.1 --port 8000 --reload`.
2. Verify `http://localhost:8000/docs` and `http://localhost:8000/api/health` (check the health route in your checkout).
3. In StudyMind Web `.env.local`, set `STUDYMIND_AI_BASE_URL=http://127.0.0.1:8000`, a valid **local** platform API key, and the existing local Postgres/Stripe test settings.
4. Run `npm install`, `npx prisma migrate dev` against a disposable **web test DB**, `npm test`, and `npm run dev`.
5. Register/login lecturer, create a module and check the platform course ingest status. This proves AI provisioning only.
6. For the mobile join flow, log into StudyMind AI as a lecturer JWT, ensure institution membership, create a class module using `POST /api/modules`, generate code with `POST /api/modules/{uuid}/enrolment-code`, and log in as a student JWT to enrol via `POST /api/modules/{uuid}/enrol`. Verify `GET /api/modules` returns the module for that student.

## Integration requirements before web-to-mobile enrolment can work
- Reconcile identities: either use StudyMind AI authentication for web lecturer accounts, or implement a secure server-side identity bridge. A platform API key cannot impersonate a lecturer on mobile module endpoints.
- Make the mobile module backend authoritative for modules and enrolments; store the backend UUID in web data if web still needs local metadata.
- Use backend-generated institution enrolment codes, not web-generated hex codes.
- Keep Stripe pass ownership in StudyMind Web, with explicit identity mapping to mobile accounts.
- Keep AI platform course IDs aligned with the canonical module UUID.
- Do not change StudyMind Mobile until the web integration is verified.

**Do not claim local or cross-platform end-to-end tests have passed without running them.**
