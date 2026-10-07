/**
 * Turning whatever someone pastes into the "image link" box into the URL of
 * the image itself: adds a missing `https://`, strips stray quotes or angle
 * brackets, and unwraps the redirect/preview links image searches hand out
 * (Google Images, Bing, DuckDuckGo, Yandex) to the original image.
 */

export type LinkResult = { ok: true; url: string; kind: 'http' | 'data' } | { ok: false; error: string }

const MAX_LENGTH = 4096

/** Query parameters that carry the real image (or page) URL, per search engine. */
const WRAPPERS: { host: RegExp; path?: RegExp; params: string[] }[] = [
  { host: /(^|\.)google\.[a-z.]+$/, path: /^\/(imgres|url)$/, params: ['imgurl', 'url', 'q'] },
  { host: /(^|\.)bing\.com$/, path: /^\/images\/search$/, params: ['mediaurl'] },
  { host: /(^|\.)duckduckgo\.com$/, path: /^\/iu\/?$/, params: ['u'] },
  { host: /(^|\.)yandex\.[a-z.]+$/, path: /^\/images\/search$/, params: ['img_url'] },
]

export function normalizeImageLink(input: string): LinkResult {
  // Quotes and angle brackets come along when links are copied from chats and markdown
  let text = input.trim().replace(/^["'<\s]+|[>"'\s]+$/g, '')
  if (!text) return { ok: false, error: 'Paste a link to an image first.' }
  if (text.length > MAX_LENGTH && !text.startsWith('data:')) return { ok: false, error: 'That link is too long to be an image address.' }
  if (/^data:/i.test(text)) {
    return /^data:image\/[a-z0-9.+-]+(;[^,]*)?,/i.test(text) ? { ok: true, url: text, kind: 'data' } : { ok: false, error: 'That data link doesn’t contain an image.' }
  }
  // "example.com/picture.png" or "//example.com/picture.png"
  if (text.startsWith('//')) text = `https:${text}`
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/.test(text)) text = `https://${text}`
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { ok: false, error: 'That doesn’t look like a web address. It should start with https://' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: 'Only http:// and https:// links can be opened.' }
  // Unwrap image-search links, repeatedly in case they are nested
  for (let depth = 0; depth < 3; depth++) {
    const inner = unwrap(url)
    if (!inner) break
    url = inner
  }
  url.hash = ''
  return { ok: true, url: url.toString(), kind: 'http' }
}

function unwrap(url: URL): URL | null {
  for (const w of WRAPPERS) {
    if (!w.host.test(url.hostname) || (w.path && !w.path.test(url.pathname))) continue
    for (const p of w.params) {
      const v = url.searchParams.get(p)
      if (!v) continue
      try {
        const inner = new URL(v)
        if (inner.protocol === 'http:' || inner.protocol === 'https:') return inner
      } catch {
        // not a URL: try the next parameter
      }
    }
  }
  return null
}

/** The last path segment of a URL, decoded ("" when there is none). */
export function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop() ?? ''
    try {
      return decodeURIComponent(last)
    } catch {
      return last
    }
  } catch {
    return ''
  }
}

/** Whether a pasted string is a single link worth trying to open as an image. */
export function looksLikeLink(text: string): boolean {
  const t = text.trim()
  if (!t || /\s/.test(t) || t.length > MAX_LENGTH) return /^data:image\//i.test(t)
  return /^https?:\/\/\S+$/i.test(t) || /^data:image\//i.test(t)
}
