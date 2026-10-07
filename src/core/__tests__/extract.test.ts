import { describe, expect, it } from 'vitest'
import { deltaE, hexToLab, labToHex, rgbToOklab } from '../color'
import { clusterColors, extractPalette, measureColors, pickColors, pixelAt, sampleAt, toLabImage, type Cluster } from '../extract'
import { mulberry32 } from '../random'
import { makeImage } from './helpers'

const RED: [number, number, number] = [200, 40, 40]
const BLUE: [number, number, number] = [40, 70, 190]
const CREAM: [number, number, number] = [240, 230, 200]

/** Left 60% red, next 30% blue, last 10% cream, with a little noise. */
function stripes(width = 100, height = 60, seed = 1) {
  const rand = mulberry32(seed)
  const jitter = (c: [number, number, number]) => c.map((v) => v + Math.round((rand() - 0.5) * 8)) as [number, number, number]
  return makeImage(width, height, (x) => jitter(x < width * 0.6 ? RED : x < width * 0.9 ? BLUE : CREAM))
}

describe('toLabImage', () => {
  it('converts pixels and masks transparent ones', () => {
    const img = toLabImage(makeImage(4, 1, (x) => (x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 10])))
    expect(img.count).toBe(2)
    expect(Array.from(img.opaque)).toEqual([1, 1, 0, 0])
    expect(img.lab[0]).toBeCloseTo(rgbToOklab(255, 0, 0)[0], 5)
    expect(pixelAt(img, 0.1, 0.5)).not.toBeNull()
    expect(pixelAt(img, 0.9, 0.5)).toBeNull()
  })
})

describe('extractPalette', () => {
  it('recovers the colours of a simple image with their coverage', () => {
    const img = toLabImage(stripes())
    const picks = extractPalette(img, { count: 3, variety: 0.5, vibrancy: 0.5 })
    expect(picks).toHaveLength(3)
    const expected = [RED, BLUE, CREAM].map((c) => rgbToOklab(...c))
    // Largest first
    expected.forEach((lab, i) => expect(deltaE(picks[i].lab, lab), labToHex(picks[i].lab)).toBeLessThan(0.02))
    expect(picks[0].coverage).toBeCloseTo(0.6, 1)
    expect(picks[1].coverage).toBeCloseTo(0.3, 1)
    expect(picks[2].coverage).toBeCloseTo(0.1, 1)
    // Markers sit inside the matching stripe
    expect(picks[0].marker!.x).toBeLessThan(0.6)
    expect(picks[1].marker!.x).toBeGreaterThan(0.6)
    expect(picks[1].marker!.x).toBeLessThan(0.9)
    expect(picks[2].marker!.x).toBeGreaterThan(0.9)
    // Flat colours have little spread
    for (const p of picks) expect(p.spread).toBeLessThan(0.03)
  })

  it('is deterministic for a seed', () => {
    const img = toLabImage(stripes(80, 80, 7))
    const a = extractPalette(img, { count: 5, variety: 0.5, vibrancy: 0.5, seed: 3 })
    const b = extractPalette(img, { count: 5, variety: 0.5, vibrancy: 0.5, seed: 3 })
    expect(a).toEqual(b)
  })

  it('never returns more colours than the image has', () => {
    const img = toLabImage(makeImage(10, 10, () => [10, 200, 30]))
    const picks = extractPalette(img, { count: 6, variety: 0.5, vibrancy: 0.5 })
    expect(picks.length).toBe(1)
    expect(picks[0].coverage).toBe(1)
  })

  it('returns nothing for a fully transparent image', () => {
    const img = toLabImage(makeImage(10, 10, () => [0, 0, 0, 0]))
    expect(extractPalette(img, { count: 4, variety: 0.5, vibrancy: 0.5 })).toEqual([])
  })

  it('keeps a small vivid accent when vibrancy is up', () => {
    // A grey-green haze with a tiny orange sun (0.25% of the image)
    const w = 200
    const h = 200
    const rand = mulberry32(5)
    const img = toLabImage(
      makeImage(w, h, (x, y) => {
        if ((x - 120) ** 2 + (y - 80) ** 2 < 25) return [215, 90, 45]
        const g = 95 + Math.round(y / 10) + Math.round((rand() - 0.5) * 10)
        return [g, g + 8, g]
      }),
    )
    const orange = rgbToOklab(215, 90, 45)
    const hasSun = (vibrancy: number) => extractPalette(img, { count: 5, variety: 0.5, vibrancy }).some((p) => deltaE(p.lab, orange) < 0.05)
    expect(hasSun(1)).toBe(true)
    expect(hasSun(0.5)).toBe(true)
  })
})

describe('pickColors', () => {
  const c = (hex: string, weight: number, spread = 0.01): Cluster => ({ lab: hexToLab(hex)!, weight, spread })
  const clusters = [c('#3366cc', 0.4), c('#3a6dd0', 0.3), c('#cc3333', 0.2), c('#eeeeee', 0.1)]

  it('skips near-duplicates', () => {
    const picks = pickColors(clusters, { count: 3, variety: 0.5, vibrancy: 0 })
    expect(picks.map((p) => labToHex(p.lab))).toEqual(['#3366cc', '#cc3333', '#eeeeee'])
  })

  it('falls back to near-duplicates when nothing else is left', () => {
    const picks = pickColors(clusters, { count: 4, variety: 0.5, vibrancy: 0 })
    expect(picks).toHaveLength(4)
  })

  it('stays away from colours that are already in the palette', () => {
    const picks = pickColors(clusters, { count: 2, variety: 0.5, vibrancy: 0, keep: [hexToLab('#3366cc')!] })
    expect(picks.map((p) => labToHex(p.lab))).toEqual(['#cc3333', '#eeeeee'])
  })

  it('favours distinct colours as variety goes up', () => {
    const many = [c('#808080', 0.5), c('#8a8a8a', 0.2), c('#949494', 0.2), c('#ff00ff', 0.05), c('#00ff00', 0.05)]
    const low = pickColors(many, { count: 2, variety: 0, vibrancy: 0 })
    const high = pickColors(many, { count: 2, variety: 1, vibrancy: 0 })
    expect(labToHex(low[0].lab)).toBe('#808080')
    expect(labToHex(high[1].lab)).not.toBe('#8a8a8a')
    expect(['#ff00ff', '#00ff00']).toContain(labToHex(high[1].lab))
  })
})

describe('clusterColors', () => {
  it('reports weights that add up to 1, largest first', () => {
    const img = toLabImage(stripes(64, 64, 3))
    const cl = clusterColors(img, { k: 6 })
    expect(cl.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 6)
    for (let i = 1; i < cl.length; i++) expect(cl[i - 1].weight).toBeGreaterThanOrEqual(cl[i].weight)
  })
})

describe('measureColors / sampleAt', () => {
  it('measures coverage against arbitrary colours', () => {
    const img = toLabImage(stripes())
    // The blue stripe is closer to red than to cream, so it counts towards red
    const { coverage } = measureColors(img, [rgbToOklab(...RED), rgbToOklab(...CREAM)])
    expect(coverage[0]).toBeCloseTo(0.9, 2)
    expect(coverage[1]).toBeCloseTo(0.1, 2)
  })

  it('samples a neighbourhood with its local texture spread', () => {
    const checker = toLabImage(makeImage(20, 20, (x, y) => ((x + y) % 2 ? [0, 0, 0] : [255, 255, 255])))
    const flat = toLabImage(makeImage(20, 20, () => [120, 120, 120]))
    expect(sampleAt(checker, 0.5, 0.5)!.spread).toBeGreaterThan(0.4)
    expect(sampleAt(flat, 0.5, 0.5)!.spread).toBeLessThan(1e-3)
    expect(deltaE(sampleAt(flat, 0.5, 0.5)!.lab, rgbToOklab(120, 120, 120))).toBeLessThan(1e-4)
  })
})
