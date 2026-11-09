import { expect, request, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';

export const PASSWORD = 'Browser-Test-Pass-123!';
export const uniqueEmail = (tag: string) => `e2e-${randomBytes(4).toString('hex')}-${tag}@example.com`;

export async function shot(page: Page, info: TestInfo, name: string) {
  const dir = process.env.E2E_SHOTS || 'test-results/screenshots';
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${info.project.name}-${name}.png`, fullPage: true });
}

/** Creates an account through the Web API and returns an authenticated API context. */
export async function apiAccount(baseURL: string, tag: string, role: 'student' | 'lecturer' | 'self_learner') {
  const ctx = await request.newContext({ baseURL });
  const email = uniqueEmail(tag);
  const res = await ctx.post('/api/studymind/auth/register', { data: { email, full_name: `E2E ${tag}`, password: PASSWORD, role } });
  expect(res.status(), await res.text()).toBe(201);
  return { ctx, email };
}
export async function apiCreateClass(ctx: APIRequestContext, title: string) {
  const res = await ctx.post('/api/studymind/modules', { data: { title, access_type: 'class' } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: string; title: string };
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page scrolls horizontally').toBeLessThanOrEqual(1);
}
/** Sign in without asserting success (for negative tests). */
export async function submitSignIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
export async function signIn(page: Page, email: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}
