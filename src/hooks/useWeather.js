// src/hooks/useWeather.js
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { SOURCES, isSourceActive } from '../lib/sources/registry.js'
import { aggregate } from '../lib/aggregate.js'

const STATUS = { idle: 'idle', loading: 'loading', ok: 'ok', error: 'error', noKey: 'no-key' }

// Single geolocation request. Rejects with the native GeolocationPositionError
// so the caller can read its `.code` (1 denied / 2 unavailable / 3 timeout).
function geolocateOnce(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      reject,
      options,
    )
  })
}

// Resolve the device position, with a retry tuned for Safari. Safari in a normal
// tab frequently fails the first fix (POSITION_UNAVAILABLE/timeout) even when the
// permission is granted — a standalone PWA does not — so on failure we retry once
// forcing a fresh high-accuracy fix with a longer timeout. The first attempt is
// fast and may reuse a recent cached fix for quick successive refreshes.
async function getCurrentPosition() {
  if (!navigator.geolocation) throw new Error('Geolocation not supported')
  try {
    return await geolocateOnce({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 })
  } catch {
    try {
      return await geolocateOnce({ enableHighAccuracy: true, timeout: 25000, maximumAge: 0 })
    } catch (err) {
      const label = err?.code === 1 ? 'permission denied'
        : err?.code === 2 ? 'position unavailable'
        : err?.code === 3 ? 'timeout'
        : 'error'
      throw new Error(`Geolocation ${label}${err?.message ? `: ${err.message}` : ''}`)
    }
  }
}

const EMPTY_STATE = {
  key: null, batches: null, sourceStatus: {}, loading: false,
  lastUpdated: null, geoError: null, log: [],
}

export function useWeather(location, apiKeys, iqrFactor, refreshIntervalMin, windyKeyFree = true, onResolveCoords) {
  // GPS coordinates in config are only a cache for dynamic locations. Updating
  // that cache (or a label) must not trigger another geolocation/fetch cycle.
  const lat = location?.dynamic ? null : location?.lat
  const lon = location?.dynamic ? null : location?.lon
  const request = useMemo(() => location ? {
    id: location.id, dynamic: !!location.dynamic, lat, lon,
    radiusKm: location.radiusKm,
    apiKeys: Object.fromEntries(SOURCES.filter(s => s.apiKeyName)
      .map(s => [s.apiKeyName, apiKeys[s.apiKeyName]])),
  } : null, [location?.id, location?.dynamic, lat, lon, location?.radiusKm,
    ...SOURCES.filter(s => s.apiKeyName).map(s => apiKeys[s.apiKeyName])])
  const requestKey = JSON.stringify(request)
  const [state, setState] = useState(EMPTY_STATE)
  const abortRef = useRef(null)
  const scopeRef = useRef(requestKey)
  scopeRef.current = requestKey
  const latestRef = useRef(null)
  latestRef.current = { location, onResolveCoords }

  // Hide old data synchronously, before the location-change effect runs.
  const visible = request && state.key === requestKey ? state : EMPTY_STATE
  const lastUpdatedRef = useRef(null)
  lastUpdatedRef.current = visible.lastUpdated

  // Keep provider data untagged so filtering preferences can be applied locally
  // and reversibly, including while an older network refresh is in flight.
  const result = useMemo(() => {
    if (!visible.batches) return null
    const readings = visible.batches.flatMap(({ source, readings }) => {
      const def = SOURCES.find(s => s.key === source)
      return def?.tagReadings ? def.tagReadings(readings, { windyKeyFree }) : readings
    })
    return aggregate(readings, iqrFactor)
  }, [visible.batches, iqrFactor, windyKeyFree])

  const fetch = useCallback(async () => {
    abortRef.current?.abort()
    if (!request) {
      setState(EMPTY_STATE)
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    const isCurrent = () => !controller.signal.aborted
      && abortRef.current === controller && scopeRef.current === requestKey
    const update = (fn) => {
      if (isCurrent()) setState(prev => isCurrent() ? fn(prev) : prev)
    }
    const addLog = (msg) => update(prev => ({
      ...prev, log: [...prev.log.slice(-49), `${new Date().toLocaleTimeString()} ${msg}`],
    }))
    const status = Object.fromEntries(SOURCES.map(s => [s.key, {
      status: isSourceActive(s, request.apiKeys) ? STATUS.loading : STATUS.noKey,
    }]))
    update(prev => ({
      ...(prev.key === requestKey ? prev : EMPTY_STATE), key: requestKey,
      sourceStatus: status, loading: true, geoError: null, log: [],
    }))

    let loc = { ...latestRef.current.location, ...request }
    if (request.dynamic) {
      addLog('📍 Resolving current position…')
      try {
        const pos = await getCurrentPosition()
        if (!isCurrent()) return
        loc = { ...loc, ...pos }
        // A newly resolved position must not display the previous fix's data.
        update(prev => ({ ...prev, batches: null, lastUpdated: null }))
        latestRef.current.onResolveCoords?.(request.id, pos)
      } catch (e) {
        if (!isCurrent()) return
        addLog(`✗ Geolocation failed: ${e.message}`)
        update(prev => ({
          ...prev, geoError: e.message, loading: false,
          sourceStatus: Object.fromEntries(SOURCES.map(s => [s.key, {
            status: isSourceActive(s, request.apiKeys) ? STATUS.idle : STATUS.noKey,
          }])),
        }))
        return
      }
    }

    addLog(`▶ Fetching for ${loc.label} (${loc.lat}, ${loc.lon})`)
    const active = SOURCES.filter(s => isSourceActive(s, request.apiKeys))
    active.forEach(s => addLog(`${s.key}: fetching…`))
    const settled = await Promise.allSettled(
      active.map(s => s.fetch(loc, request.apiKeys, controller.signal)),
    )
    if (!isCurrent()) return

    const batches = []
    let count = 0
    settled.forEach((res, i) => {
      const s = active[i]
      if (res.status === 'fulfilled') {
        const { readings, errors } = res.value
        batches.push({ source: s.key, readings })
        count += readings.length
        errors.forEach(e => addLog(`  ✗ ${e}`))
        if (errors.length && readings.length === 0) {
          status[s.key] = { status: STATUS.error, error: errors[0] }
        } else {
          addLog(`  ✓ ${s.key}: ${readings.length} readings`)
          status[s.key] = { status: STATUS.ok, count: readings.length, fetchedAt: new Date().toISOString() }
        }
      } else {
        const msg = res.reason?.message ?? 'unknown error'
        addLog(`  ✗ ${s.key}: ${msg}`)
        status[s.key] = { status: STATUS.error, error: msg }
      }
    })
    update(prev => ({
      ...prev, sourceStatus: status, loading: false,
      ...(count > 0 ? { batches, lastUpdated: new Date() } : {}),
    }))
    addLog(count > 0 ? `✓ Loaded ${count} readings` : '✗ No readings from any source')
  }, [request, requestKey])

  // Cleanup invalidates network and GPS completions, including on unmount and
  // React StrictMode's effect replay. Adapters also receive the abort signal.
  useEffect(() => {
    fetch()
    return () => abortRef.current?.abort()
  }, [fetch])

  useEffect(() => {
    if (!request || refreshIntervalMin <= 0) return
    const timer = setInterval(fetch, refreshIntervalMin * 60 * 1000)
    return () => clearInterval(timer)
  }, [fetch, request, refreshIntervalMin])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const staleAfterMs = (refreshIntervalMin > 0 ? refreshIntervalMin : 5) * 60 * 1000
      const last = lastUpdatedRef.current
      if (!last || Date.now() - last.getTime() >= staleAfterMs) fetch()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetch, refreshIntervalMin])

  return {
    result, sourceStatus: visible.sourceStatus, loading: visible.loading,
    lastUpdated: visible.lastUpdated, geoError: visible.geoError,
    log: visible.log, refetch: fetch,
  }
}
