import { ImagePlus, Link2 } from 'lucide-react'
import { getBlock } from '../../core/blocks'
import { percentages } from '../../core/exports'
import { usePalette } from '../../store/usePalette'
import { BlockIcon } from '../BlockIcon'
import { FaceFill } from '../FaceFill'
import { useSortedSlots } from '../hooks'

/** Shown instead of the image when a palette was opened from a link or saved list. */
export function SharedBoard() {
  const slots = useSortedSlots()
  const title = usePalette((s) => s.title)
  const surface = usePalette((s) => s.settings.match.surface)
  const pct = percentages(slots.map((s) => s.coverage))
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 overflow-y-auto p-6">
      <div className="text-center">
        <p className="flex items-center justify-center gap-1.5 text-xs font-semibold tracking-wider text-ink-400 uppercase">
          <Link2 size={13} /> Palette
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">{title}</h2>
      </div>
      <div className="grid grid-cols-3 gap-x-8 gap-y-6 sm:grid-cols-4" data-testid="shared-board">
        {slots.map((s, i) => {
          const b = s.blockId ? getBlock(s.blockId) : undefined
          if (!b) return null
          return (
            <div key={s.key} className="flex w-28 flex-col items-center text-center">
              <BlockIcon block={b} size={88} />
              <p className="mt-2 text-sm leading-tight font-medium">{b.name}</p>
              <p className="font-mono text-[11px] text-ink-400">{pct[i]}%</p>
            </div>
          )
        })}
      </div>
      <div className="flex h-8 w-full max-w-xl overflow-hidden rounded-xl border border-ink-700">
        {slots.map((s, i) => {
          const b = s.blockId ? getBlock(s.blockId) : undefined
          return b ? <FaceFill key={s.key} face={surface === 'top' ? b.top : b.side} tile={32} style={{ flexGrow: Math.max(1, pct[i]), flexBasis: 0 }} /> : null
        })}
      </div>
      <p className="flex max-w-md items-center gap-2 text-center text-sm text-ink-400">
        <ImagePlus size={16} className="shrink-0" />
        Drop or paste an image to extract a new palette. Gradients work right away.
      </p>
    </div>
  )
}
