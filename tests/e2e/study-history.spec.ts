// Recent quizzes, flashcard sets and summaries: listed, reopened, deleted, private to their owner and scoped to their module.
// Runs on the controlled fixture AI (tests/fixtures/ai-shim.mjs): Web's auth, module access and UI are real; generated content is fixture content.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { apiAccount, apiCreateClass, signIn } from './helpers';

const rail = (page: Page, name: string) => page.getByRole('complementary', { name: `${name} history` });
const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name });
const aiBase = (mod: string) => `/api/studymind/modules/${mod}/ai`;
async function expandRecent(page: Page, name: string, recentLabel: RegExp) {
  const toggle = rail(page, name).getByRole('button', { name: recentLabel });
  if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}
async function world(baseURL: string) {
  const lecturer = await apiAccount(baseURL, 'hist-lec', 'lecturer');
  const modA = await apiCreateClass(lecturer.ctx, 'History Module A');
  const modB = await apiCreateClass(lecturer.ctx, 'History Module B');
  const alice = await apiAccount(baseURL, 'hist-alice', 'student');
  const bob = await apiAccount(baseURL, 'hist-bob', 'student');
  for (const who of [alice, bob]) for (const m of [modA, modB]) expect((await who.ctx.post('/api/studymind/modules/join', { data: { course_id: m.id } })).status()).toBe(200);
  const outsider = await apiAccount(baseURL, 'hist-out', 'student');
  return { modA, modB, alice, bob, outsider };
}
async function open(page: Page, email: string, moduleId: string, tabName: string) {
  await page.goto('/my-learning'); await signIn(page, email);
  await page.goto(`/my-learning/modules/${moduleId}`);
  await page.getByRole('tab', { name: tabName }).click();
}
const make = (ctx: APIRequestContext, mod: string, what: 'quiz' | 'flashcards' | 'summary', topic: string) => ctx.post(`${aiBase(mod)}/${what}`, { data: { topic } });

test('Quiz: several quizzes are kept in Recent Quizzes; an unfinished one reopens without answers, a submitted one shows its score and explanations; delete asks first', async ({ page, baseURL }) => {
  const { modA, alice } = await world(baseURL!);
  await open(page, alice.email, modA.id, 'Quiz');
  const r = rail(page, 'Quiz');
  await expandRecent(page, 'Quiz', /^Recent Quizzes/);
  await expect(r.getByText('Quizzes you create for this module will appear here.')).toBeVisible();

  await panel(page, 'Quiz').getByLabel('Focus on a topic (optional)').fill('Forces');
  await page.getByRole('button', { name: 'Generate quiz' }).click();
  await expect(page.getByText(/Question 1 of 5/)).toBeVisible();
  await r.getByRole('button', { name: 'New Quiz' }).click();                              // a second, different quiz
  await panel(page, 'Quiz').getByLabel('Focus on a topic (optional)').fill('Energy');
  await page.getByRole('button', { name: 'Generate quiz' }).click();
  await expect(page.getByText(/Question 1 of 5/)).toBeVisible();
  await expandRecent(page, 'Quiz', /^Recent Quizzes/);
  await expect(r.getByRole('button', { name: /^Quiz: Energy/ })).toHaveAttribute('aria-current', 'true');
  await expect(r.getByRole('button', { name: /^Quiz: Forces/ })).toBeVisible();
  await expect(r.getByRole('button', { name: /^Quiz: Energy/ })).toContainText(/5 questions · 0 answered/);

  // answer and submit the Energy quiz
  for (let i = 0; i < 5; i++) {
    await page.getByRole('radio').first().check();
    await panel(page, 'Quiz').getByRole('button', { name: i === 4 ? 'Submit quiz' : 'Next', exact: true }).click();
  }
  await expect(page.getByTestId('quiz-score')).toContainText(/Score: \d+%/);
  await expandRecent(page, 'Quiz', /^Recent Quizzes/);
  await expect(r.getByRole('button', { name: /^Quiz: Energy/ })).toContainText(/Score \d+%/);

  // reopen the unfinished one: questions only, no explanations, nothing about the answers
  await r.getByRole('button', { name: /^Quiz: Forces/ }).click();
  await expect(page.getByText(/Question 1 of 5/)).toBeVisible();
  await expect(page.getByText(/Your score and explanations appear after you submit/)).toBeVisible();
  await expect(page.getByText('Explanation:')).toHaveCount(0);
  // and the submitted one again, any time: score and explanations
  await expandRecent(page, 'Quiz', /^Recent Quizzes/);
  await r.getByRole('button', { name: /^Quiz: Energy/ }).click();
  await expect(page.getByTestId('quiz-score')).toContainText(/Score: \d+%/);
  await expect(page.getByText('Explanation:').first()).toBeVisible();

  // delete with confirmation
  await expandRecent(page, 'Quiz', /^Recent Quizzes/);
  await r.getByRole('button', { name: 'Options for Quiz: Energy' }).click();
  await page.getByRole('menuitem', { name: /Delete quiz/ }).click();
  await expect(page.getByText('Delete this quiz?')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Cancel' }).click();
  await expect(r.getByRole('button', { name: /^Quiz: Energy/ })).toBeVisible();          // cancel keeps it
  await r.getByRole('button', { name: 'Options for Quiz: Energy' }).click();
  await page.getByRole('menuitem', { name: /Delete quiz/ }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(r.getByRole('button', { name: /^Quiz: Energy/ })).toHaveCount(0);
  await expect(page.getByTestId('quiz-score')).toHaveCount(0);                            // the deleted quiz was on screen, so the panel resets
  await expect(page.getByRole('button', { name: 'Generate quiz' })).toBeVisible();
  await expect(r.getByRole('button', { name: /^Quiz: Forces/ })).toBeVisible();
});

test('Flashcards: several sets are kept, any can be reopened from the start, and delete asks first', async ({ page, baseURL }) => {
  const { modA, alice } = await world(baseURL!);
  await open(page, alice.email, modA.id, 'Flashcards');
  const r = rail(page, 'Flashcards');
  await expandRecent(page, 'Flashcards', /^Recent Flashcards/);
  await expect(r.getByText('Flashcard sets you create for this module will appear here.')).toBeVisible();
  await panel(page, 'Flashcards').getByLabel('Focus on a topic (optional)').fill('Newton');
  await page.getByRole('button', { name: 'Generate flashcards' }).click();
  await expect(page.getByTestId('card-counter')).toHaveText('Card 1 of 6');
  await r.getByRole('button', { name: 'New Flashcards' }).click();
  await panel(page, 'Flashcards').getByLabel('Focus on a topic (optional)').fill('Energy');
  await page.getByRole('button', { name: 'Generate flashcards' }).click();
  await expect(page.getByTestId('card-counter')).toHaveText('Card 1 of 6');
  await expandRecent(page, 'Flashcards', /^Recent Flashcards/);
  await expect(r.getByRole('button', { name: /^Flashcards: Energy/ })).toHaveAttribute('aria-current', 'true');
  await expect(r.getByRole('button', { name: /^Flashcards: Newton/ })).toContainText('6 cards');

  await panel(page, 'Flashcards').getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByTestId('card-counter')).toHaveText('Card 2 of 6');
  await r.getByRole('button', { name: /^Flashcards: Newton/ }).click();                   // reopening starts from the first card
  await expect(page.getByTestId('card-counter')).toHaveText('Card 1 of 6');
  await expect(page.getByTestId('flashcard')).toContainText("State Newton's second law.");

  await expandRecent(page, 'Flashcards', /^Recent Flashcards/);
  await r.getByRole('button', { name: 'Options for Flashcards: Newton' }).click();
  await page.getByRole('menuitem', { name: /Delete flashcard set/ }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(r.getByRole('button', { name: /^Flashcards: Newton/ })).toHaveCount(0);
  await expect(r.getByRole('button', { name: /^Flashcards: Energy/ })).toBeVisible();
});

test('Summary: several summaries are kept, any can be reopened, and delete asks first', async ({ page, baseURL }) => {
  const { modA, alice } = await world(baseURL!);
  await open(page, alice.email, modA.id, 'Summary');
  const r = rail(page, 'Summary');
  await expandRecent(page, 'Summary', /^Recent Summaries/);
  await expect(r.getByText('Summaries you create for this module will appear here.')).toBeVisible();
  await panel(page, 'Summary').getByLabel('Summarise a topic (optional)').fill('Momentum');
  await page.getByRole('button', { name: 'Generate summary' }).click();
  await expect(page.getByTestId('summary').getByRole('heading', { name: 'Summary: Momentum' })).toBeVisible();
  await r.getByRole('button', { name: 'New Summary' }).click();
  await panel(page, 'Summary').getByLabel('Summarise a topic (optional)').fill('Forces');
  await page.getByRole('button', { name: 'Generate summary' }).click();
  await expect(page.getByTestId('summary').getByRole('heading', { name: 'Summary: Forces' })).toBeVisible();
  await expandRecent(page, 'Summary', /^Recent Summaries/);
  await expect(r.getByRole('button', { name: /^Summary: Forces/ })).toHaveAttribute('aria-current', 'true');
  await r.getByRole('button', { name: /^Summary: Momentum/ }).click();
  await expect(page.getByTestId('summary').getByRole('heading', { name: 'Summary: Momentum' })).toBeVisible();
  await expect(page.getByTestId('summary').locator('ol li')).toHaveCount(2);

  await expandRecent(page, 'Summary', /^Recent Summaries/);
  await r.getByRole('button', { name: 'Options for Summary: Momentum' }).click();
  await page.getByRole('menuitem', { name: /Delete summary/ }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(r.getByRole('button', { name: /^Summary: Momentum/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Generate summary' })).toBeVisible();
  await expect(r.getByRole('button', { name: /^Summary: Forces/ })).toBeVisible();
});

test('history is private: other users, other modules, non-members and unknown kinds see nothing; unfinished quizzes never expose answers; cross-site delete is refused', async ({ baseURL }) => {
  const { modA, modB, alice, bob, outsider } = await world(baseURL!);
  const ids: Record<string, string> = {};
  for (const [kind, key] of [['quiz', 'attempt_id'], ['flashcards', 'deck_id'], ['summary', 'id']] as const) {
    const made = await make(alice.ctx, modA.id, kind, 'Privacy'); expect(made.status()).toBe(201);
    ids[kind] = (await made.json())[key];
  }
  for (const kind of ['quiz', 'flashcards', 'summary']) {
    const list = await alice.ctx.get(`${aiBase(modA.id)}/history/${kind}`); expect(list.status()).toBe(200);
    const rows = await list.json(); expect(rows.map((x: { id: string }) => x.id)).toContain(ids[kind]);
    expect(Object.keys(rows[0]).sort().join(',')).toBe('completed,created_at,detail,id,title');       // display fields only: no questions, answers or content
    expect((await (await bob.ctx.get(`${aiBase(modA.id)}/history/${kind}`)).json()).length, `${kind}: another student's list`).toBe(0);
    expect((await bob.ctx.get(`${aiBase(modA.id)}/history/${kind}/${ids[kind]}`)).status(), `${kind}: read another user's item`).toBe(404);
    expect((await bob.ctx.delete(`${aiBase(modA.id)}/history/${kind}/${ids[kind]}`)).status(), `${kind}: delete another user's item`).toBe(404);
    expect((await alice.ctx.get(`${aiBase(modB.id)}/history/${kind}/${ids[kind]}`)).status(), `${kind}: through another module`).toBe(404);
    expect((await alice.ctx.delete(`${aiBase(modB.id)}/history/${kind}/${ids[kind]}`)).status(), `${kind}: delete through another module`).toBe(404);
    expect((await (await alice.ctx.get(`${aiBase(modB.id)}/history/${kind}`)).json()).length, `${kind}: other module list`).toBe(0);
    expect((await outsider.ctx.get(`${aiBase(modA.id)}/history/${kind}`)).status(), `${kind}: non-member`).toBe(403);
    expect((await outsider.ctx.get(`${aiBase(modA.id)}/history/${kind}/${ids[kind]}`)).status()).toBe(403);
    expect((await alice.ctx.delete(`${aiBase(modA.id)}/history/${kind}/${ids[kind]}`, { headers: { Origin: 'https://evil.example.com' } })).status(), `${kind}: cross-site delete`).toBe(403);
  }
  expect((await alice.ctx.get(`${aiBase(modA.id)}/history/chat`)).status()).toBe(404);
  expect((await alice.ctx.get(`${aiBase(modA.id)}/history/quiz/not-a-uuid`)).status()).toBe(400);
  // an unfinished quiz has no correct answers or explanations in the browser
  const raw = JSON.stringify(await (await alice.ctx.get(`${aiBase(modA.id)}/history/quiz/${ids.quiz}`)).json());
  for (const word of ['correct_answer', 'explanation', 'source_chunk', 'is_correct']) expect(raw.includes(word), `${word} leaked before submission`).toBe(false);
  // ... and once submitted they come back (only to the owner)
  const quiz = (await (await alice.ctx.get(`${aiBase(modA.id)}/history/quiz/${ids.quiz}`)).json()).quiz;
  const submitted = await alice.ctx.post(`${aiBase(modA.id)}/quiz/${ids.quiz}`, { data: { answers: quiz.questions.map((q: { id: string }) => ({ question_id: q.id, answer: 'a' })) } });
  expect(submitted.status()).toBe(200);
  const after = await (await alice.ctx.get(`${aiBase(modA.id)}/history/quiz/${ids.quiz}`)).json();
  expect(after.status).toBe('submitted'); expect(after.result.questions[0].explanation.length).toBeGreaterThan(0);
  // owner deletes: gone
  for (const kind of ['quiz', 'flashcards', 'summary']) {
    expect((await alice.ctx.delete(`${aiBase(modA.id)}/history/${kind}/${ids[kind]}`)).status()).toBe(204);
    expect((await alice.ctx.get(`${aiBase(modA.id)}/history/${kind}/${ids[kind]}`)).status()).toBe(404);
  }
});

test('layout: the Recent card sits to the left of the panel on desktop (like Chat) and collapses on mobile', async ({ page, baseURL }, info) => {
  const { modA, alice } = await world(baseURL!);
  await make(alice.ctx, modA.id, 'quiz', 'Layout');
  await open(page, alice.email, modA.id, 'Quiz');
  const r = rail(page, 'Quiz');
  await expect(r).toBeVisible();
  const panel = page.getByRole('heading', { name: 'Module quiz' });
  await expect(panel).toBeVisible();
  const [a, b] = [(await r.boundingBox())!, (await panel.boundingBox())!];
  if (info.project.name === 'desktop') { expect(a.x + a.width, 'rail is left of the panel').toBeLessThanOrEqual(b.x); expect(Math.round(a.width)).toBe(320); }
  else {
    const toggle = r.getByRole('button', { name: /^Recent Quizzes/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(r.getByRole('button', { name: /^Quiz: Layout/ })).toBeHidden();
    await toggle.click();
    await expect(r.getByRole('button', { name: /^Quiz: Layout/ })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});
