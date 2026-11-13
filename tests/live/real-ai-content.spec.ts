// REAL AI rendering check on the local UAT stack (real OpenAI through the budget proxy). Needs the "STEM Rendering Check" module that
// scripts/uat-seed-style setup created (a Word file with Maths, Physics, Chemistry, Biology and English chapters).
//   npx playwright test -c tests/live/playwright.uat.config.ts real-ai-content
// Costs a few cents per project. Every generated item is checked in the browser, on both desktop and a phone-sized viewport.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { expectSignedIn } from '../e2e/helpers';

const A = JSON.parse(readFileSync(`${process.env.HOME}/.studymind-uat/accounts.json`, 'utf8'));
const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name });

async function signIn(page: Page) {
  await page.goto('/my-learning');
  await page.getByLabel('Email').fill(A.student.email); await page.getByLabel('Password').fill(A.student.password);
  await page.getByRole('button', { name: 'Sign in' }).click(); await expectSignedIn(page);
}
async function openModule(page: Page, tab: string) {
  const mods = await (await page.request.get('/api/studymind/modules')).json();
  const id = mods.find((m: { title: string }) => m.title === 'STEM Rendering Check').id as string;
  await page.goto(`/my-learning/modules/${id}`);
  await page.getByRole('tab', { name: tab }).click();
  return panel(page, tab);
}
/** Visible text with KaTeX's hidden MathML/TeX source removed, so any backslash command left over is a real rendering failure. */
const visibleText = (box: Locator) => box.evaluate((el) => {
  const c = el.cloneNode(true) as HTMLElement;
  c.querySelectorAll('.katex-mathml, script, style').forEach((n) => n.remove());
  return (c.innerText ?? c.textContent ?? '').replace(/\s+/g, ' ').trim();
});
const RAW = [/\\[a-zA-Z]{2,}/, /\\\(|\\\)|\\\[|\\\]/, /\$\$/, /\$[^$\s][^$]*\\/, /\^\{|_\{/, /\\\\/];
async function expectClean(box: Locator, what: string) {
  const text = await visibleText(box);
  for (const re of RAW) expect(text, `${what}: raw maths in "${text.slice(0, 200)}"`).not.toMatch(re);
  expect(await box.locator('.katex-error').count(), `${what}: a formula failed to typeset`).toBe(0);
  return text;
}
async function noOverflow(page: Page, box: Locator, what: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${what}: page scrolls sideways`).toBeLessThanOrEqual(1);
  const [w, sw] = await box.evaluate((el) => [el.clientWidth, el.scrollWidth]);
  expect(sw, `${what}: content wider than its box`).toBeLessThanOrEqual(w + 1);
}
async function pickChapters(tabPanel: Locator, label: string, titles: string[]) {
  const select = tabPanel.getByLabel(label, { exact: true });
  await expect(select).toHaveJSProperty('tagName', 'SELECT');
  await select.selectOption({ label: 'Choose chapters…' });
  for (const t of titles) await tabPanel.getByRole('checkbox', { name: new RegExp(`^${t}`) }).check();
}

const report: Record<string, unknown> = {};

test.describe.configure({ mode: 'serial' });
test.setTimeout(420_000);

test('real AI: flashcards (maths, physics, chemistry, biology, English)', async ({ page }, info) => {
  await signIn(page);
  const sets: [string[], string][] = [
    [['Year 5 Mathematics', 'Algebra', 'Physics'], 'maths+physics'],
    [['Chemistry', 'Biology', 'English'], 'chemistry+biology+english'],
  ];
  const raw: Record<string, { front: string; back: string }[]> = {};
  for (const [titles, key] of sets) {
    const tab = await openModule(page, 'Flashcards');
    const generated = page.waitForResponse((r) => /\/ai\/flashcards$/.test(r.url()) && r.request().method() === 'POST', { timeout: 150_000 });
    await pickChapters(tab, 'Focus on a topic (optional)', titles);
    await tab.getByRole('button', { name: 'Generate flashcards' }).click();
    const res = await generated; expect(res.status()).toBe(201);
    const deck = await res.json(); raw[key] = deck.cards.map((c: { front: string; back: string }) => ({ front: c.front, back: c.back }));
    expect(deck.cards.length).toBeGreaterThan(4);
    const card = tab.getByTestId('flashcard');
    for (let i = 0; i < deck.cards.length; i++) {
      await expect(tab.getByTestId('card-counter')).toHaveText(`Card ${i + 1} of ${deck.cards.length}`);
      await expectClean(card, `${key} card ${i + 1} front`); await noOverflow(page, card, `${key} card ${i + 1} front`);
      await card.click(); await expect(card).toContainText('Answer');                                  // flip keeps the formatting
      await expectClean(card, `${key} card ${i + 1} back`); await noOverflow(page, card, `${key} card ${i + 1} back`);
      if (i === 0 || i === 3) await page.screenshot({ path: info.outputPath(`${key}-card${i + 1}-${info.project.name}.png`) });
      if (i < deck.cards.length - 1) await tab.getByRole('button', { name: /^Next/ }).click();
    }
    // saved content: reload, reopen from Recent, check again
    await page.reload();
    const again = await openModule(page, 'Flashcards');
    const recent = again.getByRole('complementary', { name: 'Flashcards history' });
    const toggle = recent.getByRole('button', { name: /^Recent/ });
    if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await recent.getByRole('button', { name: /^Flashcards:/ }).first().click();
    const saved = again.getByTestId('flashcard');
    await expect(again.getByTestId('card-counter')).toHaveText(new RegExp(`Card 1 of ${deck.cards.length}`));
    await expectClean(saved, `${key} reopened front`); await saved.click(); await expectClean(saved, `${key} reopened back`);
    await noOverflow(page, saved, `${key} reopened`);
  }
  report.flashcards = raw;
  writeFileSync(info.outputPath(`flashcards-raw-${info.project.name}.json`), JSON.stringify(raw, null, 2));
});

test('real AI: quiz (questions, options, review, explanations, grading, saved)', async ({ page }, info) => {
  await signIn(page);
  const tab = await openModule(page, 'Quiz');
  const generated = page.waitForResponse((r) => /\/ai\/quiz$/.test(r.url()) && r.request().method() === 'POST', { timeout: 150_000 });
  await pickChapters(tab, 'Focus on a topic (optional)', ['Year 5 Mathematics', 'Algebra', 'Physics', 'Chemistry', 'Biology']);
  await tab.getByRole('button', { name: 'Generate quiz' }).click();
  const res = await generated; expect(res.status()).toBe(201);
  const quiz = await res.json();
  writeFileSync(info.outputPath(`quiz-raw-${info.project.name}.json`), JSON.stringify(quiz.questions.map((q: any) => ({ q: q.question, options: q.options })), null, 2));
  const total = quiz.questions.length; expect(total).toBeGreaterThan(4);
  const picked: Record<string, string> = {};
  for (let i = 0; i < total; i++) {
    const q = quiz.questions[i];
    await expect(tab.getByText(`Question ${i + 1} of ${total}`)).toBeVisible();
    await expectClean(tab.locator('fieldset legend'), `question ${i + 1}`);
    const labels = tab.locator('fieldset label'); expect(await labels.count()).toBe(q.options.length);
    for (let k = 0; k < q.options.length; k++) await expectClean(labels.nth(k), `question ${i + 1} option ${k + 1}`);
    const choose = i % q.options.length;                                                             // vary the choice; grading is checked against the server
    await labels.nth(choose).click(); picked[q.id] = q.options[choose].id;
    await expect(labels.nth(choose).locator('input')).toBeChecked();
    await noOverflow(page, tab.locator('fieldset'), `question ${i + 1}`);
    if (i === 0) await page.screenshot({ path: info.outputPath(`quiz-q1-${info.project.name}.png`) });
    if (i < total - 1) await tab.getByRole('button', { name: 'Next', exact: true }).click();
  }
  const submitted = page.waitForResponse((r) => /\/ai\/quiz\/[0-9a-f-]{36}$/i.test(r.url()) && r.request().method() === 'POST');
  await tab.getByRole('button', { name: 'Submit quiz' }).click();
  const graded = await (await submitted).json();
  expect(graded.total).toBe(total);
  const sent = JSON.parse((await (await submitted).request().postData()) ?? '{}');
  for (const a of sent.answers ?? []) expect(a.answer, 'the chosen option id is what is graded').toBe(picked[a.question_id]);
  const correct = graded.questions.filter((q: any) => q.is_correct).length;
  expect(graded.correct).toBe(correct);
  expect(graded.questions.every((q: any) => q.is_correct === (q.student_answer === q.correct_answer))).toBe(true);
  const results = tab.locator('ol > li');
  await expect(results).toHaveCount(total);
  await expect(tab.getByText(new RegExp(`${correct} of ${total}`)).first()).toBeVisible();
  for (let i = 0; i < total; i++) {
    const item = results.nth(i);
    await expectClean(item, `review ${i + 1}`);
    await expect(item.getByText('Explanation:')).toBeVisible();
    await expect(item.getByLabel('Correct answer')).toHaveCount(1);
    if (!graded.questions[i].is_correct) await expect(item.getByLabel('Your answer was incorrect')).toHaveCount(1);
    await noOverflow(page, item, `review ${i + 1}`);
  }
  await page.screenshot({ path: info.outputPath(`quiz-review-${info.project.name}.png`), fullPage: true });
  writeFileSync(info.outputPath(`quiz-graded-${info.project.name}.json`), JSON.stringify(graded.questions.map((q: any) => ({ q: q.question, options: q.options, correct: q.correct_answer, explanation: q.explanation })), null, 2));
  // saved content: reload, reopen from Recent, results still render
  await page.reload();
  const again = await openModule(page, 'Quiz');
  const recent = again.getByRole('complementary', { name: 'Quiz history' });
  const toggle = recent.getByRole('button', { name: /^Recent/ });
  if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await recent.getByRole('button', { name: /^Quiz:/ }).first().click();
  const reopened = again.locator('ol > li');
  await expect(reopened).toHaveCount(total);
  for (let i = 0; i < total; i++) await expectClean(reopened.nth(i), `reopened review ${i + 1}`);
  await expect(again.getByText('Explanation:').first()).toBeVisible();
});

test('real AI: AI Tutor answer with maths and chemistry', async ({ page }, info) => {
  await signIn(page);
  const chat = await openModule(page, 'Chat');
  const answered = page.waitForResponse((r) => /\/ai\/chat$/.test(r.url()) && r.request().method() === 'POST', { timeout: 150_000 });
  await chat.getByLabel('Ask a question').fill('Show the worked example for adding 2/5 and 3/10, solving x² - 5x + 6 = 0, the balanced equation for photosynthesis, and F = ma. Write the formulas clearly.');
  await page.keyboard.press('Enter');
  const body = await (await answered).json();
  writeFileSync(info.outputPath(`tutor-raw-${info.project.name}.txt`), body.answer);
  const answer = chat.getByRole('log', { name: 'Conversation' }).locator('[data-ai-content]').last();
  await expect(answer).toBeVisible();
  await expectClean(answer, 'tutor answer'); await noOverflow(page, answer, 'tutor answer');
  await page.screenshot({ path: info.outputPath(`tutor-${info.project.name}.png`), fullPage: true });
});
