import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { ASSET_URL, CONCRETE, concretePng, expect, openSample, paletteBlocks, stripesPng, test, uploadImage } from './fixtures'

test.describe('opening images', () => {
  test('a picked file becomes a palette of matching blocks', async ({ page }) => {
    await uploadImage(page, concretePng())
    // Three flat colours → exactly three blocks, largest share first
    await expect(page.locator('[data-testid^="slot-"][data-block]')).toHaveCount(3)
    expect(await paletteBlocks(page)).toEqual(['white_concrete', 'red_concrete', 'blue_concrete'])
    await expect(page.getByTestId('slot-1')).toContainText('50%')
    await expect(page.getByTestId('slot-2')).toContainText('30%')
    await expect(page.getByTestId('marker-1')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Palette name' })).toHaveValue('Stripes')
  })

  test('a sample painting opens with six blocks and markers', async ({ page }) => {
    await openSample(page, 'starry-night')
    await expect(page.locator('[data-testid^="slot-"][data-block]')).toHaveCount(6)
    for (let i = 1; i <= 6; i++) await expect(page.getByTestId(`marker-${i}`)).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Palette name' })).toHaveValue('The Starry Night')
  })

  test('an image dropped anywhere on the page opens', async ({ page }) => {
    await page.goto('/')
    const bytes = [...concretePng()]
    await page.evaluate((data) => {
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array(data)], 'dropped.png', { type: 'image/png' }))
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, cancelable: true }))
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }))
    }, bytes)
    await expect(page.getByRole('textbox', { name: 'Palette name' })).toHaveValue('Dropped')
    expect(await paletteBlocks(page)).toContain('red_concrete')
  })

  test('an image pasted from the clipboard opens', async ({ page }) => {
    await page.goto('/')
    const bytes = [...concretePng()]
    await page.evaluate((data) => {
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array(data)], 'image.png', { type: 'image/png' }))
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, cancelable: true }))
    }, bytes)
    await expect(page.getByRole('textbox', { name: 'Palette name' })).toHaveValue('Pasted image')
  })

  test('a file that is not an image shows a helpful error', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('file-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    await expect(page.getByRole('alert').first()).toContainText('isn’t an image')
    await expect(page.getByTestId('dropzone')).toBeVisible()
  })

  test('works without textures when they can’t be downloaded', async ({ page, context }) => {
    await context.unroute(ASSET_URL)
    await context.route(ASSET_URL, (route) => route.abort())
    await uploadImage(page, concretePng())
    expect(await paletteBlocks(page)).toEqual(['white_concrete', 'red_concrete', 'blue_concrete'])
  })
})

test.describe('editing the palette', () => {
  test('the block count grows and shrinks without disturbing the rest', async ({ page }) => {
    await openSample(page, 'sierra-nevada')
    const before = await paletteBlocks(page)
    await page.getByRole('button', { name: 'More blocks' }).click()
    await expect(page.locator('[data-testid^="slot-"][data-block]')).toHaveCount(7)
    expect(await paletteBlocks(page)).toEqual(expect.arrayContaining(before))
    await page.getByRole('button', { name: 'Fewer blocks' }).click()
    await page.getByRole('button', { name: 'Fewer blocks' }).click()
    await expect(page.locator('[data-testid^="slot-"][data-block]')).toHaveCount(5)
  })

  test('locked blocks survive shuffling and re-extracting', async ({ page }) => {
    await openSample(page, 'the-kiss')
    const first = (await paletteBlocks(page))[0]
    await page.getByTestId('slot-1').getByTestId('lock').click()
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Shuffle' }).click()
    await page.getByRole('button', { name: /Re-extract/ }).first().click()
    await page.waitForTimeout(300)
    expect(await paletteBlocks(page)).toContain(first)
  })

  test('an alternative can be picked for a colour', async ({ page }) => {
    await uploadImage(page, concretePng())
    const slot = page.getByTestId('slot-2')
    await slot.getByTestId('alternatives-toggle').click()
    const alt = slot.getByTestId('alternatives').getByRole('button').first()
    const name = (await alt.getAttribute('title'))!.split(':')[0]
    await alt.click()
    await expect(slot.getByTestId('slot-name')).toHaveText(name)
    await expect(page.getByTestId('slot-name').filter({ hasText: new RegExp(`^${name}$`) })).toHaveCount(1)
  })

  test('the block search adds any block', async ({ page }) => {
    await uploadImage(page, concretePng())
    await page.getByRole('button', { name: 'Add a block' }).click()
    await page.getByTestId('block-search').fill('mossy cobblestone')
    await page.getByRole('option', { name: /Mossy Cobblestone/ }).first().click()
    expect(await paletteBlocks(page)).toContain('mossy_cobblestone')
  })

  test('dragging a marker re-samples its colour', async ({ page }) => {
    await uploadImage(page, concretePng())
    const stage = page.getByTestId('stage')
    const box = (await stage.boundingBox())!
    const marker = page.getByTestId('marker-3') // blue, on the right
    const m = (await marker.boundingBox())!
    await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 8 })
    await page.mouse.up()
    // It now sits on the red stripe, but red is taken, so it gets the next-best red
    const blocks = await paletteBlocks(page)
    expect(blocks).not.toContain('blue_concrete')
    expect(blocks).toContain('red_concrete')
  })

  test('the eyedropper adds the colour under the cursor', async ({ page }) => {
    await uploadImage(page, stripesPng([[...CONCRETE.white, 70], [242, 178, 23, 30]]))
    await expect(page.locator('[data-testid^="slot-"][data-block]')).toHaveCount(2)
    await page.getByRole('button', { name: 'Add a colour' }).click()
    const box = (await page.getByTestId('stage').boundingBox())!
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.8)
    await expect(page.locator('[data-testid^="slot-"][data-block]')).toHaveCount(3)
  })

  test('settings change which blocks can be used', async ({ page }) => {
    await uploadImage(page, concretePng())
    const allowed = page.getByTestId('allowed-count')
    const before = await allowed.textContent()
    await page.getByRole('button', { name: /^Concrete \d+/ }).click()
    await expect(allowed).not.toHaveText(before!)
    expect((await paletteBlocks(page)).some((b) => b.endsWith('_concrete'))).toBe(false)
    // Older versions offer fewer blocks
    const count = Number((await allowed.textContent())!.match(/\((\d+)/)![1])
    await page.getByTestId('version').selectOption({ label: '1.16.5' })
    await expect(allowed).not.toHaveText(new RegExp(`\\(${count} of`))
  })

  test('“never suggest” removes a block for good', async ({ page }) => {
    await uploadImage(page, concretePng())
    await page.getByTestId('slot-1').getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /Never suggest White Concrete/ }).click()
    expect(await paletteBlocks(page)).not.toContain('white_concrete')
    await expect(page.getByRole('button', { name: 'Allow White Concrete again' })).toBeVisible()
  })

  test('the blocks preview rebuilds the image from the palette', async ({ page }) => {
    await openSample(page, 'great-wave')
    await page.getByRole('radio', { name: /In blocks/ }).click()
    await expect(page.getByTestId('blocks-preview')).toBeVisible()
  })
})

test.describe('exports', () => {
  test('JSON lists the blocks with their shares and shapes', async ({ page }) => {
    await uploadImage(page, concretePng())
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()])
    expect(download.suggestedFilename()).toBe('stripes.json')
    const json = JSON.parse(readFileSync((await download.path())!, 'utf8'))
    expect(json.blocks.map((b: { id: string }) => b.id)).toEqual(['minecraft:white_concrete', 'minecraft:red_concrete', 'minecraft:blue_concrete'])
    expect(json.blocks.map((b: { share: number }) => b.share)).toEqual([50, 30, 20])
  })

  test('the palette card downloads as a PNG', async ({ page }) => {
    await openSample(page, 'the-kiss')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-card').click()])
    expect(download.suggestedFilename()).toBe('the-kiss.png')
    const bytes = readFileSync((await download.path())!)
    expect(bytes.subarray(1, 4).toString()).toBe('PNG')
    expect(bytes.readUInt32BE(16)).toBe(1600)
  })

  test('the WorldEdit pattern and share link are copied', async ({ page }) => {
    // The system clipboard needs window focus, which parallel headless runs
    // don't guarantee: record what the app copies instead.
    await page.addInitScript(() => {
      const w = window as unknown as { __copied: string }
      w.__copied = ''
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async (t: string) => void (w.__copied = t) },
        configurable: true,
      })
    })
    const copied = () => page.evaluate(() => (window as unknown as { __copied: string }).__copied)
    await uploadImage(page, concretePng())
    await page.getByTestId('export-worldedit').click()
    await expect.poll(copied).toBe('50%white_concrete,30%red_concrete,20%blue_concrete')
    await page.getByTestId('export-link').click()
    await expect.poll(copied).toContain('#p=')
    const link = await copied()
    expect(link).toContain('#p=white_concrete.cfd5d6.50,red_concrete.')
    // The link opens the same palette, without the image
    await page.goto(link)
    await expect(page.getByTestId('shared-board')).toBeVisible()
    expect(await paletteBlocks(page)).toEqual(['white_concrete', 'red_concrete', 'blue_concrete'])
    await expect(page.getByRole('textbox', { name: 'Palette name' })).toHaveValue('Stripes')
  })

  test('palettes can be saved and reopened', async ({ page }) => {
    await uploadImage(page, concretePng())
    await page.getByTestId('export-save').click()
    await page.getByTitle('Back to start').click()
    const saved = page.getByTestId('saved-palettes')
    await expect(saved).toContainText('Stripes')
    await saved.getByText('Stripes').click()
    expect(await paletteBlocks(page)).toEqual(['white_concrete', 'red_concrete', 'blue_concrete'])
  })
})

test.describe('gradients', () => {
  test('runs between two blocks in the chosen number of steps', async ({ page }) => {
    await uploadImage(page, stripesPng([[8, 10, 15, 50], [...CONCRETE.white, 50]]))
    await page.getByRole('tab', { name: /Gradients/ }).click()
    await expect(page.getByTestId('gradient-from')).toContainText('Black Concrete')
    await expect(page.getByTestId('gradient-to')).toContainText('White Concrete')
    await expect(page.getByTestId('gradient-step')).toHaveCount(7)
    await page.getByTestId('gradient-steps').fill('10')
    await expect(page.getByTestId('gradient-step')).toHaveCount(10)
    await page.getByRole('button', { name: 'Swap ends' }).click()
    await expect(page.getByTestId('gradient-from')).toContainText('White Concrete')
  })
})

test.describe('pixel art', () => {
  test('builds the image in blocks and downloads schematics', async ({ page }) => {
    await uploadImage(page, concretePng())
    await page.getByRole('tab', { name: /Pixel art/ }).click()
    await expect(page.getByTestId('pixel-canvas')).toBeVisible()
    await expect(page.getByTestId('materials').getByRole('listitem')).toHaveCount(3)
    await expect(page.getByTestId('pixel-view')).toContainText('64 × 38 blocks')

    const [lite] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-litematic').click()])
    expect(lite.suggestedFilename()).toBe('stripes-64x38.litematic')
    const nbt = gunzipSync(readFileSync((await lite.path())!))
    expect(nbt.includes(Buffer.from('minecraft:red_concrete'))).toBe(true)
    expect(nbt.includes(Buffer.from('BlockStatePalette'))).toBe(true)

    const [schem] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-schem').click()])
    expect(schem.suggestedFilename()).toBe('stripes-64x38.schem')
    expect(gunzipSync(readFileSync((await schem.path())!)).includes(Buffer.from('Schematic'))).toBe(true)
  })

  test('can use every allowed block, with dithering', async ({ page }) => {
    await openSample(page, 'impression-sunrise')
    await page.getByRole('tab', { name: /Pixel art/ }).click()
    const before = await page.getByTestId('materials').getByRole('listitem').count()
    await page.getByRole('radio', { name: 'All allowed' }).click()
    await page.getByTestId('dither').selectOption('floyd-steinberg')
    await expect.poll(() => page.getByTestId('materials').getByRole('listitem').count()).toBeGreaterThan(before)
  })
})

test('keyboard: 1/2/3 switch views', async ({ page }) => {
  await openSample(page, 'great-wave')
  await page.keyboard.press('2')
  await expect(page.getByTestId('gradient-view')).toBeVisible()
  await page.keyboard.press('3')
  await expect(page.getByTestId('pixel-view')).toBeVisible()
  await page.keyboard.press('1')
  await expect(page.getByTestId('stage')).toBeVisible()
})
