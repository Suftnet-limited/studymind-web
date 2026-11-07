# StudyMind Web — workflow review against StudyMind Mobile

Reviewed 2026-11-07. This is a source-code audit, not a local end-to-end test.

## Product boundary
StudyMind Web owns web identity, payment and access; StudyMind AI provides AI services. The mobile app currently calls a different module-management API. Do not claim shared enrolment codes or shared accounts without a verified identity and module mapping.

## Lecturer creates module → shares code → student joins
1. Mobile: lecturer creates through `moduleService.create` (`POST /api/modules`); enrolment code can be generated through `POST /api/modules/:id/enrolment-code`. Student joins with `POST /api/modules/:id/enrol`, providing `enrolment_code`. Mobile also supports institution codes and self-learners.
2. Web: lecturer `POST /api/modules` creates a local Prisma Module and a random 16-character hex `enrolmentCode`. Lecturer can see the code in `/lecturer/modules/:id` and `/modules/:id`.
3. Web: student `POST /api/modules/enrol` validates 16-character hex, finds the local module and upserts an Enrolment. Student sees it in `/modules` and `/dashboard`.
4. Web module access is restricted to the owner lecturer or an enrolled student.
5. **Gap:** mobile-generated codes are not accepted by web's hex-only validator and mobile and web module IDs have separate origins. The mobile enrolment code is not a course code; the optional `course_code` is a distinct concept. Decide whether to reproduce mobile UX using local web modules or deliberately integrate the module-management API. Never silently mix them.

## Other workflows
- Registration/login: web has separate email/password credentials and roles STUDENT/LECTURER. Mobile identity is separate; no SSO demonstrated.
- Lecturer module edit: PATCH endpoint and settings form exist; only owning lecturer can edit.
- Class documents: lecturer upload and indexing proxy exist; student personal uploads are currently blocked by the web route, unlike mobile personal notes flow.
- AI tutor/quiz/flashcards/summary: web UI and proxy exist; `course_id` currently uses local Prisma module ID, so AI backend course mapping must be verified. Actual generation is not proven.
- Lecturer assessment preparation: independent private authoring/export flow exists; no student submission workflow should be introduced.
- Payments: Stripe checkout, webhook, access pass and refund/dispute handling exist in source; test-mode acceptance and migration deployment remain outstanding.
- UI: module detail contains stale 'Phase 3' placeholder text despite implemented AI routes; should be corrected.
- Error handling: invalid join code currently returns JSON from a form submission; users may land on a raw error response instead of seeing a form error.

## Acceptance scenarios
1. Register lecturer, create module, see/share code; reload and code persists.
2. Register student, enter code, see module on dashboard and modules list.
3. Repeat join; verify no duplicate enrolment.
4. Reject invalid/unknown codes and wrong roles with usable UI errors.
5. Student cannot access unjoined module or lecturer settings; lecturer cannot edit another lecturer's module.
6. Student sees class documents but not other students' personal notes.
7. Verify personal uploads and AI course mapping against the real StudyMind AI API.
8. Verify lecturer private preparation remains independent of student enrolment.
9. Verify pass gating, payment lifecycle and expiry in Stripe test mode.
10. Verify responsive navigation, sign-in/out, refresh persistence and accessible error states.

## Release decision
Not ready to declare workflow acceptance: the module systems are not interoperable, personal document parity is incomplete, and local integration tests have not run. No production database migration or live Stripe action is authorized by this review.
