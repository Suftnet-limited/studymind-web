# StudyMind Web

Student and lecturer learning platform built with Next.js, TypeScript, Prisma/PostgreSQL and Stripe, following the Careerquis application architecture.

## Architecture

- **Web application:** Owns authentication, student and lecturer accounts, enrolments, modules, one-time access passes, payment ledger, entitlement enforcement and 90-day post-expiry retention.
- **StudyMind AI:** Existing shared API used for course ingestion, AI Tutor, quiz, flashcards and summaries. API credentials stay server-side. Do not use `@studymind/react` for UI.
- **Mobile:** Existing StudyMind/Revvo mobile app remains live; cross-platform accounts and entitlements are integrated in a later phase.

## Design

Compact top navigation, clean light content area and simple footer, matching approved StudyMind mockups. Student pages: dashboard, modules, module overview, documents, chat, quiz, flashcards and summaries. Lecturer portal follows after student workflows.

## Delivery sequence

1. Foundation and shared UI shell
2. Student dashboard and module pages
3. Direct StudyMind AI API integration
4. Lecturer portal
5. Stripe one-time access passes adapted from Careerquis
6. Mobile account and entitlement integration
7. Retention, security and reliability
8. Tests and preview deployment

## Important constraints

- Keep Careerquis and StudyMind AI repositories unchanged.
- Do not place Stripe billing logic in the shared StudyMind AI backend.
- Do not expose StudyMind AI platform API keys to browsers.
- Preserve shared course resources when another user still has a valid entitlement; define ownership and retention before deletion.
- No automatic pass renewals; retain user-owned data for 90 days after their last paid pass expires, subject to shared-resource and legal retention rules.
