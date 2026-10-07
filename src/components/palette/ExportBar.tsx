import { Bookmark, Braces, ClipboardCopy, Download, ImageDown, Link2, ListOrdered, Terminal } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { DATA_META, VERSIONS } from '../../core/blocks'
import { encodeShare, paletteJson, paletteText, worldEditPattern } from '../../core/exports'
import { toEntries } from '../../core/palette'
import { loadAtlas, type Atlas } from '../../render/atlas'
import { renderCard } from '../../render/card'
import { canvasToBlob, copyPng, copyText, downloadBlob, slug } from '../../render/download'
import { toast } from '../../store/toasts'
import { usePalette } from '../../store/usePalette'
import { useSortedSlots } from '../hooks'
import { SectionTitle } from '../ui'

/** The atlas if it loads within a few seconds; cards fall back to flat colours. */
async function atlasOrNull(): Promise<Atlas | null> {
  try {
    return await Promise.race([loadAtlas(), new Promise<null>((r) => setTimeout(() => r(null), 6000))])
  } catch {
    return null
  }
}

async function loadImg(url: string): Promise<HTMLImageElement | undefined> {
  const img = new Image()
  img.src = url
  try {
    await img.decode()
    return img
  } catch {
    return undefined
  }
}

export function ExportBar() {
  const slots = useSortedSlots()
  const title = usePalette((s) => s.title)
  const image = usePalette((s) => s.image)
  const surface = usePalette((s) => s.settings.match.surface)
  const version = usePalette((s) => VERSIONS[s.settings.filter.version].id)
  const savePalette = usePalette((s) => s.savePalette)
  const [busy, setBusy] = useState(false)
  const entries = toEntries(slots)
  const name = slug(title)
  const empty = entries.length === 0

  const card = async () => {
    const [atlas, img] = await Promise.all([atlasOrNull(), image ? loadImg(image.url) : Promise.resolve(undefined)])
    return canvasToBlob(renderCard({ title, entries, surface, minecraftVersion: version, atlas, image: img }))
  }

  const run = async (fn: () => Promise<void> | void) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string, what: string) => toast((await copyText(text)) ? `Copied ${what}.` : `Couldn’t copy ${what}.`, 'info')

  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-850/60 p-3" data-testid="exports">
      <SectionTitle>Use this palette</SectionTitle>
      <div className="grid grid-cols-2 gap-1.5">
        <Action icon={<ImageDown size={15} />} label="Download card" hint="A PNG of the image and its blocks" disabled={empty || busy} testId="export-card" onClick={() => run(async () => downloadBlob(await card(), `${name}.png`))} />
        <Action
          icon={<ClipboardCopy size={15} />}
          label="Copy card"
          hint="Copy the card image to the clipboard"
          disabled={empty || busy}
          onClick={() => run(async () => toast((await copyPng(await card())) ? 'Copied the palette card.' : 'Your browser can’t copy images. Use Download card instead.'))}
        />
        <Action
          icon={<Terminal size={15} />}
          label="WorldEdit pattern"
          hint="e.g. //set 40%stone_bricks,35%andesite,25%tuff — blocks weighted by their share of the image"
          disabled={empty}
          testId="export-worldedit"
          onClick={() => copy(worldEditPattern(entries), 'the WorldEdit pattern')}
        />
        <Action icon={<ListOrdered size={15} />} label="Copy block list" hint="Names, ids and shares as text" disabled={empty} onClick={() => copy(paletteText(entries, title), 'the block list')} />
        <Action
          icon={<Link2 size={15} />}
          label="Copy share link"
          hint="A link that opens this palette (the image isn’t included)"
          disabled={empty}
          testId="export-link"
          onClick={() => {
            const url = `${location.origin}${location.pathname}#${encodeShare(entries, title)}`
            void copy(url, 'a link to this palette')
          }}
        />
        <Action
          icon={<Braces size={15} />}
          label="Download JSON"
          hint="Block ids, names, shares, source colours and stair/slab/wall ids"
          disabled={empty}
          testId="export-json"
          onClick={() => downloadBlob(paletteJson(entries, { title, minecraftVersion: version || DATA_META.minecraftVersion }), `${name}.json`, 'application/json')}
        />
        <Action icon={<Bookmark size={15} />} label="Save in browser" hint="Keep it on the start page" disabled={empty} testId="export-save" onClick={savePalette} />
        <Action
          icon={<Download size={15} />}
          label="Download text"
          hint="The block list as a .txt file"
          disabled={empty}
          onClick={() => downloadBlob(paletteText(entries, title) + '\n\nWorldEdit: //set ' + worldEditPattern(entries) + '\n', `${name}.txt`, 'text/plain')}
        />
      </div>
    </section>
  )
}

function Action({ icon, label, hint, onClick, disabled, testId }: { icon: ReactNode; label: string; hint: string; onClick: () => void; disabled?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      title={hint}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-2 text-left text-[13px] text-ink-200 transition-colors hover:border-ink-500 hover:bg-ink-800 disabled:opacity-40"
    >
      <span className="text-accent-400">{icon}</span>
      {label}
    </button>
  )
}
