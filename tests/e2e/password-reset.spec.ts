import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll } from './helpers';

const TOKEN = 'a'.repeat(48);

test('sign-in links to Forgot password, and the form tells the user to check their email (always the same answer)', async ({ page }) => {
  await page.route('**/api/studymind/auth/password-recovery/request', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.goto('/my-learning');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
  await page.getByLabel('Email').fill('someone@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByTestId('reset-sent')).toContainText('If an account exists for');
  await expect(page.getByTestId('reset-sent')).toContainText('someone@example.com');
  await expectNoHorizontalScroll(page);
});

test('forgot password: a backend with email switched off shows a readable message (no mock)', async ({ page }) => {
  await page.goto('/my-learning/forgot-password');
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.locator('[role=alert]').filter({ hasText: /\S/ }).first()).toContainText(/not available yet|Too many attempts|try again/i);
});

test('forgot password: rate limit message', async ({ page }) => {
  await page.route('**/api/studymind/auth/password-recovery/request', route => route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"Too many attempts. Please wait a while and try again."}' }));
  await page.goto('/my-learning/forgot-password');
  await page.getByLabel('Email').fill('someone@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.locator('[role=alert]').filter({ hasText: /\S/ }).first()).toContainText('Too many attempts');
});

test('reset page without a token explains the link is incomplete and offers a new one', async ({ page }) => {
  await page.goto('/my-learning/reset-password');
  await expect(page.getByTestId('reset-invalid')).toBeVisible();
  await page.getByRole('link', { name: 'Request a new link' }).click();
  await expect(page).toHaveURL(/forgot-password/);
});

test('reset: mismatched passwords are caught in the form, a good change shows the success state', async ({ page }) => {
  await page.route('**/api/studymind/auth/password-recovery/confirm', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.goto(`/my-learning/reset-password?token=${TOKEN}`);
  await page.getByLabel('New password', { exact: true }).fill('Brand-New-Pass-123');
  await page.getByLabel('Confirm new password').fill('Brand-New-Pass-124');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.locator('[role=alert]').filter({ hasText: /\S/ }).first()).toContainText('do not match');
  await page.getByLabel('Confirm new password').fill('Brand-New-Pass-123');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByTestId('reset-done')).toContainText('sign in with your new password');
  await expectNoHorizontalScroll(page);
});

test('reset: an expired or used link shows a readable error and the way forward', async ({ page }) => {
  await page.route('**/api/studymind/auth/password-recovery/confirm', route => route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"This reset link is invalid or has expired. Request a new one."}' }));
  await page.goto(`/my-learning/reset-password?token=${TOKEN}`);
  await page.getByLabel('New password', { exact: true }).fill('Brand-New-Pass-123');
  await page.getByLabel('Confirm new password').fill('Brand-New-Pass-123');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.locator('[role=alert]').filter({ hasText: /\S/ }).first()).toContainText('invalid or has expired');
});

test('the Web routes validate input before calling the backend', async ({ request }) => {
  expect((await request.post('/api/studymind/auth/password-recovery/request', { data: { email: 'not-an-email' } })).status()).toBe(400);
  expect((await request.post('/api/studymind/auth/password-recovery/request', { data: {} })).status()).toBe(400);
  expect((await request.post('/api/studymind/auth/password-recovery/confirm', { data: { token: 'short', password: 'Brand-New-Pass-123' } })).status()).toBe(400);
  expect((await request.post('/api/studymind/auth/password-recovery/confirm', { data: { token: TOKEN, password: 'weakpass' } })).status()).toBe(400);
  expect((await request.post('/api/studymind/auth/password-recovery/confirm', { data: { token: TOKEN, password: 'alllowercase12345' } })).status()).toBe(400);
});
