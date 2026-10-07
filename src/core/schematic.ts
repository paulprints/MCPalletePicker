/**
 * Turns a pixel-art mosaic into a schematic file:
 *  - Litematica `.litematic` (gzipped NBT, one region, tightly packed long[]),
 *    matching fi.dy.masa.litematica.schematic.LitematicaSchematic,
 *  - Sponge `.schem` v3, which WorldEdit, FAWE and Axiom read.
 *
 * A *wall* stands up in the X–Y plane (the image's top row is the highest
 * layer); a *floor* lies in the X–Z plane (the image's top row is north).
 */
import { gzipSync } from 'fflate'
import { surfaceFace } from './blocks'
import { hexToRgb } from './color'
import type { Mosaic } from './mosaic'
import { nbt, TagType, writeNbt, type NbtTag } from './nbt'

export type Orientation = 'wall' | 'floor'

export interface SchematicOptions {
  name: string
  author?: string
  description?: string
  orientation: Orientation
  /** Minecraft data version the file is tagged with. */
  dataVersion: number
  /** Defaults to Date.now(); fixed in tests. */
  now?: number
}

export interface Size3 {
  x: number
  y: number
  z: number
}

export function schematicSize(m: Mosaic, orientation: Orientation): Size3 {
  return orientation === 'wall' ? { x: m.width, y: m.height, z: 1 } : { x: m.width, y: 1, z: m.height }
}

/**
 * Block palette index per position in Litematica/Sponge order
 * ((y * sizeZ + z) * sizeX + x), with air at index 0 and mosaic block j at j + 1.
 */
export function blockIndices(m: Mosaic, orientation: Orientation): Uint32Array {
  const size = schematicSize(m, orientation)
  const out = new Uint32Array(size.x * size.y * size.z)
  for (let row = 0; row < m.height; row++) {
    for (let x = 0; x < m.width; x++) {
      const cell = m.cells[row * m.width + x]
      const y = orientation === 'wall' ? m.height - 1 - row : 0
      const z = orientation === 'wall' ? 0 : row
      out[(y * size.z + z) * size.x + x] = cell + 1
    }
  }
  return out
}

/** Bits per entry Litematica uses for a palette of this length. */
export function litematicaBits(paletteLength: number): number {
  return Math.max(2, 32 - Math.clz32(Math.max(1, paletteLength) - 1))
}

/** Packs entries back to back, little-endian bit order, straddling longs (LitematicaBitArray). */
export function packLitematica(values: ArrayLike<number>, bits: number): BigInt64Array {
  const longs = Math.max(1, Math.ceil((values.length * bits) / 64))
  const words = new Uint32Array(longs * 2)
  const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1
  let w = 0
  let o = 0
  for (let i = 0; i < values.length; i++) {
    const v = (values[i] & mask) >>> 0
    words[w] |= v << o
    const end = o + bits
    if (end > 32) words[w + 1] |= v >>> (32 - o)
    if (end >= 32) {
      o = end - 32
      w++
    } else {
      o = end
    }
  }
  const out = new BigInt64Array(longs)
  for (let i = 0; i < longs; i++) out[i] = BigInt.asIntN(64, (BigInt(words[2 * i + 1]) << 32n) | BigInt(words[2 * i]))
  return out
}

/** Litematica schematic version for a Minecraft data version. */
export function litematicVersionFor(dataVersion: number): number {
  if (dataVersion > 3700) return 7 // 1.20.5+
  if (dataVersion >= 2860) return 6 // 1.18 – 1.20.4
  return 5
}

const PREVIEW_SIZE = 140

/** A square ARGB preview (Litematica's PreviewImageData), letterboxed on transparent. */
export function previewImage(m: Mosaic, orientation: Orientation, size = PREVIEW_SIZE): Int32Array {
  const out = new Int32Array(size * size)
  const scale = Math.min(size / m.width, size / m.height)
  const w = Math.max(1, Math.round(m.width * scale))
  const h = Math.max(1, Math.round(m.height * scale))
  const ox = Math.floor((size - w) / 2)
  const oy = Math.floor((size - h) / 2)
  const colors = m.blocks.map((b) => {
    const [r, g, bl] = hexToRgb(surfaceFace(b, orientation === 'wall' ? 'side' : 'top').hex) ?? [0, 0, 0]
    return ((0xff << 24) | (r << 16) | (g << 8) | bl) | 0
  })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = Math.min(m.width - 1, Math.floor(x / scale))
      const cy = Math.min(m.height - 1, Math.floor(y / scale))
      const cell = m.cells[cy * m.width + cx]
      if (cell >= 0) out[(oy + y) * size + ox + x] = colors[cell]
    }
  }
  return out
}

const stateName = (id: string) => (id.includes(':') ? id : `minecraft:${id}`)

export function writeLitematic(m: Mosaic, opts: SchematicOptions): Uint8Array {
  const now = opts.now ?? Date.now()
  const size = schematicSize(m, opts.orientation)
  const indices = blockIndices(m, opts.orientation)
  const palette = ['minecraft:air', ...m.blocks.map((b) => stateName(b.id))]
  const nonAir = m.counts.reduce((a, b) => a + b, 0)
  const region = nbt.compound({
    Position: nbt.compound({ x: nbt.int(0), y: nbt.int(0), z: nbt.int(0) }),
    Size: nbt.compound({ x: nbt.int(size.x), y: nbt.int(size.y), z: nbt.int(size.z) }),
    BlockStatePalette: nbt.list(
      TagType.Compound,
      palette.map((name) => nbt.compound({ Name: nbt.string(name) })),
    ),
    BlockStates: nbt.longArray(packLitematica(indices, litematicaBits(palette.length))),
    TileEntities: nbt.list(TagType.Compound, []),
    Entities: nbt.list(TagType.Compound, []),
    PendingBlockTicks: nbt.list(TagType.Compound, []),
    PendingFluidTicks: nbt.list(TagType.Compound, []),
  })
  const root = nbt.compound({
    MinecraftDataVersion: nbt.int(opts.dataVersion),
    Version: nbt.int(litematicVersionFor(opts.dataVersion)),
    SubVersion: nbt.int(1),
    Metadata: nbt.compound({
      Name: nbt.string(opts.name || 'Pixel art'),
      Author: nbt.string(opts.author ?? 'MC Palette Picker'),
      Description: nbt.string(opts.description ?? ''),
      RegionCount: nbt.int(1),
      TotalVolume: nbt.int(size.x * size.y * size.z),
      TotalBlocks: nbt.int(nonAir),
      TimeCreated: nbt.long(Math.round(now)),
      TimeModified: nbt.long(Math.round(now)),
      EnclosingSize: nbt.compound({ x: nbt.int(size.x), y: nbt.int(size.y), z: nbt.int(size.z) }),
      PreviewImageData: nbt.intArray(previewImage(m, opts.orientation)),
    }),
    Regions: nbt.compound({ [opts.name || 'Pixel art']: region }),
  })
  return gzipSync(writeNbt(root), { level: 6 })
}

/** Unsigned LEB128 varints, as Sponge's BlockData uses. */
export function writeVarInts(values: ArrayLike<number>): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < values.length; i++) {
    let v = values[i] >>> 0
    while (v >= 0x80) {
      out.push((v & 0x7f) | 0x80)
      v >>>= 7
    }
    out.push(v)
  }
  return Uint8Array.from(out)
}

export function writeSpongeSchem(m: Mosaic, opts: SchematicOptions): Uint8Array {
  const now = opts.now ?? Date.now()
  const size = schematicSize(m, opts.orientation)
  const indices = blockIndices(m, opts.orientation)
  const palette: Record<string, NbtTag> = { 'minecraft:air': nbt.int(0) }
  m.blocks.forEach((b, j) => (palette[stateName(b.id)] = nbt.int(j + 1)))
  const short = (v: number) => nbt.short((v << 16) >> 16)
  const schematic = nbt.compound({
    Version: nbt.int(3),
    DataVersion: nbt.int(opts.dataVersion),
    Metadata: nbt.compound({
      Name: nbt.string(opts.name || 'Pixel art'),
      Author: nbt.string(opts.author ?? 'MC Palette Picker'),
      Date: nbt.long(Math.round(now)),
    }),
    Width: short(size.x),
    Height: short(size.y),
    Length: short(size.z),
    Offset: nbt.intArray([0, 0, 0]),
    Blocks: nbt.compound({
      Palette: nbt.compound(palette),
      Data: nbt.byteArray(new Int8Array(writeVarInts(indices).buffer)),
      BlockEntities: nbt.list(TagType.Compound, []),
    }),
  })
  return gzipSync(writeNbt(nbt.compound({ Schematic: schematic })), { level: 6 })
}
