// Browser validation of the Web app against the LIVE-OpenAI development backend (run by playwright.live.config.ts).
// Uses the accounts/modules created by tests/live/live-ai.mjs (STATE=<its ingest report>). Makes exactly 4 paid
// generations (Tutor, Quiz, Flashcards, Summary) on desktop; the mobile test makes none.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const state = JSON.parse(readFileSync(process.env.STATE!, 'utf8'));
const ids = state.steps.find((s: any) => s.name === 'accounts and modules').moduleIds as { A: string; B: string; P: string };
const email = `live-${state.run}-studentA@example.com`;
const PASSWORD = 'Live-Test-Pass-123!';
const SHOTS = process.env.LIVE_SHOTS || 'test-results';

async function signIn(page: Page) {
  await page.goto('/my-learning');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}
const tab = (page: Page, name: string) => page.getByRole('tab', { name });
const noHScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
const LEAKS = /traceback|sk-proj|incorrect api key|\.py"|openai/i;

test('desktop: session persistence, module access, and the four AI tools with real OpenAI', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(240_000);
  await signIn(page);
  await page.reload();                                                           // session persistence
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  await page.goto(`/my-learning/modules/${ids.A}`);
  await expect(page.getByRole('tablist', { name: 'Module sections' })).toBeVisible();
  await tab(page, 'Documents').click();                                              // materials live in the Documents tab
  await expect(page.getByText('biology-intro.docx').first()).toBeVisible();
  await tab(page, 'AI Tutor').click();
  await page.screenshot({ path: `${SHOTS}/live-01-module.png`, fullPage: true });

  // Tutor (generation 1): loading state, markdown, citation
  await page.getByLabel('Ask a question').fill('What is osmosis?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Thinking…' })).toBeVisible();
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log.getByTestId('citation')).toContainText('biology-intro.docx', { timeout: 60_000 });
  await expect(log).toContainText(/water potential/i);
  await page.screenshot({ path: `${SHOTS}/live-02-tutor.png`, fullPage: true });

  // Quiz (generation 2)
  await tab(page, 'Quiz').click();
  await page.getByRole('button', { name: 'Generate quiz' }).click();
  await expect(page.getByRole('button', { name: 'Generating quiz…' })).toBeDisabled();
  const group = page.getByRole('group');                                          // the quiz shows one question at a time
  await expect(group).toBeVisible({ timeout: 90_000 });
  expect(await page.locator('body').innerText()).not.toMatch(/Explanation:/);
  const n = Number((await page.getByText(/^Question 1 of \d+$/).innerText()).match(/of (\d+)/)![1]); expect(n).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < n; i++) { await group.getByRole('radio').nth(1).check(); if (i < n - 1) await page.getByRole('button', { name: 'Next', exact: true }).click(); }
  await page.getByRole('button', { name: 'Submit quiz' }).click();
  await expect(page.getByTestId('quiz-score')).toContainText(/Score: \d+%/);
  await expect(page.getByText('Explanation:').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/live-03-quiz-result.png`, fullPage: true });

  // Flashcards (generation 3)
  await tab(page, 'Flashcards').click();
  await page.getByRole('button', { name: 'Generate flashcards' }).click();
  await expect(page.getByTestId('card-counter')).toBeVisible({ timeout: 90_000 });
  await page.getByTestId('flashcard').click();
  await expect(page.getByTestId('flashcard')).toContainText('Answer');
  await page.screenshot({ path: `${SHOTS}/live-04-flashcards.png`, fullPage: true });

  // Summary (generation 4)
  await tab(page, 'Summary').click();
  await page.getByRole('button', { name: 'Generate summary' }).click();
  await expect(page.getByTestId('summary')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('summary')).toContainText(/mitochondri/i);
  await page.screenshot({ path: `${SHOTS}/live-05-summary.png`, fullPage: true });

  // Error state: a module the student is not enrolled in is refused, with no provider call and no internals shown
  await page.goto(`/my-learning/modules/${ids.B}`);
  await expect(page.getByRole('tablist', { name: 'Module sections' })).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(LEAKS);
  await expect(page.getByText('This module was not found, or you do not have access to it.')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/live-06-not-enrolled.png`, fullPage: true });
});

test('desktop: signing out ends the session (no AI calls)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await signIn(page);
  await page.getByRole('button', { name: 'Sign out' }).click();               // the button is on the workspace page
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await page.goto(`/my-learning/modules/${ids.A}`);
  await expect(page.getByRole('tablist', { name: 'Module sections' })).toHaveCount(0);
  const r = await page.request.post(`/api/studymind/modules/${ids.A}/ai/chat`, { data: { message: 'should be refused' } });
  expect(r.status()).toBe(401);                                              // proxy refuses an unauthenticated call before any AI work
});

test('mobile (Pixel 5): layouts of workspace, module and all four tools have no horizontal scroll', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await signIn(page);
  await noHScroll(page);
  await page.screenshot({ path: `${SHOTS}/live-m1-workspace.png`, fullPage: true });
  await page.goto(`/my-learning/modules/${ids.A}`);
  await expect(page.getByRole('tablist', { name: 'Module sections' })).toBeVisible();
  await noHScroll(page);
  await page.screenshot({ path: `${SHOTS}/live-m2-module.png`, fullPage: true });
  for (const name of ['Quiz', 'Flashcards', 'Summary', 'AI Tutor']) {
    await tab(page, name).click();
    await noHScroll(page);
  }
  await page.screenshot({ path: `${SHOTS}/live-m3-tutor.png`, fullPage: true });
});
