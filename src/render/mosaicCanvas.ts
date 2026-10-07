import type { Surface } from '../core/blocks'
import type { Mosaic } from '../core/mosaic'
import { drawFace, type Atlas } from './atlas'

/** Draws a mosaic with block textures (or flat colours) at `cell` pixels per block. */
export function drawMosaic(
  ctx: CanvasRenderingContext2D,
  m: Mosaic,
  atlas: Atlas | null,
  surface: Surface,
  cell: number,
  opts: { grid?: boolean } = {},
) {
  ctx.clearRect(0, 0, m.width * cell, m.height * cell)
  ctx.imageSmoothingEnabled = false
  const faces = m.blocks.map((b) => (surface === 'top' ? b.top : b.side))
  // Below ~4px textures turn to mush; flat colours read better
  const useAtlas = cell >= 4 ? atlas : null
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const c = m.cells[y * m.width + x]
      if (c < 0) continue
      drawFace(ctx, faces[c], useAtlas, x * cell, y * cell, cell)
    }
  }
  if (opts.grid && cell >= 6) {
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= m.width; x++) {
      ctx.moveTo(x * cell + 0.5, 0)
      ctx.lineTo(x * cell + 0.5, m.height * cell)
    }
    for (let y = 0; y <= m.height; y++) {
      ctx.moveTo(0, y * cell + 0.5)
      ctx.lineTo(m.width * cell, y * cell + 0.5)
    }
    ctx.stroke()
    // Heavier lines every 16 blocks (a chunk), for counting in game
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath()
    for (let x = 0; x <= m.width; x += 16) {
      ctx.moveTo(x * cell + 0.5, 0)
      ctx.lineTo(x * cell + 0.5, m.height * cell)
    }
    for (let y = 0; y <= m.height; y += 16) {
      ctx.moveTo(0, y * cell + 0.5)
      ctx.lineTo(m.width * cell, y * cell + 0.5)
    }
    ctx.stroke()
  }
}

/** Largest cell size (≤ 16 px) that keeps the canvas within `maxPixels` on its longest side. */
export function cellSizeFor(m: Mosaic, maxPixels = 4096): number {
  return Math.max(1, Math.min(16, Math.floor(maxPixels / Math.max(m.width, m.height))))
}
