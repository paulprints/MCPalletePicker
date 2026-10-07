import { describe, expect, it } from 'vitest'
import { LATEST_VERSION, VERSIONS } from '../../core/blocks'
import { DEFAULT_SETTINGS, parseSaved, parseSettings, serializeSettings } from '../settings'

const roundTrip = (s: typeof DEFAULT_SETTINGS) => parseSettings(JSON.parse(JSON.stringify(serializeSettings(s))))

describe('settings persistence', () => {
  it('round-trips', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      count: 9,
      variety: 0.8,
      filter: { ...DEFAULT_SETTINGS.filter, version: VERSIONS.findIndex((v) => v.id === '1.20.1'), excluded: ['stone'], allowLight: false },
      match: { ...DEFAULT_SETTINGS.match, surface: 'top' as const },
    }
    expect(roundTrip(s)).toEqual(s)
    expect(roundTrip(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS)
  })

  it('stores the version by id, with “latest” following new releases', () => {
    expect(serializeSettings(DEFAULT_SETTINGS).filter.version).toBe('latest')
    const old = { ...DEFAULT_SETTINGS, filter: { ...DEFAULT_SETTINGS.filter, version: 2 } }
    expect(serializeSettings(old).filter.version).toBe(VERSIONS[2].id)
    expect(parseSettings({ filter: { version: 'latest' } }).filter.version).toBe(LATEST_VERSION)
    // A version this build doesn't know falls back to the latest
    expect(parseSettings({ filter: { version: '0.9' } }).filter.version).toBe(LATEST_VERSION)
  })

  it('survives garbage', () => {
    for (const raw of [null, 42, 'x', [], { count: 'many', filter: 'nope', match: [] }]) expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS)
    const s = parseSettings({
      count: 500,
      variety: -3,
      filter: { categories: ['wood', 'nonsense', 7], excluded: 'stone', survivalOnly: 'yes' },
      match: { surface: 'diagonal', textureWeight: 9 },
      sort: 'random',
    })
    expect(s.count).toBe(12)
    expect(s.variety).toBe(0)
    expect(s.filter.categories).toEqual(['wood'])
    expect(s.filter.excluded).toEqual([])
    expect(s.filter.survivalOnly).toBe(DEFAULT_SETTINGS.filter.survivalOnly)
    expect(s.match).toEqual({ ...DEFAULT_SETTINGS.match, textureWeight: 1 })
    expect(s.sort).toBe('coverage')
  })
})

describe('saved palettes', () => {
  it('keeps valid entries and drops broken ones', () => {
    const saved = parseSaved([
      { id: 'a', title: 'Castle', createdAt: 1, entries: [{ blockId: 'stone', hex: '#7e7e7e', coverage: 0.5 }], thumb: 'data:image/jpeg;base64,xx' },
      { id: 'b', entries: [{ blockId: 'stone', hex: 'not-a-colour' }] },
      { id: 'c', title: 3, entries: [{ blockId: 'oak_planks', hex: 'a58651' }], thumb: 'javascript:alert(1)' },
      'nope',
      { entries: [] },
    ])
    expect(saved.map((p) => p.id)).toEqual(['a', 'c'])
    expect(saved[0].thumb).toBe('data:image/jpeg;base64,xx')
    expect(saved[1]).toMatchObject({ title: 'Untitled palette', thumb: undefined, entries: [{ blockId: 'oak_planks', hex: 'a58651', coverage: 0 }] })
    expect(parseSaved({})).toEqual([])
  })
})
