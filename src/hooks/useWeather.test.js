import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWeather } from './useWeather.js'
import { fetchOpenMeteo } from '../lib/sources/openmeteo.js'
import { fetchWindy } from '../lib/sources/windy.js'

vi.mock('../lib/sources/openmeteo.js', () => ({ fetchOpenMeteo: vi.fn() }))
vi.mock('../lib/sources/windy.js', () => ({ fetchWindy: vi.fn() }))

const A = { id: 'a', label: 'A', lat: 50, lon: 14, radiusKm: 10 }
const B = { id: 'b', label: 'B', lat: 49, lon: 16, radiusKm: 10 }
const reading = (temp, source = 'open-meteo') => ({
  stationId: `${source}-${temp}`, stationName: source, source, sourceType: 'model',
  metrics: { temp, humidity: null, pressure: null, windSpeed: null,
    windDeg: null, clouds: null, precip: null, uvIndex: null },
})
const success = (...readings) => ({ readings, errors: [] })
function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}

let mounted = []
function mount(initial = {}) {
  let value
  let props = { location: A, apiKeys: {}, factor: 1.5, free: true, interval: 0, ...initial }
  function Probe(p) {
    value = useWeather(p.location, p.apiKeys, p.factor, p.interval, p.free, p.onResolve)
    return null
  }
  let root
  act(() => { root = create(createElement(Probe, props)) })
  mounted.push(root)
  return {
    get value() { return value },
    update(next) { props = { ...props, ...next }; act(() => root.update(createElement(Probe, props))) },
    unmount() { act(() => root.unmount()) },
  }
}
const flush = async (fn = () => {}) => { await act(async () => { await fn() }) }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() })
  fetchOpenMeteo.mockResolvedValue(success(reading(20)))
  fetchWindy.mockResolvedValue(success(reading(100, 'windy')))
})
afterEach(() => {
  for (const root of mounted) act(() => root.unmount())
  mounted = []
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('request ownership', () => {
  it('ignores a slow A response after B has completed, even when the source ignores abort', async () => {
    const a = deferred(), b = deferred()
    fetchOpenMeteo.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    const hook = mount()
    const oldSignal = fetchOpenMeteo.mock.calls[0][2]
    hook.update({ location: B })
    expect(oldSignal.aborted).toBe(true)
    await flush(() => b.resolve(success(reading(30))))
    const last = hook.value.lastUpdated
    await flush(() => a.resolve(success(reading(-10))))
    expect(hook.value.result.perMetric.temp.value).toBe(30)
    expect(hook.value.lastUpdated).toBe(last)
    expect(hook.value.sourceStatus['open-meteo'].status).toBe('ok')
    expect(hook.value.log.join('\n')).not.toContain('Fetching for A')
  })

  it('does not let an earlier refresh finish the newer refresh loading state', async () => {
    const first = deferred(), second = deferred()
    fetchOpenMeteo.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const hook = mount()
    let refreshing
    act(() => { refreshing = hook.value.refetch() })
    await flush(() => first.resolve(success(reading(-10))))
    expect(hook.value.loading).toBe(true)
    expect(hook.value.result).toBeNull()
    await flush(async () => { second.resolve(success(reading(25))); await refreshing })
    expect(hook.value.loading).toBe(false)
    expect(hook.value.result.perMetric.temp.value).toBe(25)
  })

  it('ignores a late GPS fix when the user has switched to a fixed location', async () => {
    let resolveGPS
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: vi.fn(ok => { resolveGPS = ok }) } })
    const onResolve = vi.fn()
    const hook = mount({ location: { ...A, dynamic: true }, onResolve })
    hook.update({ location: B })
    await flush()
    await flush(() => resolveGPS({ coords: { latitude: 10, longitude: 20 } }))
    expect(onResolve).not.toHaveBeenCalled()
    expect(fetchOpenMeteo).toHaveBeenCalledTimes(1)
    expect(fetchOpenMeteo.mock.calls[0].slice(0, 2)).toEqual([B.lat, B.lon])
    expect(hook.value.geoError).toBeNull()
  })

  it('aborts on unmount and never commits a late GPS fix', async () => {
    let resolveGPS
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: vi.fn(ok => { resolveGPS = ok }) } })
    const onResolve = vi.fn()
    const hook = mount({ location: { ...A, dynamic: true }, onResolve })
    hook.unmount()
    await flush(() => resolveGPS({ coords: { latitude: 10, longitude: 20 } }))
    expect(onResolve).not.toHaveBeenCalled()
    expect(fetchOpenMeteo).not.toHaveBeenCalled()
  })
})

describe('location scope and refresh triggers', () => {
  it('clears A data immediately and keeps it cleared if B fails', async () => {
    const hook = mount()
    await flush()
    expect(hook.value.result).not.toBeNull()
    const b = deferred()
    fetchOpenMeteo.mockReturnValueOnce(b.promise)
    hook.update({ location: B })
    expect(hook.value.result).toBeNull()
    expect(hook.value.lastUpdated).toBeNull()
    await flush(() => b.resolve({ readings: [], errors: ['offline'] }))
    expect(hook.value.result).toBeNull()
    expect(hook.value.sourceStatus['open-meteo'].status).toBe('error')
  })

  it('clears data, status and loading when the last location is removed', async () => {
    const hook = mount()
    await flush()
    hook.update({ location: null })
    expect(hook.value.result).toBeNull()
    expect(hook.value.lastUpdated).toBeNull()
    expect(hook.value.sourceStatus).toEqual({})
    expect(hook.value.loading).toBe(false)
  })

  it('preserves the last successful result and timestamp on same-location network failure', async () => {
    const hook = mount()
    await flush()
    const last = hook.value.lastUpdated
    fetchOpenMeteo.mockResolvedValueOnce({ readings: [], errors: ['offline'] })
    await flush(() => hook.value.refetch())
    expect(hook.value.result.perMetric.temp.value).toBe(20)
    expect(hook.value.lastUpdated).toBe(last)
  })

  it('refetches on coordinate, radius, dynamic flag and API key changes, but not label edits', async () => {
    const hook = mount()
    await flush()
    hook.update({ location: { ...A, lat: 51 } }); await flush()
    hook.update({ location: { ...A, lat: 51, radiusKm: 100 } }); await flush()
    expect(fetchOpenMeteo).toHaveBeenCalledTimes(3)
    hook.update({ location: { ...A, lat: 51, radiusKm: 100, label: 'renamed' } }); await flush()
    expect(fetchOpenMeteo).toHaveBeenCalledTimes(3)
    hook.update({ apiKeys: { windy: 'test' } }); await flush()
    expect(fetchOpenMeteo).toHaveBeenCalledTimes(4)
    expect(fetchWindy).toHaveBeenCalledTimes(1)
    expect(fetchWindy.mock.calls[0][3]).toBeInstanceOf(AbortSignal)
  })

  it('does not refetch when resolved GPS coordinates or place names are cached in config', async () => {
    const getCurrentPosition = vi.fn(ok => ok({ coords: { latitude: 10, longitude: 20 } }))
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    const onResolve = vi.fn()
    const hook = mount({ location: { ...A, dynamic: true }, onResolve })
    await flush()
    hook.update({ location: { ...A, dynamic: true, lat: 10, lon: 20, placeName: 'Somewhere' } })
    await flush()
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(fetchOpenMeteo).toHaveBeenCalledTimes(1)
    expect(onResolve).toHaveBeenCalledWith(A.id, { lat: 10, lon: 20 })
  })
})

describe('local aggregation preferences', () => {
  it('recomputes IQR immediately without a network request', async () => {
    fetchOpenMeteo.mockResolvedValue(success(...[10, 11, 12, 13, 19].map(t => reading(t))))
    const hook = mount()
    await flush()
    expect(hook.value.result.perMetric.temp.value).toBe(11.5)
    hook.update({ factor: 3 })
    expect(hook.value.result.perMetric.temp.value).toBe(13)
    expect(fetchOpenMeteo).toHaveBeenCalledTimes(1)
  })

  it('reversibly retags Windy from original readings without fetching', async () => {
    const hook = mount({ apiKeys: { windy: 'test' }, free: false })
    await flush()
    expect(hook.value.result.perMetric.temp.value).toBe(60)
    hook.update({ free: true })
    expect(hook.value.result.perMetric.temp.value).toBe(20)
    expect(hook.value.result.rawReadings.find(r => r.source === 'windy').approximate).toBe(true)
    hook.update({ free: false })
    expect(hook.value.result.perMetric.temp.value).toBe(60)
    expect(fetchWindy).toHaveBeenCalledTimes(1)
  })

  it('uses the latest preferences when an in-flight response completes', async () => {
    const pending = deferred()
    fetchOpenMeteo.mockReturnValueOnce(pending.promise)
    const hook = mount({ apiKeys: { windy: 'test' }, free: false })
    hook.update({ free: true, factor: 3 })
    await flush(() => pending.resolve(success(reading(20))))
    expect(hook.value.result.perMetric.temp.value).toBe(20)
    expect(fetchOpenMeteo).toHaveBeenCalledTimes(1)
  })
})
