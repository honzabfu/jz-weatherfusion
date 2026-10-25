// src/lib/sources/tomorrow.js
// Tomorrow.io Realtime Weather — single model point, requires API key.
// https://docs.tomorrow.io/reference/realtime-weather
// With units=metric the provider already returns SI: °C, hPa, m/s, mm/h.

const BASE = 'https://api.tomorrow.io/v4/weather/realtime'

/**
 * @param {number} lat
 * @param {number} lon
 * @param {string} apiKey
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ readings: StationReading[], errors: string[] }>}
 */
export async function fetchTomorrow(lat, lon, apiKey, signal) {
  if (!apiKey) return { readings: [], errors: ['No Tomorrow.io API key'] }

  const url = `${BASE}?location=${lat},${lon}&units=metric&apikey=${apiKey}`

  let data
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error(`Invalid API key (HTTP ${res.status})`)
      if (res.status === 429) throw new Error(`Rate limit exceeded (HTTP 429)`)
      throw new Error(`HTTP ${res.status}`)
    }
    data = await res.json()
  } catch (e) {
    return { readings: [], errors: [`Tomorrow.io: ${e.message}`] }
  }

  const v = data?.data?.values
  if (!v) return { readings: [], errors: ['Tomorrow.io: no current data'] }

  // Realtime exposes per-type intensities (mm/h); fall back across them.
  const precip = v.precipitationIntensity
    ?? v.rainIntensity
    ?? v.snowIntensity
    ?? null

  const reading = {
    stationId:   'tomorrow-io',
    stationName: 'Tomorrow.io',
    source:      'tomorrow',
    sourceType:  'model',
    fetchedAt:   new Date().toISOString(),
    lat:         data?.location?.lat ?? Number(lat),
    lon:         data?.location?.lon ?? Number(lon),
    metrics: {
      temp:      v.temperature          ?? null,
      humidity:  v.humidity             ?? null,
      pressure:  v.pressureSeaLevel ?? v.pressureSurfaceLevel ?? null,
      windSpeed: v.windSpeed            ?? null,
      windDeg:   v.windDirection        ?? null,
      clouds:    v.cloudCover != null ? Math.round(v.cloudCover) : null,
      precip,
      uvIndex:   v.uvIndex              ?? null,
    },
  }

  return { readings: [reading], errors: [] }
}

export const TOMORROW_META = {
  key:         'tomorrow',
  label:       'Tomorrow.io',
  requiresKey: true,
  keyUrl:      'https://www.tomorrow.io',
  keyHint:     'Free plan available — see tomorrow.io for limits',
  keyPattern:  /^[A-Za-z0-9]{32,}$/,
}
