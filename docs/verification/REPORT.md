# Cross-platform display verification — historický report

Tento report a přiložené screenshoty/results.json zaznamenávají běh před vydáním
0.2.1. Nejde o nově provedený test současné verze. Aktuální postup je v
[development.md](../development.md); ověření vydání 0.2.1 je v
[review-fixes.md](../review-fixes.md).

Ověření zobrazení aplikace na různých platformách, prohlížečích a velikostech
displeje. Generováno skriptem [`scripts/verify-display.mjs`](../../scripts/verify-display.mjs).

## Metodika

- **Nástroj:** Při zaznamenaném běhu Playwright řídil předinstalovaný Chromium (`/opt/pw-browsers/chromium-1194`).
- **App:** produkční build (`npm run build`) servírovaný přes `vite preview`.
- **Data:** síťové odpovědi Open-Meteo a OpenWeatherMap jsou v testu mockované
  (deterministická, datově bohatá UI nezávislá na síti). Nasazená lokalita: Praha,
  3 položky OWM označené aplikací jako stanice + 3 NWP modely (Open-Meteo).
- **Pokrytí:** 8 viewportů × 2 motivy (light/dark) × 3 taby (Průměr / Stanice /
  Zdroje) = **48 kontrol**.
- **Kontrola layoutu:** u každé kombinace se měří horizontální přetečení dokumentu
  (`scrollWidth − clientWidth`) a pořizuje se full-page screenshot.

### Poznámka k prohlížečům

Zaznamenaný běh používal pouze **Chromium**, nikoli Firefox/Gecko ani
Safari/WebKit. Skript mění viewport, `deviceScaleFactor`, `isMobile`, `hasTouch`
a barevný motiv. Tím neověřuje skutečný engine Safari/Firefox ani reálné zařízení.
Používá střední velikost písma; nejde o matici všech velikostí písma. Pro ostatní
prohlížeče a geolokaci je potřeba samostatné ověření.

## Matice viewportů

| Profil | Rozlišení | Reprezentuje |
| --- | --- | --- |
| `mobile-320-small` | 320×568 | iPhone SE (1. gen) — nejmenší běžný telefon |
| `mobile-375-iphonese` | 375×667 | iPhone SE2 / iPhone 8 |
| `mobile-390-iphone13` | 390×844 | iPhone 12/13/14 |
| `mobile-412-android` | 412×915 | Pixel 7 / typický Android |
| `tablet-768-portrait` | 768×1024 | iPad na výšku |
| `tablet-1024-landscape` | 1024×768 | iPad na šířku |
| `desktop-1280` | 1280×800 | Notebook |
| `desktop-1920` | 1920×1080 | Full-HD desktop |

## Výsledek

**48/48 kontrol bez horizontálního přetečení** (po opravě níže). Strojová data:
[`results.json`](results.json). Screenshoty: `*__<motiv>__<tab>.png` v této složce.

### Nalezená a opravená chyba — přetečení na 320 px

Při prvním běhu (s reálnými daty) agregovaný tab na šířce **320 px** přetékal
vodorovně o **+53 px** v obou motivech. Příčina: hero karta teploty má
`grid-column: span 2`, což na nejužším displeji vynutilo dvousloupcovou mřížku,
a široké číselné hodnoty (např. tlak „1013.7 hPa" ve fontu 2 rem, bez zalomení)
pak protlačily stopy mřížky přes šířku viewportu.

**Oprava:** mřížka metrik přesunuta z inline stylů do třídy `.metric-grid`
v [`tokens.css`](../../src/styles/tokens.css) s media query: pod 360 px se
přepne na jeden sloupec a hero karta přestane span­ovat dva sloupce. Na 375 px a
výše zůstává dvousloupcové rozložení beze změny.

Po opravě: **0 přetečení** napříč celou maticí. Tabulka stanic na úzkých
displejích roluje vodorovně ve vlastním kontejneru (`overflow-x: auto`) —
záměrný vzor, page-level přetečení je nulové.

## Reprodukce

Po `npm ci` nainstalujte Chromium přes `npx playwright install chromium`.
Sestavte aplikaci a v samostatném terminálu spusťte preview:

```sh
npm run build
npm run preview -- --port 4173
```

Ve druhém terminálu předejte cestu k právě nainstalovanému Chromiu:

```sh
CHROMIUM_PATH="$(node --input-type=module -e "import { chromium } from 'playwright'; console.log(chromium.executablePath())")" node scripts/verify-display.mjs
```

Bez `CHROMIUM_PATH` skript stále používá historickou cestu
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, která nemusí existovat.
URL lze přepsat přes `BASE_URL`.

Skript přepíše screenshoty a `results.json` v této složce. Výsledky a změny obrázků
zkontrolujte před commitem. Při nalezení přetečení ho skript pouze vypíše a uloží;
nevrací kvůli němu nenulový exit code. Samotný úspěšný běh procesu tedy není
potvrzením nulového přetečení. Tento dokument se skriptem automaticky nepřepisuje.
