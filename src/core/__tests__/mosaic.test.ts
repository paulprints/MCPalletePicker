import { describe, expect, it } from 'vitest'
import { getBlock } from '../blocks'
import { deltaE, rgbToOklab } from '../color'
import { buildMosaic, heightFor, resampleToGrid } from '../mosaic'
import { makeImage } from './helpers'

describe('resampleToGrid', () => {
  it('averages in linear light', () => {
    // A black/white checkerboard averages to 50% light, i.e. sRGB ~188, not 128
    const img = makeImage(8, 8, (x, y) => ((x + y) % 2 ? [0, 0, 0] : [255, 255, 255]))
    const grid = resampleToGrid(img, 1, 1)
    expect(deltaE([grid.lab[0], grid.lab[1], grid.lab[2]], rgbToOklab(188, 188, 188))).toBeLessThan(0.005)
    expect(grid.alpha[0]).toBeCloseTo(1, 5)
  })

  it('keeps regions where they are and tracks transparency', () => {
    const img = makeImage(40, 20, (x) => (x < 20 ? [255, 0, 0, 255] : [0, 0, 255, 0]))
    const grid = resampleToGrid(img, 4, 2)
    expect(grid.width).toBe(4)
    expect(grid.height).toBe(2)
    expect(grid.alpha[0]).toBeCloseTo(1, 5)
    expect(grid.alpha[3]).toBeCloseTo(0, 5)
    expect(deltaE([grid.lab[0], grid.lab[1], grid.lab[2]], rgbToOklab(255, 0, 0))).toBeLessThan(1e-3)
  })

  it('handles upscaling and fractional cell boundaries', () => {
    const img = makeImage(3, 3, () => [100, 150, 200])
    const grid = resampleToGrid(img, 7, 5)
    for (let i = 0; i < 35; i++) {
      expect(grid.alpha[i]).toBeCloseTo(1, 5)
      expect(deltaE([grid.lab[i * 3], grid.lab[i * 3 + 1], grid.lab[i * 3 + 2]], rgbToOklab(100, 150, 200))).toBeLessThan(1e-3)
    }
  })
})

describe('buildMosaic', () => {
  const black = getBlock('black_concrete')!
  const white = getBlock('white_concrete')!
  const red = getBlock('red_concrete')!

  it('maps every opaque cell to the nearest block and counts them', () => {
    const img = makeImage(30, 10, (x) => (x < 10 ? [8, 10, 15] : x < 20 ? [207, 213, 214] : [0, 0, 0, 0]))
    const m = buildMosaic(resampleToGrid(img, 30, 10), [black, white, red], { surface: 'side' })
    expect(m.blocks.map((b) => b.id).sort()).toEqual(['black_concrete', 'white_concrete'])
    expect(m.counts.reduce((a, b) => a + b, 0)).toBe(200)
    expect(m.cells[0]).toBeGreaterThanOrEqual(0)
    expect(m.blocks[m.cells[0]].id).toBe('black_concrete')
    expect(m.blocks[m.cells[15]].id).toBe('white_concrete')
    expect(m.cells[25]).toBe(-1)
    expect(m.meanError).toBeLessThan(0.02)
  })

  it('returns an empty mosaic without candidates', () => {
    const m = buildMosaic(resampleToGrid(makeImage(4, 4, () => [1, 2, 3]), 4, 4), [], { surface: 'side' })
    expect(m.blocks).toEqual([])
    expect(Array.from(m.cells).every((c) => c === -1)).toBe(true)
  })

  it('keeps the aspect ratio', () => {
    expect(heightFor(64, 1024, 512)).toBe(32)
    expect(heightFor(10, 0, 0)).toBe(1)
  })
})
