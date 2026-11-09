import { expect, test } from '@playwright/test';
import { apiAccount, apiCreateClass, expectNoHorizontalScroll, shot, signIn } from './helpers';

test('lecturer: creates a class, copies the Course ID, and cannot join', async ({ page, baseURL, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const lecturer = await apiAccount(baseURL!, 'lec', 'lecturer');
  await page.goto('/my-learning');
  await signIn(page, lecturer.email);
  await expect(page.getByRole('button', { name: 'Join course' })).toHaveCount(0);

  await page.getByLabel('Module title').fill('Physics 201 (E2E)');
  await page.getByLabel('Access type').selectOption('class');
  await page.getByRole('button', { name: 'Create module' }).click();
  await page.getByRole('region', { name: /Owned modules/ }).getByRole('link', { name: /Physics 201/ }).click();

  const courseId = await page.getByTestId('course-id').innerText();
  expect(courseId).toMatch(/^[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Copy Course ID' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(courseId);
  await shot(page, info, '09-lecturer-course-id');
  await expectNoHorizontalScroll(page);

  // The lecturer can choose class or personal visibility for uploads
  await expect(page.getByLabel('Visibility')).toBeVisible();
});

test('indexing progress: the materials list refreshes from "Indexing…" to "Indexed"', async ({ page, baseURL }, info) => {
  const owner = await apiAccount(baseURL!, 'prog', 'self_learner');
  const mod = await (await owner.ctx.post('/api/studymind/modules', { data: { title: 'Progress Module (E2E)', access_type: 'personal' } })).json();
  await page.goto('/my-learning');
  await signIn(page, owner.email);
  let calls = 0;
  await page.route(`**/api/studymind/modules/${mod.id}/documents`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    calls += 1;
    const status = calls < 2 ? 'processing' : 'indexed';
    await route.fulfill({ json: [{ id: 'doc-1', filename: 'lecture-notes.pdf', visibility: 'personal', status, chunk_count: status === 'indexed' ? 12 : 0 }] });
  });
  await page.goto(`/my-learning/modules/${mod.id}`);
  const row = page.getByRole('listitem').filter({ hasText: 'lecture-notes.pdf' });
  await expect(row.getByText('Indexing…')).toBeVisible();
  await shot(page, info, '10-indexing-in-progress');
  await expect(row.getByText('Indexed', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/1 file · 1 indexed/)).toBeVisible();
  await shot(page, info, '11-indexed');
});

test('plans page: informational pricing, no purchase flow, allowances not yet available', async ({ page, baseURL }, info) => {
  await page.goto('/my-learning/plans');
  await expect(page.getByRole('heading', { name: 'Plans and allowances' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Pricing preview');
  await expect(page.getByText('£3.99')).toBeVisible();
  await expect(page.getByText('for 28 days')).toBeVisible();
  for (const text of ['10', '2', '1', '200', '30', '15']) await expect(page.getByRole('region', { name: 'Plans' }).getByText(text, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Coming soon — purchases are not available yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: /buy|checkout|subscribe|purchase|upgrade|pay/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /buy|checkout|subscribe|upgrade/i })).toHaveCount(0);
  await expect(page.getByText(/Sign in.*to see your remaining allowances/)).toBeVisible();
  await shot(page, info, '12-plans-signed-out');
  await expectNoHorizontalScroll(page);

  // Signed in, with the entitlement API not yet available
  const account = await apiAccount(baseURL!, 'plans', 'self_learner');
  await page.goto('/my-learning');
  await signIn(page, account.email);
  await page.getByRole('link', { name: 'Plans', exact: true }).first().click();
  await expect(page.getByText('Allowance tracking is not available yet')).toBeVisible();
  await shot(page, info, '13-plans-allowances-unavailable');
});

test('plans page: shows remaining allowances when the entitlement API responds', async ({ page, baseURL }, info) => {
  const account = await apiAccount(baseURL!, 'ent', 'self_learner');
  await page.goto('/my-learning');
  await signIn(page, account.email);
  await page.route('**/api/studymind/entitlements', (route) => route.fulfill({ json: {
    available: true, plan: 'free', expires_at: null,
    allowances: { chats: { limit: 10, remaining: 7 }, quizzes: { limit: 2, remaining: 0 }, flashcards: { limit: 2, remaining: 2 }, summaries: { limit: 1, remaining: 1 } },
  } }));
  await page.goto('/my-learning/plans');
  await expect(page.getByText('Current plan:')).toContainText('Free');
  await expect(page.getByRole('progressbar', { name: 'AI chats remaining' })).toHaveAttribute('aria-valuenow', '7');
  await expect(page.getByRole('progressbar', { name: 'Quizzes remaining' })).toHaveAttribute('aria-valuenow', '0');
  await shot(page, info, '14-plans-with-allowances');
  await expectNoHorizontalScroll(page);
});

test('layouts: no horizontal scrolling on the main pages', async ({ page, baseURL }) => {
  const account = await apiAccount(baseURL!, 'layout', 'self_learner');
  await page.goto('/my-learning/register'); await expectNoHorizontalScroll(page);
  await page.goto('/my-learning'); await signIn(page, account.email);
  await expect(page.getByRole('button', { name: 'Create module' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto('/my-learning/plans'); await expectNoHorizontalScroll(page);
});
