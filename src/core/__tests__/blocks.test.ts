import { describe, expect, it } from 'vitest'
import { categorize, flagsFor } from '../../../scripts/classify'
import {
  BLOCKS,
  CATEGORIES,
  DATA_META,
  Flag,
  getBlock,
  hasFlag,
  LATEST_VERSION,
  searchBlocks,
  shapeList,
  surfaceFace,
  VERSIONS,
} from '../blocks'

const versionIndex = (id: string) => VERSIONS.findIndex((v) => v.id === id)

describe('block catalogue', () => {
  it('has the full-cube blocks of the current release', () => {
    expect(BLOCKS.length).toBeGreaterThan(350)
    expect(DATA_META.minecraftVersion).toBe(VERSIONS[LATEST_VERSION].id)
    for (const id of ['stone', 'oak_planks', 'white_concrete', 'red_wool', 'terracotta', 'deepslate_tiles', 'mushroom_stem', 'sea_lantern']) {
      expect(getBlock(id), id).toBeDefined()
    }
  })

  it('only contains blocks that are whole cubes', () => {
    for (const id of ['oak_stairs', 'stone_slab', 'cobblestone_wall', 'oak_fence', 'torch', 'chest', 'cactus', 'beacon']) {
      expect(getBlock(id), id).toBeUndefined()
    }
  })

  it('has sane colour data on every face', () => {
    for (const b of BLOCKS) {
      for (const f of [b.top, b.side, b.bottom]) {
        expect(f.hex).toMatch(/^#[0-9a-f]{6}$/)
        expect(f.lab[0]).toBeGreaterThanOrEqual(0)
        expect(f.lab[0]).toBeLessThanOrEqual(1.0001)
        expect(Math.abs(f.lab[1])).toBeLessThan(0.4)
        expect(Math.abs(f.lab[2])).toBeLessThan(0.4)
        expect(f.spread).toBeGreaterThanOrEqual(0)
        expect(f.layers.length).toBeGreaterThan(0)
        for (const l of f.layers) expect(l.tex).toMatch(/^block\//)
      }
    }
  })

  it('measures colours the way the eye sees them', () => {
    const stone = getBlock('stone')!
    expect(stone.side.hex).toBe('#7e7e7e')
    expect(stone.top).toBe(stone.side)
    // Concrete is flat, cobblestone is busy
    expect(getBlock('white_concrete')!.side.spread).toBeLessThan(0.01)
    expect(getBlock('cobblestone')!.side.spread).toBeGreaterThan(0.05)
    // Logs have bark on the sides and rings on top
    const log = getBlock('oak_log')!
    expect(log.top.lab[0]).toBeGreaterThan(log.side.lab[0])
    expect(hasFlag(log, Flag.Directional)).toBe(true)
  })

  it('applies default biome tints', () => {
    const grass = getBlock('grass_block')!
    expect(grass.top.layers[0].tint).toBe('#7cbd6b')
    expect(grass.top.lab[1]).toBeLessThan(-0.04) // green on top
    expect(grass.side.lab[1]).toBeGreaterThan(0) // dirt on the sides
    expect(hasFlag(grass, Flag.BiomeTint)).toBe(true)
    expect(getBlock('oak_leaves')!.side.lab[1]).toBeLessThan(-0.05)
  })

  it('assigns every block a known category', () => {
    const ids = new Set(CATEGORIES.map((c) => c.id))
    for (const b of BLOCKS) expect(ids.has(b.category), `${b.id}: ${b.category}`).toBe(true)
    for (const c of CATEGORIES) expect(BLOCKS.some((b) => b.category === c.id), c.id).toBe(true)
  })

  it('agrees with the generator’s classifier', () => {
    for (const b of BLOCKS) {
      expect(categorize(b.id)).toBe(b.category)
      const f = flagsFor(b.id)
      if (f.gravity) expect(hasFlag(b, Flag.Gravity)).toBe(true)
      if (f.light) expect(hasFlag(b, Flag.Light)).toBe(true)
      if (f.creative) expect(hasFlag(b, Flag.Creative)).toBe(true)
    }
  })

  it('flags behaviour', () => {
    expect(hasFlag(getBlock('sand')!, Flag.Gravity)).toBe(true)
    expect(hasFlag(getBlock('lime_concrete_powder')!, Flag.Gravity)).toBe(true)
    expect(hasFlag(getBlock('glowstone')!, Flag.Light)).toBe(true)
    expect(hasFlag(getBlock('bedrock')!, Flag.Creative)).toBe(true)
    expect(hasFlag(getBlock('powder_snow')!, Flag.Creative)).toBe(false)
    expect(hasFlag(getBlock('glass')!, Flag.SeeThrough)).toBe(true)
    expect(hasFlag(getBlock('oak_leaves')!, Flag.SeeThrough)).toBe(true)
    expect(hasFlag(getBlock('stone')!, Flag.SeeThrough)).toBe(false)
  })

  it('links stairs, slabs, walls and fences to their full block', () => {
    expect(getBlock('stone_bricks')!.shapes).toMatchObject({ stairs: 'stone_brick_stairs', slab: 'stone_brick_slab', wall: 'stone_brick_wall' })
    expect(getBlock('oak_planks')!.shapes).toMatchObject({ stairs: 'oak_stairs', slab: 'oak_slab', fence: 'oak_fence' })
    expect(getBlock('quartz_block')!.shapes.stairs).toBe('quartz_stairs')
    expect(getBlock('purpur_block')!.shapes.slab).toBe('purpur_slab')
    expect(getBlock('nether_bricks')!.shapes.fence).toBe('nether_brick_fence')
    expect(getBlock('cut_copper')!.shapes.stairs).toBe('cut_copper_stairs') // not the waxed one
    expect(shapeList(getBlock('stone_bricks')!)).toEqual(['stairs', 'slab', 'wall'])
    for (const b of BLOCKS) for (const [kind, id] of Object.entries(b.shapes)) expect(id.endsWith(`_${kind}`) || id.endsWith(`_${kind}s`)).toBe(true)
  })

  it('folds identical-looking blocks into one entry', () => {
    const copper = getBlock('copper_block')!
    expect(copper.aliases).toContain('waxed_copper_block')
    expect(getBlock('waxed_copper_block')).toBe(copper)
    expect(getBlock('infested_stone')).toBe(getBlock('stone'))
    expect(getBlock('minecraft:stone')).toBe(getBlock('stone'))
    expect(new Set(BLOCKS.map((b) => b.id)).size).toBe(BLOCKS.length)
  })

  it('knows when blocks were added', () => {
    expect(VERSIONS.map((v) => v.dataVersion)).toEqual([...VERSIONS.map((v) => v.dataVersion)].sort((a, b) => a - b))
    expect(getBlock('stone')!.since).toBe(0)
    expect(getBlock('copper_block')!.since).toBe(versionIndex('1.17.1'))
    expect(getBlock('cherry_planks')!.since).toBe(versionIndex('1.20.1'))
    expect(getBlock('pale_oak_planks')!.since).toBe(versionIndex('1.21.4'))
    expect(getBlock('deepslate')!.since).toBe(versionIndex('1.17.1'))
    // In the registry earlier, but only behind experimental data packs
    expect(getBlock('bamboo_planks')!.since).toBe(versionIndex('1.20.1'))
    expect(getBlock('tuff_bricks')!.since).toBe(versionIndex('1.21.1'))
    expect(getBlock('copper_grate')!.since).toBe(versionIndex('1.21.1'))
    expect(getBlock('tuff')!.since).toBe(versionIndex('1.17.1'))
  })

  it('averages faces for the “all sides” surface', () => {
    const log = getBlock('oak_log')!
    const all = surfaceFace(log, 'all')
    expect(all.lab[0]).toBeGreaterThan(log.side.lab[0])
    expect(all.lab[0]).toBeLessThan(log.top.lab[0])
    expect(surfaceFace(getBlock('stone')!, 'all')).toBe(getBlock('stone')!.side)
  })

  it('searches by name and id', () => {
    expect(searchBlocks('stone brick')[0].id).toBe('stone_bricks')
    expect(searchBlocks('oak_log')[0].id).toBe('oak_log')
    expect(searchBlocks('waxed copper').map((b) => b.id)).toContain('copper_block')
    expect(searchBlocks('zzzz')).toEqual([])
  })
})
