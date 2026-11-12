// The Chat tab: recent chats (private and module-scoped), the sources selector, suggestion chips and layout.
// Runs on the controlled fixture AI (tests/fixtures/ai-shim.mjs): Web's auth, module access and UI are real; answers are fixtures.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { apiAccount, apiCreateClass, expectNoHorizontalScroll, signIn } from './helpers';

const tab = (page: Page, name: string) => page.getByRole('tab', { name });
const recent = (page: Page) => page.getByRole('complementary', { name: 'Chats' });
/** On small screens Recent Chats is collapsed behind a toggle; open it (no-op on desktop). */
async function expandRecent(page: Page) {
  const toggle = recent(page).getByRole('button', { name: /^Recent Chats/ });
  if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

async function world(baseURL: string) {
  const lecturer = await apiAccount(baseURL, 'chat-lec', 'lecturer');
  const modA = await apiCreateClass(lecturer.ctx, 'Chat Module A');
  const modB = await apiCreateClass(lecturer.ctx, 'Chat Module B');
  const alice = await apiAccount(baseURL, 'chat-alice', 'student');
  const bob = await apiAccount(baseURL, 'chat-bob', 'student');
  for (const who of [alice, bob]) for (const m of [modA, modB]) expect((await who.ctx.post('/api/studymind/modules/join', { data: { course_id: m.id } })).status()).toBe(200);
  const outsider = await apiAccount(baseURL, 'chat-out', 'student');
  return { modA, modB, alice, bob, outsider };
}
const ask = (ctx: APIRequestContext, mod: string, message: string, extra: object = {}) => ctx.post(`/api/studymind/modules/${mod}/ai/chat`, { data: { message, ...extra } });
async function open(page: Page, email: string, moduleId: string) {
  await page.goto('/my-learning'); await signIn(page, email);
  await page.goto(`/my-learning/modules/${moduleId}`);
  await expect(page.getByRole('tab', { name: 'Chat' })).toBeVisible();
}

test('Recent Chats: a chat is listed with its title and date, can be reopened with its sources, and starts fresh with New Chat', async ({ page, baseURL }) => {
  const { modA, alice } = await world(baseURL!);
  await open(page, alice.email, modA.id);
  await expandRecent(page);
  await expect(recent(page).getByText('Your chats about this module will appear here.')).toBeVisible();
  await page.getByLabel('Ask a question').fill('Explain Newton force please');
  await page.getByRole('button', { name: 'Send question' }).click();
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log.getByTestId('citation')).toHaveCount(1);
  const item = recent(page).getByRole('button', { name: /^Explain Newton force please/ });
  await expect(item).toBeVisible();
  await expect(item).toContainText(/Today, \d\d:\d\d/);
  await expect(item).toHaveAttribute('aria-current', 'true');

  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(page.getByText('Ask a question about this module.')).toBeVisible();
  await expect(log.getByTestId('citation')).toHaveCount(0);
  await expandRecent(page);

  await item.click();                                                                    // reopen: the whole conversation comes back
  await expect(log.getByText('Explain Newton force please')).toBeVisible();
  await expect(log.getByTestId('citation')).toContainText('physics-notes.pdf');
  await expect(log.getByText(/^\d\d:\d\d$/).first()).toBeVisible();                       // timestamps

  await page.getByLabel('Ask a question').fill('And what about momentum?');             // continuing a reopened chat keeps it as ONE chat
  await page.keyboard.press('Enter');
  await expect(log.getByText('And what about momentum?')).toBeVisible();
  await expect(log.getByRole('status')).toHaveCount(0);
  expect((await (await alice.ctx.get(`/api/studymind/modules/${modA.id}/ai/sessions`)).json()).length).toBe(1);
});

test('Recent Chats: newest first, "View all chats" reveals the rest, and a chat can be deleted (with confirmation)', async ({ page, baseURL }) => {
  const { modA, alice } = await world(baseURL!);
  for (let i = 1; i <= 7; i++) expect((await ask(alice.ctx, modA.id, `Chat number ${i}`)).status()).toBe(200);
  await open(page, alice.email, modA.id);
  await expandRecent(page);
  const items = recent(page).getByRole('button', { name: /^Chat number/ });
  await expect(items).toHaveCount(5);                                                    // five shown by default
  await expect(items.first()).toContainText('Chat number 7');                            // most recent first
  await recent(page).getByRole('button', { name: /View all chats/ }).click();
  await expect(items).toHaveCount(7);
  await recent(page).getByRole('button', { name: /Show fewer/ }).click();
  await expect(items).toHaveCount(5);

  await items.first().click();                                                           // open the newest, then delete it
  await expect(page.getByRole('log', { name: 'Conversation' }).getByText('Chat number 7')).toBeVisible();
  await expandRecent(page);                                                              // (collapses again on small screens after opening a chat)
  await recent(page).getByRole('button', { name: 'Options for Chat number 7' }).click();
  await recent(page).getByRole('menuitem', { name: 'Delete chat' }).click();
  await expect(recent(page).getByText('Delete this chat?')).toBeVisible();
  await recent(page).getByRole('menuitem', { name: 'Cancel' }).click();
  await expect(recent(page).getByRole('menu')).toHaveCount(0);                          // Cancel closes the menu
  await expect(items.first()).toContainText('Chat number 7');                            // and changes nothing
  await recent(page).getByRole('button', { name: 'Options for Chat number 7' }).click();
  await recent(page).getByRole('menuitem', { name: 'Delete chat' }).click();
  await recent(page).getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(recent(page).getByRole('button', { name: /^Chat number 7/ })).toHaveCount(0);
  await expect(page.getByText('Ask a question about this module.')).toBeVisible();       // the open chat was the deleted one: back to a fresh chat
  expect((await (await alice.ctx.get(`/api/studymind/modules/${modA.id}/ai/sessions`)).json()).length).toBe(6);
});

test('privacy: chats belong to their owner AND their module; other users, other modules and outsiders get nothing', async ({ baseURL }) => {
  const { modA, modB, alice, bob, outsider } = await world(baseURL!);
  expect((await ask(alice.ctx, modA.id, 'Alice private question A')).status()).toBe(200);
  expect((await ask(alice.ctx, modB.id, 'Alice private question B')).status()).toBe(200);
  const aliceA = await (await alice.ctx.get(`/api/studymind/modules/${modA.id}/ai/sessions`)).json();
  const aliceB = await (await alice.ctx.get(`/api/studymind/modules/${modB.id}/ai/sessions`)).json();
  expect(aliceA.map((s: { title: string }) => s.title)).toEqual(['Alice private question A']);   // only module A's chat
  expect(aliceB.map((s: { title: string }) => s.title)).toEqual(['Alice private question B']);
  expect(Object.keys(aliceA[0]).sort()).toEqual(['id', 'message_count', 'title', 'updated_at']);   // no user or module identifiers leak out
  const sidA = aliceA[0].id as string;

  expect((await alice.ctx.get(`/api/studymind/modules/${modA.id}/ai/sessions/${sidA}`)).status()).toBe(200);
  expect((await alice.ctx.get(`/api/studymind/modules/${modB.id}/ai/sessions/${sidA}`)).status(), 'a chat from module A cannot be read through module B').toBe(404);
  expect((await alice.ctx.delete(`/api/studymind/modules/${modB.id}/ai/sessions/${sidA}`)).status(), '...or deleted through module B').toBe(404);
  expect((await bob.ctx.get(`/api/studymind/modules/${modA.id}/ai/sessions`)).status()).toBe(200);
  expect(await (await bob.ctx.get(`/api/studymind/modules/${modA.id}/ai/sessions`)).json()).toEqual([]);   // Bob sees none of Alice's chats
  expect((await bob.ctx.get(`/api/studymind/modules/${modA.id}/ai/sessions/${sidA}`)).status(), "Bob cannot read Alice's chat").toBe(404);
  expect((await bob.ctx.delete(`/api/studymind/modules/${modA.id}/ai/sessions/${sidA}`)).status(), "Bob cannot delete Alice's chat").toBe(404);
  expect((await bob.ctx.post(`/api/studymind/modules/${modA.id}/ai/chat`, { data: { message: 'hijack', session_id: sidA } })).status(), "Bob cannot continue Alice's chat").toBe(404);
  expect((await outsider.ctx.get(`/api/studymind/modules/${modA.id}/ai/sessions`)).status(), 'not a member: refused before any history call').toBe(403);
  expect((await outsider.ctx.get(`/api/studymind/modules/${modA.id}/ai/sessions/${sidA}`)).status()).toBe(403);
  expect((await outsider.ctx.delete(`/api/studymind/modules/${modA.id}/ai/sessions/${sidA}`)).status()).toBe(403);
  const anon = await (await import('@playwright/test')).request.newContext({ baseURL });
  for (const r of [await anon.get(`/api/studymind/modules/${modA.id}/ai/sessions`), await anon.get(`/api/studymind/modules/${modA.id}/ai/sessions/${sidA}`), await anon.delete(`/api/studymind/modules/${modA.id}/ai/sessions/${sidA}`)]) expect(r.status()).toBe(401);
  await anon.dispose();
  expect((await alice.ctx.get(`/api/studymind/modules/not-a-uuid/ai/sessions`)).status()).toBe(400);
  expect((await alice.ctx.get(`/api/studymind/modules/${modA.id}/ai/sessions/not-a-uuid`)).status()).toBe(400);
  expect((await alice.ctx.delete(`/api/studymind/modules/${modA.id}/ai/sessions/${sidA}`, { headers: { Origin: 'https://evil.example.com' } })).status(), 'cross-site delete refused').toBe(403);
  expect((await alice.ctx.get(`/api/studymind/modules/${modA.id}/ai/sessions/${sidA}`)).status(), '...and the chat is still there').toBe(200);
  expect((await alice.ctx.delete(`/api/studymind/modules/${modA.id}/ai/sessions/${sidA}`)).status()).toBe(204);
  expect((await alice.ctx.get(`/api/studymind/modules/${modA.id}/ai/sessions/${sidA}`)).status()).toBe(404);
});

test('sources selector: "Using module materials" by default; the choice is sent to the AI and only the three public scopes are accepted', async ({ page, baseURL }) => {
  const { modA, alice } = await world(baseURL!);
  await open(page, alice.email, modA.id);
  const bodies: { scope_mode?: string; complexity?: string }[] = [];
  await page.route('**/ai/chat', async (route) => { bodies.push(route.request().postDataJSON()); await route.continue(); });
  await page.getByLabel('Ask a question').fill('first question'); await page.keyboard.press('Enter');
  await expect(page.getByRole('log', { name: 'Conversation' }).getByTestId('citation')).toHaveCount(1);
  expect(bodies[0]).toMatchObject({ scope_mode: 'everything', complexity: 'normal' });

  const trigger = page.getByRole('button', { name: /^Using / });                         // its label changes with the choice
  await expect(trigger).toHaveText('Using module materials');
  await trigger.click();
  await expect(page.getByRole('menuitemradio', { name: /All module materials/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemradio', { name: /My notes only/ }).click();
  await page.getByRole('menuitemradio', { name: 'Expert' }).click();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('button', { name: 'Using my notes only' })).toBeVisible();   // the button states what the next answer will use
  await page.getByLabel('Ask a question').fill('second question'); await page.keyboard.press('Enter');
  await expect(page.getByRole('log', { name: 'Conversation' }).getByText('second question')).toBeVisible();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toMatchObject({ scope_mode: 'personal_only', complexity: 'expert' });

  for (const bad of ['all_semesters', 'everything ', 'x', { a: 1 }]) expect((await ask(alice.ctx, modA.id, 'q', { scope_mode: bad })).status(), JSON.stringify(bad)).toBe(400);
  expect((await ask(alice.ctx, modA.id, 'q', { scope_mode: 'class_only' })).status()).toBe(200);
  expect((await ask(alice.ctx, modA.id, 'q', { include_archived: true })).status(), 'unknown fields are ignored, not forwarded').toBe(200);
});

test('answer actions: copy, suggestion chips open the matching tool, and the paperclip opens Documents', async ({ page, baseURL, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { modA, alice } = await world(baseURL!);
  await open(page, alice.email, modA.id);
  await expect(page.getByRole('button', { name: 'Give a simple summary' })).toHaveCount(0);   // chips only after an answer
  await page.getByLabel('Ask a question').fill('Explain Newton force'); await page.keyboard.press('Enter');
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log.getByTestId('citation')).toHaveCount(1);
  await page.getByRole('button', { name: 'Copy answer' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Newton's");
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  for (const [chip, name] of [['Give a simple summary', 'Summary'], ['Create flashcards', 'Flashcards'], ['Turn this into a quiz', 'Quiz']] as const) {
    await tab(page, 'Chat').click();
    await page.getByRole('button', { name: chip }).click();
    await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
  }
  await tab(page, 'Chat').click();
  await page.getByRole('button', { name: 'Add study materials' }).click();
  await expect(tab(page, 'Documents')).toHaveAttribute('aria-selected', 'true');
  await tab(page, 'Chat').click();
  await expect(log.getByText('Explain Newton force')).toBeVisible();                       // the conversation survived the tab changes
});

test('layout: the input row is one aligned control; the page never scrolls sideways', async ({ page, baseURL }) => {
  const { modA, alice } = await world(baseURL!);
  await open(page, alice.email, modA.id);
  const [t, s, c] = await Promise.all([page.getByLabel('Ask a question').boundingBox(), page.getByRole('button', { name: 'Send question' }).boundingBox(), page.getByRole('button', { name: 'Add study materials' }).boundingBox()]);
  const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
  expect(Math.abs(mid(t!) - mid(s!)), 'input and Send share a centre line').toBeLessThan(1);
  expect(Math.abs(mid(c!) - mid(s!)), 'paperclip too').toBeLessThan(1);
  await expectNoHorizontalScroll(page);
});

test('mobile: Recent Chats is a collapsible section above the conversation and nothing overflows', async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== 'mobile');
  const { modA, alice } = await world(baseURL!);
  expect((await ask(alice.ctx, modA.id, 'A saved mobile chat')).status()).toBe(200);
  await open(page, alice.email, modA.id);
  await expectNoHorizontalScroll(page);
  await expect(recent(page).getByRole('button', { name: /^A saved mobile chat/ })).toBeHidden();      // collapsed by default on small screens
  await recent(page).getByRole('button', { name: /^Recent Chats/ }).click();
  await expect(recent(page).getByRole('button', { name: /^A saved mobile chat/ })).toBeVisible();
  await recent(page).getByRole('button', { name: /^A saved mobile chat/ }).click();
  await expect(page.getByRole('log', { name: 'Conversation' }).getByText('A saved mobile chat')).toBeVisible();
  await expectNoHorizontalScroll(page);
});
