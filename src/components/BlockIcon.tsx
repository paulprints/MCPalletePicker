import clsx from 'clsx'
import { memo, useEffect, useRef } from 'react'
import type { BlockInfo, Face } from '../core/blocks'
import { drawFace, drawIsoBlock } from '../render/atlas'
import { useAtlas } from '../render/useAtlas'

/**
 * A block drawn with its real textures: an isometric cube (`iso`) or one flat
 * face (`face`). Shows flat colours until the texture atlas has loaded.
 */
export const BlockIcon = memo(function BlockIcon({
  block,
  size = 32,
  mode = 'iso',
  face,
  className,
  title,
}: {
  block: BlockInfo
  size?: number
  mode?: 'iso' | 'face'
  /** For `face` mode: which face (defaults to the side). */
  face?: Face
  className?: string
  title?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const atlas = useAtlas()
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const px = Math.round(size * dpr)
    if (canvas.width !== px) canvas.width = px
    if (canvas.height !== px) canvas.height = px
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, px, px)
    if (mode === 'iso') drawIsoBlock(ctx, block, atlas, 0, 0, px)
    else drawFace(ctx, face ?? block.side, atlas, 0, 0, px)
  }, [block, size, mode, face, atlas])
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={title ?? block.name}
      title={title ?? block.name}
      className={clsx('pixelated shrink-0', className)}
      style={{ width: size, height: size }}
    />
  )
})
