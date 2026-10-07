import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { concretePng, expect, paletteBlocks, test } from './fixtures'

/**
 * A stand-in for other websites: images without CORS headers (like most
 * hosts), one with them, a page with a preview image, a page without, a
 * missing file and a text file.
 */
let server: Server
let origin = ''
const png = concretePng()

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '/'
    if (path === '/art/moonlit-castle.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(png)
    } else if (path === '/cors/moonlit-castle.png') {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' })
      res.end(png)
    } else if (path === '/artwork/42') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><html><head><title>Artwork 42</title>
        <meta property="og:title" content="Moonlit Castle by A. Builder">
        <meta property="og:image" content="/art/moonlit-castle.png"></head><body></body></html>`)
    } else if (path === '/blog') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<!doctype html><html><head><title>Blog</title></head><body>Hi</body></html>')
    } else if (path === '/notes.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('just text')
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

test.afterAll(() => new Promise<void>((r) => server.close(() => r())))

async function openLink(page: import('@playwright/test').Page, link: string) {
  await page.goto('/')
  await page.getByTestId('link-input').fill(link)
  await page.getByTestId('link-submit').click()
}

test('a link to an image from a CORS-friendly host opens directly', async ({ page }) => {
  const proxied: string[] = []
  page.on('request', (r) => r.url().includes('/api/image') && proxied.push(r.url()))
  await openLink(page, `${origin}/cors/moonlit-castle.png`)
  await expect(page.getByTestId('palette-panel')).toBeVisible()
  expect(await paletteBlocks(page)).toEqual(['white_concrete', 'red_concrete', 'blue_concrete'])
  await expect(page.getByRole('textbox', { name: 'Palette name' })).toHaveValue('Moonlit castle')
  expect(proxied).toEqual([])
})

test('a link to a host that blocks cross-site reads goes through the proxy', async ({ page }) => {
  const proxied: string[] = []
  page.on('request', (r) => r.url().includes('/api/image') && proxied.push(r.url()))
  await openLink(page, `${origin}/art/moonlit-castle.png`)
  await expect(page.getByTestId('palette-panel')).toBeVisible()
  expect(await paletteBlocks(page)).toEqual(['white_concrete', 'red_concrete', 'blue_concrete'])
  expect(proxied).toHaveLength(1)
})

test('a link to a web page opens its preview image, titled after the page', async ({ page }) => {
  await openLink(page, `${origin}/artwork/42`)
  await expect(page.getByTestId('palette-panel')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Palette name' })).toHaveValue('Moonlit Castle by A. Builder')
  expect(await paletteBlocks(page)).toContain('red_concrete')
})

test('bad links explain what went wrong', async ({ page }) => {
  await openLink(page, `${origin}/missing.png`)
  await expect(page.getByRole('alert').first()).toContainText('404')
  await page.getByTestId('link-input').fill(`${origin}/notes.txt`)
  await page.getByTestId('link-submit').click()
  await expect(page.getByRole('alert').first()).toContainText('isn’t an image')
  await page.getByTestId('link-input').fill(`${origin}/blog`)
  await page.getByTestId('link-submit').click()
  await expect(page.getByRole('alert').first()).toContainText('without a preview image')
  await page.getByTestId('link-input').fill('castle')
  await page.getByTestId('link-submit').click()
  await expect(page.getByRole('alert').first()).toContainText('doesn’t look like a web address')
  await expect(page.getByTestId('dropzone')).toBeVisible()
})

test('falls back to the public mirror when the proxy isn’t there', async ({ page, context }) => {
  await context.route(/\/api\/image/, (route) => route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html><title>404</title>' }))
  await context.unroute(/^https:\/\/wsrv\.nl\//)
  const mirrored: string[] = []
  await context.route(/^https:\/\/wsrv\.nl\//, (route) => {
    mirrored.push(route.request().url())
    return route.fulfill({ status: 200, contentType: 'image/png', body: png, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  await openLink(page, 'https://images.example.org/gallery/moonlit-castle.png')
  await expect(page.getByTestId('palette-panel')).toBeVisible()
  expect(mirrored[0]).toContain(encodeURIComponent('https://images.example.org/gallery/moonlit-castle.png'))
  await expect(page.getByRole('textbox', { name: 'Palette name' })).toHaveValue('Moonlit castle')
})

test('a pasted link opens', async ({ page }) => {
  await page.goto('/')
  await page.evaluate((link) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', link)
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, cancelable: true }))
  }, `${origin}/art/moonlit-castle.png`)
  await expect(page.getByTestId('palette-panel')).toBeVisible()
})

test('a link can replace the image from the workspace', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('sample-great-wave').click()
  await expect(page.getByTestId('palette-panel')).toBeVisible()
  await page.getByRole('button', { name: /New image/ }).click()
  const dialog = page.getByTestId('new-image-dialog')
  await dialog.getByTestId('link-input').fill(`${origin}/artwork/42`)
  await dialog.getByTestId('link-submit').click()
  await expect(page.getByRole('textbox', { name: 'Palette name' })).toHaveValue('Moonlit Castle by A. Builder')
  await expect(dialog).toBeHidden()
})
