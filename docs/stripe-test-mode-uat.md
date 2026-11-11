# Stripe TEST mode for local UAT

**Status: the purchase flow is built and verified end to end against a local Stripe STAND-IN. A purchase against real Stripe test mode is BLOCKED until a real `sk_test_` key is supplied.** Nothing here touches live Stripe, production, Mobile or Render.

## 1. Credential check (values never printed)

| Item | Result |
|---|---|
| `STRIPE_SECRET_KEY` in `.env.local` | has the `sk_test_` prefix but is **18 characters long: a placeholder**, not a usable key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_` prefix, **16 characters: a placeholder** |
| `STRIPE_ACCESS_PRICE_ID` | `price_` prefix, **16 characters: a placeholder**, and it belongs to the **legacy** Web checkout only |
| Publishable key (`pk_test_`) | not configured and **not needed** (StudyMind Checkout is a server-side redirect) |
| Live credentials (`sk_live_`, `pk_live_`, `rk_live_`) | none in `.env.local`, the backend `.env` or `~/.studymind-uat/` |
| £3.99 for 28 days | fixed **in the backend** (`PLUS_PRICE_GBP_PENCE = 399`, `PLUS_DURATION_DAYS = 28`) and sent as inline `price_data`, so the canonical flow does not use a Price ID. Nothing could be confirmed against Stripe because there is no real key |

Fail-closed behaviour (all tested): `scripts/stripe-verify.mjs` exits 1 for a missing/placeholder key and **3 for any live key**; `scripts/local-uat.sh` refuses to start (exit 3) if a live key is in `.env.local` or `~/.studymind-uat/stripe.env`; the backend only enables checkout for `sk_test_` keys, only accepts `cs_test_` sessions and `livemode: false` objects; the legacy `src/lib/stripe.ts` now refuses a live key outside a production build.

## 2. How billing works (the existing design, now wired to the UI)

Plans page -> `POST /api/studymind/checkout` (reads nothing from the browser, same-origin only) -> backend `POST /api/billing/checkout` (identity from the session, price fixed server-side, refuses with 409 if a pass is already active) -> Stripe Checkout -> Stripe sends a **signed** webhook -> backend verifies the signature (5 minute tolerance), re-reads the Checkout Session from Stripe, requires paid / GBP / 399 / test mode / matching user, and inserts **one** entitlement per session (unique key). The return redirect (`?checkout=success`) grants nothing: the page polls the entitlement for up to a minute. Refunds and disputes are reconciled from Stripe's current charge state (full refund revokes; partial refund or dispute suspends; revoked is terminal).

Flags (backend, local only, default OFF everywhere else): `STUDYMIND_BILLING_ENABLED`, `STUDYMIND_QUOTA_ENABLED`. The UI shows the button only when the backend reports `purchase_available`; otherwise the original "Coming soon" wording is unchanged.

## 3. Run it

**Stand-in (works now, no Stripe account):** `STRIPE_MODE=standin scripts/local-uat.sh start`. The stand-in (`tests/fixtures/stripe-standin.mjs`) is **not Stripe**; its Checkout page is labelled as such. Add `OPENAI_STANDIN=1` to use a free fake OpenAI (answers are echoes) when you want to exercise limits without spending.

**Real Stripe test mode (needs you):**
1. Put your TEST secret key in `~/.studymind-uat/stripe.env` (`chmod 600`): `STRIPE_SECRET_KEY=sk_test_...` (optionally `STRIPE_PUBLISHABLE_KEY=pk_test_...`). Use a standard secret key; a restricted `rk_test_` key is refused by the backend.
2. `STRIPE_MODE=test scripts/local-uat.sh start`. It runs the verifier (prefix, not a placeholder, and Stripe confirming `livemode=false`), obtains the webhook secret from `stripe listen --print-secret` (the Stripe CLI is installed and logged in on this machine), and keeps `stripe listen` forwarding `checkout.session.completed` and refund/dispute events to the local backend.
3. Sign in at http://localhost:3100/my-learning, open **Plans**, click **Get StudyMind Plus — £3.99**, pay with `4242 4242 4242 4242` (any future expiry and CVC). Declined card: `4000 0000 0000 0002`. Cancel with the back link.
Not verified until step 3 has been done by someone with the key: the real hosted Checkout page, Stripe's own webhook delivery and signing, and Stripe's real API response shapes.

## 4. What was verified (stand-in), see the commit for exact counts

Free user buys Plus; signed webhook; entitlement for 28 days; Plus allowances (200/30/30/15); survives reload, sign-out and sign-in; cancelled and declined payments grant nothing; redirect before the webhook grants nothing; bad, stale and missing signatures rejected (400); 8 simultaneous deliveries and replays give exactly one entitlement; one user's payment cannot activate another; the browser cannot write entitlements, forged bodies are ignored, cross-site and anonymous checkout refused; expiry returns to Free and allows renewal; full refund revokes, partial refund suspends, replayed/earlier events cannot restore; Stripe API 429/403/500 and billing-endpoint 403/429/503 show a message and never sign the user out; Free limits 10 chats / 1 summary then 429; Plus limits 200 chats / 15 summaries then 429; failed generations are refunded.

## 5. Remaining risks and limitations

* Real Stripe has not been exercised (no key). Treat the purchase journey as **unproven against Stripe** until step 3 above is done.
* Quota is a **backend-global** flag. Metering and the `/chat/stream` guard (503 while quotas are on) apply to every authenticated user, including Mobile, by design ("Web and Mobile share one balance"). Do not enable it on a shared backend without a Mobile check.
* A user with an active pass cannot buy another (409); when it expires they can renew (a new, separate pass). Overlapping passes are never summed.
* The access pass in the legacy Web flow (`/billing`, Prisma) is separate and unchanged except for refusing live keys outside production.
* Staging webhooks need a public HTTPS URL; local `http://localhost` return URLs are accepted only when `APP_ENV` is `development` or `test`.
