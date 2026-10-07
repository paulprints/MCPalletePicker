/**
 * Colour extraction: from image pixels to a handful of representative colours.
 *
 * 1. Pixels are converted to OKLab and binned on a 32×32×32 sRGB grid, so the
 *    clustering cost depends on the number of distinct colours, not pixels.
 * 2. Weighted k-means++ (seeded, best of several restarts) over-segments the
 *    image into ~3× as many clusters as the palette needs.
 * 3. A greedy "maximal marginal relevance" pass picks the palette: each pick
 *    balances how much of the image a cluster covers (boosted for vivid
 *    colours by *vibrancy*) against how different it is from the colours
 *    already picked (*variety*). Near-duplicates are never picked twice.
 * 4. Every pixel is assigned to its nearest palette colour to measure coverage
 *    and to place a marker on the most representative spot of the image.
 */
import { chroma, deltaE2, rgbToOklab, type Lab } from './color'
import { mulberry32, weightedIndex } from './random'

/** RGBA pixels, as in ImageData. */
export interface PixelSource {
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array
}

/** An image converted to OKLab. Transparent pixels are masked out. */
export interface LabImage {
  width: number
  height: number
  /** 3 floats per pixel. */
  lab: Float32Array
  /** 1 where the pixel is (mostly) opaque. */
  opaque: Uint8Array
  /** Number of opaque pixels. */
  count: number
  /** sRGB bin per pixel (see {@link binKey}), or -1 when transparent. */
  bins: Int32Array
}

export interface Cluster {
  lab: Lab
  /** Fraction of the image's opaque pixels in this cluster (0–1). */
  weight: number
  /** RMS OKLab distance of the cluster's pixels from its centre: how "textured" it is. */
  spread: number
}

export interface PickedColor extends Cluster {
  /** Fraction of opaque pixels nearest to this colour among the picked ones. */
  coverage: number
  /** Most representative spot, as fractions of the image size (0–1). */
  marker: { x: number; y: number } | null
}

export const ALPHA_THRESHOLD = 128

const binKey = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)

export function toLabImage(src: PixelSource): LabImage {
  const n = src.width * src.height
  const lab = new Float32Array(n * 3)
  const opaque = new Uint8Array(n)
  const bins = new Int32Array(n).fill(-1)
  const d = src.data
  let count = 0
  // Photos repeat colours a lot; memoise the conversion per exact colour.
  const memo = new Map<number, Lab>()
  for (let i = 0; i < n; i++) {
    const p = i * 4
    if (d[p + 3] < ALPHA_THRESHOLD) continue
    const r = d[p]
    const g = d[p + 1]
    const b = d[p + 2]
    const key = (r << 16) | (g << 8) | b
    let c = memo.get(key)
    if (!c) {
      c = rgbToOklab(r, g, b)
      if (memo.size < 200_000) memo.set(key, c)
    }
    lab[i * 3] = c[0]
    lab[i * 3 + 1] = c[1]
    lab[i * 3 + 2] = c[2]
    opaque[i] = 1
    bins[i] = binKey(r, g, b)
    count++
  }
  return { width: src.width, height: src.height, lab, opaque, count, bins }
}

interface Points {
  /** 3 floats per point (bin mean). */
  lab: Float64Array
  /** Pixel count per point. */
  w: Float64Array
  /**
   * Weight used while clustering: the square root of the pixel count, so a
   * small vivid area (a sunset's sun) keeps its own cluster instead of being
   * absorbed by the large regions around it.
   */
  kw: Float64Array
  /** Mean squared distance of the bin's pixels from the bin mean. */
  var: Float64Array
  n: number
}

/** Collapses pixels into weighted sRGB-grid bins. */
function binPixels(img: LabImage): Points {
  const index = new Map<number, number>()
  const sums: number[] = []
  for (let i = 0; i < img.bins.length; i++) {
    const key = img.bins[i]
    if (key < 0) continue
    let j = index.get(key)
    if (j === undefined) {
      j = index.size
      index.set(key, j)
      sums.push(0, 0, 0, 0, 0)
    }
    const L = img.lab[i * 3]
    const a = img.lab[i * 3 + 1]
    const b = img.lab[i * 3 + 2]
    const o = j * 5
    sums[o] += L
    sums[o + 1] += a
    sums[o + 2] += b
    sums[o + 3] += 1
    sums[o + 4] += L * L + a * a + b * b
  }
  const n = index.size
  const lab = new Float64Array(n * 3)
  const w = new Float64Array(n)
  const variance = new Float64Array(n)
  for (let j = 0; j < n; j++) {
    const o = j * 5
    const c = sums[o + 3]
    const L = sums[o] / c
    const a = sums[o + 1] / c
    const b = sums[o + 2] / c
    lab[j * 3] = L
    lab[j * 3 + 1] = a
    lab[j * 3 + 2] = b
    w[j] = c
    variance[j] = Math.max(0, sums[o + 4] / c - (L * L + a * a + b * b))
  }
  return { lab, w, kw: w.map(Math.sqrt), var: variance, n }
}

function kmeans(pts: Points, k: number, rand: () => number, maxIter = 40): { centers: Float64Array; assign: Int32Array; inertia: number } {
  const { n } = pts
  const centers = new Float64Array(k * 3)
  // k-means++ seeding, weighted by pixel count
  const d2 = new Float64Array(n).fill(Infinity)
  const seedWeights = new Float64Array(n)
  for (let c = 0; c < k; c++) {
    const pick = weightedIndex(c === 0 ? pts.kw : seedWeights, rand)
    centers[c * 3] = pts.lab[pick * 3]
    centers[c * 3 + 1] = pts.lab[pick * 3 + 1]
    centers[c * 3 + 2] = pts.lab[pick * 3 + 2]
    for (let i = 0; i < n; i++) {
      const dd = dist2(pts.lab, i, centers, c)
      if (dd < d2[i]) d2[i] = dd
      seedWeights[i] = d2[i] * pts.kw[i]
    }
  }

  const assign = new Int32Array(n)
  const sums = new Float64Array(k * 4)
  let inertia = Infinity
  for (let iter = 0; iter < maxIter; iter++) {
    sums.fill(0)
    let total = 0
    for (let i = 0; i < n; i++) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < k; c++) {
        const dd = dist2(pts.lab, i, centers, c)
        if (dd < bestD) {
          bestD = dd
          best = c
        }
      }
      assign[i] = best
      const w = pts.kw[i]
      sums[best * 4] += pts.lab[i * 3] * w
      sums[best * 4 + 1] += pts.lab[i * 3 + 1] * w
      sums[best * 4 + 2] += pts.lab[i * 3 + 2] * w
      sums[best * 4 + 3] += w
      total += bestD * w
    }
    let moved = 0
    for (let c = 0; c < k; c++) {
      const w = sums[c * 4 + 3]
      if (w === 0) {
        // Empty cluster: re-seed it on the point that is worst served.
        let worst = 0
        let worstD = -1
        for (let i = 0; i < n; i++) {
          const dd = dist2(pts.lab, i, centers, assign[i]) * pts.kw[i]
          if (dd > worstD) {
            worstD = dd
            worst = i
          }
        }
        centers[c * 3] = pts.lab[worst * 3]
        centers[c * 3 + 1] = pts.lab[worst * 3 + 1]
        centers[c * 3 + 2] = pts.lab[worst * 3 + 2]
        moved = Infinity
        continue
      }
      const L = sums[c * 4] / w
      const a = sums[c * 4 + 1] / w
      const b = sums[c * 4 + 2] / w
      moved = Math.max(moved, (L - centers[c * 3]) ** 2 + (a - centers[c * 3 + 1]) ** 2 + (b - centers[c * 3 + 2]) ** 2)
      centers[c * 3] = L
      centers[c * 3 + 1] = a
      centers[c * 3 + 2] = b
    }
    inertia = total
    if (moved < 1e-9) break
  }
  return { centers, assign, inertia }
}

function dist2(a: Float64Array, i: number, b: Float64Array, j: number): number {
  const dL = a[i * 3] - b[j * 3]
  const da = a[i * 3 + 1] - b[j * 3 + 1]
  const db = a[i * 3 + 2] - b[j * 3 + 2]
  return dL * dL + da * da + db * db
}

export interface ClusterOptions {
  /** Number of clusters to find (capped by the number of distinct colours). */
  k: number
  seed?: number
  /** k-means restarts; the run with the lowest error wins. */
  restarts?: number
}

/** Clusters an image's colours. Clusters are returned largest first. */
export function clusterColors(img: LabImage, { k, seed = 1, restarts = 3 }: ClusterOptions): Cluster[] {
  if (img.count === 0) return []
  const pts = binPixels(img)
  const kk = Math.max(1, Math.min(k, pts.n))
  let best: ReturnType<typeof kmeans> | null = null
  for (let r = 0; r < restarts; r++) {
    const run = kmeans(pts, kk, mulberry32(seed * 7919 + r * 104729))
    if (!best || run.inertia < best.inertia) best = run
  }
  const { centers, assign } = best!
  const weight = new Float64Array(kk)
  const sq = new Float64Array(kk)
  for (let i = 0; i < pts.n; i++) {
    const c = assign[i]
    weight[c] += pts.w[i]
    sq[c] += pts.w[i] * (pts.var[i] + dist2(pts.lab, i, centers, c))
  }
  const out: Cluster[] = []
  for (let c = 0; c < kk; c++) {
    if (weight[c] === 0) continue
    out.push({
      lab: [centers[c * 3], centers[c * 3 + 1], centers[c * 3 + 2]],
      weight: weight[c] / img.count,
      spread: Math.sqrt(sq[c] / weight[c]),
    })
  }
  return out.sort((a, b) => b.weight - a.weight)
}

export interface PickOptions {
  count: number
  /** 0 = most common colours, 1 = most different colours. */
  variety: number
  /** 0 = colours count by area only, 1 = vivid colours strongly boosted. */
  vibrancy: number
  /** Colours already in the palette (locked slots) that picks should stay away from. */
  keep?: Lab[]
}

/**
 * How much a cluster "deserves" a palette slot before diversity is considered.
 *
 * Area counts through its square root, so mid-sized regions can compete with a
 * huge sky. *Vibrancy* then adds a bonus for colours more saturated than the
 * image as a whole: additive, so a tiny but striking accent (a red door, the
 * sun in a hazy sunset) can win a slot even though it covers almost nothing.
 */
export function importance(c: Cluster, vibrancy: number, imageChroma: number): number {
  const accent = Math.max(0, chroma(c.lab) - imageChroma)
  return Math.sqrt(c.weight) + vibrancy * 2.5 * accent
}

/** Area-weighted mean chroma of an image's clusters. */
export function meanChroma(clusters: Cluster[]): number {
  let sum = 0
  let w = 0
  for (const c of clusters) {
    sum += chroma(c.lab) * c.weight
    w += c.weight
  }
  return w > 0 ? sum / w : 0
}

/** Picks `count` palette colours from clusters (largest-importance first, then by MMR). */
export function pickColors(clusters: Cluster[], opts: PickOptions): Cluster[] {
  const variety = clamp01(opts.variety)
  const keep = opts.keep ?? []
  const picked: Cluster[] = []
  const pool = clusters.filter((c) => c.weight > 0)
  const imageChroma = meanChroma(pool)
  const imp = pool.map((c) => importance(c, clamp01(opts.vibrancy), imageChroma))
  const maxImp = Math.max(1e-9, ...imp)
  // Below this OKLab distance two colours count as the same colour.
  const minDist = 0.035 + 0.06 * variety
  const gamma = variety * 3
  const D = 0.3
  const used = new Set<number>()
  const nearest = (lab: Lab) => {
    let d = Infinity
    for (const k of keep) d = Math.min(d, Math.sqrt(deltaE2(lab, k)))
    for (const p of picked) d = Math.min(d, Math.sqrt(deltaE2(lab, p.lab)))
    return d
  }
  const pickOnce = (allowClose: boolean, allowTiny: boolean) => {
    let best = -1
    let bestScore = -Infinity
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue
      if (!allowTiny && pool[i].weight < 0.0008) continue
      const d = nearest(pool[i].lab)
      if (!allowClose && d < minDist) continue
      const novelty = Number.isFinite(d) ? Math.min(1, d / D) : 1
      const score = (imp[i] / maxImp) * Math.pow(Math.max(novelty, 1e-6), gamma)
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    return best
  }
  while (picked.length < opts.count) {
    let i = pickOnce(false, false)
    if (i < 0) i = pickOnce(false, true)
    if (i < 0) i = pickOnce(true, true)
    if (i < 0) break
    used.add(i)
    picked.push(pool[i])
  }
  return picked
}

/**
 * Assigns every opaque pixel to its nearest colour, returning each colour's
 * share of the image and the most representative spot to put its marker on.
 */
export function measureColors(img: LabImage, colors: Lab[]): { coverage: number[]; markers: ({ x: number; y: number } | null)[] } {
  const k = colors.length
  const n = img.width * img.height
  const assign = new Int16Array(n).fill(-1)
  const dist = new Float32Array(n)
  const counts = new Float64Array(k)
  for (let i = 0; i < n; i++) {
    if (!img.opaque[i]) continue
    let best = -1
    let bestD = Infinity
    for (let c = 0; c < k; c++) {
      const col = colors[c]
      const dL = img.lab[i * 3] - col[0]
      const da = img.lab[i * 3 + 1] - col[1]
      const db = img.lab[i * 3 + 2] - col[2]
      const dd = dL * dL + da * da + db * db
      if (dd < bestD) {
        bestD = dd
        best = c
      }
    }
    assign[i] = best
    dist[i] = Math.sqrt(bestD)
    if (best >= 0) counts[best]++
  }
  // Marker: a pixel close to the colour whose neighbours are mostly the same
  // colour. Colours are placed largest first, and each keeps clear of the
  // markers already placed so no marker hides another.
  const { width: w, height: h } = img
  const base = new Float32Array(n).fill(Infinity)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const c = assign[i]
      if (c < 0) continue
      let same = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const xx = x + dx
          const yy = y + dy
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && assign[yy * w + xx] === c) same++
        }
      }
      // Prefer spots away from the border, where markers are easier to grab
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y) < Math.max(1, Math.min(w, h) * 0.03) ? 0.01 : 0
      base[i] = dist[i] - 0.004 * same + edge
    }
  }
  const order = Array.from({ length: k }, (_, c) => c).sort((a, b) => counts[b] - counts[a])
  const bestAt = new Int32Array(k).fill(-1)
  const placed: [number, number][] = []
  const clearance = Math.max(2, Math.hypot(w, h) * 0.06)
  for (const c of order) {
    let best = -1
    let bestScore = Infinity
    for (let i = 0; i < n; i++) {
      if (assign[i] !== c) continue
      let score = base[i]
      const x = i % w
      const y = (i - x) / w
      for (const [px, py] of placed) {
        const d = Math.hypot(x - px, y - py)
        if (d < clearance) score += 0.05 * (1 - d / clearance) + 0.01
      }
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    }
    bestAt[c] = best
    if (best >= 0) placed.push([best % w, Math.floor(best / w)])
  }
  const total = Math.max(1, img.count)
  return {
    coverage: Array.from(counts, (c) => c / total),
    markers: Array.from(bestAt, (i) => (i < 0 ? null : { x: ((i % w) + 0.5) / w, y: (Math.floor(i / w) + 0.5) / h })),
  }
}

export interface ExtractOptions extends PickOptions {
  seed?: number
}

/** The whole pipeline: cluster, pick, measure. Picks are returned by coverage, largest first. */
export function extractPalette(img: LabImage, opts: ExtractOptions): PickedColor[] {
  const k = Math.min(40, Math.max(12, opts.count * 3))
  const clusters = clusterColors(img, { k, seed: opts.seed ?? 1 })
  const picks = pickColors(clusters, opts)
  const { coverage, markers } = measureColors(img, [...picks.map((p) => p.lab), ...(opts.keep ?? [])])
  return picks
    .map((p, i) => ({ ...p, coverage: coverage[i], marker: markers[i] }))
    .sort((a, b) => b.coverage - a.coverage)
}

/** Average colour and local texture spread in a small window around a point (fractions 0–1). */
export function sampleAt(img: LabImage, fx: number, fy: number, radius = 2): { lab: Lab; spread: number } | null {
  const cx = Math.min(img.width - 1, Math.max(0, Math.floor(fx * img.width)))
  const cy = Math.min(img.height - 1, Math.max(0, Math.floor(fy * img.height)))
  let L = 0
  let a = 0
  let b = 0
  let sq = 0
  let n = 0
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue
      const i = y * img.width + x
      if (!img.opaque[i]) continue
      const l0 = img.lab[i * 3]
      const a0 = img.lab[i * 3 + 1]
      const b0 = img.lab[i * 3 + 2]
      L += l0
      a += a0
      b += b0
      sq += l0 * l0 + a0 * a0 + b0 * b0
      n++
    }
  }
  if (!n) return null
  L /= n
  a /= n
  b /= n
  return { lab: [L, a, b], spread: Math.sqrt(Math.max(0, sq / n - (L * L + a * a + b * b))) }
}

/** Colour of the single pixel under a point, or null if it is transparent. */
export function pixelAt(img: LabImage, fx: number, fy: number): Lab | null {
  const x = Math.min(img.width - 1, Math.max(0, Math.floor(fx * img.width)))
  const y = Math.min(img.height - 1, Math.max(0, Math.floor(fy * img.height)))
  const i = y * img.width + x
  if (!img.opaque[i]) return null
  return [img.lab[i * 3], img.lab[i * 3 + 1], img.lab[i * 3 + 2]]
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}
