/**
 * Colour science helpers.
 *
 * All colour comparisons in the app happen in OKLab (Björn Ottosson, 2020),
 * a perceptually uniform space where the Euclidean distance between two
 * colours tracks how different they look. Averages are taken in *linear*
 * light before converting, because that is how a textured block "blends" when
 * seen from a distance.
 *
 * This module has no imports so the data generator (Node) and the app share it.
 */

export type Rgb = [number, number, number]
export type Lab = [number, number, number]

/** sRGB channel (0–255) → linear light (0–1). */
export function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** Linear light (0–1) → sRGB channel (0–255, unrounded, clamped). */
export function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, c * 255))
}

/** Lookup table: sRGB byte → linear light. */
export const SRGB_TO_LINEAR: Float64Array = (() => {
  const t = new Float64Array(256)
  for (let i = 0; i < 256; i++) t[i] = srgbToLinear(i)
  return t
})()

export function linearRgbToOklab(r: number, g: number, b: number): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function oklabToLinearRgb(L: number, a: number, b: number): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** sRGB bytes → OKLab. */
export function rgbToOklab(r: number, g: number, b: number): Lab {
  return linearRgbToOklab(SRGB_TO_LINEAR[r | 0], SRGB_TO_LINEAR[g | 0], SRGB_TO_LINEAR[b | 0])
}

/** OKLab → sRGB bytes (rounded, clamped to the sRGB gamut). */
export function oklabToRgb(L: number, a: number, b: number): Rgb {
  const [r, g, bl] = oklabToLinearRgb(L, a, b)
  return [Math.round(linearToSrgb(r)), Math.round(linearToSrgb(g)), Math.round(linearToSrgb(bl))]
}

/** Euclidean distance in OKLab (ΔE_OK). A just-noticeable difference is about 0.02. */
export function deltaE(a: Lab, b: Lab): number {
  const dL = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dL * dL + da * da + db * db)
}

export function deltaE2(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const dL = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return dL * dL + da * da + db * db
}

/** OKLCh chroma. Greys are ~0, the most saturated sRGB colours ~0.32. */
export function chroma(lab: Lab): number {
  return Math.hypot(lab[1], lab[2])
}

/** OKLCh hue in degrees [0, 360). */
export function hue(lab: Lab): number {
  const h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI
  return h < 0 ? h + 360 : h
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Parses `#rgb`, `#rrggbb` (with or without `#`). Returns null for anything else. */
export function hexToRgb(hex: string): Rgb | null {
  const m = hex.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(m)) return [0, 1, 2].map((i) => parseInt(m[i] + m[i], 16)) as Rgb
  if (/^[0-9a-f]{6}$/i.test(m)) return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16)) as Rgb
  return null
}

export function labToHex(lab: Lab): string {
  return rgbToHex(...oklabToRgb(...lab))
}

export function hexToLab(hex: string): Lab | null {
  const rgb = hexToRgb(hex)
  return rgb ? rgbToOklab(...rgb) : null
}

/** Mixes OKLab colours linearly; `t` = 0 gives `a`, 1 gives `b`. */
export function mixLab(a: Lab, b: Lab, t: number): Lab {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Relative luminance (WCAG) of an sRGB colour, 0–1. */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * SRGB_TO_LINEAR[r | 0] + 0.7152 * SRGB_TO_LINEAR[g | 0] + 0.0722 * SRGB_TO_LINEAR[b | 0]
}

/** Black or white, whichever reads better on the given background. */
export function readableTextOn(hex: string): '#000000' | '#ffffff' {
  const rgb = hexToRgb(hex) ?? [0, 0, 0]
  return luminance(...rgb) > 0.22 ? '#000000' : '#ffffff'
}

/** A broad, human colour name for an OKLab colour ("dark red", "light grey"…). */
export function describeColor(lab: Lab): string {
  const [L] = lab
  const C = chroma(lab)
  const h = hue(lab)
  const tone = L < 0.35 ? 'dark ' : L > 0.82 ? 'light ' : ''
  if (C < 0.03) {
    if (L < 0.25) return 'black'
    if (L > 0.92) return 'white'
    return `${L < 0.45 ? 'dark ' : L > 0.75 ? 'light ' : ''}grey`
  }
  // Low-chroma warm darks read as browns rather than oranges.
  if (h >= 30 && h < 100 && L < 0.68 && C < 0.16) return `${L < 0.42 ? 'dark ' : ''}brown`
  if (h >= 75 && h < 110 && C < 0.1 && L >= 0.68) return 'beige'
  // Upper hue bounds (OKLCh degrees): sRGB red sits at ~29°, yellow ~110°,
  // green ~142°, cyan ~195°, blue ~264°, magenta ~328°.
  const names: [number, string][] = [
    [15, 'pink'],
    [40, 'red'],
    [75, 'orange'],
    [115, 'yellow'],
    [135, 'lime'],
    [170, 'green'],
    [185, 'teal'],
    [225, 'cyan'],
    [285, 'blue'],
    [315, 'purple'],
    [345, 'magenta'],
    [360, 'pink'],
  ]
  const name = names.find(([max]) => h < max)?.[1] ?? 'pink'
  return tone + name
}
