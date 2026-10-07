/**
 * Face compositing on raw atlas pixels, with no canvas involved: crop each
 * layer's sprite (first animation frame), multiply tinted layers by their
 * tint, and alpha-blend the layers bottom to top. It mirrors what the data
 * generator measures, so the textures shown are the ones the colours came from.
 */
import type { Layer } from '../core/blocks'

export interface AtlasPixels {
  width: number
  height: number
  /** RGBA, row-major. */
  data: Uint8ClampedArray
}

export type Sprites = Record<string, [number, number, number, number]>

/** Composites a face's layers into `size × size` RGBA pixels, or null if a sprite is missing. */
export function compositeFace(atlas: AtlasPixels, sprites: Sprites, layers: Layer[], size = 16): Uint8ClampedArray<ArrayBuffer> | null {
  const out = new Float32Array(size * size * 4)
  for (const layer of layers) {
    const rect = sprites[layer.tex]
    if (!rect) return null
    const [x0, y0, w] = rect
    const tint = layer.tint ? [1, 3, 5].map((i) => parseInt(layer.tint!.slice(i, i + 2), 16) / 255) : null
    for (let y = 0; y < size; y++) {
      const sy = y0 + Math.floor((y * w) / size)
      for (let x = 0; x < size; x++) {
        const sx = x0 + Math.floor((x * w) / size)
        if (sx >= atlas.width || sy >= atlas.height) continue
        const i = (sy * atlas.width + sx) * 4
        const a = atlas.data[i + 3] / 255
        if (a === 0) continue
        let r = atlas.data[i]
        let g = atlas.data[i + 1]
        let b = atlas.data[i + 2]
        if (tint) {
          r *= tint[0]
          g *= tint[1]
          b *= tint[2]
        }
        const o = (y * size + x) * 4
        // alpha-over, premultiplied
        out[o] = r * a + out[o] * (1 - a)
        out[o + 1] = g * a + out[o + 1] * (1 - a)
        out[o + 2] = b * a + out[o + 2] * (1 - a)
        out[o + 3] = a + out[o + 3] * (1 - a)
      }
    }
  }
  const px = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const a = out[i * 4 + 3]
    if (a <= 0) continue
    px[i * 4] = Math.round(out[i * 4] / a)
    px[i * 4 + 1] = Math.round(out[i * 4 + 1] / a)
    px[i * 4 + 2] = Math.round(out[i * 4 + 2] / a)
    px[i * 4 + 3] = Math.round(a * 255)
  }
  return px
}
