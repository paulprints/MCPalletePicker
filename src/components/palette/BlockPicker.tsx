import clsx from 'clsx'
import { Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { BLOCKS, CATEGORIES, searchBlocks, surfaceFace, type BlockInfo, type Category } from '../../core/blocks'
import { deltaE, type Lab } from '../../core/color'
import { isAllowed, matchQuality } from '../../core/match'
import { usePalette } from '../../store/usePalette'
import { BlockIcon } from '../BlockIcon'
import { Modal } from '../ui'
import { QualityDot } from './QualityDot'

const NONE: string[] = []

/**
 * Search every block. With a target colour, blocks are sorted by how close
 * they are to it. Blocks outside the current filter are listed but dimmed.
 */
interface PickerProps {
  open: boolean
  onClose: () => void
  onPick: (b: BlockInfo) => void
  target?: Lab
  title?: string
  exclude?: string[]
}

export function BlockPicker(props: PickerProps) {
  // Mounted only while open: no work while closed, and a fresh search each time
  return props.open ? <PickerDialog {...props} /> : null
}

function PickerDialog({ open, onClose, onPick, target, title = 'Choose a block', exclude = NONE }: PickerProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [onlyAllowed, setOnlyAllowed] = useState(true)
  const filter = usePalette((s) => s.settings.filter)
  const surface = usePalette((s) => s.settings.match.surface)
  const q = useDeferredValue(query)

  const results = useMemo(() => {
    const categories = new Set(filter.categories)
    const excluded = new Set(filter.excluded)
    const skip = new Set(exclude)
    let list = searchBlocks(q, BLOCKS).filter((b) => !skip.has(b.id) && (category === 'all' || b.category === category))
    if (onlyAllowed) list = list.filter((b) => isAllowed(b, filter, categories, excluded))
    const scored = list.map((b) => ({ b, dE: target ? deltaE(target, surfaceFace(b, surface).lab) : 0, allowed: isAllowed(b, filter, categories, excluded) }))
    if (target && !q) scored.sort((a, b) => a.dE - b.dE)
    return scored
  }, [q, category, onlyAllowed, filter, surface, target, exclude])

  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search blocks, e.g. “spruce”, “deepslate tiles”, “copper”"
            className="h-10 w-full rounded-xl border border-ink-600 bg-ink-900 pr-3 pl-9 text-sm placeholder:text-ink-500 focus:border-accent-400 focus:outline-none"
            data-testid="block-search"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['all', ...CATEGORIES.map((c) => c.id)] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={clsx(
                'rounded-lg border px-2 py-0.5 text-xs transition-colors',
                category === c ? 'border-accent-500/50 bg-accent-400/15 text-accent-300' : 'border-ink-700 text-ink-400 hover:text-ink-200',
              )}
            >
              {c === 'all' ? 'All' : CATEGORIES.find((x) => x.id === c)!.label}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-300">
            <input type="checkbox" className="accent-accent-500" checked={onlyAllowed} onChange={(e) => setOnlyAllowed(e.target.checked)} />
            Only blocks my settings allow
          </label>
        </div>
        <p className="text-xs text-ink-400">
          {results.length} block{results.length === 1 ? '' : 's'}
          {target && !q ? ', closest colour first' : ''}
        </p>
        <div className="grid max-h-[55vh] grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3" role="listbox" aria-label="Blocks">
          {results.map(({ b, dE, allowed }) => (
            <button
              key={b.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => {
                onPick(b)
                onClose()
              }}
              className={clsx(
                'flex items-center gap-2.5 rounded-xl border border-transparent p-1.5 text-left transition-colors hover:border-ink-600 hover:bg-ink-800',
                !allowed && 'opacity-50',
              )}
              title={allowed ? b.name : `${b.name} (outside your current settings)`}
            >
              <BlockIcon block={b} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{b.name}</span>
                <span className="flex items-center gap-1 truncate font-mono text-[10.5px] text-ink-400">
                  {target && <QualityDot quality={matchQuality(dE)} />}
                  {target ? `ΔE ${dE.toFixed(3)}` : b.id}
                </span>
              </span>
            </button>
          ))}
          {results.length === 0 && <p className="col-span-full py-8 text-center text-sm text-ink-400">No blocks match.</p>}
        </div>
      </div>
    </Modal>
  )
}
