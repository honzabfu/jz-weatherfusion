// src/lib/sources/windy.js
// Windy Point Forecast API v2 — single GFS model point, requires API key.
// POST https://api.windy.com/api/point-forecast/v2
// Units from API: temp in K, pressure in Pa, wind as u/v components in m/s.
// Returns time-series arrays; we pick the step closest to Date.now().

const BASE = 'https://api.windy.com/api/point-forecast/v2'

const PARAMS = [
  'temp', 'rh', 'pressure',
  'wind',
  'lclouds', 'mclouds', 'hclouds',
  'precip',
]

/**
 * @param {number} lat
 * @param {number} lon
 * @param {string} apiKey
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ readings: StationReading[], errors: string[] }>}
 */
export async function fetchWindy(lat, lon, apiKey, signal) {
  if (!apiKey) return { readings: [], errors: ['No Windy API key'] }

  let data
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat:        Number(lat),
        lon:        Number(lon),
        model:      'gfs',
        parameters: PARAMS,
        levels:     ['surface'],
        key:        apiKey,
      }),
    })
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error(`Invalid API key (HTTP ${res.status})`)
      if (res.status === 429) throw new Error(`Rate limit exceeded (HTTP 429)`)
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}${text ? ': ' + text : ''}`)
    }
    data = await res.json()
  } catch (e) {
    return { readings: [], errors: [`Windy: ${e.message}`] }
  }

  const ts = data?.ts
  if (!Array.isArray(ts) || ts.length === 0) {
    return { readings: [], errors: ['Windy: missing time series'] }
  }

  // Pick the step whose timestamp is closest to now.
  // Windy ts values are Unix seconds; Date.now() is ms — divide to match.
  const now = Date.now() / 1000
  const idx = ts.reduce(
    (best, t, i) => Math.abs(t - now) < Math.abs(ts[best] - now) ? i : best,
    0,
  )

  const get = (param) => {
    const arr = data[`${param}-surface`]
    if (!Array.isArray(arr)) return null
    const v = arr[idx]
    return v != null && isFinite(v) ? v : null
  }

  // Temperature: K → °C
  const tempK = get('temp')

  // Relative humidity (%) — keep null when the field is unavailable
  const rh = get('rh')

  // Pressure: Pa → hPa
  const pressurePa = get('pressure')

  // Wind: u/v components → speed + meteorological direction
  const u = get('wind_u')
  const v = get('wind_v')
  const windSpeed = (u != null && v != null) ? Math.hypot(u, v) : null
  const windDeg   = (u != null && v != null)
    ? (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360
    : null

  // Total cloud cover from three layers (probability-union formula)
  const cl = get('lclouds')
  const cm = get('mclouds')
  const ch = get('hclouds')
  const clouds = (cl != null || cm != null || ch != null)
    ? Math.round(100 * (1 - (1 - (cl ?? 0) / 100) * (1 - (cm ?? 0) / 100) * (1 - (ch ?? 0) / 100)))
    : null

  return {
    readings: [{
      stationId:   'windy-gfs',
      stationName: 'Windy (GFS)',
      source:      'windy',
      sourceType:  'model',
      fetchedAt:   new Date().toISOString(),
      lat:         Number(lat),
      lon:         Number(lon),
      metrics: {
        temp:      tempK      != null ? tempK - 273.15 : null,
        humidity:  rh != null ? Math.round(rh) : null,
        pressure:  pressurePa != null ? pressurePa / 100 : null,
        windSpeed,
        windDeg,
        clouds,
        precip:    get('precip'),
        uvIndex:   null,
      },
    }],
    errors: [],
  }
}

export const WINDY_META = {
  key:         'windy',
  label:       'Windy',
  requiresKey: true,
  keyUrl:      'https://api.windy.com/point-forecast',
  keyHint:     'Free tier (testing only, data deliberately shuffled/modified) — 500 req/day',
  keyPattern:  /^[A-Za-z0-9]{32,}$/,
}
