import { describe, expect, it } from 'vitest'
import { ImageLoadError } from '../image'
import { fetchImageFromLink, MIRROR, PROXY_PATH, sniffImageType } from '../link'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])

type Handler = (url: string) => Response | Promise<Response>

/** A fake fetch that records the URLs it was asked for. */
function fakeFetch(handler: Handler) {
  const calls: string[] = []
  const fn = async (url: string) => {
    calls.push(url)
    return handler(url)
  }
  return { fn, calls }
}

const corsBlocked = () => {
  throw new TypeError('Failed to fetch')
}
const image = (bytes: Uint8Array, type = 'image/png', headers: Record<string, string> = {}) =>
  new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': type, ...headers } })
const jsonError = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } })
const isProxy = (u: string) => u.startsWith(PROXY_PATH)
const isMirror = (u: string) => u.startsWith(MIRROR)

describe('fetchImageFromLink', () => {
  it('fetches CORS-friendly links directly', async () => {
    const f = fakeFetch(() => image(PNG))
    const r = await fetchImageFromLink('https://example.com/art/moonlit-castle.png', f.fn)
    expect(r.via).toBe('direct')
    expect(r.name).toBe('moonlit-castle.png')
    expect(r.title).toBeUndefined()
    expect(r.blob.type).toBe('image/png')
    expect(f.calls).toHaveLength(1)
  })

  it('retypes images served with the wrong content type', async () => {
    const f = fakeFetch(() => image(JPEG, 'application/octet-stream'))
    const r = await fetchImageFromLink('https://i.example.com/a8F3kQ29x', f.fn)
    expect(r.blob.type).toBe('image/jpeg')
    // A generated file name makes a poor title
    expect(r.title).toBe('Image from i.example.com')
  })

  it('falls back to the proxy when the host blocks cross-site reads', async () => {
    const f = fakeFetch((u) => (isProxy(u) ? image(PNG, 'image/png', { 'x-source-title': encodeURIComponent('Moonlit Castle — ArtStation'), 'x-source-url': 'https://cdn.example.com/c.png' }) : corsBlocked()))
    const r = await fetchImageFromLink('https://www.artstation.com/artwork/abc', f.fn)
    expect(r.via).toBe('proxy')
    expect(r.title).toBe('Moonlit Castle — ArtStation')
    expect(f.calls[1]).toBe(`${PROXY_PATH}?url=${encodeURIComponent('https://www.artstation.com/artwork/abc')}`)
  })

  it('stops at the proxy’s verdict about the link', async () => {
    const f = fakeFetch((u) => (isProxy(u) ? jsonError(415, 'That link isn’t an image.') : corsBlocked()))
    await expect(fetchImageFromLink('https://example.com/notes.txt', f.fn)).rejects.toThrow('That link isn’t an image.')
    expect(f.calls.some(isMirror)).toBe(false)
  })

  it('uses the public mirror when the proxy isn’t deployed', async () => {
    const f = fakeFetch((u) => (isProxy(u) ? new Response('<!doctype html>', { status: 404, headers: { 'content-type': 'text/html' } }) : isMirror(u) ? image(PNG) : corsBlocked()))
    const r = await fetchImageFromLink('https://example.com/castle.png', f.fn)
    expect(r.via).toBe('mirror')
    expect(f.calls[2]).toContain(encodeURIComponent('https://example.com/castle.png'))
  })

  it('tries the mirror after the proxy fails to reach a site, and reports the proxy’s reason', async () => {
    const f = fakeFetch((u) => (isProxy(u) ? jsonError(502, 'That link doesn’t exist any more (404).') : isMirror(u) ? new Response('nope', { status: 404 }) : corsBlocked()))
    await expect(fetchImageFromLink('https://example.com/gone.png', f.fn)).rejects.toThrow('(404)')
    expect(f.calls.some(isMirror)).toBe(true)
  })

  it('lets the mirror shrink images too large for the proxy', async () => {
    const f = fakeFetch((u) => (isProxy(u) ? jsonError(413, 'That image is larger than 20 MB.') : isMirror(u) ? image(PNG) : corsBlocked()))
    expect((await fetchImageFromLink('https://example.com/huge.png', f.fn)).via).toBe('mirror')
  })

  it('treats a crashed proxy like a missing one', async () => {
    const f = fakeFetch((u) => (isProxy(u) ? new Response('FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE', { status: 500, headers: { 'content-type': 'text/plain' } }) : isMirror(u) ? image(PNG) : corsBlocked()))
    expect((await fetchImageFromLink('https://example.com/big.png', f.fn)).via).toBe('mirror')
  })

  it('unwraps search links before fetching', async () => {
    const f = fakeFetch(() => image(PNG))
    await fetchImageFromLink(`https://www.google.com/imgres?imgurl=${encodeURIComponent('https://example.com/a.png')}`, f.fn)
    expect(f.calls[0]).toBe('https://example.com/a.png')
  })

  it('opens image data links', async () => {
    const b64 = btoa(String.fromCharCode(...PNG))
    const r = await fetchImageFromLink(`data:image/png;base64,${b64}`, (u) => fetch(u))
    expect(r.via).toBe('data')
    expect(r.title).toBe('Pasted image')
  })

  it('rejects input that isn’t a link without fetching anything', async () => {
    const f = fakeFetch(() => image(PNG))
    await expect(fetchImageFromLink('castle', f.fn)).rejects.toBeInstanceOf(ImageLoadError)
    expect(f.calls).toHaveLength(0)
  })

  it('never treats an HTML page as an image', async () => {
    const f = fakeFetch((u) => (isProxy(u) ? jsonError(415, 'That link is a web page without a preview image.') : new Response('<html></html>', { headers: { 'content-type': 'text/html' } })))
    await expect(fetchImageFromLink('https://example.com/page', f.fn)).rejects.toThrow('web page')
  })
})

describe('sniffImageType', () => {
  it('recognises common formats', () => {
    const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))
    expect(sniffImageType(PNG)).toBe('image/png')
    expect(sniffImageType(JPEG)).toBe('image/jpeg')
    expect(sniffImageType(ascii('GIF89a......'))).toBe('image/gif')
    expect(sniffImageType(ascii('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
    expect(sniffImageType(ascii('\0\0\0\x1cftypavif'))).toBe('image/avif')
    expect(sniffImageType(ascii('  <svg xmlns="http://www.w3.org/2000/svg">'))).toBe('image/svg+xml')
    expect(sniffImageType(ascii('<!doctype html><html>'))).toBeNull()
  })
})
