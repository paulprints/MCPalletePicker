import type { PixelSource } from '../extract'

/** Builds an RGBA image by calling `fill(x, y)` for every pixel. */
export function makeImage(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number?]): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = fill(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return { width, height, data }
}
