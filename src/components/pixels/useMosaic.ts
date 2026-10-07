import { useDeferredValue, useMemo } from 'react'
import { getBlock, type BlockInfo, type Surface } from '../../core/blocks'
import type { PixelSource } from '../../core/extract'
import { buildMosaic, heightFor, resampleToGrid, type Dither, type Grid, type Mosaic } from '../../core/mosaic'
import { candidatesFor, usePalette } from '../../store/usePalette'

// One-entry caches shared by the view and the side panel, so the mosaic is
// built once per change rather than once per component.
let gridCache: { key: unknown[]; grid: Grid } | null = null
let mosaicCache: { key: unknown[]; mosaic: Mosaic } | null = null
const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i])

function cachedGrid(pixels: PixelSource, width: number, height: number): Grid {
  const key = [pixels, width, height]
  if (!gridCache || !same(gridCache.key, key)) gridCache = { key, grid: resampleToGrid(pixels, width, height) }
  return gridCache.grid
}

function cachedMosaic(grid: Grid, candidates: readonly BlockInfo[], candidatesKey: unknown, dither: Dither, surface: Surface): Mosaic {
  const key = [grid, candidatesKey, dither, surface]
  if (!mosaicCache || !same(mosaicCache.key, key)) mosaicCache = { key, mosaic: buildMosaic(grid, candidates, { dither, surface }) }
  return mosaicCache.mosaic
}

export function useMosaic(): Mosaic | null {
  const image = usePalette((s) => s.image)
  const pixel = usePalette((s) => s.pixel)
  const filter = usePalette((s) => s.settings.filter)
  const paletteKey = usePalette((s) => s.slots.map((x) => x.blockId ?? '').join(','))
  // Keep dragging the width slider smooth on big images
  const width = useDeferredValue(pixel.width)
  return useMemo(() => {
    if (!image) return null
    const grid = cachedGrid(image.pixels, width, heightFor(width, image.pixels.width, image.pixels.height))
    const surface = pixel.orientation === 'floor' ? 'top' : 'side'
    if (pixel.source === 'all') return cachedMosaic(grid, candidatesFor(filter), candidatesFor(filter), pixel.dither, surface)
    const palette = paletteKey
      .split(',')
      .map((id) => (id ? getBlock(id) : undefined))
      .filter((b): b is BlockInfo => !!b)
    return cachedMosaic(grid, palette, paletteKey, pixel.dither, surface)
  }, [image, width, pixel.source, pixel.dither, pixel.orientation, filter, paletteKey])
}
