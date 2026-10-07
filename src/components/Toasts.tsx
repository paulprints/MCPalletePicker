import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { useToasts } from '../store/toasts'

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            'animate-toast pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm shadow-xl backdrop-blur',
            t.tone === 'error' ? 'border-red-500/40 bg-red-950/90 text-red-100' : 'border-ink-600 bg-ink-850/95 text-ink-100',
          )}
          role={t.tone === 'error' ? 'alert' : 'status'}
        >
          {t.tone === 'error' ? (
            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-red-300" />
          ) : (
            <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-accent-400" />
          )}
          <span className="flex-1">{t.message}</span>
          <button type="button" aria-label="Dismiss" className="text-ink-400 hover:text-ink-100" onClick={() => dismiss(t.id)}>
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
