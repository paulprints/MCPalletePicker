import { describe, expect, it } from 'vitest'
import { BLOCKS, CATEGORIES, getBlock, surfaceFace, VERSIONS } from '../blocks'
import { hexToLab } from '../color'
import {
  allowedBlocks,
  assignBlocks,
  blockCost,
  DEFAULT_FILTER,
  DEFAULT_MATCH,
  matchQuality,
  rankBlocks,
  type BlockFilter,
  type MatchOptions,
} from '../match'

const everything: BlockFilter = {
  categories: CATEGORIES.map((c) => c.id),
  survivalOnly: false,
  allowGravity: true,
  allowLight: true,
  allowSeeThrough: true,
  version: VERSIONS.length - 1,
  excluded: [],
}
const pure: MatchOptions = { surface: 'side', textureWeight: 0, preferShapes: false }
const ids = (f: BlockFilter) => new Set(allowedBlocks(f).map((b) => b.id))

describe('allowedBlocks', () => {
  it('starts from sensible defaults', () => {
    const allowed = ids(DEFAULT_FILTER)
    expect(allowed.has('stone_bricks')).toBe(true)
    expect(allowed.has('sand')).toBe(true)
    expect(allowed.has('bedrock')).toBe(false) // creative only
    expect(allowed.has('glass')).toBe(false) // see-through
    expect(allowed.has('red_glazed_terracotta')).toBe(false) // off by default
    expect(allowed.has('crafting_table')).toBe(false)
    expect(allowed.has('diamond_ore')).toBe(false)
  })

  it('applies each filter', () => {
    expect(ids({ ...everything, allowGravity: false }).has('gravel')).toBe(false)
    expect(ids({ ...everything, allowLight: false }).has('sea_lantern')).toBe(false)
    expect(ids({ ...everything, allowSeeThrough: false }).has('oak_leaves')).toBe(false)
    expect(ids({ ...everything, survivalOnly: true }).has('reinforced_deepslate')).toBe(false)
    expect(ids({ ...everything, categories: ['wool'] }).size).toBe(16)
    expect(ids({ ...everything, excluded: ['stone'] }).has('stone')).toBe(false)
  })

  it('hides blocks newer than the chosen version', () => {
    const v1201 = VERSIONS.findIndex((v) => v.id === '1.20.1')
    const allowed = ids({ ...everything, version: v1201 })
    expect(allowed.has('cherry_planks')).toBe(true)
    expect(allowed.has('pale_oak_planks')).toBe(false)
    expect(allowed.has('tuff_bricks')).toBe(false)
    expect(ids({ ...everything, version: 0 }).has('deepslate')).toBe(false)
  })
})

describe('rankBlocks', () => {
  it('finds every block from its own colour', () => {
    const all = allowedBlocks(everything)
    for (const b of all) {
      const face = surfaceFace(b, 'side')
      const [best] = rankBlocks(face.lab, face.spread, all, pure, 1)
      // Either the block itself or one that looks exactly the same
      expect(best.deltaE, `${b.id} → ${best.block.id}`).toBeLessThan(1e-9)
    }
  })

  it('matches obvious colours to obvious blocks', () => {
    const pool = allowedBlocks(DEFAULT_FILTER)
    const best = (hex: string, opts = DEFAULT_MATCH) => rankBlocks(hexToLab(hex)!, 0.02, pool, opts, 1)[0].block.id
    expect(best('#7e7e7e', pure)).toBe('stone')
    expect(best('#cfd5d6', pure)).toBe('white_concrete')
    expect(best('#a58651', pure)).toBe('oak_planks')
    expect(best('#0a0a0e')).toMatch(/black/)
  })

  it('uses the requested surface', () => {
    const log = getBlock('oak_log')!
    const pool = [log, getBlock('stripped_oak_log')!, getBlock('oak_planks')!]
    const top = rankBlocks(log.top.lab, log.top.spread, pool, { ...pure, surface: 'top' }, 1)[0]
    expect(top.block.id).toBe('oak_log')
    expect(top.deltaE).toBeLessThan(1e-9)
  })

  it('nudges by texture and shapes', () => {
    const concrete = getBlock('gray_concrete')!
    const target = concrete.side.lab
    expect(blockCost(target, 0.1, concrete, { ...pure, textureWeight: 1 })).toBeGreaterThan(blockCost(target, 0.1, concrete, pure))
    const noShapes = getBlock('sponge')!
    expect(blockCost(noShapes.side.lab, 0, noShapes, { ...pure, preferShapes: true })).toBeGreaterThan(0)
  })
})

describe('assignBlocks', () => {
  const pool = allowedBlocks(DEFAULT_FILTER)
  const grey = hexToLab('#7e7e7e')!

  it('never gives two slots the same block', () => {
    const slots = [0.5, 0.3, 0.2].map((weight) => ({ target: grey, spread: 0.03, weight }))
    const out = assignBlocks(slots, pool, DEFAULT_MATCH)
    expect(new Set(out).size).toBe(3)
    // The biggest slot gets the best block
    expect(out[0]).toBe(rankBlocks(grey, 0.03, pool, DEFAULT_MATCH, 1)[0].block.id)
  })

  it('keeps fixed blocks and works around them', () => {
    const slots = [
      { target: grey, spread: 0.03, weight: 0.2 },
      { target: grey, spread: 0.03, weight: 0.8, fixed: 'stone' },
    ]
    const out = assignBlocks(slots, pool, { ...DEFAULT_MATCH, preferShapes: false })
    expect(out[1]).toBe('stone')
    expect(out[0]).not.toBe('stone')
  })

  it('shuffles reproducibly, staying close to the colour', () => {
    const slots = [{ target: hexToLab('#8a6b4a')!, spread: 0.05, weight: 1 }]
    const seen = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) {
      const a = assignBlocks(slots, pool, { ...DEFAULT_MATCH, shuffle: 1, seed })
      expect(assignBlocks(slots, pool, { ...DEFAULT_MATCH, shuffle: 1, seed })).toEqual(a)
      seen.add(a[0]!)
    }
    expect(seen.size).toBeGreaterThan(1)
    const best = rankBlocks(slots[0].target, 0.05, pool, DEFAULT_MATCH)
    for (const id of seen) expect(best.find((r) => r.block.id === id)!.cost).toBeLessThan(best[0].cost + 0.066)
  })

  it('leaves slots empty when nothing is allowed', () => {
    expect(assignBlocks([{ target: grey, spread: 0, weight: 1 }], [], DEFAULT_MATCH)).toEqual([null])
  })
})

describe('matchQuality', () => {
  it('grades distances', () => {
    expect(matchQuality(0.01)).toBe('excellent')
    expect(matchQuality(0.05)).toBe('good')
    expect(matchQuality(0.08)).toBe('fair')
    expect(matchQuality(0.2)).toBe('rough')
  })
})

describe('catalogue coverage', () => {
  it('has a reasonable match for any colour in sRGB', () => {
    const pool = allowedBlocks(DEFAULT_FILTER)
    let worst = 0
    for (let r = 0; r < 256; r += 51) {
      for (let g = 0; g < 256; g += 51) {
        for (let b = 0; b < 256; b += 51) {
          const lab = hexToLab(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`)!
          worst = Math.max(worst, rankBlocks(lab, 0, pool, pure, 1)[0].deltaE)
        }
      }
    }
    // Saturated corners of sRGB (pure cyan, magenta…) have no block, but nothing is absurdly far
    expect(worst).toBeLessThan(0.2)
    expect(BLOCKS.length).toBeGreaterThan(pool.length)
  })
})
