import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handleImageProxy, isPrivateAddress, pagePreview, ProxyError, safeLookup, sniff, type Getter, type Upstream } from '../api/image.ts'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82])
const html = (body: string) => new TextEncoder().encode(`<!doctype html><html><head>${body}</head><body></body></html>`)
const ok = (body: Uint8Array, type?: string): Upstream => ({ status: 200, headers: type ? { 'content-type': type } : {}, body })
const redirect = (location: string): Upstream => ({ status: 302, headers: { location }, body: new Uint8Array() })

/** A getter serving a fixed map of URLs, recording requests. */
function site(pages: Record<string, Upstream>) {
  const requested: string[] = []
  const get: Getter = async (url) => {
    requested.push(url.toString())
    const page = pages[url.toString()]
    if (!page) return { status: 404, headers: {}, body: new Uint8Array() }
    return page
  }
  return { get, requested }
}

const call = (target: string, get: Getter, allowPrivate = false) =>
  handleImageProxy(new URL(`http://localhost/api/image?url=${encodeURIComponent(target)}`), { get, allowPrivate })

const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error

describe('isPrivateAddress', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['172.16.0.1', true],
    ['172.32.0.1', false],
    ['192.168.1.10', true],
    ['169.254.169.254', true],
    ['100.64.0.1', true],
    ['0.0.0.0', true],
    ['224.0.0.1', true],
    ['255.255.255.255', true],
    ['8.8.8.8', false],
    ['93.184.216.34', false],
    ['::1', true],
    ['::', true],
    ['fe80::1', true],
    ['fd12:3456::1', true],
    ['ff02::1', true],
    ['::ffff:127.0.0.1', true],
    ['::ffff:8.8.8.8', false],
    ['64:ff9b::10.0.0.1', true],
    ['2001:db8::1', true],
    ['2606:4700:4700::1111', false],
    ['[2606:4700:4700::1111]', false],
    ['not an ip', true],
  ])('%s → %s', (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected)
  })
})

describe('safeLookup', () => {
  const resolveTo =
    (...addresses: string[]) =>
    (_h: string, _o: object, cb: (err: NodeJS.ErrnoException | null, a: { address: string; family: number }[]) => void) =>
      cb(
        null,
        addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
      )

  it('refuses names that resolve to private addresses', async () => {
    const lookup = safeLookup(false, resolveTo('93.184.216.34', '10.0.0.5'))
    const err = await new Promise<NodeJS.ErrnoException | null>((r) => lookup('evil.example', {}, (e) => r(e)))
    expect(err?.code).toBe('EPRIVATE')
  })

  it('passes public addresses in both callback styles', async () => {
    const lookup = safeLookup(false, resolveTo('93.184.216.34', '2606:4700::1'))
    const single = await new Promise<unknown[]>((r) => lookup('example.com', {}, (...args) => r(args)))
    expect(single).toEqual([null, '93.184.216.34', 4])
    const all = await new Promise<unknown[]>((r) => lookup('example.com', { all: true }, (...args) => r(args)))
    expect(all[1]).toHaveLength(2)
    const v6 = await new Promise<unknown[]>((r) => lookup('example.com', { family: 6 }, (...args) => r(args)))
    expect(v6.slice(1)).toEqual(['2606:4700::1', 6])
  })

  it('allows private addresses in development', async () => {
    const lookup = safeLookup(true, resolveTo('127.0.0.1'))
    const res = await new Promise<unknown[]>((r) => lookup('localhost', {}, (...args) => r(args)))
    expect(res).toEqual([null, '127.0.0.1', 4])
  })
})

describe('handleImageProxy', () => {
  it('returns images with safe headers', async () => {
    const s = site({ 'https://example.com/castle.png': ok(PNG, 'image/png') })
    const res = await call('https://example.com/castle.png', s.get)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('content-security-policy')).toContain('sandbox')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-source-url')).toBe('https://example.com/castle.png')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG)
  })

  it('trusts the bytes over a wrong content type', async () => {
    const s = site({ 'https://example.com/download?id=1': ok(PNG, 'application/octet-stream') })
    const res = await call('https://example.com/download?id=1', s.get)
    expect(res.headers.get('content-type')).toBe('image/png')
  })

  it('validates the link', async () => {
    const s = site({})
    for (const [target, status] of [
      ['', 400],
      ['not a url', 400],
      ['ftp://example.com/a.png', 400],
      ['https://user:pass@example.com/a.png', 400],
      ['https://example.com:8443/a.png', 400],
      ['http://127.0.0.1/a.png', 403],
      ['http://[::1]/a.png', 403],
      ['http://169.254.169.254/latest/meta-data', 403],
      ['http://localhost/a.png', 403],
      ['http://printer.local/a.png', 403],
    ] as const) {
      const res = target ? await call(target, s.get) : await handleImageProxy(new URL('http://localhost/api/image'), { get: s.get })
      expect(res.status, target).toBe(status)
    }
    expect(s.requested).toEqual([])
  })

  it('follows redirects, checking every hop', async () => {
    const s = site({
      'https://short.example/x': redirect('https://cdn.example.com/x.png'),
      'https://cdn.example.com/x.png': ok(PNG, 'image/png'),
      'https://sneaky.example/x': redirect('http://10.0.0.7/admin.png'),
      'https://loop.example/a': redirect('/a'),
    })
    expect((await call('https://short.example/x', s.get)).status).toBe(200)
    const sneaky = await call('https://sneaky.example/x', s.get)
    expect(sneaky.status).toBe(403)
    expect(s.requested).not.toContain('http://10.0.0.7/admin.png')
    const loop = await call('https://loop.example/a', s.get)
    expect(loop.status).toBe(502)
    expect(await errorOf(loop)).toMatch(/redirects/)
  })

  it('opens a page’s preview image and passes on its title', async () => {
    const s = site({
      'https://art.example/work/42': ok(html('<title>ignored</title><meta property="og:title" content="Moonlit Castle &amp; Keep"><meta property="og:image" content="/img/42.jpg?s=l">'), 'text/html; charset=utf-8'),
      'https://art.example/img/42.jpg?s=l': ok(PNG, 'image/jpeg'),
    })
    const res = await call('https://art.example/work/42', s.get)
    expect(res.status).toBe(200)
    expect(decodeURIComponent(res.headers.get('x-source-title')!)).toBe('Moonlit Castle & Keep')
    expect(res.headers.get('x-source-url')).toBe('https://art.example/img/42.jpg?s=l')
  })

  it('explains pages without a preview image', async () => {
    const s = site({ 'https://example.com/blog': ok(html('<title>Blog</title>'), 'text/html') })
    const res = await call('https://example.com/blog', s.get)
    expect(res.status).toBe(415)
    expect(await errorOf(res)).toMatch(/web page without a preview image/)
  })

  it('does not follow a page to another page', async () => {
    const s = site({
      'https://a.example/': ok(html('<meta property="og:image" content="https://b.example/">'), 'text/html'),
      'https://b.example/': ok(html('<meta property="og:image" content="https://c.example/x.png">'), 'text/html'),
    })
    expect((await call('https://a.example/', s.get)).status).toBe(415)
    expect(s.requested).not.toContain('https://c.example/x.png')
  })

  it('refuses SVG and other non-images', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    const s = site({ 'https://example.com/a.svg': ok(svg, 'image/svg+xml'), 'https://example.com/a.txt': ok(new TextEncoder().encode('hello'), 'text/plain') })
    expect((await call('https://example.com/a.svg', s.get)).status).toBe(415)
    expect((await call('https://example.com/a.txt', s.get)).status).toBe(415)
  })

  it('reports upstream errors', async () => {
    const s = site({ 'https://example.com/private.png': { status: 403, headers: {}, body: new Uint8Array() } })
    const missing = await call('https://example.com/gone.png', s.get)
    expect(missing.status).toBe(502)
    expect(await errorOf(missing)).toMatch(/404/)
    expect(await errorOf(await call('https://example.com/private.png', s.get))).toMatch(/blocks automatic downloads \(403\)\. Right-click/)
  })

  it('maps getter failures to statuses', async () => {
    const failing = (e: Error): Getter => async () => {
      throw e
    }
    expect((await call('https://example.com/a.png', failing(new ProxyError(413, 'too big')))).status).toBe(413)
    expect((await call('https://example.com/a.png', failing(new ProxyError(504, 'slow')))).status).toBe(504)
    expect((await call('https://example.com/a.png', failing(new Error('boom')))).status).toBe(502)
  })
})

describe('pagePreview', () => {
  const base = new URL('https://example.com/a/b')
  it('prefers og:image, then twitter:image, then image_src', () => {
    expect(pagePreview('<meta name="twitter:image" content="t.png"><meta property="og:image" content="o.png">', base).image?.toString()).toBe('https://example.com/a/o.png')
    expect(pagePreview("<meta name='twitter:image:src' content='//cdn.example.com/t.png'>", base).image?.toString()).toBe('https://cdn.example.com/t.png')
    expect(pagePreview('<link rel="image_src" href="/l.png">', base).image?.toString()).toBe('https://example.com/l.png')
    expect(pagePreview('<p>nothing</p>', base)).toEqual({ image: null, title: null })
  })
  it('decodes titles', () => {
    expect(pagePreview('<title> Castle &#8211; Concept &quot;Art&quot; </title>', base).title).toBe('Castle – Concept "Art"')
  })
})

describe('sniff', () => {
  it('tells images from pages', () => {
    expect(sniff(PNG)).toBe('image/png')
    expect(sniff(html(''))).toBe('text/html')
    expect(sniff(new TextEncoder().encode('{"a":1}'))).toBeNull()
  })
})

describe('the real getter', () => {
  let server: Server
  let origin = ''
  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/castle.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end(Buffer.from(PNG))
      } else if (req.url === '/huge.png') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': String(64 * 1024 * 1024) })
        res.end()
      } else if (req.url === '/moved') {
        res.writeHead(301, { Location: '/castle.png' })
        res.end()
      } else {
        res.writeHead(404)
        res.end()
      }
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  const proxy = (path: string, allowPrivate: boolean) =>
    handleImageProxy(new URL(`http://localhost/api/image?url=${encodeURIComponent(origin + path)}`), { allowPrivate })

  it('downloads through node:http when private addresses are allowed', async () => {
    const res = await proxy('/moved', true)
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG)
  })

  it('refuses the same server by default', async () => {
    expect((await proxy('/castle.png', false)).status).toBe(403)
  })

  it('stops downloads over the size limit', async () => {
    expect((await proxy('/huge.png', true)).status).toBe(413)
  })
})

describe('large images', () => {
  it('streams bodies bigger than a buffered function response may be', async () => {
    const big = new Uint8Array(6 * 1024 * 1024)
    big.set(PNG)
    const s = site({ 'https://example.com/big.png': ok(big, 'image/png') })
    const res = await call('https://example.com/big.png', s.get)
    expect(res.status).toBe(200)
    expect(res.body).toBeInstanceOf(ReadableStream)
    expect((await res.arrayBuffer()).byteLength).toBe(big.length)
  })
})
