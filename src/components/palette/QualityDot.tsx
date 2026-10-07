import clsx from 'clsx'
import { QUALITY_LABEL, type MatchQuality } from '../../core/match'

const COLORS: Record<MatchQuality, string> = {
  excellent: 'bg-emerald-400',
  good: 'bg-lime-300',
  fair: 'bg-amber-400',
  rough: 'bg-red-400',
}

export function QualityDot({ quality, className }: { quality: MatchQuality; className?: string }) {
  return <span aria-label={QUALITY_LABEL[quality]} title={QUALITY_LABEL[quality]} className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', COLORS[quality], className)} />
}
