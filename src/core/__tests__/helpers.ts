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

/** Direct BigInt port of Litematica's LitematicaBitArray.getAt, as an independent oracle. */
export function litematicaGetAt(longs: BigInt64Array, bits: number, index: number): number {
  const mask = (1n << BigInt(bits)) - 1n
  const start = BigInt(index) * BigInt(bits)
  const startArr = Number(start >> 6n)
  const endArr = Number(((BigInt(index) + 1n) * BigInt(bits) - 1n) >> 6n)
  const startBit = start & 63n
  const u = (i: number) => BigInt.asUintN(64, longs[i])
  if (startArr === endArr) return Number((u(startArr) >> startBit) & mask)
  const endOffset = 64n - startBit
  return Number(((u(startArr) >> startBit) | (u(endArr) << endOffset)) & mask)
}

/** Unsigned LEB128 varint decoder (Sponge BlockData). */
export function readVarInts(bytes: Uint8Array): number[] {
  const out: number[] = []
  let p = 0
  while (p < bytes.length) {
    let value = 0
    let shift = 0
    let b: number
    do {
      b = bytes[p++]
      value |= (b & 0x7f) << shift
      shift += 7
    } while (b & 0x80)
    out.push(value >>> 0)
  }
  return out
}
