import { expect, openSample, test } from './fixtures'

test('mobile: the image, palette and settings all fit', async ({ page }) => {
  await openSample(page, 'impression-sunrise')
  await expect(page.getByTestId('stage')).toBeVisible()
  await expect(page.getByTestId('slot-1')).toBeAttached()
  // No sideways scrolling
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  // Settings live in a sheet on small screens
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' }).getByTestId('settings')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('tab', { name: /Gradients/ }).click()
  await expect(page.getByTestId('gradient-strip')).toBeVisible()
})
