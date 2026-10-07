import { test as base, expect, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'

/**
 * Block textures normally stream from misode/mcmeta. When the data
 * generator's download cache exists (scripts/.cache) the tests serve the
 * atlas from it so they run offline and fast; otherwise requests go through.
 */
const CACHE = join(process.cwd(), 'scripts', '.cache')
const ASSET_FILES: Record<string, string> = {
  'all/data.min.json': 'atlas.json',
  'all/atlas.png': 'atlas.png',
}
export const ASSET_URL = /\/mc-assets\/|raw\.githubusercontent\.com\/misode\/mcmeta|cdn\.jsdelivr\.net\/gh\/misode\/mcmeta/

export const test = base.extend<{ offlineAssets: void }>({
  offlineAssets: [
    async ({ context }, use) => {
      await context.route(ASSET_URL, async (route) => {
        const m = route.request().url().match(/(\d[\w.-]*?)-atlas\/(.*)$/)
        const file = m && ASSET_FILES[m[2]]
        const path = file && join(CACHE, `${m![1]}-${file}`)
        if (path && existsSync(path)) {
          return route.fulfill({ status: 200, body: readFileSync(path), contentType: path.endsWith('.png') ? 'image/png' : 'application/json' })
        }
        return route.continue()
      })
      // The public image mirror is the last resort for links; keep tests offline and deterministic
      await context.route(/^https:\/\/wsrv\.nl\//, (route) => route.abort())
      await use()
    },
    { auto: true },
  ],
})

export { expect }

/** Exact side colours of three concrete blocks, so the expected matches are unambiguous. */
export const CONCRETE = {
  white: [207, 213, 214],
  red: [142, 33, 33],
  blue: [45, 47, 143],
} as const

/**
 * A PNG of vertical stripes. Each stripe is `[r, g, b, share]`, shares in
 * percent of the width.
 */
export function stripesPng(stripes: [number, number, number, number][], width = 200, height = 120): Buffer {
  const png = new PNG({ width, height })
  const bounds: number[] = []
  let acc = 0
  for (const s of stripes) bounds.push((acc += s[3]))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pct = ((x + 0.5) / width) * 100
      const s = stripes[bounds.findIndex((b) => pct < b)] ?? stripes[stripes.length - 1]
      const i = (y * width + x) * 4
      png.data[i] = s[0]
      png.data[i + 1] = s[1]
      png.data[i + 2] = s[2]
      png.data[i + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

/** White 50%, red 30%, blue 20%. */
export const concretePng = () =>
  stripesPng([
    [...CONCRETE.white, 50],
    [...CONCRETE.red, 30],
    [...CONCRETE.blue, 20],
  ])

export async function uploadImage(page: Page, buffer: Buffer, name = 'stripes.png', mimeType = 'image/png') {
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles({ name, mimeType, buffer })
  await expect(page.getByTestId('palette-panel')).toBeVisible()
}

export async function openSample(page: Page, id = 'great-wave') {
  await page.goto('/')
  await page.getByTestId(`sample-${id}`).click()
  await expect(page.getByTestId('palette-panel')).toBeVisible()
}

/** Block ids of the palette, in display order. */
export async function paletteBlocks(page: Page): Promise<string[]> {
  return page.locator('[data-testid^="slot-"][data-block]').evaluateAll((els) => els.map((e) => e.getAttribute('data-block') ?? ''))
}
