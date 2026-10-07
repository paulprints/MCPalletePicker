import { useEffect, useMemo, useRef } from 'react'
import { getBlock, type BlockInfo } from '../../core/blocks'
import { buildMosaic, heightFor, resampleToGrid } from '../../core/mosaic'
import { drawMosaic } from '../../render/mosaicCanvas'
import { useAtlas } from '../../render/useAtlas'
import { usePalette } from '../../store/usePalette'

/** The image rebuilt with only the palette's blocks, at roughly 6 screen pixels per block. */
export function BlocksPreview({ width, height }: { width: number; height: number }) {
  const image = usePalette((s) => s.image)!
  const slots = usePalette((s) => s.slots)
  const surface = usePalette((s) => (s.settings.match.surface === 'top' ? 'top' : 'side'))
  const atlas = useAtlas()
  const ref = useRef<HTMLCanvasElement>(null)
  const cols = Math.max(24, Math.min(160, Math.round(width / 6)))
  const rows = heightFor(cols, image.pixels.width, image.pixels.height)
  const grid = useMemo(() => resampleToGrid(image.pixels, cols, rows), [image.pixels, cols, rows])
  const blockKey = slots.map((s) => s.blockId).join(',')
  const blocks = useMemo(
    () => blockKey.split(',').map((id) => (id ? getBlock(id) : undefined)).filter((b): b is BlockInfo => !!b),
    [blockKey],
  )
  const mosaic = useMemo(() => buildMosaic(grid, blocks, { surface }), [grid, blocks, surface])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const cell = 8
    canvas.width = mosaic.width * cell
    canvas.height = mosaic.height * cell
    const ctx = canvas.getContext('2d')
    if (ctx) drawMosaic(ctx, mosaic, atlas, surface, cell)
  }, [mosaic, atlas, surface])

  return (
    <canvas
      ref={ref}
      className="pixelated h-full w-full rounded-lg"
      style={{ width, height }}
      role="img"
      aria-label="The image rebuilt with the palette’s blocks"
      data-testid="blocks-preview"
    />
  )
}
