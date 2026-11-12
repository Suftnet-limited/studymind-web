// Browser tests for the AI study tools (Tutor, Quiz, Flashcards, Summary).
// They run against a CONTROLLED FIXTURE AI (tests/fixtures/ai-shim.mjs): the Web proxy, authentication, module access
// and UI are real; the AI answers are deterministic fixtures. They do NOT prove live OpenAI-backed AI works.
import { expect, test, type Page } from '@playwright/test';
import { apiAccount, apiCreateClass, expectNoHorizontalScroll, shot, signIn } from './helpers';

async function openModule(page: Page, email: string, moduleId: string) {
  await page.goto('/my-learning');
  await signIn(page, email);
  await page.goto(`/my-learning/modules/${moduleId}`);
  await expect(page.getByRole('tablist', { name: 'Module sections' })).toBeVisible();
}
async function enrolledStudent(baseURL: string, role: 'student' | 'self_learner' = 'student') {
  const lecturer = await apiAccount(baseURL, 'ai-lec', 'lecturer');
  const mod = await apiCreateClass(lecturer.ctx, 'Physics 101 (AI E2E)');
  const learner = await apiAccount(baseURL, `ai-${role}`, role);
  expect((await learner.ctx.post('/api/studymind/modules/join', { data: { course_id: mod.id } })).status()).toBe(200);
  return { lecturer, mod, learner };
}
const tab = (page: Page, name: string) => page.getByRole('tab', { name });
const LEAKS = /traceback|sk-fixture|incorrect api key|\.py"/i;

test('Chat: empty state, loading, markdown answer with citations, follow-up and new chat', async ({ page, baseURL }, info) => {
  const { mod, learner } = await enrolledStudent(baseURL!);
  await openModule(page, learner.email, mod.id);
  await expect(page.getByText('Ask a question about this module.')).toBeVisible();
  await expect(page.getByText(/No indexed study material yet/)).toBeVisible();   // honest empty-materials hint
  await shot(page, info, '20-tutor-empty');

  await page.getByRole('button', { name: 'Using module materials' }).click();                  // the sources / answer-level selector
  await page.getByRole('menuitemradio', { name: 'Simple' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Simple' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.getByLabel('Ask a question').fill("Explain Newton's second law trigger_slow");
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Thinking…' })).toBeVisible();   // loading state
  await expect(page.getByRole('button', { name: 'Send question' })).toBeDisabled();
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log.getByText("Explain Newton's second law trigger_slow")).toBeVisible();
  await expect(log.getByText('Newton\'s second law', { exact: false }).first()).toBeVisible();
  await expect(log.locator('strong').first()).toContainText("Newton's second law");          // markdown rendered, not raw
  await expect(log.getByText('F = m a')).toBeVisible();
  await expect(log.getByText('**')).toHaveCount(0);
  await expect(log.getByTestId('citation')).toHaveCount(1);                                    // two chunks, one document
  await expect(log.getByTestId('citation')).toContainText('physics-notes.pdf');
  await expect(log.getByTestId('citation')).toHaveAttribute('title', /net force/);
  await shot(page, info, '21-tutor-answer-with-citation');
  await expectNoHorizontalScroll(page);

  // Continue the conversation
  await page.getByLabel('Ask a question').fill('Now work it out for 5 kg at 3 m/s^2 (force)');
  await page.keyboard.press('Enter');
  await expect(log.getByText('Now work it out for 5 kg at 3 m/s^2 (force)')).toBeVisible();
  await expect(log.getByTestId('citation')).toHaveCount(2);
  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(page.getByText('Ask a question about this module.')).toBeVisible();
  await expect(log.getByTestId('citation')).toHaveCount(0);
});

test('Chat: no-material answer and provider failure are handled; the conversation can continue', async ({ page, baseURL }, info) => {
  const { mod, learner } = await enrolledStudent(baseURL!, 'self_learner');
  await openModule(page, learner.email, mod.id);
  const ask = async (text: string) => { await page.getByLabel('Ask a question').fill(text); await page.getByRole('button', { name: 'Send question' }).click(); };
  await ask('TRIGGER_EMPTY topic');
  await expect(page.getByText('No matching study material was found for this question.')).toBeVisible();
  await expect(page.getByText('Upload a document that covers this topic')).toBeVisible();
  await ask('TRIGGER_ERROR boom');
  const alert = page.getByRole('alert').filter({ hasText: /unavailable/i });
  await expect(alert).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(LEAKS);
  await shot(page, info, '22-tutor-error');
  await ask('TRIGGER_429 limit');
  await expect(page.getByRole('alert').filter({ hasText: /allowance/i })).toBeVisible();
  await ask('Explain Newton force');                               // still works afterwards
  await expect(page.getByTestId('citation').last()).toContainText('physics-notes.pdf');
});

test('Quiz: one question at a time, navigator, answer gating, submit, score, correctness and explanations', async ({ page, baseURL }, info) => {
  const { mod, learner } = await enrolledStudent(baseURL!);
  await openModule(page, learner.email, mod.id);
  await tab(page, 'Quiz').click();
  await expect(page.getByText(/Generate a multiple-choice quiz/)).toBeVisible();
  await page.getByLabel('Focus on a topic (optional)').first().fill('TRIGGER_SLOW');
  await page.getByRole('button', { name: 'Generate quiz' }).click();
  await expect(page.getByRole('button', { name: 'Generating quiz…' })).toBeDisabled();          // loading state
  await expect(page.getByRole('status').filter({ hasText: 'up to a minute' })).toBeVisible();
  const group = page.getByRole('group');
  await expect(group).toHaveCount(1);                                                            // one question at a time
  await expect(page.getByText('Question 1 of 5')).toBeVisible();
  await expect(page.getByText('0 of 5 answered')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(await page.locator('body').innerText()).not.toMatch(/Explanation:/);                     // answers withheld before submission
  await expect(page.getByText('Your score and explanations appear after you submit.')).toBeVisible();
  await shot(page, info, '23-quiz-question');

  // Question 1 wrong ("8 N"), the rest with option b ("15 N", "m v", "halve" are correct; others vary)
  await group.getByRole('radio').first().check();
  await expect(page.getByText('1 of 5 answered')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Question 1, current' })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Question 2 of 5')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Question 2, current' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Question 1, done' })).toBeVisible();              // answered questions are marked in the grid
  await page.getByRole('button', { name: 'Previous' }).click();                                  // go back: the answer is remembered
  await expect(group.getByRole('radio').first()).toBeChecked();
  await page.getByRole('button', { name: 'Question 5' }).click();                                // jump with the navigator
  await expect(page.getByText('Question 5 of 5')).toBeVisible();
  const submit = page.getByRole('button', { name: 'Submit quiz' });
  await expect(submit).toBeDisabled();                                                           // not every question is answered yet
  await expect(page.getByText(/Answer every question to submit \(4 left\)\./)).toBeVisible();
  await group.getByRole('radio').nth(1).check();
  for (const n of [2, 3, 4]) { await page.getByRole('button', { name: new RegExp(`^Question ${n}`) }).click(); await group.getByRole('radio').nth(1).check(); }
  await page.getByRole('button', { name: /^Question 5/ }).click();
  await expect(submit).toBeEnabled();
  await shot(page, info, '23b-quiz-ready-to-submit');
  await submit.click();
  await expect(page.getByTestId('quiz-score')).toBeVisible();
  await expect(page.getByTestId('quiz-score')).toContainText(/Score: \d+%/);
  await expect(page.getByText('Explanation:').first()).toBeVisible();
  await expect(page.getByLabel('Correct answer').first()).toBeVisible();
  await expect(page.getByLabel('Your answer was incorrect').first()).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);                                          // locked after submission
  await expect(page.getByRole('button', { name: /^Question 1, incorrect/ })).toBeVisible();      // the grid now shows correct / incorrect
  await shot(page, info, '24-quiz-results');
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Generate a new quiz' }).click();
  await expect(page.getByRole('button', { name: 'Generate quiz' })).toBeVisible();
});

test('Flashcards: generate, flip, navigate within bounds, regenerate', async ({ page, baseURL }, info) => {
  const { mod, learner } = await enrolledStudent(baseURL!);
  await openModule(page, learner.email, mod.id);
  await tab(page, 'Flashcards').click();
  await page.getByRole('button', { name: 'Generate flashcards' }).click();
  await expect(page.getByTestId('card-counter')).toHaveText('Card 1 of 6');
  const card = page.getByTestId('flashcard');
  await expect(card).toContainText("State Newton's second law.");
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await card.click();
  await expect(card).toContainText('F = m a');
  await expect(card).toContainText('Answer');
  await shot(page, info, '25-flashcard-flipped');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByTestId('card-counter')).toHaveText('Card 2 of 6');
  await expect(card).toContainText('What is the SI unit of force?');   // flips back to the question side on navigation
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByTestId('card-counter')).toHaveText('Card 6 of 6');
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Generate a new set' }).click();
  await expect(page.getByTestId('card-counter')).toHaveText('Card 1 of 6');
});

test('Summary: generate with a topic, rendered Markdown, copy, regenerate', async ({ page, baseURL, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { mod, learner } = await enrolledStudent(baseURL!);
  await openModule(page, learner.email, mod.id);
  await tab(page, 'Summary').click();
  await page.getByLabel('Summarise a topic (optional)').fill('Momentum');
  await page.getByRole('button', { name: 'Generate summary' }).click();
  const summary = page.getByTestId('summary');
  await expect(summary).toBeVisible();
  await expect(summary.getByRole('heading', { name: 'Summary: Momentum' })).toBeVisible();
  await expect(summary.locator('strong').first()).toContainText("Newton's laws");
  await expect(summary.locator('ol li')).toHaveCount(2);
  await expect(page.getByText('Based on 2 documents')).toBeVisible();
  await page.getByRole('button', { name: 'Copy summary' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Newton's laws");
  await shot(page, info, '26-summary');
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Regenerate' }).click();
  await expect(page.getByRole('button', { name: 'Generate summary' })).toBeVisible();
});

test('Quiz, Flashcards and Summary: empty-material and failure states are readable and recoverable', async ({ page, baseURL }, info) => {
  const { mod, learner } = await enrolledStudent(baseURL!);
  await openModule(page, learner.email, mod.id);
  for (const [name, button, topicLabel] of [['Quiz', 'Generate quiz', 'Focus on a topic (optional)'], ['Flashcards', 'Generate flashcards', 'Focus on a topic (optional)'], ['Summary', 'Generate summary', 'Summarise a topic (optional)']] as const) {
    await tab(page, name).click();
    const panel = page.getByRole('tabpanel', { name });
    await panel.getByLabel(topicLabel).fill('TRIGGER_EMPTY');
    await panel.getByRole('button', { name: button }).click();
    await expect(panel.getByRole('alert').filter({ hasText: /no indexed content/i })).toBeVisible();
    await panel.getByLabel(topicLabel).fill('TRIGGER_ERROR');
    await panel.getByRole('button', { name: button }).click();
    await expect(panel.getByRole('alert').filter({ hasText: /unavailable/i })).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(LEAKS);
    await panel.getByLabel(topicLabel).fill('');
    await panel.getByRole('button', { name: button }).click();     // recovers
    await expect(panel.getByRole('alert')).toHaveCount(0);
  }
  await shot(page, info, '27-recovered');
});

test('navigation: tabs are keyboard accessible and each tool keeps its state when switching', async ({ page, baseURL }) => {
  const { mod, learner } = await enrolledStudent(baseURL!);
  await openModule(page, learner.email, mod.id);
  await page.getByLabel('Ask a question').fill('Explain Newton force');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByTestId('citation')).toHaveCount(1);
  await tab(page, 'Chat').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'Quiz')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Chat' })).toBeHidden();
  await page.keyboard.press('ArrowLeft');
  await expect(tab(page, 'Chat')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('citation')).toHaveCount(1);          // conversation survived the tab change
  await expect(page.getByRole('link', { name: /Back to learning workspace/ })).toBeVisible();
});

test('isolation: a signed-in user without access cannot see or use the tools for another module', async ({ page, baseURL }) => {
  const { mod } = await enrolledStudent(baseURL!);
  const outsider = await apiAccount(baseURL!, 'ai-outsider', 'student');
  await page.goto('/my-learning');
  await signIn(page, outsider.email);
  await page.goto(`/my-learning/modules/${mod.id}`);
  await expect(page.getByRole('alert').filter({ hasText: /not found, or you do not have access/i })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Module sections' })).toHaveCount(0);
  // Direct requests from the outsider's authenticated browser session are refused too
  for (const [what, data] of [['chat', { message: 'hello' }], ['quiz', {}], ['flashcards', {}], ['summary', {}]] as const) {
    const r = await page.request.post(`/api/studymind/modules/${mod.id}/ai/${what}`, { data });
    expect(r.status(), what).toBe(403);
  }
});

test('lecturers can use the tools on their own class module', async ({ page, baseURL }) => {
  const lecturer = await apiAccount(baseURL!, 'ai-owner', 'lecturer');
  const mod = await apiCreateClass(lecturer.ctx, 'Owner Module (AI E2E)');
  await openModule(page, lecturer.email, mod.id);
  await page.getByLabel('Ask a question').fill('Explain Newton force');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByTestId('citation')).toContainText('physics-notes.pdf');
});
