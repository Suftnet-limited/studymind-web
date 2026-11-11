// Sign-in and registration screens (adapted from Learnify's auth design). Real sign-in against the running stack; no AI is used.
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';

const PASSWORD = 'Screens-Test-Pass-123!';
const email = () => `screens-${randomBytes(4).toString('hex')}@example.com`;
const noHScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test('sign-in screen: layout, labels, show/hide password, focus, error banner', async ({ page }, info) => {
  await page.goto('/my-learning');
  const shell = page.getByTestId('auth-shell');
  await expect(shell).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeFocused();                                   // autofocus: type straight away
  const password = page.getByLabel('Password');
  await expect(password).toHaveAttribute('type', 'password');
  await password.fill('not-shown-by-default');
  await page.getByRole('button', { name: /Show/ }).click();
  await expect(password).toHaveAttribute('type', 'text');                                  // show / hide toggle
  await page.getByRole('button', { name: /Hide/ }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();             // until both fields are filled
  await page.getByLabel('Email').fill('nobody@example.com');
  await password.fill('wrong-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();                                    // clear error banner, form kept
  await expect(page.getByLabel('Email')).toHaveValue('nobody@example.com');
  await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/my-learning/register');
  if (info.project.name === 'desktop') await expect(page.getByText('Learn smarter from your own materials.')).toBeVisible();   // brand panel on wide screens
  await noHScroll(page);
  await page.screenshot({ path: info.outputPath(`signin-${info.project.name}.png`), fullPage: true });
});

test('the site header and learning nav are inert behind the auth screen (keyboard goes straight to the form)', async ({ page }) => {
  await page.goto('/my-learning');
  await expect(page.getByTestId('auth-shell')).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('body > header')?.hasAttribute('inert'))).toBe(true);
  await page.keyboard.press('Tab');                                                       // from the autofocused email field
  await expect(page.getByLabel('Password')).toBeFocused();
});

test('registration: strength tips, role help, validation, creates the account and signs in', async ({ page }, info) => {
  const address = email();
  await page.goto('/my-learning/register');
  await expect(page.getByRole('heading', { name: 'Create a StudyMind account' })).toBeVisible();
  await expect(page.getByLabel('Full name')).toBeFocused();
  await page.getByLabel('Full name').fill('Screens Tester');
  await page.getByLabel('Email').fill(address);
  const checks = page.getByRole('list', { name: 'Strength checks' });
  await page.getByLabel('Password').fill('short');
  await expect(checks).toBeVisible();
  await expect(checks.locator('li[data-ok="true"]')).toHaveCount(0);
  await page.getByLabel('Password').fill(PASSWORD);
  await expect(checks.locator('li[data-ok="true"]')).toHaveCount(3);                      // 12+ characters, mixed case, a number
  await page.getByLabel('Account type').selectOption('lecturer');
  await expect(page.getByText(/Create class modules/)).toBeVisible();                    // help text follows the role
  await page.getByLabel('Account type').selectOption('student');
  await expect(page.getByText(/Join your lecturer/)).toBeVisible();
  await noHScroll(page);
  await page.screenshot({ path: info.outputPath(`register-${info.project.name}.png`), fullPage: true });
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('auth-shell')).toHaveCount(0, { timeout: 20_000 });       // signed in: the workspace replaces the screen
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  expect(await (await page.request.get('/api/studymind/auth/status')).json()).toMatchObject({ authenticated: true });
});

test('registration: a too-short password is blocked by the form, and a duplicate email shows a clear message', async ({ page }) => {
  const address = email();
  await page.request.post('/api/studymind/auth/register', { data: { email: address, full_name: 'Dup Tester', password: PASSWORD, role: 'self_learner' } });
  await page.context().clearCookies();
  await page.goto('/my-learning/register');
  await page.getByLabel('Full name').fill('Dup Tester');
  await page.getByLabel('Email').fill(address);
  await page.getByLabel('Password').fill('tooshort');
  await page.getByRole('button', { name: 'Create account' }).click();
  expect(await page.getByLabel('Password').evaluate((el: HTMLInputElement) => el.validity.tooShort)).toBe(true);   // browser validation
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toBeVisible();                                    // already registered
  await expect(page.getByTestId('auth-shell')).toBeVisible();
});

for (const width of [320, 360, 393]) {
  test(`both screens fit at ${width}px with no horizontal scroll and a visible logo`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'sets its own viewport');
    await page.setViewportSize({ width, height: 740 });
    for (const path of ['/my-learning', '/my-learning/register']) {
      await page.goto(path);
      await expect(page.getByTestId('auth-shell')).toBeVisible();
      await noHScroll(page);
      await expect(page.getByTestId('auth-shell').getByRole('link', { name: 'StudyMind' }).last()).toBeVisible();   // compact logo replaces the side panel
      await expect(page.getByRole('button', { name: /Sign in|Create account/ }).first()).toBeVisible();
    }
  });
}
