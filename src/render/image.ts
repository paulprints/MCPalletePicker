/**
 * Image decoding: turns a dropped/pasted/picked file into the pixel buffers
 * the colour engine works on. Nothing leaves the browser.
 */
import type { PixelSource } from '../core/extract'

/** Longest side of the image used for colour extraction (~37k pixels). */
export const ANALYSIS_SIZE = 192
/** Longest side of the image kept for pixel art (enough for 256-block-wide art). */
export const PIXEL_SIZE = 1024
const THUMB_SIZE = 160

export interface LoadedImage {
  name: string
  /** Object URL of the original file, for display. */
  url: string
  width: number
  height: number
  analysis: PixelSource
  pixels: PixelSource
  /** Small JPEG data URL, for saved palettes. */
  thumb: string
}

export class ImageLoadError extends Error {}

type Drawable = ImageBitmap | HTMLImageElement

async function decode(blob: Blob, url: string): Promise<{ img: Drawable; width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(blob)
    return { img: bmp, width: bmp.width, height: bmp.height }
  } catch {
    // SVG and a few other formats only decode through <img>
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    try {
      await img.decode()
    } catch {
      throw new ImageLoadError(
        blob.type === 'image/heic' || blob.type === 'image/heif'
          ? 'HEIC photos can’t be read by this browser. Export the photo as JPEG or PNG and drop that instead.'
          : 'This file isn’t an image your browser can read. Try a PNG, JPEG, WebP, GIF or AVIF.',
      )
    }
    const width = img.naturalWidth || 512
    const height = img.naturalHeight || 512
    return { img, width, height }
  }
}

function fit(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) }
}

/**
 * Draws the image at most `max` pixels on its longest side. With `smooth`
 * off, every output pixel is a real pixel of the image: colour statistics
 * then contain no blended in-between colours that the image doesn't have
 * (the purple fringe between a red and a blue area, say).
 */
function rasterize(img: Drawable, width: number, height: number, max: number, smooth: boolean): PixelSource {
  const { w, h } = fit(width, height, max)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new ImageLoadError('Canvas is not available in this browser.')
  ctx.imageSmoothingEnabled = smooth
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  return { width: w, height: h, data }
}

function thumbnail(img: Drawable, width: number, height: number): string {
  const { w, h } = fit(width, height, THUMB_SIZE)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#141822'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.8)
}

export async function loadImage(blob: Blob, name: string): Promise<LoadedImage> {
  if (blob.size === 0) throw new ImageLoadError('That file is empty.')
  if (blob.type && !blob.type.startsWith('image/')) {
    throw new ImageLoadError(`“${name}” isn’t an image. Drop a PNG, JPEG, WebP, GIF or AVIF.`)
  }
  const url = URL.createObjectURL(blob)
  try {
    const { img, width, height } = await decode(blob, url)
    const analysis = rasterize(img, width, height, ANALYSIS_SIZE, false)
    // Pixel art area-averages this further, so a smooth downscale is right here
    const pixels = rasterize(img, width, height, PIXEL_SIZE, true)
    const thumb = thumbnail(img, width, height)
    if ('close' in img) img.close()
    let opaque = 0
    for (let i = 3; i < analysis.data.length; i += 4) if (analysis.data[i] >= 128) opaque++
    if (opaque === 0) throw new ImageLoadError('That image is completely transparent, so there are no colours to pick.')
    return { name, url, width, height, analysis, pixels, thumb }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

/** Fetches an image by URL (works for same-origin and CORS-enabled hosts only). */
export async function fetchImage(url: string): Promise<{ blob: Blob; name: string }> {
  let res: Response
  try {
    res = await fetch(url, { mode: 'cors' })
  } catch {
    throw new ImageLoadError('That website doesn’t allow its images to be read by other pages. Save the image and drop the file instead.')
  }
  if (!res.ok) throw new ImageLoadError(`Couldn’t download that image (HTTP ${res.status}).`)
  const blob = await res.blob()
  const name = decodeURIComponent(new URL(url, location.href).pathname.split('/').pop() || 'image')
  return { blob, name }
}

/** "my_castle-ref.final.png" → "My castle ref final" */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!base || /^(image|img|screenshot|untitled)$/i.test(base)) return 'Untitled palette'
  return base.charAt(0).toUpperCase() + base.slice(1)
}
