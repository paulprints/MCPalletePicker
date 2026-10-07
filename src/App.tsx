import { ImageDown, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Landing } from './components/Landing'
import { Toasts } from './components/Toasts'
import { Workspace } from './components/Workspace'
import { fetchImage, ImageLoadError } from './render/image'
import { toast } from './store/toasts'
import { openFromHash, usePalette } from './store/usePalette'

/** Opens the first image in a drop/paste, or tries a dragged-in image URL. */
async function openTransfer(data: DataTransfer | null) {
  if (!data) return
  const open = usePalette.getState().openImage
  const file = [...data.files].find((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(f.name)) ?? data.files[0]
  if (file) return open(file, file.name)
  // Images dragged from another tab arrive as a URL
  const uri = data.getData('text/uri-list') || data.getData('text/plain')
  const html = data.getData('text/html')
  const src = html.match(/<img[^>]+src="([^"]+)"/i)?.[1] ?? uri.split('\n').find((l) => /^(https?:|data:image\/)/.test(l.trim()))
  if (!src) return
  try {
    const { blob, name } = await fetchImage(src.trim())
    await open(blob, name)
  } catch (e) {
    toast(e instanceof ImageLoadError ? e.message : 'Couldn’t load that image.', 'error')
  }
}

export default function App() {
  const hasPalette = usePalette((s) => s.image !== null || s.shared)
  const busy = usePalette((s) => s.busy)
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
    // Paste an image (or an image URL) from the clipboard
    const paste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (!e.clipboardData) return
      const hasImage = [...e.clipboardData.items].some((i) => i.type.startsWith('image/'))
      const text = e.clipboardData.getData('text/plain').trim()
      if (!hasImage && !/^https?:\/\/\S+\.(png|jpe?g|webp|gif|avif)(\?\S*)?$/i.test(text)) return
      e.preventDefault()
      if (hasImage) {
        const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))!
        const file = item.getAsFile()
        if (file) void usePalette.getState().openImage(file, file.name && file.name !== 'image.png' ? file.name : 'Pasted image.png')
      } else {
        void openTransfer(e.clipboardData)
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
            <p className="text-sm text-ink-300">PNG · JPEG · WebP · GIF · AVIF · SVG</p>
          </div>
        </div>
      )}
      {busy && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-950/60 backdrop-blur-[2px]" role="status">
          <div className="flex items-center gap-3 rounded-2xl border border-ink-700 bg-ink-850 px-5 py-4 shadow-2xl">
            <Loader2 className="animate-spin text-accent-400" size={20} />
            <span className="text-sm">Reading colours…</span>
          </div>
        </div>
      )}
      <Toasts />
    </>
  )
}
