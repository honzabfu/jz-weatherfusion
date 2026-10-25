// src/lib/sources/openmeteo.js

const MODELS = [
  { id: 'best_match',   label: 'Open-Meteo (best match)' },
  { id: 'icon_seamless',label: 'Open-Meteo (ICON)'       },
  { id: 'ecmwf_ifs025', label: 'Open-Meteo (ECMWF)'      },
]

const BASE = 'https://api.open-meteo.com/v1/forecast'
// pressure_msl (sea-level) to match OWM's main.pressure; mixing it with
// surface_pressure produced a ~25 hPa systematic offset across sources.
const PARAMS = 'current=temperature_2m,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation,uv_index&wind_speed_unit=ms'

async function fetchModel(lat, lon, model, signal) {
  const url = `${BASE}?latitude=${lat}&longitude=${lon}&${PARAMS}&models=${model.id}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const c = data.current
  if (!c) throw new Error('No current data')

  return {
    stationId:   `open-meteo-${model.id}`,
    stationName: model.label,
    source:      'open-meteo',
    sourceType:  'model',
    model:       model.id,
    fetchedAt:   new Date().toISOString(),
    metrics: {
      temp:      c.temperature_2m        ?? null,
      humidity:  c.relative_humidity_2m  ?? null,
      pressure:  c.pressure_msl          ?? null,
      windSpeed: c.wind_speed_10m        ?? null,
      windDeg:   c.wind_direction_10m    ?? null,
      clouds:    c.cloud_cover           ?? null,
      precip:    c.precipitation         ?? null,
      uvIndex:   c.uv_index              ?? null,
    }
  }
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ readings: StationReading[], errors: string[] }>}
 */
export async function fetchOpenMeteo(lat, lon, signal) {
  const results = await Promise.allSettled(
    MODELS.map(m => fetchModel(lat, lon, m, signal))
  )

  const readings = []
  const errors = []

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      readings.push(r.value)
    } else {
      errors.push(`${MODELS[i].label}: ${r.reason?.message ?? 'unknown'}`)
    }
  })

  return { readings, errors }
}

export const OPENMETEO_META = {
  key:      'open-meteo',
  label:    'Open-Meteo',
  requiresKey: false,
  models:   MODELS.map(m => m.id),
  url:      'https://open-meteo.com',
}
