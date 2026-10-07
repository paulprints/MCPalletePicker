import { describe, expect, it } from 'vitest'
import {
  chroma,
  deltaE,
  describeColor,
  hexToLab,
  hexToRgb,
  hue,
  labToHex,
  linearToSrgb,
  oklabToRgb,
  readableTextOn,
  rgbToHex,
  rgbToOklab,
  srgbToLinear,
} from '../color'
import { mulberry32 } from '../random'

describe('OKLab', () => {
  it('matches Ottosson’s reference values', () => {
    const white = rgbToOklab(255, 255, 255)
    expect(white[0]).toBeCloseTo(1, 4)
    expect(white[1]).toBeCloseTo(0, 4)
    expect(white[2]).toBeCloseTo(0, 4)
    const red = rgbToOklab(255, 0, 0)
    expect(red[0]).toBeCloseTo(0.62796, 4)
    expect(red[1]).toBeCloseTo(0.22486, 4)
    expect(red[2]).toBeCloseTo(0.12585, 4)
    const blue = rgbToOklab(0, 0, 255)
    expect(blue[0]).toBeCloseTo(0.45201, 4)
    expect(blue[1]).toBeCloseTo(-0.03246, 4)
    expect(blue[2]).toBeCloseTo(-0.31153, 4)
  })

  it('round-trips every sRGB colour it is given', () => {
    const rand = mulberry32(42)
    for (let i = 0; i < 2000; i++) {
      const rgb = [0, 0, 0].map(() => Math.floor(rand() * 256)) as [number, number, number]
      expect(oklabToRgb(...rgbToOklab(...rgb))).toEqual(rgb)
    }
  })

  it('has hues in the expected places', () => {
    expect(hue(rgbToOklab(255, 0, 0))).toBeCloseTo(29.2, 0)
    expect(hue(rgbToOklab(255, 255, 0))).toBeCloseTo(109.8, 0)
    expect(hue(rgbToOklab(0, 0, 255))).toBeCloseTo(264.1, 0)
    expect(chroma(rgbToOklab(128, 128, 128))).toBeLessThan(1e-4)
  })

  it('measures perceptual distance', () => {
    expect(deltaE(rgbToOklab(10, 10, 10), rgbToOklab(10, 10, 10))).toBe(0)
    // Black vs white is the whole lightness axis
    expect(deltaE(rgbToOklab(0, 0, 0), rgbToOklab(255, 255, 255))).toBeCloseTo(1, 4)
  })
})

describe('sRGB transfer', () => {
  it('is inverted by linearToSrgb', () => {
    for (let c = 0; c <= 255; c++) expect(Math.round(linearToSrgb(srgbToLinear(c)))).toBe(c)
  })
  it('puts mid grey at ~21.6% light', () => {
    expect(srgbToLinear(128)).toBeCloseTo(0.2158, 3)
  })
})

describe('hex helpers', () => {
  it('parses short and long hex, with or without #', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(hexToRgb('7c7c7c')).toEqual([124, 124, 124])
    expect(hexToRgb('#12345')).toBeNull()
    expect(hexToRgb('zzzzzz')).toBeNull()
  })
  it('formats and clamps', () => {
    expect(rgbToHex(255.4, -3, 16)).toBe('#ff0010')
    expect(labToHex(hexToLab('#3a7bd5')!)).toBe('#3a7bd5')
  })
  it('picks readable text colours', () => {
    expect(readableTextOn('#ffffff')).toBe('#000000')
    expect(readableTextOn('#101010')).toBe('#ffffff')
  })
})

describe('describeColor', () => {
  it('names broad colour families', () => {
    expect(describeColor(hexToLab('#000000')!)).toBe('black')
    expect(describeColor(hexToLab('#ffffff')!)).toBe('white')
    expect(describeColor(hexToLab('#808080')!)).toBe('grey')
    expect(describeColor(hexToLab('#d62828')!)).toBe('red')
    expect(describeColor(hexToLab('#2a6fdb')!)).toBe('blue')
    expect(describeColor(hexToLab('#3b8c3b')!)).toBe('green')
    expect(describeColor(hexToLab('#6b4423')!)).toContain('brown')
    expect(describeColor(hexToLab('#f2d024')!)).toContain('yellow')
  })
})
