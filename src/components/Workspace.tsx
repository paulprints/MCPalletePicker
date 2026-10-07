import clsx from 'clsx'
import { Blend, Grid3x3, ImagePlus, Palette, SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { usePalette, type Tab } from '../store/usePalette'
import { GradientView } from './gradient/GradientView'
import { ImageStage } from './stage/ImageStage'
import { Logo } from './Logo'
import { PalettePanel } from './palette/PalettePanel'
import { PixelArtPanel, PixelArtView } from './pixels/PixelArtView'
import { SettingsPanel } from './settings/SettingsPanel'
import { Button, IconButton, Modal } from './ui'

const TABS: { id: Tab; label: string; icon: React.ReactNode; key: string }[] = [
  { id: 'palette', label: 'Palette', icon: <Palette size={16} />, key: '1' },
  { id: 'gradient', label: 'Gradients', icon: <Blend size={16} />, key: '2' },
  { id: 'pixels', label: 'Pixel art', icon: <Grid3x3 size={16} />, key: '3' },
]

export function Workspace() {
  const tab = usePalette((s) => s.tab)
  const setTab = usePalette((s) => s.setTab)
  const goHome = usePalette((s) => s.goHome)
  const openImage = usePalette((s) => s.openImage)
  const hasImage = usePalette((s) => s.image !== null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 1/2/3 switch tabs when not typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.ctrlKey || e.metaKey || e.altKey || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
      const hit = TABS.find((x) => x.key === e.key)
      if (hit && (hit.id !== 'pixels' || hasImage)) setTab(hit.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTab, hasImage])

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-900/95 px-3 sm:gap-3 sm:px-4">
        <button type="button" onClick={goHome} className="flex items-center gap-2 rounded-lg pr-1 hover:opacity-90" title="Back to start">
          <Logo size={26} />
          <span className="hidden font-semibold tracking-tight md:inline">MC Palette Picker</span>
        </button>
        <nav className="mx-auto flex rounded-xl border border-ink-700 bg-ink-850 p-0.5" role="tablist" aria-label="View">
          {TABS.map((t) => {
            const disabled = t.id === 'pixels' && !hasImage
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                disabled={disabled}
                title={disabled ? 'Pixel art needs an image' : `${t.label} (${t.key})`}
                onClick={() => setTab(t.id)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 sm:px-3',
                  tab === t.id ? 'bg-ink-600 text-ink-100 shadow-sm' : 'text-ink-400 hover:text-ink-200',
                )}
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="flex items-center gap-1.5">
          <IconButton label="Settings" className="xl:hidden" onClick={() => setSettingsOpen(true)}>
            <SlidersHorizontal size={18} />
          </IconButton>
          <Button size="sm" onClick={() => inputRef.current?.click()} title="Open another image (or drop / paste one anywhere)">
            <ImagePlus size={15} />
            <span className="hidden sm:inline">New image</span>
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="workspace-file-input"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void openImage(f, f.name)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-ink-800 bg-ink-900 xl:block" aria-label="Settings">
          <SettingsPanel />
        </aside>
        <main className="flex min-h-[60vh] min-w-0 flex-1 flex-col lg:min-h-0">
          {tab === 'palette' && <ImageStage />}
          {tab === 'gradient' && <GradientView />}
          {tab === 'pixels' && <PixelArtView />}
        </main>
        <aside className="w-full shrink-0 border-t border-ink-800 bg-ink-900 lg:w-[400px] lg:overflow-y-auto lg:border-t-0 lg:border-l">
          {tab === 'pixels' ? <PixelArtPanel /> : <PalettePanel />}
        </aside>
      </div>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
        <div className="-mx-5 -my-4">
          <SettingsPanel />
        </div>
      </Modal>
    </div>
  )
}
