# Development, tests and deployment

Use Node 22, matching [.github/workflows/deploy.yml](../.github/workflows/deploy.yml).
The client has no backend and needs no API keys for local mocked tests.

## Setup

```sh
npm ci
npm run dev
```

Open http://localhost:5173/jz-weatherfusion/. Start with a place-name search or
manual coordinates; add a dynamic location only if you want geolocation.
Configuration belongs to that browser origin, so dev, preview and GitHub Pages
have separate localStorage and service-worker caches.

## Automated tests and build

```sh
npm run test:run
npm run build
git diff --check
```

`npm test` runs Vitest watch mode. Tests cover aggregation, display-unit helpers,
config schema/prototype safety, provider cancellation and real React hook
lifecycle (react-test-renderer with mocked providers/GPS). There is no configured
linter. Test counts in release reports are historical; use the current runner
output for the current count.

## Browser regressions

Install the browser once:

```sh
npx playwright install chromium
```

After `npm run build`, start `npm run preview` in a separate terminal. Run:

```sh
node scripts/verify-review-fixes.mjs
```

The script targets http://127.0.0.1:4173/jz-weatherfusion/ and asserts location
switch/failure/detail behavior, coordinate editing, deletion, local preference
recomputation, invalid/malicious imports and recovery from bad stored config.
It intercepts weather API calls and blocks service workers for deterministic
checks. A successful run does not prove live-provider CORS, offline behavior,
real GPS or another browser engine.

For another preview URL, or an explicit browser binary:

```sh
BASE_URL=http://localhost:4173/jz-weatherfusion/ node scripts/verify-review-fixes.mjs
CHROMIUM_PATH=/absolute/path/to/chrome node scripts/verify-review-fixes.mjs
```

### Responsive screenshots

The older display and README screenshot scripts default to a browser path from
the original test environment (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).
On a normal Playwright install, override it explicitly. With preview running:

```sh
CHROMIUM_PATH="$(node --input-type=module -e "import { chromium } from 'playwright'; console.log(chromium.executablePath())")" node scripts/verify-display.mjs
CHROMIUM_PATH="$(node --input-type=module -e "import { chromium } from 'playwright'; console.log(chromium.executablePath())")" node scripts/gen-doc-screenshots.mjs
```

Both also accept `BASE_URL`. The display script runs 8 viewports × 2 themes ×
3 tabs (48 checks) and rewrites screenshots plus `docs/verification/results.json`.
The README script rewrites six images in `docs/screenshots/`. Inspect generated
changes before committing; do not regenerate screenshots for unrelated edits.

The display script reports horizontal overflow in its output/JSON; it currently
does **not** set a failing exit code when overflow is found. Review the report
rather than treating process exit 0 as a pass. Emulated phone/tablet dimensions
still use Chromium and the medium font; this is not Safari/Firefox validation,
a font-size matrix, or a complete accessibility audit.

[docs/verification/REPORT.md](verification/REPORT.md) records an earlier 48-check
run. Its screenshots/results remain historical artifacts, not evidence of a fresh
run after every code or documentation change.

## Manual checks with live APIs and PWA

Use an HTTPS deployment (or localhost), a clean browser context and no request
interception when checking service workers or provider availability:

1. Add a fixed location without keys. Check Open-Meteo responses, finite metric
   values and Sources/debug log. Use your own key for keyed providers; never
   commit it or include it in logs/screenshots. Verify browser CORS and plan
   limits rather than relying on a successful server-side HTTP request.
2. Check a dynamic location with permission allowed, denied and unavailable.
   Check switching locations during GPS/network requests, edits and return from
   the background on a real device. Chromium's simulated geolocation does not
   establish Safari/iOS GPS behavior.
3. Wait for service-worker activation, reload under its control, and fetch the
   intended weather GET responses online. Then go offline and reload. Expect
   cached app assets and only still-usable cached responses (300-second weather
   cache); Windy POST and geocoding have no working offline cache rules.
4. Check the offline banner, failed-refresh status and the displayed last fetch
   time. A retained same-query result is not evidence of a new observation.
5. For an existing installation, check that the update banner appears and loads
   the new bundle. Confirm the version in Settings after updating.

Runtime GET caches can contain key-bearing request URLs. Configuration exports
also contain API keys. Use test accounts or redacted data for shared artifacts.

## Release and GitHub Pages

The app version is read from `package.json` at build time. For a release, update
both package files (for example `npm version patch --no-git-tag-version`) and
include the change in the reviewed branch.

Push to `main` or a manual workflow dispatch runs, in order: checkout, Node 22,
`npm ci`, `npm run test:run`, `npm run build`, upload `dist/`, deploy Pages.
The workflow does not run on PR events and does not execute browser scripts.
Pushing a docs-only merge to `main` also triggers this workflow.

After deployment:

- Confirm the Actions run succeeded for the intended `main` commit.
- Check the public HTML, referenced JS/CSS, manifest and `sw.js` return 200;
  verify the Settings version or deployed asset hash so cached HTML cannot mask
  the previous build.
- Run mocked regressions against the deployed assets if needed:

  ```sh
  BASE_URL=https://honzabfu.github.io/jz-weatherfusion/ node scripts/verify-review-fixes.mjs
  ```

- Separately run the live API/PWA checks above. State explicitly which checks
  used mocks, which used live services and which device/browser checks remain.

[Review fixes and the 0.2.1 verification record](review-fixes.md) give the last
release's evidence; they do not replace checking a new deployment.
