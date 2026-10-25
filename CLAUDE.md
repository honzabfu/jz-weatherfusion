# CLAUDE.md — JZ WeatherFusion

Client-only React 18 + Vite PWA, deployed to GitHub Pages. No backend.
[Live app](https://honzabfu.github.io/jz-weatherfusion/).

## Development and verification

Use Node 22 to match CI, then `npm ci`.

- `npm run dev` — http://localhost:5173/jz-weatherfusion/
- `npm run test:run` — one Vitest run; `npm test` for watch mode.
- `npm run build` — production output in `dist/`, including service worker.
- `npm run preview` — http://localhost:4173/jz-weatherfusion/
- `node scripts/verify-review-fixes.mjs` — production UI regressions against
  preview, using Playwright Chromium and mocked API responses.
- `git diff --check` — whitespace/conflict-marker checks.

See [development and browser checks](docs/development.md) for browser installation,
responsive verification, screenshot generation and deployment validation. No
linter is configured. Unit/hook tests run in CI; browser scripts are manual.

## Architecture

- [src/main.jsx](src/main.jsx) mounts [App.jsx](src/App.jsx) in StrictMode. App
  renders Aggregated / Stations / Sources, the location picker and modals.
- [useConfig](src/hooks/useConfig.js) persists configuration as `pws:config` in
  `localStorage`. [normalizeConfig](src/lib/config.js) validates imports, storage,
  persistence and replacements; copies approved fields; rejects malformed values
  and `__proto__`/`constructor`/`prototype` keys at every depth. Missing fields use
  defaults, dangling active ids select the first location, invalid stored data
  resets to defaults. Invalid imports leave existing config unchanged. Keep new
  config fields in the schema/defaults or they will be discarded.
- [useWeather](src/hooks/useWeather.js) fetches active providers in parallel.
  Query identity includes location id, fixed coordinates, dynamic flag, radius
  and registry API keys. Label edits and dynamic GPS cache writes do not refetch.
  Replacing a query or unmounting aborts its controller; stale completions cannot
  commit GPS, status, logs or readings. Other-query data is hidden immediately;
  a failed refresh can retain the last successful result for the same query.
  Raw provider batches are retained; IQR and Windy tagging recompute locally.
- Auto-refresh defaults to 30 minutes. Visibility resume refetches when data is
  older than the selected interval (5 minutes when periodic refresh is off).
- A dynamic location is manually added through “My current position”; none is
  created by default. Every fetch resolves device geolocation, with one Safari
  retry on failure. Stored coordinates are a last-known cache (`0/0` initially).
  Resolved coordinates and an optional place name are cached in config.
- [useTheme](src/hooks/useTheme.js) applies light/dark/system and root font-size
  scaling. Gesture hooks provide pull-to-refresh and swipe navigation.
- [geocode.js](src/lib/geocode.js) searches names through Open-Meteo geocoding;
  reverse geocoding sends coordinates to BigDataCloud. Both are best-effort and
  accept AbortSignal. Weather APIs receive selected coordinates and their own
  key. No full config is sent to a server; exports contain the API keys, and GET
  weather request URLs/responses can also be stored in service-worker caches.

## Provider contract and registration

[registry.js](src/lib/sources/registry.js) is the source of truth: entries expose
`fetch(location, apiKeys, signal)` returning `{ readings, errors }`. Adapters have
provider-specific arguments with an optional final AbortSignal; forward it to
all HTTP calls. Keep failures in `errors` and preserve partial successful data.
`*_META` exports describe providers, but Settings has a separate `API_KEY_META`.

A reading contains `stationId`, `stationName`, `source`, `sourceType`, `fetchedAt`,
optional numeric `lat`/`lon`, and `metrics` with `temp`, `humidity`, `pressure`,
`windSpeed`, `windDeg`, `clouds`, `precip`, `uvIndex`. Use numeric values or `null`.
Internal units: °C, %, hPa, m/s, meteorological degrees, mm/h; prefer sea-level
pressure. Convert provider units in adapters, user units only at display time.
`fetchedAt` is the adapter fetch time, not necessarily the observation time.

Add sources through the registry, config schema, key UI and all translations;
follow [adding a data source](docs/adding-a-data-source.md). Registry API keys
already participate in query identity: no manual hook dependency edits.

| Provider | Current implementation |
| --- | --- |
| Open-Meteo | Keyless; three parallel model queries (`best_match`, `icon_seamless`, `ecmwf_ifs025`), tagged `model`; reads `current.uv_index` when available and sea-level pressure. Best-match can overlap an explicitly requested model; do not promise three independent inputs. |
| OWM | Keyed `/data/2.5/find`, asks for up to 10 entries, then filters their coordinates by an approximate distance/radius. Tagged `station` by this app, but the endpoint does not establish individual physical PWS provenance. Rain is mapped from `rain['1h']` if present; UV is always null. |
| Tomorrow.io | Keyed realtime endpoint, tagged `model`; pressure prefers `pressureSeaLevel` over `pressureSurfaceLevel`; precipitation uses `precipitationIntensity ?? rainIntensity ?? snowIntensity`; rounds cloud cover. |
| Windy | Keyed Point Forecast v2 POST, GFS; tagged `model`; converts K/Pa/u-v wind, combines cloud layers, UV always null. `windyKeyFree` (default true) tags readings `approximate`; disabling it allows them into the normal model pool. |

## Aggregation invariants

[aggregate.js](src/lib/aggregate.js):

1. Exclude `approximate` readings from all calculations, retain them in the table.
2. Prefer readings tagged `station` if any exist; otherwise use non-approximate
   models. For each scalar metric with no station values, fall back to the
   non-approximate pool and set `usedFallback`. The model tag on cards explains it.
3. Apply IQR independently per scalar metric (default 1.5), then arithmetic mean.
   Fewer than three values or zero IQR skip filtering. Wind direction uses the
   preferred pool's circular mean, with no IQR or per-metric model fallback.

`stationCount` is the preferred pool size before per-metric filtering; use
`perMetric.contributors/total/removed` for an individual metric. `isOutlier` is
based on temperature only; it does not exclude the entire reading from other
metrics. `excludedBySourceType` models may still supply per-metric fallback.

## Conventions and tests

- JavaScript + JSDoc; function components/hooks; no TypeScript or CSS framework.
- Inline styles plus [CSS tokens](src/styles/tokens.css); keep assets relative to
  Vite base `/jz-weatherfusion/`.
- [i18n.js](src/lib/i18n.js): English, Czech and Spanish; language defaults to
  browser detection. Add/update all three translations for user-facing changes.
- Tests cover aggregation, units, config validation/prototype safety, registry
  abort propagation and real React hook lifecycle (react-test-renderer with
  mocked providers/GPS). Add relevant regressions for behavioral changes.

## PWA and deploy

[deploy.yml](.github/workflows/deploy.yml) runs `npm ci`, tests and build with
Node 22, then deploys `dist/` on push to `main` or manual dispatch. It does not
run on pull requests. App version comes from `package.json`; keep lockfile
version aligned when making a release.

The service worker prompts for updates. The app shell is precached; successful
weather GET responses use NetworkFirst with up to 20 entries per host and a
300-second cache lifetime. Results are not persisted in localStorage. The Windy
rule uses Workbox's default GET method, so it does **not** cache the adapter's
POST. Offline reload requires an installed worker and usable cached responses;
dynamic locations still require geolocation. See [development](docs/development.md).

## Provider caveats to preserve in documentation

- OWM's `station` tag is an application classification, not proof of a PWS sensor.
  [OWM describes current weather as combined models, satellites, radar and stations](https://openweathermap.org/current).
  Do not claim a universal accuracy advantage or a fixed percentage difference.
- [Windy documents `ts[]` in milliseconds](https://api.windy.com/point-forecast/docs).
  The current adapter assumes seconds (`Date.now() / 1000`); this discrepancy is
  tracked in [#59](https://github.com/honzabfu/jz-weatherfusion/issues/59).
  Do not copy the seconds assumption into new adapters or assert it is verified.
- Windy free-tier data are for testing and may be intentionally modified. Test
  CORS in an actual browser for the chosen key/plan; do not state that all free
  keys always fail or that all paid keys work without checking.
- Open-Meteo UV availability and model independence are not guaranteed. Windy UV
  is not requested or mapped; missing data stays null. Do not hard-code provider
  quotas in guides without checking the current plan documentation.
