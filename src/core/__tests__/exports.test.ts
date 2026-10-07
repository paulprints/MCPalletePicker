import { describe, expect, it } from 'vitest'
import { getBlock } from '../blocks'
import { hexToLab, labToHex } from '../color'
import {
  decodeShare,
  encodeShare,
  formatStacks,
  materialRows,
  materialsCsv,
  paletteJson,
  paletteText,
  percentages,
  worldEditPattern,
  type PaletteEntry,
} from '../exports'

const entries: PaletteEntry[] = [
  { blockId: 'stone_bricks', target: hexToLab('#7a7a7a')!, coverage: 0.452 },
  { blockId: 'spruce_planks', target: hexToLab('#6b4f2f')!, coverage: 0.333 },
  { blockId: 'moss_block', target: hexToLab('#5a6e2c')!, coverage: 0.215 },
]

describe('percentages', () => {
  it('adds up to exactly 100', () => {
    for (const w of [[1, 1, 1], [0.452, 0.333, 0.215], [5, 0.001, 0.001], [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2]]) {
      const p = percentages(w)
      expect(p.reduce((a, b) => a + b, 0)).toBe(100)
      for (const v of p) expect(v).toBeGreaterThanOrEqual(1)
    }
    expect(percentages([0, 0])).toEqual([50, 50])
    expect(percentages([])).toEqual([])
  })
})

describe('worldEditPattern', () => {
  it('weights blocks by coverage', () => {
    expect(worldEditPattern(entries)).toBe('45%stone_bricks,33%spruce_planks,22%moss_block')
  })
})

describe('paletteText / paletteJson', () => {
  it('lists names, ids and shares', () => {
    const text = paletteText(entries, 'Forest keep')
    expect(text.split('\n')[0]).toBe('Forest keep')
    expect(text).toContain('Stone Bricks')
    expect(text).toContain('minecraft:spruce_planks')
    expect(text).toMatch(/22%$/)
  })

  it('includes the shapes each block comes in', () => {
    const json = JSON.parse(paletteJson(entries, { title: 'Forest keep', minecraftVersion: '26.3' }))
    expect(json.minecraftVersion).toBe('26.3')
    expect(json.blocks[0]).toMatchObject({ id: 'minecraft:stone_bricks', share: 45, stairs: 'minecraft:stone_brick_stairs', wall: 'minecraft:stone_brick_wall' })
    expect(json.blocks[0].sourceColor).toBe('#7a7a7a')
  })
})

describe('share links', () => {
  it('round-trips a palette and its title', () => {
    const hash = encodeShare(entries, 'Forest keep & co.')
    expect(hash).toContain('stone_bricks.7a7a7a.45,')
    const back = decodeShare('#' + hash)!
    expect(back.title).toBe('Forest keep & co.')
    expect(back.entries.map((e) => e.blockId)).toEqual(['stone_bricks', 'spruce_planks', 'moss_block'])
    expect(back.entries.map((e) => labToHex(e.target))).toEqual(['#7a7a7a', '#6b4f2f', '#5a6e2c'])
    expect(back.entries[0].coverage).toBeCloseTo(0.45, 5)
  })

  it('tolerates hand-edited and broken links', () => {
    expect(decodeShare('')).toBeNull()
    expect(decodeShare('#p=')).toBeNull()
    expect(decodeShare('#p=not_a_block.123456.50')).toBeNull()
    const loose = decodeShare('p=STONE,minecraft:oak_planks..,stone,waxed_copper_block')!
    expect(loose.entries.map((e) => e.blockId)).toEqual(['stone', 'oak_planks', 'copper_block'])
    // Missing colours fall back to the block's own, missing shares to an even split
    expect(loose.entries[1].target).toEqual(getBlock('oak_planks')!.side.lab)
    expect(loose.entries[0].coverage).toBeCloseTo(1 / 3, 5)
  })
})

describe('materials', () => {
  it('counts stacks and shulker boxes', () => {
    const rows = materialRows([getBlock('stone')!, getBlock('oak_planks')!], [1728, 70])
    expect(rows[0]).toMatchObject({ count: 1728, stacks: 27, remainder: 0, shulkers: 1 })
    expect(rows[1]).toMatchObject({ count: 70, stacks: 1, remainder: 6 })
    expect(formatStacks(70)).toBe('1 stack + 6')
    expect(formatStacks(128)).toBe('2 stacks')
    expect(formatStacks(5)).toBe('5')
    const csv = materialsCsv(rows)
    expect(csv.split('\n')[0]).toBe('Block,ID,Count,Stacks,Remainder,Shulker boxes')
    expect(csv).toContain('Stone,minecraft:stone,1728,27,0,1.00')
  })
})
