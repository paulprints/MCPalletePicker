/**
 * Text exports of a palette (WorldEdit patterns, plain lists, JSON) and share
 * links.
 */
import { getBlock } from './blocks'
import { hexToLab, labToHex, type Lab } from './color'

export interface PaletteEntry {
  blockId: string
  /** The image colour this block stands in for. */
  target: Lab
  /** Share of the image (0–1). */
  coverage: number
}

/** Integer percentages that add up to exactly 100 (largest remainder), each at least 1. */
export function percentages(weights: number[]): number[] {
  if (!weights.length) return []
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0)
  if (total <= 0) return evenSplit(weights.length)
  const raw = weights.map((w) => (Math.max(0, w) / total) * 100)
  const out = raw.map((r) => Math.max(1, Math.floor(r)))
  let diff = 100 - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; diff > 0; k = (k + 1) % order.length, diff--) out[order[k].i]++
  // Taking from the largest entries keeps the minimum of 1 intact
  while (diff < 0) {
    const i = out.indexOf(Math.max(...out))
    out[i]--
    diff++
  }
  return out
}

function evenSplit(n: number): number[] {
  const base = Math.floor(100 / n)
  return Array.from({ length: n }, (_, i) => base + (i < 100 - base * n ? 1 : 0))
}

/**
 * A WorldEdit/FAWE random pattern weighted by image coverage, ready for
 * `//set`, `//replace` or a brush: `40%stone_bricks,35%andesite,25%tuff`.
 */
export function worldEditPattern(entries: PaletteEntry[]): string {
  const pct = percentages(entries.map((e) => e.coverage))
  return entries.map((e, i) => `${pct[i]}%${e.blockId}`).join(',')
}

export function paletteText(entries: PaletteEntry[], title?: string): string {
  const pct = percentages(entries.map((e) => e.coverage))
  const lines = entries.map((e, i) => {
    const b = getBlock(e.blockId)
    return `${(b?.name ?? e.blockId).padEnd(28)} minecraft:${e.blockId.padEnd(30)} ${String(pct[i]).padStart(3)}%`
  })
  return [title ? `${title}\n` : '', ...lines].join('\n').trimStart()
}

export function paletteJson(entries: PaletteEntry[], meta: { title?: string; minecraftVersion: string }): string {
  const pct = percentages(entries.map((e) => e.coverage))
  return JSON.stringify(
    {
      title: meta.title ?? null,
      minecraftVersion: meta.minecraftVersion,
      generator: 'MC Palette Picker',
      blocks: entries.map((e, i) => {
        const b = getBlock(e.blockId)
        return {
          id: `minecraft:${e.blockId}`,
          name: b?.name ?? e.blockId,
          share: pct[i],
          sourceColor: labToHex(e.target),
          stairs: b?.shapes.stairs ? `minecraft:${b.shapes.stairs}` : null,
          slab: b?.shapes.slab ? `minecraft:${b.shapes.slab}` : null,
          wall: b?.shapes.wall ? `minecraft:${b.shapes.wall}` : null,
        }
      }),
    },
    null,
    2,
  )
}

// ---------------------------------------------------------------------------
// Share links: everything lives in the URL hash, nothing is uploaded.
//   #p=stone_bricks.7c7c7c.32,andesite.888889.20&n=Castle
// ---------------------------------------------------------------------------

export interface SharedPalette {
  title: string
  entries: PaletteEntry[]
}

export function encodeShare(entries: PaletteEntry[], title?: string): string {
  const pct = percentages(entries.map((e) => e.coverage))
  const p = entries.map((e, i) => `${e.blockId}.${labToHex(e.target).slice(1)}.${pct[i]}`).join(',')
  const params = new URLSearchParams()
  params.set('p', p)
  if (title) params.set('n', title.slice(0, 80))
  // Keep the separators readable in the address bar
  return params.toString().replace(/%2C/gi, ',')
}

/** Reads a share hash (with or without the leading `#`). Unknown blocks are skipped. */
export function decodeShare(hash: string): SharedPalette | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const p = params.get('p')
  if (!p) return null
  const entries: PaletteEntry[] = []
  const seen = new Set<string>()
  for (const part of p.split(',')) {
    const [rawId, hex, pct] = part.split('.')
    const block = rawId ? getBlock(rawId.trim().toLowerCase()) : undefined
    if (!block || seen.has(block.id)) continue
    seen.add(block.id)
    const target = (hex && hexToLab(hex)) || block.side.lab
    const coverage = Math.max(0, Math.min(100, Number(pct) || 0)) / 100
    entries.push({ blockId: block.id, target, coverage })
  }
  if (!entries.length) return null
  if (entries.every((e) => e.coverage === 0)) entries.forEach((e) => (e.coverage = 1 / entries.length))
  return { title: params.get('n')?.slice(0, 80) ?? '', entries: entries.slice(0, 24) }
}
