import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG, importConfig, loadConfig, normalizeConfig, saveConfig, exportConfig } from './config.js'

const location = { id: 'a', label: 'Praha', lat: 50, lon: 14, radiusKm: 10 }
let stored
beforeEach(() => {
  stored = null
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => stored),
    setItem: vi.fn((key, value) => { stored = value }),
  })
  vi.stubGlobal('FileReader', class {
    readAsText(file) { this.onload({ target: { result: file.text } }) }
  })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
const importJSON = data => importConfig({ text: JSON.stringify(data) })

describe('config schema', () => {
  it('fills defaults in older partial config, preserves values and normalizes locations', () => {
    const config = normalizeConfig({ locations: [location], apiKeys: { owm: 'key' }, preferences: { language: 'cs' } })
    expect(config).toEqual({
      ...DEFAULT_CONFIG,
      locations: [{ ...location, dynamic: false }], activeLocationId: 'a',
      apiKeys: { ...DEFAULT_CONFIG.apiKeys, owm: 'key' },
      preferences: { ...DEFAULT_CONFIG.preferences, language: 'cs' },
    })
    config.preferences.theme = 'dark'
    expect(DEFAULT_CONFIG.preferences.theme).toBe('system')
  })

  it('repairs dangling active id and clears it for an empty location list', () => {
    expect(normalizeConfig({ locations: [location], activeLocationId: 'missing' }).activeLocationId).toBe('a')
    expect(normalizeConfig({ activeLocationId: 'missing' }).activeLocationId).toBeNull()
  })

  it('copies only known own fields, preserving valid dynamic caches', () => {
    const config = normalizeConfig({ extra: 'ignored', locations: [{ ...location, dynamic: true,
      placeName: 'Praha', placeNameLat: 50, placeNameLon: 14, extra: 1 }],
      preferences: { extra: true }, apiKeys: { extra: 'ignored' } })
    expect(config).not.toHaveProperty('extra')
    expect(config.preferences).not.toHaveProperty('extra')
    expect(config.apiKeys).not.toHaveProperty('extra')
    expect(config.locations[0]).toEqual({ ...location, dynamic: true, placeName: 'Praha', placeNameLat: 50, placeNameLon: 14 })
  })

  it.each([
    null, [], 4, 'text', { version: 2 }, { locations: null }, { locations: {} },
    { preferences: null }, { apiKeys: null }, { apiKeys: { owm: 123 } },
    { activeLocationId: 123 }, { preferences: { iqrFactor: 0 } },
    { preferences: { iqrFactor: '1.5' } }, { preferences: { refreshIntervalMin: -1 } },
    { preferences: { theme: 'unknown' } }, { preferences: { language: 'unknown' } },
    { preferences: { windyKeyFree: 'false' } },
    { locations: [location, location] }, { locations: [null] },
    { locations: [{ ...location, lat: '50' }] }, { locations: [{ ...location, lat: 91 }] },
    { locations: [{ ...location, lon: -181 }] }, { locations: [{ ...location, radiusKm: 0 }] },
    { locations: [{ ...location, label: ' ' }] }, { locations: [{ ...location, dynamic: 1 }] },
    { locations: [{ ...location, placeNameLat: null }] },
  ])('rejects malformed config on import and falls back safely on load: %j', async data => {
    const before = JSON.stringify({ locations: [location] })
    stored = before
    await expect(importJSON(data)).rejects.toThrow('Invalid config file')
    expect(stored).toBe(before)
    stored = JSON.stringify(data)
    expect(loadConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('rejects non-finite numbers and invalid JSON', async () => {
    expect(() => normalizeConfig({ locations: [{ ...location, lat: Infinity }] })).toThrow()
    expect(() => normalizeConfig({ preferences: { iqrFactor: NaN } })).toThrow()
    await expect(importConfig({ text: '{broken' })).rejects.toThrow('Invalid config file')
    stored = '{broken'
    expect(loadConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('does not persist invalid config', () => {
    expect(saveConfig({ locations: null })).toBe(false)
    expect(localStorage.setItem).not.toHaveBeenCalled()
  })

  it('roundtrips real export, import, save and load including dynamic location caches and flags', async () => {
    const config = normalizeConfig({ ...DEFAULT_CONFIG, locations: [{ ...location, dynamic: true,
      placeName: 'Praha', placeNameLat: 50, placeNameLon: 14 }], activeLocationId: 'a',
      apiKeys: { owm: 'a'.repeat(32), windy: 'b'.repeat(32), tomorrow: '' },
      preferences: { ...DEFAULT_CONFIG.preferences, owmBannerDismissed: true, fontSize: 'xl', iconSet: 'playful' } })
    let blob
    vi.spyOn(URL, 'createObjectURL').mockImplementation(value => { blob = value; return 'blob:test' })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const anchor = { click: vi.fn() }
    vi.stubGlobal('document', { createElement: () => anchor })
    exportConfig(config)
    expect(anchor.click).toHaveBeenCalledOnce()
    const imported = await importConfig({ text: await blob.text() })
    expect(imported).toEqual(config)
    expect(saveConfig(imported)).toBe(true)
    expect(loadConfig()).toEqual(config)
  })
})

describe('prototype safety', () => {
  const marker = 'weatherfusionReviewMarker'
  it.each([
    '{"__proto__":{"weatherfusionReviewMarker":true}}',
    '{"constructor":{"prototype":{"weatherfusionReviewMarker":true}}}',
    '{"preferences":{"__proto__":{"weatherfusionReviewMarker":true}}}',
    '{"locations":[{"prototype":{"weatherfusionReviewMarker":true}}]}',
    '{"unknown":{"nested":{"__proto__":{"weatherfusionReviewMarker":true}}}}',
  ])('rejects dangerous keys at every depth on import and load: %s', async text => {
    const descriptors = Object.getOwnPropertyDescriptors(Object.prototype)
    await expect(importConfig({ text })).rejects.toThrow('Invalid config file')
    stored = text
    expect(loadConfig()).toEqual(DEFAULT_CONFIG)
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(descriptors)
    expect(({})[marker]).toBeUndefined()
    expect(DEFAULT_CONFIG[marker]).toBeUndefined()
  })
})
