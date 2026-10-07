/**
 * Minecraft's block texture atlas, loaded at runtime from misode/mcmeta (never
 * bundled), and helpers that draw block faces and isometric block icons from
 * it. Everything falls back to flat colours when the atlas is unavailable.
 *
 * Sources are tried in order: the same-origin `/mc-assets` proxy (Vite and the
 * Vercel rewrite), raw.githubusercontent.com, then jsDelivr. Responses are
 * kept in Cache Storage so later visits work offline.
 */
import { DATA_META, type BlockInfo, type Face, type Surface } from '../core/blocks'

const TAG = `${DATA_META.minecraftVersion}-atlas`
const CACHE_NAME = 'mcpp-atlas-v1'

const SOURCES = [
  (path: string) => `/mc-assets/${TAG}/${path}`,
  (path: string) => `https://raw.githubusercontent.com/misode/mcmeta/${TAG}/${path}`,
  (path: string) => `https://cdn.jsdelivr.net/gh/misode/mcmeta@${TAG}/${path}`,
]

export interface Atlas {
  image: CanvasImageSource
  /** Sprite rectangles [x, y, w, h] in pixels; animated sprites list all frames (h > w). */
  sprites: Record<string, [number, number, number, number]>
}

async function fetchAsset(path: string, kind: 'json' | 'blob'): Promise<unknown> {
  const cacheKey = `https://mcmeta.cache/${TAG}/${path}`
  let cache: Cache | undefined
  try {
    cache = typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : undefined
    const hit = await cache?.match(cacheKey)
    if (hit) return kind === 'json' ? await hit.json() : await hit.blob()
  } catch {
    cache = undefined
  }
  const errors: string[] = []
  for (const url of SOURCES.map((s) => s(path))) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // An SPA fallback serving index.html is not an asset
      if ((res.headers.get('content-type') ?? '').includes('text/html')) throw new Error('got HTML')
      const copy = res.clone()
      const value = kind === 'json' ? await res.json() : await res.blob()
      cache?.put(cacheKey, copy).catch(() => undefined)
      return value
    } catch (e) {
      errors.push(`${url}: ${(e as Error).message}`)
    }
  }
  throw new Error(`Could not download ${path} (${errors.join('; ')})`)
}

let loading: Promise<Atlas> | null = null

/** Loads (once) the block texture atlas. */
export function loadAtlas(): Promise<Atlas> {
  loading ??= (async () => {
    const [sprites, blob] = await Promise.all([
      fetchAsset('all/data.min.json', 'json') as Promise<Atlas['sprites']>,
      fetchAsset('all/atlas.png', 'blob') as Promise<Blob>,
    ])
    const image = await createImageBitmap(blob)
    return { image, sprites }
  })().catch((e) => {
    loading = null
    throw e
  })
  return loading
}

// ---------------------------------------------------------------------------
// Faces
// ---------------------------------------------------------------------------

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  return Object.assign(document.createElement('canvas'), { width: w, height: h })
}

const faceCache = new WeakMap<Atlas, Map<string, AnyCanvas>>()

/**
 * A face's layers composited into a 16×16 (first animation frame) canvas,
 * with biome tints applied. Cached per atlas and layer stack.
 */
export function faceTexture(atlas: Atlas, face: Face): AnyCanvas | null {
  let cache = faceCache.get(atlas)
  if (!cache) faceCache.set(atlas, (cache = new Map()))
  const key = face.layers.map((l) => l.tex + (l.tint ?? '')).join('|')
  const hit = cache.get(key)
  if (hit) return hit
  const size = 16
  const out = makeCanvas(size, size)
  const ctx = out.getContext('2d') as Ctx2D | null
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false
  for (const layer of face.layers) {
    const r = atlas.sprites[layer.tex]
    if (!r) return null
    const [x, y, w] = r
    if (!layer.tint) {
      ctx.drawImage(atlas.image, x, y, w, w, 0, 0, size, size)
      continue
    }
    // Multiply the layer by its tint, keeping the layer's own alpha
    const tmp = makeCanvas(size, size)
    const t = tmp.getContext('2d') as Ctx2D
    t.imageSmoothingEnabled = false
    t.drawImage(atlas.image, x, y, w, w, 0, 0, size, size)
    t.globalCompositeOperation = 'multiply'
    t.fillStyle = layer.tint
    t.fillRect(0, 0, size, size)
    t.globalCompositeOperation = 'destination-in'
    t.drawImage(atlas.image, x, y, w, w, 0, 0, size, size)
    ctx.drawImage(tmp, 0, 0)
  }
  cache.set(key, out)
  return out
}

/** Draws a face flat into a square. */
export function drawFace(ctx: Ctx2D, face: Face, atlas: Atlas | null, x: number, y: number, size: number) {
  const tex = atlas ? faceTexture(atlas, face) : null
  if (tex) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tex, x, y, size, size)
  } else {
    ctx.fillStyle = face.hex
    ctx.fillRect(x, y, size, size)
  }
}

/**
 * Draws an isometric block (top, south and east faces, shaded like the
 * inventory) filling a `size × size` square at (x, y).
 */
export function drawIsoBlock(ctx: Ctx2D, block: BlockInfo, atlas: Atlas | null, x: number, y: number, size: number) {
  // Corners of the outline: top (s/2, 0), right (s, s/4), front (s/2, s/2),
  // left (0, s/4); the sides drop by s/2. Each face is an affine map of its
  // 16×16 texture, as canvas transform(a, b, c, d, e, f) arguments.
  const s = size
  const k = s / 32
  const faces: [Face, [number, number, number, number, number, number], number][] = [
    // top: u runs left → top corner, v runs left → front corner
    [block.top, [k, -k / 2, k, k / 2, x, y + s / 4], 0],
    // south (left): u runs left → front corner, v runs down
    [block.side, [k, k / 2, 0, k, x, y + s / 4], 0.2],
    // east (right): u runs front → right corner, v runs down
    [block.side, [k, -k / 2, 0, k, x + s / 2, y + s / 2], 0.4],
  ]
  ctx.save()
  ctx.imageSmoothingEnabled = false
  for (const [face, m, shade] of faces) {
    ctx.save()
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5])
    // Overdraw by a hair so the seams between faces don't show the background
    const tex = atlas ? faceTexture(atlas, face) : null
    if (tex) ctx.drawImage(tex, -0.15, -0.15, 16.3, 16.3)
    else {
      ctx.fillStyle = face.hex
      ctx.fillRect(-0.15, -0.15, 16.3, 16.3)
    }
    if (shade) {
      ctx.fillStyle = `rgba(0,0,0,${shade})`
      ctx.fillRect(-0.15, -0.15, 16.3, 16.3)
    }
    ctx.restore()
  }
  ctx.restore()
}

/** The face a surface setting shows for flat swatches. */
export function displayFace(block: BlockInfo, surface: Surface): Face {
  return surface === 'top' ? block.top : block.side
}

const urlCache = new WeakMap<Atlas, Map<string, string>>()

/**
 * A face as a PNG data URL (16×16 texels scaled up without smoothing), for
 * CSS backgrounds that tile a texture. Null until the atlas is loaded.
 */
export function faceDataUrl(atlas: Atlas | null, face: Face, scale = 4): string | null {
  if (!atlas || typeof document === 'undefined') return null
  let cache = urlCache.get(atlas)
  if (!cache) urlCache.set(atlas, (cache = new Map()))
  const key = `${scale}:${face.layers.map((l) => l.tex + (l.tint ?? '')).join('|')}`
  const hit = cache.get(key)
  if (hit) return hit
  const tex = faceTexture(atlas, face)
  if (!tex) return null
  const c = document.createElement('canvas')
  c.width = c.height = 16 * scale
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tex, 0, 0, c.width, c.height)
  const url = c.toDataURL('image/png')
  cache.set(key, url)
  return url
}
