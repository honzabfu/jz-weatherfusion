import { afterEach, expect, it, vi } from 'vitest'
import { SOURCES } from './registry.js'

afterEach(() => vi.unstubAllGlobals())

it('forwards a request abort to every provider HTTP call, including all Open-Meteo models and Windy POST', async () => {
  const controller = new AbortController()
  const fetch = vi.fn((url, options) => new Promise((resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
  vi.stubGlobal('fetch', fetch)
  const pending = SOURCES.map(source => source.fetch(
    { lat: 50, lon: 14, radiusKm: 10 }, { owm: 'test', tomorrow: 'test', windy: 'test' }, controller.signal,
  ))
  expect(fetch).toHaveBeenCalledTimes(6)
  for (const [, options] of fetch.mock.calls) expect(options.signal).toBe(controller.signal)
  controller.abort()
  const responses = await Promise.all(pending)
  for (const response of responses) {
    expect(response.readings).toEqual([])
    expect(response.errors.length).toBeGreaterThan(0)
  }
})
