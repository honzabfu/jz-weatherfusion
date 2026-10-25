// Production UI regression checks for review issues #52–#57.
// Run against `npm run preview`; all weather requests are mocked, no keys needed.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/jz-weatherfusion/'
const browser = await chromium.launch(process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH } : {})
const locations = [
  { id: 'a', label: 'A', lat: 50, lon: 14, radiusKm: 10 },
  { id: 'b', label: 'B', lat: 49, lon: 16, radiusKm: 10 },
]
const seed = {
  version: 1, locations, activeLocationId: 'a',
  apiKeys: { owm: '', windy: '', tomorrow: '' },
  preferences: { language: 'en', theme: 'light', iqrFactor: 1.5, refreshIntervalMin: 0,
    apiKeyBannerDismissed: true, owmBannerDismissed: true, windyKeyFree: false },
}
const errors = []
let assertions = 0
const heroSelector = '.metric-grid > [role="button"]:first-child > div:nth-child(2)'
async function temperature(page, expected) {
  await page.waitForFunction(({ selector, expected }) =>
    parseFloat(document.querySelector(selector)?.textContent) === expected,
  { selector: heroSelector, expected })
  assertions++
}
async function fresh(config, models = false) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  let requests = 0
  await context.route('**/api.open-meteo.com/**', async route => {
    requests++
    const query = new URL(route.request().url()).searchParams
    if (query.get('latitude') === '49') {
      await route.fulfill({ status: 503, body: '{}' })
      return
    }
    const temp = models ? { best_match: 10, icon_seamless: 11, ecmwf_ifs025: 12 }[query.get('models')]
      : query.get('latitude') === '51' ? 30 : 20
    await route.fulfill({ json: { current: { temperature_2m: temp } } })
  })
  await context.route('**/api.tomorrow.io/**', route => {
    requests++
    return route.fulfill({ json: { data: { values: { temperature: 13 } } } })
  })
  await context.route('**/api.windy.com/**', route => {
    requests++
    return route.fulfill({ json: { ts: [Date.now() / 1000], 'temp-surface': [292.15] } })
  })
  const page = await context.newPage()
  page.on('pageerror', err => errors.push(err.message))
  await page.addInitScript(config => localStorage.setItem('pws:config', JSON.stringify(config)), config)
  await page.goto(BASE)
  return { context, page, requests: () => requests }
}
async function pick(page, label) {
  await page.locator('header button').first().click()
  await page.getByRole('button', { name: new RegExp(`^(?:✓ )?${label}$`) }).click()
}
async function settings(page) { await page.getByRole('button', { name: 'Settings', exact: true }).click() }
async function closeSettings(page) { await page.getByRole('button', { name: '×', exact: true }).click() }

try {
  const { page, context, requests } = await fresh(seed)
  await temperature(page, 20)
  await page.getByRole('button', { name: 'Stations', exact: true }).click()
  await page.locator('tbody tr').first().click()
  assert.equal(await page.getByRole('button', { name: /Back/ }).count(), 1)
  await pick(page, 'B')
  await page.getByRole('button', { name: 'Sources', exact: true }).click()
  await page.getByText('HTTP 503', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Stations', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: /Back/ }).count(), 0)
  assert.equal(await page.locator('tbody tr').count(), 0)
  await page.getByRole('button', { name: 'Aggregated', exact: true }).click()
  assert.equal(await page.locator(heroSelector).count(), 0)
  assertions += 3
  console.log('PASS: failed B cannot display A cards, stations or selected detail (#53)')

  await pick(page, 'A')
  await temperature(page, 20)
  const beforeEdit = requests()
  await page.locator('header button').first().click()
  await page.getByTitle('Edit location', { exact: true }).first().click()
  await page.locator('input[type="number"]').nth(0).fill('51')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await temperature(page, 30)
  assert.ok(requests() > beforeEdit)
  assertions++
  console.log('PASS: editing active coordinates refetches without manual refresh (#54)')

  await page.locator('header button').first().click()
  await page.getByTitle('Delete location', { exact: true }).last().click()
  await page.getByTitle('Delete location', { exact: true }).click()
  assert.equal(await page.locator(heroSelector).count(), 0)
  await page.getByRole('button', { name: /Add location/ }).first().waitFor()
  assertions++
  console.log('PASS: deleting last location removes the weather cards (#53)')
  await context.close()

  const modelRun = await fresh({ ...seed, apiKeys: { owm: '', tomorrow: 'test', windy: 'test' } }, true)
  const modelPage = modelRun.page
  await temperature(modelPage, 11.5)
  const beforePreferences = modelRun.requests()
  await settings(modelPage)
  await modelPage.getByRole('button', { name: '3', exact: true }).click()
  await closeSettings(modelPage)
  await temperature(modelPage, 13)
  await settings(modelPage)
  await modelPage.getByRole('checkbox').check()
  await closeSettings(modelPage)
  await temperature(modelPage, 11.5)
  await settings(modelPage)
  await modelPage.getByRole('checkbox').uncheck()
  await closeSettings(modelPage)
  await temperature(modelPage, 13)
  assert.equal(modelRun.requests(), beforePreferences)
  assertions++
  console.log('PASS: IQR and both Windy switch directions update the UI without network calls (#55)')

  await settings(modelPage)
  const saved = await modelPage.evaluate(() => localStorage.getItem('pws:config'))
  for (const [name, payload] of [
    ['invalid.json', '{"locations":null}'],
    ['unsafe.json', '{"__proto__":{"weatherfusionReviewMarker":true}}'],
  ]) {
    const alert = modelPage.waitForEvent('dialog').then(async dialog => {
      assert.match(dialog.message(), /Invalid config file/)
      await dialog.accept()
    })
    await modelPage.locator('input[type="file"]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(payload) })
    await alert
    assert.equal(await modelPage.evaluate(() => localStorage.getItem('pws:config')), saved)
    assert.equal(await modelPage.evaluate(() => ({}).weatherfusionReviewMarker), undefined)
    assertions += 3
  }
  await closeSettings(modelPage)
  await temperature(modelPage, 13)
  console.log('PASS: invalid/malicious imports are rejected; UI, config and Object.prototype remain intact (#56, #57)')
  await modelRun.context.close()

  const invalid = await fresh({ locations: null })
  await invalid.page.getByRole('button', { name: /Add location/ }).first().waitFor()
  assert.deepEqual(await invalid.page.evaluate(() => JSON.parse(localStorage.getItem('pws:config')).locations), [])
  assertions++
  await invalid.context.close()
  assert.deepEqual(errors, [])
  console.log('PASS: malformed stored config recovers to a usable empty app (#56)')
  console.log(`${assertions} browser assertions passed; no uncaught page errors`)
} finally {
  await browser.close()
}
