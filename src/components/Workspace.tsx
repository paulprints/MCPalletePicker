import clsx from 'clsx'
import { Blend, ImagePlus, Palette, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePalette, type Tab } from '../store/usePalette'
import { GradientView } from './gradient/GradientView'
import { ImageSourceForm } from './ImageSourceForm'
import { ImageStage } from './stage/ImageStage'
import { Logo } from './Logo'
import { PalettePanel } from './palette/PalettePanel'
import { SettingsPanel } from './settings/SettingsPanel'
import { Button, IconButton, Modal } from './ui'

const TABS: { id: Tab; label: string; icon: React.ReactNode; key: string }[] = [
  { id: 'palette', label: 'Palette', icon: <Palette size={16} />, key: '1' },
  { id: 'gradient', label: 'Gradients', icon: <Blend size={16} />, key: '2' },
]

export function Workspace() {
  const tab = usePalette((s) => s.tab)
  const setTab = usePalette((s) => s.setTab)
  const goHome = usePalette((s) => s.goHome)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [openingNew, setOpeningNew] = useState(false)

  // 1/2 switch tabs when not typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.ctrlKey || e.metaKey || e.altKey || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
      const hit = TABS.find((x) => x.key === e.key)
      if (hit) setTab(hit.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTab])

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-900/95 px-3 sm:gap-3 sm:px-4">
        <button type="button" onClick={goHome} className="flex items-center gap-2 rounded-lg pr-1 hover:opacity-90" title="Back to start">
          <Logo size={26} />
          <span className="hidden font-semibold tracking-tight md:inline">MC Palette Picker</span>
        </button>
        <nav className="mx-auto flex rounded-xl border border-ink-700 bg-ink-850 p-0.5" role="tablist" aria-label="View">
          {TABS.map((t) => {
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                title={`${t.label} (${t.key})`}
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
          <Button size="sm" onClick={() => setOpeningNew(true)} title="Open another image from a file or a link (or drop / paste one anywhere)">
            <ImagePlus size={15} />
            <span className="hidden sm:inline">New image</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-ink-800 bg-ink-900 xl:block" aria-label="Settings">
          <SettingsPanel />
        </aside>
        <main className="flex min-h-[60vh] min-w-0 flex-1 flex-col lg:min-h-0">
          {tab === 'palette' && <ImageStage />}
          {tab === 'gradient' && <GradientView />}
        </main>
        <aside className="w-full shrink-0 border-t border-ink-800 bg-ink-900 lg:w-[400px] lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <PalettePanel />
        </aside>
      </div>

      <Modal open={openingNew} onClose={() => setOpeningNew(false)} title="Open another image">
        <div className="py-2 text-center" data-testid="new-image-dialog">
          <ImageSourceForm compact onOpened={() => setOpeningNew(false)} />
          <p className="mt-4 text-xs text-ink-400">You can also drop or paste an image anywhere. Locked blocks don’t carry over to a new image.</p>
        </div>
      </Modal>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
        <div className="-mx-5 -my-4">
          <SettingsPanel />
        </div>
      </Modal>
    </div>
  )
}
