import { describe, expect, it } from 'vitest'
import { getBlock, surfaceFace } from '../blocks'
import { buildGradient, gradientEnds } from '../gradient'
import { allowedBlocks, DEFAULT_FILTER } from '../match'

const pool = allowedBlocks(DEFAULT_FILTER)

describe('buildGradient', () => {
  const black = getBlock('black_concrete')!
  const white = getBlock('white_concrete')!

  it('runs from one block to the other in the requested number of steps', () => {
    const steps = buildGradient(black, white, pool, { steps: 7, surface: 'side' })
    expect(steps).toHaveLength(7)
    expect(steps[0].block.id).toBe('black_concrete')
    expect(steps[6].block.id).toBe('white_concrete')
    expect(new Set(steps.map((s) => s.block.id)).size).toBe(7)
  })

  it('gets lighter step by step from black to white', () => {
    const steps = buildGradient(black, white, pool, { steps: 6, surface: 'side' })
    const L = steps.map((s) => surfaceFace(s.block, 'side').lab[0])
    for (let i = 1; i < L.length; i++) expect(L[i]).toBeGreaterThan(L[i - 1] - 0.02)
    for (const s of steps.slice(1, -1)) expect(s.deltaE).toBeLessThan(0.06)
  })

  it('clamps the step count and collapses repeats', () => {
    expect(buildGradient(black, white, pool, { steps: 1, surface: 'side' })).toHaveLength(2)
    expect(buildGradient(black, white, pool, { steps: 99, surface: 'side' }).length).toBeLessThanOrEqual(24)
    const tiny = [black, white, getBlock('gray_concrete')!]
    const repeats = buildGradient(black, white, tiny, { steps: 9, surface: 'side', allowRepeats: true })
    for (let i = 1; i < repeats.length; i++) expect(repeats[i].block.id).not.toBe(repeats[i - 1].block.id)
  })

  it('stops early when it runs out of blocks', () => {
    const steps = buildGradient(black, white, [black, white], { steps: 5, surface: 'side' })
    expect(steps.map((s) => s.block.id)).toEqual(['black_concrete', 'white_concrete'])
  })
})

describe('gradientEnds', () => {
  it('picks the darkest and lightest blocks', () => {
    const blocks = ['oak_planks', 'black_wool', 'snow_block', 'stone'].map((id) => getBlock(id)!)
    const ends = gradientEnds(blocks, 'side')!
    expect(ends.map((b) => b.id)).toEqual(['black_wool', 'snow_block'])
    expect(gradientEnds(blocks.slice(0, 1), 'side')).toBeNull()
  })
})
