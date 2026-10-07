import { describe, expect, it } from 'vitest'
import { getBlock } from '../blocks'
import { deltaE, rgbToOklab } from '../color'
import { decodeShare, encodeShare } from '../exports'
import { extractPalette, toLabImage } from '../extract'
import { allowedBlocks, DEFAULT_FILTER, DEFAULT_MATCH } from '../match'
import {
  addSlotAt,
  addSlotForBlock,
  extractSlots,
  MAX_SLOTS,
  moveSlotMarker,
  removeSlot,
  resizeSlots,
  slotsFromEntries,
  sortSlots,
  toEntries,
  withBlocks,
  type Slot,
} from '../palette'
import { makeImage } from './helpers'

const candidates = allowedBlocks(DEFAULT_FILTER)
const settings = { count: 4, variety: 0.5, vibrancy: 0.5 }

// Four flat concrete-coloured stripes: white 40%, red 30%, blue 20%, lime 10%
const COLORS: [number, number, number][] = [
  [207, 213, 214],
  [142, 33, 33],
  [45, 47, 143],
  [94, 169, 25],
]
const img = toLabImage(makeImage(100, 40, (x) => COLORS[x < 40 ? 0 : x < 70 ? 1 : x < 90 ? 2 : 3]))
const ids = (slots: Slot[]) => slots.map((s) => s.blockId)

describe('extractSlots', () => {
  it('matches each image colour to a different block', () => {
    const slots = extractSlots(img, [], settings, candidates, DEFAULT_MATCH)
    expect(ids(slots)).toEqual(['white_concrete', 'red_concrete', 'blue_concrete', 'lime_concrete'])
    expect(slots.map((s) => Math.round(s.coverage * 100))).toEqual([40, 30, 20, 10])
    expect(new Set(slots.map((s) => s.key)).size).toBe(4)
  })

  it('keeps locked slots exactly as they are', () => {
    const first = extractSlots(img, [], settings, candidates, DEFAULT_MATCH)
    const locked = { ...first[1], locked: true, blockId: 'nether_bricks' }
    const again = extractSlots(img, [first[0], locked], settings, candidates, DEFAULT_MATCH, 7)
    expect(again).toHaveLength(4)
    expect(again.find((s) => s.key === locked.key)).toMatchObject({ blockId: 'nether_bricks', locked: true })
    // The locked colour (red) is not extracted a second time
    expect(again.filter((s) => deltaE(s.target, rgbToOklab(...COLORS[1])) < 0.05)).toHaveLength(1)
  })
})

describe('marker placement', () => {
  it('keeps markers apart', () => {
    const picks = extractPalette(img, { count: 4, variety: 0.5, vibrancy: 0.5 })
    const pts = picks.map((p) => p.marker!)
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i].x - pts[j].x, (pts[i].y - pts[j].y) * 0.4)).toBeGreaterThan(0.05)
    }
  })
})

describe('resizeSlots', () => {
  const base = extractSlots(img, [], { ...settings, count: 2 }, candidates, DEFAULT_MATCH)

  it('grows without changing the existing slots', () => {
    const grown = resizeSlots(img, base, { ...settings, count: 4 }, candidates, DEFAULT_MATCH)
    expect(grown).toHaveLength(4)
    expect(grown.slice(0, 2).map((s) => s.key)).toEqual(base.map((s) => s.key))
    expect(ids(grown).slice(0, 2)).toEqual(ids(base))
  })

  it('shrinks by dropping the smallest unlocked slots', () => {
    const four = extractSlots(img, [], settings, candidates, DEFAULT_MATCH)
    const lockedSmallest = four.map((s, i) => (i === 3 ? { ...s, locked: true } : s))
    const two = resizeSlots(img, lockedSmallest, { ...settings, count: 2 }, candidates, DEFAULT_MATCH)
    expect(ids(two)).toEqual(['white_concrete', 'lime_concrete'])
  })

  it('caps the palette size', () => {
    expect(resizeSlots(img, base, { ...settings, count: 99 }, candidates, DEFAULT_MATCH).length).toBeLessThanOrEqual(MAX_SLOTS)
  })
})

describe('editing slots', () => {
  const slots = extractSlots(img, [], settings, candidates, DEFAULT_MATCH)

  it('re-samples a moved marker and re-matches it', () => {
    const blue = slots[2]
    const moved = moveSlotMarker(img, slots, blue.key, 0.95, 0.5, candidates, DEFAULT_MATCH, true)
    const slot = moved.find((s) => s.key === blue.key)!
    expect(slot.marker).toEqual({ x: 0.95, y: 0.5 })
    expect(deltaE(slot.target, rgbToOklab(...COLORS[3]))).toBeLessThan(0.01)
    // Two slots now want lime: one gets lime concrete, the other the next-best block
    expect(slot.blockId).not.toBe('blue_concrete')
    expect(ids(moved)).toContain('lime_concrete')
    expect(new Set(ids(moved)).size).toBe(4)
  })

  it('adds a slot from the eyedropper', () => {
    const res = addSlotAt(img, slots.slice(0, 3), 0.95, 0.5, candidates, DEFAULT_MATCH)!
    expect(res.slots).toHaveLength(4)
    expect(res.slots.find((s) => s.key === res.key)!.blockId).toBe('lime_concrete')
  })

  it('adds a hand-picked block that stays put', () => {
    const res = addSlotForBlock(img, slots, getBlock('oak_planks')!, 'side')!
    const added = res.slots.find((s) => s.key === res.key)!
    expect(added).toMatchObject({ blockId: 'oak_planks', manual: true })
    const rematched = withBlocks(res.slots, candidates, DEFAULT_MATCH)
    expect(rematched.find((s) => s.key === res.key)!.blockId).toBe('oak_planks')
  })

  it('refuses to grow past the maximum', () => {
    const full = Array.from({ length: MAX_SLOTS }, (_, i) => ({ ...slots[0], key: `k${i}` }))
    expect(addSlotAt(img, full, 0.1, 0.1, candidates, DEFAULT_MATCH)).toBeNull()
    expect(addSlotForBlock(img, full, getBlock('stone')!, 'side')).toBeNull()
  })

  it('removes a slot and re-measures the rest', () => {
    const rest = removeSlot(img, slots, slots[0].key)
    expect(rest).toHaveLength(3)
    expect(rest.reduce((a, s) => a + s.coverage, 0)).toBeCloseTo(1, 5)
  })
})

describe('sorting and sharing', () => {
  const slots = extractSlots(img, [], settings, candidates, DEFAULT_MATCH)

  it('sorts by share, lightness or hue', () => {
    expect(ids(sortSlots(slots, 'coverage', 'side'))[0]).toBe('white_concrete')
    expect(ids(sortSlots(slots, 'lightness', 'side'))).toEqual(['blue_concrete', 'red_concrete', 'lime_concrete', 'white_concrete'])
    // Hue order starts at red; greys go last
    expect(ids(sortSlots(slots, 'hue', 'side'))).toEqual(['red_concrete', 'lime_concrete', 'blue_concrete', 'white_concrete'])
  })

  it('round-trips through a share link as hand-picked slots', () => {
    const shared = decodeShare(encodeShare(toEntries(slots), 'Flags'))!
    const back = slotsFromEntries(shared.entries)
    expect(ids(back)).toEqual(ids(slots))
    expect(back.every((s) => s.manual && s.marker === null)).toBe(true)
    // Without an image, removing a slot splits the shares evenly
    expect(removeSlot(null, back, back[0].key).map((s) => s.coverage)).toEqual([1 / 3, 1 / 3, 1 / 3])
  })
})
