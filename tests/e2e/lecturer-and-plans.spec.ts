import { expect, test } from '@playwright/test';
import { aiSql, aiUserId, apiAccount, apiCreateClass, expectNoHorizontalScroll, hasAiDb, openDocuments, shot, signIn } from './helpers';

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
  await openDocuments(page);
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
  await openDocuments(page);
  const row = page.getByRole('listitem').filter({ hasText: 'lecture-notes.pdf' });
  await expect(row.getByText('Indexing…')).toBeVisible();
  await shot(page, info, '10-indexing-in-progress');
  await expect(row.getByText('Indexed', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/1 file · 1 indexed/)).toBeVisible();
  await shot(page, info, '11-indexed');
});

test('plans page: informational pricing, no purchase flow, free allowances from the backend', async ({ page, baseURL }, info) => {
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
  // Real backend data for a brand-new free account
  await expect(page.getByText('Current plan:')).toContainText('Free');
  await expect(page.getByRole('progressbar', { name: 'AI chats remaining' })).toHaveAttribute('aria-valuenow', '10');
  await expect(page.getByRole('progressbar', { name: 'Summaries remaining' })).toHaveAttribute('aria-valuemax', '1');
  await expect(page.getByTestId('enforcement-note')).toContainText('not being enforced yet');
  await expect(page.getByText('Your current plan')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Plans' }).locator('div', { has: page.getByText('Your current plan') }).first()).toContainText('Free');
  await shot(page, info, '13-plans-free-backend-data');
});

test('plans page: shows "not available" when allowance data cannot be loaded', async ({ page, baseURL }, info) => {
  const account = await apiAccount(baseURL!, 'unavail', 'self_learner');
  await page.goto('/my-learning');
  await signIn(page, account.email);
  await page.route('**/api/studymind/entitlements', (route) => route.fulfill({ json: { available: false } }));
  await page.goto('/my-learning/plans');
  await expect(page.getByText('Allowance tracking is not available yet')).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByText('Your current plan')).toHaveCount(0);
  await shot(page, info, '13b-plans-allowances-unavailable');
});

test('plans page: partially consumed free allowance from the backend', async ({ page, baseURL }, info) => {
  test.skip(!hasAiDb(), 'needs E2E_AI_PSQL (disposable local AI database)');
  const account = await apiAccount(baseURL!, 'partial', 'self_learner');
  const id = aiUserId(account.email);
  const month = "date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'";
  aiSql(`insert into studymind_usage_counters(user_id,feature,period_start,used) values ('${id}','chat',${month},3),('${id}','quiz',${month},2)`);
  await page.goto('/my-learning');
  await signIn(page, account.email);
  await page.goto('/my-learning/plans');
  await expect(page.getByRole('progressbar', { name: 'AI chats remaining' })).toHaveAttribute('aria-valuenow', '7');
  await expect(page.getByRole('progressbar', { name: 'Quizzes remaining' })).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('progressbar', { name: 'Flashcard generations remaining' })).toHaveAttribute('aria-valuenow', '2');
  await expect(page.getByText('7 of 10 left')).toBeVisible();
  await expect(page.getByText('0 of 2 left')).toBeVisible();
  await shot(page, info, '14-plans-free-partially-used');
  await expectNoHorizontalScroll(page);
});

test('plans page: Plus entitlement from the backend with partial use and expiry', async ({ page, baseURL }, info) => {
  test.skip(!hasAiDb(), 'needs E2E_AI_PSQL (disposable local AI database)');
  const account = await apiAccount(baseURL!, 'plus', 'student');
  const id = aiUserId(account.email);
  aiSql(`insert into studymind_entitlements(id,user_id,stripe_checkout_session_id,status,feature_limits,starts_at,expires_at) values (gen_random_uuid(),'${id}','cs_local_e2e_${Date.now()}','active','{"chat":200,"quiz":30,"flashcards":30,"summary":15}', now() - interval '2 days', now() + interval '26 days')`);
  aiSql(`insert into studymind_usage_counters(user_id,feature,period_start,used) select user_id,'summary',starts_at,4 from studymind_entitlements where user_id='${id}'`);
  await page.goto('/my-learning');
  await signIn(page, account.email);
  await page.goto('/my-learning/plans');
  await expect(page.getByText('Current plan:')).toContainText('StudyMind Plus');
  await expect(page.getByText(/until \d{1,2} \w+ \d{4}/)).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'AI chats remaining' })).toHaveAttribute('aria-valuemax', '200');
  await expect(page.getByRole('progressbar', { name: 'Summaries remaining' })).toHaveAttribute('aria-valuenow', '11');
  await expect(page.getByText('Your current plan')).toHaveCount(1);
  await expect(page.getByText('Coming soon — purchases are not available yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: /buy|checkout|subscribe|purchase|upgrade|pay/i })).toHaveCount(0);
  await shot(page, info, '15-plans-plus-backend-data');
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

test('document privacy end to end: class material is shared, personal notes stay private to their uploader', async ({ page, browser, baseURL }, info) => {
  const lecturer = await apiAccount(baseURL!, 'vis-lec', 'lecturer');
  const mod = await apiCreateClass(lecturer.ctx, 'Privacy Module (E2E)');
  const student = await apiAccount(baseURL!, 'vis-stu', 'student');
  expect((await student.ctx.post('/api/studymind/modules/join', { data: { course_id: mod.id } })).status()).toBe(200);

  // Lecturer uploads one class file and one personal note through the UI
  await page.goto('/my-learning');
  await signIn(page, lecturer.email);
  await page.goto(`/my-learning/modules/${mod.id}`);
  await openDocuments(page);
  const upload = async (name: string, visibility: 'Class material' | 'Personal notes') => {
    await page.getByLabel('Document', { exact: true }).setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(`content of ${name}`) });
    await page.getByLabel('Visibility').selectOption({ label: visibility });
    await page.getByRole('button', { name: 'Upload document' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: name })).toBeVisible();
  };
  await upload('class-notes.txt', 'Class material');
  await upload('lecturer-only.txt', 'Personal notes');
  await expect(page.getByRole('listitem').filter({ hasText: 'class-notes.txt' })).toContainText('Class material · visible to the class');
  await expect(page.getByRole('listitem').filter({ hasText: 'lecturer-only.txt' })).toContainText('Personal note · only you can see it');
  await shot(page, info, '16-lecturer-visibility-labels');

  // Student (separate browser context) sees the class file but never the lecturer's personal note
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await studentPage.goto(`${baseURL}/my-learning`);
  await signIn(studentPage, student.email);
  await studentPage.goto(`${baseURL}/my-learning/modules/${mod.id}`);
  await openDocuments(studentPage);
  await expect(studentPage.getByRole('listitem').filter({ hasText: 'class-notes.txt' })).toBeVisible();
  await expect(studentPage.getByText('lecturer-only.txt')).toHaveCount(0);
  await expect(studentPage.getByLabel('Visibility')).toHaveCount(0); // students can only add personal notes
  await studentPage.getByLabel('Document', { exact: true }).setInputFiles({ name: 'student-note.txt', mimeType: 'text/plain', buffer: Buffer.from('my note') });
  await studentPage.getByRole('button', { name: 'Upload document' }).click();
  const mine = studentPage.getByRole('listitem').filter({ hasText: 'student-note.txt' });
  await expect(mine).toContainText('Personal note · only you can see it');
  await shot(studentPage, info, '17-student-sees-class-and-own-note');

  // Same filename as the lecturer's class file: both coexist for the student, the lecturer still sees only the class one
  await studentPage.getByLabel('Document', { exact: true }).setInputFiles({ name: 'class-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('my own take on the class notes') });
  await studentPage.getByRole('button', { name: 'Upload document' }).click();
  const sameName = studentPage.getByRole('listitem').filter({ hasText: 'class-notes.txt' });
  await expect(sameName).toHaveCount(2);
  await expect(sameName.filter({ hasText: 'Class material · visible to the class' })).toHaveCount(1);
  await expect(sameName.filter({ hasText: 'Personal note · only you can see it' })).toHaveCount(1);

  // The lecturer must not see the student's personal notes, and the class file is unaffected
  await page.reload();
  await openDocuments(page);
  await expect(page.getByRole('listitem').filter({ hasText: 'class-notes.txt' })).toHaveCount(1);
  await expect(page.getByRole('listitem').filter({ hasText: 'class-notes.txt' })).toContainText('Class material');
  await expect(page.getByRole('listitem').filter({ hasText: 'class-notes.txt' })).toBeVisible();
  await expect(page.getByText('student-note.txt')).toHaveCount(0);
  await studentContext.close();
});

test('document errors are understandable: no access to a module shows a clear message', async ({ page, baseURL }) => {
  const owner = await apiAccount(baseURL!, 'err-own', 'self_learner');
  const mod = await (await owner.ctx.post('/api/studymind/modules', { data: { title: 'Private (E2E)', access_type: 'personal' } })).json();
  const outsider = await apiAccount(baseURL!, 'err-out', 'student');
  await page.goto('/my-learning');
  await signIn(page, outsider.email);
  await page.goto(`/my-learning/modules/${mod.id}`);
  await expect(page.getByRole('alert').filter({ hasText: /not found, or you do not have access/i })).toBeVisible();
  await expect(page.getByLabel('Document', { exact: true })).toHaveCount(0); // no upload form for a module you cannot open
});
