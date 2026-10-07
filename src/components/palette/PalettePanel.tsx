import { Dices, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MAX_SLOTS } from '../../core/palette'
import { percentages } from '../../core/exports'
import { usePalette } from '../../store/usePalette'
import { useSortedSlots } from '../hooks'
import { Button, Select, Stepper } from '../ui'
import { BlockPicker } from './BlockPicker'
import { ExportBar } from './ExportBar'
import { SlotCard } from './SlotCard'

export function PalettePanel() {
  const slots = useSortedSlots()
  const title = usePalette((s) => s.title)
  const setTitle = usePalette((s) => s.setTitle)
  const count = usePalette((s) => s.slots.length)
  const lockedCount = usePalette((s) => s.slots.filter((x) => x.locked).length)
  const hasImage = usePalette((s) => s.lab !== null)
  const setCount = usePalette((s) => s.setCount)
  const shuffle = usePalette((s) => s.shuffle)
  const sort = usePalette((s) => s.settings.sort)
  const setSort = usePalette((s) => s.setSort)
  const addBlock = usePalette((s) => s.addBlock)
  const [adding, setAdding] = useState(false)
  const shares = percentages(slots.map((s) => s.coverage))
  const usedIds = useMemo(() => new Set(slots.map((s) => s.blockId).filter((x): x is string => !!x)), [slots])

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4" data-testid="palette-panel">
      <div>
        <label className="sr-only" htmlFor="palette-title">
          Palette name
        </label>
        <input
          id="palette-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled palette"
          className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-lg font-semibold tracking-tight hover:border-ink-700 focus:border-accent-400 focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {hasImage && <Stepper label="Blocks" value={count} min={Math.max(2, lockedCount)} max={MAX_SLOTS} onChange={setCount} />}
          <Button size="sm" variant="secondary" onClick={shuffle} title="Swap unlocked blocks for other close matches">
            <Dices size={15} /> Shuffle
          </Button>
          <Select
            label="Order"
            className="ml-auto h-8 text-xs"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'coverage', label: 'By share' },
              { value: 'lightness', label: 'Dark → light' },
              { value: 'hue', label: 'By hue' },
            ]}
          />
        </div>
      </div>

      <ol className="flex flex-col gap-2" aria-label="Palette blocks">
        {slots.map((s, i) => (
          <SlotCard key={s.key} slot={s} index={i} share={shares[i]} usedIds={usedIds} />
        ))}
      </ol>
      <Button variant="ghost" size="sm" onClick={() => setAdding(true)} disabled={count >= MAX_SLOTS} className="border border-dashed border-ink-700">
        <Plus size={15} /> Add a block
      </Button>

      <ExportBar />

      <BlockPicker open={adding} onClose={() => setAdding(false)} onPick={(b) => addBlock(b.id)} title="Add a block to the palette" exclude={[...usedIds]} />
    </div>
  )
}
