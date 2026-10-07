import clsx from 'clsx'
import { Ban, ChevronDown, Lock, LockOpen, MoreHorizontal, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Flag, getBlock, hasFlag, shapeList, surfaceFace, type BlockInfo } from '../../core/blocks'
import { deltaE, labToHex, readableTextOn } from '../../core/color'
import { isAllowed, matchQuality, QUALITY_LABEL, rankBlocks } from '../../core/match'
import type { Slot } from '../../core/palette'
import { candidatesFor, usePalette } from '../../store/usePalette'
import { BlockIcon } from '../BlockIcon'
import { Badge, IconButton, Menu } from '../ui'
import { BlockPicker } from './BlockPicker'
import { QualityDot } from './QualityDot'

export function SlotCard({ slot, index, share, usedIds }: { slot: Slot; index: number; share: number; usedIds: Set<string> }) {
  const selected = usePalette((s) => s.selected === slot.key)
  const select = usePalette((s) => s.select)
  const pickBlock = usePalette((s) => s.pickBlock)
  const toggleLock = usePalette((s) => s.toggleLock)
  const remove = usePalette((s) => s.remove)
  const excludeBlock = usePalette((s) => s.excludeBlock)
  const canRemove = usePalette((s) => s.slots.length > 1)
  const filter = usePalette((s) => s.settings.filter)
  const match = usePalette((s) => s.settings.match)
  const [open, setOpen] = useState(false)
  const [picker, setPicker] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const block = slot.blockId ? getBlock(slot.blockId) : undefined
  const targetHex = labToHex(slot.target)
  const face = block ? surfaceFace(block, match.surface) : null
  const dE = face ? deltaE(slot.target, face.lab) : 0
  const quality = matchQuality(dE)
  const outsideFilter = block ? !isAllowed(block, filter) : false

  const alternatives = useMemo(
    () => (open ? rankBlocks(slot.target, slot.spread, candidatesFor(filter), match, 13).filter((r) => r.block.id !== slot.blockId).slice(0, 12) : []),
    [open, slot.target, slot.spread, slot.blockId, filter, match],
  )

  const choose = (b: BlockInfo) => pickBlock(slot.key, b.id)

  return (
    <li
      className={clsx(
        'rounded-2xl border bg-ink-850 transition-colors',
        selected ? 'border-accent-400/70 shadow-[0_0_0_1px_rgba(79,209,197,0.35)]' : 'border-ink-700 hover:border-ink-600',
      )}
      data-testid={`slot-${index + 1}`}
      data-block={slot.blockId ?? ''}
    >
      <div className="flex items-center gap-3 p-2.5" onClick={() => select(slot.key)}>
        <div className="relative">
          {block ? (
            <BlockIcon block={block} size={48} />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-ink-600 text-xs text-ink-500">none</div>
          )}
          <span
            className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-ink-850 text-[10px] font-bold"
            style={{ background: targetHex, color: readableTextOn(targetHex) }}
            title={`Image colour ${targetHex}`}
          >
            {index + 1}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate font-medium" data-testid="slot-name">
              {block?.name ?? 'No block allowed'}
            </p>
            <span className="ml-auto shrink-0 font-mono text-xs text-ink-300 tabular-nums" title="Share of the image">
              {share}%
            </span>
          </div>
          <p className="truncate font-mono text-[11px] text-ink-400">{block ? `minecraft:${block.id}` : 'Loosen the block settings'}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="flex items-center gap-1 rounded-md bg-ink-800 py-px pr-1.5 pl-0.5" title={`${QUALITY_LABEL[quality]}: ΔE ${dE.toFixed(3)} between the image colour and the block`}>
              <span className="h-3 w-3 rounded-sm border border-white/15" style={{ background: targetHex }} />
              <span className="h-3 w-3 rounded-sm border border-white/15" style={{ background: face?.hex ?? 'transparent' }} />
              <QualityDot quality={quality} className="ml-0.5" />
            </span>
            {block && <Badges block={block} />}
            {outsideFilter && (
              <Badge tone="warn" title="Hand-picked or locked, but your block settings would leave it out">
                outside settings
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5 self-start" onClick={(e) => e.stopPropagation()}>
          <IconButton
            label={slot.locked ? 'Unlock (re-extracting can change it)' : 'Lock (keep through re-extracting and shuffling)'}
            active={slot.locked}
            onClick={() => toggleLock(slot.key)}
            data-testid="lock"
          >
            {slot.locked ? <Lock size={15} /> : <LockOpen size={15} />}
          </IconButton>
          <IconButton label="More" onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}>
            <MoreHorizontal size={16} />
          </IconButton>
        </div>
      </div>

      <div className="border-t border-ink-700/70 px-2.5">
        <button
          type="button"
          className="flex w-full items-center gap-1.5 py-1.5 text-xs text-ink-400 hover:text-ink-100"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          data-testid="alternatives-toggle"
        >
          <ChevronDown size={14} className={clsx('transition-transform', open && 'rotate-180')} />
          Alternatives
          {block && shapeList(block).length > 0 && <span className="ml-auto text-ink-500">also as {shapeList(block).join(', ')}</span>}
        </button>
        {open && (
          <div className="pb-2.5">
            <div className="grid grid-cols-6 gap-1" data-testid="alternatives">
              {alternatives.map((r) => {
                const used = usedIds.has(r.block.id)
                return (
                  <button
                    key={r.block.id}
                    type="button"
                    onClick={() => choose(r.block)}
                    className={clsx('group relative flex flex-col items-center rounded-lg p-1 hover:bg-ink-700', used && 'opacity-45')}
                    title={`${r.block.name}: ΔE ${r.deltaE.toFixed(3)}${used ? ' (already in the palette)' : ''}`}
                  >
                    <BlockIcon block={r.block} size={36} title={r.block.name} />
                    <span className="mt-0.5 flex items-center gap-0.5 font-mono text-[9.5px] text-ink-400">
                      <QualityDot quality={matchQuality(r.deltaE)} className="h-1.5 w-1.5" />
                      {r.deltaE.toFixed(3).slice(1)}
                    </span>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setPicker(true)}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-700 py-1.5 text-xs text-ink-300 hover:border-ink-500 hover:text-ink-100"
            >
              <Search size={13} /> Search all blocks…
            </button>
          </div>
        )}
      </div>

      {menu && (
        <Menu
          at={menu}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Search all blocks…', icon: <Search size={14} />, onSelect: () => setPicker(true) },
            ...(block ? [{ label: `Never suggest ${block.name}`, icon: <Ban size={14} />, onSelect: () => excludeBlock(block.id) }] : []),
            'divider',
            { label: 'Remove from palette', icon: <Trash2 size={14} />, danger: true, disabled: !canRemove, onSelect: () => remove(slot.key) },
          ]}
        />
      )}
      <BlockPicker open={picker} onClose={() => setPicker(false)} onPick={choose} target={slot.target} title={`Block for colour ${index + 1} (${targetHex})`} />
    </li>
  )
}

function Badges({ block }: { block: BlockInfo }) {
  return (
    <>
      {hasFlag(block, Flag.Gravity) && (
        <Badge tone="warn" title="Falls when there's nothing under it">
          falls
        </Badge>
      )}
      {hasFlag(block, Flag.Light) && (
        <Badge tone="info" title="Gives off light">
          glows
        </Badge>
      )}
      {hasFlag(block, Flag.SeeThrough) && <Badge title="Partly transparent">see-through</Badge>}
      {hasFlag(block, Flag.BiomeTint) && <Badge title="Its colour changes with the biome (plains shown)">biome tint</Badge>}
      {hasFlag(block, Flag.Creative) && (
        <Badge tone="warn" title="Can't be obtained in survival">
          creative
        </Badge>
      )}
    </>
  )
}
