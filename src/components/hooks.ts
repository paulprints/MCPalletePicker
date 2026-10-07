import { useEffect, useMemo, useState, type RefObject } from 'react'
import { sortSlots, type Slot } from '../core/palette'
import { usePalette } from '../store/usePalette'

/** Slots in display order (the palette's sort setting). Marker numbers follow it. */
export function useSortedSlots(): Slot[] {
  const slots = usePalette((s) => s.slots)
  const sort = usePalette((s) => s.settings.sort)
  const surface = usePalette((s) => s.settings.match.surface)
  return useMemo(() => sortSlots(slots, sort, surface), [slots, sort, surface])
}

/** Size of an element, kept up to date with a ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize((prev) => (prev.width === el.clientWidth && prev.height === el.clientHeight ? prev : { width: el.clientWidth, height: el.clientHeight }))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

/** Largest size with the given aspect ratio that fits in a box. */
export function fitInside(w: number, h: number, boxW: number, boxH: number): { width: number; height: number } {
  if (!w || !h || boxW <= 0 || boxH <= 0) return { width: 0, height: 0 }
  const scale = Math.min(boxW / w, boxH / h)
  return { width: Math.floor(w * scale), height: Math.floor(h * scale) }
}
