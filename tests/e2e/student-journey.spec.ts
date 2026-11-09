import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { apiAccount, apiCreateClass, apiUpload, expectNoHorizontalScroll, PASSWORD, shot, signIn, submitSignIn, uniqueEmail } from './helpers';

async function registerThroughUi(page: Page, info: TestInfo, role: 'self_learner' | 'student', name: string) {
  const email = uniqueEmail(role);
  await page.goto('/my-learning');
  await expect(page.getByRole('heading', { name: 'Sign in to your learning workspace' })).toBeVisible();
  await shot(page, info, `${role}-01-signed-out`);
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { name: 'Create a StudyMind account' })).toBeVisible();
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Account type').selectOption(role);
  await shot(page, info, `${role}-02-register`);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(name)).toBeVisible();
  return email;
}

/** Upload validation in the browser, then a real upload and its reported indexing status. */
async function uploadAndCheckStatus(page: Page, info: TestInfo, prefix: string) {
  await page.getByLabel('Document').setInputFiles({ name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
  await expect(page.getByRole('alert').filter({ hasText: 'Unsupported file type' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload document' })).toBeDisabled();
  const big = info.outputPath('big.txt'); // Playwright cannot attach in-memory buffers over 50 MB
  writeFileSync(big, Buffer.alloc(51 * 1024 * 1024, 97));
  await page.getByLabel('Document').setInputFiles(big);
  await expect(page.getByRole('alert').filter({ hasText: '50 MB' })).toBeVisible();
  await shot(page, info, `${prefix}-upload-errors`);

  // The local AI has no OpenAI/Typesense, so a valid upload is accepted but indexing is reported as failed.
  await page.getByLabel('Document').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Mitochondria are the powerhouse of the cell.') });
  await page.getByRole('button', { name: 'Upload document' }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'notes.txt' });
  await expect(row).toBeVisible();
  await expect(row.getByText(/Indexed|Indexing…|Indexing failed/)).toBeVisible();
  await expect(page.getByText(/could not be indexed|Indexing has started|Uploaded and indexed/)).toBeVisible();
  await shot(page, info, `${prefix}-after-upload`);
  await expectNoHorizontalScroll(page);
}

test('self-learner journey: register, create a personal module, join a class, open it, upload, sign out and back in', async ({ page, baseURL }, info) => {
  const lecturer = await apiAccount(baseURL!, 'lecturer', 'lecturer');
  const classModule = await apiCreateClass(lecturer.ctx, 'History 110 (E2E)');
  await apiUpload(lecturer.ctx, classModule.id, 'reading-list.txt', 'Chapter 1 to 3', 'class');
  await apiUpload(lecturer.ctx, classModule.id, 'lecturer-private.txt', 'private lecturer notes', 'personal');

  const email = await registerThroughUi(page, info, 'self_learner', 'Ada Learner');
  await expect(page.getByText('No owned modules yet')).toBeVisible();
  await expect(page.getByText('No enrolled modules yet')).toBeVisible();
  await shot(page, info, 'self_learner-03-workspace-empty');
  await expectNoHorizontalScroll(page);

  // Self-learners create personal modules only, and can join classes
  await expect(page.getByLabel('Access type')).toHaveCount(0);
  await page.getByLabel('Module title').fill('My Chemistry Notes');
  await page.getByRole('button', { name: 'Create module' }).click();
  const owned = page.getByRole('region', { name: /Owned modules/ });
  await expect(owned.getByRole('link', { name: /My Chemistry Notes/ })).toBeVisible();

  await page.getByLabel('Course ID').fill(classModule.id);
  await page.getByRole('button', { name: 'Join course' }).click();
  await expect(page.getByText('You have joined the course')).toBeVisible();
  const enrolled = page.getByRole('region', { name: /Enrolled modules/ });
  await expect(enrolled.getByRole('link', { name: /History 110/ })).toBeVisible();
  await shot(page, info, 'self_learner-04-workspace-joined');
  await expectNoHorizontalScroll(page);

  // Open the class module: class material visible, lecturer's private file hidden, no lecturer-only controls
  await enrolled.getByRole('link', { name: /History 110/ }).click();
  await expect(page.getByRole('heading', { name: 'History 110 (E2E)', level: 1 })).toBeVisible();
  await expect(page.getByText('Enrolled', { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'reading-list.txt' })).toBeVisible();
  await expect(page.getByText('lecturer-private.txt')).toHaveCount(0);
  await expect(page.getByTestId('course-id')).toHaveCount(0);
  await expect(page.getByLabel('Visibility')).toHaveCount(0);
  await shot(page, info, 'self_learner-05-class-module');
  await expectNoHorizontalScroll(page);
  await page.getByRole('link', { name: /Back to learning workspace/ }).click();
  await expect(page.getByRole('heading', { name: 'Learning workspace' })).toBeVisible();

  // Open the personal module (no Course ID) and upload
  await page.getByRole('region', { name: /Owned modules/ }).getByRole('link', { name: /My Chemistry Notes/ }).click();
  await expect(page.getByRole('heading', { name: 'My Chemistry Notes', level: 1 })).toBeVisible();
  await expect(page.getByTestId('course-id')).toHaveCount(0);
  await expect(page.getByText('No materials yet')).toBeVisible();
  await uploadAndCheckStatus(page, info, 'self_learner-06');

  // Back, sign out, sign back in
  await page.getByRole('link', { name: /Back to learning workspace/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your learning workspace' })).toBeVisible();
  await signIn(page, email);
  await expect(page.getByRole('region', { name: /Owned modules/ }).getByRole('link', { name: /My Chemistry Notes/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /Enrolled modules/ }).getByRole('link', { name: /History 110/ })).toBeVisible();
  await shot(page, info, 'self_learner-07-signed-back-in');
});

test("student journey: register, join a lecturer's class by Course ID, view and upload materials", async ({ page, baseURL }, info) => {
  const lecturer = await apiAccount(baseURL!, 'lecturer', 'lecturer');
  const classModule = await apiCreateClass(lecturer.ctx, 'Biology 101 (E2E)');
  const email = await registerThroughUi(page, info, 'student', 'Sam Student');

  await expect(page.getByRole('button', { name: 'Create module' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Owned modules/ })).toHaveCount(0);
  await expect(page.getByText('No enrolled modules yet')).toBeVisible();
  await shot(page, info, 'student-03-workspace-empty');
  await expectNoHorizontalScroll(page);

  await page.getByLabel('Course ID').fill(classModule.id);
  await page.getByRole('button', { name: 'Join course' }).click();
  await expect(page.getByText('You have joined the course')).toBeVisible();
  const enrolled = page.getByRole('region', { name: /Enrolled modules/ });
  await expect(enrolled.getByRole('link', { name: /Biology 101/ })).toBeVisible();
  await shot(page, info, 'student-04-joined');
  await expectNoHorizontalScroll(page);

  // Joining again gives a readable error
  await page.getByLabel('Course ID').fill(classModule.id);
  await page.getByRole('button', { name: 'Join course' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /already/i })).toBeVisible();
  // An unknown Course ID is rejected readably
  await page.getByLabel('Course ID').fill('00000000-0000-4000-8000-000000000000');
  await page.getByRole('button', { name: 'Join course' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /not found/i })).toBeVisible();

  // Students see course information and Study tools but not the lecturer's Course ID share box
  await enrolled.getByRole('link', { name: /Biology 101/ }).click();
  await expect(page.getByRole('heading', { name: 'Biology 101 (E2E)', level: 1 })).toBeVisible();
  await expect(page.getByText('Enrolled', { exact: true })).toBeVisible();
  await expect(page.getByTestId('course-id')).toHaveCount(0);
  await expect(page.getByLabel('Visibility')).toHaveCount(0); // students always upload personal material
  await uploadAndCheckStatus(page, info, 'student-05');

  await page.getByRole('link', { name: /Back to learning workspace/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, email);
  await expect(page.getByRole('region', { name: /Enrolled modules/ }).getByRole('link', { name: /Biology 101/ })).toBeVisible();
  await shot(page, info, 'student-06-signed-back-in');
});

test('wrong password shows a readable error', async ({ page, baseURL }) => {
  const student = await apiAccount(baseURL!, 'pw', 'student');
  await page.goto('/my-learning');
  await submitSignIn(page, student.email, 'wrong-password-123');
  await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible();
});

test('signed-out visitors cannot read a module and see a clear message', async ({ page }) => {
  await page.goto('/my-learning/modules/123e4567-e89b-12d3-a456-426614174000');
  await expect(page.getByRole('alert').filter({ hasText: /session has expired|not found|Authentication/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Back to learning workspace/ })).toBeVisible();
});

test('header: Sign in and Get started use the canonical journey and are readable', async ({ page }, info) => {
  await page.goto('/my-learning/plans');
  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/my-learning');
  const cta = header.getByRole('link', { name: 'Get started' });
  await expect(cta).toHaveAttribute('href', '/my-learning/register');
  // White text on the violet button (previously overridden by a global link colour reset)
  await expect(cta).toHaveCSS('color', 'rgb(255, 255, 255)');
  await shot(page, info, 'header-get-started');
  await cta.click();
  await expect(page.getByRole('heading', { name: 'Create a StudyMind account' })).toBeVisible();
  await page.goto('/my-learning');
  await expect(page.getByRole('link', { name: 'Sign in with it here' })).toHaveAttribute('href', '/sign-in'); // legacy Web accounts keep access
});

test('session: protected routes require sign-in and a refreshed session survives an expired access cookie', async ({ page, context, baseURL }) => {
  const account = await apiAccount(baseURL!, 'sess', 'student');
  await page.goto('/my-learning/plans');
  await expect(page.getByText(/Sign in.*to see your remaining allowances/)).toBeVisible();
  await page.goto('/my-learning');
  await signIn(page, account.email);
  // Drop the access cookie (as if it expired); the refresh cookie must keep the session alive
  await context.clearCookies({ name: 'studymind_ai_access' });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/my-learning/plans');
  await expect(page.getByText(/Sign in.*to see your remaining allowances/)).toBeVisible();
});
