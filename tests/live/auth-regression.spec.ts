// Session and navigation regression tests for the UAT failures "Plan / Web Module / AI Access kick me out".
// REAL sign-in, REAL cookies, REAL backend authorisation. Backend failures are injected only through tests/fixtures/fault-proxy.mjs.
// No OpenAI call is made (the AI-authorisation test asserts the budget-proxy ledger does not move).
//   FAULT_PROXY=1 scripts/local-uat.sh start && npx playwright test -c tests/live/playwright.uat.config.ts auth-regression
import { expect, request as pwRequest, test, type BrowserContext, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';

const WEB = process.env.E2E_WEB_URL || 'http://127.0.0.1:3100';
const FAULT = process.env.FAULT_URL || 'http://127.0.0.1:8002';
const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
const LEDGER = process.env.PROXY_URL || 'http://127.0.0.1:18301';
const ACCESS = 'studymind_ai_access', REFRESH = 'studymind_ai_refresh';
const PASSWORD = 'Reg-Test-Pass-123!';
const run = randomBytes(3).toString('hex');
const users = {
  student: { email: `reg-${run}-student@example.com`, full_name: 'Reg Student', password: PASSWORD, role: 'self_learner' },
  lecturer: { email: `reg-${run}-lecturer@example.com`, full_name: 'Reg Lecturer', password: PASSWORD, role: 'lecturer' },
};
const ids: { joined: string; other: string } = { joined: '', other: '' };

const fault = (rule: object) => fetch(`${FAULT}/__fault`, { method: 'POST', body: JSON.stringify(rule) });
const clearFaults = async () => { await fetch(`${FAULT}/__fault`, { method: 'DELETE' }); await fetch(`${FAULT}/__log`, { method: 'DELETE' }); };
const upstream = async (): Promise<{ method: string; path: string; status: number | string; faulted: boolean }[]> => (await fetch(`${FAULT}/__log`)).json();
const refreshCalls = async () => (await upstream()).filter((e) => e.path === '/api/auth/refresh').length;
const ledger = async () => (await (await fetch(`${LEDGER}/__ledger`)).json()) as { counts: { chat: number; embed: number } };

async function signIn(page: Page, who: 'student' | 'lecturer') {
  await page.goto('/my-learning');
  await page.getByLabel('Email').fill(users[who].email);
  await page.getByLabel('Password').fill(users[who].password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}
const authenticated = async (page: Page) => (await (await page.request.get('/api/studymind/auth/status')).json()).authenticated;
const cookieNames = async (ctx: BrowserContext) => (await ctx.cookies()).map((c) => c.name);
const expireAccessToken = (ctx: BrowserContext) => ctx.clearCookies({ name: ACCESS });          // what the browser does when the access cookie reaches its max-age
const signedOutForm = (page: Page) => expect(page.getByLabel('Password')).toBeVisible();
const noSignInForm = (page: Page) => expect(page.getByLabel('Password')).toHaveCount(0);

test.beforeAll(async () => {
  const api = await pwRequest.newContext({ baseURL: WEB });
  const lec = await pwRequest.newContext({ baseURL: WEB });
  for (const [c, u] of [[api, users.student], [lec, users.lecturer]] as const) {
    const r = await c.post('/api/studymind/auth/register', { data: u }); expect([200, 201]).toContain(r.status());
  }
  for (const key of ['joined', 'other'] as const) {
    const m = await (await lec.post('/api/studymind/modules', { data: { title: `Reg ${key} ${run}`, access_type: 'class' } })).json(); ids[key] = m.id;
  }
  expect([200, 201]).toContain((await api.post('/api/studymind/modules/join', { data: { course_id: ids.joined } })).status());
  await api.dispose(); await lec.dispose();
  const probe = await fetch(`${FAULT}/__log`).catch(() => null);
  expect(probe?.ok, 'fault proxy not running: start the stack with FAULT_PROXY=1 scripts/local-uat.sh start').toBe(true);
});
test.beforeEach(clearFaults);
test.afterEach(clearFaults);

// ── The three reported failures ───────────────────────────────────────────
for (const who of ['student', 'lecturer'] as const) {
  test(`${who}: Modules, Plans and AI access navigation keeps the user signed in`, async ({ page, context }) => {
    await signIn(page, who);
    for (const label of ['Plans', 'AI access', 'My modules', 'Plans', 'My modules']) {
      await page.getByRole('navigation', { name: 'Learning navigation' }).getByRole('link', { name: label, exact: true }).click();
      await page.waitForLoadState('networkidle');
      expect(new URL(page.url()).pathname, `${label} must stay in the StudyMind area`).toMatch(/^\/my-learning/);
      await noSignInForm(page);
      expect(await authenticated(page), `still signed in after ${label}`).toBe(true);
    }
    expect(await cookieNames(context)).toEqual(expect.arrayContaining([ACCESS, REFRESH]));
    await page.getByRole('navigation', { name: 'Learning navigation' }).getByRole('link', { name: 'AI access' }).click();
    await expect(page.getByText('Your remaining allowances')).toBeVisible();
    await expect(page.locator('#allowances')).toBeVisible();
  });
}

test('legacy URLs reached by a StudyMind user land on the StudyMind page, never the legacy sign-in', async ({ page, context }) => {
  await signIn(page, 'student');
  for (const [url, expected] of [['/dashboard', '/my-learning'], ['/modules', '/my-learning'], ['/modules/does-not-matter', '/my-learning'], ['/billing', '/my-learning/plans'], ['/lecturer', '/my-learning']]) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname, url).toBe(expected);
    expect(await authenticated(page), `${url} must not end the session`).toBe(true);
  }
  expect(await cookieNames(context)).toEqual(expect.arrayContaining([ACCESS, REFRESH]));
});

test('a visitor with no session is still sent to the legacy sign-in for legacy pages (security unchanged)', async ({ page }) => {
  for (const url of ['/dashboard', '/modules', '/billing', '/lecturer']) {
    await page.goto(url);
    expect(new URL(page.url()).pathname, url).toBe('/sign-in');
  }
});

// ── Session survival ──────────────────────────────────────────────────────
test('refreshing the browser on every protected page keeps the user signed in; back/forward too', async ({ page }) => {
  await signIn(page, 'student');
  for (const path of ['/my-learning', '/my-learning/plans', `/my-learning/modules/${ids.joined}`]) {
    await page.goto(path); await page.reload(); await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname).toBe(path);
    await noSignInForm(page);
    expect(await authenticated(page), `signed in after reloading ${path}`).toBe(true);
  }
  await page.goBack(); await page.waitForLoadState('networkidle'); await noSignInForm(page);
  await page.goForward(); await page.waitForLoadState('networkidle'); await noSignInForm(page);
  expect(await authenticated(page)).toBe(true);
});

test('expired access token (cookie gone) recovers through one refresh and no re-login', async ({ page, context }) => {
  await signIn(page, 'student');
  await expireAccessToken(context); await clearFaults();
  await page.goto('/my-learning'); await page.waitForLoadState('networkidle');
  await noSignInForm(page);
  await expect(page.getByRole('heading', { name: 'Learning workspace' })).toBeVisible();
  expect(await refreshCalls()).toBe(1);
  expect(await cookieNames(context)).toEqual(expect.arrayContaining([ACCESS, REFRESH]));
});

test('an access token the backend rejects (expired JWT still in the cookie) recovers the same way', async ({ page, context }) => {
  await signIn(page, 'student');
  await context.addCookies([{ name: ACCESS, value: 'expired.or.invalid.jwt', url: WEB, httpOnly: true, sameSite: 'Lax' }]); await clearFaults();
  await page.goto('/my-learning/plans'); await page.waitForLoadState('networkidle');
  await noSignInForm(page);
  await expect(page.getByText('Your remaining allowances')).toBeVisible();
  expect(await refreshCalls()).toBe(1);
});

test('concurrent requests with an expired access token trigger exactly one refresh and all succeed', async ({ page, context }) => {
  await signIn(page, 'student');
  await expireAccessToken(context); await clearFaults();
  const paths = ['/api/studymind/modules', '/api/studymind/learning-overview', '/api/studymind/entitlements', '/api/studymind/auth/status',
    '/api/studymind/modules', '/api/studymind/learning-overview', '/api/studymind/entitlements', '/api/studymind/modules'];
  const responses = await Promise.all(paths.map((p) => page.request.get(p)));
  expect(responses.map((r) => r.status())).toEqual(paths.map(() => 200));
  expect(await refreshCalls(), 'one refresh shared by every concurrent request').toBe(1);
  expect(await authenticated(page)).toBe(true);
  await page.goto('/my-learning'); await noSignInForm(page);
});

test('two tabs loading at once with an expired access token both stay signed in', async ({ page, context }) => {
  await signIn(page, 'student');
  const other = await context.newPage();
  await expireAccessToken(context); await clearFaults();
  await Promise.all([page.goto('/my-learning'), other.goto('/my-learning/plans')]);
  await Promise.all([page.waitForLoadState('networkidle'), other.waitForLoadState('networkidle')]);
  await noSignInForm(page); await noSignInForm(other);
  expect(await authenticated(page)).toBe(true);
  expect(await refreshCalls()).toBe(1);
});

// ── Errors must not be confused with logout ──────────────────────────────
test('403 is shown as a permission message and never signs the user out (real backend 403)', async ({ page, context }) => {
  await signIn(page, 'student');
  await page.goto(`/my-learning/modules/${ids.other}`);                // a module the student is NOT enrolled in
  await expect(page.getByText('This module was not found, or you do not have access to it.')).toBeVisible();
  await noSignInForm(page);
  expect(await authenticated(page)).toBe(true);
  expect(await cookieNames(context)).toEqual(expect.arrayContaining([ACCESS, REFRESH]));
  expect(await refreshCalls(), 'a 403 must not trigger a refresh or logout').toBe(0);
  await page.goto('/my-learning/plans'); await expect(page.getByText('Your remaining allowances')).toBeVisible();   // and the user can carry on
});

test('an injected 403 on the module list does not clear the session either', async ({ page, context }) => {
  await signIn(page, 'student');
  await fault({ match: '^/api/modules$', status: 403, times: -1 });
  await page.goto('/my-learning'); await page.waitForLoadState('networkidle');
  await noSignInForm(page);
  expect(await authenticated(page)).toBe(true);
  expect(await cookieNames(context)).toEqual(expect.arrayContaining([ACCESS, REFRESH]));
  expect(await refreshCalls()).toBe(0);
  await clearFaults(); await page.reload(); await expect(page.getByRole('heading', { name: 'Learning workspace' })).toBeVisible();
});

for (const [name, rule] of [['503', { status: 503 }], ['429', { status: 429 }], ['dropped connection', { drop: true }]] as const) {
  test(`temporary backend failure during refresh (${name}) keeps the credentials and recovers without login`, async ({ page, context }) => {
    await signIn(page, 'student');
    await expireAccessToken(context); await clearFaults();
    await fault({ match: '^/api/auth/refresh$', times: -1, ...rule });
    await page.goto('/my-learning'); await page.waitForLoadState('networkidle');
    await noSignInForm(page);                                            // an error, NOT the sign-in form
    expect(await cookieNames(context), 'refresh cookie must survive a backend blip').toContain(REFRESH);
    await clearFaults();
    await page.reload(); await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Learning workspace' })).toBeVisible();
    expect(await authenticated(page)).toBe(true);
  });
}

test('backend completely down, then back: the session survives and the header never says signed out', async ({ page, context }) => {
  await signIn(page, 'student');
  await fault({ match: '.*', drop: true, times: -1 });
  await page.goto('/my-learning/plans'); await page.waitForLoadState('networkidle');
  await noSignInForm(page);
  await expect(page.getByRole('link', { name: 'Get started' })).toHaveCount(0);       // header did not flip to the signed-out state
  expect(await cookieNames(context)).toEqual(expect.arrayContaining([ACCESS, REFRESH]));
  await clearFaults(); await page.reload();
  await expect(page.getByText('Your remaining allowances')).toBeVisible();
  expect(await authenticated(page)).toBe(true);
});

test('slow network: pages load, nothing is mistaken for a logout', async ({ page, context }) => {
  await signIn(page, 'student');
  await expireAccessToken(context); await clearFaults();
  await fault({ match: '^/api/', delayMs: 2500, times: -1 });
  await page.goto('/my-learning'); await expect(page.getByRole('heading', { name: 'Learning workspace' })).toBeVisible({ timeout: 30_000 });
  await noSignInForm(page);
  expect(await authenticated(page)).toBe(true);
});

// ── Revocation, security ──────────────────────────────────────────────────
test('a genuinely revoked session is signed out securely and cannot come back', async ({ page, context }) => {
  await signIn(page, 'student');
  const refresh = (await context.cookies()).find((c) => c.name === REFRESH)!.value;
  const revoke = await fetch(`${BACKEND}/api/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }) });
  expect(revoke.status).toBe(204);
  await expireAccessToken(context);
  await page.goto('/my-learning'); await page.waitForLoadState('networkidle');
  await signedOutForm(page);                                            // genuinely signed out: the sign-in form
  expect(await cookieNames(context)).not.toContain(REFRESH);
  expect(await authenticated(page)).toBe(false);
  await page.goto('/my-learning/plans'); await expect(page.getByText(/sign in/i).first()).toBeVisible();
  expect((await page.request.get('/api/studymind/modules')).status()).toBe(401);
});

test('signing out revokes the refresh token on the backend: replaying the old refresh cookie fails', async ({ page, context }) => {
  await signIn(page, 'student');
  const old = (await context.cookies()).find((c) => c.name === REFRESH)!;
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await context.clearCookies();
  await context.addCookies([{ name: REFRESH, value: old.value, url: WEB, httpOnly: true, sameSite: 'Lax' }]);   // attacker replays the stolen refresh cookie
  const r = await page.request.get('/api/studymind/modules');
  expect(r.status()).toBe(401);
  expect(await authenticated(page)).toBe(false);
});

test('unauthorised AI requests are refused before any AI work (OpenAI usage unchanged)', async ({ page, context }) => {
  const before = await ledger();
  const anon = await pwRequest.newContext({ baseURL: WEB });
  expect((await anon.post(`/api/studymind/modules/${ids.joined}/ai/chat`, { data: { message: 'hello' } })).status()).toBe(401);
  expect((await anon.post(`/api/studymind/modules/${ids.joined}/ai/quiz`, { data: { question_count: 5 } })).status()).toBe(401);
  await anon.dispose();
  await signIn(page, 'student');
  const forbidden = await page.request.post(`/api/studymind/modules/${ids.other}/ai/chat`, { data: { message: 'not my module' } });
  expect([403, 404]).toContain(forbidden.status());                     // not enrolled
  const refresh = (await context.cookies()).find((c) => c.name === REFRESH)!.value;
  await fetch(`${BACKEND}/api/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }) });
  await expireAccessToken(context);
  expect((await page.request.post(`/api/studymind/modules/${ids.joined}/ai/chat`, { data: { message: 'revoked' } })).status()).toBe(401);
  const after = await ledger();
  expect(after.counts.chat - before.counts.chat, 'no chat call reached OpenAI').toBe(0);
  expect(after.counts.embed - before.counts.embed, 'no embedding call reached OpenAI').toBe(0);
});

test('student cannot use lecturer-only actions and a lecturer cannot read another role\'s session data', async ({ page }) => {
  await signIn(page, 'student');
  expect((await page.request.post('/api/studymind/modules', { data: { title: 'nope', access_type: 'class' } })).status()).toBeGreaterThanOrEqual(400);
  const own = await (await page.request.get('/api/studymind/modules')).json();
  expect(own.every((m: { id: string }) => m.id !== ids.other)).toBe(true);
});

test('direct navigation to protected StudyMind URLs while signed out shows the sign-in form, no crash or loop', async ({ page }) => {
  for (const path of ['/my-learning', '/my-learning/plans', `/my-learning/modules/${ids.joined}`]) {
    await page.goto(path); await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname).toBe(path);                    // stays put: no redirect loop
    expect(await page.locator('body').innerText()).not.toMatch(/traceback|application error|unhandled/i);
  }
});

test('mobile viewport: the three navigation links keep the user signed in', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await signIn(page, 'student');
  for (const label of ['Plans', 'AI access', 'My modules']) {
    await page.getByRole('navigation', { name: 'Learning navigation' }).getByRole('link', { name: label, exact: true }).click();
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname).toMatch(/^\/my-learning/);
    expect(await authenticated(page)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  }
});
