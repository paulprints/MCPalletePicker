import { ArrowLeftRight, ClipboardCopy, Plus, SunMoon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { getBlock, surfaceFace, type BlockInfo } from '../../core/blocks'
import { buildGradient, gradientEnds } from '../../core/gradient'
import { matchQuality } from '../../core/match'
import { copyText } from '../../render/download'
import { toast } from '../../store/toasts'
import { candidatesFor, usePalette } from '../../store/usePalette'
import { BlockIcon } from '../BlockIcon'
import { FaceFill } from '../FaceFill'
import { BlockPicker } from '../palette/BlockPicker'
import { QualityDot } from '../palette/QualityDot'
import { Button, Slider } from '../ui'

export function GradientView() {
  const gradient = usePalette((s) => s.gradient)
  const setGradient = usePalette((s) => s.setGradient)
  const slots = usePalette((s) => s.slots)
  const filter = usePalette((s) => s.settings.filter)
  const surface = usePalette((s) => s.settings.match.surface)
  const addBlock = usePalette((s) => s.addBlock)
  const [picking, setPicking] = useState<'from' | 'to' | null>(null)

  const paletteBlocks = useMemo(() => slots.map((s) => (s.blockId ? getBlock(s.blockId) : undefined)).filter((b): b is BlockInfo => !!b), [slots])
  const ends = gradientEnds(paletteBlocks, surface)
  const from = (gradient.from && getBlock(gradient.from)) || ends?.[0] || getBlock('black_concrete')!
  const to = (gradient.to && getBlock(gradient.to)) || ends?.[1] || getBlock('white_concrete')!
  const steps = useMemo(
    () => buildGradient(from, to, candidatesFor(filter), { steps: gradient.steps, surface }),
    [from, to, filter, gradient.steps, surface],
  )
  const faceOf = (b: BlockInfo) => (surface === 'top' ? b.top : b.side)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6" data-testid="gradient-view">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Block gradient</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-400">
          A smooth run of blocks between two ends, evenly spaced in perceived colour. Good for walls that fade from a dark base, roofs, and terrain
          transitions. It uses the blocks your settings allow.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <Endpoint label="From" block={from} palette={paletteBlocks} onPick={(id) => setGradient({ from: id })} onSearch={() => setPicking('from')} testId="gradient-from" />
        <button
          type="button"
          aria-label="Swap ends"
          title="Swap ends"
          onClick={() => setGradient({ from: to.id, to: from.id })}
          className="mt-8 flex h-9 w-9 items-center justify-center rounded-lg border border-ink-700 text-ink-300 hover:border-ink-500 hover:text-ink-100"
        >
          <ArrowLeftRight size={16} />
        </button>
        <Endpoint label="To" block={to} palette={paletteBlocks} onPick={(id) => setGradient({ to: id })} onSearch={() => setPicking('to')} testId="gradient-to" />
        <div className="w-full max-w-xs min-w-56 flex-1 pt-1">
          <Slider label="Steps" value={gradient.steps} min={3} max={16} onChange={(steps) => setGradient({ steps })} testId="gradient-steps" />
          {ends && (
            <Button size="sm" variant="ghost" className="mt-3" onClick={() => setGradient({ from: ends[0].id, to: ends[1].id })}>
              <SunMoon size={14} /> Palette’s darkest → lightest
            </Button>
          )}
        </div>
      </div>

      <div>
        <div className="flex overflow-hidden rounded-2xl border border-ink-700 shadow-xl" data-testid="gradient-strip">
          {steps.map((s) => (
            <FaceFill key={s.block.id} face={faceOf(s.block)} tile={48} className="h-24 min-w-0 flex-1" />
          ))}
        </div>
        <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          {steps.map((s, i) => {
            const inPalette = paletteBlocks.some((b) => b.id === s.block.id)
            return (
              <li key={s.block.id} className="group flex items-center gap-2.5 rounded-xl border border-ink-700 bg-ink-850 p-2" data-testid="gradient-step">
                <BlockIcon block={s.block} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug font-medium">
                    <span className="text-ink-500">{i + 1}.</span> {s.block.name}
                  </p>
                  <p className="flex items-center gap-1 font-mono text-[10.5px] text-ink-400">
                    {i > 0 && i < steps.length - 1 ? (
                      <>
                        <QualityDot quality={matchQuality(s.deltaE)} /> ΔE {s.deltaE.toFixed(3)}
                      </>
                    ) : (
                      surfaceFace(s.block, surface).hex
                    )}
                  </p>
                </div>
                {!inPalette && (
                  <button
                    type="button"
                    aria-label={`Add ${s.block.name} to the palette`}
                    title="Add to the palette"
                    className="rounded-md p-1 text-ink-500 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-ink-700 hover:text-ink-100 focus:opacity-100"
                    onClick={() => addBlock(s.block.id)}
                  >
                    <Plus size={15} />
                  </button>
                )}
              </li>
            )
          })}
        </ol>
        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            onClick={async () => {
              const ok = await copyText(steps.map((s, i) => `${i + 1}. ${s.block.name} (minecraft:${s.block.id})`).join('\n'))
              toast(ok ? 'Copied the gradient.' : 'Couldn’t copy.')
            }}
          >
            <ClipboardCopy size={14} /> Copy list
          </Button>
        </div>
      </div>

      <BlockPicker
        open={picking !== null}
        onClose={() => setPicking(null)}
        onPick={(b) => setGradient(picking === 'from' ? { from: b.id } : { to: b.id })}
        title={picking === 'from' ? 'Gradient start' : 'Gradient end'}
      />
    </div>
  )
}

function Endpoint({
  label,
  block,
  palette,
  onPick,
  onSearch,
  testId,
}: {
  label: string
  block: BlockInfo
  palette: BlockInfo[]
  onPick: (id: string) => void
  onSearch: () => void
  testId: string
}) {
  return (
    <div className="w-full max-w-64 sm:w-64">
      <p className="mb-1.5 text-xs font-semibold tracking-wider text-ink-400 uppercase">{label}</p>
      <button
        type="button"
        onClick={onSearch}
        data-testid={testId}
        className="flex w-full items-center gap-3 rounded-xl border border-ink-600 bg-ink-850 p-2 text-left hover:border-ink-500"
        title="Choose any block"
      >
        <BlockIcon block={block} size={40} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{block.name}</span>
          <span className="block truncate font-mono text-[11px] text-ink-400">{block.id}</span>
        </span>
      </button>
      {palette.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" aria-label={`${label}: palette blocks`}>
          {palette.map((b) => (
            <button key={b.id} type="button" onClick={() => onPick(b.id)} className="rounded-md p-0.5 hover:bg-ink-700" title={b.name}>
              <BlockIcon block={b} size={24} mode="face" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
