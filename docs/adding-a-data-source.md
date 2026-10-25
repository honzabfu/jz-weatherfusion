# Adding a data source

Open-Meteo, OpenWeatherMap, Tomorrow.io and Windy are already implemented.
This guide describes adding another provider to the current registry-based app.

## Check provider behavior first

This is a client-only app. Verify the intended endpoint, request method, browser
CORS behavior, API plan, units and timestamps before implementing its adapter.
Do not infer an individual physical sensor from a city name or response id.
OWM is currently tagged `station` by the application, but its current-weather
product combines multiple upstream inputs; see [OWM's description](https://openweathermap.org/current).

## Reading and fetch contract

Every adapter returns `{ readings, errors }`. Preserve partial successes, report
provider failures in `errors`, and use numbers or `null` for metrics:

```js
{
  stationId: 'provider-unique-id',
  stationName: 'Human-readable name',
  source: 'example',              // matches the registry key
  sourceType: 'model',            // or 'station' for a verified observation source
  fetchedAt: new Date().toISOString(),
  lat: 50, lon: 14,              // optional coordinates
  metrics: {
    temp: null,                  // °C
    humidity: null,              // %
    pressure: null,              // hPa, prefer sea-level pressure
    windSpeed: null,             // m/s
    windDeg: null,               // meteorological degrees: 0 = from north
    clouds: null,                // %
    precip: null,                // mm/h
    uvIndex: null,
  },
}
```

Convert provider units in the adapter. User-unit conversion belongs to
[units.js](../src/lib/units.js) at display time. `fetchedAt` records fetch time;
it must not be described as the provider's observation timestamp.

Adapter signatures vary with the provider; the optional AbortSignal is last:

| Adapter | Arguments |
| --- | --- |
| `fetchOpenMeteo` | `(lat, lon, signal)` |
| `fetchOWM` | `(lat, lon, apiKey, radiusKm = 10, signal)` |
| `fetchTomorrow` / `fetchWindy` | `(lat, lon, apiKey, signal)` |

Forward the signal to every HTTP request, including parallel model requests and
POST requests. Request ownership in `useWeather` prevents aborted or stale
responses from committing state even if a provider does not honor cancellation.

## Implementation steps

1. Create `src/lib/sources/example.js`, exporting its fetch function and a
   descriptive `EXAMPLE_META` object. Model single-endpoint error handling on
   [tomorrow.js](../src/lib/sources/tomorrow.js), parallel partial results on
   [openmeteo.js](../src/lib/sources/openmeteo.js). A possible keyed adapter
   signature is `fetchExample(lat, lon, apiKey, signal)`.
2. Add the provider to [registry.js](../src/lib/sources/registry.js):

   ```js
   {
     key: 'example',
     labelKey: 'sourceExample',
     apiKeyName: 'example', // null for a keyless provider
     fetch: (loc, apiKeys, signal) =>
       fetchExample(loc.lat, loc.lon, apiKeys.example, signal),
     // Optional pure, non-mutating tagReadings(readings, { windyKeyFree }).
   }
   ```

   For a keyless provider, pass only the arguments its adapter needs. The
   registry controls activation, parallel fetching and API-key query identity.
   No provider-specific block or dependency-array edit is needed in `useWeather`.
3. For a keyed provider, add `apiKeys.example: ''` in
   [DEFAULT_CONFIG](../src/lib/config.js) and its UI metadata in `API_KEY_META`
   in [SettingsModal.jsx](../src/components/SettingsModal.jsx). `normalizeConfig`
   derives allowed API-key names from defaults; unknown keys are discarded.
   A new preference must also be added to defaults and validated with the
   appropriate enum/number/boolean rule. Do not reintroduce generic deep merge.
4. Add labels, key hints and relevant explanatory text in all three languages
   in [i18n.js](../src/lib/i18n.js). Settings does not automatically use adapter
   `*_META` exports. Review source colors in `StationsTable` and `StationDetail`:
   unknown providers currently use the neutral fallback color. Sources displays
   registry ids; not every view resolves `labelKey` to a display name.
5. Review [vite.config.js](../vite.config.js) caching. A host rule without a
   method matches GET by default; adding it does not make POST offline-capable.
   Decide whether responses can be safely cached, and test actual offline
   behavior. Current weather GET caches expire after 300 seconds.
6. Add adapter tests for normalization, missing values, errors, timestamps and
   cancellation. Extend [registry.test.js](../src/lib/sources/registry.test.js):
   it activates all providers and currently expects six HTTP calls. Supply the
   new test key/fixture and update expectations to cover the new provider.
   Review the browser scripts' network mocks if a new keyless provider becomes
   active by default.

## Aggregation behavior to account for

[aggregate.js](../src/lib/aggregate.js) excludes approximate readings, prefers
`station` entries, then applies IQR independently per scalar metric. If no
preferred entries provide a metric, non-approximate models fill that metric and
`usedFallback` is set. Without any stations, the model pool is used directly.
Wind direction uses a circular mean of the preferred pool without this fallback.

Store original, untagged readings; optional tagging must not mutate them. The
hook recomputes tagging and aggregation when IQR or `windyKeyFree` changes,
without network calls. `tagReadings` currently receives only `{ windyKeyFree }`;
additional tagging options require explicit hook wiring and tests.

Each reading has equal weight within its metric's chosen pool. Three Open-Meteo
entries are not necessarily three independent models (`best_match` can overlap
ICON/ECMWF). Table `isOutlier` flags use temperature only, while other metrics
are filtered separately. A model tagged `excludedBySourceType` may still provide
fallback values such as UV or precipitation.

## Existing provider details

- **Tomorrow.io:** realtime endpoint, metric units; uses
  `pressureSeaLevel ?? pressureSurfaceLevel`,
  `precipitationIntensity ?? rainIntensity ?? snowIntensity`, and rounds cloud
  cover. Read the provider's current plan limits rather than copying old quotas.
- **Windy:** Point Forecast v2 POST with GFS and `levels: ['surface']`; requests
  `temp`, `rh`, `pressure`, `wind`, `lclouds`, `mclouds`, `hclouds`, `precip`.
  Converts K → °C, Pa → hPa, u/v → `Math.hypot(u, v)` and meteorological direction
  `(Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360`. UV is always null.
  [Provider docs](https://api.windy.com/point-forecast/docs) define `ts` in
  milliseconds, so nearest-time selection should compare to `Date.now()`.
  The existing adapter assumes seconds: follow-up [#59](https://github.com/honzabfu/jz-weatherfusion/issues/59).
  Only readings tagged approximate (free-tier preference enabled by default)
  are always excluded; disabling that preference lets Windy into the model pool.
- **OWM:** requests up to ten `/find` entries and applies a local approximate
  radius filter. Maps rain if supplied; UV remains null. The app's `station`
  classification does not establish PWS sensor provenance.
- **Open-Meteo:** three current-weather model requests, including `best_match`;
  maps `current.uv_index` when present. Do not assume UV is available or shared
  between models without inspecting the actual responses.

## Verification

Run `npm run test:run`, `npm run build` and `git diff --check`. Use the dev app
with a location and the intended key/plan to verify Sources status/debug logs,
Stations details, units and actual browser CORS. Model readings need not affect
metrics already supplied by the preferred station pool; approximate readings
must remain visible but excluded. Verify cancellation and switches between
locations. Use the production preview for PWA/cache checks.

See [development.md](development.md) for reproducible browser checks. Mocked
regressions do not establish live API availability or real-device GPS behavior.
