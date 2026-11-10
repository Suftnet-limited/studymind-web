// Staging-preparation fixes: signed-in header, tab layout on narrow screens, Tutor grounding label, summary/advice split.
// Runs against the controlled fixture AI (tests/fixtures/ai-shim.mjs): Web behaviour is real, the AI answers are fixtures.
import { expect, test, type Page } from '@playwright/test';
import { apiAccount, apiCreateClass, expectNoHorizontalScroll, shot, signIn } from './helpers';

async function enrolled(baseURL: string) {
  const lecturer = await apiAccount(baseURL, 'fs-lec', 'lecturer');
  const mod = await apiCreateClass(lecturer.ctx, 'Physics 101 (final staging)');
  const learner = await apiAccount(baseURL, 'fs-learner', 'student');
  expect((await learner.ctx.post('/api/studymind/modules/join', { data: { course_id: mod.id } })).status()).toBe(200);
  return { mod, learner };
}
async function openModule(page: Page, email: string, id: string) {
  await page.goto('/my-learning'); await signIn(page, email);
  await page.goto(`/my-learning/modules/${id}`);
  await expect(page.getByRole('heading', { name: 'Study tools' })).toBeVisible();
}
const header = (page: Page) => page.getByRole('banner');

test('header: signed-out visitors see Sign in / Get started; a signed-in user sees neither, and it reverts on sign-out', async ({ page, baseURL }) => {
  const { learner } = await enrolled(baseURL!);
  await page.goto('/my-learning');
  await expect(header(page).getByRole('link', { name: 'Get started' })).toBeVisible();
  await expect(header(page).getByRole('link', { name: 'Sign in' })).toBeVisible();

  await signIn(page, learner.email);
  await expect(header(page).getByRole('link', { name: 'Learning workspace' })).toBeVisible();
  await expect(header(page).getByRole('link', { name: 'Get started' })).toHaveCount(0);
  await expect(header(page).getByRole('link', { name: 'Sign in' })).toHaveCount(0);

  await page.reload();                                                       // server hint: no flash of the signed-out header
  await expect(header(page).getByRole('link', { name: 'Learning workspace' })).toBeVisible();
  await expect(header(page).getByRole('link', { name: 'Get started' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign out' }).click();              // no route change: the event keeps the header in step
  await expect(header(page).getByRole('link', { name: 'Get started' })).toBeVisible();
  await expect(header(page).getByRole('link', { name: 'Learning workspace' })).toHaveCount(0);
});

test('header: a stale or invalid session cookie does not make the header claim the user is signed in', async ({ page, context }) => {
  await context.addCookies([{ name: 'studymind_ai_access', value: 'not-a-real-token', url: 'http://127.0.0.1:3100' }]);
  await page.goto('/my-learning/register');
  await expect(header(page).getByRole('link', { name: 'Get started' })).toBeVisible();   // corrected once the status call returns
});

test('session: concurrent requests after the access cookie expires share one refresh and the user stays signed in', async ({ page, context, baseURL }) => {
  const { learner } = await enrolled(baseURL!);
  await page.goto('/my-learning'); await signIn(page, learner.email);
  await context.clearCookies({ name: 'studymind_ai_access' });                          // simulate expiry: only the refresh cookie remains
  const calls = await Promise.all([
    page.request.get('/api/studymind/learning-overview'), page.request.get('/api/studymind/auth/status'),
    page.request.get('/api/studymind/learning-overview'), page.request.get('/api/studymind/auth/status'),
  ]);
  expect(calls.map((r) => r.status())).toEqual([200, 200, 200, 200]);
  expect((await calls[1].json()).authenticated).toBe(true);
  expect((await page.request.get('/api/studymind/learning-overview')).status()).toBe(200);   // still signed in afterwards
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});

for (const width of [320, 360, 393]) {
  test(`study-tool tabs are fully visible with no clipping at ${width}px`, async ({ page, baseURL }, info) => {
    test.skip(info.project.name !== 'desktop', 'sets its own viewport');
    await page.setViewportSize({ width, height: 800 });
    const { mod, learner } = await enrolled(baseURL!);
    await openModule(page, learner.email, mod.id);
    const list = page.getByRole('tablist', { name: 'AI study tools' });
    const lb = (await list.boundingBox())!;
    for (const name of ['AI Tutor', 'Quiz', 'Flashcards', 'Summary']) {
      const tb = (await page.getByRole('tab', { name }).boundingBox())!;
      expect(tb.x, `${name} left edge`).toBeGreaterThanOrEqual(lb.x - 1);
      expect(tb.x + tb.width, `${name} right edge`).toBeLessThanOrEqual(lb.x + lb.width + 1);
    }
    expect(await list.evaluate((el) => el.scrollWidth - el.clientWidth), 'tab list needs no horizontal scrolling').toBeLessThanOrEqual(1);
    await expectNoHorizontalScroll(page);
    await shot(page, info, `tabs-${width}`);
  });
}

test('Tutor: an answer with study material is unlabelled; one without is labelled general knowledge and carries no citations', async ({ page, baseURL }, info) => {
  const { mod, learner } = await enrolled(baseURL!);
  await openModule(page, learner.email, mod.id);
  const log = page.getByRole('log', { name: 'Conversation' });
  const ask = async (text: string) => { await page.getByLabel('Ask a question').fill(text); await page.getByRole('button', { name: 'Send question' }).click(); };

  await ask("Explain Newton's second law");
  await expect(log.getByTestId('citation')).toHaveCount(1);
  await expect(log.getByTestId('ungrounded-label')).toHaveCount(0);

  await ask('Tell me something unrelated trigger_empty');
  await expect(log.getByTestId('ungrounded-label')).toHaveCount(1);
  await expect(log.getByTestId('ungrounded-label')).toContainText('General knowledge — not from your study materials');
  await expect(log.getByTestId('citation')).toHaveCount(1);                  // still only the first answer's citation
  await shot(page, info, 'tutor-ungrounded-label');
});

test('Summary: general study advice is shown in its own labelled block, separate from the document summary', async ({ page, baseURL }, info) => {
  const { mod, learner } = await enrolled(baseURL!);
  await openModule(page, learner.email, mod.id);
  await page.getByRole('tab', { name: 'Summary' }).click();
  await page.getByLabel('Summarise a topic (optional)').fill('Momentum TRIGGER_ADVICE');
  await page.getByRole('button', { name: 'Generate summary' }).click();
  const summary = page.getByTestId('summary'); const advice = page.getByTestId('study-advice');
  await expect(summary).toBeVisible();
  await expect(summary).not.toContainText('spaced repetition');
  await expect(summary).not.toContainText('General study advice');
  await expect(advice).toContainText('General study advice — not from your documents');
  await expect(advice).toContainText('Use spaced repetition');
  await shot(page, info, 'summary-with-advice');

  await page.getByRole('button', { name: 'Regenerate' }).click();            // a summary without advice shows no advice block
  await page.getByLabel('Summarise a topic (optional)').fill('Momentum');
  await page.getByRole('button', { name: 'Generate summary' }).click();
  await expect(page.getByTestId('summary')).toBeVisible();
  await expect(page.getByTestId('study-advice')).toHaveCount(0);
});
