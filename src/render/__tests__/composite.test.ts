import { describe, expect, it } from 'vitest'
import { compositeFace, type AtlasPixels } from '../composite'

/** An 8×8 atlas: an opaque orange sprite, a half-transparent overlay, and the first frame of an animated grey sprite. */
function atlas(): AtlasPixels {
  const width = 8
  const height = 8
  const data = new Uint8ClampedArray(width * height * 4)
  const set = (x: number, y: number, rgba: number[]) => data.set(rgba, (y * width + x) * 4)
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      set(x, y, [200, 100, 50, 255]) // "base" at (0,0) 4×4
      set(x + 4, y, x < 2 ? [255, 255, 255, 128] : [0, 0, 0, 0]) // "overlay" at (4,0): left half half-white
      set(x, y + 4, [100, 100, 100, 255]) // "grey" at (0,4), first frame
      set(x + 4, y + 4, [10, 20, 30, 255]) // unrelated pixels next to it
    }
  }
  return { width, height, data }
}

const sprites: Record<string, [number, number, number, number]> = {
  base: [0, 0, 4, 4],
  overlay: [4, 0, 4, 4],
  grey: [0, 4, 4, 8], // animated: two 4×4 frames stacked
}

const px = (out: Uint8ClampedArray, size: number, x: number, y: number) => Array.from(out.subarray((y * size + x) * 4, (y * size + x) * 4 + 4))

describe('compositeFace', () => {
  it('scales a sprite up without smoothing', () => {
    const out = compositeFace(atlas(), sprites, [{ tex: 'base' }], 16)!
    expect(px(out, 16, 0, 0)).toEqual([200, 100, 50, 255])
    expect(px(out, 16, 15, 15)).toEqual([200, 100, 50, 255])
  })

  it('uses the first frame of animated sprites', () => {
    const out = compositeFace(atlas(), sprites, [{ tex: 'grey' }], 4)!
    expect(px(out, 4, 3, 3)).toEqual([100, 100, 100, 255])
  })

  it('multiplies tinted layers by their tint', () => {
    const out = compositeFace(atlas(), sprites, [{ tex: 'grey', tint: '#ff8000' }], 4)!
    expect(px(out, 4, 0, 0)).toEqual([100, 50, 0, 255])
  })

  it('blends overlays over the base, keeping the base where the overlay is clear', () => {
    const out = compositeFace(atlas(), sprites, [{ tex: 'base' }, { tex: 'overlay' }], 4)!
    const a = 128 / 255
    expect(px(out, 4, 0, 0)).toEqual([Math.round(255 * a + 200 * (1 - a)), Math.round(255 * a + 100 * (1 - a)), Math.round(255 * a + 50 * (1 - a)), 255])
    expect(px(out, 4, 3, 0)).toEqual([200, 100, 50, 255])
  })

  it('keeps transparency when nothing is underneath', () => {
    const out = compositeFace(atlas(), sprites, [{ tex: 'overlay' }], 4)!
    expect(px(out, 4, 0, 0)).toEqual([255, 255, 255, 128])
    expect(px(out, 4, 3, 0)).toEqual([0, 0, 0, 0])
  })

  it('returns null for a missing sprite', () => {
    expect(compositeFace(atlas(), sprites, [{ tex: 'nope' }])).toBeNull()
  })
})
