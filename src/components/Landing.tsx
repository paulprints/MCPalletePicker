import { Blend, Boxes, ClipboardPaste, Grid3x3, ImagePlus, Lock, Palette, Trash2 } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { BLOCKS, DATA_META, getBlock } from '../core/blocks'
import { SAMPLES } from '../samples'
import { toast } from '../store/toasts'
import { usePalette } from '../store/usePalette'
import { BlockIcon } from './BlockIcon'
import { Logo } from './Logo'
import { Button, Kbd } from './ui'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp,.svg'

const HERO_BLOCKS = ['cherry_planks', 'deepslate_tiles', 'moss_block', 'stripped_birch_log', 'light_blue_terracotta', 'copper_block']

export function Landing() {
  const openImage = usePalette((s) => s.openImage)
  const openSaved = usePalette((s) => s.openSaved)
  const deleteSaved = usePalette((s) => s.deleteSaved)
  const saved = usePalette((s) => s.saved)
  const error = usePalette((s) => s.error)
  const busy = usePalette((s) => s.busy)
  const inputRef = useRef<HTMLInputElement>(null)
  const [hover, setHover] = useState(false)

  const openSample = async (src: string, name: string) => {
    try {
      const res = await fetch(src)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await openImage(await res.blob(), name)
    } catch (e) {
      toast(`Couldn’t load the sample: ${(e as Error).message}`, 'error')
    }
  }

  return (
    <div className="min-h-full overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(79,209,197,0.12),transparent_55%)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <span className="font-semibold tracking-tight">MC Palette Picker</span>
        </div>
        <a href="https://github.com/paulprints/MCPalletePicker" className="text-sm text-ink-400 hover:text-ink-100" target="_blank" rel="noreferrer">
          Source
        </a>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-16">
        <section className="pt-6 pb-10 text-center sm:pt-10">
          <div className="mb-6 flex justify-center gap-1.5 sm:gap-2" aria-hidden>
            {HERO_BLOCKS.map((id) => {
              const b = getBlock(id)
              return b ? <BlockIcon key={id} block={b} size={44} /> : null
            })}
          </div>
          <h1 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-balance sm:text-5xl">
            Turn any image into a <span className="text-accent-400">Minecraft block palette</span>.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-ink-300 text-pretty sm:text-lg">
            Drop in concept art, a photo or a painting. You get the blocks that match its colours, matched by texture as well as colour,
            with stair and slab variants, gradients and a pixel-art schematic.
          </p>
        </section>

        <section
          className={`relative mx-auto max-w-3xl rounded-3xl border-2 border-dashed p-8 text-center transition-colors sm:p-12 ${
            hover ? 'border-accent-400 bg-accent-400/5' : 'border-ink-600 bg-ink-850/60'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setHover(true)
          }}
          onDragLeave={() => setHover(false)}
          onDrop={() => setHover(false)}
          data-testid="dropzone"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-400/15 text-accent-400">
            <ImagePlus size={28} />
          </div>
          <p className="text-lg font-semibold">Drop an image here</p>
          <p className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-sm text-ink-400">
            <span>or paste one with</span>
            <Kbd>Ctrl</Kbd>
            <span>+</span>
            <Kbd>V</Kbd>
            <ClipboardPaste size={14} className="ml-0.5" />
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" size="lg" onClick={() => inputRef.current?.click()} disabled={busy}>
              Choose image…
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={ACCEPT}
            data-testid="file-input"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void openImage(f, f.name)
              e.target.value = ''
            }}
          />
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-ink-400">
            <Lock size={13} /> Images are read in your browser and never uploaded.
          </p>
          {error && (
            <div role="alert" className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-left text-sm text-red-200">
              <p className="font-semibold">That image could not be opened</p>
              <p className="mt-0.5 text-red-200/80">{error}</p>
            </div>
          )}
        </section>

        <section className="mx-auto mt-12 max-w-5xl">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-ink-400 uppercase">Or try a painting</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                data-testid={`sample-${s.id}`}
                onClick={() => void openSample(s.src, `${s.title}.jpg`)}
                className="group overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 text-left transition-colors hover:border-accent-400/60 focus-visible:border-accent-400"
              >
                <div className="aspect-[4/3] overflow-hidden bg-ink-950">
                  <img src={s.thumb} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                </div>
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-medium" title={s.title}>
                    {s.title}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    {s.artist}, {s.year}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {saved.length > 0 && (
          <section className="mx-auto mt-12 max-w-5xl" data-testid="saved-palettes">
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-ink-400 uppercase">Your saved palettes</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {saved.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openSaved(p.id)}
                  onKeyDown={(e) => e.key === 'Enter' && openSaved(p.id)}
                  className="group flex cursor-pointer gap-3 rounded-2xl border border-ink-700 bg-ink-850 p-3 transition-colors hover:border-ink-500"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-ink-950">
                    {p.thumb ? (
                      <img src={p.thumb} alt="" className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-ink-600">
                        <Palette size={22} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium">{p.title}</p>
                      <button
                        type="button"
                        aria-label={`Delete ${p.title}`}
                        className="text-ink-500 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-300 focus:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Delete “${p.title}” from this browser?`)) deleteSaved(p.id)
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="mt-2 flex gap-1">
                      {p.entries.slice(0, 8).map((e) => {
                        const b = getBlock(e.blockId)
                        return b ? <BlockIcon key={e.blockId} block={b} size={24} mode="face" /> : null
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Feature icon={<Palette size={20} />} title="Colour-true matching">
            Colours are compared in OKLab, a perceptual colour space, against each block’s real texture averaged the way your eye blends it from a few blocks away.
          </Feature>
          <Feature icon={<ImagePlus size={20} />} title="Pick by hand">
            Drag the markers on your image to re-sample a colour, click to add one, lock the blocks you love and shuffle the rest.
          </Feature>
          <Feature icon={<Blend size={20} />} title="Gradients">
            Fade smoothly between any two blocks, for roofs, walls and terrain transitions.
          </Feature>
          <Feature icon={<Grid3x3 size={20} />} title="Pixel art">
            Rebuild the image in blocks, with dithering, and download it as a Litematica or WorldEdit schematic with a material list.
          </Feature>
        </section>
        <p className="mx-auto mt-8 flex max-w-3xl items-center justify-center gap-2 text-center text-sm text-ink-400">
          <Boxes size={15} /> {BLOCKS.length} full blocks from Minecraft Java {DATA_META.minecraftVersion}, with a filter for older versions back to 1.14.
        </p>
      </main>

      <footer className="border-t border-ink-800 px-5 py-6 text-center text-xs text-ink-500">
        Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft. Block textures are streamed from{' '}
        <a className="underline hover:text-ink-300" href="https://github.com/misode/mcmeta" target="_blank" rel="noreferrer">
          misode/mcmeta
        </a>
        . Sample paintings are in the public domain, via{' '}
        <a className="underline hover:text-ink-300" href="https://commons.wikimedia.org" target="_blank" rel="noreferrer">
          Wikimedia Commons
        </a>
        .
      </footer>
    </div>
  )
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-850/70 p-5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-ink-700 text-accent-400">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-ink-400">{children}</p>
    </div>
  )
}
