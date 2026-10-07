import clsx from 'clsx'
import { getBlock } from '../../core/blocks'
import { percentages } from '../../core/exports'
import { usePalette } from '../../store/usePalette'
import { FaceFill } from '../FaceFill'
import { useSortedSlots } from '../hooks'

/** The palette as a bar, each block as wide as its share of the image. */
export function CoverageStrip() {
  const slots = useSortedSlots()
  const selected = usePalette((s) => s.selected)
  const select = usePalette((s) => s.select)
  const surface = usePalette((s) => s.settings.match.surface)
  const pct = percentages(slots.map((s) => s.coverage))
  if (!slots.length) return null
  return (
    <div className="flex h-10 w-full shrink-0 overflow-hidden rounded-xl border border-ink-700" role="list" aria-label="Share of the image per block">
      {slots.map((s, i) => {
        const b = s.blockId ? getBlock(s.blockId) : undefined
        return (
          <button
            key={s.key}
            type="button"
            role="listitem"
            onClick={() => select(s.key)}
            title={`${i + 1}. ${b?.name ?? 'No block'}: ${pct[i]}% of the image`}
            className={clsx('relative min-w-2 overflow-hidden transition-[flex-grow] duration-300', selected === s.key && 'z-10 outline-2 -outline-offset-2 outline-accent-400')}
            style={{ flexGrow: Math.max(1, pct[i]), flexBasis: 0 }}
          >
            {b && <FaceFill face={surface === 'top' ? b.top : b.side} tile={40} className="absolute inset-0" />}
            {pct[i] >= 6 && (
              <span className="absolute right-1 bottom-0.5 rounded bg-black/55 px-1 font-mono text-[10px] text-white">{pct[i]}%</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
