import { expect, test } from '@playwright/test';
import { apiAccount, apiCreateClass, expectNoHorizontalScroll, shot, signIn } from './helpers';

const CODE = /^CIQ-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

test('lecturer shares a generated code; a student scanning the link lands on the join screen and joins', async ({ page, browser, baseURL, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const lecturer = await apiAccount(baseURL!, 'lecturer', 'lecturer');
  const created = await apiCreateClass(lecturer.ctx, 'Share Code Module');
  const code = ((await (await lecturer.ctx.get(`/api/studymind/modules/${created.id}`)).json()) as { course_code: string }).course_code;
  expect(code, 'class module created without a code gets one').toMatch(CODE);

  // Lecturer: Share button → code, QR, copy buttons
  await page.goto('/my-learning');
  await signIn(page, lecturer.email);
  await page.goto(`/my-learning/modules/${created.id}`);
  await expect(page.getByRole('heading', { name: 'Share Code Module' })).toBeVisible();
  await page.getByTestId('share-course').click();
  const dialog = page.getByRole('dialog', { name: 'Share this course' });
  await expect(dialog.getByTestId('share-code')).toHaveText(code);
  await expect(dialog.getByTestId('share-url')).toHaveText(`https://ciquis.com/join/${code}`);
  await expect(dialog.locator('svg[role="img"]')).toBeVisible();
  await shot(page, info, 'share-dialog');
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: 'Copy code' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await dialog.getByRole('button', { name: 'Copy link' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`https://ciquis.com/join/${code}`);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Signed-out visitor following the link sees the code and sign-in options (no data about the course)
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(`${baseURL}/join/${code}`);
  await expect(anonPage).toHaveURL(new RegExp(`/my-learning/join/${code}$`));
  await expect(anonPage.getByTestId('join-signed-out')).toContainText(code);
  await expect(anonPage.getByTestId('join-signed-out').getByRole('link', { name: 'Sign in' })).toBeVisible();
  await anon.close();

  // Student: the short link → confirmation screen (course + lecturer) → join → module page
  const student = await browser.newContext();
  const studentPage = await student.newPage();
  await studentPage.goto(`${baseURL}/my-learning`);
  const s = await apiAccount(baseURL!, 'student', 'student');
  await signIn(studentPage, s.email);
  await studentPage.goto(`${baseURL}/join/${code.toLowerCase()}`);
  await expect(studentPage.getByText('Share Code Module', { exact: true })).toBeVisible();
  await expect(studentPage.getByText('Lecturer: E2E lecturer')).toBeVisible();
  await shot(studentPage, info, 'join-confirmation');
  await studentPage.getByRole('button', { name: 'Join "Share Code Module"' }).click();
  await expect(studentPage).toHaveURL(new RegExp(`/my-learning/modules/${created.id}$`));
  await expect(studentPage.getByTestId('share-course'), 'students never see the Share button').toHaveCount(0);
  await student.close();
});

test('Share button is for owners of class modules only; invalid links are rejected', async ({ page, baseURL }) => {
  const student = await apiAccount(baseURL!, 'selflearner', 'student');
  await page.goto('/my-learning');
  await signIn(page, student.email);
  const personal = await student.ctx.post('/api/studymind/modules', { data: { title: 'My Own Notes', access_type: 'personal' } });
  const id = ((await personal.json()) as { id: string }).id;
  await page.goto(`/my-learning/modules/${id}`);
  await expect(page.getByRole('heading', { name: 'My Own Notes' })).toBeVisible();
  await expect(page.getByTestId('share-course')).toHaveCount(0);

  await page.goto('/my-learning/join/bad%20code!');
  await expect(page.getByText('This join link isn’t valid')).toBeVisible();
  await page.goto('/my-learning/join/CIQ-ZZZZ');
  await expect(page.getByRole('alert').filter({ hasText: /not found/i })).toBeVisible();
});
