/**
 * Block matching: which Minecraft block best stands in for a colour.
 *
 * A block's colour is the linear-light average of its texture (what it looks
 * like from a few blocks away), compared in OKLab. Two optional nudges:
 *  - texture: a smooth area of the image prefers smooth blocks (concrete),
 *    a busy one prefers busy blocks (cobblestone, leaves),
 *  - shapes: blocks that come with stairs and slabs get a small bonus, since a
 *    build needs those.
 */
import { BLOCKS, CATEGORIES, Flag, LATEST_VERSION, shapeList, surfaceFace, type BlockInfo, type Category, type Surface } from './blocks'
import { deltaE, type Lab } from './color'
import { mulberry32 } from './random'

export interface BlockFilter {
  /** Category ids to include. */
  categories: Category[]
  /** Leave out blocks survival players can't get (bedrock, command blocks…). */
  survivalOnly: boolean
  /** Sand, gravel, concrete powder. */
  allowGravity: boolean
  /** Glowstone, sea lanterns, froglights… */
  allowLight: boolean
  /** Glass, ice, leaves, slime, grates. */
  allowSeeThrough: boolean
  /** Index into VERSIONS: hide blocks added after this release. */
  version: number
  /** Block ids the user never wants to see. */
  excluded: string[]
}

export const DEFAULT_FILTER: BlockFilter = {
  categories: CATEGORIES.filter((c) => c.defaultOn).map((c) => c.id),
  survivalOnly: true,
  allowGravity: true,
  allowLight: true,
  allowSeeThrough: false,
  version: LATEST_VERSION,
  excluded: [],
}

export function isAllowed(b: BlockInfo, f: BlockFilter, categories = new Set(f.categories), excluded = new Set(f.excluded)): boolean {
  if (!categories.has(b.category)) return false
  if (excluded.has(b.id)) return false
  if (b.since > f.version) return false
  if (f.survivalOnly && b.flags & Flag.Creative) return false
  if (!f.allowGravity && b.flags & Flag.Gravity) return false
  if (!f.allowLight && b.flags & Flag.Light) return false
  if (!f.allowSeeThrough && b.flags & Flag.SeeThrough) return false
  return true
}

/** The blocks a palette may use under a filter. */
export function allowedBlocks(f: BlockFilter, pool: readonly BlockInfo[] = BLOCKS): BlockInfo[] {
  const categories = new Set(f.categories)
  const excluded = new Set(f.excluded)
  return pool.filter((b) => isAllowed(b, f, categories, excluded))
}

export interface MatchOptions {
  surface: Surface
  /** 0–1: how much texture busyness should follow the image. */
  textureWeight: number
  /** Favour blocks that have stair and slab variants. */
  preferShapes: boolean
}

export const DEFAULT_MATCH: MatchOptions = { surface: 'side', textureWeight: 0.3, preferShapes: true }

/**
 * Weight of hue and chroma differences relative to lightness when ranking.
 * People judge a palette by its hues first: a dusty blue should become the
 * closest bluish block, not a grey that happens to be a hair closer in ΔE.
 */
export const CHROMA_EMPHASIS = 1.4

/** OKLab distance with the a/b axes scaled by {@link CHROMA_EMPHASIS}. */
export function matchDistance(a: Lab, b: Lab): number {
  const dL = a[0] - b[0]
  const da = (a[1] - b[1]) * CHROMA_EMPHASIS
  const db = (a[2] - b[2]) * CHROMA_EMPHASIS
  return Math.sqrt(dL * dL + da * da + db * db)
}

/** Colour distance plus the texture and shape nudges. Lower is better. */
export function blockCost(target: Lab, targetSpread: number, b: BlockInfo, opts: MatchOptions): number {
  const face = surfaceFace(b, opts.surface)
  let cost = matchDistance(target, face.lab)
  if (opts.textureWeight > 0) cost += opts.textureWeight * Math.abs(targetSpread - face.spread)
  if (opts.preferShapes && !b.shapes.stairs && !b.shapes.slab) cost += 0.008
  return cost
}

export interface Ranked {
  block: BlockInfo
  cost: number
  /** Pure colour difference (ΔE_OK) between the target and the block. */
  deltaE: number
}

/** Candidates sorted best-first. */
export function rankBlocks(target: Lab, spread: number, candidates: readonly BlockInfo[], opts: MatchOptions, limit = Infinity): Ranked[] {
  const out: Ranked[] = candidates.map((block) => ({
    block,
    cost: blockCost(target, spread, block, opts),
    deltaE: deltaE(target, surfaceFace(block, opts.surface).lab),
  }))
  out.sort((a, b) => a.cost - b.cost || a.block.id.localeCompare(b.block.id))
  return Number.isFinite(limit) ? out.slice(0, limit) : out
}

export interface SlotRequest {
  target: Lab
  spread: number
  /** Share of the image; bigger slots choose first. */
  weight: number
  /** A block the user chose or locked; it is kept as is. */
  fixed?: string | null
}

export interface AssignOptions extends MatchOptions {
  /**
   * 0 picks the best block for every slot; higher values pick randomly among
   * the few best (weighted towards the best) for a "shuffle" that stays close.
   */
  shuffle?: number
  seed?: number
}

/**
 * Chooses one block per slot so that no two slots share a block. Fixed slots
 * keep their block; the rest choose in order of image coverage.
 */
export function assignBlocks(slots: SlotRequest[], candidates: readonly BlockInfo[], opts: AssignOptions): (string | null)[] {
  const result: (string | null)[] = slots.map((s) => s.fixed ?? null)
  const used = new Set(result.filter((x): x is string => !!x))
  const order = slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !s.fixed)
    .sort((a, b) => b.s.weight - a.s.weight || a.i - b.i)
  const rand = mulberry32(opts.seed ?? 1)
  for (const { s, i } of order) {
    const ranked = rankBlocks(s.target, s.spread, candidates, opts).filter((r) => !used.has(r.block.id))
    if (!ranked.length) continue
    let choice = ranked[0]
    if (opts.shuffle && ranked.length > 1) {
      // Draw among blocks no more than a little worse than the best match
      const tolerance = 0.015 + 0.05 * opts.shuffle
      const near = ranked.filter((r) => r.cost <= ranked[0].cost + tolerance).slice(0, 6)
      const weights = near.map((r) => 1 / (0.01 + r.cost - ranked[0].cost))
      let x = rand() * weights.reduce((a, b) => a + b, 0)
      choice = near.find((_, j) => (x -= weights[j]) < 0) ?? near[0]
    }
    result[i] = choice.block.id
    used.add(choice.block.id)
  }
  return result
}

export type MatchQuality = 'excellent' | 'good' | 'fair' | 'rough'

/** Thresholds in ΔE_OK; ~0.02 is a just-noticeable difference. */
export function matchQuality(dE: number): MatchQuality {
  if (dE < 0.035) return 'excellent'
  if (dE < 0.065) return 'good'
  if (dE < 0.11) return 'fair'
  return 'rough'
}

export const QUALITY_LABEL: Record<MatchQuality, string> = {
  excellent: 'Excellent match',
  good: 'Good match',
  fair: 'Fair match',
  rough: 'Loose match',
}

/** Short description of the shapes a block comes in, e.g. "stairs · slab · wall". */
export function shapeSummary(b: BlockInfo): string {
  return shapeList(b).join(' · ')
}
