import clsx from 'clsx'
import type { CSSProperties, ReactNode } from 'react'
import type { Face } from '../core/blocks'
import { faceDataUrl } from '../render/atlas'
import { useAtlas } from '../render/useAtlas'

/** An element filled with a block face, tiled at `tile` CSS pixels per block (flat colour until textures load). */
export function FaceFill({
  face,
  tile = 32,
  className,
  style,
  children,
}: {
  face: Face
  tile?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  const atlas = useAtlas()
  const url = faceDataUrl(atlas, face)
  return (
    <div
      className={clsx('pixelated', className)}
      style={{
        backgroundColor: face.hex,
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundSize: `${tile}px ${tile}px`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
