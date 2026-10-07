import { ImageDown, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Landing } from './components/Landing'
import { Toasts } from './components/Toasts'
import { Workspace } from './components/Workspace'
import { looksLikeLink } from './core/links'
import { openFromHash, usePalette } from './store/usePalette'

/** Opens the first image in a drop, or the image link dragged in from another tab. */
async function openTransfer(data: DataTransfer | null) {
  if (!data) return
  const { openImage, openLink } = usePalette.getState()
  const file = [...data.files].find((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(f.name)) ?? data.files[0]
  if (file) return void openImage(file, file.name)
  // Images dragged from another tab arrive as a URL (prefer the <img> itself over the link around it)
  const html = data.getData('text/html')
  const src = html.match(/<img[^>]+src="([^"]+)"/i)?.[1]?.replace(/&amp;/g, '&')
  const uri = (data.getData('text/uri-list') || data.getData('text/plain')).split(/\r?\n/).find((l) => looksLikeLink(l))
  const link = src && looksLikeLink(src) ? src : uri
  if (link) void openLink(link.trim())
}

export default function App() {
  const hasPalette = usePalette((s) => s.image !== null || s.shared)
  const busy = usePalette((s) => s.busy)
  const busyLabel = usePalette((s) => s.busyLabel)
  const [dragging, setDragging] = useState(false)

  // Palettes shared by link live in the URL hash
  useEffect(() => {
    openFromHash()
    const onHash = () => openFromHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Drop an image anywhere on the page
  useEffect(() => {
    let depth = 0
    const isDrag = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].some((t) => t === 'Files' || t === 'text/uri-list')
    const enter = (e: DragEvent) => {
      if (!isDrag(e)) return
      e.preventDefault()
      depth++
      setDragging(true)
    }
    const over = (e: DragEvent) => {
      if (isDrag(e)) e.preventDefault()
    }
    const leave = (e: DragEvent) => {
      if (!isDrag(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!isDrag(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      void openTransfer(e.dataTransfer)
    }
    // Paste an image, or a link to one, from the clipboard
    const paste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (!e.clipboardData) return
      const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))
      const file = item?.getAsFile()
      const text = e.clipboardData.getData('text/plain').trim()
      if (file) {
        e.preventDefault()
        void usePalette.getState().openImage(file, file.name && file.name !== 'image.png' ? file.name : 'Pasted image.png')
      } else if (looksLikeLink(text)) {
        e.preventDefault()
        void usePalette.getState().openLink(text)
      }
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    window.addEventListener('paste', paste)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
      window.removeEventListener('paste', paste)
    }
  }, [])

  return (
    <>
      {hasPalette ? <Workspace /> : <Landing />}
      {dragging && (
        <div className="animate-fade pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-ink-950/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-accent-400 px-14 py-12 text-center">
            <ImageDown className="text-accent-400" size={40} />
            <p className="text-xl font-semibold">Drop to pick a palette</p>
            <p className="text-sm text-ink-300">An image file, or an image dragged from another tab</p>
          </div>
        </div>
      )}
      {busy && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-950/60 backdrop-blur-[2px]" role="status">
          <div className="flex items-center gap-3 rounded-2xl border border-ink-700 bg-ink-850 px-5 py-4 shadow-2xl">
            <Loader2 className="animate-spin text-accent-400" size={20} />
            <span className="text-sm">{busyLabel || 'Reading colours…'}</span>
          </div>
        </div>
      )}
      <Toasts />
    </>
  )
}
