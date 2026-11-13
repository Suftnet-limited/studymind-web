// Approved landing page (hero, CTAs, three highlights) and the existing sections that must remain. No sign-in or AI involved.
import { expect, test, type Page } from '@playwright/test';

const noHScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test('hero: approved copy, two calls to action, accurate image alt text, header unchanged', async ({ page }, info) => {
  await page.goto('/');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toHaveText(/Learn smarter\.\s*Achieve more\./);
  await expect(page.getByText('An AI-powered workspace to study, practise and stay organised.')).toBeVisible();
  const primary = page.getByRole('link', { name: 'Get started free' });
  const secondary = page.getByRole('link', { name: 'See how it works' });
  await expect(primary).toHaveAttribute('href', '/my-learning/register');
  await expect(secondary).toHaveAttribute('href', '/#how-it-works');
  const hero = page.getByRole('img', { name: /smiling student in a purple hoodie/i });
  await expect(hero).toBeVisible();
  await expect(hero).toHaveAttribute('alt', /AI Tutor.*Quizzes and Flashcards.*Smart Summaries/);   // the cards live inside the image: the alt text says so
  await hero.evaluate((img: HTMLImageElement) => img.decode());                                       // really loaded and decodable
  expect(await hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)).toBe(true);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  if (info.project.name === 'desktop') {                                                              // the existing header hides these two links on small screens
    await expect(nav.getByRole('link', { name: 'Features' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'How it works' })).toBeVisible();
  }
  await expect(nav.getByRole('link', { name: 'Get started' })).toBeVisible();
  await expect(page.getByRole('banner').getByText('StudyMind').first()).toBeVisible();              // logo and branding retained
});

test('three concise highlights under the hero, and nothing invented', async ({ page }) => {
  await page.goto('/');
  const highlights = page.getByRole('region', { name: 'Why StudyMind' });
  const items = highlights.getByRole('listitem');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('For students');
  await expect(items.nth(1)).toContainText('For lecturers');
  await expect(items.nth(2)).toContainText('Secure & private');
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/testimonial|★|\d+\+?\s*(users|students|learners|ratings?|reviews?)|\d[\d,]*\s*%/i);   // no fake social proof or statistics
});

test('existing sections below the hero are kept', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#features')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Everything you need to make progress' })).toBeVisible();
  await expect(page.locator('#how-it-works')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create your account' })).toHaveAttribute('href', '/my-learning/register');
});

test('calls to action go where they say', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'See how it works' }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.locator('#how-it-works')).toBeInViewport();
  await page.goto('/');
  await page.getByRole('link', { name: 'Get started free' }).click();
  await expect(page).toHaveURL(/\/my-learning\/register$/);
  await expect(page.getByRole('heading', { name: 'Create a StudyMind account' })).toBeVisible();
});

test('keyboard: both calls to action are reachable and show a focus indicator', async ({ page }) => {
  await page.goto('/');
  const primary = page.getByRole('link', { name: 'Get started free' });
  await primary.focus();
  await expect(primary).toBeFocused();
  expect(await primary.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'See how it works' })).toBeFocused();
});

for (const [width, height] of [[320, 700], [360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900]] as const) {
  test(`responsive at ${width}px: no horizontal scroll, headline, CTAs and image all visible`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'sets its own viewport');
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await noHScroll(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Get started free' })).toBeInViewport();
    await page.getByRole('img', { name: /smiling student/i }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('img', { name: /smiling student/i })).toBeInViewport();
    const box = await page.getByRole('img', { name: /smiling student/i }).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);   // image never overflows the viewport
  });
}

test('mobile device: hero fits and the highlights stack', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/');
  await noHScroll(page);
  const items = page.getByRole('region', { name: 'Why StudyMind' }).getByRole('listitem');
  const first = await items.nth(0).boundingBox(), second = await items.nth(1).boundingBox();
  expect(second!.y).toBeGreaterThan(first!.y + first!.height - 2);                                         // stacked, not side by side
});
