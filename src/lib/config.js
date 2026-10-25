// src/lib/config.js
const STORAGE_KEY = 'pws:config'
const CONFIG_VERSION = 1

export const DEFAULT_CONFIG = {
  version: CONFIG_VERSION,
  locations: [],
  activeLocationId: null,
  apiKeys: {
    owm:      '',
    windy:    '',
    tomorrow: '',
  },
  preferences: {
    language:          'auto',
    theme:             'system',
    units:             'metric',
    iconSet:           'modern',
    windDisplay:       'combined',
    iqrFactor:         1.5,
    refreshIntervalMin: 30,
    fontSize:          'medium',
    windyKeyFree:      true,
    apiKeyBannerDismissed: false,
    owmBannerDismissed: false,
  },
}

// ── Read ──────────────────────────────────────────────────────────────────────
export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULT_CONFIG)
    const parsed = JSON.parse(raw)
    // Validate stored data as strictly as imports, while filling older defaults.
    return normalizeConfig(parsed)
  } catch {
    return structuredClone(DEFAULT_CONFIG)
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────
export function saveConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeConfig(config)))
    return true
  } catch {
    return false
  }
}

// ── Clear ─────────────────────────────────────────────────────────────────────
export function clearConfig() {
  localStorage.removeItem(STORAGE_KEY)
}

// ── Export ────────────────────────────────────────────────────────────────────
export function exportConfig(config) {
  const blob = new Blob(
    [JSON.stringify(config, null, 2)],
    { type: 'application/json' }
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pws-config-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Import ────────────────────────────────────────────────────────────────────
export function importConfig(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result)
        resolve(normalizeConfig(parsed))
      } catch {
        reject(new Error('Invalid config file'))
      }
    }
    reader.onerror = () => reject(new Error('File read error'))
    reader.readAsText(file)
  })
}

// ── Location helpers ──────────────────────────────────────────────────────────
// A `dynamic` location has no fixed coordinates — its lat/lon are resolved from
// the device's geolocation on every refresh. The stored lat/lon are only a
// last-known cache (0/0 until first resolved) used for instant display.
export function newLocation(label, lat, lon, radiusKm = 10, dynamic = false) {
  return {
    id:       crypto.randomUUID(),
    label,
    lat:      Number(lat),
    lon:      Number(lon),
    radiusKm: Number(radiusKm),
    dynamic:  Boolean(dynamic),
  }
}

// ── Config schema ────────────────────────────────────────────────────────────
// Never deep-merge untrusted JSON into objects: inherited keys such as
// __proto__ can otherwise lead to writes into Object.prototype.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const ENUMS = {
  language: ['auto', 'en', 'cs', 'es'],
  theme: ['system', 'light', 'dark'],
  units: ['metric', 'imperial'],
  iconSet: ['standard', 'modern', 'playful'],
  windDisplay: ['combined', 'ms', 'kmh', 'mph', 'beaufort'],
  fontSize: ['small', 'medium', 'large', 'xl'],
}

function requireValid(condition) {
  if (!condition) throw new Error('Invalid config file')
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}

function isNumberIn(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function rejectUnsafeKeys(value) {
  const pending = [value]
  const seen = new Set()
  while (pending.length) {
    const item = pending.pop()
    if (!item || typeof item !== 'object') continue
    requireValid(!seen.has(item))
    seen.add(item)
    for (const key of Object.keys(item)) {
      requireValid(!UNSAFE_KEYS.has(key))
      pending.push(item[key])
    }
  }
}

/** Validate and copy only schema-approved fields; missing fields use defaults. */
export function normalizeConfig(input) {
  requireValid(isRecord(input))
  rejectUnsafeKeys(input)
  const result = structuredClone(DEFAULT_CONFIG)
  if (Object.hasOwn(input, 'version')) requireValid(input.version === CONFIG_VERSION)

  if (Object.hasOwn(input, 'apiKeys')) {
    requireValid(isRecord(input.apiKeys))
    for (const key of Object.keys(result.apiKeys)) {
      if (!Object.hasOwn(input.apiKeys, key)) continue
      requireValid(typeof input.apiKeys[key] === 'string')
      result.apiKeys[key] = input.apiKeys[key]
    }
  }

  if (Object.hasOwn(input, 'preferences')) {
    requireValid(isRecord(input.preferences))
    for (const key of Object.keys(result.preferences)) {
      if (!Object.hasOwn(input.preferences, key)) continue
      const value = input.preferences[key]
      if (ENUMS[key]) requireValid(ENUMS[key].includes(value))
      else if (key === 'iqrFactor') requireValid(isNumberIn(value, 1, 3))
      else if (key === 'refreshIntervalMin') requireValid(isNumberIn(value, 0, 1440))
      else requireValid(typeof value === 'boolean')
      result.preferences[key] = value
    }
  }

  if (Object.hasOwn(input, 'locations')) {
    requireValid(Array.isArray(input.locations))
    const ids = new Set()
    result.locations = input.locations.map(loc => {
      requireValid(isRecord(loc))
      requireValid(typeof loc.id === 'string' && loc.id.trim().length > 0 && !ids.has(loc.id))
      requireValid(typeof loc.label === 'string' && loc.label.trim().length > 0)
      requireValid(isNumberIn(loc.lat, -90, 90) && isNumberIn(loc.lon, -180, 180))
      requireValid(isNumberIn(loc.radiusKm, 1, 100))
      ids.add(loc.id)
      const copied = { id: loc.id, label: loc.label, lat: loc.lat, lon: loc.lon,
        radiusKm: loc.radiusKm, dynamic: false }
      if (Object.hasOwn(loc, 'dynamic')) {
        requireValid(typeof loc.dynamic === 'boolean')
        copied.dynamic = loc.dynamic
      }
      if (Object.hasOwn(loc, 'placeName')) {
        requireValid(typeof loc.placeName === 'string')
        copied.placeName = loc.placeName
      }
      for (const [key, min, max] of [['placeNameLat', -90, 90], ['placeNameLon', -180, 180]]) {
        if (!Object.hasOwn(loc, key)) continue
        requireValid(isNumberIn(loc[key], min, max))
        copied[key] = loc[key]
      }
      return copied
    })
  }

  if (Object.hasOwn(input, 'activeLocationId')) {
    requireValid(input.activeLocationId === null || typeof input.activeLocationId === 'string')
  }
  result.activeLocationId = result.locations.some(loc => loc.id === input.activeLocationId)
    ? input.activeLocationId : result.locations[0]?.id ?? null
  return result
}
