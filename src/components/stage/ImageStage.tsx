import clsx from 'clsx'
import { Boxes, Image as ImageIcon, Pipette } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getBlock } from '../../core/blocks'
import { labToHex, readableTextOn } from '../../core/color'
import { pixelAt } from '../../core/extract'
import { rankBlocks } from '../../core/match'
import { MAX_SLOTS, type Slot } from '../../core/palette'
import { candidatesFor, usePalette } from '../../store/usePalette'
import { BlockIcon } from '../BlockIcon'
import { fitInside, useElementSize, useSortedSlots } from '../hooks'
import { Kbd, Segmented } from '../ui'
import { BlocksPreview } from './BlocksPreview'
import { CoverageStrip } from './CoverageStrip'
import { SharedBoard } from './SharedBoard'

export function ImageStage() {
  const image = usePalette((s) => s.image)
  if (!image) return <SharedBoard />
  return <ImageWithMarkers />
}

function ImageWithMarkers() {
  const image = usePalette((s) => s.image)!
  const lab = usePalette((s) => s.lab)!
  const selected = usePalette((s) => s.selected)
  const select = usePalette((s) => s.select)
  const moveMarker = usePalette((s) => s.moveMarker)
  const addAt = usePalette((s) => s.addAt)
  const eyedropper = usePalette((s) => s.eyedropper)
  const setEyedropper = usePalette((s) => s.setEyedropper)
  const filter = usePalette((s) => s.settings.filter)
  const match = usePalette((s) => s.settings.match)
  const slotCount = usePalette((s) => s.slots.length)
  const slots = useSortedSlots()
  const [view, setView] = useState<'image' | 'blocks'>('image')
  const boxRef = useRef<HTMLDivElement>(null)
  const box = useElementSize(boxRef)
  const fit = fitInside(image.width, image.height, box.width, box.height)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ x: number; y: number; px: number; py: number } | null>(null)

  useEffect(() => {
    if (!eyedropper) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setEyedropper(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [eyedropper, setEyedropper])

  const toFraction = useCallback((clientX: number, clientY: number) => {
    const r = surfaceRef.current!.getBoundingClientRect()
    return {
      x: Math.min(0.999, Math.max(0, (clientX - r.left) / r.width)),
      y: Math.min(0.999, Math.max(0, (clientY - r.top) / r.height)),
      px: clientX - r.left,
      py: clientY - r.top,
    }
  }, [])

  // Eyedropper loupe: pixel colour and the block that would match it
  const loupe = useMemo(() => {
    if (!eyedropper || !hover) return null
    const c = pixelAt(lab, hover.x, hover.y)
    if (!c) return null
    const best = rankBlocks(c, 0.03, candidatesFor(filter), match, 1)[0]
    return { hex: labToHex(c), best }
  }, [eyedropper, hover, lab, filter, match])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: 'image', label: <span className="flex items-center gap-1.5"><ImageIcon size={14} /> Image</span>, title: 'The original image' },
            { value: 'blocks', label: <span className="flex items-center gap-1.5"><Boxes size={14} /> In blocks</span>, title: 'The image rebuilt with only the palette’s blocks' },
          ]}
        />
        <button
          type="button"
          aria-pressed={eyedropper}
          disabled={!eyedropper && slotCount >= MAX_SLOTS}
          onClick={() => setEyedropper(!eyedropper)}
          title={slotCount >= MAX_SLOTS ? `Palettes hold up to ${MAX_SLOTS} blocks` : 'Click the image to add the colour under the cursor'}
          className={clsx(
            'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors disabled:opacity-40',
            eyedropper ? 'border-accent-400 bg-accent-400/15 text-accent-300' : 'border-ink-700 bg-ink-850 text-ink-300 hover:text-ink-100',
          )}
        >
          <Pipette size={15} /> Add a colour
        </button>
        <p className="ml-auto hidden text-xs text-ink-400 md:block">
          {eyedropper ? (
            <>
              Click to add · <Kbd>Esc</Kbd> to stop
            </>
          ) : (
            'Drag a marker to re-sample its colour'
          )}
        </p>
      </div>

      <div ref={boxRef} className="relative min-h-0 flex-1">
        {fit.width > 0 && (
          <div
            ref={surfaceRef}
            className={clsx('checker absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible rounded-lg shadow-2xl', eyedropper && 'cursor-crosshair')}
            style={{ width: fit.width, height: fit.height }}
            data-testid="stage"
            onPointerMove={(e) => eyedropper && setHover(toFraction(e.clientX, e.clientY))}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => {
              if (!eyedropper) return select(null)
              const f = toFraction(e.clientX, e.clientY)
              addAt(f.x, f.y)
              if (slotCount + 1 >= MAX_SLOTS) setEyedropper(false)
            }}
          >
            {view === 'image' ? (
              <img src={image.url} alt={image.name} draggable={false} className="h-full w-full rounded-lg select-none" />
            ) : (
              <BlocksPreview width={fit.width} height={fit.height} />
            )}
            {slots.map((s, i) => (
              <Marker
                key={s.key}
                slot={s}
                index={i}
                active={selected === s.key}
                disabled={eyedropper}
                toFraction={toFraction}
                onSelect={() => select(s.key)}
                onMove={(x, y, final) => moveMarker(s.key, x, y, final)}
              />
            ))}
            {loupe && hover && (
              <div
                className="pointer-events-none absolute z-20 flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-850/95 p-2 shadow-xl"
                style={{
                  left: Math.min(hover.px + 16, fit.width - 200),
                  top: hover.py + 16 > fit.height - 60 ? hover.py - 66 : hover.py + 16,
                }}
              >
                <span className="h-9 w-9 rounded-lg border border-white/20" style={{ background: loupe.hex }} />
                {loupe.best && <BlockIcon block={loupe.best.block} size={36} />}
                <div className="min-w-0 text-xs">
                  <p className="font-mono text-ink-300">{loupe.hex}</p>
                  <p className="max-w-32 truncate font-medium text-ink-100">{loupe.best?.block.name ?? 'No allowed block'}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <CoverageStrip />
    </div>
  )
}

function Marker({
  slot,
  index,
  active,
  disabled,
  toFraction,
  onSelect,
  onMove,
}: {
  slot: Slot
  index: number
  active: boolean
  disabled: boolean
  toFraction: (x: number, y: number) => { x: number; y: number }
  onSelect: () => void
  onMove: (x: number, y: number, final: boolean) => void
}) {
  const dragging = useRef(false)
  const frame = useRef(0)
  if (!slot.marker) return null
  const hex = labToHex(slot.target)
  const block = slot.blockId ? getBlock(slot.blockId) : undefined
  const locked = slot.locked
  return (
    <button
      type="button"
      className={clsx(
        'marker absolute z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] text-xs font-bold shadow-[0_2px_10px_rgba(0,0,0,0.6)]',
        active ? 'border-accent-300 outline-2 outline-offset-2 outline-accent-400' : 'border-white',
        disabled ? 'pointer-events-none opacity-60' : locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing',
      )}
      data-active={active}
      data-testid={`marker-${index + 1}`}
      style={{ left: `${slot.marker.x * 100}%`, top: `${slot.marker.y * 100}%`, background: hex, color: readableTextOn(hex) }}
      aria-label={`Colour ${index + 1}: ${hex}${block ? `, matched to ${block.name}` : ''}. ${locked ? 'Locked.' : 'Drag or use arrow keys to move.'}`}
      title={`${index + 1}. ${hex}${block ? ` → ${block.name}` : ''}${locked ? ' (locked)' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onPointerDown={(e) => {
        if (locked || disabled || e.button !== 0) return
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        dragging.current = true
        onSelect()
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return
        const { x, y } = toFraction(e.clientX, e.clientY)
        cancelAnimationFrame(frame.current)
        frame.current = requestAnimationFrame(() => onMove(x, y, false))
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return
        dragging.current = false
        cancelAnimationFrame(frame.current)
        const { x, y } = toFraction(e.clientX, e.clientY)
        onMove(x, y, true)
      }}
      onPointerCancel={() => {
        dragging.current = false
        cancelAnimationFrame(frame.current)
      }}
      onKeyDown={(e) => {
        if (locked) return
        const step = e.shiftKey ? 0.05 : 0.01
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
        if (!d || !slot.marker) return
        e.preventDefault()
        onMove(Math.min(0.999, Math.max(0, slot.marker.x + d[0])), Math.min(0.999, Math.max(0, slot.marker.y + d[1])), true)
      }}
    >
      {index + 1}
    </button>
  )
}
