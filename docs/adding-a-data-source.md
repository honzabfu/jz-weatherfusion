# Adding a data source

How to wire a new weather provider into the aggregator. Open-Meteo, OWM,
Windy and Tomorrow.io are already implemented; their modules provide examples.

## What's already wired (don't redo)
- `apiKeys.windy` / `apiKeys.tomorrow` slots — [src/lib/config.js](../src/lib/config.js)
- API-key inputs + validation — `API_KEY_META` in [src/components/SettingsModal.jsx](../src/components/SettingsModal.jsx)
- Labels — `keyWindy`/`keyTomorrow`, `sourceWindy`/`sourceTomorrow` in [src/lib/i18n.js](../src/lib/i18n.js)

For a *brand-new* provider (not these two) you also add the key slot, the
`API_KEY_META` entry, and those i18n keys.

## The contract
Every source module exports `fetch<Name>()` returning `{ readings, errors }` and
a `<NAME>_META` object. A **reading** is a `StationReading`:

```js
{
  stationId:   String,          // unique per data point
  stationName: String,          // shown in Stations tab
  source:      '<name>',        // matches the apiKeys/status key
  sourceType:  'model',         // 'station' for physical sensors
  fetchedAt:   new Date().toISOString(),
  lat, lon,                     // optional, for distance filtering
  metrics: {
    temp,      // °C
    humidity,  // %
    pressure,  // hPa (sea-level / surface)
    windSpeed, // m/s
    windDeg,   // degrees (meteorological: 0 = from N)
    clouds,    // %
    precip,    // mm/h
    uvIndex,   // unitless, or null
  }
}
```

**All metrics are SI** — convert in the source module, not downstream
([units.js](../src/lib/units.js) only converts at *display* time). Use `?? null`
for anything the provider doesn't supply.

## Steps

### 1. Create `src/lib/sources/<name>.js`
Model it on [owm.js](../src/lib/sources/owm.js) (single endpoint) or
[openmeteo.js](../src/lib/sources/openmeteo.js) (multiple parallel fetches with
`Promise.allSettled`). Rules:
- Signature `fetch<Name>(lat, lon, apiKey, radiusKm, signal)`.
- Forward the optional final `AbortSignal` to every HTTP `fetch` call.
- **Never throw past the function** — catch network errors, push human-readable
  strings into `errors`, return whatever readings you got (see owm.js).
- Map provider fields → SI metrics with `?? null`.
- Export `<NAME>_META = { key, label, requiresKey, keyUrl, keyHint, keyPattern }`.

### 2. Register it in [src/lib/sources/registry.js](../src/lib/sources/registry.js)
Append one entry to the `SOURCES` array:
```js
{
  key: '<name>',                 // status / config / i18n id
  labelKey: 'source<Name>',      // i18n key for the display name
  apiKeyName: '<name>' | null,   // key in config.apiKeys, or null if keyless
  fetch: (loc, apiKeys, signal) => fetch<Name>(loc.lat, loc.lon, apiKeys.<name>, loc.radiusKm, signal),
  // Optional: post-process readings, e.g. tag as approximate so they show
  // in Stations but stay out of the aggregate.
  // tagReadings: (readings, opts) => readings,
},
```
`useWeather` iterates this list, runs every active source in parallel via
`Promise.allSettled`, initializes status (`'no-key'` when `apiKeyName` is set
but the key is empty, otherwise `'loading'`), and retains the original readings for local preference-driven aggregation.
The request signal is passed to every registry entry. No edits to `useWeather.js` itself.

The weather query identity derives provider keys from the registry, so adding
`apiKeyName` also wires up refetching when that key changes. No manual dependency
array edits are needed.

No change needed in [aggregate.js](../src/lib/aggregate.js) or
[App.jsx](../src/App.jsx) — readings flow through automatically and the source
label resolves from `labelKey` across the Aggregated / Stations / Sources tabs.

### 3. Verify
- **CORS first.** This is a client-only app; the provider's API *must* send
  `Access-Control-Allow-Origin` or the browser blocks it. Test against the dev
  server and watch the **Sources → Debug log** tab. If you hit CORS, the source
  needs a proxy (out of scope for a static Pages app) — confirm before building.
- `npm run dev`, add a location, open **Sources**: the source should report a
  reading count and contribute to the aggregate; check it appears in **Stations**.
- `npm run build` passes.
- Add a `runtimeCaching` rule for the new API host in
  [vite.config.js](../vite.config.js) (mirror the open-meteo/owm `NetworkFirst`
  entries) so it works offline / cached.

## Provider specifics

### Tomorrow.io — easier, do this first
- Realtime endpoint:
  `https://api.tomorrow.io/v4/weather/realtime?location=LAT,LON&units=metric&apikey=KEY`
- One reading (model point, not a real station). `data.values` →
  `temperature`, `humidity`, `pressureSurfaceLevel` (hPa), `windSpeed` (m/s),
  `windDirection`, `cloudCover`, `precipitationIntensity` (mm/h), `uvIndex`.
- With `units=metric` the values are already SI — minimal conversion.
- Free tier ~500 req/day, 25 req/hour — be mindful with auto-refresh.

### Windy — more involved
- **Point Forecast API** (POST): `https://api.windy.com/api/point-forecast/v2`
  with JSON body `{ lat, lon, model: 'gfs', parameters: [...], levels: ['surface'], key }`.
- Returns **time series arrays**, not a single value — pick the index nearest
  to `Date.now()` from the returned `ts` array.
- **Non-SI units, needs conversion:**
  - temp in **Kelvin** → °C (`k - 273.15`)
  - pressure in **Pa** → hPa (`pa / 100`)
  - wind as **u/v components** (m/s) → speed `Math.hypot(u, v)`, direction
    `(Math.atan2(-u, -v) * 180/Math.PI + 360) % 360`
- It's an NWP model forecast (like Open-Meteo), not station observations — fine,
  the app already mixes models and stations.
- Verify CORS for the POST endpoint before committing to it.

## Note on aggregation semantics
Sources that return a single model point (Tomorrow.io, Windy, each Open-Meteo
model) each count as one reading in the IQR average. Real multi-station sources
(OWM `/find`) contribute many. This is intended — more independent inputs
sharpen the outlier filter — but keep it in mind when reading `contributors/total`.
