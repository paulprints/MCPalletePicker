/**
 * Pixel art: rebuild the image as a grid of blocks.
 *
 * The image is box-filtered down to one sample per block in linear light (so
 * a fine checkerboard becomes its true average, not one of its colours), then
 * each cell takes its closest block, optionally with error diffusion
 * (Floyd–Steinberg, serpentine, in OKLab) or ordered (Bayer) dithering.
 */
import { surfaceFace, type BlockInfo, type Surface } from './blocks'
import { linearRgbToOklab, SRGB_TO_LINEAR } from './color'
import { ALPHA_THRESHOLD, type PixelSource } from './extract'

export type Dither = 'none' | 'floyd-steinberg' | 'ordered'

export interface Grid {
  width: number
  height: number
  /** 3 floats (OKLab) per cell. */
  lab: Float32Array
  /** Average opacity per cell, 0–1. */
  alpha: Float32Array
}

/** Area-averages an image down to `width × height` cells, in linear light. */
export function resampleToGrid(src: PixelSource, width: number, height: number): Grid {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const acc = new Float64Array(w * h * 4)
  const area = new Float64Array(w * h)
  const sx = w / src.width
  const sy = h / src.height
  const d = src.data
  for (let y = 0; y < src.height; y++) {
    // A source pixel may straddle two target rows/columns: split it by overlap.
    const y0 = y * sy
    const y1 = (y + 1) * sy
    for (let x = 0; x < src.width; x++) {
      const p = (y * src.width + x) * 4
      const a = d[p + 3] / 255
      const lr = SRGB_TO_LINEAR[d[p]] * a
      const lg = SRGB_TO_LINEAR[d[p + 1]] * a
      const lb = SRGB_TO_LINEAR[d[p + 2]] * a
      const x0 = x * sx
      const x1 = (x + 1) * sx
      for (let ty = Math.floor(y0); ty < Math.min(h, Math.ceil(y1)); ty++) {
        const oy = Math.min(y1, ty + 1) - Math.max(y0, ty)
        if (oy <= 0) continue
        for (let tx = Math.floor(x0); tx < Math.min(w, Math.ceil(x1)); tx++) {
          const ox = Math.min(x1, tx + 1) - Math.max(x0, tx)
          if (ox <= 0) continue
          const wt = ox * oy
          const o = (ty * w + tx) * 4
          acc[o] += lr * wt
          acc[o + 1] += lg * wt
          acc[o + 2] += lb * wt
          acc[o + 3] += a * wt
          area[ty * w + tx] += wt
        }
      }
    }
  }
  const lab = new Float32Array(w * h * 3)
  const alpha = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const a = acc[i * 4 + 3]
    alpha[i] = area[i] > 0 ? a / area[i] : 0
    if (a > 0) {
      const c = linearRgbToOklab(acc[i * 4] / a, acc[i * 4 + 1] / a, acc[i * 4 + 2] / a)
      lab[i * 3] = c[0]
      lab[i * 3 + 1] = c[1]
      lab[i * 3 + 2] = c[2]
    }
  }
  return { width: w, height: h, lab, alpha }
}

export interface MosaicOptions {
  dither: Dither
  /** 0–1 strength for the dithering modes. */
  ditherStrength?: number
  surface: Surface
}

export interface Mosaic {
  width: number
  height: number
  /** Block index per cell (row-major, top row first), -1 for transparent. */
  cells: Int16Array
  /** Blocks referenced by `cells`. */
  blocks: BlockInfo[]
  /** Number of cells per block. */
  counts: number[]
  /** Mean colour error over opaque cells (ΔE_OK). */
  meanError: number
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5)

export function buildMosaic(grid: Grid, candidates: readonly BlockInfo[], opts: MosaicOptions): Mosaic {
  const { width: w, height: h } = grid
  const n = w * h
  const cells = new Int16Array(n).fill(-1)
  const counts = new Array<number>(candidates.length).fill(0)
  if (!candidates.length) return { width: w, height: h, cells, blocks: [], counts: [], meanError: 0 }
  const pal = new Float64Array(candidates.length * 3)
  candidates.forEach((b, i) => {
    const f = surfaceFace(b, opts.surface)
    pal[i * 3] = f.lab[0]
    pal[i * 3 + 1] = f.lab[1]
    pal[i * 3 + 2] = f.lab[2]
  })
  const nearest = (L: number, a: number, b: number) => {
    let best = 0
    let bestD = Infinity
    for (let j = 0; j < candidates.length; j++) {
      const dL = L - pal[j * 3]
      const da = a - pal[j * 3 + 1]
      const db = b - pal[j * 3 + 2]
      const dd = dL * dL + da * da + db * db
      if (dd < bestD) {
        bestD = dd
        best = j
      }
    }
    return best
  }
  // Exact repeats are common in flat artwork
  const memo = new Map<number, number>()
  const cachedNearest = (L: number, a: number, b: number) => {
    const key = (Math.round(L * 500) * 1000 + Math.round(a * 500 + 250)) * 1000 + Math.round(b * 500 + 250)
    let j = memo.get(key)
    if (j === undefined) {
      j = nearest(L, a, b)
      if (memo.size < 500_000) memo.set(key, j)
    }
    return j
  }

  const strength = opts.ditherStrength ?? 0.85
  // Ordered dithering has to step over the gaps between the palette's colours:
  // scale its threshold by the typical distance from a colour to its neighbour.
  const gap = opts.dither === 'ordered' ? typicalGap(pal, candidates.length) : 0
  const work = opts.dither === 'floyd-steinberg' ? Float32Array.from(grid.lab) : grid.lab
  let errSum = 0
  let opaqueCells = 0
  for (let y = 0; y < h; y++) {
    const reverse = opts.dither === 'floyd-steinberg' && y % 2 === 1
    for (let k = 0; k < w; k++) {
      const x = reverse ? w - 1 - k : k
      const i = y * w + x
      if (grid.alpha[i] * 255 < ALPHA_THRESHOLD) continue
      let L = work[i * 3]
      let a = work[i * 3 + 1]
      let b = work[i * 3 + 2]
      if (opts.dither === 'ordered') {
        const t = BAYER4[(y & 3) * 4 + (x & 3)] * strength * gap
        L += t
        a += t * 0.35
        b += t * 0.35
      }
      const j = opts.dither === 'none' ? cachedNearest(L, a, b) : nearest(L, a, b)
      cells[i] = j
      counts[j]++
      const o = grid.lab
      errSum += Math.sqrt((o[i * 3] - pal[j * 3]) ** 2 + (o[i * 3 + 1] - pal[j * 3 + 1]) ** 2 + (o[i * 3 + 2] - pal[j * 3 + 2]) ** 2)
      opaqueCells++
      if (opts.dither === 'floyd-steinberg') {
        const eL = (L - pal[j * 3]) * strength
        const ea = (a - pal[j * 3 + 1]) * strength
        const eb = (b - pal[j * 3 + 2]) * strength
        const dir = reverse ? -1 : 1
        spread(work, grid.alpha, w, h, x + dir, y, eL, ea, eb, 7 / 16)
        spread(work, grid.alpha, w, h, x - dir, y + 1, eL, ea, eb, 3 / 16)
        spread(work, grid.alpha, w, h, x, y + 1, eL, ea, eb, 5 / 16)
        spread(work, grid.alpha, w, h, x + dir, y + 1, eL, ea, eb, 1 / 16)
      }
    }
  }
  // Keep only the blocks actually used, most used first
  const order = counts.map((c, j) => ({ c, j })).filter((e) => e.c > 0).sort((p, q) => q.c - p.c || p.j - q.j)
  const remap = new Int16Array(candidates.length).fill(-1)
  order.forEach((e, k) => (remap[e.j] = k))
  for (let i = 0; i < n; i++) if (cells[i] >= 0) cells[i] = remap[cells[i]]
  return {
    width: w,
    height: h,
    cells,
    blocks: order.map((e) => candidates[e.j]),
    counts: order.map((e) => e.c),
    meanError: opaqueCells ? errSum / opaqueCells : 0,
  }
}

/** Median distance from each palette colour to its nearest neighbour (0.1 for a single colour). */
function typicalGap(pal: Float64Array, n: number): number {
  if (n < 2) return 0.1
  const nearest: number[] = []
  for (let i = 0; i < n; i++) {
    let best = Infinity
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const d = (pal[i * 3] - pal[j * 3]) ** 2 + (pal[i * 3 + 1] - pal[j * 3 + 1]) ** 2 + (pal[i * 3 + 2] - pal[j * 3 + 2]) ** 2
      if (d < best) best = d
    }
    nearest.push(Math.sqrt(best))
  }
  nearest.sort((a, b) => a - b)
  return nearest[Math.floor(n / 2)]
}

function spread(work: Float32Array, alpha: Float32Array, w: number, h: number, x: number, y: number, eL: number, ea: number, eb: number, f: number) {
  if (x < 0 || y < 0 || x >= w || y >= h) return
  const i = y * w + x
  if (alpha[i] * 255 < ALPHA_THRESHOLD) return
  work[i * 3] += eL * f
  work[i * 3 + 1] += ea * f
  work[i * 3 + 2] += eb * f
}

/** Grid height for a given width that keeps the image's aspect ratio. */
export function heightFor(width: number, imageWidth: number, imageHeight: number): number {
  return Math.max(1, Math.round((width * imageHeight) / Math.max(1, imageWidth)))
}
