import { gunzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { getBlock } from '../blocks'
import { buildMosaic, resampleToGrid, type Mosaic } from '../mosaic'
import { readNbt, TagType, type NbtCompound, type NbtTag } from '../nbt'
import { blockIndices, litematicaBits, litematicVersionFor, packLitematica, writeLitematic, writeSpongeSchem, writeVarInts } from '../schematic'
import { litematicaGetAt, makeImage, readVarInts } from './helpers'

const get = (c: NbtCompound, key: string) => c.value.get(key) as NbtTag
const compound = (c: NbtCompound, key: string) => get(c, key) as NbtCompound
const num = (c: NbtCompound, key: string) => (get(c, key) as { value: number }).value

/** 5 wide × 3 tall: top row white, middle red, bottom black, with a transparent corner. */
function sample(): Mosaic {
  const img = makeImage(5, 3, (x, y) => (x === 4 && y === 0 ? [0, 0, 0, 0] : y === 0 ? [207, 213, 214] : y === 1 ? [142, 32, 32] : [8, 10, 15]))
  const blocks = ['white_concrete', 'red_concrete', 'black_concrete'].map((id) => getBlock(id)!)
  return buildMosaic(resampleToGrid(img, 5, 3), blocks, { dither: 'none', surface: 'side' })
}

describe('Litematica bit packing', () => {
  it('matches Litematica’s own reader for every bit width', () => {
    for (const bits of [2, 3, 5, 7, 12, 13]) {
      const values = Array.from({ length: 333 }, (_, i) => (i * 2654435761) % (1 << bits))
      const longs = packLitematica(values, bits)
      expect(longs.length).toBe(Math.ceil((333 * bits) / 64))
      values.forEach((v, i) => expect(litematicaGetAt(longs, bits, i)).toBe(v))
    }
  })

  it('uses at least 2 bits per entry', () => {
    expect(litematicaBits(1)).toBe(2)
    expect(litematicaBits(4)).toBe(2)
    expect(litematicaBits(5)).toBe(3)
    expect(litematicaBits(257)).toBe(9)
  })
})

describe('writeLitematic', () => {
  it('writes a wall Litematica can load', () => {
    const m = sample()
    const bytes = writeLitematic(m, { name: 'Test art', orientation: 'wall', dataVersion: 4189, now: 1_700_000_000_000 })
    expect(bytes[0]).toBe(0x1f) // gzip
    const { root } = readNbt(gunzipSync(bytes))
    expect(num(root, 'Version')).toBe(7)
    expect(num(root, 'SubVersion')).toBe(1)
    expect(num(root, 'MinecraftDataVersion')).toBe(4189)
    const meta = compound(root, 'Metadata')
    expect((get(meta, 'Name') as { value: string }).value).toBe('Test art')
    expect(num(meta, 'TotalBlocks')).toBe(14)
    expect(num(meta, 'TotalVolume')).toBe(15)
    expect((get(meta, 'PreviewImageData') as { value: Int32Array }).value.length).toBe(140 * 140)
    const region = compound(compound(root, 'Regions'), 'Test art')
    const size = compound(region, 'Size')
    expect([num(size, 'x'), num(size, 'y'), num(size, 'z')]).toEqual([5, 3, 1])
    const palette = (get(region, 'BlockStatePalette') as { value: NbtCompound[] }).value.map(
      (c) => (get(c, 'Name') as { value: string }).value,
    )
    expect(palette[0]).toBe('minecraft:air')
    expect(palette.slice(1).sort()).toEqual(['minecraft:black_concrete', 'minecraft:red_concrete', 'minecraft:white_concrete'])
    const states = (get(region, 'BlockStates') as { type: number; value: BigInt64Array })
    expect(states.type).toBe(TagType.LongArray)
    const at = (x: number, y: number, z: number) => palette[litematicaGetAt(states.value, 2, (y * 1 + z) * 5 + x)]
    expect(at(0, 2, 0)).toBe('minecraft:white_concrete') // image top row is the top layer
    expect(at(4, 2, 0)).toBe('minecraft:air') // transparent corner
    expect(at(2, 1, 0)).toBe('minecraft:red_concrete')
    expect(at(0, 0, 0)).toBe('minecraft:black_concrete')
  })

  it('lays a floor out flat with the image’s top row to the north', () => {
    const m = sample()
    const idx = blockIndices(m, 'floor')
    expect(idx.length).toBe(15)
    expect(m.blocks[idx[0] - 1].id).toBe('white_concrete') // z = 0 is the top row
    expect(m.blocks[idx[2 * 5] - 1].id).toBe('black_concrete')
  })

  it('picks the schematic version for the game version', () => {
    expect(litematicVersionFor(3465)).toBe(6) // 1.20.1
    expect(litematicVersionFor(5023)).toBe(7)
    expect(litematicVersionFor(2586)).toBe(5)
  })
})

describe('writeSpongeSchem', () => {
  it('writes a version 3 schematic', () => {
    const m = sample()
    const { name, root } = readNbt(gunzipSync(writeSpongeSchem(m, { name: 'Wall', orientation: 'wall', dataVersion: 5023, now: 0 })))
    expect(name).toBe('')
    const s = compound(root, 'Schematic')
    expect(num(s, 'Version')).toBe(3)
    expect(num(s, 'DataVersion')).toBe(5023)
    expect([num(s, 'Width'), num(s, 'Height'), num(s, 'Length')]).toEqual([5, 3, 1])
    const blocks = compound(s, 'Blocks')
    const palette = new Map([...compound(blocks, 'Palette').value].map(([k, v]) => [(v as { value: number }).value, k]))
    const data = readVarInts(new Uint8Array((get(blocks, 'Data') as { value: Int8Array }).value.buffer))
    expect(data).toHaveLength(15)
    expect(palette.get(data[2 * 5 + 0])).toBe('minecraft:white_concrete')
    expect(palette.get(data[2 * 5 + 4])).toBe('minecraft:air')
    expect(palette.get(data[0])).toBe('minecraft:black_concrete')
  })

  it('encodes varints', () => {
    expect(Array.from(writeVarInts([0, 1, 127, 128, 300]))).toEqual([0, 1, 127, 0x80, 1, 0xac, 2])
    expect(readVarInts(writeVarInts([5, 1000, 70000]))).toEqual([5, 1000, 70000])
  })
})
