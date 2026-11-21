// Approved landing page (hero, CTAs) and the existing sections that must remain. No sign-in or AI involved.
// The hero CTAs are repeated in the bottom banner, so the hero's own are the first match.
import { expect, test, type Page } from '@playwright/test';

const noHScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test('hero: approved copy, two calls to action, accurate image alt text, header unchanged', async ({ page }, info) => {
  await page.goto('/');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toHaveText(/Smarter Learning\./);
  await expect(page.getByText('An AI-powered workspace to study, practise and stay organised.')).toBeVisible();
  const primary = page.getByRole('link', { name: 'Get started free' }).first();
  const secondary = page.getByRole('link', { name: 'See how it works' }).first();
  await expect(primary).toHaveAttribute('href', '/my-learning/register');
  await expect(secondary).toHaveAttribute('href', '/#how-it-works');
  const hero = page.getByRole('img', { name: /smiling student in a purple hoodie/i });
  await expect(hero).toBeVisible();
  await expect(hero).toHaveAttribute('alt', /smiling student.*notebooks.*study tools/i);               // alt text describes the current hero picture
  await hero.evaluate((img: HTMLImageElement) => img.decode());                                       // really loaded and decodable
  expect(await hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)).toBe(true);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  if (info.project.name === 'desktop') {                                                              // the existing header hides these two links on small screens
    await expect(nav.getByRole('link', { name: 'Features' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'How it works' })).toBeVisible();
  }
  await expect(nav.getByRole('link', { name: 'Get started' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Ciquis home' })).toBeVisible(); // logo retained
});

test('nothing invented: no testimonials, ratings or statistics', async ({ page }) => {
  await page.goto('/');   // (the three-highlights bar under the hero was removed on purpose in dea4567)
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/testimonial|★|\d+\+?\s*(users|students|learners|ratings?|reviews?)|\d[\d,]*\s*%/i);   // no fake social proof or statistics
});

test('existing sections below the hero are kept', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#features')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Everything you need to make progress' })).toBeVisible();
  await expect(page.locator('#how-it-works')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Get started free' }).last()).toHaveAttribute('href', '/my-learning/register');   // the bottom call-to-action banner
});

test('calls to action go where they say', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'See how it works' }).first().click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.locator('#how-it-works')).toBeInViewport();
  await page.goto('/');
  await page.getByRole('link', { name: 'Get started free' }).first().click();
  await expect(page).toHaveURL(/\/my-learning\/register$/);
  await expect(page.getByRole('heading', { name: 'Create your Ciquis account' })).toBeVisible();
});

test('keyboard: both calls to action are reachable and show a focus indicator', async ({ page }) => {
  await page.goto('/');
  const primary = page.getByRole('link', { name: 'Get started free' }).first();
  await primary.focus();
  await expect(primary).toBeFocused();
  expect(await primary.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'See how it works' }).first()).toBeFocused();
});

for (const [width, height] of [[320, 700], [360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900]] as const) {
  test(`responsive at ${width}px: no horizontal scroll, headline, CTAs and image all visible`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'sets its own viewport');
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await noHScroll(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Get started free' }).first()).toBeInViewport();
    await page.getByRole('img', { name: /smiling student/i }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('img', { name: /smiling student/i })).toBeInViewport();
    const box = await page.getByRole('img', { name: /smiling student/i }).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);   // image never overflows the viewport
  });
}

test('mobile device: the hero fits without sideways scrolling', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/');
  await noHScroll(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
});
