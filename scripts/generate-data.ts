/**
 * Generates `src/data/blocks.json`: every full-cube Minecraft block with the
 * colour facts the palette matcher needs, derived from Mojang's own assets as
 * published by misode/mcmeta (https://github.com/misode/mcmeta).
 *
 * For each block's default state we:
 *   - resolve its block-state variant and model (following parents),
 *   - composite every full-cube element's face per direction (so the grass
 *     block's tinted side overlay is included), applying default biome tints,
 *   - average each composited face in linear light and convert to OKLab, and
 *     measure its texture "spread" (RMS OKLab distance of pixels from the mean;
 *     0 for a flat colour, ~0.1 for noisy textures),
 *   - classify it (category, gravity, light, see-through, creative-only…),
 *   - link its stair/slab/wall/fence variants and fold look-alike duplicates
 *     (waxed copper) into one entry,
 *   - find the first Minecraft release that has it (for the version filter).
 *
 * No textures are copied into the repository: only colour statistics and the
 * texture ids the app later looks up in the runtime-loaded atlas.
 *
 * Usage:  npm run generate:data [-- --version 26.3] [-- --list]
 * Behind a proxy on Node >= 22.21 run with NODE_USE_ENV_PROXY=1.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { linearRgbToOklab, linearToSrgb, rgbToHex, SRGB_TO_LINEAR, type Lab } from '../src/core/color.ts'
import { categorize, flagsFor, SHAPE_SUFFIXES, type ShapeKind } from './classify.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, 'scripts', '.cache')
const OUT = join(ROOT, 'src', 'data')
const MCMETA = 'https://raw.githubusercontent.com/misode/mcmeta'

const args = process.argv.slice(2)
const versionArg = args.indexOf('--version')
const MC_VERSION = versionArg >= 0 ? args[versionArg + 1] : '26.3'
const LIST = args.includes('--list')

/**
 * Releases offered by the "my Minecraft version" filter. Each block records
 * the first of these that contains it. mcmeta summaries start at 1.14.4.
 */
const VERSION_CHECKPOINTS = [
  '1.14.4',
  '1.15.2',
  '1.16.5',
  '1.17.1',
  '1.18.2',
  '1.19.4',
  '1.20.1',
  '1.20.4',
  '1.20.6',
  '1.21.1',
  '1.21.4',
  '1.21.5',
  '1.21.8',
  '1.21.10',
  '1.21.11',
  '26.1.2',
  '26.2',
]

/**
 * Blocks that sat in the registry behind an experimental data pack before the
 * release that shipped them. A normal world on the earlier version doesn't
 * have them, so they count from the release.
 */
const EXPERIMENTAL_UNTIL: [RegExp, string][] = [
  // update_1_20 (1.19.3–1.19.4): bamboo wood, cherry wood, archaeology
  [/cherry|^(stripped_)?bamboo_(block|planks|mosaic)$|^suspicious_sand$/, '1.20.1'],
  // update_1_21 (1.20.3–1.20.6): tuff and copper variants, crafter, trial chambers
  [/^(polished_tuff|tuff_bricks|chiseled_tuff|chiseled_tuff_bricks|crafter|trial_spawner|vault)$|(chiseled_copper|copper_grate|copper_bulb)$/, '1.21.1'],
]

// ---------------------------------------------------------------------------
// Downloads (cached under scripts/.cache)
// ---------------------------------------------------------------------------

async function cached(url: string, file: string): Promise<Buffer> {
  await mkdir(CACHE, { recursive: true })
  const path = join(CACHE, file)
  if (existsSync(path)) return readFile(path)
  process.stdout.write(`  fetching ${url}\n`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(path, buf)
  return buf
}
const json = async <T>(url: string, file: string): Promise<T> => JSON.parse((await cached(url, file)).toString('utf8')) as T

const strip = (id: string) => (id.startsWith('minecraft:') ? id.slice(10) : id)

// ---------------------------------------------------------------------------
// Types of the mcmeta inputs we read
// ---------------------------------------------------------------------------

type BlockStates = Record<string, [Record<string, string[]>, Record<string, string>]>
interface Variant {
  model: string
  x?: number
  y?: number
}
interface BlockDefinition {
  variants?: Record<string, Variant | Variant[]>
  multipart?: { when?: When; apply: Variant | Variant[] }[]
}
type When = Record<string, string | boolean> & { OR?: When[]; AND?: When[] }
type FaceRef = { texture: string; tintindex?: number; uv?: number[] }
type Dir = 'up' | 'down' | 'north' | 'south' | 'east' | 'west'
interface Element {
  from: [number, number, number]
  to: [number, number, number]
  rotation?: unknown
  faces?: Partial<Record<Dir, FaceRef>>
}
interface ModelJson {
  parent?: string
  textures?: Record<string, string | { sprite: string }>
  elements?: Element[]
}

/**
 * Blocks whose full-cube shell hides what actually defines their look (a
 * beacon is a glass box around an obsidian base and a beam).
 */
const EXCLUDE = new Set(['beacon'])

/** Blocks obtainable in survival through an item with another id. */
const PLACED_FROM_OTHER_ITEM = new Set(['powder_snow'])

const DIRS: Dir[] = ['up', 'down', 'north', 'south', 'east', 'west']
const SIDES: Dir[] = ['north', 'south', 'east', 'west']

/** Whether an element's face in `dir` lies on the block's boundary and covers all 16×16 of it. */
function coversBlockSide(e: Element, dir: Dir): boolean {
  const lo = (c: number) => c <= 0.01
  const hi = (c: number) => c >= 15.99
  const [fx, fy, fz] = e.from
  const [tx, ty, tz] = e.to
  const spansX = lo(fx) && hi(tx)
  const spansY = lo(fy) && hi(ty)
  const spansZ = lo(fz) && hi(tz)
  switch (dir) {
    case 'up':
      return hi(ty) && spansX && spansZ
    case 'down':
      return lo(fy) && spansX && spansZ
    case 'north':
      return lo(fz) && spansX && spansY
    case 'south':
      return hi(tz) && spansX && spansY
    case 'west':
      return lo(fx) && spansZ && spansY
    case 'east':
      return hi(tx) && spansZ && spansY
  }
}

// Default (plains) biome tints, as the game uses for item rendering.
const GRASS = '#7cbd6b'
const FOLIAGE = '#48b518'
const TINTS: Record<string, string> = {
  grass_block: GRASS,
  oak_leaves: FOLIAGE,
  jungle_leaves: FOLIAGE,
  acacia_leaves: FOLIAGE,
  dark_oak_leaves: FOLIAGE,
  mangrove_leaves: FOLIAGE,
  spruce_leaves: '#619961',
  birch_leaves: '#80a755',
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`Generating palette data for Minecraft ${MC_VERSION}`)
  const v = MC_VERSION
  const [blocks, registries, defs, models, atlasMap, atlasPng, lang, version, versions] = await Promise.all([
    json<BlockStates>(`${MCMETA}/${v}-summary/blocks/data.min.json`, `${v}-blocks.json`),
    json<Record<string, string[]>>(`${MCMETA}/${v}-summary/registries/data.min.json`, `${v}-registries.json`),
    json<Record<string, BlockDefinition>>(`${MCMETA}/${v}-summary/assets/block_definition/data.min.json`, `${v}-block_definition.json`),
    json<Record<string, ModelJson>>(`${MCMETA}/${v}-summary/assets/model/data.min.json`, `${v}-model.json`),
    json<Record<string, [number, number, number, number]>>(`${MCMETA}/${v}-atlas/all/data.min.json`, `${v}-atlas.json`),
    cached(`${MCMETA}/${v}-atlas/all/atlas.png`, `${v}-atlas.png`),
    json<Record<string, string>>(`${MCMETA}/${v}-assets-json/assets/minecraft/lang/en_us.json`, `${v}-en_us.json`),
    json<{ data_version: number }>(`${MCMETA}/${v}-summary/version.json`, `${v}-version.json`),
    json<{ id: string; type: string; data_version: number }[]>(`${MCMETA}/${v}-summary/versions/data.min.json`, `${v}-versions.json`),
  ])
  const itemIds = new Set(registries.item.map(strip))
  const png = PNG.sync.read(atlasPng)
  console.log(`  atlas ${png.width}x${png.height}, ${Object.keys(atlasMap).length} sprites`)

  // ---------- models ----------
  const flatCache = new Map<string, { textures: Record<string, string | { sprite: string }>; elements: Element[] } | null>()
  function flatModel(id: string): { textures: Record<string, string | { sprite: string }>; elements: Element[] } | null {
    const key = strip(id)
    if (flatCache.has(key)) return flatCache.get(key)!
    const m = models[key]
    if (!m) {
      flatCache.set(key, null)
      return null
    }
    const parent = m.parent ? flatModel(m.parent) : null
    const flat = {
      textures: { ...(parent?.textures ?? {}), ...(m.textures ?? {}) },
      elements: m.elements ?? parent?.elements ?? [],
    }
    flatCache.set(key, flat)
    return flat
  }
  function resolveTexture(textures: Record<string, string | { sprite: string }>, ref: string | undefined, depth = 0): string | null {
    if (!ref || depth > 10) return null
    if (ref.startsWith('#')) {
      const next = textures[ref.slice(1)]
      return resolveTexture(textures, typeof next === 'object' ? next.sprite : next, depth + 1)
    }
    return strip(ref)
  }

  function matchesWhen(when: When | undefined, props: Record<string, string>): boolean {
    if (!when) return true
    if (when.OR) return when.OR.some((w) => matchesWhen(w, props))
    if (when.AND) return when.AND.every((w) => matchesWhen(w, props))
    return Object.entries(when).every(([k, val]) => String(val).split('|').includes(props[k]))
  }
  function variantsForState(def: BlockDefinition, props: Record<string, string>): Variant[] {
    const out: Variant[] = []
    const pick = (entry: Variant | Variant[]) => (Array.isArray(entry) ? entry[0] : entry)
    if (def.variants) {
      for (const [key, entry] of Object.entries(def.variants)) {
        const conds = key === '' ? [] : key.split(',').map((kv) => kv.split('='))
        if (conds.every(([k, val]) => props[k] === val)) {
          out.push(pick(entry))
          break
        }
      }
    }
    if (def.multipart) for (const part of def.multipart) if (matchesWhen(part.when, props)) out.push(pick(part.apply))
    return out
  }

  // Blockstate rotations: x (about the X axis) first, then y (clockwise seen from above).
  const ROT_X: Record<Dir, Dir> = { up: 'north', north: 'down', down: 'south', south: 'up', east: 'east', west: 'west' }
  const ROT_Y: Record<Dir, Dir> = { north: 'east', east: 'south', south: 'west', west: 'north', up: 'up', down: 'down' }
  function rotateDir(dir: Dir, x = 0, y = 0): Dir {
    let d = dir
    for (let i = 0; i < ((x / 90) & 3); i++) d = ROT_X[d]
    for (let i = 0; i < ((y / 90) & 3); i++) d = ROT_Y[d]
    return d
  }

  // ---------- textures ----------
  /** Reads a sprite (all animation frames stacked) as RGBA rows of `w` pixels. */
  function sprite(tex: string): { w: number; h: number; data: Uint8ClampedArray } | null {
    const uv = atlasMap[tex]
    if (!uv) return null
    const [x0, y0, w, h] = uv
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      const src = ((y0 + y) * png.width + x0) * 4
      data.set(png.data.subarray(src, src + w * 4), y * w * 4)
    }
    return { w, h, data }
  }

  interface Layer {
    tex: string
    tint?: string
  }
  interface FaceStats {
    hex: string
    lab: Lab
    spread: number
    coverage: number
    opaque: boolean
    translucent: boolean
    cutout: boolean
    layers: Layer[]
  }

  /**
   * Composites the layers of one face (bottom first, alpha-over) at the base
   * texture's resolution, then measures it. Animated textures are averaged
   * over all their frames: that is how they look over time.
   */
  const faceCache = new Map<string, FaceStats | null>()
  function faceStats(layers: Layer[]): FaceStats | null {
    const key = JSON.stringify(layers)
    if (faceCache.has(key)) return faceCache.get(key)!
    const sprites = layers.map((l) => ({ l, s: sprite(l.tex) }))
    if (sprites.some((x) => !x.s)) {
      faceCache.set(key, null)
      return null
    }
    const base = sprites[0].s!
    const w = base.w
    const frames = Math.max(1, Math.floor(base.h / w))
    const h = frames * w
    let sr = 0
    let sg = 0
    let sb = 0
    let sa = 0
    let opaquePx = 0
    let clearPx = 0
    let partialPx = 0
    const pixels: [number, number, number, number][] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0
        let g = 0
        let b = 0
        let a = 0
        for (const { l, s } of sprites) {
          // Overlays may differ in resolution/frame count: sample proportionally, first frame.
          const sx = Math.floor((x * s!.w) / w)
          const sy = s === base ? y : Math.floor(((y % w) * s!.w) / w)
          const i = (sy * s!.w + sx) * 4
          let pr = s!.data[i]
          let pg = s!.data[i + 1]
          let pb = s!.data[i + 2]
          const pa = s!.data[i + 3] / 255
          if (l.tint) {
            const t = parseInt(l.tint.slice(1), 16)
            pr = (pr * ((t >> 16) & 255)) / 255
            pg = (pg * ((t >> 8) & 255)) / 255
            pb = (pb * (t & 255)) / 255
          }
          // alpha-over in sRGB, as the game's blending does
          r = pr * pa + r * (1 - pa)
          g = pg * pa + g * (1 - pa)
          b = pb * pa + b * (1 - pa)
          a = pa + a * (1 - pa)
        }
        if (a <= 0.001) {
          clearPx++
          continue
        }
        if (a >= 0.999) opaquePx++
        else partialPx++
        // un-premultiply for the colour of the visible material
        r /= a
        g /= a
        b /= a
        pixels.push([r, g, b, a])
        sr += SRGB_TO_LINEAR[Math.round(r)] * a
        sg += SRGB_TO_LINEAR[Math.round(g)] * a
        sb += SRGB_TO_LINEAR[Math.round(b)] * a
        sa += a
      }
    }
    const total = w * h
    if (sa === 0) {
      faceCache.set(key, null)
      return null
    }
    const lr = sr / sa
    const lg = sg / sa
    const lb = sb / sa
    const lab = linearRgbToOklab(lr, lg, lb)
    let spread = 0
    for (const [r, g, b, a] of pixels) {
      const p = linearRgbToOklab(SRGB_TO_LINEAR[Math.round(r)], SRGB_TO_LINEAR[Math.round(g)], SRGB_TO_LINEAR[Math.round(b)])
      spread += a * ((p[0] - lab[0]) ** 2 + (p[1] - lab[1]) ** 2 + (p[2] - lab[2]) ** 2)
    }
    spread = Math.sqrt(spread / sa)
    const stats: FaceStats = {
      hex: rgbToHex(linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)),
      lab,
      spread,
      coverage: (opaquePx + partialPx) / total,
      opaque: opaquePx === total,
      translucent: partialPx / total > 0.25,
      cutout: clearPx > 0,
      layers,
    }
    faceCache.set(key, stats)
    return stats
  }

  // ---------- blocks ----------
  interface Analysed {
    id: string
    name: string
    up: FaceStats
    down: FaceStats
    side: FaceStats
    /** All six faces are fully opaque. */
    opaque: boolean
    translucent: boolean
    cutout: boolean
    /** Texture signature used to fold look-alikes. */
    signature: string
  }
  const analysed = new Map<string, Analysed>()
  const shapeBlocks: { id: string; kind: ShapeKind; base: string; textures: Set<string> }[] = []
  const blockIds = Object.keys(blocks).map(strip).sort()

  for (const id of blockIds) {
    const [, defaults] = blocks[id] ?? blocks[`minecraft:${id}`]
    const def = defs[id]
    if (!def || EXCLUDE.has(id)) continue
    const variants = variantsForState(def, defaults)

    // Remember stairs/slabs/walls/fences to link them to their full block later.
    const shape = SHAPE_SUFFIXES.find(([suffix]) => id.endsWith(suffix))
    if (shape) {
      const textures = new Set<string>()
      for (const vnt of variants) {
        const flat = flatModel(vnt.model)
        if (!flat) continue
        for (const e of flat.elements) for (const f of Object.values(e.faces ?? {})) {
          const t = resolveTexture(flat.textures, f.texture)
          if (t) textures.add(t)
        }
      }
      shapeBlocks.push({ id, kind: shape[1], base: id.slice(0, -shape[0].length), textures })
      continue
    }

    // Collect the faces that cover a whole side of the block cube, per world
    // direction, in element order. Full-cube elements qualify, and so do the
    // single-face elements multipart blocks such as mushroom blocks are made of.
    const layersByDir: Record<Dir, Layer[]> = { up: [], down: [], north: [], south: [], east: [], west: [] }
    for (const vnt of variants) {
      const flat = flatModel(vnt.model)
      if (!flat) continue
      for (const e of flat.elements) {
        if (e.rotation) continue
        for (const dir of DIRS) {
          const face = e.faces?.[dir]
          if (!face || !coversBlockSide(e, dir)) continue
          const tex = resolveTexture(flat.textures, face.texture)
          if (!tex) continue
          const tinted = face.tintindex !== undefined && face.tintindex >= 0
          const layer: Layer = tinted && TINTS[id] ? { tex, tint: TINTS[id] } : { tex }
          layersByDir[rotateDir(dir, vnt.x, vnt.y)].push(layer)
        }
      }
    }
    if (DIRS.some((d) => layersByDir[d].length === 0)) continue

    const faces = Object.fromEntries(DIRS.map((d) => [d, faceStats(layersByDir[d])])) as Record<Dir, FaceStats | null>
    if (DIRS.some((d) => !faces[d])) continue
    // The most common side look (a furnace has one front and three plain sides).
    const sideCounts = new Map<string, { n: number; f: FaceStats }>()
    for (const d of SIDES) {
      const k = JSON.stringify(faces[d]!.layers)
      const prev = sideCounts.get(k)
      sideCounts.set(k, { n: (prev?.n ?? 0) + 1, f: faces[d]! })
    }
    const side = [...sideCounts.values()].sort((a, b) => b.n - a.n)[0].f
    const all = DIRS.map((d) => faces[d]!)
    const name = lang[`block.minecraft.${id}`] ?? id
    analysed.set(id, {
      id,
      name,
      up: faces.up!,
      down: faces.down!,
      side,
      opaque: all.every((f) => f.opaque),
      translucent: all.some((f) => f.translucent),
      cutout: all.some((f) => f.cutout),
      signature: DIRS.map((d) => JSON.stringify(faces[d]!.layers)).join('|'),
    })
  }
  console.log(`  ${analysed.size} full-cube blocks, ${shapeBlocks.length} stair/slab/wall/fence blocks`)

  // ---------- versions ----------
  const releases = versions.filter((x) => x.type === 'release')
  const dataVersionOf = (id: string) => releases.find((r) => r.id === id)?.data_version
  const checkpoints = [...VERSION_CHECKPOINTS.filter((c) => c !== MC_VERSION && dataVersionOf(c) !== undefined), MC_VERSION]
  const blockSets: Set<string>[] = []
  for (const cp of checkpoints) {
    const reg = cp === MC_VERSION ? registries : await json<Record<string, string[]>>(`${MCMETA}/${cp}-summary/registries/data.min.json`, `${cp}-registries.json`)
    blockSets.push(new Set(reg.block.map(strip)))
  }
  const sinceIndex = (id: string) => {
    let i = blockSets.findIndex((s) => s.has(id))
    if (i < 0) i = checkpoints.length - 1
    for (const [pattern, release] of EXPERIMENTAL_UNTIL) {
      if (pattern.test(id)) i = Math.max(i, checkpoints.indexOf(release))
    }
    return i
  }

  // ---------- fold look-alikes ----------
  const bySignature = new Map<string, Analysed[]>()
  for (const b of analysed.values()) {
    const list = bySignature.get(b.signature) ?? []
    list.push(b)
    bySignature.set(b.signature, list)
  }
  const aliasOf = new Map<string, string>()
  for (const group of bySignature.values()) {
    if (group.length < 2) continue
    // Prefer the survival-obtainable, plain (un-waxed, un-infested) id
    const rank = (b: Analysed) => (flagsFor(b.id).creative ? 100 : 0) + (b.id.startsWith('waxed_') ? 10 : 0) + b.id.length / 100
    group.sort((a, b) => rank(a) - rank(b))
    for (const b of group.slice(1)) aliasOf.set(b.id, group[0].id)
  }

  // ---------- link shapes ----------
  const shapesOf = new Map<string, Partial<Record<ShapeKind, string>>>()
  const unlinked: string[] = []
  for (const s of shapeBlocks) {
    const base = s.base
    const candidates = [
      base,
      `${base}s`,
      `${base}_block`,
      `${base}_planks`,
      base.replace(/brick$/, 'bricks'),
      base.replace(/tile$/, 'tiles'),
    ]
    let target = candidates.find((c) => analysed.has(c) && !aliasOf.has(c))
    if (!target) {
      // Fall back to a full block that uses the same texture on its sides
      target = [...analysed.values()].find((b) => !aliasOf.has(b.id) && b.side.layers.length === 1 && s.textures.has(b.side.layers[0].tex))?.id
    }
    if (!target) {
      unlinked.push(s.id)
      continue
    }
    const canonical = aliasOf.get(target) ?? target
    const entry = shapesOf.get(canonical) ?? {}
    // Keep the un-waxed variant when both exist
    if (!entry[s.kind] || (entry[s.kind]!.startsWith('waxed_') && !s.id.startsWith('waxed_'))) entry[s.kind] = s.id
    shapesOf.set(canonical, entry)
  }
  if (unlinked.length) console.log(`  shapes without a full block: ${unlinked.join(', ')}`)

  // ---------- output ----------
  const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d
  const faceOut = (f: FaceStats) => [
    f.hex,
    round(f.lab[0]),
    round(f.lab[1]),
    round(f.lab[2]),
    round(f.spread),
    f.layers.map((l) => (l.tint ? [l.tex, l.tint] : l.tex)),
  ]
  const out: Record<string, unknown>[] = []
  const uncategorised: string[] = []
  for (const b of analysed.values()) {
    if (aliasOf.has(b.id)) continue
    const category = categorize(b.id)
    if (!category) uncategorised.push(b.id)
    const fl = flagsFor(b.id)
    let flags = 0
    if (fl.gravity) flags |= 1
    if (fl.light) flags |= 2
    if (!b.opaque || b.translucent || b.cutout) flags |= 4
    if (fl.creative || (!itemIds.has(b.id) && !PLACED_FROM_OTHER_ITEM.has(b.id))) flags |= 8
    if (TINTS[b.id]) flags |= 16
    const upKey = JSON.stringify(b.up.layers)
    const sideKey = JSON.stringify(b.side.layers)
    const downKey = JSON.stringify(b.down.layers)
    if (upKey !== sideKey || downKey !== sideKey) flags |= 32
    const aliases = [...aliasOf.entries()].filter(([, to]) => to === b.id).map(([from]) => from)
    const rec: Record<string, unknown> = {
      id: b.id,
      n: b.name,
      c: category ?? 'misc',
      f: flags,
      v: Math.min(sinceIndex(b.id), ...aliases.map(sinceIndex).concat(sinceIndex(b.id))),
      u: faceOut(b.up),
    }
    if (sideKey !== upKey) rec.s = faceOut(b.side)
    if (downKey !== upKey) rec.d = faceOut(b.down)
    const shapes = shapesOf.get(b.id)
    if (shapes) rec.x = shapes
    if (aliases.length) rec.a = aliases.sort()
    out.push(rec)
  }
  if (uncategorised.length) console.log(`  uncategorised: ${uncategorised.join(', ')}`)

  if (LIST) {
    for (const r of out) console.log(`${r.c}\t${r.id}\t${r.f}\t${checkpoints[r.v as number]}\t${JSON.stringify(r.x ?? {})}`)
    return
  }

  const file = {
    meta: {
      minecraftVersion: MC_VERSION,
      dataVersion: version.data_version,
      generatedFrom: `misode/mcmeta@${MC_VERSION}`,
    },
    versions: checkpoints.map((id) => [id, dataVersionOf(id) ?? version.data_version]),
    blocks: out,
  }
  await mkdir(OUT, { recursive: true })
  await writeFile(join(OUT, 'blocks.json'), JSON.stringify(file) + '\n')
  console.log(`  wrote ${out.length} blocks (${aliasOf.size} look-alikes folded) across ${checkpoints.length} versions`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
