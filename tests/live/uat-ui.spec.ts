// UAT browser journeys against the running local UAT stack (real AI via the budget proxy): 4 paid generations + 1 tutor follow-up.
//   npx playwright test -c tests/live/playwright.uat.config.ts      (accounts come from ~/.studymind-uat/accounts.json)
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const A = JSON.parse(readFileSync(`${process.env.HOME}/.studymind-uat/accounts.json`, 'utf8'));
const SHOTS = process.env.UAT_SHOTS || 'test-results';
const tab = (page: Page, name: string) => page.getByRole('tab', { name });
async function signIn(page: Page, who: 'student' | 'lecturer') {
  await page.goto('/my-learning');
  await page.getByLabel('Email').fill(A[who].email);
  await page.getByLabel('Password').fill(A[who].password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}
async function moduleId(page: Page, title: string) {
  const mods = await (await page.request.get('/api/studymind/modules')).json();
  return mods.find((m: any) => m.title.includes(title)).id as string;
}

test('student: full study journey in the browser', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(300_000);
  await signIn(page, 'student');
  await expect(page.getByText('Introduction to Biology').first()).toBeVisible();
  // The workspace shows exactly the modules this student belongs to (the API is the source of truth), nothing more.
  const mine: string[] = (await (await page.request.get('/api/studymind/modules')).json()).map((m: { title: string }) => m.title);
  for (const title of ['Introduction to Biology', 'Introduction to Computer Science', 'Introduction to Chemistry']) {
    expect(await page.getByText(title).count() > 0, `${title} shown only if the student belongs to it`).toBe(mine.includes(title));
  }
  await page.screenshot({ path: `${SHOTS}/uat-01-student-workspace.png`, fullPage: true });
  const bio = await moduleId(page, 'Biology');
  await page.goto(`/my-learning/modules/${bio}`);
  await expect(page.getByRole('tablist', { name: 'Module sections' })).toBeVisible();
  await tab(page, 'Documents').click();                                              // materials live in the Documents tab
  await expect(page.getByText('cell-biology-and-energy.docx').first()).toBeVisible();
  await tab(page, 'AI Tutor').click();
  await page.screenshot({ path: `${SHOTS}/uat-02-module.png`, fullPage: true });

  await page.getByLabel('Ask a question').fill('How is the cell membrane structured?');
  await page.getByRole('button', { name: 'Send question' }).click();
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log.getByTestId('citation').first()).toContainText('.docx', { timeout: 60_000 });
  await expect(log).toContainText(/phospholipid|bilayer/i);
  await page.screenshot({ path: `${SHOTS}/uat-03-tutor-grounded.png`, fullPage: true });

  await page.getByLabel('Ask a question').fill('Who won the 1966 football World Cup final?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByText(/General knowledge — not from your study materials/i)).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${SHOTS}/uat-04-tutor-general.png`, fullPage: true });

  await tab(page, 'Quiz').click();
  await page.getByRole('button', { name: 'Generate quiz' }).click();
  const group = page.getByRole('group');                                          // the quiz shows one question at a time
  await expect(group).toBeVisible({ timeout: 90_000 });
  const n = Number((await page.getByText(/^Question 1 of \d+$/).innerText()).match(/of (\d+)/)![1]); expect(n).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < n; i++) { await group.getByRole('radio').nth(0).check(); if (i < n - 1) await page.getByRole('button', { name: 'Next', exact: true }).click(); }
  await page.getByRole('button', { name: 'Submit quiz' }).click();
  await expect(page.getByTestId('quiz-score')).toContainText(/Score: \d+%/);
  await expect(page.getByText('Explanation:').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/uat-05-quiz-result.png`, fullPage: true });

  await tab(page, 'Flashcards').click();
  await page.getByRole('button', { name: 'Generate flashcards' }).click();
  await expect(page.getByTestId('card-counter')).toBeVisible({ timeout: 90_000 });
  await page.getByTestId('flashcard').click();
  await expect(page.getByTestId('flashcard')).toContainText('Answer');
  await page.screenshot({ path: `${SHOTS}/uat-06-flashcards.png`, fullPage: true });

  await tab(page, 'Summary').click();
  await page.getByRole('button', { name: 'Generate summary' }).click();
  await expect(page.getByTestId('summary')).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: `${SHOTS}/uat-07-summary.png`, fullPage: true });

  const cs = await (await page.request.get('/api/studymind/modules')).json();
  expect(cs.length).toBe(mine.length);                              // still exactly the student's own modules
  await page.goto('/my-learning');                                  // the Sign out button lives on the workspace page
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await page.goto(`/my-learning/modules/${bio}`);
  await expect(page.getByRole('tablist', { name: 'Module sections' })).toHaveCount(0);
  await signIn(page, 'student');                                   // log back in
  await page.goto(`/my-learning/modules/${bio}`);
  await expect(page.getByRole('tablist', { name: 'Module sections' })).toBeVisible();
});

test('lecturer: login, modules, documents', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await signIn(page, 'lecturer');
  for (const t of ['Introduction to Biology', 'Introduction to Computer Science', 'Introduction to Chemistry']) await expect(page.getByText(t).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/uat-08-lecturer-workspace.png`, fullPage: true });
  const bio = await moduleId(page, 'Biology');
  await page.goto(`/my-learning/modules/${bio}`);
  await expect(page.getByRole('tablist', { name: 'Module sections' })).toBeVisible();
  await tab(page, 'Documents').click();
  await expect(page.getByText('lecturer-private-draft.docx').first()).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('student-a-private-notes.docx');
  await page.screenshot({ path: `${SHOTS}/uat-09-lecturer-module.png`, fullPage: true });
});
