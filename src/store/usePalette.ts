/**
 * App state: the open image, the palette slots, settings and the gradient view.
 * Pure palette logic lives in core/palette.ts.
 */
import { create } from 'zustand'
import { getBlock, LATEST_VERSION, VERSIONS, type Category } from '../core/blocks'
import { decodeShare, type SharedPalette } from '../core/exports'
import { toLabImage, type LabImage } from '../core/extract'
import { allowedBlocks, type BlockFilter, type MatchOptions } from '../core/match'
import {
  addSlotAt,
  addSlotForBlock,
  extractSlots,
  MAX_SLOTS,
  moveSlotMarker,
  removeSlot,
  resizeSlots,
  slotsFromEntries,
  toEntries,
  withBlocks,
  withCoverage,
  type Slot,
  type SortMode,
} from '../core/palette'
import { labToHex, hexToLab } from '../core/color'
import { ImageLoadError, loadImage, titleFromFileName, type LoadedImage } from '../render/image'
import { fetchImageFromLink } from '../render/link'
import { DEFAULT_SETTINGS, parseSaved, parseSettings, serializeSettings, type SavedPalette, type Settings } from './settings'
import { readJson, writeJson } from './storage'
import { toast } from './toasts'

export type Tab = 'palette' | 'gradient'
export type { SavedPalette, Settings }

export interface GradientState {
  from: string | null
  to: string | null
  steps: number
}

const SETTINGS_KEY = 'mcpp:settings:v1'
const SAVED_KEY = 'mcpp:saved:v1'
const MAX_SAVED = 40

interface State {
  image: LoadedImage | null
  lab: LabImage | null
  /** Opened from a share link: no image, blocks as shared. */
  shared: boolean
  title: string
  slots: Slot[]
  selected: string | null
  settings: Settings
  seed: number
  tab: Tab
  busy: boolean
  /** What the busy overlay says. */
  busyLabel: string
  error: string | null
  eyedropper: boolean
  gradient: GradientState
  saved: SavedPalette[]

  /** Opens an image file; `title` overrides the title derived from the file name. */
  openImage: (blob: Blob, name: string, title?: string) => Promise<boolean>
  /** Downloads and opens the image behind a link (see render/link.ts). */
  openLink: (link: string) => Promise<boolean>
  openShared: (shared: SharedPalette) => void
  openSaved: (id: string) => void
  goHome: () => void
  setTab: (tab: Tab) => void
  setTitle: (title: string) => void

  setCount: (count: number) => void
  setExtract: (patch: Partial<Pick<Settings, 'variety' | 'vibrancy'>>) => void
  reextract: () => void
  shuffle: () => void
  setFilter: (patch: Partial<BlockFilter>) => void
  toggleCategory: (c: Category, on: boolean) => void
  setMatch: (patch: Partial<MatchOptions>) => void
  setSort: (sort: SortMode) => void
  resetSettings: () => void

  select: (key: string | null) => void
  pickBlock: (key: string, blockId: string) => void
  toggleLock: (key: string) => void
  remove: (key: string) => void
  moveMarker: (key: string, x: number, y: number, final: boolean) => void
  addAt: (x: number, y: number) => void
  addBlock: (blockId: string) => void
  excludeBlock: (blockId: string) => void
  setEyedropper: (on: boolean) => void

  setGradient: (patch: Partial<GradientState>) => void

  savePalette: () => void
  deleteSaved: (id: string) => void
}

const candidatesCache = new WeakMap<BlockFilter, ReturnType<typeof allowedBlocks>>()
/** Blocks allowed by a filter (memoised per filter object). */
export function candidatesFor(filter: BlockFilter) {
  let c = candidatesCache.get(filter)
  if (!c) candidatesCache.set(filter, (c = allowedBlocks(filter)))
  return c
}

export const usePalette = create<State>((set, get) => {
  /** Re-matches unlocked slots after filters or matching options change. */
  const rematch = (settings: Settings) => {
    const { slots, seed } = get()
    set({ settings, slots: withBlocks(slots, candidatesFor(settings.filter), settings.match, { seed }) })
  }
  let extractTimer: ReturnType<typeof setTimeout> | undefined
  /** Full re-extraction, debounced so dragging a slider stays smooth. */
  const scheduleExtract = (delay = 120) => {
    clearTimeout(extractTimer)
    extractTimer = setTimeout(() => {
      const { lab, slots, settings, seed } = get()
      if (!lab) return
      set({ slots: extractSlots(lab, slots, settings, candidatesFor(settings.filter), settings.match, seed) })
    }, delay)
  }

  return {
    image: null,
    lab: null,
    shared: false,
    title: '',
    slots: [],
    selected: null,
    settings: parseSettings(readJson<unknown>(SETTINGS_KEY, null)),
    seed: 1,
    tab: 'palette',
    busy: false,
    busyLabel: '',
    error: null,
    eyedropper: false,
    gradient: { from: null, to: null, steps: 7 },
    saved: parseSaved(readJson<unknown>(SAVED_KEY, null)),

    openImage: async (blob, name, title) => {
      set({ busy: true, busyLabel: 'Reading colours…', error: null })
      try {
        const image = await loadImage(blob, name)
        const lab = toLabImage(image.analysis)
        const { settings } = get()
        const slots = extractSlots(lab, [], settings, candidatesFor(settings.filter), settings.match, 1)
        const prev = get().image
        if (prev) URL.revokeObjectURL(prev.url)
        set({
          image,
          lab,
          shared: false,
          title: title || titleFromFileName(name),
          slots,
          seed: 1,
          selected: null,
          busy: false,
          tab: 'palette',
          eyedropper: false,
          gradient: { ...get().gradient, from: null, to: null },
        })
        if (location.hash) history.replaceState(null, '', location.pathname + location.search)
        return true
      } catch (e) {
        const message = e instanceof ImageLoadError ? e.message : `Couldn’t open that image: ${(e as Error).message}`
        set({ busy: false, error: message })
        toast(message, 'error')
        return false
      }
    },

    openLink: async (link) => {
      set({ busy: true, busyLabel: 'Downloading image…', error: null })
      try {
        const { blob, name, title } = await fetchImageFromLink(link)
        return await get().openImage(blob, name, title)
      } catch (e) {
        const message = e instanceof ImageLoadError ? e.message : `Couldn’t open that link: ${(e as Error).message}`
        set({ busy: false, error: message })
        toast(message, 'error')
        return false
      }
    },

    openShared: (shared) => {
      const prev = get().image
      if (prev) URL.revokeObjectURL(prev.url)
      set({
        image: null,
        lab: null,
        shared: true,
        title: shared.title || 'Shared palette',
        slots: slotsFromEntries(shared.entries),
        selected: null,
        error: null,
        tab: 'palette',
        eyedropper: false,
        gradient: { ...get().gradient, from: null, to: null },
      })
    },

    openSaved: (id) => {
      const p = get().saved.find((s) => s.id === id)
      if (!p) return
      get().openShared({
        title: p.title,
        entries: p.entries.flatMap((e) => {
          const target = hexToLab(e.hex)
          return getBlock(e.blockId) && target ? [{ blockId: e.blockId, target, coverage: e.coverage }] : []
        }),
      })
    },

    goHome: () => {
      const prev = get().image
      if (prev) URL.revokeObjectURL(prev.url)
      set({ image: null, lab: null, shared: false, slots: [], selected: null, error: null, eyedropper: false })
      if (location.hash) history.replaceState(null, '', location.pathname + location.search)
    },

    setTab: (tab) => set({ tab, eyedropper: false }),
    setTitle: (title) => set({ title: title.slice(0, 80) }),

    setCount: (count) => {
      const { lab, slots, settings, seed } = get()
      const locked = slots.filter((s) => s.locked).length
      const next = { ...settings, count: Math.max(Math.max(2, locked), Math.min(MAX_SLOTS, count)) }
      set({ settings: next, slots: resizeSlots(lab, slots, next, candidatesFor(next.filter), next.match, seed) })
    },

    setExtract: (patch) => {
      set({ settings: { ...get().settings, ...patch } })
      scheduleExtract()
    },

    reextract: () => {
      set({ seed: get().seed + 1 })
      scheduleExtract(0)
    },

    shuffle: () => {
      const { slots, settings, seed, lab } = get()
      const nextSeed = seed + 1
      set({ seed: nextSeed, slots: withBlocks(withCoverage(lab, slots), candidatesFor(settings.filter), settings.match, { seed: nextSeed, shuffle: 1 }) })
    },

    setFilter: (patch) => rematch({ ...get().settings, filter: { ...get().settings.filter, ...patch } }),

    toggleCategory: (c, on) => {
      const cats = new Set(get().settings.filter.categories)
      if (on) cats.add(c)
      else cats.delete(c)
      get().setFilter({ categories: [...cats] })
    },

    setMatch: (patch) => rematch({ ...get().settings, match: { ...get().settings.match, ...patch } }),

    setSort: (sort) => set({ settings: { ...get().settings, sort } }),

    resetSettings: () => {
      const { settings } = get()
      const next = { ...DEFAULT_SETTINGS, count: settings.count }
      set({ settings: next })
      scheduleExtract(0)
      if (!get().lab) rematch(next)
    },

    select: (key) => set({ selected: key }),

    pickBlock: (key, blockId) => {
      const { slots, settings, seed } = get()
      const next = slots.map((s) => (s.key === key ? { ...s, blockId, manual: true } : s))
      // Another (unfixed) slot using this block gets re-matched around it
      const cleared = next.map((s) => (s.key !== key && s.blockId === blockId && !s.locked && !s.manual ? { ...s, blockId: null } : s))
      set({ slots: withBlocks(cleared, candidatesFor(settings.filter), settings.match, { seed }) })
    },

    toggleLock: (key) => set({ slots: get().slots.map((s) => (s.key === key ? { ...s, locked: !s.locked } : s)) }),

    remove: (key) => {
      const { lab, slots, settings, selected } = get()
      if (slots.length <= 1) return
      const next = removeSlot(lab, slots, key)
      set({ slots: next, selected: selected === key ? null : selected, settings: { ...settings, count: Math.max(2, next.length) } })
    },

    moveMarker: (key, x, y, final) => {
      const { lab, slots, settings } = get()
      if (!lab) return
      set({ slots: moveSlotMarker(lab, slots, key, x, y, candidatesFor(settings.filter), settings.match, final), selected: key })
    },

    addAt: (x, y) => {
      const { lab, slots, settings } = get()
      if (!lab) return
      const res = addSlotAt(lab, slots, x, y, candidatesFor(settings.filter), settings.match)
      if (!res) {
        if (slots.length >= MAX_SLOTS) toast(`Palettes hold up to ${MAX_SLOTS} blocks. Remove one first.`)
        return
      }
      set({ slots: res.slots, selected: res.key, settings: { ...settings, count: res.slots.length } })
    },

    addBlock: (blockId) => {
      const { lab, slots, settings } = get()
      const block = getBlock(blockId)
      if (!block) return
      if (slots.some((s) => s.blockId === block.id)) {
        toast(`${block.name} is already in the palette.`)
        return
      }
      const res = addSlotForBlock(lab, slots, block, settings.match.surface)
      if (!res) {
        toast(`Palettes hold up to ${MAX_SLOTS} blocks. Remove one first.`)
        return
      }
      set({ slots: res.slots, selected: res.key, settings: { ...settings, count: res.slots.length } })
    },

    excludeBlock: (blockId) => {
      const { settings, slots } = get()
      const excluded = [...new Set([...settings.filter.excluded, blockId])]
      set({ slots: slots.map((s) => (s.blockId === blockId ? { ...s, manual: false, locked: false, blockId: null } : s)) })
      rematch({ ...settings, filter: { ...settings.filter, excluded } })
      const b = getBlock(blockId)
      toast(`${b?.name ?? blockId} won’t be suggested again. You can allow it in Settings → Blocks.`)
    },

    setEyedropper: (on) => set({ eyedropper: on }),

    setGradient: (patch) => set({ gradient: { ...get().gradient, ...patch } }),

    savePalette: () => {
      const { slots, title, image, saved } = get()
      const entries = toEntries(slots).map((e) => ({ blockId: e.blockId, hex: labToHex(e.target), coverage: e.coverage }))
      if (!entries.length) return
      const item: SavedPalette = {
        id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        title: title || 'Untitled palette',
        createdAt: Date.now(),
        entries,
        thumb: image?.thumb,
      }
      const next = [item, ...saved].slice(0, MAX_SAVED)
      if (writeJson(SAVED_KEY, next)) {
        set({ saved: next })
        toast(`Saved “${item.title}” in this browser.`)
      } else if (writeJson(SAVED_KEY, next.map((p) => ({ ...p, thumb: undefined })))) {
        set({ saved: next.map((p) => ({ ...p, thumb: undefined })) })
        toast(`Saved “${item.title}” (without its thumbnail, storage is full).`)
      } else {
        toast('Couldn’t save: this browser is blocking storage.', 'error')
      }
    },

    deleteSaved: (id) => {
      const next = get().saved.filter((p) => p.id !== id)
      writeJson(SAVED_KEY, next)
      set({ saved: next })
    },
  }
})

// Persist settings
usePalette.subscribe((s, prev) => {
  if (s.settings !== prev.settings) writeJson(SETTINGS_KEY, serializeSettings(s.settings))
})

/** Opens a palette from the URL hash, if there is one. */
export function openFromHash(): boolean {
  const shared = decodeShare(location.hash)
  if (!shared) return false
  usePalette.getState().openShared(shared)
  return true
}

export const versionLabel = (i: number) => (i === LATEST_VERSION ? `${VERSIONS[i].id} (latest)` : VERSIONS[i].id)
