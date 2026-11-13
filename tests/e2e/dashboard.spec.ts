// The learner dashboard ("Learning Workspace"): stat tiles, create / join cards, and the searchable, sortable, paged module tables.
// Real sign-in and real modules; no AI.
import { expect, test, type Page } from '@playwright/test';
import { apiAccount, apiCreateClass, expectNoHorizontalScroll, signIn } from './helpers';

const owned = (page: Page) => page.getByRole('region', { name: /Owned modules/ });
const enrolled = (page: Page) => page.getByRole('region', { name: /Enrolled modules/ });
const tile = (page: Page, label: string) => page.getByRole('list', { name: 'Overview' }).getByRole('listitem').filter({ hasText: label });

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

test('dashboard: welcome, four stat tiles, create and join cards, both tables with their columns', async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'the table layout; phones get cards (see the last test)');
  await learner(baseURL!, page, ['Year 5 Mathematics Curriculum (England)', 'Abel CV']);
  await expect(page.getByText('Welcome back, E2E dash-me')).toBeVisible();
  await expect(tile(page, 'Owned modules')).toContainText('2');
  await expect(tile(page, 'Enrolled modules')).toContainText('2');
  await expect(tile(page, 'In progress')).toContainText('0');
  await expect(tile(page, 'Completed')).toContainText('0');
  await expect(page.getByRole('heading', { name: 'Create a module' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Join a course' })).toBeVisible();

  const o = owned(page);
  await expect(o.getByRole('heading', { name: /Owned modules/ })).toContainText('2');
  for (const col of ['Module name', 'Type', 'Created on', 'Materials', 'Status', 'Actions']) await expect(o.getByRole('columnheader', { name: col })).toBeVisible();
  const row = o.getByRole('row').filter({ hasText: 'Year 5 Mathematics Curriculum (England)' });
  await expect(row.getByText('Personal')).toBeVisible();
  await expect(row.getByText('Active')).toBeVisible();
  await expect(row).toContainText(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
  await expect(row.getByRole('cell').nth(3)).toContainText('0');                                        // no materials yet

  const e = enrolled(page);
  for (const col of ['Module name', 'Type', 'Enrolled on', 'Progress', 'Status', 'Actions']) await expect(e.getByRole('columnheader', { name: col })).toBeVisible();
  const bio = e.getByRole('row').filter({ hasText: 'Introduction to Biology' });
  await expect(bio.getByText('Class')).toBeVisible();
  await expect(bio.getByText('Not Started')).toBeVisible();
  await expect(bio.getByRole('progressbar', { name: 'Study progress' })).toHaveAttribute('aria-valuenow', '0');
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: info.outputPath(`dashboard-${info.project.name}.png`), fullPage: true });
});

test('dashboard: opening a module, the actions menu, and copying a Course ID (lecturer)', async ({ page, baseURL, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'the table layout; phones get cards (see the last test)');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { cls } = await learner(baseURL!, page, ['Notes']);
  const row = enrolled(page).getByRole('row').filter({ hasText: 'Introduction to Biology' });
  await row.getByRole('button', { name: 'Actions for Introduction to Biology' }).click();
  const menu = page.getByRole('menu', { name: 'Introduction to Biology actions' });
  await expect(menu.getByRole('menuitem', { name: 'Open module' })).toBeFocused();
  await expect(menu.getByRole('menuitem', { name: 'Copy Course ID' }), 'learners cannot share a class').toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0);
  await row.getByRole('link', { name: 'Introduction to Biology' }).click();
  await expect(page).toHaveURL(new RegExp(`/my-learning/modules/${cls.id}$`));
});

test('dashboard: a lecturer sees class totals, their classes, and can copy a Course ID from the actions menu', async ({ page, baseURL, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const lecturer = await apiAccount(baseURL!, 'dash-lec2', 'lecturer');
  const cls = await apiCreateClass(lecturer.ctx, 'Physics 201 (E2E)');
  await page.goto('/my-learning'); await signIn(page, lecturer.email);
  await expect(tile(page, 'Owned modules')).toContainText('1');
  await expect(tile(page, 'Class modules')).toContainText('1');
  await expect(tile(page, 'Students')).toContainText('0');
  await expect(tile(page, 'Materials')).toContainText('0');
  await expect(page.getByRole('heading', { name: 'Join a course' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: /Enrolled modules/ })).toHaveCount(0);
  await owned(page).getByRole('button', { name: 'Actions for Physics 201 (E2E)' }).first().click();
  await page.getByRole('menuitem', { name: 'Copy Course ID' }).click();
  await expect(page.getByRole('menuitem', { name: 'Course ID copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(cls.id);
});

test('dashboard: search, sorting and paging in the owned table', async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'the table layout; phones get cards (see the last test)');
  await learner(baseURL!, page, ['Zoology', 'Algebra', 'Chemistry', 'History', 'Geometry', 'Physics', 'Biology notes']);   // 7 -> two pages of five
  const o = owned(page);
  await expect(o.getByRole('heading', { name: /Owned modules/ })).toContainText('7');
  await expect(o.getByRole('row')).toHaveCount(6);                                                      // header + 5
  await expect(o.getByRole('navigation', { name: /pages/ }).getByRole('button', { name: 'Page 2' })).toBeVisible();
  await expect(o.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  await o.getByRole('button', { name: 'Next page' }).click();
  await expect(o.getByRole('row')).toHaveCount(3);                                                      // header + 2
  await expect(o.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await expect(o.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');

  await o.getByRole('button', { name: 'Module name' }).click();                                         // sorting returns to page 1
  await expect(o.getByRole('columnheader', { name: 'Module name' })).toHaveAttribute('aria-sort', 'ascending');
  await expect(o.getByRole('row').nth(1)).toContainText('Algebra');
  await o.getByRole('button', { name: 'Module name' }).click();
  await expect(o.getByRole('columnheader', { name: 'Module name' })).toHaveAttribute('aria-sort', 'descending');
  await expect(o.getByRole('row').nth(1)).toContainText('Zoology');

  await o.getByRole('searchbox').fill('geom');
  await expect(o.getByRole('row')).toHaveCount(2);
  await expect(o.getByRole('row').nth(1)).toContainText('Geometry');
  await o.getByRole('searchbox').fill('nothing matches');
  await expect(o.getByRole('status')).toContainText('No modules match');
  await o.getByRole('searchbox').fill('');
  await expect(o.getByRole('row')).toHaveCount(6);
});

test('dashboard: creating and joining still work from the new cards', async ({ page, baseURL }) => {
  const { lecturer } = await learner(baseURL!, page, []);
  await expect(owned(page).getByText('No owned modules yet')).toBeVisible();
  await page.getByLabel('Module title').fill('My Chemistry Notes');
  await page.getByRole('button', { name: 'Create module' }).click();
  await expect(owned(page).getByRole('link', { name: 'My Chemistry Notes' })).toBeVisible();
  await expect(tile(page, 'Owned modules')).toContainText('1');
  const extra = await apiCreateClass(lecturer.ctx, 'History 110');
  await page.getByLabel('Course ID').fill(extra.id);
  await page.getByRole('button', { name: 'Join course' }).click();
  await expect(enrolled(page).getByRole('link', { name: 'History 110' })).toBeVisible();
  await expect(tile(page, 'Enrolled modules')).toContainText('3');
});

test('dashboard on a phone: modules become cards, nothing scrolls sideways', async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone layout');
  await learner(baseURL!, page, ['Year 5 Mathematics Curriculum (England)']);
  await expect(owned(page).getByRole('table')).toBeHidden();
  const card = owned(page).getByRole('list', { name: 'Owned modules' }).getByRole('listitem').first();
  await expect(card.getByRole('link', { name: /Year 5 Mathematics/ })).toBeVisible();
  await expect(card).toContainText('Personal'); await expect(card).toContainText('Active'); await expect(card).toContainText('0 materials');
  const e = enrolled(page).getByRole('list', { name: 'Enrolled modules' }).getByRole('listitem').first();
  await expect(e.getByRole('progressbar')).toBeVisible();
  await expectNoHorizontalScroll(page);
});
