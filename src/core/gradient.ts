/**
 * Block gradients: a smooth run of blocks from one block to another, for
 * fading walls, roofs and terrain.
 *
 * The two end colours are interpolated in OKLab (so the steps look evenly
 * spaced) and each step takes the closest block not already in the run.
 */
import { surfaceFace, type BlockInfo, type Surface } from './blocks'
import { deltaE, mixLab } from './color'

export interface GradientStep {
  block: BlockInfo
  /** Position along the run, 0–1. */
  t: number
  /** Distance of the block from the ideal colour at this step. */
  deltaE: number
}

export interface GradientOptions {
  /** Total blocks including both ends (2–24). */
  steps: number
  surface: Surface
  /** Let a block appear more than once (otherwise each block is used once). */
  allowRepeats?: boolean
}

export function buildGradient(from: BlockInfo, to: BlockInfo, candidates: readonly BlockInfo[], opts: GradientOptions): GradientStep[] {
  const steps = Math.max(2, Math.min(24, Math.round(opts.steps)))
  const a = surfaceFace(from, opts.surface)
  const b = surfaceFace(to, opts.surface)
  const used = new Set([from.id, to.id])
  const out: GradientStep[] = [{ block: from, t: 0, deltaE: 0 }]
  for (let i = 1; i < steps - 1; i++) {
    const t = i / (steps - 1)
    const target = mixLab(a.lab, b.lab, t)
    const spread = a.spread + (b.spread - a.spread) * t
    let best: BlockInfo | null = null
    let bestCost = Infinity
    let bestDE = 0
    for (const c of candidates) {
      if (!opts.allowRepeats && used.has(c.id)) continue
      const f = surfaceFace(c, opts.surface)
      const dE = deltaE(target, f.lab)
      const cost = dE + 0.25 * Math.abs(spread - f.spread)
      if (cost < bestCost) {
        bestCost = cost
        best = c
        bestDE = dE
      }
    }
    if (!best) break
    used.add(best.id)
    out.push({ block: best, t, deltaE: bestDE })
  }
  out.push({ block: to, t: 1, deltaE: 0 })
  return dedupeNeighbours(out)
}

/** With repeats allowed, collapse runs of the same block into one step. */
function dedupeNeighbours(steps: GradientStep[]): GradientStep[] {
  return steps.filter((s, i) => i === 0 || s.block.id !== steps[i - 1].block.id)
}

/** The palette's darkest and lightest blocks: a natural default for a gradient. */
export function gradientEnds(blocks: readonly BlockInfo[], surface: Surface): [BlockInfo, BlockInfo] | null {
  if (blocks.length < 2) return null
  const sorted = [...blocks].sort((x, y) => surfaceFace(x, surface).lab[0] - surfaceFace(y, surface).lab[0])
  return [sorted[0], sorted[sorted.length - 1]]
}
