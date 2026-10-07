import clsx from 'clsx'
import { RefreshCw, RotateCcw, X } from 'lucide-react'
import { useMemo } from 'react'
import { BLOCKS, CATEGORIES, getBlock, VERSIONS } from '../../core/blocks'
import { allowedBlocks } from '../../core/match'
import { candidatesFor, usePalette, versionLabel } from '../../store/usePalette'
import { Button, SectionTitle, Segmented, Select, Slider, Toggle } from '../ui'

const pct = (v: number) => `${Math.round(v * 100)}%`

export function SettingsPanel() {
  const settings = usePalette((s) => s.settings)
  const hasImage = usePalette((s) => s.lab !== null)
  const setExtract = usePalette((s) => s.setExtract)
  const reextract = usePalette((s) => s.reextract)
  const setMatch = usePalette((s) => s.setMatch)
  const setFilter = usePalette((s) => s.setFilter)
  const toggleCategory = usePalette((s) => s.toggleCategory)
  const resetSettings = usePalette((s) => s.resetSettings)
  const { filter, match } = settings
  const allowed = candidatesFor(filter)

  // Blocks per category under the other filters, for the chip counts
  const perCategory = useMemo(() => {
    const all = allowedBlocks({ ...filter, categories: CATEGORIES.map((c) => c.id) })
    const counts = new Map<string, number>()
    for (const b of all) counts.set(b.category, (counts.get(b.category) ?? 0) + 1)
    return counts
  }, [filter])
  const enabled = new Set(filter.categories)

  return (
    <div className="space-y-6 p-4" data-testid="settings">
      {hasImage && (
        <section>
          <SectionTitle
            action={
              <button type="button" onClick={reextract} className="flex items-center gap-1 text-xs text-ink-400 hover:text-accent-300" title="Pick the colours again (locked blocks stay)">
                <RefreshCw size={12} /> Re-extract
              </button>
            }
          >
            Colours from the image
          </SectionTitle>
          <div className="space-y-4">
            <Slider
              label="Variety"
              value={settings.variety}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              left="Most common"
              right="Most different"
              hint="Low: the colours that cover the most of the image. High: colours as different from each other as possible."
              onChange={(variety) => setExtract({ variety })}
              testId="variety"
            />
            <Slider
              label="Vivid accents"
              value={settings.vibrancy}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              left="By area"
              right="Boost vivid"
              hint="Higher values let small, saturated details (a red door, a sunset) claim a block even if they cover little of the image."
              onChange={(vibrancy) => setExtract({ vibrancy })}
              testId="vibrancy"
            />
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Matching</SectionTitle>
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm text-ink-200">Blocks will be seen as</p>
            <Segmented
              label="Surface"
              value={match.surface}
              onChange={(surface) => setMatch({ surface })}
              options={[
                { value: 'side', label: 'Walls', title: 'Match the side of each block' },
                { value: 'top', label: 'Floors', title: 'Match the top of each block (log rings, grass tops)' },
                { value: 'all', label: 'Both', title: 'Average all faces' },
              ]}
            />
          </div>
          <Slider
            label="Texture matching"
            value={match.textureWeight}
            min={0}
            max={1}
            step={0.05}
            format={pct}
            left="Colour only"
            right="Match busyness"
            hint="Smooth areas of the image prefer smooth blocks (concrete), busy areas prefer busy blocks (cobblestone, leaves)."
            onChange={(textureWeight) => setMatch({ textureWeight })}
          />
          <Toggle
            checked={match.preferShapes}
            onChange={(preferShapes) => setMatch({ preferShapes })}
            label="Prefer blocks with stairs & slabs"
            hint="A small bonus for blocks you can also get as stairs and slabs, which most builds need."
          />
        </div>
      </section>

      <section>
        <SectionTitle>Blocks</SectionTitle>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm text-ink-200">Minecraft version</span>
            <Select
              label="Minecraft version"
              className="w-full"
              value={String(filter.version)}
              onChange={(v) => setFilter({ version: Number(v) })}
              options={VERSIONS.map((_, i) => ({ value: String(i), label: versionLabel(i) })).reverse()}
              testId="version"
            />
          </label>
          <div>
            <p className="mb-2 text-sm text-ink-200">
              Materials{' '}
              <span className="text-ink-400" data-testid="allowed-count">
                ({allowed.length} of {BLOCKS.length} blocks)
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => {
                const on = enabled.has(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    title={c.hint}
                    onClick={() => toggleCategory(c.id, !on)}
                    className={clsx(
                      'rounded-lg border px-2 py-1 text-xs transition-colors',
                      on ? 'border-accent-500/50 bg-accent-400/12 text-accent-300' : 'border-ink-700 bg-ink-850 text-ink-400 hover:text-ink-200',
                    )}
                  >
                    {c.label} <span className="opacity-60">{perCategory.get(c.id) ?? 0}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-2.5">
            <Toggle checked={filter.survivalOnly} onChange={(survivalOnly) => setFilter({ survivalOnly })} label="Survival-obtainable only" hint="Leave out bedrock, command blocks, budding amethyst, spawners…" />
            <Toggle checked={filter.allowGravity} onChange={(allowGravity) => setFilter({ allowGravity })} label="Falling blocks" hint="Sand, red sand, gravel and concrete powder fall when unsupported." />
            <Toggle checked={filter.allowLight} onChange={(allowLight) => setFilter({ allowLight })} label="Light sources" hint="Glowstone, sea lanterns, shroomlights, froglights, magma…" />
            <Toggle checked={filter.allowSeeThrough} onChange={(allowSeeThrough) => setFilter({ allowSeeThrough })} label="See-through blocks" hint="Glass, ice, leaves, slime, honey and copper grates." />
          </div>
          {filter.excluded.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm text-ink-200">Never suggest</p>
              <div className="flex flex-wrap gap-1.5">
                {filter.excluded.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-850 py-0.5 pr-1 pl-2 text-xs text-ink-300">
                    {getBlock(id)?.name ?? id}
                    <button
                      type="button"
                      aria-label={`Allow ${getBlock(id)?.name ?? id} again`}
                      className="rounded p-0.5 text-ink-500 hover:bg-ink-700 hover:text-ink-100"
                      onClick={() => setFilter({ excluded: filter.excluded.filter((x) => x !== id) })}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <Button variant="ghost" size="sm" onClick={resetSettings} className="w-full">
        <RotateCcw size={14} /> Reset settings
      </Button>
    </div>
  )
}
