/**
 * Palette state transitions, kept free of React and the DOM so they can be
 * unit tested: extracting slots from an image, re-matching blocks after a
 * setting changes, growing/shrinking the palette, moving markers, sorting.
 *
 * A slot is one palette entry: an image colour (its *target*) and the block
 * standing in for it. *Locked* slots survive re-extraction untouched; *manual*
 * slots keep the block the user picked when settings change.
 */
import { getBlock, surfaceFace, type BlockInfo, type Surface } from './blocks'
import { hue, type Lab } from './color'
import type { PaletteEntry } from './exports'
import { extractPalette, measureColors, sampleAt, type LabImage } from './extract'
import { assignBlocks, type MatchOptions } from './match'

export interface Slot {
  key: string
  target: Lab
  spread: number
  coverage: number
  marker: { x: number; y: number } | null
  blockId: string | null
  locked: boolean
  manual: boolean
}

export interface ExtractSettings {
  count: number
  variety: number
  vibrancy: number
}

export const MIN_SLOTS = 1
export const MAX_SLOTS = 12

let keyCounter = 0
export const newSlotKey = () => `s${++keyCounter}`

const isFixed = (s: Slot) => (s.locked || s.manual) && !!s.blockId

/** Re-measures each slot's share of the image (no-op without an image). */
export function withCoverage(img: LabImage | null, slots: Slot[]): Slot[] {
  if (!img || !slots.length) return slots
  const { coverage } = measureColors(img, slots.map((s) => s.target))
  return slots.map((s, i) => ({ ...s, coverage: coverage[i] }))
}

/** Chooses blocks for every slot that isn't locked or hand-picked. */
export function withBlocks(slots: Slot[], candidates: readonly BlockInfo[], match: MatchOptions, opts: { seed?: number; shuffle?: number } = {}): Slot[] {
  const ids = assignBlocks(
    slots.map((s) => ({ target: s.target, spread: s.spread, weight: s.coverage, fixed: isFixed(s) ? s.blockId : null })),
    candidates,
    { ...match, seed: opts.seed, shuffle: opts.shuffle },
  )
  return slots.map((s, i) => (isFixed(s) ? s : { ...s, blockId: ids[i] }))
}

/** A fresh palette from an image, keeping locked slots. */
export function extractSlots(
  img: LabImage,
  current: Slot[],
  settings: ExtractSettings,
  candidates: readonly BlockInfo[],
  match: MatchOptions,
  seed = 1,
): Slot[] {
  const locked = current.filter((s) => s.locked)
  const need = Math.max(0, settings.count - locked.length)
  const picks = need
    ? extractPalette(img, { count: need, variety: settings.variety, vibrancy: settings.vibrancy, keep: locked.map((s) => s.target), seed })
    : []
  const fresh: Slot[] = picks.map((p) => ({
    key: newSlotKey(),
    target: p.lab,
    spread: p.spread,
    coverage: p.coverage,
    marker: p.marker,
    blockId: null,
    locked: false,
    manual: false,
  }))
  return withBlocks(withCoverage(img, [...locked, ...fresh]), candidates, match, { seed })
}

/**
 * Grows or shrinks the palette without disturbing the slots that stay:
 * shrinking drops the smallest unlocked slots, growing extracts colours that
 * are new relative to the current ones.
 */
export function resizeSlots(
  img: LabImage | null,
  current: Slot[],
  settings: ExtractSettings,
  candidates: readonly BlockInfo[],
  match: MatchOptions,
  seed = 1,
): Slot[] {
  const count = Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, settings.count))
  if (count === current.length) return current
  if (count < current.length) {
    const removable = current
      .filter((s) => !s.locked)
      .sort((a, b) => a.coverage - b.coverage)
      .slice(0, current.length - count)
      .map((s) => s.key)
    const drop = new Set(removable)
    return withCoverage(img, current.filter((s) => !drop.has(s.key)))
  }
  if (!img) return current
  const picks = extractPalette(img, {
    count: count - current.length,
    variety: settings.variety,
    vibrancy: settings.vibrancy,
    keep: current.map((s) => s.target),
    seed,
  })
  const added: Slot[] = picks.map((p) => ({
    key: newSlotKey(),
    target: p.lab,
    spread: p.spread,
    coverage: p.coverage,
    marker: p.marker,
    blockId: null,
    locked: false,
    manual: false,
  }))
  return withBlocks(withCoverage(img, [...current, ...added]), candidates, match, { seed })
}

/** Re-samples a slot's colour where its marker was moved to, and re-matches it. */
export function moveSlotMarker(
  img: LabImage,
  slots: Slot[],
  key: string,
  x: number,
  y: number,
  candidates: readonly BlockInfo[],
  match: MatchOptions,
  remeasure: boolean,
): Slot[] {
  const sample = sampleAt(img, x, y)
  if (!sample) return slots
  // A moved marker asks for a new colour, so the slot is matched afresh
  const moved = slots.map((s) => (s.key === key ? { ...s, target: sample.lab, spread: sample.spread, marker: { x, y }, manual: false, locked: false } : s))
  const measured = remeasure ? withCoverage(img, moved) : moved
  return withBlocks(measured, candidates, match)
}

/** Adds a slot for the colour at a point of the image (eyedropper). */
export function addSlotAt(img: LabImage, slots: Slot[], x: number, y: number, candidates: readonly BlockInfo[], match: MatchOptions): { slots: Slot[]; key: string } | null {
  if (slots.length >= MAX_SLOTS) return null
  const sample = sampleAt(img, x, y)
  if (!sample) return null
  const key = newSlotKey()
  const slot: Slot = { key, target: sample.lab, spread: sample.spread, coverage: 0, marker: { x, y }, blockId: null, locked: false, manual: false }
  return { slots: withBlocks(withCoverage(img, [...slots, slot]), candidates, match), key }
}

/** Adds a slot for a block the user picked directly. */
export function addSlotForBlock(img: LabImage | null, slots: Slot[], block: BlockInfo, surface: Surface): { slots: Slot[]; key: string } | null {
  if (slots.length >= MAX_SLOTS) return null
  const face = surfaceFace(block, surface)
  const key = newSlotKey()
  const slot: Slot = { key, target: face.lab, spread: face.spread, coverage: img ? 0 : 1 / (slots.length + 1), marker: null, blockId: block.id, locked: false, manual: true }
  const next = img ? withCoverage(img, [...slots, slot]) : rebalance([...slots, slot])
  return { slots: next, key }
}

/** Without an image, shares are split evenly. */
function rebalance(slots: Slot[]): Slot[] {
  return slots.map((s) => ({ ...s, coverage: 1 / slots.length }))
}

export function removeSlot(img: LabImage | null, slots: Slot[], key: string): Slot[] {
  const rest = slots.filter((s) => s.key !== key)
  return img ? withCoverage(img, rest) : rebalance(rest)
}

/** Slots from a shared link: hand-picked blocks, no markers. */
export function slotsFromEntries(entries: PaletteEntry[]): Slot[] {
  return entries.slice(0, MAX_SLOTS).map((e) => {
    const b = getBlock(e.blockId)
    return {
      key: newSlotKey(),
      target: e.target,
      spread: b?.side.spread ?? 0.03,
      coverage: e.coverage,
      marker: null,
      blockId: b?.id ?? null,
      locked: false,
      manual: true,
    }
  })
}

export type SortMode = 'coverage' | 'lightness' | 'hue'

export function sortSlots(slots: Slot[], mode: SortMode, surface: Surface): Slot[] {
  const lab = (s: Slot) => {
    const b = s.blockId ? getBlock(s.blockId) : undefined
    return b ? surfaceFace(b, surface).lab : s.target
  }
  const sorted = [...slots]
  if (mode === 'coverage') sorted.sort((a, b) => b.coverage - a.coverage)
  else if (mode === 'lightness') sorted.sort((a, b) => lab(a)[0] - lab(b)[0])
  else {
    // Greys last, the rest around the colour wheel starting at red
    const key = (s: Slot) => {
      const c = lab(s)
      const chroma = Math.hypot(c[1], c[2])
      return chroma < 0.03 ? 1000 + c[0] : (hue(c) + 340) % 360
    }
    sorted.sort((a, b) => key(a) - key(b))
  }
  return sorted
}

/** The palette as export entries, in display order, skipping empty slots. */
export function toEntries(slots: Slot[]): PaletteEntry[] {
  return slots.filter((s) => s.blockId).map((s) => ({ blockId: s.blockId!, target: s.target, coverage: s.coverage }))
}
