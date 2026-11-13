// The learner dashboard ("Learning Workspace"): stat tiles, create / join cards, and ONE searchable, sortable, paged "My modules" table
// with type badges (All / Personal / Class) to filter it. Real sign-in and real modules; no AI.
import { expect, test, type Page } from '@playwright/test';
import { apiAccount, apiCreateClass, expectNoHorizontalScroll, signIn } from './helpers';

const table = (page: Page) => page.getByRole('region', { name: /My modules/ });
const tile = (page: Page, label: string) => page.getByRole('list', { name: 'Overview' }).getByRole('listitem').filter({ hasText: label });
const typeBadge = (page: Page, name: string) => table(page).getByRole('group', { name: 'Filter by type' }).getByRole('button', { name: new RegExp(`^${name}`) });
const desktopOnly = (info: { project: { name: string } }) => test.skip(info.project.name !== 'desktop', 'the table layout; phones get cards (see the last test)');

async function learner(baseURL: string, page: Page, personal: string[]) {
  const lecturer = await apiAccount(baseURL, 'dash-lec', 'lecturer');
  const cls = await apiCreateClass(lecturer.ctx, 'Introduction to Biology');
  const cs = await apiCreateClass(lecturer.ctx, 'Introduction to Computer Science');
  const me = await apiAccount(baseURL, 'dash-me', 'self_learner');
  for (const m of [cls, cs]) expect((await me.ctx.post('/api/studymind/modules/join', { data: { course_id: m.id } })).status()).toBe(200);
  for (const title of personal) expect((await me.ctx.post('/api/studymind/modules', { data: { title, access_type: 'personal' } })).status()).toBe(201);
  await page.goto('/my-learning'); await signIn(page, me.email);
  await expect(page.getByRole('heading', { name: 'Learning Workspace' })).toBeVisible();
  return { me, cls, cs, lecturer };
}

test('dashboard: welcome, four stat tiles, create and join cards, and one table with every column', async ({ page, baseURL }, info) => {
  desktopOnly(info);
  await learner(baseURL!, page, ['Year 5 Mathematics Curriculum (England)', 'Abel CV']);
  await expect(page.getByText('Welcome back, E2E dash-me')).toBeVisible();
  await expect(tile(page, 'Owned modules')).toContainText('2');
  await expect(tile(page, 'Enrolled modules')).toContainText('2');
  await expect(tile(page, 'In progress')).toContainText('0');
  await expect(tile(page, 'Completed')).toContainText('0');
  await expect(page.getByRole('heading', { name: 'Create a module' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Join a course' })).toBeVisible();
  await expect(page.getByRole('region', { name: /Enrolled modules/ }), 'no separate Enrolled table any more').toHaveCount(0);

  const t = table(page);
  await expect(t.getByRole('heading', { name: /My modules/ })).toContainText('4');
  for (const col of ['Module name', 'Type', 'Date', 'Materials', 'Progress', 'Status', 'Actions']) await expect(t.getByRole('columnheader', { name: col })).toBeVisible();
  const mine = t.getByRole('row').filter({ hasText: 'Year 5 Mathematics Curriculum (England)' });
  await expect(mine.getByText('Personal')).toBeVisible();
  await expect(mine.getByText('Active')).toBeVisible();
  await expect(mine.getByText('Created')).toBeVisible();                                                  // owned: the date is when it was created
  await expect(mine).toContainText(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
  const bio = t.getByRole('row').filter({ hasText: 'Introduction to Biology' });
  await expect(bio.getByText('Class')).toBeVisible();
  await expect(bio.getByText('Enrolled')).toBeVisible();                                                  // enrolled: the date is when they joined
  await expect(bio.getByText('Not Started')).toBeVisible();
  await expect(bio.getByRole('progressbar', { name: 'Study progress' })).toHaveAttribute('aria-valuenow', '0');
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath(`dashboard-${info.project.name}.png`), fullPage: true });
});

test('dashboard: type badges filter the table, show counts, combine with search, and clear', async ({ page, baseURL }, info) => {
  desktopOnly(info);
  await learner(baseURL!, page, ['Year 5 Mathematics Curriculum (England)', 'Abel CV']);          // 2 personal + 2 class
  const t = table(page);
  await expect(typeBadge(page, 'All')).toHaveAttribute('aria-pressed', 'true');
  await expect(typeBadge(page, 'All')).toContainText('4');
  await expect(typeBadge(page, 'Personal')).toContainText('2');
  await expect(typeBadge(page, 'Class')).toContainText('2');
  await expect(t.getByRole('row')).toHaveCount(5);

  await typeBadge(page, 'Class').click();
  await expect(typeBadge(page, 'Class')).toHaveAttribute('aria-pressed', 'true');
  await expect(typeBadge(page, 'All')).toHaveAttribute('aria-pressed', 'false');
  await expect(t.getByRole('row')).toHaveCount(3);                                                        // header + 2 classes
  await expect(t.getByRole('row').filter({ hasText: 'Personal' })).toHaveCount(0);
  await expect(t.getByRole('row').filter({ hasText: 'Introduction to Biology' })).toHaveCount(1);

  await typeBadge(page, 'Personal').click();
  await expect(t.getByRole('row')).toHaveCount(3);
  await expect(t.getByRole('row').filter({ hasText: 'Class' })).toHaveCount(0);
  await expect(t.getByRole('row').filter({ hasText: 'Abel CV' })).toHaveCount(1);

  await t.getByRole('searchbox').fill('biology');                                                         // Personal + "biology" = nothing
  await expect(t.getByRole('status')).toContainText('No modules match your search or filter');
  await t.getByRole('button', { name: 'Clear filters' }).click();
  await expect(typeBadge(page, 'All')).toHaveAttribute('aria-pressed', 'true');
  await expect(t.getByRole('searchbox')).toHaveValue('');
  await expect(t.getByRole('row')).toHaveCount(5);

  await typeBadge(page, 'Class').click(); await t.getByRole('searchbox').fill('computer');            // Class + search narrows to one
  await expect(t.getByRole('row')).toHaveCount(2);
  await expect(t.getByRole('row').nth(1)).toContainText('Introduction to Computer Science');
});

test('dashboard: opening a module and the actions menu', async ({ page, baseURL }, info) => {
  desktopOnly(info);
  const { cls } = await learner(baseURL!, page, ['Notes']);
  const row = table(page).getByRole('row').filter({ hasText: 'Introduction to Biology' });
  await row.getByRole('button', { name: 'Actions for Introduction to Biology' }).click();
  const menu = page.getByRole('menu', { name: 'Introduction to Biology actions' });
  await expect(menu.getByRole('menuitem', { name: 'Open module' })).toBeFocused();
  await expect(menu.getByRole('menuitem', { name: 'Copy Course ID' }), 'learners cannot share a class').toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0);
  await row.getByRole('link', { name: 'Introduction to Biology' }).click();
  await expect(page).toHaveURL(new RegExp(`/my-learning/modules/${cls.id}$`));
});

test('dashboard: a lecturer sees class totals, one table, and can copy a Course ID from the actions menu', async ({ page, baseURL, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const lecturer = await apiAccount(baseURL!, 'dash-lec2', 'lecturer');
  const cls = await apiCreateClass(lecturer.ctx, 'Physics 201 (E2E)');
  await page.goto('/my-learning'); await signIn(page, lecturer.email);
  await expect(tile(page, 'Owned modules')).toContainText('1');
  await expect(tile(page, 'Class modules')).toContainText('1');
  await expect(tile(page, 'Students')).toContainText('0');
  await expect(tile(page, 'Materials')).toContainText('0');
  await expect(page.getByRole('heading', { name: 'Join a course' })).toHaveCount(0);
  await expect(typeBadge(page, 'Class')).toContainText('1');
  await table(page).getByRole('button', { name: 'Actions for Physics 201 (E2E)' }).first().click();
  await page.getByRole('menuitem', { name: 'Copy Course ID' }).click();
  await expect(page.getByRole('menuitem', { name: 'Course ID copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(cls.id);
});

test('dashboard: search, sorting and paging in the one table', async ({ page, baseURL }, info) => {
  desktopOnly(info);
  await learner(baseURL!, page, ['Zoology', 'Algebra', 'Chemistry', 'History', 'Geometry', 'Physics', 'Biology notes']);   // 7 + 2 classes = 9 -> two pages
  const t = table(page);
  await expect(t.getByRole('heading', { name: /My modules/ })).toContainText('9');
  await expect(t.getByRole('row')).toHaveCount(6);                                                       // header + 5
  await expect(t.getByRole('navigation', { name: /pages/ }).getByRole('button', { name: 'Page 2' })).toBeVisible();
  await expect(t.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  await t.getByRole('button', { name: 'Next page' }).click();
  await expect(t.getByRole('row')).toHaveCount(5);                                                       // header + 4
  await expect(t.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await expect(t.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');

  await t.getByRole('button', { name: 'Module name' }).click();                                          // sorting returns to page 1
  await expect(t.getByRole('columnheader', { name: 'Module name' })).toHaveAttribute('aria-sort', 'ascending');
  await expect(t.getByRole('row').nth(1)).toContainText('Algebra');
  await t.getByRole('button', { name: 'Module name' }).click();
  await expect(t.getByRole('columnheader', { name: 'Module name' })).toHaveAttribute('aria-sort', 'descending');
  await expect(t.getByRole('row').nth(1)).toContainText('Zoology');

  await t.getByRole('searchbox').fill('geom');
  await expect(t.getByRole('row')).toHaveCount(2);
  await expect(t.getByRole('row').nth(1)).toContainText('Geometry');
  await t.getByRole('searchbox').fill('nothing matches');
  await expect(t.getByRole('status')).toContainText('No modules match');
  await t.getByRole('searchbox').fill('');
  await expect(t.getByRole('row')).toHaveCount(6);
});

test('dashboard: creating and joining still work from the cards, and the new module appears in the one table', async ({ page, baseURL }) => {
  const { lecturer } = await learner(baseURL!, page, []);
  await page.getByLabel('Module title').fill('My Chemistry Notes');
  await page.getByRole('button', { name: 'Create module' }).click();
  await expect(table(page).getByRole('link', { name: 'My Chemistry Notes' })).toBeVisible();
  await expect(tile(page, 'Owned modules')).toContainText('1');
  const extra = await apiCreateClass(lecturer.ctx, 'History 110');
  await page.getByLabel('Course ID').fill(extra.id);
  await page.getByRole('button', { name: 'Join course' }).click();
  await expect(page.getByText('It now appears in My modules')).toBeVisible();
  await expect(table(page).getByRole('link', { name: 'History 110' })).toBeVisible();
  await expect(tile(page, 'Enrolled modules')).toContainText('3');
});

test('dashboard on a phone: modules become cards with the type badges, nothing scrolls sideways', async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone layout');
  await learner(baseURL!, page, ['Year 5 Mathematics Curriculum (England)']);
  await expect(table(page).getByRole('table')).toBeHidden();
  const cards = table(page).getByRole('list', { name: 'My modules' }).getByRole('listitem');
  await expect(cards).toHaveCount(3);
  const mine = cards.filter({ hasText: 'Year 5 Mathematics' });
  await expect(mine).toContainText('Personal'); await expect(mine).toContainText('Active'); await expect(mine).toContainText('Created'); await expect(mine).toContainText('0 materials');
  await expect(cards.filter({ hasText: 'Introduction to Biology' })).toContainText('Enrolled');
  await expect(cards.first().getByRole('progressbar')).toBeVisible();
  await typeBadge(page, 'Class').click();
  await expect(cards).toHaveCount(2);
  await typeBadge(page, 'Personal').click();
  await expect(cards).toHaveCount(1);
  await expectNoHorizontalScroll(page);
});
