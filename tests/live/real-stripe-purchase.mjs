// REAL Stripe TEST-mode purchase journey through Stripe's hosted Checkout page (not a stand-in). Run only against a stack started with
//   UAT_MAX_USD=4.96 STRIPE_MODE=test scripts/local-uat.sh start        (needs a real sk_test_ key in .env.local and the Stripe CLI logged in)
//   node tests/live/real-stripe-purchase.mjs [good|declined|cancel]...   (default: all three, in that order)
// Uses a fresh throwaway account per scenario. Prints PASS/FAIL lines; never prints a key.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const WEB = process.env.E2E_WEB_URL || 'http://localhost:3100';
const PSQL = '/usr/local/opt/postgresql@18/bin/psql';
const sql = (q) => execFileSync(PSQL, ['-h', '127.0.0.1', '-p', '55432', '-U', 'sm_test', '-d', 'studymind_uat', '-tAc', q]).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, what, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${extra ? `  [${extra}]` : ''}`); return ok; };
const scenarios = process.argv.slice(2).length ? process.argv.slice(2) : ['good', 'declined', 'cancel'];

const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
async function newUser(ctx) {
  const page = await ctx.newPage();
  const email = `realstripe-${randomBytes(3).toString('hex')}@example.com`;
  const r = await page.request.post(`${WEB}/api/studymind/auth/register`, { data: { email, full_name: 'Real Stripe Test', password: 'Stripe-Test-Pass-123!', role: 'self_learner' } });
  if (r.status() !== 201) throw new Error(`register ${r.status()}`);
  return { page, email, id: sql(`select id from users where email='${email}'`) };
}
const authed = async (page) => (await (await page.request.get(`${WEB}/api/studymind/auth/status`)).json()).authenticated;
const rows = (id) => Number(sql(`select count(*) from studymind_entitlements where user_id='${id}'`));
async function toStripe(page) {
  await page.goto(`${WEB}/my-learning/plans`);
  await page.getByTestId('buy-plus').click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000 });
}
async function fillCard(page, number) {
  // Stripe's hosted page offers several payment methods; choose Card first so the card fields appear.
  // (a plain locator click is intercepted by an overlay on this page; a real mouse click at the row works)
  const row = await page.getByText('Card', { exact: true }).first().boundingBox();
  await page.mouse.click(row.x + row.width / 2, row.y + row.height / 2);
  await page.locator('#cardNumber').waitFor({ timeout: 45_000 });
  await page.locator('#cardNumber').fill(number);
  await page.locator('#cardExpiry').fill('12 / 34');
  await page.locator('#cardCvc').fill('123');
  const name = page.locator('#billingName'); if (await name.count()) await name.fill('Real Stripe Test');
  const postcode = page.locator('#billingPostalCode'); if (await postcode.count()) await postcode.fill('SW1A 1AA');
  await page.getByRole('button', { name: 'Pay', exact: true }).click({ force: true });
}

for (const scenario of scenarios) {
  console.log(`\n=== real Stripe test mode: ${scenario} ===`);
  const ctx = await browser.newContext();
  try {
    const me = await newUser(ctx); const page = me.page;
    await toStripe(page);
    check(/checkout\.stripe\.com/.test(page.url()), 'redirected to Stripe-hosted Checkout');
    check(/cs_test_/.test(page.url()), 'Checkout Session is a TEST session (cs_test_)');
    await page.waitForLoadState('networkidle').catch(() => {}); await sleep(2500);
    const body = await page.locator('body').innerText();
    check(/3\.99/.test(body), 'Stripe shows £3.99');
    check(rows(me.id) === 0, 'no access before payment');
    if (scenario === 'good') {
      await fillCard(page, '4242424242424242');
      await page.waitForURL(/localhost:3100\/my-learning\/plans/, { timeout: 90_000 });
      check(true, 'Stripe returned the user to Plans');
      await page.getByTestId('checkout-confirmed').waitFor({ timeout: 60_000 }).then(() => check(true, 'page confirms Plus after the webhook (not the redirect)')).catch(() => check(false, 'page never confirmed Plus'));
      check(rows(me.id) === 1, 'exactly one entitlement created');
      const e = await (await page.request.get(`${WEB}/api/studymind/entitlements`)).json();
      const days = (Date.parse(e.expires_at) - Date.now()) / 86_400_000;
      check(e.plan === 'plus' && days > 27.9 && days <= 28.01, 'Plus for 28 days', `${days.toFixed(2)} days`);
      check(e.allowances.chats.limit === 200 && e.allowances.summaries.limit === 15, 'Plus allowances shown', JSON.stringify(Object.fromEntries(Object.entries(e.allowances).map(([k, v]) => [k, v.limit]))));
      check(await authed(page), 'still signed in');
      await page.reload(); check((await (await page.request.get(`${WEB}/api/studymind/entitlements`)).json()).plan === 'plus', 'entitlement survives a reload');
      check((await page.request.post(`${WEB}/api/studymind/checkout`)).status() === 409, 'a second purchase is refused while Plus is active');
      const pi = sql(`select stripe_payment_intent_id from studymind_entitlements where user_id='${me.id}'`);
      check(/^pi_/.test(pi), 'payment intent recorded');
      console.log(`INFO  payment_intent=${pi.slice(0, 8)}… (use it to refund: stripe refunds create -d payment_intent=${pi})`);
    } else if (scenario === 'declined') {
      await fillCard(page, '4000000000000002');
      await sleep(8000);
      const t = await page.locator('body').innerText();
      check(/declined|card was declined/i.test(t), 'Stripe shows the card was declined');
      check(/checkout\.stripe\.com/.test(page.url()), 'user stays on Checkout');
      check(rows(me.id) === 0, 'no entitlement after a declined card');
      check(await authed(page), 'still signed in');
    } else if (scenario === 'cancel') {
      const back = page.locator('[data-testid="business-link"], a:has-text("Back"), a:has-text("Return")').first();
      await back.click();
      await page.waitForURL(/localhost:3100\/my-learning\/plans/, { timeout: 45_000 });
      await page.getByTestId('checkout-cancelled').waitFor({ timeout: 15_000 }).then(() => check(true, 'cancelled message shown, nothing charged')).catch(() => check(false, 'no cancelled message'));
      check(rows(me.id) === 0, 'no entitlement after cancelling');
      check(await authed(page), 'still signed in');
    }
  } catch (e) { check(false, `${scenario} scenario crashed`, String(e.message).split('\n')[0].slice(0, 160)); }
  await ctx.close();
}
await browser.close();
console.log(`\n${failed ? `${failed} FAILED` : 'ALL PASSED'}`);
process.exit(failed ? 1 : 0);
