# CLAUDE.md — JZ WeatherFusion

Personal Weather Station aggregator. Client-only React + Vite PWA, deployed to GitHub Pages. No backend — all config (API keys, locations) lives in browser LocalStorage and is sent only to the respective weather APIs.

**Live:** https://honzabfu.github.io/jz-weatherfusion/

## Commands
- `npm run dev` — dev server at http://localhost:5173/jz-weatherfusion/
- `npm run build` — output to `dist/`
- `npm run preview` — preview built output
- `npm test` — Vitest watch mode; `npm run test:run` for a single CI-style run
- `node scripts/verify-review-fixes.mjs` — production UI regressions against `npm run preview` (Playwright Chromium, mocked APIs)

Tests cover aggregation, units, config validation/prototype safety and provider cancellation in `src/lib/` and the React lifecycle in `src/hooks/useWeather.test.js` (react-test-renderer, mocked providers/GPS). No linter is configured.

## Architecture
- **Entry:** [src/main.jsx](src/main.jsx) → [src/App.jsx](src/App.jsx). App is a single component with 3 tabs (aggregated / stations / sources).
- **State via hooks:**
  - [src/hooks/useConfig.js](src/hooks/useConfig.js) — config persisted to LocalStorage (`pws:config`). `normalizeConfig` allowlists schema fields and rejects malformed/prototype-related JSON keys. Missing fields receive defaults, invalid stored data falls back to defaults, invalid imports/replacements are rejected before state changes. Locations carry a `dynamic` flag; a **dynamic location** (added manually via 📡 "My current position", never created by default) has no fixed coordinates — on every refresh `useWeather` resolves the device geolocation and fetches for the current position. Its stored lat/lon is only a last-known cache (`0/0` until first resolved), updated via `updateLocation` after each successful fix.
  - [src/hooks/useWeather.js](src/hooks/useWeather.js) — fetch orchestration, source status, debug log, auto-refresh timer. Requests are scoped by location/query inputs, invalidated on replacement/unmount, and pass AbortSignal through the source registry. Raw provider batches are retained so IQR and Windy free-tier tagging recompute locally without fetching. Static coordinate/radius edits refetch; dynamic GPS cache/name writes do not. For a `dynamic` location it calls `getCurrentPosition()` before fetching and reports failures via the returned `geoError`.
  - [src/hooks/useTheme.js](src/hooks/useTheme.js) — light/dark/system.
- **Sources:** [src/lib/sources/](src/lib/sources/) — each exports `fetch<Source>()` returning `{ readings, errors }` and a `*_META` object. Fetch functions accept an optional final `AbortSignal`; registry entries expose `fetch(location, apiKeys, signal)`.
  - `openmeteo.js` — no key, fetches 3 NWP models (best_match, ICON, ECMWF) in parallel.
  - `owm.js` — requires key, `/find` endpoint, filters stations by haversine-ish distance vs `radiusKm`.
  - `tomorrow.js` — requires key, Tomorrow.io realtime endpoint.
  - `windy.js` — requires key, Point Forecast POST (GFS model); converts K→°C, Pa→hPa, u/v→speed+dir; picks time-series step closest to now.
- **Aggregation:** [src/lib/aggregate.js](src/lib/aggregate.js) — Three exclusion tiers before the mean is computed: **(1) Approximate readings** (`r.approximate`, e.g. Windy free tier) are always removed first — shown in the Stations table but never enter the pool. **(2) Source-type preference** — if any `sourceType === 'station'` readings remain, NWP model readings are tagged `excludedBySourceType: true` and dropped from the pool; falls back to all non-approximate when no stations are available. **Per-metric fallback:** stations rarely report some metrics (OWM `/find` has no precip/UV) — when the station pool has zero values for a metric, that single metric falls back to the non-approximate (model) readings rather than disappearing from the overview. The affected `perMetric[metric]` carries `usedFallback: true`. **(3) IQR outlier filter** per metric (factor default 1.5), arithmetic mean of the survivors; wind direction uses circular mean (no IQR, directional data). Result includes `usingStations: boolean`.
- **Geocoding:** [src/lib/geocode.js](src/lib/geocode.js) — `searchPlaces(query, lang, count, signal)` against Open-Meteo's free geocoding API (no key). Used by [LocationModal](src/components/LocationModal.jsx) so users can search by place name instead of entering coordinates; manual lat/lon entry remains available.
- **Units:** [src/lib/units.js](src/lib/units.js) — **internal values are always SI (°C, hPa, m/s, mm/h); convert only at display time.** Includes Beaufort scale and localized wind-direction labels.
- **i18n:** [src/lib/i18n.js](src/lib/i18n.js) — `en` / `cs` / `es`, default export `strings`, named `t(lang, key)`.

## Data shape
A `StationReading` is `{ stationId, stationName, source, sourceType, fetchedAt, [lat, lon], metrics }` where `metrics` = `{ temp, humidity, pressure, windSpeed, windDeg, clouds, precip, uvIndex }` (SI, `null` if unavailable). `sourceType` is `'station'` for physical sensor readings or `'model'` for NWP/forecast model outputs. Adding a source = produce this shape and wire it into `useWeather`.

## Conventions
- React 18, function components + hooks. No TypeScript (JSDoc typedefs only).
- Styling is inline `style={}` objects + CSS custom properties from [src/styles/tokens.css](src/styles/tokens.css). No CSS framework.
- `base: '/jz-weatherfusion/'` in [vite.config.js](vite.config.js) — keep asset paths relative.

## Deploy
Single source of truth: [.github/workflows/deploy.yml](.github/workflows/deploy.yml) — GitHub Actions builds with `npm run build` and publishes `dist/` to Pages on push to `main`.

## Implemented sources
- `open-meteo` — `sourceType: 'model'`. 3 NWP models (best_match, ICON, ECMWF), UV index, sea-level pressure. No key.
- `owm` — `sourceType: 'station'`. OpenWeatherMap physical stations (PWS) in radius. Requires key.
- `tomorrow` — `sourceType: 'model'`. Tomorrow.io realtime hybrid model (NWP + satellite + radar). Requires key. Pressure: prefers `pressureSeaLevel`, falls back to `pressureSurfaceLevel`. `cloudCover` rounded to integer (API returns fractional %).
- `windy` — `sourceType: 'model'`. Windy Point Forecast API v2, GFS model. Requires key. Note: free-tier key triggers CORS on direct browser requests; app tags these readings as approximate (`isApprox`).

## Known gaps / caveats
- `uvIndex` outside Open-Meteo: OWM `/find` cannot supply it; Windy's `uvindex` surface field is present but may be null outside daylight hours.
- Open-Meteo returns one UV value shared across all 3 models (same source field).
- Windy free-tier CORS: the API does not send CORS headers for free keys, so the fetch may fail in-browser depending on the browser's handling of cross-origin errors.
- Windy GFS data (temp, wind) can differ significantly from physical station observations — expected for a coarse 0.25° NWP model. Data are marked approximate (≈) and always excluded from aggregate.
- NWP models (Open-Meteo, Windy, Tomorrow.io) vs. physical stations (OWM): humidity and temperature can differ 10–20 % due to grid resolution. Physical stations reflect actual local conditions; the aggregator now prefers them when available.
