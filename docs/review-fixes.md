# Code review fixes

Review baseline: `9879792c81ab8436d0182949c063047abd2e8ee4`.

Apply in priority order; do not merge or deploy until regression checks pass.

| Issue | Approach | Regression checks |
| --- | --- | --- |
| [#52](https://github.com/honzabfu/jz-weatherfusion/issues/52), P1 | Own each fetch with a controller; check ownership after async boundaries and in state updaters. Forward AbortSignal to every provider. Invalidate on location/query replacement and unmount. | Out-of-order responses; overlapping refreshes; late GPS after switching/unmounting. |
| [#53](https://github.com/honzabfu/jz-weatherfusion/issues/53), P1 | Scope raw readings, timestamps, errors and loading by query. Hide other scopes immediately, even before effects run. Resolve selected station details from current readings and location. | Failed B after successful A; deleting last location; preserve successful same-location cache on transient failure. |
| [#54](https://github.com/honzabfu/jz-weatherfusion/issues/54), P2 | Define query identity from id, static coordinates, dynamic flag, radius and provider keys. Exclude label and dynamic GPS cache writes. | Edit coordinates/radius; rename; cache resolved GPS without refetch loop. |
| [#55](https://github.com/honzabfu/jz-weatherfusion/issues/55), P2 | Retain original provider batches; derive free-tier tags and aggregate from current preferences using memoization. | IQR change; both Windy switch directions; preference change while fetch is pending; no extra network calls. |
| [#56](https://github.com/honzabfu/jz-weatherfusion/issues/56), P2 | Shared schema validation for imported, stored and replacement config. Fill missing defaults; reject wrong types, out-of-range coordinates and duplicate ids. Recover invalid storage with defaults; reject invalid import without changing current config. | Malformed root/sections/locations/preferences; export/import roundtrip; old partial config; dangling active id. |
| [#57](https://github.com/honzabfu/jz-weatherfusion/issues/57), P2 | Remove generic deep merge. Copy only schema-approved own fields and reject prototype-related keys at every JSON depth. | Top-level and nested __proto__/constructor/prototype payloads through import and storage; Object.prototype remains unchanged. |

Validation: `npm run test:run`, `npm run build`, `git diff --check`.
Browser verification uses a production preview with mocked weather endpoints;
no real API keys or geolocation are required.

## Implemented and verified

All six fixes are implemented on `fix/review-weather-state-config`.

- 89 Vitest tests pass (36 existing, 53 new), including real React hook lifecycle
  tests with mocked providers/GPS and a provider abort propagation test.
- Against the review baseline, 13 of the 15 new hook tests fail; with the fixes,
  all pass.
- Production build passes, including service worker generation.
- `scripts/verify-review-fixes.mjs` passes 21 browser assertions in Chromium,
  with no uncaught page errors. Covers location switching/failure/detail scope,
  editing coordinates, deleting locations, preference changes without fetching,
  invalid/malicious file imports and recovery from invalid stored configuration.
- The browser checks mock API responses and do not validate live provider CORS
  or real-device geolocation/Safari behavior.

Reproduce the browser checks after building and starting `npm run preview`:

```sh
npx playwright install chromium
node scripts/verify-review-fixes.mjs
```

`BASE_URL` and `CHROMIUM_PATH` can override the preview URL and browser binary.
