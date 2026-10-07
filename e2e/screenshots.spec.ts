/**
 * Regenerates the screenshots used in the README:
 *   UPDATE_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts --project=desktop
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, openSample, test } from './fixtures'

const OUT = join(process.cwd(), 'docs', 'images')

test.skip(!process.env.UPDATE_SCREENSHOTS, 'Set UPDATE_SCREENSHOTS=1 to regenerate the README screenshots')
test.describe.configure({ mode: 'serial' })

test('workspace', async ({ page }) => {
  await openSample(page, 'great-wave')
  await page.getByTestId('slot-1').getByTestId('alternatives-toggle').click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: join(OUT, 'workspace.png') })
})

test('blocks preview', async ({ page }) => {
  await openSample(page, 'starry-night')
  await page.getByRole('radio', { name: /In blocks/ }).click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: join(OUT, 'blocks-preview.png') })
})

test('gradient', async ({ page }) => {
  await openSample(page, 'sierra-nevada')
  await page.getByRole('tab', { name: /Gradients/ }).click()
  await page.getByTestId('gradient-steps').fill('9')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(OUT, 'gradient.png') })
})

test('pixel art', async ({ page }) => {
  await openSample(page, 'great-wave')
  await page.getByRole('tab', { name: /Pixel art/ }).click()
  await page.getByRole('radio', { name: 'All allowed' }).click()
  await page.getByTestId('pixel-width').fill('128')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: join(OUT, 'pixel-art.png') })
})

test('card', async ({ page }) => {
  await openSample(page, 'the-kiss')
  await page.waitForTimeout(2500)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-card').click()])
  // The card is mostly a painting: a JPEG keeps the README light
  const png = readFileSync((await download.path())!).toString('base64')
  const jpeg = await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    c.getContext('2d')!.drawImage(img, 0, 0)
    return c.toDataURL('image/jpeg', 0.86).split(',')[1]
  }, png)
  writeFileSync(join(OUT, 'card.jpg'), Buffer.from(jpeg, 'base64'))
  await expect(page.getByTestId('palette-panel')).toBeVisible()
})
