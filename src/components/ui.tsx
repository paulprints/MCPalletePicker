import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' && 'h-7 px-2.5 text-xs',
        size === 'md' && 'h-9 px-3.5 text-sm',
        size === 'lg' && 'h-11 px-5 text-base',
        variant === 'primary' && 'bg-accent-400 text-ink-950 hover:bg-accent-300',
        variant === 'secondary' && 'border border-ink-600 bg-ink-800 text-ink-100 hover:border-ink-500 hover:bg-ink-700',
        variant === 'ghost' && 'text-ink-300 hover:bg-ink-700/70 hover:text-ink-100',
        variant === 'danger' && 'border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20',
        className,
      )}
      {...props}
    />
  )
}

export function IconButton({
  label,
  className,
  active,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={clsx(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-ink-700 hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-35',
        active && 'bg-ink-700 text-accent-300',
        className,
      )}
      {...props}
    />
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  label,
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  label?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-ink-700 bg-ink-850 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-md font-medium transition-colors',
            size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
            value === o.value ? 'bg-ink-600 text-ink-100 shadow-sm' : 'text-ink-400 hover:text-ink-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  hint?: string
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-200" title={hint}>
      <span
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : undefined}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            onChange(!checked)
          }
        }}
        onClick={(e) => {
          e.preventDefault()
          onChange(!checked)
        }}
        className={clsx(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-accent-500' : 'bg-ink-600',
        )}
      >
        <span
          className={clsx('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')}
        />
      </span>
      <span onClick={() => onChange(!checked)}>{label}</span>
    </label>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
  indeterminate,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  className?: string
  indeterminate?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className={clsx('h-4 w-4 shrink-0 cursor-pointer rounded accent-accent-500', className)}
    />
  )
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className={clsx('h-1.5 overflow-hidden rounded-full bg-ink-700', className)}>
      <div
        className={clsx('h-full rounded-full transition-[width]', v >= 1 ? 'bg-accent-400' : 'bg-gold-500')}
        style={{ width: `${v * 100}%` }}
      />
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-ink-200">{children}</kbd>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  wide?: boolean
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-ink-700 bg-ink-850 shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <h2 className="text-base font-semibold text-ink-100">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-ink-700 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export interface MenuItem {
  label: ReactNode
  icon?: ReactNode
  onSelect: () => void
  hint?: string
  disabled?: boolean
  danger?: boolean
}

/** A dropdown/context menu positioned at a point or under an anchor element. */
export function Menu({
  at,
  items,
  onClose,
  header,
}: {
  at: { x: number; y: number }
  items: (MenuItem | 'divider')[]
  onClose: () => void
  header?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(at)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8)),
      y: Math.max(8, Math.min(at.y, window.innerHeight - r.height - 8)),
    })
  }, [at])
  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])
  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-50 min-w-56 overflow-hidden rounded-xl border border-ink-600 bg-ink-850 py-1 shadow-2xl"
    >
      {header && <div className="border-b border-ink-700 px-3 py-2">{header}</div>}
      {items.map((item, i) =>
        item === 'divider' ? (
          <div key={i} className="my-1 border-t border-ink-700" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            title={item.hint}
            onClick={() => {
              item.onSelect()
              onClose()
            }}
            className={clsx(
              'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm disabled:opacity-40',
              item.danger ? 'text-red-300 hover:bg-red-500/15' : 'text-ink-200 hover:bg-ink-700',
            )}
          >
            <span className="flex w-4 justify-center text-ink-400">{item.icon}</span>
            {item.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-ink-500">{icon}</div>}
      <p className="font-medium text-ink-200">{title}</p>
      {children && <div className="text-sm text-ink-400">{children}</div>}
    </div>
  )
}

/** A labelled range slider with the current value shown on the right. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  hint,
  left,
  right,
  testId,
}: {
  label: ReactNode
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  hint?: string
  /** Captions under the ends of the track. */
  left?: string
  right?: string
  testId?: string
}) {
  const id = useId()
  return (
    <div title={hint}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm text-ink-200">
          {label}
        </label>
        <span className="font-mono text-xs text-ink-400 tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        className="slider w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testId}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {(left || right) && (
        <div className="mt-0.5 flex justify-between text-[11px] text-ink-500">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
    </div>
  )
}

/** A small number stepper (− value +). */
export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  label: string
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-ink-600 bg-ink-850" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Fewer ${label.toLowerCase()}`}
        className="h-8 w-8 rounded-l-lg text-lg text-ink-300 hover:bg-ink-700 hover:text-ink-100 disabled:opacity-30"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span className="w-8 text-center font-mono text-sm tabular-nums" aria-live="polite" data-testid="stepper-value">
        {value}
      </span>
      <button
        type="button"
        aria-label={`More ${label.toLowerCase()}`}
        className="h-8 w-8 rounded-r-lg text-lg text-ink-300 hover:bg-ink-700 hover:text-ink-100 disabled:opacity-30"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  )
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  testId,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  className?: string
  testId?: string
}) {
  return (
    <select
      aria-label={label}
      value={value}
      data-testid={testId}
      onChange={(e) => onChange(e.target.value as T)}
      className={clsx(
        'h-9 rounded-lg border border-ink-600 bg-ink-850 px-2.5 text-sm text-ink-100 hover:border-ink-500 focus:border-accent-400 focus:outline-none',
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'info' | 'good'; title?: string }) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[10.5px] font-medium whitespace-nowrap',
        tone === 'neutral' && 'bg-ink-700 text-ink-300',
        tone === 'warn' && 'bg-amber-500/15 text-amber-300',
        tone === 'info' && 'bg-sky-500/15 text-sky-300',
        tone === 'good' && 'bg-accent-400/15 text-accent-300',
      )}
    >
      {children}
    </span>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold tracking-wider text-ink-400 uppercase">{children}</h3>
      {action}
    </div>
  )
}
