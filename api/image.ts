/**
 * GET /api/image?url=<http(s) link>
 *
 * Fetches a publicly hosted image for the app, so links to hosts that don't
 * allow cross-site reads (CORS) still open. A link to a web page is followed
 * to its preview image (`og:image` / `twitter:image`), and the page's title
 * comes back in the `X-Source-Title` header.
 *
 * Runs as a Vercel Function (Node.js runtime) and, through a small Vite
 * plugin, under `vite dev` and `vite preview`. It is deliberately narrow:
 *  - http(s) only, standard ports, no credentials in the URL;
 *  - every hop (redirects, the page's image) must resolve to a public
 *    address: loopback, private, link-local and other reserved ranges are
 *    refused, checked at connection time so DNS can't be swapped afterwards;
 *  - only images are returned (not SVG, which could carry scripts), at most
 *    20 MB, within 9 seconds, with a sandboxing CSP.
 *
 * This file is self-contained (no relative imports) so Vercel can run it as is.
 */
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const TIMEOUT_MS = 9_000
const MAX_HOPS = 6
const USER_AGENT = 'MCPalettePicker/1.0 (+https://github.com/paulprints/MCPalletePicker)'

export interface Upstream {
  status: number
  headers: Record<string, string | undefined>
  body: Uint8Array
}

/** Fetches one URL (no redirects followed). Injected in tests. */
export type Getter = (url: URL) => Promise<Upstream>

export interface ProxyOptions {
  /** Allow loopback/private addresses (local development and tests only). */
  allowPrivate?: boolean
  get?: Getter
}

export class ProxyError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// Address checks
// ---------------------------------------------------------------------------

function ipv4Bytes(ip: string): number[] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const bytes = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN))
  return bytes.every((b) => b >= 0 && b <= 255) ? bytes : null
}

function ipv6Bytes(ip: string): number[] | null {
  let s = ip.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase()
  // An embedded IPv4 tail (::ffff:1.2.3.4)
  const v4 = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)
  let tail: number[] = []
  if (v4) {
    const b = ipv4Bytes(v4[1])
    if (!b) return null
    tail = b
    s = s.slice(0, -v4[1].length)
    if (!s.endsWith('::')) s = s.replace(/:$/, '')
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const words = (part: string) => (part ? part.split(':') : [])
  const head = words(halves[0])
  const rest = halves.length === 2 ? words(halves[1]) : []
  const total = 8 - tail.length / 2
  const missing = total - head.length - rest.length
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null
  const all = [...head, ...Array(Math.max(0, missing)).fill('0'), ...rest]
  if (all.length !== total || !all.every((w) => /^[0-9a-f]{1,4}$/.test(w))) return null
  const bytes: number[] = []
  for (const w of all) {
    const n = parseInt(w, 16)
    bytes.push(n >> 8, n & 255)
  }
  return [...bytes, ...tail]
}

function privateV4([a, b, c]: number[]): boolean {
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast, reserved, broadcast
  )
}

/** Whether an IP address is anything other than a public unicast address. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ipv4Bytes(ip)
  if (v4) return privateV4(v4)
  const b = ipv6Bytes(ip)
  if (!b) return true // unparseable: refuse
  const zeroUntil = (n: number) => b.slice(0, n).every((x) => x === 0)
  if (zeroUntil(15) && (b[15] === 0 || b[15] === 1)) return true // :: and ::1
  if (zeroUntil(10) && b[10] === 0xff && b[11] === 0xff) return privateV4(b.slice(12)) // ::ffff:a.b.c.d
  if (zeroUntil(12)) return privateV4(b.slice(12)) // ::a.b.c.d (deprecated compat)
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) return privateV4(b.slice(12)) // NAT64
  if ((b[0] & 0xfe) === 0xfc) return true // unique local fc00::/7
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true // link-local fe80::/10
  if (b[0] === 0xff) return true // multicast
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true // documentation
  if (b[0] === 0x01 && b[1] === 0x00 && b.slice(2, 8).every((x) => x === 0)) return true // discard 100::/64
  return false
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void
type LookupFn = (hostname: string, options: LookupOptions, callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void

const defaultResolve: LookupFn = (hostname, options, callback) => dnsLookup(hostname, { ...options, all: true }, callback)

/**
 * A `lookup` for http(s).request that refuses hostnames resolving to
 * non-public addresses. It runs when the connection is made, so the address
 * that is checked is the address that is connected to.
 */
export function safeLookup(allowPrivate: boolean, resolve: LookupFn = defaultResolve) {
  return (hostname: string, options: LookupOptions, callback: LookupCallback) => {
    resolve(hostname, options, (err, addresses) => {
      if (err) return callback(err, '')
      const list = addresses.filter((a) => !options.family || a.family === options.family)
      if (!list.length) return callback(Object.assign(new Error(`No address for ${hostname}`), { code: 'ENOTFOUND' }), '')
      if (!allowPrivate && list.some((a) => isPrivateAddress(a.address))) {
        return callback(Object.assign(new Error(`${hostname} points to a private network address`), { code: 'EPRIVATE' }), '')
      }
      if (options.all) callback(null, list)
      else callback(null, list[0].address, list[0].family)
    })
  }
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

function defaultGetter(allowPrivate: boolean): Getter {
  const lookup = safeLookup(allowPrivate)
  return (url) =>
    new Promise<Upstream>((resolve, reject) => {
      const lib = url.protocol === 'https:' ? https : http
      const req = lib.request(
        url,
        {
          method: 'GET',
          lookup: lookup as unknown as typeof dnsLookup,
          timeout: TIMEOUT_MS,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.9,text/html;q=0.5,*/*;q=0.1',
            'Accept-Language': 'en',
          },
        },
        (res) => {
          const declared = Number(res.headers['content-length'] ?? 0)
          if (declared > MAX_IMAGE_BYTES) {
            res.destroy()
            return reject(new ProxyError(413, 'That image is larger than 20 MB.'))
          }
          const chunks: Buffer[] = []
          let size = 0
          res.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size > MAX_IMAGE_BYTES) {
              res.destroy()
              reject(new ProxyError(413, 'That image is larger than 20 MB.'))
              return
            }
            chunks.push(chunk)
          })
          res.on('end', () => {
            const headers: Record<string, string | undefined> = {}
            for (const [k, v] of Object.entries(res.headers)) headers[k] = Array.isArray(v) ? v.join(', ') : v
            resolve({ status: res.statusCode ?? 0, headers, body: new Uint8Array(Buffer.concat(chunks)) })
          })
          res.on('error', reject)
        },
      )
      req.on('timeout', () => req.destroy(new ProxyError(504, 'That site took too long to answer.')))
      req.on('error', (e: NodeJS.ErrnoException) => {
        if (e instanceof ProxyError) return reject(e)
        if (e.code === 'EPRIVATE') return reject(new ProxyError(403, 'That link points to a private network address.'))
        if (e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN') return reject(new ProxyError(502, `Couldn’t find the site ${url.hostname}.`))
        reject(new ProxyError(502, `Couldn’t reach ${url.hostname}.`))
      })
      req.end()
    })
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/** Image type from the first bytes, whatever the Content-Type says. */
export function sniff(body: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...body.subarray(from, to))
  if (body.length >= 8 && body[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png'
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'image/jpeg'
  if (body.length >= 6 && ascii(0, 4) === 'GIF8') return 'image/gif'
  if (body.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (body.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12)
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return 'image/heic'
  }
  if (body.length >= 2 && ascii(0, 2) === 'BM') return 'image/bmp'
  if (body.length >= 4 && body[0] === 0 && body[1] === 0 && body[2] === 1 && body[3] === 0) return 'image/x-icon'
  const text = ascii(0, Math.min(body.length, 1024)).trimStart().toLowerCase()
  if (text.startsWith('<svg') || (text.startsWith('<?xml') && text.includes('<svg'))) return 'image/svg+xml'
  if (text.startsWith('<!doctype html') || text.startsWith('<html') || /<(head|meta|title|body)[\s>]/.test(text)) return 'text/html'
  return null
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(/([a-z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '')
  }
  return out
}

/** A page's preview image and title, from its Open Graph / Twitter card tags. */
export function pagePreview(html: string, base: URL): { image: URL | null; title: string | null } {
  const head = html.slice(0, 512 * 1024)
  const meta = new Map<string, string>()
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(m[0])
    const key = (a.property ?? a.name ?? a.itemprop ?? '').toLowerCase()
    if (key && a.content && !meta.has(key)) meta.set(key, a.content.trim())
  }
  let image: string | undefined
  for (const key of ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src', 'image']) {
    image = meta.get(key)
    if (image) break
  }
  if (!image) {
    for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
      const a = attributes(m[0])
      if (a.rel?.toLowerCase().split(/\s+/).includes('image_src') && a.href) {
        image = a.href
        break
      }
    }
  }
  const titleTag = head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
  const rawTitle = meta.get('og:title') ?? meta.get('twitter:title') ?? (titleTag ? decodeEntities(titleTag) : undefined)
  const title = rawTitle?.replace(/\s+/g, ' ').trim().slice(0, 120) || null
  let url: URL | null = null
  if (image) {
    try {
      url = new URL(image, base)
    } catch {
      url = null
    }
  }
  return { image: url, title }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function checkUrl(raw: string | null, allowPrivate: boolean): URL {
  if (!raw) throw new ProxyError(400, 'Missing ?url= parameter.')
  if (raw.length > 4096) throw new ProxyError(400, 'That link is too long.')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ProxyError(400, 'That isn’t a valid link.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ProxyError(400, 'Only http:// and https:// links can be opened.')
  if (url.username || url.password) throw new ProxyError(400, 'Links with a user name or password can’t be opened.')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!allowPrivate && (isIP(host) ? isPrivateAddress(host) : /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host))) {
    throw new ProxyError(403, 'That link points to a private network address.')
  }
  if (url.port && url.port !== '80' && url.port !== '443' && !allowPrivate) throw new ProxyError(400, 'Only links on the standard web ports can be opened.')
  return url
}

/**
 * The body as a stream: Vercel caps buffered function responses at 4.5 MB,
 * streamed ones are not capped.
 */
function streamOf(body: Uint8Array): ReadableStream<Uint8Array> {
  const CHUNK = 256 * 1024
  let offset = 0
  return new ReadableStream({
    pull(controller) {
      if (offset >= body.length) return controller.close()
      controller.enqueue(body.slice(offset, offset + CHUNK))
      offset += CHUNK
    },
  })
}

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

export async function handleImageProxy(requestUrl: URL, opts: ProxyOptions = {}): Promise<Response> {
  const allowPrivate = !!opts.allowPrivate
  const get = opts.get ?? defaultGetter(allowPrivate)
  try {
    let url = checkUrl(requestUrl.searchParams.get('url'), allowPrivate)
    let title: string | null = null
    let followedPage = false
    for (let hop = 0; ; hop++) {
      if (hop >= MAX_HOPS) throw new ProxyError(502, 'That link redirects too many times.')
      const res = await get(url)
      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        url = checkUrl(new URL(res.headers.location, url).toString(), allowPrivate)
        continue
      }
      if (res.status === 404 || res.status === 410) throw new ProxyError(502, `That link doesn’t exist any more (${res.status}).`)
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        // Usually bot protection in front of a page; the image CDN behind it tends to be open
        throw new ProxyError(
          502,
          `That site blocks automatic downloads (${res.status}). Right-click the picture → Copy image address, and paste that link instead.`,
        )
      }
      if (res.status < 200 || res.status >= 300) throw new ProxyError(502, `That site answered with an error (${res.status}).`)
      const declared = (res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
      const type = sniff(res.body) ?? declared
      if (type === 'image/svg+xml') throw new ProxyError(415, 'SVG images can’t be opened from a link. Save the file and drop it in instead.')
      if (type.startsWith('image/')) {
        const headers = new Headers({
          'Content-Type': type,
          'Cache-Control': 'public, max-age=3600, s-maxage=86400',
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'X-Content-Type-Options': 'nosniff',
          'X-Source-Url': encodeURI(url.toString()),
        })
        if (title) headers.set('X-Source-Title', encodeURIComponent(title))
        return new Response(streamOf(res.body), { status: 200, headers })
      }
      if (type === 'text/html' || declared === 'application/xhtml+xml') {
        if (followedPage) throw new ProxyError(415, 'That page’s preview isn’t an image.')
        const preview = pagePreview(new TextDecoder().decode(res.body), url)
        if (!preview.image) {
          throw new ProxyError(415, 'That link is a web page without a preview image. Open the image itself (right-click it → Copy image address) and paste that link.')
        }
        title = preview.title
        followedPage = true
        url = checkUrl(preview.image.toString(), allowPrivate)
        continue
      }
      throw new ProxyError(415, 'That link isn’t an image.')
    }
  } catch (e) {
    if (e instanceof ProxyError) return json(e.status, e.message)
    return json(502, 'Couldn’t download that image.')
  }
}

/** Vercel Function settings: stream the response (see streamOf). */
export const config = { supportsResponseStreaming: true }

/** Vercel Function entry point. */
export async function GET(request: Request): Promise<Response> {
  return handleImageProxy(new URL(request.url))
}
