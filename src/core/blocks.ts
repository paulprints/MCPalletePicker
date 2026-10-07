/**
 * The block catalogue: every full-cube block with its per-face colour
 * statistics, generated from Mojang's assets by scripts/generate-data.ts.
 */
import data from '../data/blocks.json'
import type { Lab } from './color'

export type ShapeKind = 'stairs' | 'slab' | 'wall' | 'fence'

export type Category =
  | 'wood'
  | 'stone'
  | 'terracotta'
  | 'glazed'
  | 'concrete'
  | 'wool'
  | 'copper'
  | 'earth'
  | 'plant'
  | 'nether'
  | 'end'
  | 'ocean'
  | 'mineral'
  | 'ore'
  | 'glass'
  | 'utility'

export interface CategoryInfo {
  id: Category
  label: string
  /** Included in palettes unless the user turns it off. */
  defaultOn: boolean
  hint: string
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'wood', label: 'Wood', defaultOn: true, hint: 'Planks, logs, wood and stripped variants of every tree, bamboo' },
  { id: 'stone', label: 'Stone & masonry', defaultOn: true, hint: 'Stone, cobblestone, bricks, deepslate, tuff, sandstone, mud bricks…' },
  { id: 'terracotta', label: 'Terracotta', defaultOn: true, hint: 'Plain and dyed terracotta' },
  { id: 'concrete', label: 'Concrete', defaultOn: true, hint: 'Concrete and concrete powder' },
  { id: 'wool', label: 'Wool', defaultOn: true, hint: 'All 16 wool colours' },
  { id: 'copper', label: 'Copper', defaultOn: true, hint: 'Copper blocks, cut, chiseled, grates and bulbs in every oxidation stage' },
  { id: 'earth', label: 'Earth, sand & ice', defaultOn: true, hint: 'Dirt, grass, mud, clay, sand, gravel, snow, ice, moss…' },
  { id: 'plant', label: 'Plants & leaves', defaultOn: true, hint: 'Leaves, hay, pumpkins, melons, mushroom blocks, froglights' },
  { id: 'nether', label: 'Nether', defaultOn: true, hint: 'Netherrack, nether bricks, blackstone, basalt, quartz, nylium…' },
  { id: 'end', label: 'End', defaultOn: true, hint: 'End stone and purpur' },
  { id: 'ocean', label: 'Ocean', defaultOn: true, hint: 'Prismarine, sea lanterns, coral blocks, sponges, dried kelp' },
  { id: 'mineral', label: 'Metal & gem blocks', defaultOn: true, hint: 'Iron, gold, diamond, emerald, lapis, amethyst, raw ore blocks…' },
  { id: 'glass', label: 'Glass', defaultOn: true, hint: 'Clear, stained and tinted glass (also needs “See-through blocks”)' },
  { id: 'glazed', label: 'Glazed terracotta', defaultOn: false, hint: 'Bold patterned tiles' },
  { id: 'ore', label: 'Ores', defaultOn: false, hint: 'Ore blocks and ancient debris' },
  { id: 'utility', label: 'Functional blocks', defaultOn: false, hint: 'Furnaces, crafting tables, bookshelves, note blocks, TNT…' },
]

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]))

export const Flag = {
  Gravity: 1,
  Light: 2,
  SeeThrough: 4,
  Creative: 8,
  BiomeTint: 16,
  Directional: 32,
} as const

export interface Layer {
  /** Texture id in the block atlas, e.g. `block/oak_planks`. */
  tex: string
  /** Multiply colour (`#rrggbb`) for biome-tinted layers. */
  tint?: string
}

export interface Face {
  hex: string
  lab: Lab
  /** RMS OKLab distance of the texture's pixels from its mean: 0 = flat colour. */
  spread: number
  layers: Layer[]
}

export interface BlockInfo {
  id: string
  name: string
  category: Category
  flags: number
  /** Index into {@link VERSIONS} of the first listed release that has this block. */
  since: number
  top: Face
  side: Face
  bottom: Face
  /** Stair, slab, wall and fence blocks made from this block. */
  shapes: Partial<Record<ShapeKind, string>>
  /** Blocks that look identical and were folded into this one (e.g. waxed copper). */
  aliases: string[]
}

export interface McVersion {
  id: string
  dataVersion: number
}

type RawFace = [string, number, number, number, number, (string | [string, string])[]]
interface RawBlock {
  id: string
  n: string
  c: string
  f: number
  v: number
  u: RawFace
  s?: RawFace
  d?: RawFace
  x?: Partial<Record<ShapeKind, string>>
  a?: string[]
}

function face(raw: RawFace): Face {
  return {
    hex: raw[0],
    lab: [raw[1], raw[2], raw[3]],
    spread: raw[4],
    layers: raw[5].map((l) => (typeof l === 'string' ? { tex: l } : { tex: l[0], tint: l[1] })),
  }
}

export const DATA_META = data.meta as { minecraftVersion: string; dataVersion: number; generatedFrom: string }

export const VERSIONS: McVersion[] = (data.versions as [string, number][]).map(([id, dataVersion]) => ({ id, dataVersion }))
export const LATEST_VERSION = VERSIONS.length - 1

export const BLOCKS: BlockInfo[] = (data.blocks as RawBlock[]).map((b) => {
  const top = face(b.u)
  const side = b.s ? face(b.s) : top
  return {
    id: b.id,
    name: b.n,
    category: b.c as Category,
    flags: b.f,
    since: b.v,
    top,
    side,
    bottom: b.d ? face(b.d) : top,
    shapes: b.x ?? {},
    aliases: b.a ?? [],
  }
})

export const BLOCK_BY_ID: ReadonlyMap<string, BlockInfo> = (() => {
  const m = new Map<string, BlockInfo>()
  for (const b of BLOCKS) m.set(b.id, b)
  // Folded look-alikes resolve to the block that represents them
  for (const b of BLOCKS) for (const a of b.aliases) if (!m.has(a)) m.set(a, b)
  return m
})()

export function getBlock(id: string): BlockInfo | undefined {
  return BLOCK_BY_ID.get(id.startsWith('minecraft:') ? id.slice(10) : id)
}

export const hasFlag = (b: BlockInfo, flag: number) => (b.flags & flag) !== 0

/** Which face the palette is matched against. */
export type Surface = 'side' | 'top' | 'all'

/** Colour of a block as seen on the chosen surface. */
export function surfaceFace(b: BlockInfo, surface: Surface): Face {
  if (surface === 'top') return b.top
  if (surface === 'side' || b.top === b.side) return b.side
  return allFaces(b)
}

const allCache = new WeakMap<BlockInfo, Face>()
/** The six faces averaged (4 sides, top, bottom), for blocks seen from every angle. */
function allFaces(b: BlockInfo): Face {
  let f = allCache.get(b)
  if (!f) {
    const w = [
      [b.side, 4],
      [b.top, 1],
      [b.bottom, 1],
    ] as const
    const lab: Lab = [0, 0, 0]
    let spread = 0
    for (const [fc, n] of w) {
      for (let i = 0; i < 3; i++) lab[i] += (fc.lab[i] * n) / 6
      spread += (fc.spread * n) / 6
    }
    f = { hex: b.side.hex, lab, spread, layers: b.side.layers }
    allCache.set(b, f)
  }
  return f
}

/** Human labels for the shape variants a block has, in display order. */
export function shapeList(b: BlockInfo): ShapeKind[] {
  return (['stairs', 'slab', 'wall', 'fence'] as ShapeKind[]).filter((k) => b.shapes[k])
}

/** Text search over names and ids ("stone brick", "oak_log"…). */
export function searchBlocks(query: string, pool: readonly BlockInfo[] = BLOCKS): BlockInfo[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...pool]
  const words = q.split(/[\s_]+/).filter(Boolean)
  const scored: [BlockInfo, number][] = []
  for (const b of pool) {
    const hay = `${b.name.toLowerCase()} ${b.id} ${b.aliases.join(' ')}`
    if (!words.every((w) => hay.includes(w))) continue
    const name = b.name.toLowerCase()
    const score = (name === q || b.id === q ? 0 : name.startsWith(q) || b.id.startsWith(q) ? 1 : 2) + b.name.length / 1000
    scored.push([b, score])
  }
  return scored.sort((a, b) => a[1] - b[1]).map(([b]) => b)
}
