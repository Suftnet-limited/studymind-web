// Plans and AI access (allowances) are two separate screens, each with its own address, nav state and layout. Real sign-in, no AI.
import { expect, test, type Page } from '@playwright/test';
import { apiAccount, expectNoHorizontalScroll, signIn } from './helpers';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Learning navigation' });

test('two screens: Plans and AI access have their own URLs, headings and nav state', async ({ page, baseURL }) => {
  const me = await apiAccount(baseURL!, 'split', 'self_learner');
  await page.goto('/my-learning'); await signIn(page, me.email);

  await nav(page).getByRole('link', { name: 'Plans', exact: true }).click();
  await expect(page).toHaveURL(/\/my-learning\/plans$/);
  await expect(page.getByText('Subscription Plans')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose your StudyMind plan' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Plans', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav(page).getByRole('link', { name: 'AI access' })).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Your Remaining Allowances' }), 'no usage on the Plans screen').toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByTestId('plan-free')).toContainText('£0');
  await expect(page.getByTestId('plan-free')).toContainText('You are on Free');
  await expect(page.getByTestId('plan-plus')).toContainText('£3.99');
  await expect(page.getByTestId('plan-plus')).toContainText('One payment, no subscription');

  await nav(page).getByRole('link', { name: 'AI access' }).click();
  await expect(page).toHaveURL(/\/my-learning\/allowances$/);
  await expect(page.getByText('Your Usage', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Allowances', exact: true })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'AI access' })).toHaveAttribute('aria-current', 'page');
  await expect(nav(page).getByRole('link', { name: 'Plans', exact: true })).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Choose your StudyMind plan' }), 'no plan cards on the Allowances screen').toHaveCount(0);
  await expect(page.getByTestId('current-plan')).toContainText('Current plan');
  await expect(page.getByTestId('current-plan')).toContainText('Free');
  await expect(page.getByTestId('current-plan')).toContainText('Resets monthly');
  await expect(page.getByRole('heading', { name: 'Your Remaining Allowances' })).toBeVisible();
  for (const [label, max] of [['AI chats', '10'], ['Quizzes', '2'], ['Flashcard generations', '2'], ['Summaries', '1']]) {
    const bar = page.getByRole('progressbar', { name: `${label} remaining` });
    await expect(bar).toHaveAttribute('aria-valuemax', max); await expect(bar).toHaveAttribute('aria-valuenow', max);
    await expect(page.getByRole('listitem').filter({ has: bar })).toContainText('100%');
  }
  await expect(page.getByRole('link', { name: 'See the plans' })).toHaveAttribute('href', '/my-learning/plans');
});

test('links from before the split still land on the right screen', async ({ page, baseURL }) => {
  const me = await apiAccount(baseURL!, 'split-old', 'self_learner');
  await page.goto('/my-learning'); await signIn(page, me.email);
  await page.goto('/my-learning/plans#allowances');
  await expect(page).toHaveURL(/\/my-learning\/allowances$/);
  await expect(page.getByRole('heading', { name: 'Allowances', exact: true })).toBeVisible();
  await page.goto('/billing');                                                                             // the old "AI access" address
  await expect(page).toHaveURL(/\/my-learning\/allowances$/);
});

test('allowances shows the days left for an active pass, and each page fits every width', async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'sets its own viewport');
  const me = await apiAccount(baseURL!, 'split-fit', 'self_learner');
  await page.goto('/my-learning'); await signIn(page, me.email);
  await page.route('**/api/studymind/entitlements', (route) => route.fulfill({ json: { available: true, plan: 'plus', expires_at: new Date(Date.now() + 24 * 86_400_000 - 3_600_000).toISOString(), enforcement_enabled: true, purchase_available: true,
    allowances: { chats: { limit: 200, remaining: 194 }, quizzes: { limit: 30, remaining: 26 }, flashcards: { limit: 30, remaining: 25 }, summaries: { limit: 15, remaining: 14 } } } }));
  await page.goto('/my-learning/allowances');
  await expect(page.getByTestId('current-plan')).toContainText('StudyMind Plus');
  await expect(page.getByTestId('current-plan')).toContainText('Active until');
  await expect(page.getByTestId('current-plan')).toContainText('24 days left');
  await expect(page.getByRole('listitem').filter({ hasText: 'AI chats' })).toContainText('97%');
  await expect(page.getByRole('listitem').filter({ hasText: 'AI chats' })).toContainText('194 of 200 left');
  await expect(page.getByRole('listitem').filter({ hasText: 'Quizzes' })).toContainText('87%');
  await expect(page.getByRole('listitem').filter({ hasText: 'Flashcard generations' })).toContainText('83%');
  await expect(page.getByRole('listitem').filter({ hasText: 'Summaries' })).toContainText('93%');
  await expect(page.getByRole('link', { name: 'See the plans' }), 'Plus users are not nudged to buy').toHaveCount(0);
  // slim bars (10px), one colour per card, and the page lines up with the header's content edges
  const bars = page.getByRole('progressbar');
  expect(await bars.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))).toEqual([10, 10, 10, 10]);
  const fills = await bars.evaluateAll((els) => els.map((e) => getComputedStyle(e.firstElementChild!).backgroundColor));
  expect(new Set(fills).size, 'a different colour for each allowance').toBe(4);
  for (const width of [1280, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    const logo = (await page.getByRole('banner').getByRole('link', { name: 'StudyMind' }).boundingBox())!;
    const h1 = (await page.getByRole('heading', { name: 'Allowances', exact: true }).boundingBox())!;
    const card = (await page.getByRole('progressbar').first().locator('xpath=ancestor::li').boundingBox())!;
    expect(Math.abs(h1.x - logo.x), `heading lines up with the header at ${width}px`).toBeLessThanOrEqual(2);
    expect(Math.abs(card.x - logo.x), `cards line up with the header at ${width}px`).toBeLessThanOrEqual(2);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: info.outputPath('allowances-plus-desktop.png'), fullPage: true });
  await page.goto('/my-learning/plans');
  await expect(page.getByTestId('plan-plus')).toContainText('Your current plan');
  await expect(page.getByTestId('plan-plus')).toContainText('StudyMind Plus is active');
  await expect(page.getByRole('link', { name: 'View my allowances' })).toHaveAttribute('href', '/my-learning/allowances');
  await expect(page.getByTestId('plan-free')).toContainText('Included with every account');
  await page.screenshot({ path: info.outputPath('plans-plus-desktop.png'), fullPage: true });
  for (const width of [320, 393, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/my-learning/plans', '/my-learning/allowances']) { await page.goto(path); await expect(page.getByRole('banner')).toBeVisible(); await expectNoHorizontalScroll(page); }
  }
});
