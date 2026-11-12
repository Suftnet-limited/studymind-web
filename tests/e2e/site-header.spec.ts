// The site header: logo-only mark, nav pills with an active state, and the avatar account menu. Real sign-in, no AI.
import { expect, test, type Page } from '@playwright/test';
import { accountMenu, apiAccount, expectNoHorizontalScroll, expectSignedIn, signIn, signOut } from './helpers';

const header = (page: Page) => page.getByRole('banner');
const nav = (page: Page) => header(page).getByRole('navigation', { name: 'Learning navigation' });

test('logo: only the mark is shown (no wordmark), and it still has the accessible name StudyMind and links home', async ({ page }) => {
  await page.goto('/');
  const logo = header(page).getByRole('link', { name: 'StudyMind' });
  await expect(logo).toHaveAttribute('href', '/');
  await expect(logo.locator('svg')).toBeVisible();
  const box = (await logo.boundingBox())!;
  expect(box.width, 'the logo link is the mark only').toBeLessThan(60);
  expect(await logo.evaluate((el) => [...el.querySelectorAll('*')].filter((n) => n.textContent?.trim() && getComputedStyle(n).position !== 'absolute').length), 'no visible wordmark text').toBe(0);
});

test('signed in: nav pills, active state follows the page, and the account menu holds the name and Sign out', async ({ page, baseURL }) => {
  const learner = await apiAccount(baseURL!, 'hdr', 'student');
  await page.goto('/my-learning'); await signIn(page, learner.email);
  await expectSignedIn(page);
  for (const name of ['My modules', 'Plans', 'AI access']) await expect(nav(page).getByRole('link', { name, exact: true })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'My modules' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Sign out' }), 'Sign out is no longer a page button').toHaveCount(0);

  await nav(page).getByRole('link', { name: 'Plans', exact: true }).click();
  await expect(page).toHaveURL(/\/my-learning\/plans$/);
  await expect(nav(page).getByRole('link', { name: 'Plans', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav(page).getByRole('link', { name: 'My modules' })).not.toHaveAttribute('aria-current', 'page');
  await nav(page).getByRole('link', { name: 'AI access' }).click();
  await expect(nav(page).getByRole('link', { name: 'AI access' })).toHaveAttribute('aria-current', 'page');
  await expect(nav(page).getByRole('link', { name: 'Plans', exact: true })).not.toHaveAttribute('aria-current', 'page');

  const trigger = accountMenu(page);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const menu = page.getByRole('menu', { name: 'Account' });
  await expect(menu).toContainText(/E2E hdr/);                                              // the account name (apiAccount names it after the tag)
  await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeFocused();         // keyboard users land on the first item
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();                                                  // and focus returns to the avatar
  await trigger.click(); await page.mouse.click(5, 400);                                // a click outside closes it too
  await expect(menu).toHaveCount(0);
});

test('Sign out from the account menu ends the session and returns to sign-in', async ({ page, baseURL }) => {
  const learner = await apiAccount(baseURL!, 'hdr-out', 'student');
  await page.goto('/my-learning'); await signIn(page, learner.email);
  await signOut(page);
  await expect(page.getByTestId('auth-shell')).toBeVisible();                           // back at the sign-in screen
  await expect(accountMenu(page)).toHaveCount(0);
  expect((await (await page.request.get('/api/studymind/auth/status')).json()).authenticated).toBe(false);
});

for (const width of [320, 360, 393, 768, 1280]) {
  test(`header fits at ${width}px: no horizontal scroll, every link reachable by name, avatar visible`, async ({ page, baseURL }, info) => {
    test.skip(info.project.name !== 'desktop', 'sets its own viewport');
    await page.setViewportSize({ width, height: 800 });
    const learner = await apiAccount(baseURL!, `hdr-${width}`, 'student');
    await page.goto('/my-learning'); await signIn(page, learner.email);
    await expectNoHorizontalScroll(page);
    for (const name of ['My modules', 'Plans', 'AI access']) {
      const link = nav(page).getByRole('link', { name, exact: true });                  // labels may be icon-only on small screens but keep their names
      await expect(link).toBeVisible();
      const b = (await link.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(width);
    }
    const a = (await accountMenu(page).boundingBox())!;
    expect(a.x + a.width).toBeLessThanOrEqual(width);
    expect(a.height).toBeGreaterThanOrEqual(40);                                         // a comfortable touch target
  });
}
