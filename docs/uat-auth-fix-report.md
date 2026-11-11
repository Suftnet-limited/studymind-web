# UAT failure report: "Plan, Web Module and AI Access kick me out"

Status: **fixed and tested locally; READY only if the owner can repeat the journeys below without an unexpected sign-in screen.**
Web `feat/canonical-ai-auth`, backend `feat/web-integration-overview` (`22ee52a` plus a test-only fix). Nothing deployed.

## Finding: nobody was logged out; three links led to a different login system

Reproduced in a real browser (Chromium, both roles) against the running app. After StudyMind sign-in, the `/my-learning` nav links behaved like this:

| Link | Went to | StudyMind session |
|---|---|---|
| Dashboard | `/dashboard` -> 307 -> `/sign-in` | valid (both cookies, `auth/status` true) |
| **Web modules** | `/modules` -> 307 -> `/sign-in` | valid |
| Plans | `/my-learning/plans` (worked) | valid |
| **AI access** | `/billing` -> 307 -> `/sign-in` | valid |

No 401/403, no console error, no cookie cleared, no redirect loop. `/dashboard`, `/modules`, `/billing` and `/lecturer` belong to an older Prisma account system guarded by a separate `studymind_session` cookie that StudyMind sign-in never sets, so they sent a signed-in user to a login page that looks like a logout. **Plans itself loaded correctly in this build for student and lecturer; I could not make it fail**, so if it still fails for you please send the exact click path.

## Second finding (real session bugs, found while auditing the token lifecycle)

1. A refresh that failed for a **temporary** reason (backend 5xx/429, timeout, restart) was treated as "invalid session" and the cookies were deleted. The backend rotates refresh tokens (single use), so a blip during a refresh signed a valid user out.
2. **Sign out only deleted cookies.** The refresh token stayed valid on the backend, so a copied cookie could be replayed. (Access JWTs are stateless and stay valid until expiry, 60 minutes by backend design.)
3. The header showed "Sign in / Get started" whenever the status call failed, even for a temporary outage.

## Changes (Web)

| File | Change |
|---|---|
| `src/lib/studymind-identity.ts` | One `callWithRecovery`; refresh has three outcomes: `ok`, `invalid` (400/401/403: clear cookies), `unavailable` (5xx/429/timeout/network: **keep cookies**, return 503, never cache). 403 and other non-401 statuses pass through untouched. `revokeAiSession()` revokes the refresh token on the backend at sign-out and drops its cached refresh. |
| `src/app/api/studymind/auth/logout/route.ts` | Uses `revokeAiSession()`. |
| `src/app/api/studymind/auth/status/route.ts`, `src/components/header-auth.tsx` | Backend unavailable returns `authenticated: null` (HTTP 503); the header keeps what the user sees. Only an explicit true/false changes it. |
| `src/app/my-learning/layout.tsx` | Nav is now **My modules, Plans, AI access**, all StudyMind pages. The legacy Dashboard / Web modules / Billing links are gone from this area. |
| `src/app/my-learning/plans/page.tsx` | `id="allowances"` so "AI access" lands on the allowances card. |
| `src/middleware.ts` (new) | A request with a StudyMind session and **no** legacy session to `/dashboard`, `/modules/*`, `/billing`, `/lecturer/*` is redirected to the StudyMind equivalent (`/my-learning`, or `/my-learning/plans#allowances`). It only redirects: no grants, `/api` and Stripe routes untouched, users with a legacy session and anonymous visitors are unaffected (the legacy pages' own guards still apply). |
| `tests/fixtures/fault-proxy.mjs`, `scripts/local-uat.sh` (`FAULT_PROXY=1`) | Test-only proxy that forwards to the real backend and injects 403/503/429, dropped connections and delay, and logs upstream calls. |

Backend: test-only. `tests/test_v1_usage_policy.py` pins `OPENAI_CHAT_MODEL=gpt-4.1-mini` because one budget test failed whenever a developer's local `.env` selected `gpt-4o` (CI was unaffected).

## Regression tests (`tests/live/auth-regression.spec.ts`, real sign-in, real backend authorisation)

22 tests (21 desktop + 1 mobile, plus mobile runs of the nav test): nav for student and lecturer; legacy URLs land on StudyMind pages; anonymous legacy access unchanged; reload on every protected page and back/forward; expired access cookie recovers with exactly **one** refresh; invalid access JWT recovers; 8 concurrent requests share one refresh; two tabs; real 403 and injected 403 never sign out; refresh 503 / 429 / dropped connection keep credentials and recover; backend fully down then back; slow network; revoked session is signed out and cannot come back; sign-out revokes the refresh token (replay fails); unauthorised AI requests leave the OpenAI ledger unchanged; student cannot use lecturer actions; signed-out direct navigation has no loop or crash.
**Proof they bite:** against the previous code 7 of them fail (nav bounce for both roles, legacy URLs, refresh 503, refresh 429, backend-down header, refresh replay after sign-out); against the fix 43/43 pass (desktop + mobile), 1 skipped by design.

## Verification on the final candidate

Backend pytest 812 passed; Web unit 71/71; `tsc` clean; production build OK (middleware registered); integration 120/120 (real backend + stand-in) and 123/123 (fixture shim); browser suite 61 passed, 3 skipped by design, 0 failed; **86/86 AI security checks, 0 defects** (backend unchanged); real backend stopped and restarted: session survives the outage (modules 502, header `authenticated: null`, refresh cookie kept) and the refresh path works afterwards. No paid OpenAI call was made for this work.

## Limitations

* The legacy pages (`/dashboard`, `/modules`, `/billing`, `/lecturer`, billing/Stripe flow) still need a **legacy** account and are unchanged. A StudyMind-only user is routed to the StudyMind equivalents; there is no StudyMind lecturer-specific dashboard beyond `/my-learning`.
* The refresh de-duplication map lives in one Web process. With several Web instances use sticky sessions or a shared store.
* Access JWTs cannot be revoked before they expire (up to 60 minutes) because the backend is stateless; only refresh tokens are revoked.
* Validation runs before authentication on AI routes (an anonymous request with an invalid body gets 400, not 401); no AI work or data is reached either way.
