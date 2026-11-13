# Stripe TEST mode for local UAT

**Status: a purchase against REAL Stripe test mode has been completed and verified (hosted Checkout, Stripe-delivered signed webhook, 28-day entitlement, real refund). Nothing here touches live Stripe, production, Mobile or Render.** A local stand-in (not Stripe) is also available for offline and repeatable tests.

## 1. Credential check (values never printed)

| Item | Result |
|---|---|
| `STRIPE_SECRET_KEY` in `.env.local` | **real `sk_test_` key; Stripe confirms test mode** (`balance.livemode === false`). It belongs to the Stripe account shown as "learnif sandbox" |
| Publishable key (`pk_test_`) | not configured and **not needed** (Checkout is a server-side redirect) |
| `STRIPE_WEBHOOK_SECRET` / `STRIPE_ACCESS_PRICE_ID` in `.env.local` | placeholders; for the old dashboard endpoint and the legacy Web checkout only. Ignored by the canonical flow |
| Webhook secret used locally | from `stripe listen --print-secret`, for the same account as the key (see "Account mismatch") |
| £3.99 for 28 days | fixed **in the backend** (`PLUS_PRICE_GBP_PENCE = 399`, `PLUS_DURATION_DAYS = 28`), sent as inline `price_data`; Stripe's hosted page shows "StudyMind Plus — 28-day pass £3.99". The Price ID is not used |
| Live credentials | none; a live key is refused by the verifier (exit 3), by `scripts/local-uat.sh`, by the backend (`sk_test_` only, `cs_test_` sessions only, `livemode: false` only) and by the legacy Web Stripe helper outside production |

**Two things only real Stripe could reveal (both fixed or decided):**
1. **Managed Payments.** Your account has Managed Payments on by default, which makes Stripe reject the inline price with *"the product tax code is missing"*. Backend settings (default: unchanged) now let the owner choose: `STUDYMIND_STRIPE_TAX_CODE=txcd_...` (send a product tax code) or `STUDYMIND_STRIPE_MANAGED_PAYMENTS=false` (opt the session out). For LOCAL TEST MODE the script opts out so UAT can run. **This is a tax / merchant-of-record decision for the owner before staging or production.**
2. **Account mismatch.** The Stripe CLI was logged into a different Stripe account than the key in `.env.local`, so it saw none of the key's events. The script now makes the CLI use the key (`STRIPE_API_KEY`), so the webhook listener always matches the account that takes the payment.

## 2. How billing works (the existing design, now wired to the UI)

Plans page -> `POST /api/studymind/checkout` (reads nothing from the browser, same-origin only) -> backend `POST /api/billing/checkout` (identity from the session, price fixed server-side, refuses with 409 if a pass is already active) -> Stripe Checkout -> Stripe sends a **signed** webhook -> backend verifies the signature (5 minute tolerance), re-reads the Checkout Session from Stripe, requires paid / GBP / 399 / test mode / matching user, and inserts **one** entitlement per session (unique key). The return redirect (`?checkout=success`) grants nothing: the page polls the entitlement for up to a minute. Refunds and disputes are reconciled from Stripe's current charge state (full refund revokes; partial refund or dispute suspends; revoked is terminal).

Flags (backend, local only, default OFF everywhere else): `STUDYMIND_BILLING_ENABLED`, `STUDYMIND_QUOTA_ENABLED`. The UI shows the button only when the backend reports `purchase_available`; otherwise the original "Coming soon" wording is unchanged.

## 3. Run it

**Real Stripe test mode:** put your TEST secret key in the Web app's `.env.local` as `STRIPE_SECRET_KEY=sk_test_...`, then `UAT_MAX_USD=4.96 STRIPE_MODE=test scripts/local-uat.sh start`. It runs the verifier, starts `stripe listen` for the key's account and forwards `checkout.session.completed` and refund/dispute events to the local backend. Sign in at http://localhost:3100/my-learning, open **Plans**, click **Get StudyMind Plus — £3.99**, choose **Card**, and pay with `4242 4242 4242 4242` (any future expiry and CVC). Declined card: `4000 0000 0000 0002`. Cancel with the arrow at the top left of Stripe's page. Automated version: `node tests/live/real-stripe-purchase.mjs [good|declined|cancel]`.
Refund a test payment (revokes Plus): `STRIPE_API_KEY=<your sk_test key> stripe refunds create -d payment_intent=pi_...`.

**Stand-in (offline, repeatable, no Stripe account):** `STRIPE_MODE=standin scripts/local-uat.sh start`. The stand-in (`tests/fixtures/stripe-standin.mjs`) is **not Stripe**; its Checkout page is labelled as such. Add `OPENAI_STANDIN=1` for free fake AI when you want to exercise limits without spending.

## 4a. Verified against REAL Stripe test mode

Real hosted Checkout (sandbox account), Card option; `cs_test_` session; £3.99 shown; no access before payment; paid with 4242 -> returned to Plans -> page confirmed Plus **after the webhook** -> exactly one entitlement, **28.00 days**, allowances 200/30/30/15; still signed in; survives a reload; a second checkout is refused (409). Declined card (4000 0000 0000 0002): Stripe shows "declined", user stays on Checkout, no entitlement, still signed in. Cancel: cancelled message, nothing charged, no entitlement, still signed in. **Real refund** through Stripe: Stripe sent `charge.refunded`, the backend answered 200, the entitlement became `revoked`. Not re-run against real Stripe (covered by the stand-in and database tests): replayed webhooks, concurrent deliveries, bad signatures, partial refunds, disputes, expiry.

## 4b. Verified with the stand-in, see the commit for exact counts

Free user buys Plus; signed webhook; entitlement for 28 days; Plus allowances (200/30/30/15); survives reload, sign-out and sign-in; cancelled and declined payments grant nothing; redirect before the webhook grants nothing; bad, stale and missing signatures rejected (400); 8 simultaneous deliveries and replays give exactly one entitlement; one user's payment cannot activate another; the browser cannot write entitlements, forged bodies are ignored, cross-site and anonymous checkout refused; expiry returns to Free and allows renewal; full refund revokes, partial refund suspends, replayed/earlier events cannot restore; Stripe API 429/403/500 and billing-endpoint 403/429/503 show a message and never sign the user out; Free limits 10 chats / 1 summary then 429; Plus limits 200 chats / 15 summaries then 429; failed generations are refunded.

**Real OpenAI + stand-in Stripe, one fresh Free user (about $0.026):** quiz 201, 201, **429**; flashcards 201, 201, **429**; summary 201, **429**; chat 10 x 200 then **429**; still signed in after every limit; bought Plus through the stand-in -> allowances 200/30/30/15, a real chat then worked and counted down to 199.

**Cost ledger note.** Fake (stand-in) AI calls used to share the real spend ledger and pushed its call counts over the real caps, so the budget proxy (correctly) refused all real AI. Fixed: stand-in mode now uses its own ledger (`ledger-standin.json`). The mixed file was archived as `~/.studymind-uat/ledger.mixed-with-standin-calls.json`, the real ledger restarted at zero, and the real ceiling for this UAT is `UAT_MAX_USD=4.96` ($5 minus the $0.0343 genuinely spent earlier). Pass `UAT_MAX_USD=4.96` (or lower) when starting for real AI.

## 5. Remaining risks and limitations

* Managed Payments / tax code needs the owner's decision (section 1). The local UAT opts out; staging and production must not silently do the same.
* Stripe's hosted page offers other payment methods (Klarna, Revolut Pay, wallets) in this sandbox. Only card was tested; delayed methods are not handled (the backend activates only when Stripe reports the session paid).
* The webhook listener is the Stripe CLI, local only. Staging needs a real webhook endpoint registered in the Stripe dashboard (public HTTPS) and its own signing secret.
* Quota is a **backend-global** flag. Metering and the `/chat/stream` guard (503 while quotas are on) apply to every authenticated user, including Mobile, by design ("Web and Mobile share one balance"). Do not enable it on a shared backend without a Mobile check.
* A user with an active pass cannot buy another (409); when it expires they can renew (a new, separate pass). Overlapping passes are never summed.
* The access pass in the legacy Web flow (`/billing`, Prisma) is separate and unchanged except for refusing live keys outside production.
* Staging webhooks need a public HTTPS URL; local `http://localhost` return URLs are accepted only when `APP_ENV` is `development` or `test`.
