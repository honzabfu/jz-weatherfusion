// src/lib/sources/owm.js

const BASE = 'https://api.openweathermap.org/data/2.5/find'

/**
 * @param {number} lat
 * @param {number} lon
 * @param {string} apiKey
 * @param {number} radiusKm
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ readings: StationReading[], errors: string[] }>}
 */
export async function fetchOWM(lat, lon, apiKey, radiusKm = 10, signal) {
  if (!apiKey) return { readings: [], errors: ['No OWM API key'] }

  const url = `${BASE}?lat=${lat}&lon=${lon}&cnt=10&units=metric&appid=${apiKey}`

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
    return { readings: [], errors: [`OWM: ${e.message}`] }
  }

  const list = data.list ?? []

  // Filter by actual distance (OWM cnt doesn't guarantee radius)
  const filtered = list.filter(s => {
    const dlat = s.coord.lat - lat
    const dlon = s.coord.lon - lon
    const cosLat = Math.cos(lat * Math.PI / 180)
    const dist = Math.sqrt(dlat * dlat + (dlon * cosLat) ** 2) * 111
    return dist <= radiusKm
  })

  const readings = filtered.map(s => ({
    stationId:   String(s.id),
    stationName: s.name,
    source:      'owm',
    sourceType:  'station',
    fetchedAt:   new Date().toISOString(),
    lat:         s.coord.lat,
    lon:         s.coord.lon,
    metrics: {
      temp:      s.main?.temp       ?? null,
      humidity:  s.main?.humidity   ?? null,
      pressure:  s.main?.pressure   ?? null,
      windSpeed: s.wind?.speed      ?? null,
      windDeg:   s.wind?.deg        ?? null,
      clouds:    s.clouds?.all      ?? null,
      precip:    s.rain?.['1h']     ?? null,
      uvIndex:   null,
    }
  }))

  return { readings, errors: [] }
}

export const OWM_META = {
  key:         'owm',
  label:       'OpenWeatherMap',
  requiresKey: true,
  keyUrl:      'https://openweathermap.org/api',
  keyHint:     'Free tier: 60 req/min',
  keyPattern:  /^[a-f0-9]{32}$/i,
}
