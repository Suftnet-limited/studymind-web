// Billing + allowance journeys through the REAL Web app, REAL backend, REAL database. Only Stripe is a local STAND-IN
// (tests/fixtures/stripe-standin.mjs, NOT Stripe) and only OpenAI is a free stand-in. Start the stack with:
//   STRIPE_MODE=standin OPENAI_STANDIN=1 scripts/local-uat.sh start
//   E2E_WEB_URL=http://localhost:3100 npx playwright test -c tests/live/playwright.uat.config.ts billing-journey --project=desktop
import { expect, request as pwRequest, test, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { accountMenu, expectSignedIn, signOut } from '../e2e/helpers';

const WEB = process.env.E2E_WEB_URL || 'http://localhost:3100';
const STRIPE = process.env.STRIPE_STANDIN_URL || 'http://127.0.0.1:18400';
const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
const PSQL = process.env.PSQL_BIN || '/usr/local/opt/postgresql@18/bin/psql';
const DB = process.env.UAT_DB || 'studymind_uat';
const PASSWORD = 'Bill-Test-Pass-123!';
const run = randomBytes(3).toString('hex');
const ACCESS = 'studymind_ai_access', REFRESH = 'studymind_ai_refresh';

const sql = (q: string) => execFileSync(PSQL, ['-h', '127.0.0.1', '-p', '55432', '-U', 'sm_test', '-d', DB, '-tAc', q]).toString().trim();
const control = async (path: string, body?: object, method = 'POST') => (await fetch(`${STRIPE}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
const sessionsLog = async () => (await fetch(`${STRIPE}/__sessions`)).json() as Promise<{ id: string; payment_intent: string | null; client_reference_id: string; payment_status: string }[]>;
const webhookLog = async () => (await fetch(`${STRIPE}/__log`)).json() as Promise<{ type?: string; status?: number; signature?: string; session?: string }[]>;
const dayMs = 86_400_000;

type Account = { email: string; id: string };
let n = 0;
async function newStudent(page: Page): Promise<Account> {
  const email = `bill-${run}-${++n}@example.com`;
  const r = await page.request.post('/api/studymind/auth/register', { data: { email, full_name: 'Bill Student', password: PASSWORD, role: 'self_learner' } });
  expect([200, 201]).toContain(r.status());
  const id = sql(`select id from users where email='${email}'`);
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return { email, id };
}
const entitlementRows = (id: string) => Number(sql(`select count(*) from studymind_entitlements where user_id='${id}'`));
const entitlements = async (page: Page) => (await page.request.get('/api/studymind/entitlements')).json();
const authenticated = async (page: Page) => (await (await page.request.get('/api/studymind/auth/status')).json()).authenticated;
/** The remaining-allowance bars live on their own screen (/my-learning/allowances); check one in a second tab so the current page is left where it is. */
async function expectAllowance(page: Page, name: string, attr: 'aria-valuenow' | 'aria-valuemax', value: string) {
  const tab = await page.context().newPage();
  try { await tab.goto('/my-learning/allowances'); await expect(tab.getByRole('progressbar', { name: `${name} remaining` })).toHaveAttribute(attr, value); }
  finally { await tab.close(); }
}
async function openPlans(page: Page) { await page.goto('/my-learning/plans'); await expect(page.getByRole('heading', { name: 'Choose your StudyMind plan' })).toBeVisible(); }
async function startPurchase(page: Page) {
  await openPlans(page);
  await page.getByTestId('buy-plus').click();
  await page.waitForURL(/\/pay\/cs_test_/);
  return new URL(page.url()).pathname.split('/').pop()!;
}
async function payByUi(page: Page) { await page.getByTestId('pay-ok').click(); await page.waitForURL(/\/my-learning\/plans/); }
async function purchase(page: Page) { const sid = await startPurchase(page); await payByUi(page); await expect(page.getByTestId('checkout-confirmed')).toBeVisible({ timeout: 30_000 }); return sid; }
const piOf = async (sid: string) => (await sessionsLog()).find((s) => s.id === sid)!.payment_intent!;

test.beforeAll(async () => {
  expect((await fetch(`${STRIPE}/__log`).catch(() => null))?.ok, 'Stripe stand-in not running: STRIPE_MODE=standin OPENAI_STANDIN=1 scripts/local-uat.sh start').toBe(true);
});
test.beforeEach(async () => { await control('/__reset', undefined, 'DELETE'); });

// ── The purchase journey ─────────────────────────────────────────────────
test('free user buys StudyMind Plus: checkout, signed webhook, 28-day entitlement, Plus allowances, survives reload and sign-in', async ({ page, context }) => {
  const me = await newStudent(page);
  await openPlans(page);
  await expect(page.getByRole('note')).toContainText('Test payments only');
  await expect(page.getByTestId('plan-free')).toContainText('Free');
  await expectAllowance(page, 'AI chats', 'aria-valuenow', '10');
  await expect(page.getByTestId('buy-plus')).toHaveText('Get StudyMind Plus — £3.99');
  await expect(page.getByText('Coming soon')).toHaveCount(0);

  const sid = await startPurchase(page);
  await expect(page.getByText('£3.99')).toBeVisible();                            // the stand-in Checkout shows the fixed price
  const created = (await sessionsLog()).find((s) => s.id === sid)!;
  expect(created.client_reference_id).toBe(me.id);                                // identity comes from the session, not the browser
  expect(entitlementRows(me.id), 'no access before payment').toBe(0);
  await payByUi(page);

  await expect(page.getByTestId('checkout-confirmed')).toBeVisible({ timeout: 30_000 });
  const hooks = (await webhookLog()).filter((h) => h.type === 'checkout.session.completed');
  expect(hooks.length).toBe(1); expect(hooks[0].signature).toBe('valid'); expect(hooks[0].status).toBe(200);
  expect(entitlementRows(me.id)).toBe(1);
  const e = await entitlements(page);
  expect(e.plan).toBe('plus');
  const days = (Date.parse(e.expires_at) - Date.now()) / dayMs; expect(days).toBeGreaterThan(27.9); expect(days).toBeLessThanOrEqual(28.01);
  expect(e.allowances).toEqual({ chats: { limit: 200, remaining: 200 }, quizzes: { limit: 30, remaining: 30 }, flashcards: { limit: 30, remaining: 30 }, summaries: { limit: 15, remaining: 15 } });
  await expect(page.getByTestId('plan-plus')).toContainText('Your current plan');
  await expect(page.getByTestId('plus-active')).toBeVisible();
  await expect(page.getByTestId('buy-plus')).toHaveCount(0);
  await expectAllowance(page, 'AI chats', 'aria-valuemax', '200');
  expect(await authenticated(page), 'the purchase journey must never sign the user out').toBe(true);
  expect(await context.cookies().then((c) => c.map((x) => x.name))).toEqual(expect.arrayContaining([ACCESS, REFRESH]));

  await page.reload();                                                            // refresh keeps the entitlement
  await expect(page.getByTestId('plan-plus')).toContainText('Your current plan');
  await page.goto('/my-learning'); await signOut(page);
  await expect(accountMenu(page)).toHaveCount(0);
  await page.getByLabel('Email').fill(me.email); await page.getByLabel('Password').fill(PASSWORD); await page.getByRole('button', { name: 'Sign in' }).click();
  await expectSignedIn(page);
  await openPlans(page);
  await expect(page.getByTestId('plan-plus')).toContainText('Your current plan');   // and so does signing in again

  const again = await page.request.post('/api/studymind/checkout');                // one pass at a time: no double charge
  expect(again.status()).toBe(409);
  expect((await (await fetch(`${STRIPE}/__sessions`)).json()).length).toBe(1);
});

test('cancelled checkout does not activate Plus and does not sign the user out', async ({ page }) => {
  const me = await newStudent(page);
  await startPurchase(page);
  await page.getByTestId('cancel').click();
  await page.waitForURL(/\/my-learning\/plans/);
  await expect(page.getByTestId('checkout-cancelled')).toContainText('You have not been charged');
  await expect(page.getByTestId('plan-free')).toContainText('Your current plan');
  await expect(page.getByTestId('buy-plus')).toBeVisible();
  expect(entitlementRows(me.id)).toBe(0);
  expect(await authenticated(page)).toBe(true);
});

test('declined card: nothing is charged or activated, the session survives, and the user can still pay with a good card', async ({ page }) => {
  const me = await newStudent(page);
  const sid = await startPurchase(page);
  await page.getByTestId('pay-declined').click();
  await expect(page.getByRole('alert')).toContainText('declined');
  expect(entitlementRows(me.id)).toBe(0);
  expect((await webhookLog()).filter((h) => h.type === 'checkout.session.completed').length).toBe(0);
  expect(await authenticated(page)).toBe(true);
  expect((await sessionsLog()).find((s) => s.id === sid)!.payment_status).toBe('unpaid');
  await payByUi(page);                                                            // same Checkout, good card
  await expect(page.getByTestId('checkout-confirmed')).toBeVisible({ timeout: 30_000 });
  expect(entitlementRows(me.id)).toBe(1);
});

for (const status of [429, 403, 500]) {
  test(`Stripe API failure (${status}) while starting checkout: clear message, no charge, session intact, retry works`, async ({ page, context }) => {
    const me = await newStudent(page);
    await openPlans(page);
    await control('/__fail', { match: '^/v1/checkout/sessions$', status, times: 1 });
    await page.getByTestId('buy-plus').click();
    await expect(page.getByTestId('checkout-error')).toContainText(/could not start checkout|not been charged/i);
    expect(entitlementRows(me.id)).toBe(0);
    expect(await authenticated(page), `a ${status} from billing must not sign the user out`).toBe(true);
    expect(await context.cookies().then((c) => c.map((x) => x.name))).toEqual(expect.arrayContaining([ACCESS, REFRESH]));
    await page.getByTestId('buy-plus').click();                                    // retry succeeds
    await page.waitForURL(/\/pay\/cs_test_/);
  });
}

test('payment confirmation can lag: the page waits for the webhook and never trusts the redirect', async ({ page }) => {
  const me = await newStudent(page);
  const sid = await startPurchase(page);
  await control('/__pay', { session_id: sid, deliver: false });                   // Stripe took payment but the webhook has not arrived
  await page.goto('/my-learning/plans?checkout=success');                         // the browser returns before the webhook
  await expect(page.getByTestId('checkout-confirming')).toBeVisible();
  await expect(page.getByTestId('plan-free')).toContainText('Your current plan');
  expect(entitlementRows(me.id), 'a redirect alone grants nothing').toBe(0);
  await control('/__deliver', { session_id: sid });                               // the webhook arrives
  await expect(page.getByTestId('checkout-confirmed')).toBeVisible({ timeout: 30_000 });
  expect(entitlementRows(me.id)).toBe(1);
});

const FAULT = process.env.FAULT_URL || 'http://127.0.0.1:8002';
for (const status of [403, 429, 503]) {
  test(`the billing endpoint itself answering ${status} shows a message and leaves the session intact (fault proxy)`, async ({ page, context }) => {
    const up = await fetch(`${FAULT}/__log`).catch(() => null);
    test.skip(!up?.ok, 'needs FAULT_PROXY=1 scripts/local-uat.sh start');
    await fetch(`${FAULT}/__fault`, { method: 'DELETE' });
    const me = await newStudent(page);
    await openPlans(page);
    await fetch(`${FAULT}/__fault`, { method: 'POST', body: JSON.stringify({ match: '^/api/billing/checkout$', status, times: 1 }) });
    await page.getByTestId('buy-plus').click();
    await expect(page.getByTestId('checkout-error')).toBeVisible();
    expect(entitlementRows(me.id)).toBe(0);
    expect(await authenticated(page), `${status} from billing must not sign the user out`).toBe(true);
    expect(await context.cookies().then((c) => c.map((x) => x.name))).toEqual(expect.arrayContaining([ACCESS, REFRESH]));
    await openPlans(page); await expect(page.getByTestId('plan-free')).toContainText('Your current plan');
    await fetch(`${FAULT}/__fault`, { method: 'DELETE' });
  });
}

// ── Webhook security and idempotency (real backend verification) ──────────
test('replayed and concurrent webhooks grant exactly one entitlement; bad, stale or missing signatures grant nothing', async ({ page }) => {
  const me = await newStudent(page);
  const sid = await startPurchase(page);
  await control('/__pay', { session_id: sid, deliver: false });

  for (const signature of ['bad', 'stale', 'none']) {
    const r = await control('/__deliver', { session_id: sid, signature });
    expect(r[0].status, `signature=${signature}`).toBe(400);
    expect(entitlementRows(me.id)).toBe(0);
  }
  const burst = await control('/__deliver', { session_id: sid, times: 8, concurrent: true });   // 8 simultaneous deliveries of the same payment
  expect(burst.every((r: { status: number }) => r.status === 200)).toBe(true);
  expect(entitlementRows(me.id)).toBe(1);
  const replay = await control('/__deliver', { session_id: sid, times: 3 });                  // and later replays
  expect(replay.every((r: { status: number }) => r.status === 200)).toBe(true);
  expect(entitlementRows(me.id)).toBe(1);
  expect(Number(sql(`select count(*) from studymind_entitlements where stripe_checkout_session_id='${sid}'`))).toBe(1);
});

test('a payment for one user can never activate another user', async ({ page, browser }) => {
  const a = await newStudent(page);
  const ctxB = await browser.newContext({ baseURL: WEB }); const pageB = await ctxB.newPage();
  const b = await newStudent(pageB);
  const sid = await startPurchase(page);
  await control('/__pay', { session_id: sid });
  await expect.poll(() => entitlementRows(a.id), { timeout: 15_000 }).toBe(1);
  expect(entitlementRows(b.id)).toBe(0);
  await pageB.goto('/my-learning/plans'); await expect(pageB.getByTestId('plan-free')).toContainText('Your current plan');
  await ctxB.close();
});

test('the client cannot grant itself Plus: no write route, forged bodies ignored, direct webhook without a signature refused', async ({ page }) => {
  const me = await newStudent(page);
  for (const method of ['post', 'put', 'patch', 'delete'] as const) {
    const r = await page.request[method]('/api/studymind/entitlements', { data: { plan: 'plus' } });
    expect([404, 405], `${method} /entitlements`).toContain(r.status());
  }
  const forged = await page.request.post('/api/studymind/checkout', { data: { plan: 'plus', user_id: 'someone-else', amount: 1, status: 'active' } });
  expect(forged.status()).toBe(200);                                              // only a Checkout URL comes back
  expect(Object.keys(await forged.json())).toEqual(['url']);
  expect(entitlementRows(me.id)).toBe(0);
  const s = (await sessionsLog()).at(-1)!; expect(s.client_reference_id).toBe(me.id);   // identity and price came from the server, not the body
  const cross = await page.request.post('/api/studymind/checkout', { headers: { Origin: 'https://evil.example.com' } });
  expect(cross.status()).toBe(403);                                               // another site cannot start a purchase for a signed-in user
  const anon = await pwRequest.newContext({ baseURL: WEB });
  expect((await anon.post('/api/studymind/checkout')).status()).toBe(401);
  await anon.dispose();
  const direct = await fetch(`${BACKEND}/api/billing/stripe/webhook`, { method: 'POST', body: JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: s.id } } }) });
  expect(direct.status).toBe(400);
  const forgedSig = await fetch(`${BACKEND}/api/billing/stripe/webhook`, { method: 'POST', headers: { 'Stripe-Signature': `t=${Math.floor(Date.now() / 1000)},v1=${createHmac('sha256', 'whsec_guess').update('x').digest('hex')}` }, body: '{}' });
  expect(forgedSig.status).toBe(400);
  expect(entitlementRows(me.id)).toBe(0);
});

// ── Expiry and reversals ─────────────────────────────────────────────────
test('an expired entitlement returns the user to Free and they can buy again', async ({ page }) => {
  const me = await newStudent(page);
  await purchase(page);
  sql(`update studymind_entitlements set starts_at = now() - interval '29 days', expires_at = now() - interval '1 minute' where user_id='${me.id}'`);
  await page.goto('/my-learning/plans');
  await expect(page.getByTestId('plan-free')).toContainText('Your current plan');
  await expectAllowance(page, 'AI chats', 'aria-valuemax', '10');
  await expect(page.getByTestId('buy-plus')).toBeVisible();
  expect(await authenticated(page)).toBe(true);
  await purchase(page);                                                           // a renewal creates a second, separate pass
  expect(entitlementRows(me.id)).toBe(2);
});

test('refund revokes Plus and a replayed or earlier event cannot bring it back; a partial refund suspends it', async ({ page }) => {
  const me = await newStudent(page);
  const sid = await purchase(page);
  const pi = await piOf(sid);
  await control('/__refund', { payment_intent: pi });
  await expect.poll(() => sql(`select status from studymind_entitlements where user_id='${me.id}'`), { timeout: 15_000 }).toBe('revoked');
  await page.reload(); await expect(page.getByTestId('plan-free')).toContainText('Your current plan');
  await control('/__deliver', { session_id: sid, times: 2 });                     // the original "paid" event is replayed out of order
  await control('/__deliver', { session_id: sid, type: 'charge.dispute.closed', payment_intent: pi });
  expect(sql(`select status from studymind_entitlements where user_id='${me.id}'`)).toBe('revoked');
  expect(entitlementRows(me.id)).toBe(1);

  const other = await newStudent(page);
  const sid2 = await purchase(page);
  await control('/__refund', { payment_intent: await piOf(sid2), amount: 100 });
  await expect.poll(() => sql(`select status from studymind_entitlements where user_id='${other.id}'`), { timeout: 15_000 }).toBe('suspended');
  await page.reload(); await expect(page.getByTestId('plan-free')).toContainText('Your current plan');
  expect(await authenticated(page)).toBe(true);
});

test('mobile viewport: Plans, purchase button and Plus state have no horizontal scroll', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await newStudent(page);
  await openPlans(page);
  await expect(page.getByTestId('buy-plus')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await purchase(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

// ── Allowances are enforced and recorded (free OpenAI stand-in: no cost) ──
let moduleId = '';
async function ensureModule() {
  if (moduleId) return moduleId;
  const lec = await pwRequest.newContext({ baseURL: WEB });
  const email = `bill-${run}-lecturer@example.com`;
  expect([200, 201]).toContain((await lec.post('/api/studymind/auth/register', { data: { email, full_name: 'Bill Lecturer', password: PASSWORD, role: 'lecturer' } })).status());
  const mod = await (await lec.post('/api/studymind/modules', { data: { title: `Allowance module ${run}`, access_type: 'class' } })).json();
  const up = await lec.post(`/api/studymind/modules/${mod.id}/documents`, { multipart: { file: { name: 'cells.txt', mimeType: 'text/plain', buffer: Buffer.from('Mitochondria produce ATP by oxidative phosphorylation. The nucleus stores DNA. Ribosomes build proteins. The cell membrane is a phospholipid bilayer. '.repeat(8)) }, visibility: 'class' } });
  expect(up.status()).toBe(201);
  for (let i = 0; i < 40; i++) { const l = await (await lec.get(`/api/studymind/modules/${mod.id}/documents`)).json(); if ((Array.isArray(l) ? l : l.documents).some((d: { status: string }) => d.status === 'indexed')) break; await new Promise((r) => setTimeout(r, 1000)); }
  await lec.dispose(); moduleId = mod.id; return moduleId;
}
async function joinedStudent(page: Page): Promise<Account> {
  const me = await newStudent(page); const id = await ensureModule();
  expect([200, 409]).toContain((await page.request.post('/api/studymind/modules/join', { data: { course_id: id } })).status());
  return me;
}
const use = async (api: APIRequestContext, feature: 'chat' | 'summary', i: number) => feature === 'chat'
  ? api.post(`/api/studymind/modules/${moduleId}/ai/chat`, { data: { message: `What do mitochondria do? (${i})` } })
  : api.post(`/api/studymind/modules/${moduleId}/ai/summary`, { data: {} });
const remaining = async (page: Page, key: 'chats' | 'summaries' | 'quizzes' | 'flashcards') => (await entitlements(page)).allowances[key].remaining;

test('Free allowances are enforced and recorded: 10 chats then a clear 429; 1 summary then 429; the session survives', async ({ page }) => {
  test.setTimeout(240_000);
  const me = await joinedStudent(page);
  for (let i = 1; i <= 10; i++) { const r = await use(page.request, 'chat', i); expect(r.status(), `chat ${i}`).toBe(200); }
  expect(await remaining(page, 'chats')).toBe(0);
  const over = await use(page.request, 'chat', 11);
  expect(over.status()).toBe(429);
  expect((await over.json()).error).toMatch(/allowance/i);
  expect(await authenticated(page), 'a 429 must not destroy the session').toBe(true);
  const s1 = await use(page.request, 'summary', 1); expect([200, 201]).toContain(s1.status());
  expect(await remaining(page, 'summaries')).toBe(0);
  expect((await use(page.request, 'summary', 2)).status()).toBe(429);
  expect(Number(sql(`select used from studymind_usage_counters where user_id='${me.id}' and feature='chat'`))).toBe(10);
  await page.goto('/my-learning/plans');
  await expectAllowance(page, 'AI chats', 'aria-valuenow', '0');
  expect(await authenticated(page)).toBe(true);
  const qBefore = await remaining(page, 'quizzes'); expect(qBefore).toBe(2);
  const q = await page.request.post(`/api/studymind/modules/${moduleId}/ai/quiz`, { data: { question_count: 5 } });
  // With the OpenAI stand-in a quiz may legitimately fail to parse (422): a failed generation must be refunded, a success must be counted.
  expect(await remaining(page, 'quizzes')).toBe(q.status() === 201 ? 1 : 2);
});

test('After buying Plus the same user gets the Plus allowances: 200 chats then 429; 15 summaries then 429', async ({ page }) => {
  test.setTimeout(480_000);
  const me = await joinedStudent(page);
  await purchase(page);
  expect(await remaining(page, 'chats')).toBe(200);
  for (let i = 1; i <= 200; i++) { const r = await use(page.request, 'chat', i); if (r.status() !== 200) throw new Error(`Plus chat ${i} -> ${r.status()}`); }
  expect(await remaining(page, 'chats')).toBe(0);
  const over = await use(page.request, 'chat', 201); expect(over.status()).toBe(429);
  for (let i = 1; i <= 15; i++) { const r = await use(page.request, 'summary', i); if (![200, 201].includes(r.status())) throw new Error(`Plus summary ${i} -> ${r.status()}`); }
  expect(await remaining(page, 'summaries')).toBe(0);
  expect((await use(page.request, 'summary', 16)).status()).toBe(429);
  expect(Number(sql(`select used from studymind_usage_counters where user_id='${me.id}' and feature='chat' and period_start=(select starts_at from studymind_entitlements where user_id='${me.id}')`))).toBe(200);
  expect(await authenticated(page)).toBe(true);
  await page.goto('/my-learning/plans'); await expect(page.getByTestId('plan-plus')).toContainText('Your current plan');
});
