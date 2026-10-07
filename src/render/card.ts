/**
 * The shareable palette card: the source image beside the blocks, drawn with
 * real textures, with each block's share of the image and a proportional
 * strip. Exported as a PNG.
 */
import { getBlock, type Surface } from '../core/blocks'
import { percentages, type PaletteEntry } from '../core/exports'
import { drawFace, drawIsoBlock, faceTexture, type Atlas } from './atlas'

const W = 1600
const H = 900
const PAD = 56
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export interface CardInput {
  title: string
  entries: PaletteEntry[]
  surface: Surface
  minecraftVersion: string
  atlas: Atlas | null
  image?: CanvasImageSource & { width: number; height: number }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

export function renderCard(input: CardInput): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const bg = ctx.createRadialGradient(W * 0.75, -100, 50, W * 0.6, H * 0.4, W)
  bg.addColorStop(0, '#16212a')
  bg.addColorStop(1, '#0d1016')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  let left = PAD
  if (input.image) {
    const iw = 560
    const ih = H - PAD * 2
    const scale = Math.max(iw / input.image.width, ih / input.image.height)
    const sw = iw / scale
    const sh = ih / scale
    ctx.save()
    roundRect(ctx, PAD, PAD, iw, ih, 20)
    ctx.clip()
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(input.image, (input.image.width - sw) / 2, (input.image.height - sh) / 2, sw, sh, PAD, PAD, iw, ih)
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 2
    roundRect(ctx, PAD, PAD, iw, ih, 20)
    ctx.stroke()
    left = PAD + iw + 56
  }
  const right = W - PAD
  const width = right - left

  // Title
  ctx.fillStyle = '#eef1f7'
  ctx.font = `700 46px ${FONT}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(fitText(ctx, input.title || 'Block palette', width), left, PAD + 40)
  ctx.fillStyle = '#7d87a3'
  ctx.font = `400 21px ${FONT}`
  const n = input.entries.length
  ctx.fillText(`Minecraft block palette · ${n} block${n === 1 ? '' : 's'} · Java ${input.minecraftVersion}`, left, PAD + 76)

  // Blocks
  const cols = n <= 3 ? n : n <= 4 ? 4 : n <= 6 ? 3 : 4
  const rows = Math.ceil(n / cols)
  const gridTop = PAD + 118
  const gridBottom = H - PAD - 96
  const cellW = width / cols
  const cellH = (gridBottom - gridTop) / rows
  const icon = Math.min(cellW * 0.62, cellH - 92, 150)
  const pct = percentages(input.entries.map((e) => e.coverage))
  input.entries.forEach((e, i) => {
    const b = getBlock(e.blockId)
    if (!b) return
    const cx = left + (i % cols) * cellW
    const cy = gridTop + Math.floor(i / cols) * cellH
    const ix = cx + (cellW - icon) / 2
    // soft shadow under the cube
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.ellipse(cx + cellW / 2, cy + icon * 0.98, icon * 0.42, icon * 0.09, 0, 0, Math.PI * 2)
    ctx.fill()
    drawIsoBlock(ctx, b, input.atlas, ix, cy, icon)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#eef1f7'
    ctx.font = `600 ${icon > 110 ? 21 : 18}px ${FONT}`
    ctx.fillText(fitText(ctx, b.name, cellW - 16), cx + cellW / 2, cy + icon + 34)
    ctx.fillStyle = '#7d87a3'
    ctx.font = `400 ${icon > 110 ? 15 : 13}px ${MONO}`
    ctx.fillText(fitText(ctx, `${b.id} · ${pct[i]}%`, cellW - 16), cx + cellW / 2, cy + icon + 58)
    ctx.textAlign = 'left'
  })

  // Proportional strip of textures
  const stripY = H - PAD - 44
  const stripH = 44
  ctx.save()
  roundRect(ctx, left, stripY, width, stripH, 10)
  ctx.clip()
  let x = left
  input.entries.forEach((e, i) => {
    const b = getBlock(e.blockId)
    if (!b) return
    const w = i === n - 1 ? right - x : (width * pct[i]) / 100
    const face = input.surface === 'top' ? b.top : b.side
    const tex = input.atlas ? faceTexture(input.atlas, face) : null
    if (tex) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, stripY, w, stripH)
      ctx.clip()
      for (let tx = x; tx < x + w; tx += stripH) drawFace(ctx, face, input.atlas, tx, stripY, stripH)
      ctx.restore()
    } else {
      ctx.fillStyle = face.hex
      ctx.fillRect(x, stripY, w, stripH)
    }
    x += w
  })
  ctx.restore()

  // Footer
  ctx.fillStyle = '#4a5470'
  ctx.font = `500 15px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText('MC Palette Picker', right, H - 22)
  ctx.textAlign = 'left'
  return canvas
}
