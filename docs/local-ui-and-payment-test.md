# StudyMind Web — local setup and UI/payment acceptance

## Prerequisites
Node.js 22, npm, PostgreSQL 15+, a locally running `suftnetrepo/studymind-ai` FastAPI service with its own database/vector/storage/provider configuration, and Stripe CLI. StudyMind Mobile is not modified. Web uses **direct StudyMind AI API endpoints** and a custom Tailwind v4/shadcn-style UI; do **not** install `@studymind/react`.

## Configure
```bash
git clone https://github.com/Suftnet-limited/studymind-web.git
cd studymind-web
cp .env.example .env.local
openssl rand -base64 48
```
Paste the random value into `SESSION_SECRET`. Create a **disposable local** PostgreSQL database named `studymind_web` (or change `DATABASE_URL`). Set the StudyMind AI URL (default local `http://127.0.0.1:8000`) and the **matching backend platform API key**. The AI backend must be configured and started separately.

For Stripe, use test-mode `sk_test_` secret and `price_` ID from the same test account. `STRIPE_ACCESS_PRICE_ID` must refer to a **one-time payment** price. Set `ACCESS_PASS_DAYS` (defaults to 28). Optional `ACCESS_PASS_DISPLAY_PRICE` and `ACCESS_PASS_DISPLAY_CURRENCY` must match the actual Stripe price; these only affect copy, **not** checkout charges. Do not use live keys.

```bash
npm install
npm run db:generate
npm run db:migrate
npm test
npm run build
npm run dev
```
Open `http://localhost:3000`. Use the `APP_URL` origin exactly; if port 3000 is busy, update `APP_URL` and the Stripe CLI forwarding URL to the new port.

In a second terminal:
```bash
stripe login
stripe listen --forward-to http://localhost:3000/api/billing/webhook
```
Copy the printed `whsec_` into `STRIPE_WEBHOOK_SECRET` in `.env.local` and restart the Next.js dev server.

## Browser acceptance — run with separate lecturer and student accounts
1. Desktop 1280px, tablet 768px, phone 375px: landing, sign-up, sign-in, dashboard, modules, module details, documents, study tools, lecturer management, billing. Confirm no overflow, keyboard access, readable errors and sensible navigation.
2. Lecturer: register, create a module, copy its code, edit title, prepare AI course, upload a supported document and verify indexing; generate and export assessment.
3. Student: register, enter lecturer code, see enrolled module, open each deep link `?tab=tutor|quiz|flashcards|summary`, verify unauthorized lecturer actions are blocked.
4. Stripe: without a pass, AI operations return 402. Start checkout, use a Stripe test card, return to `/billing?checkout=success`; the page shows pending until the signed webhook activates the pass. Refresh and confirm active expiry. Cancel checkout and verify no activation. Check duplicate events and refund/dispute behavior separately.
5. AI: run chat, quiz, flashcards and summary against the actual local backend; ensure lecturer and student both resolve the same indexed module and student permissions are correct.

## Known limitations — do not treat these as passed
- Web and StudyMind Mobile currently use different module IDs, enrolment codes and auth identities; cross-platform join is not implemented.
- Student AI course mapping and per-user initialization still need backend-backed verification.
- Personal student document upload and URL ingestion are not completed.
- Quiz currently reveals feedback on selection and does not implement a full graded session.
- Original mock image files and a browser screenshot comparison have not been verified; source-level design alignment is not pixel parity.
- Stripe refund/dispute tests require real signed test-mode webhook events and a disposable test database.

**Never test payments using live Stripe keys or production data.**
