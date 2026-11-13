// AI-generated educational text on the real screens (Chat, Summary, Quiz, Flashcards): maths, chemistry, tables, code, ordinary prose,
// damaged and malformed input, and hostile markup. Controlled fixture AI returns the rich sample (MATHSAMPLE); rendering is the real thing.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { apiAccount, apiCreateClass, expectNoHorizontalScroll, signIn } from './helpers';

const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name });
async function enter(page: Page, baseURL: string, tab: string) {
  const lecturer = await apiAccount(baseURL, 'content-lec', 'lecturer');
  const mod = await apiCreateClass(lecturer.ctx, 'Content Module');
  const student = await apiAccount(baseURL, 'content-st', 'student');
  expect((await student.ctx.post('/api/studymind/modules/join', { data: { course_id: mod.id } })).status()).toBe(200);
  await page.goto('/my-learning'); await signIn(page, student.email);
  await page.goto(`/my-learning/modules/${mod.id}`);
  await page.getByRole('tab', { name: tab }).click();
  return panel(page, tab);
}

/** Everything the shared renderer should do with the rich sample, asserted on whichever container shows it. */
async function expectRichContent(page: Page, box: Locator) {
  await expect(box.locator('.katex').first()).toBeVisible();
  const text = (await box.innerText()).replace(/\s+/g, ' ');
  const codeText = (await box.locator('pre').innerText()).replace(/\s+/g, ' ');
  const valid = text.slice(0, text.indexOf('Malformed:')).replace(codeText, '');                                   // invalid maths deliberately shows its source in red
  // maths is typeset, not shown as raw commands (the visible text of KaTeX carries no backslashes)
  for (const raw of ['\\frac', '\\times', '\\sqrt', '\\int', '\\(', '\\[', '$$', '\\ce']) expect(valid, `raw "${raw}" must not be visible`).not.toContain(raw);
  expect(await box.locator('.katex-mathml annotation[encoding="application/x-tex"]').allTextContents()).toEqual(expect.arrayContaining([
    '\\frac{2}{5}+\\frac{3}{10}=\\frac{7}{10}', '\\frac{1}{2}+\\frac{1}{4}=\\frac{3}{4}',                                // $..$ and the old \(..\) style
    '\\int_0^1 x^2\\,dx=\\frac{1}{3}', 'ax^2+bx+c=0',                                                                    // $$..$$ and the old \[..\] style
    'x^2+y^2=z^2', '\\sqrt{144}=12', '6.02\\times10^{23}', '\\frac{9}{10}', '\\frac{3}{4}',                              // double-encoded and JSON-damaged
  ]));
  expect(await box.locator('.katex-display').count(), 'display equations').toBeGreaterThanOrEqual(2);
  expect(await box.locator('annotation').allTextContents().then((a) => a.some((t) => t.includes('2H2')))).toBe(true);  // \ce{} chemistry via mhchem
  // Unicode science symbols pass through exactly as written
  for (const s of ['H₂O', 'CO₂', 'H₂SO₄', 'SO₄²⁻', 'Na⁺', '2H₂ + O₂ → 2H₂O', '⇌', 'ΔT', 'λ', 'Ω', 'μ', '°C', 'E = mc²', '∞', '∂']) expect(text).toContain(s);
  // Markdown structure
  await expect(box.getByRole('heading', { name: 'Year 5: adding fractions' })).toBeVisible();
  await expect(box.getByRole('heading', { name: 'Science' })).toBeVisible();
  expect(await box.locator('table').count()).toBe(1);
  expect(await box.locator('th').allTextContents()).toEqual(['Shape', 'Sides', 'Area formula']);
  expect(await box.locator('ol > li').count()).toBe(3);
  expect(await box.locator('blockquote').count()).toBe(1);
  expect(await box.locator('pre code.language-python .hljs-keyword').count(), 'code is syntax highlighted').toBeGreaterThan(0);
  expect(await box.locator('pre').innerText()).toContain('costs $5 and \\(x\\) stay as written');                       // code is verbatim
  // Ordinary prose stays prose: currency is not maths, quotes and bold survive
  expect(text).toContain('The book costs $5 and the pen $10');
  expect(text).toContain('"Prices"');
  expect(await box.locator('strong', { hasText: 'Chapter 2' }).count()).toBe(1);
  expect(text, '<sup> shows as a superscript, not a tag').toContain('Area is 5 m');
  expect(text).not.toContain('<sup>');
  // Malformed maths does not break the page: the rest of the content is still there
  expect(text).toContain('Malformed:');
  expect(await box.locator('.katex-error').count(), 'the invalid expression is flagged, not fatal').toBeGreaterThan(0);
  await expect(box.getByText('good link')).toBeVisible();
  // Hostile markup is inert
  expect(await box.locator('script, img, iframe, object, embed').count(), 'no script/img/iframe elements are created').toBe(0);
  expect(await box.locator('[onerror], [onclick]').count()).toBe(0);
  expect(await box.locator('a[href^="javascript:"]').count()).toBe(0);
  expect(await box.getByRole('link', { name: 'good link' }).getAttribute('href')).toBe('https://example.com/page');
  expect(await box.getByRole('link', { name: 'good link' }).getAttribute('rel')).toContain('noopener');
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss), 'injected script never ran').toBeUndefined();
}

test('Chat answers: maths, chemistry, tables, code and prose render; hostile markup is inert', async ({ page, baseURL }) => {
  const chat = await enter(page, baseURL!, 'Chat');
  await chat.getByLabel('Ask a question').fill('MATHSAMPLE please'); await page.keyboard.press('Enter');
  const answer = chat.getByRole('log', { name: 'Conversation' }).locator('[data-ai-content]');
  await expectRichContent(page, answer);
  await expectNoHorizontalScroll(page);
});

test('Summary: the same rendering', async ({ page, baseURL }) => {
  const tab = await enter(page, baseURL!, 'Summary');
  await tab.getByLabel('Summarise a topic (optional)').fill('MATHSAMPLE');
  await tab.getByRole('button', { name: 'Generate summary' }).click();
  await expectRichContent(page, tab.getByTestId('summary'));
  await expectNoHorizontalScroll(page);
});

test('Quiz: questions, options and explanations are typeset; the choice still works', async ({ page, baseURL }) => {
  const tab = await enter(page, baseURL!, 'Quiz');
  await tab.getByLabel('Focus on a topic (optional)').fill('MATHSAMPLE');
  await tab.getByRole('button', { name: 'Generate quiz' }).click();
  await expect(page.getByText(/Question 1 of 5/)).toBeVisible();
  const legend = tab.locator('legend');
  await expect(legend.locator('.katex').first()).toBeVisible();
  expect((await legend.innerText())).not.toContain('\\frac');
  const options = tab.locator('fieldset label');
  expect(await options.locator('.katex').count()).toBeGreaterThanOrEqual(4);                                           // every option is maths
  await options.nth(1).click();                                                                                        // $\frac{7}{10}$ is the right answer
  await expect(options.nth(1).locator('input')).toBeChecked();
  for (let i = 0; i < 4; i++) { await tab.getByRole('button', { name: 'Next', exact: true }).click(); await tab.locator('fieldset label').nth(1).click(); }
  await tab.getByRole('button', { name: 'Submit quiz' }).click();
  const review = tab.locator('ol > li').first();
  await expect(review.getByText('Explanation:')).toBeVisible();
  await expect(review.locator('.katex').first()).toBeVisible();
  expect(await review.innerText()).not.toContain('\\frac');
  expect(await tab.locator('ol > li').nth(2).innerText(), 'chemistry options stay readable').toContain('2H₂ + O₂ → 2H₂O');
  expect(await tab.locator('ol > li').nth(3).locator('em', { hasText: 'Romeo and Juliet' }).count(), 'italics in a question').toBe(1);
  await expectNoHorizontalScroll(page);
});

test('Flashcards: front and back are typeset inside the card button; flipping and moving on still work', async ({ page, baseURL }) => {
  const tab = await enter(page, baseURL!, 'Flashcards');
  await tab.getByLabel('Focus on a topic (optional)').fill('MATHSAMPLE');
  await tab.getByRole('button', { name: 'Generate flashcards' }).click();
  const card = tab.getByTestId('flashcard');
  await expect(card.locator('.katex').first()).toBeVisible();
  expect(await card.innerText()).not.toContain('\\frac');
  await card.click();
  await expect(card).toContainText('Answer');
  await expect(card.locator('.katex').first()).toBeVisible();
  await tab.getByRole('button', { name: /^Next/ }).click();
  await expect(tab.getByTestId('card-counter')).toHaveText('Card 2 of 5');
  await tab.getByRole('button', { name: /^Next/ }).click(); await tab.getByRole('button', { name: /^Next/ }).click();
  await card.click();
  await expect(card.locator('.katex')).toHaveCount(1);                                                                // quadratic formula, typeset
  expect(await card.innerText()).not.toContain('\\pm');
  await expectNoHorizontalScroll(page);
});

test('wide equations and tables scroll inside their own box instead of the page, on every screen size', async ({ page, baseURL }) => {
  const chat = await enter(page, baseURL!, 'Chat');
  await chat.getByLabel('Ask a question').fill('MATHSAMPLE width'); await page.keyboard.press('Enter');
  const answer = chat.getByRole('log', { name: 'Conversation' }).locator('[data-ai-content]');
  await expect(answer.locator('.katex').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  const box = (await answer.boundingBox())!;
  for (const el of await answer.locator('.katex-display, [role="region"], pre').all()) {
    const b = (await el.boundingBox())!;
    expect(b.x + b.width, 'contained within the answer').toBeLessThanOrEqual(box.x + box.width + 1);
  }
});

test('a rendering failure falls back to plain text instead of crashing the page', async ({ page, baseURL }) => {
  const chat = await enter(page, baseURL!, 'Chat');
  await page.route('**/ai/chat', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    answer: 'Edge cases: $\\frac{$ $$ $$ \\[ \\( \\begin{align} ``` ~~~ | a | b |\n|--|\n<<<>>> \u0000   \\\\\\\\ end', session_id: '11111111-1111-4111-8111-111111111111', sources: [], grounded: true, no_content_found: false, suggestions: [] }) }));
  await chat.getByLabel('Ask a question').fill('weird'); await page.keyboard.press('Enter');
  await expect(chat.getByRole('log', { name: 'Conversation' })).toContainText('Edge cases:');
  await expect(chat.getByLabel('Ask a question')).toBeVisible();                                                       // the page is still alive
  await expect(page.getByText(/Application error|Unhandled Runtime Error/)).toHaveCount(0);
});
