import { FileDown, ImageDown, Minus, Plus, Sheet } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { VERSIONS } from '../../core/blocks'
import { formatStacks, materialRows, materialsCsv } from '../../core/exports'
import { writeLitematic, writeSpongeSchem } from '../../core/schematic'
import { canvasToBlob, downloadBlob, slug } from '../../render/download'
import { cellSizeFor, drawMosaic } from '../../render/mosaicCanvas'
import { useAtlas } from '../../render/useAtlas'
import { usePalette } from '../../store/usePalette'
import { BlockIcon } from '../BlockIcon'
import { fitInside, useElementSize } from '../hooks'
import { Button, IconButton, SectionTitle, Segmented, Select, Slider, Toggle } from '../ui'
import { useMosaic } from './useMosaic'

export function PixelArtView() {
  const pixel = usePalette((s) => s.pixel)
  const setPixel = usePalette((s) => s.setPixel)
  const mosaic = useMosaic()
  const atlas = useAtlas()
  const boxRef = useRef<HTMLDivElement>(null)
  const box = useElementSize(boxRef)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [zoom, setZoom] = useState(1)
  const [hover, setHover] = useState<{ x: number; y: number; name: string } | null>(null)
  const surface = pixel.orientation === 'floor' ? 'top' : 'side'

  const fit = mosaic ? fitInside(mosaic.width, mosaic.height, box.width - 8, box.height - 8) : { width: 0, height: 0 }
  const display = { width: Math.round(fit.width * zoom), height: Math.round(fit.height * zoom) }

  // Draw at up to 16 px per block (textures stay crisp); CSS scales to fit
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !mosaic) return
    const cell = Math.min(16, Math.max(1, Math.ceil((display.width * Math.min(2, window.devicePixelRatio || 1)) / mosaic.width)), cellSizeFor(mosaic, 6144))
    canvas.width = mosaic.width * cell
    canvas.height = mosaic.height * cell
    const ctx = canvas.getContext('2d')
    if (ctx) drawMosaic(ctx, mosaic, atlas, surface, cell, { grid: pixel.grid })
  }, [mosaic, atlas, surface, pixel.grid, display.width])

  if (!mosaic) return null
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4" data-testid="pixel-view">
      <div className="grid grid-cols-1 items-end gap-x-5 gap-y-3 sm:grid-cols-2 2xl:grid-cols-[minmax(14rem,1fr)_auto_auto_auto_auto]">
        <Slider
          label="Width in blocks"
          value={pixel.width}
          min={16}
          max={256}
          step={4}
          onChange={(width) => setPixel({ width })}
          format={(v) => `${v} × ${mosaic.height}`}
          testId="pixel-width"
        />
        <div>
          <p className="mb-1 text-sm text-ink-200">Blocks</p>
          <Segmented
            label="Blocks"
            value={pixel.source}
            onChange={(source) => setPixel({ source })}
            options={[
              { value: 'palette', label: 'Palette', title: 'Only the blocks in your palette' },
              { value: 'all', label: 'All allowed', title: 'Every block your settings allow, for the most detail' },
            ]}
          />
        </div>
        <div>
          <p className="mb-1 text-sm text-ink-200">Dithering</p>
          <Select
            label="Dithering"
            value={pixel.dither}
            onChange={(dither) => setPixel({ dither })}
            options={[
              { value: 'none', label: 'None (flat areas)' },
              { value: 'floyd-steinberg', label: 'Diffusion (smooth)' },
              { value: 'ordered', label: 'Ordered (pattern)' },
            ]}
            testId="dither"
          />
        </div>
        <div>
          <p className="mb-1 text-sm text-ink-200">Build as</p>
          <Segmented
            label="Build as"
            value={pixel.orientation}
            onChange={(orientation) => setPixel({ orientation })}
            options={[
              { value: 'wall', label: 'Wall', title: 'Stands up: the image’s top is the top of the wall' },
              { value: 'floor', label: 'Floor', title: 'Lies flat: the image’s top is north (log tops, grass tops)' },
            ]}
          />
        </div>
        <Toggle checked={pixel.grid} onChange={(grid) => setPixel({ grid })} label="Grid" hint="Lines between blocks, heavier every 16 (a chunk)" />
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={boxRef} className="checker absolute inset-0 overflow-auto rounded-xl border border-ink-700">
          <div className="grid min-h-full min-w-full place-items-center p-1" style={{ width: display.width + 8, height: display.height + 8 }}>
            {display.width > 0 && (
              <canvas
                ref={canvasRef}
                className="pixelated"
                style={{ width: display.width, height: display.height }}
                role="img"
                aria-label={`Pixel art, ${mosaic.width} by ${mosaic.height} blocks`}
                data-testid="pixel-canvas"
                onPointerMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  const x = Math.floor(((e.clientX - r.left) / r.width) * mosaic.width)
                  const y = Math.floor(((e.clientY - r.top) / r.height) * mosaic.height)
                  const inside = x >= 0 && y >= 0 && x < mosaic.width && y < mosaic.height
                  const c = inside ? mosaic.cells[y * mosaic.width + x] : -1
                  setHover(c >= 0 ? { x, y, name: mosaic.blocks[c].name } : null)
                }}
                onPointerLeave={() => setHover(null)}
              />
            )}
          </div>
        </div>
        <div className="absolute top-2 left-2 z-10 inline-flex items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-850/90 p-0.5 backdrop-blur">
          <IconButton label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>
            <Minus size={15} />
          </IconButton>
          <span className="w-10 text-center font-mono text-xs text-ink-300">{Math.round(zoom * 100)}%</span>
          <IconButton label="Zoom in" disabled={zoom >= 8} onClick={() => setZoom((z) => Math.min(8, z * 1.5))}>
            <Plus size={15} />
          </IconButton>
        </div>
      </div>
      <p className="h-4 text-xs text-ink-400" aria-live="polite">
        {hover
          ? `${hover.name} · column ${hover.x + 1}, ${pixel.orientation === 'wall' ? `layer ${mosaic.height - hover.y}` : `row ${hover.y + 1}`}`
          : `${mosaic.width} × ${mosaic.height} blocks · ${mosaic.counts.reduce((a, b) => a + b, 0).toLocaleString()} placed · ${mosaic.blocks.length} kinds · average ΔE ${mosaic.meanError.toFixed(3)}`}
      </p>
    </div>
  )
}

/** Materials and downloads for the pixel art. */
export function PixelArtPanel() {
  const mosaic = useMosaic()
  const pixel = usePalette((s) => s.pixel)
  const title = usePalette((s) => s.title)
  const versionIndex = usePalette((s) => s.settings.filter.version)
  const atlas = useAtlas()
  const rows = useMemo(() => (mosaic ? materialRows(mosaic.blocks, mosaic.counts) : []), [mosaic])
  if (!mosaic) return null
  const version = VERSIONS[versionIndex]
  const name = `${slug(title, 'pixel-art')}-${mosaic.width}x${mosaic.height}`
  const opts = { name: title || 'Pixel art', orientation: pixel.orientation, dataVersion: version.dataVersion, description: `Pixel art made with MC Palette Picker (${mosaic.width}×${mosaic.height})` }
  const total = mosaic.counts.reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4" data-testid="pixel-panel">
      <section>
        <SectionTitle>Download</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="sm" variant="primary" onClick={() => downloadBlob(writeLitematic(mosaic, opts), `${name}.litematic`)} data-testid="download-litematic">
            <FileDown size={15} /> .litematic
          </Button>
          <Button size="sm" onClick={() => downloadBlob(writeSpongeSchem(mosaic, opts), `${name}.schem`)} data-testid="download-schem">
            <FileDown size={15} /> .schem (WorldEdit)
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              const c = document.createElement('canvas')
              const cell = Math.min(16, cellSizeFor(mosaic, 4096))
              c.width = mosaic.width * cell
              c.height = mosaic.height * cell
              drawMosaic(c.getContext('2d')!, mosaic, atlas, pixel.orientation === 'floor' ? 'top' : 'side', cell, { grid: pixel.grid })
              downloadBlob(await canvasToBlob(c), `${name}.png`)
            }}
          >
            <ImageDown size={15} /> Image (PNG)
          </Button>
          <Button size="sm" onClick={() => downloadBlob(materialsCsv(rows), `${name}-materials.csv`, 'text/csv')}>
            <Sheet size={15} /> Materials (CSV)
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-400">
          For Minecraft {version.id} (data version {version.dataVersion}). Change it under Settings → Blocks. Open the .litematic in Litematica, or in
          Schematic Material Manager for a layer-by-layer guide.
        </p>
      </section>
      <section>
        <SectionTitle>
          Materials · {total.toLocaleString()} blocks
        </SectionTitle>
        <ul className="divide-y divide-ink-800 overflow-hidden rounded-xl border border-ink-700" data-testid="materials">
          {rows.map((r) => (
            <li key={r.block.id} className="flex items-center gap-2.5 bg-ink-850 px-2.5 py-1.5">
              <BlockIcon block={r.block} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm">{r.block.name}</span>
              <span className="text-right">
                <span className="block font-mono text-sm tabular-nums">{r.count.toLocaleString()}</span>
                <span className="block text-[10.5px] text-ink-400">
                  {formatStacks(r.count)}
                  {r.shulkers >= 1 ? ` · ${r.shulkers.toFixed(1)} shulkers` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
