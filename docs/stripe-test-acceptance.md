# Stripe test-mode acceptance checklist

No production Stripe keys or live database migrations should be used for these tests.

## Configuration
- Use a dedicated test database and apply `npx prisma migrate deploy`.
- Configure `APP_URL`, `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, `STRIPE_ACCESS_PRICE_ID` (test price) and `ACCESS_PASS_DAYS`.
- Forward signed Stripe test webhooks to `/api/billing/webhook`.
- Enable `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`.

## Required scenarios
1. **Checkout:** signed-in user purchases a pass; before webhook, no access; after paid webhook, one active pass with correct dates.
2. **Duplicate delivery:** resend the same event ID; only one pass, ledger row has `processedAt`.
3. **Concurrent delivery:** send two copies simultaneously; one may receive HTTP 503 for retry; only one pass and eventually processed ledger row.
4. **Delayed payment:** checkout not yet paid must not activate; async success activates once.
5. **Partial refund:** verify prorated duration against original purchase length; repeat the event and verify no additional reduction.
6. **Full refund:** access revoked; retry does not restore it.
7. **Dispute:** dispute created revokes access; won dispute may restore only if unrefunded and unexpired; lost dispute stays revoked.
8. **Out-of-order delivery:** replay earlier checkout after refund/dispute and verify access is not regranted.
9. **Bad signature:** HTTP 400, no database mutations.
10. **Configuration missing:** checkout and webhook fail closed.
11. **Webhook processing failure:** HTTP 500; event remains unprocessed and is retried.
12. **Expiry:** access stops once `expiresAt` passes, regardless of stored status.

## Release gate
Do not enable live payments until all scenarios pass against a test database. Verify migration status and Stripe Dashboard event delivery. Note that the current implementation still requires a specific test of out-of-order checkout and refund reconciliation; this checklist does not claim that test has passed.
