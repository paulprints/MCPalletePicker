/**
 * Opening an image from a link.
 *
 * Browsers only let a page read an image from another site when that site
 * allows it (CORS), and most image hosts don't. So a link is tried three ways:
 *
 *  1. directly, which works for CORS-friendly hosts (Wikimedia, Imgur,
 *     GitHub, many CDNs) and never involves a server;
 *  2. through this app's own image proxy (`/api/image`, a Vercel function,
 *     also served by `vite dev` and `vite preview`). It also turns links to
 *     web pages (Pinterest, DeviantArt, Flickr, Wikipedia…) into their
 *     preview image;
 *  3. through wsrv.nl, a public image proxy, for hosts that don't run the
 *     app's function (plain static hosting).
 */
import { fileNameFromUrl, normalizeImageLink } from '../core/links'
import { ImageLoadError, titleFromFileName } from './image'

export const PROXY_PATH = '/api/image'
export const MIRROR = 'https://wsrv.nl/'

export interface LinkImage {
  blob: Blob
  /** The image's file name (for the palette title when there is no better one). */
  name: string
  /** A ready-made palette title: the page's title, or "Image from <site>". */
  title?: string
  via: 'direct' | 'proxy' | 'mirror' | 'data'
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** Recognises image bytes regardless of the Content-Type a server sent. */
export function sniffImageType(head: Uint8Array): string | null {
  const b = head
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to))
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 6 && ascii(0, 4) === 'GIF8') return 'image/gif'
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (b.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12)
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return 'image/heic'
  }
  if (b.length >= 2 && ascii(0, 2) === 'BM') return 'image/bmp'
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon'
  const text = ascii(0, Math.min(b.length, 512)).trimStart().toLowerCase()
  if (text.startsWith('<svg') || (text.startsWith('<?xml') && text.includes('<svg'))) return 'image/svg+xml'
  return null
}

/** The blob as an image (retyped from its bytes when needed), or null if it isn't one. */
async function asImage(blob: Blob): Promise<Blob | null> {
  const head = new Uint8Array(await blob.slice(0, 512).arrayBuffer())
  const sniffed = sniffImageType(head)
  if (sniffed) return sniffed === blob.type ? blob : new Blob([blob], { type: sniffed })
  return blob.type.startsWith('image/') && blob.type !== 'image/svg+xml' ? blob : null
}

/** "A1b2C3d4" and other generated names make poor palette titles. */
function meaningful(name: string): boolean {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '')
  return !!base && !(/^[\w]{6,}$/.test(base) && /\d/.test(base) && !/[_-]/.test(base))
}

function naming(url: string, pageTitle?: string | null): { name: string; title?: string } {
  const file = fileNameFromUrl(url) || 'image'
  if (pageTitle) return { name: file, title: pageTitle.slice(0, 80) }
  if (meaningful(file) && titleFromFileName(file) !== 'Untitled palette') return { name: file }
  try {
    return { name: file, title: `Image from ${new URL(url).hostname.replace(/^www\./, '')}` }
  } catch {
    return { name: file }
  }
}

export async function fetchImageFromLink(input: string, fetchImpl: Fetch = (u, i) => fetch(u, i)): Promise<LinkImage> {
  const link = normalizeImageLink(input)
  if (!link.ok) throw new ImageLoadError(link.error)
  const url = link.url

  if (link.kind === 'data') {
    const blob = await (await fetchImpl(url)).blob()
    const image = await asImage(blob)
    if (!image) throw new ImageLoadError('That data link doesn’t contain an image.')
    return { blob: image, name: 'image', title: 'Pasted image', via: 'data' }
  }

  // 1. Directly, when the host allows it
  try {
    const res = await fetchImpl(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15_000) })
    if (res.ok) {
      const image = await asImage(await res.blob())
      if (image) return { blob: image, ...naming(url), via: 'direct' }
    }
  } catch {
    // Usually the host doesn't allow cross-site reads: try the proxy
  }

  // 2. The app's own proxy
  let lastError: string | null = null
  try {
    const res = await fetchImpl(`${PROXY_PATH}?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(25_000) })
    const type = res.headers.get('content-type') ?? ''
    if (res.ok && type.startsWith('image/')) {
      const image = await asImage(await res.blob())
      if (image) {
        const title = decodeHeader(res.headers.get('x-source-title'))
        const finalUrl = decodeHeader(res.headers.get('x-source-url')) || url
        return { blob: image, ...naming(finalUrl, title), via: 'proxy' }
      }
    } else if (type.includes('application/json')) {
      const message = ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? null
      // The proxy reached a verdict about the link itself: another route won't do better.
      // (Too large is worth one more try: the mirror shrinks images.)
      if ([400, 403, 415].includes(res.status)) throw new ImageLoadError(message ?? 'Couldn’t open that link.')
      lastError = message
    }
    // Anything else (an HTML 404) means the proxy isn't deployed here
  } catch (e) {
    if (e instanceof ImageLoadError) throw e
  }

  // 3. The public mirror
  try {
    const mirror = `${MIRROR}?url=${encodeURIComponent(url)}&w=2048&h=2048&fit=inside&we`
    const res = await fetchImpl(mirror, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(20_000) })
    if (res.ok) {
      const image = await asImage(await res.blob())
      if (image) return { blob: image, ...naming(url), via: 'mirror' }
    }
  } catch {
    // fall through to the error
  }

  throw new ImageLoadError(
    lastError ??
      'Couldn’t download an image from that link. Make sure it opens the picture itself (right-click the image → Copy image address), or save the image and drop the file in.',
  )
}

function decodeHeader(v: string | null): string {
  if (!v) return ''
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}
