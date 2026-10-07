/**
 * Settings and saved palettes, and their (defensive) persistence format.
 * Anything read back from localStorage is validated field by field: it may
 * come from an older version of the app or have been edited by hand.
 */
import { CATEGORIES, LATEST_VERSION, VERSIONS, type Category, type Surface } from '../core/blocks'
import { hexToRgb } from '../core/color'
import { DEFAULT_FILTER, DEFAULT_MATCH, type BlockFilter, type MatchOptions } from '../core/match'
import { MAX_SLOTS, type SortMode } from '../core/palette'

export interface Settings {
  count: number
  variety: number
  vibrancy: number
  filter: BlockFilter
  match: MatchOptions
  sort: SortMode
}

export const DEFAULT_SETTINGS: Settings = {
  count: 6,
  variety: 0.5,
  vibrancy: 0.5,
  filter: DEFAULT_FILTER,
  match: DEFAULT_MATCH,
  sort: 'coverage',
}

export interface SavedPalette {
  id: string
  title: string
  createdAt: number
  entries: { blockId: string; hex: string; coverage: number }[]
  thumb?: string
}

/**
 * The stored form of the settings. The Minecraft version is stored by id
 * ("latest" when the newest was chosen) rather than by index, so it means the
 * same thing after new versions are added.
 */
export type StoredSettings = Omit<Settings, 'filter'> & { filter: Omit<BlockFilter, 'version'> & { version: string } }

export function serializeSettings(s: Settings): StoredSettings {
  return {
    ...s,
    filter: { ...s.filter, version: s.filter.version === LATEST_VERSION ? 'latest' : VERSIONS[s.filter.version].id },
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, fallback: number, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback)
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback)

export function parseSettings(raw: unknown): Settings {
  if (!isObject(raw)) return DEFAULT_SETTINGS
  const f = isObject(raw.filter) ? raw.filter : {}
  const m = isObject(raw.match) ? raw.match : {}
  const known = new Set<string>(CATEGORIES.map((c) => c.id))
  const versionIndex = f.version === 'latest' ? LATEST_VERSION : VERSIONS.findIndex((v) => v.id === f.version)
  const filter: BlockFilter = {
    categories: Array.isArray(f.categories) ? f.categories.filter((c): c is Category => typeof c === 'string' && known.has(c)) : DEFAULT_FILTER.categories,
    survivalOnly: bool(f.survivalOnly, DEFAULT_FILTER.survivalOnly),
    allowGravity: bool(f.allowGravity, DEFAULT_FILTER.allowGravity),
    allowLight: bool(f.allowLight, DEFAULT_FILTER.allowLight),
    allowSeeThrough: bool(f.allowSeeThrough, DEFAULT_FILTER.allowSeeThrough),
    version: versionIndex >= 0 ? versionIndex : LATEST_VERSION,
    excluded: Array.isArray(f.excluded) ? f.excluded.filter((x): x is string => typeof x === 'string').slice(0, 500) : [],
  }
  const match: MatchOptions = {
    surface: oneOf<Surface>(m.surface, ['side', 'top', 'all'], DEFAULT_MATCH.surface),
    textureWeight: num(m.textureWeight, DEFAULT_MATCH.textureWeight, 0, 1),
    preferShapes: bool(m.preferShapes, DEFAULT_MATCH.preferShapes),
  }
  return {
    count: Math.round(num(raw.count, DEFAULT_SETTINGS.count, 2, MAX_SLOTS)),
    variety: num(raw.variety, DEFAULT_SETTINGS.variety, 0, 1),
    vibrancy: num(raw.vibrancy, DEFAULT_SETTINGS.vibrancy, 0, 1),
    filter,
    match,
    sort: oneOf<SortMode>(raw.sort, ['coverage', 'lightness', 'hue'], DEFAULT_SETTINGS.sort),
  }
}

export function parseSaved(raw: unknown): SavedPalette[] {
  if (!Array.isArray(raw)) return []
  const out: SavedPalette[] = []
  for (const p of raw) {
    if (!isObject(p) || typeof p.id !== 'string' || !Array.isArray(p.entries)) continue
    const entries = p.entries.flatMap((e) =>
      isObject(e) && typeof e.blockId === 'string' && typeof e.hex === 'string' && hexToRgb(e.hex)
        ? [{ blockId: e.blockId, hex: e.hex, coverage: num(e.coverage, 0, 0, 1) }]
        : [],
    )
    if (!entries.length) continue
    out.push({
      id: p.id,
      title: typeof p.title === 'string' ? p.title.slice(0, 80) : 'Untitled palette',
      createdAt: num(p.createdAt, 0, 0, Number.MAX_SAFE_INTEGER),
      entries: entries.slice(0, MAX_SLOTS),
      thumb: typeof p.thumb === 'string' && p.thumb.startsWith('data:image/') ? p.thumb : undefined,
    })
  }
  return out
}
