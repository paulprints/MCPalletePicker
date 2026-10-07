/**
 * A minimal NBT (Named Binary Tag) writer and reader: big-endian Java edition
 * NBT with modified UTF-8 strings. Only what schematics need.
 */

export const TagType = {
  End: 0,
  Byte: 1,
  Short: 2,
  Int: 3,
  Long: 4,
  Float: 5,
  Double: 6,
  ByteArray: 7,
  String: 8,
  List: 9,
  Compound: 10,
  IntArray: 11,
  LongArray: 12,
} as const
export type TagType = (typeof TagType)[keyof typeof TagType]

export type NbtTag =
  | { type: typeof TagType.Byte; value: number }
  | { type: typeof TagType.Short; value: number }
  | { type: typeof TagType.Int; value: number }
  | { type: typeof TagType.Long; value: bigint }
  | { type: typeof TagType.Float; value: number }
  | { type: typeof TagType.Double; value: number }
  | { type: typeof TagType.ByteArray; value: Int8Array }
  | { type: typeof TagType.String; value: string }
  | { type: typeof TagType.List; elementType: TagType; value: NbtTag[] }
  | { type: typeof TagType.Compound; value: Map<string, NbtTag> }
  | { type: typeof TagType.IntArray; value: Int32Array }
  | { type: typeof TagType.LongArray; value: BigInt64Array }

export type NbtCompound = Extract<NbtTag, { type: typeof TagType.Compound }>

export const nbt = {
  byte: (value: number): NbtTag => ({ type: TagType.Byte, value }),
  short: (value: number): NbtTag => ({ type: TagType.Short, value }),
  int: (value: number): NbtTag => ({ type: TagType.Int, value }),
  long: (value: bigint | number): NbtTag => ({ type: TagType.Long, value: BigInt(value) }),
  string: (value: string): NbtTag => ({ type: TagType.String, value }),
  byteArray: (value: Int8Array): NbtTag => ({ type: TagType.ByteArray, value }),
  intArray: (value: Int32Array | number[]): NbtTag => ({ type: TagType.IntArray, value: Int32Array.from(value) }),
  longArray: (value: BigInt64Array): NbtTag => ({ type: TagType.LongArray, value }),
  list: (elementType: TagType, value: NbtTag[]): NbtTag => ({ type: TagType.List, elementType, value }),
  compound: (entries: Record<string, NbtTag> = {}): NbtCompound => ({ type: TagType.Compound, value: new Map(Object.entries(entries)) }),
}

class Writer {
  private buf = new Uint8Array(1 << 14)
  private view = new DataView(this.buf.buffer)
  pos = 0
  private ensure(n: number) {
    if (this.pos + n <= this.buf.length) return
    let size = this.buf.length * 2
    while (size < this.pos + n) size *= 2
    const next = new Uint8Array(size)
    next.set(this.buf.subarray(0, this.pos))
    this.buf = next
    this.view = new DataView(next.buffer)
  }
  u8(v: number) {
    this.ensure(1)
    this.view.setUint8(this.pos++, v)
  }
  i16(v: number) {
    this.ensure(2)
    this.view.setInt16(this.pos, v)
    this.pos += 2
  }
  i32(v: number) {
    this.ensure(4)
    this.view.setInt32(this.pos, v)
    this.pos += 4
  }
  i64(v: bigint) {
    this.ensure(8)
    this.view.setBigInt64(this.pos, BigInt.asIntN(64, v))
    this.pos += 8
  }
  string(s: string) {
    const bytes = encodeModifiedUtf8(s)
    if (bytes.length > 0xffff) throw new Error('String too long for NBT')
    this.ensure(2 + bytes.length)
    this.view.setUint16(this.pos, bytes.length)
    this.pos += 2
    this.buf.set(bytes, this.pos)
    this.pos += bytes.length
  }
  payload(tag: NbtTag) {
    switch (tag.type) {
      case TagType.Byte:
        this.ensure(1)
        this.view.setInt8(this.pos++, tag.value)
        return
      case TagType.Short:
        return this.i16(tag.value)
      case TagType.Int:
        return this.i32(tag.value)
      case TagType.Long:
        return this.i64(tag.value)
      case TagType.Float:
        this.ensure(4)
        this.view.setFloat32(this.pos, tag.value)
        this.pos += 4
        return
      case TagType.Double:
        this.ensure(8)
        this.view.setFloat64(this.pos, tag.value)
        this.pos += 8
        return
      case TagType.ByteArray:
        this.i32(tag.value.length)
        this.ensure(tag.value.length)
        this.buf.set(new Uint8Array(tag.value.buffer, tag.value.byteOffset, tag.value.length), this.pos)
        this.pos += tag.value.length
        return
      case TagType.String:
        return this.string(tag.value)
      case TagType.List: {
        const elementType = tag.value.length ? tag.value[0].type : tag.elementType
        this.u8(elementType)
        this.i32(tag.value.length)
        for (const el of tag.value) {
          if (el.type !== elementType) throw new Error('NBT list contains mixed tag types')
          this.payload(el)
        }
        return
      }
      case TagType.Compound:
        for (const [name, child] of tag.value) {
          this.u8(child.type)
          this.string(name)
          this.payload(child)
        }
        this.u8(TagType.End)
        return
      case TagType.IntArray:
        this.i32(tag.value.length)
        for (const v of tag.value) this.i32(v)
        return
      case TagType.LongArray:
        this.i32(tag.value.length)
        for (const v of tag.value) this.i64(v)
        return
    }
  }
  result() {
    return this.buf.slice(0, this.pos)
  }
}

/** Serialises a root compound (with an optional root name) to uncompressed NBT. */
export function writeNbt(root: NbtCompound, name = ''): Uint8Array {
  const w = new Writer()
  w.u8(TagType.Compound)
  w.string(name)
  w.payload(root)
  return w.result()
}

class Reader {
  private view: DataView
  pos = 0
  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }
  private need(n: number) {
    if (this.pos + n > this.bytes.length) throw new Error(`Unexpected end of NBT data at byte ${this.pos}`)
  }
  u8() {
    this.need(1)
    return this.view.getUint8(this.pos++)
  }
  i32() {
    this.need(4)
    const v = this.view.getInt32(this.pos)
    this.pos += 4
    return v
  }
  string() {
    this.need(2)
    const len = this.view.getUint16(this.pos)
    this.pos += 2
    this.need(len)
    const s = new TextDecoder().decode(this.bytes.subarray(this.pos, this.pos + len))
    this.pos += len
    return s
  }
  payload(type: number): NbtTag {
    switch (type) {
      case TagType.Byte:
        this.need(1)
        return { type, value: this.view.getInt8(this.pos++) }
      case TagType.Short: {
        this.need(2)
        const value = this.view.getInt16(this.pos)
        this.pos += 2
        return { type, value }
      }
      case TagType.Int:
        return { type, value: this.i32() }
      case TagType.Long: {
        this.need(8)
        const value = this.view.getBigInt64(this.pos)
        this.pos += 8
        return { type, value }
      }
      case TagType.Float: {
        this.need(4)
        const value = this.view.getFloat32(this.pos)
        this.pos += 4
        return { type, value }
      }
      case TagType.Double: {
        this.need(8)
        const value = this.view.getFloat64(this.pos)
        this.pos += 8
        return { type, value }
      }
      case TagType.ByteArray: {
        const n = this.i32()
        this.need(n)
        const value = new Int8Array(this.bytes.slice(this.pos, this.pos + n).buffer)
        this.pos += n
        return { type, value }
      }
      case TagType.String:
        return { type, value: this.string() }
      case TagType.List: {
        const elementType = this.u8() as TagType
        const n = this.i32()
        const value: NbtTag[] = []
        for (let i = 0; i < n; i++) value.push(this.payload(elementType))
        return { type, elementType, value }
      }
      case TagType.Compound: {
        const value = new Map<string, NbtTag>()
        for (;;) {
          const t = this.u8()
          if (t === TagType.End) break
          const name = this.string()
          value.set(name, this.payload(t))
        }
        return { type, value }
      }
      case TagType.IntArray: {
        const n = this.i32()
        const value = new Int32Array(n)
        for (let i = 0; i < n; i++) value[i] = this.i32()
        return { type, value }
      }
      case TagType.LongArray: {
        const n = this.i32()
        this.need(n * 8)
        const value = new BigInt64Array(n)
        for (let i = 0; i < n; i++, this.pos += 8) value[i] = this.view.getBigInt64(this.pos)
        return { type, value }
      }
      default:
        throw new Error(`Unknown NBT tag type ${type}`)
    }
  }
}

/** Parses uncompressed NBT whose root is a compound. */
export function readNbt(bytes: Uint8Array): { name: string; root: NbtCompound } {
  const r = new Reader(bytes)
  if (r.u8() !== TagType.Compound) throw new Error('Root tag is not a compound')
  const name = r.string()
  return { name, root: r.payload(TagType.Compound) as NbtCompound }
}

function encodeModifiedUtf8(s: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 1 && c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
  }
  return Uint8Array.from(out)
}
