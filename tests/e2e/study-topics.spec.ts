// "Focus on a topic" for Quiz, Flashcards and Summary: the module's weeks (and indexed documents) are offered, and a free-text topic always works.
// Controlled fixture AI; weeks are created straight in the disposable AI database (the Web app has no screen for them yet).
import { expect, test, type Page } from '@playwright/test';
import { aiSql, apiAccount, apiCreateClass, hasAiDb, signIn } from './helpers';

const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name });
async function world(baseURL: string, withWeeks: boolean) {
  const lecturer = await apiAccount(baseURL, 'topic-lec', 'lecturer');
  const mod = await apiCreateClass(lecturer.ctx, 'Topic Module');
  const student = await apiAccount(baseURL, 'topic-st', 'student');
  expect((await student.ctx.post('/api/studymind/modules/join', { data: { course_id: mod.id } })).status()).toBe(200);
  const outsider = await apiAccount(baseURL, 'topic-out', 'student');
  if (withWeeks) {
    aiSql(`insert into weeks (id, module_id, week_number, title) values (gen_random_uuid(), '${mod.id}', 2, 'Energy and work'), (gen_random_uuid(), '${mod.id}', 1, 'Forces and motion')`);
  }
  return { mod, student, outsider };
}
async function open(page: Page, email: string, moduleId: string, tabName: string) {
  await page.goto('/my-learning'); await signIn(page, email);
  await page.goto(`/my-learning/modules/${moduleId}`);
  await page.getByRole('tab', { name: tabName }).click();
}

test('no weeks or documents: the topic is a plain free-text field, as before', async ({ page, baseURL }) => {
  const { mod, student } = await world(baseURL!, false);
  await open(page, student.email, mod.id, 'Quiz');
  const field = panel(page, 'Quiz').getByLabel('Focus on a topic (optional)');
  await expect(field).toHaveAttribute('type', 'text');
  const bodies: { topic?: string }[] = [];
  await page.route('**/ai/quiz', async (route) => { bodies.push(route.request().postDataJSON()); await route.continue(); });
  await field.fill('Osmosis');
  await panel(page, 'Quiz').getByRole('button', { name: 'Generate quiz' }).click();
  await expect(page.getByText(/Question 1 of 5/)).toBeVisible();
  expect(bodies[0]).toMatchObject({ topic: 'Osmosis' });
});

test.describe('with weeks', () => {
  test.skip(!hasAiDb(), 'creates weeks in the disposable AI database');

  test('Quiz: weeks are listed in order; picking one focuses the quiz; "Type my own topic" gives a free-text field', async ({ page, baseURL }) => {
    const { mod, student } = await world(baseURL!, true);
    await open(page, student.email, mod.id, 'Quiz');
    const select = panel(page, 'Quiz').getByLabel('Focus on a topic (optional)');
    await expect(select).toHaveJSProperty('tagName', 'SELECT');
    const labels = await select.locator('option').allTextContents();
    expect(labels).toEqual(['All material', 'Week 1: Forces and motion', 'Week 2: Energy and work', 'Type my own topic…']);   // in week order, no ids
    const bodies: { topic?: string }[] = [];
    await page.route('**/ai/quiz', async (route) => { bodies.push(route.request().postDataJSON()); await route.continue(); });
    await select.selectOption({ label: 'Week 2: Energy and work' });
    await panel(page, 'Quiz').getByRole('button', { name: 'Generate quiz' }).click();
    await expect(page.getByText(/Question 1 of 5/)).toBeVisible();
    expect(bodies[0]).toMatchObject({ topic: 'Energy and work' });
    await expect(page.getByText(/Topic: Energy and work/)).toBeVisible();

    await page.getByRole('complementary', { name: 'Quiz history' }).getByRole('button', { name: 'New Quiz' }).click();
    await expect(select).toHaveValue('Energy and work');                                         // the last choice is kept
    await select.selectOption({ label: 'Type my own topic…' });
    const own = panel(page, 'Quiz').getByLabel('Your own topic'); await expect(own).toBeFocused();
    await own.fill('Friction');
    await panel(page, 'Quiz').getByRole('button', { name: 'Generate quiz' }).click();
    await expect(page.getByText(/Topic: Friction/)).toBeVisible();
    expect(bodies[1]).toMatchObject({ topic: 'Friction' });
    await page.getByRole('complementary', { name: 'Quiz history' }).getByRole('button', { name: 'New Quiz' }).click();
    await select.selectOption({ label: 'All material' });
    await panel(page, 'Quiz').getByRole('button', { name: 'Generate quiz' }).click();
    await expect(page.getByText(/Question 1 of 5/)).toBeVisible();
    expect(bodies[2].topic, 'All material sends no topic').toBeUndefined();
  });

  test('Flashcards and Summary use the same picker and send the chosen topic', async ({ page, baseURL }) => {
    const { mod, student } = await world(baseURL!, true);
    await open(page, student.email, mod.id, 'Flashcards');
    const cards = panel(page, 'Flashcards').getByLabel('Focus on a topic (optional)');
    await expect(cards).toHaveJSProperty('tagName', 'SELECT');                                   // the suggestions load when the tab opens
    await cards.selectOption({ label: 'Week 1: Forces and motion' });
    await panel(page, 'Flashcards').getByRole('button', { name: 'Generate flashcards' }).click();
    await expect(page.getByTestId('card-counter')).toHaveText('Card 1 of 6');
    const rail = page.getByRole('complementary', { name: 'Flashcards history' });
    const toggle = rail.getByRole('button', { name: /^Recent/ });
    if (await toggle.isVisible()) await toggle.click();                                          // collapsed on small screens
    await expect(rail.getByRole('button', { name: /^Flashcards: Forces and motion/ })).toBeVisible();

    await page.getByRole('tab', { name: 'Summary' }).click();
    const summary = panel(page, 'Summary').getByLabel('Summarise a topic (optional)');
    await expect(summary).toHaveJSProperty('tagName', 'SELECT');
    await summary.selectOption({ label: 'Type my own topic…' });
    await panel(page, 'Summary').getByLabel('Your own topic').fill('Momentum');
    await panel(page, 'Summary').getByRole('button', { name: 'Generate summary' }).click();
    await expect(page.getByTestId('summary').getByRole('heading', { name: 'Summary: Momentum' })).toBeVisible();
  });
});

test('the outline route: titles only, members only', async ({ baseURL }) => {
  test.skip(!hasAiDb(), 'creates weeks in the disposable AI database');
  const { mod, student, outsider } = await world(baseURL!, true);
  const res = await student.ctx.get(`/api/studymind/modules/${mod.id}/ai/outline`); expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.weeks).toEqual([{ label: 'Week 1: Forces and motion', value: 'Forces and motion' }, { label: 'Week 2: Energy and work', value: 'Energy and work' }]);
  expect(body.documents).toEqual([]);
  expect(JSON.stringify(body)).not.toMatch(/module_id|created_at|[0-9a-f]{8}-[0-9a-f]{4}-/);   // no identifiers
  expect((await outsider.ctx.get(`/api/studymind/modules/${mod.id}/ai/outline`)).status()).toBe(403);
  expect((await student.ctx.get('/api/studymind/modules/not-a-uuid/ai/outline')).status()).toBe(400);
});

// ── Chapters detected at upload (the outline response is mocked here; real detection, indexing and scoping are covered by the integration suite) ──
const refOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}:${n}`;
const chapters = (count: number) => Array.from({ length: count }, (_, i) => ({ ref: refOf(i), title: i === 0 ? 'Chapter 1: Cells' : i === 1 ? 'Chapter 2: Genetics' : `Chapter ${i + 1}: Topic ${i + 1}`, level: i === 5 ? 2 : 1, page: 10 + i }));
async function mockOutline(page: Page, count = 4) {
  await page.route('**/ai/outline', async (route) => {
    const real = await (await route.fetch()).json();
    await route.fulfill({ json: { ...real, chapters: [{ document: 'Biology Handbook', sections: chapters(count) }] } });
  });
}

test('chapters: whole module spreads across chapters by default; ticked chapters are sent as references; a free-text topic still works', async ({ page, baseURL }) => {
  const { mod, student } = await world(baseURL!, false);
  await mockOutline(page);
  await page.goto('/my-learning'); await signIn(page, student.email);
  await page.goto(`/my-learning/modules/${mod.id}`); await page.getByRole('tab', { name: 'Quiz' }).click();
  const quiz = panel(page, 'Quiz');
  const select = quiz.getByLabel('Focus on a topic (optional)');
  await expect(select).toHaveJSProperty('tagName', 'SELECT');
  expect(await select.locator('option').allTextContents()).toEqual(['Whole module (spread across all chapters)', 'Choose chapters…', 'Type my own topic…']);
  const bodies: Record<string, unknown>[] = [];
  await page.route('**/ai/quiz', async (route) => { bodies.push(route.request().postDataJSON()); await route.continue(); });

  await quiz.getByRole('button', { name: 'Generate quiz' }).click();
  await expect(page.getByText(/Question 1 of 5/)).toBeVisible();
  expect(bodies[0]).toMatchObject({ balanced: true }); expect(bodies[0].sections).toBeUndefined(); expect(bodies[0].topic).toBeUndefined();
  await expect(page.getByText(/Whole module/).first()).toBeVisible();

  await page.getByRole('complementary', { name: 'Quiz history' }).getByRole('button', { name: 'New Quiz' }).click();
  await select.selectOption({ label: 'Choose chapters…' });
  const list = quiz.getByRole('group', { name: 'Chapters to cover' });
  await expect(list.getByRole('checkbox')).toHaveCount(4);
  await expect(list).toContainText('p. 10');
  await expect(quiz.getByText('Nothing ticked: the whole module is used.')).toBeVisible();
  await list.getByRole('checkbox', { name: /Chapter 1: Cells/ }).check();
  await list.getByRole('checkbox', { name: /Chapter 2: Genetics/ }).check();
  await expect(quiz.getByText('2 selected')).toBeVisible();
  await quiz.getByRole('button', { name: 'Generate quiz' }).click();
  await expect(page.getByText(/Question 1 of 5/)).toBeVisible();
  expect(bodies[1]).toMatchObject({ sections: [refOf(0), refOf(1)], label: 'Chapter 1: Cells + Chapter 2: Genetics' }); expect(bodies[1].balanced).toBeUndefined();
  await expect(page.getByText(/Chapters: Chapter 1: Cells, Chapter 2: Genetics/)).toBeVisible();

  await page.getByRole('complementary', { name: 'Quiz history' }).getByRole('button', { name: 'New Quiz' }).click();
  await select.selectOption({ label: 'Type my own topic…' });
  await quiz.getByLabel('Your own topic').fill('Mitosis');
  await quiz.getByRole('button', { name: 'Generate quiz' }).click();
  await expect(page.getByText(/Topic: Mitosis/)).toBeVisible();
  expect(bodies[2]).toMatchObject({ topic: 'Mitosis' }); expect(bodies[2].sections).toBeUndefined(); expect(bodies[2].balanced).toBeUndefined();
});

test('chapters: at most 12 can be ticked, sub-sections are indented, and Flashcards and Summary use the same chooser', async ({ page, baseURL }) => {
  const { mod, student } = await world(baseURL!, false);
  await mockOutline(page, 14);
  await page.goto('/my-learning'); await signIn(page, student.email);
  await page.goto(`/my-learning/modules/${mod.id}`); await page.getByRole('tab', { name: 'Flashcards' }).click();
  const cards = panel(page, 'Flashcards');
  const select = cards.getByLabel('Focus on a topic (optional)');
  await expect(select).toHaveJSProperty('tagName', 'SELECT');
  await select.selectOption({ label: 'Choose chapters…' });
  const boxes = cards.getByRole('group', { name: 'Chapters to cover' }).getByRole('checkbox');
  for (let i = 0; i < 12; i++) await boxes.nth(i).check();
  await expect(boxes.nth(12)).toBeDisabled();                                                   // the 13th is refused
  await expect(cards.getByText(/12 selected \(the most you can pick\)/)).toBeVisible();
  await boxes.nth(0).uncheck(); await expect(boxes.nth(12)).toBeEnabled();
  const a = (await boxes.nth(4).boundingBox())!, b = (await boxes.nth(5).boundingBox())!;
  expect(b.x, 'a level-2 section is indented').toBeGreaterThan(a.x + 8);
  const bodies: Record<string, unknown>[] = [];
  await page.route('**/ai/flashcards', async (route) => { bodies.push(route.request().postDataJSON()); await route.continue(); });
  await cards.getByRole('button', { name: 'Generate flashcards' }).click();
  await expect(page.getByTestId('card-counter')).toHaveText('Card 1 of 6');
  expect((bodies[0].sections as string[]).length).toBe(11);

  await page.getByRole('tab', { name: 'Summary' }).click();
  const summary = panel(page, 'Summary');
  await expect(summary.getByLabel('Summarise a topic (optional)')).toHaveJSProperty('tagName', 'SELECT');
  const sb: Record<string, unknown>[] = [];
  await page.route('**/ai/summary', async (route) => { sb.push(route.request().postDataJSON()); await route.continue(); });
  await summary.getByRole('button', { name: 'Generate summary' }).click();
  await expect(page.getByTestId('summary')).toBeVisible();
  expect(sb[0]).toMatchObject({ balanced: true });
});
