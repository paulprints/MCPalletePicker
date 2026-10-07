import clsx from 'clsx'
import { Link2, Upload } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { usePalette } from '../store/usePalette'
import { Button } from './ui'

export const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp,.svg'

/**
 * The two ways in besides drag-and-drop and paste: pick a file, or paste a
 * link to an image (or to a page that has a preview image).
 */
export function ImageSourceForm({ onOpened, compact }: { onOpened?: () => void; compact?: boolean }) {
  const openImage = usePalette((s) => s.openImage)
  const openLink = usePalette((s) => s.openLink)
  const busy = usePalette((s) => s.busy)
  const fileRef = useRef<HTMLInputElement>(null)
  const [link, setLink] = useState('')
  const inputId = useId()

  const submit = async () => {
    if (!link.trim() || busy) return
    if (await openLink(link)) {
      setLink('')
      onOpened?.()
    }
  }

  return (
    <div className={clsx('mx-auto w-full', compact ? 'max-w-none' : 'max-w-xl')}>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="primary" size={compact ? 'md' : 'lg'} onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload size={compact ? 15 : 18} /> Choose image…
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept={ACCEPT}
        data-testid="file-input"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f && (await openImage(f, f.name))) onOpened?.()
        }}
      />
      <div className="my-4 flex items-center gap-3 text-xs text-ink-500" aria-hidden>
        <span className="h-px flex-1 bg-ink-700" />
        or open a link
        <span className="h-px flex-1 bg-ink-700" />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Image link
        </label>
        <div className="relative min-w-0 flex-1">
          <Link2 size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
          <input
            id={inputId}
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onPaste={(e) => e.stopPropagation()}
            placeholder="https://… link to an image or a page"
            className="h-10 w-full rounded-xl border border-ink-600 bg-ink-900 pr-3 pl-9 text-sm placeholder:text-ink-500 focus:border-accent-400 focus:outline-none"
            data-testid="link-input"
          />
        </div>
        <Button type="submit" variant="secondary" className="h-10" disabled={busy || !link.trim()} data-testid="link-submit">
          Open
        </Button>
      </form>
      <p className="mt-2 text-left text-xs text-ink-400">
        A direct image link, or a page with a preview image (Pinterest, DeviantArt, Flickr, Imgur, Wikipedia…). Google and Bing image
        results work too. If a site won’t open, right-click the picture → Copy image address.
      </p>
    </div>
  )
}
