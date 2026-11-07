# StudyMind Web release audit — 2026-11-07

**Scope:** static review of current `main` across UI, lecturer/student journeys, API contract and Stripe payment lifecycle. GitHub Actions CI on commit `402edeec` passed. **No browser, database-backed E2E, local AI service, or Stripe test-mode payment was executed in this audit.** Do not interpret source-code coverage or green CI as working end-to-end acceptance.

## Release decision: NOT READY for end-to-end sign-off

### P0 — release blockers
1. **AI lecturer/student identity and course readiness.** `/api/modules/[id]/provision` provisions a `PlatformCourse` for the lecturer's local user ID. Student AI calls use the student's different local user ID. The StudyMind AI backend tracks per-user `PlatformCourse` records and shared course modules; verify student initialization/ingestion or enrolment mapping before asserting student AI chat/quiz/summary works. The current student workspace does not initialize the student course.
2. **Web/mobile modules are separate.** Web creates cuid IDs and 16-character hex enrolment codes in Prisma. Mobile uses backend UUID module IDs, institution enrolment codes and separate JWT identity. No cross-platform enrolment proof. Must decide shared authoritative module system and identity bridge before parity sign-off.
3. **Payment acceptance untested.** Stripe checkout, webhook activation, refund and dispute logic exist, but require disposable DB migrations, Stripe test credentials, webhook forwarding and full checkout/refund/dispute acceptance. The checkout success URL alone does not confirm access. Confirm delayed/async payment and duplicate/reordered events.
4. **Document ingestion acceptance untested.** Lecturer upload relies on StudyMind AI + configured Cloudinary/storage and background indexing. Confirm real upload, status polling and student retrieval before acceptance.
5. **AI provider readiness untested.** Provisioning, indexing, quiz, flashcards and summaries need real locally running StudyMind AI, database and search dependencies.

### P1 — UX and functionality
6. **Sign-in/sign-up error UX.** `/sign-in` and `/sign-up` use native POST forms; failed auth and duplicate email return raw JSON in the browser, not inline errors.
7. **Lecturer module creation error UX.** Native POST form returns JSON for invalid details or backend failures. Success redirects work, but error flow is not user friendly.
8. **Header state.** `src/app/layout.tsx` always shows Sign in/Get started and Lecturer Portal, including signed-in student accounts; lacks signed-in navigation and mobile menu.
9. **Dashboard metrics.** Dashboard uses `take:6` and displays that subset as “My modules” count; this is inaccurate once a user has more than six modules.
10. **Personal notes.** Lecturer-only class upload; student personal upload path is missing, despite UI referencing “My notes”.
11. **URL indexing.** Endpoint deliberately returns 503; not a working feature.
12. **Lecturer assessment generation.** UI previously sent `easy/hard` but backend StudyMind AI accepts `simple/expert`. Corrected both server validation and UI on this audit; requires runtime retest.
13. **AI provisioning freshness.** Lecturer's “Prepare AI course” checks status and returns immediately if ready/indexing, so later module title/description changes are not re-ingested. Need explicit update/re-index flow.
14. **Payment UI clarity.** Billing page does not show actual price or pass duration before Stripe redirect, and on return from checkout does not poll for webhook-confirmed activation. Confirm product copy and price before release.
15. **Access pass coverage.** `/api/modules/[id]/documents/status` checks enrolment but not active pass, whereas other AI routes require a pass. Review intended policy.
16. **Document ownership and UI.** Check class materials accessible to all enrolled students and personal documents private, with tests for unauthorized users.
17. **Responsive/accessibility.** Test desktop/tablet/mobile widths, keyboard navigation, form focus, error announcements, loading states, contrast and overflow. No browser visual inspection completed.

### P2 — maintainability/testing
18. **Automated tests** mainly validate billing math, guards and static source assertions. There are no real Playwright journeys for lecturer registration → module → student join → AI use → Stripe activation.
19. **API response shape and error handling** require contract tests against actual StudyMind AI responses (especially course status, document status, quiz and flashcard payloads).
20. **Deployment** requires env validation, DB migration rehearsal, secret checks and test-mode Stripe webhooks before production approval.

## Verified source-code positives
- Lecturer-only module create/edit and student-only join with unique `[userId,moduleId]` enrolment.
- Owner/enrolment access checks on module routes and active-pass gating for AI operations.
- Server-only StudyMind AI platform key; course-scoped session exchange with access check.
- Stripe webhook signature verification, event ledger and claim handling, idempotent payment intent pass creation, refund/dispute handling.
- Lecturer AI role now `tutor`; complexity mapping now `simple|normal|expert`.
- GitHub CI successful at `402edeec` prior to this audit's changes.

## Required acceptance sequence
1. Start disposable web PostgreSQL and local StudyMind AI with its required PostgreSQL, search and storage services. Apply only test migrations.
2. Lecturer: register/login, create/edit module, copy code, prepare AI course, upload PDF, wait for indexed status, generate quiz/summary, export assessment.
3. Student: register/login, enter code, verify dashboard and access controls, view class document, attempt unauthorized lecturer operations, use AI tutor/quiz/cards/summary after course initialization.
4. Billing: verify unauthenticated/expired pass denial, create Stripe test checkout, forward signed webhook, verify pass activation and expiry, duplicate webhook, full/partial refund and disputes, and return-page state.
5. UI: validate 375px, 768px, 1280px layouts, keyboard and error flows, and logged-in header.
6. Cross-platform: separately verify mobile enrolment only after the canonical module/identity design is implemented. **No mobile repo changes authorized in this audit.**

**Audit status:** source review completed, critical issues documented, difficulty contract bug fixed. End-to-end acceptance remains pending.
