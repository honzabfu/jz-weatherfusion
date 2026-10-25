# JZ WeatherFusion

🇬🇧 [English](#english) · 🇨🇿 [Česky](#česky)

Developer guides: [setup, tests and deployment](docs/development.md) ·
[adding a source](docs/adding-a-data-source.md) · [agent instructions](CLAUDE.md).

## English

Weather aggregator combining current-weather API entries and numerical weather
prediction (NWP) models. It filters outliers and displays aggregated metrics.
Client-only React PWA, hosted on GitHub Pages.

**Live app:** https://honzabfu.github.io/jz-weatherfusion/

### Screenshots

| Aggregated | Stations | Sources |
|:---:|:---:|:---:|
| ![Aggregated — light](docs/screenshots/light-aggregated.png) | ![Stations — light](docs/screenshots/light-stations.png) | ![Sources — light](docs/screenshots/light-sources.png) |
| ![Aggregated — dark](docs/screenshots/dark-aggregated.png) | ![Stations — dark](docs/screenshots/dark-stations.png) | ![Sources — dark](docs/screenshots/dark-sources.png) |

### Quick start and locations

1. Open the app and choose **Add location** to search by name or enter coordinates.
2. Open-Meteo works without a key and supplies model-based values immediately.
3. Add optional OpenWeatherMap, Tomorrow.io or Windy keys in **Settings → API Keys**.
   Check **Sources** for actual availability, errors and the last fetch time.

To follow your device, manually add **📡 My current position**. Each refresh
resolves geolocation; the app keeps the last coordinates and an optional place
name. Geolocation requires browser permission. This location is not created by
default. Auto-refresh defaults to 30 minutes; stale data is also refreshed when
the app returns to the foreground. Editing fixed coordinates or the search
radius triggers a new fetch.

### Tabs

| Tab | Description |
| --- | --- |
| **Aggregated** | Filtered metric values and contributor counts; a model tag identifies per-metric fallback. |
| **Stations** | Individual provider entries, status indicators, distances for entries classified as stations, and details. |
| **Sources** | Provider status, errors, last fetch time and a debug log. |

### Data sources

| Source | API key | Current behavior |
| --- | --- | --- |
| **Open-Meteo** | None | Three model queries (`best_match`, ICON, ECMWF); maps UV when available. Best-match may overlap another requested model. |
| **OpenWeatherMap** | Required | Up to ten nearby current-weather entries, filtered by radius. The app classifies them as `station` and prefers them in aggregation. |
| **Tomorrow.io** | Required | Realtime model data, classified as `model`. |
| **Windy** | Required | GFS model via Point Forecast API. Free-tier preference defaults on: marks readings approximate (≈) and excludes them. Disable it for a suitable key to allow normal model participation. |

The app's OWM **station** label does not guarantee an individual physical PWS
sensor. [OWM describes its current-weather product](https://openweathermap.org/current)
as combining models, satellites, radar and weather stations. Treat provider
classification and actual sensor provenance separately; no fixed accuracy
advantage is guaranteed.

Get keys and check current plan limits at [OpenWeatherMap](https://openweathermap.org/api),
[Tomorrow.io](https://www.tomorrow.io) and [Windy Point Forecast](https://api.windy.com/point-forecast).
Windy free-tier data are intended for testing and may be deliberately modified.
Browser CORS and provider plans can limit access. Windy time-series unit handling
also has a known discrepancy: [#59](https://github.com/honzabfu/jz-weatherfusion/issues/59).

### Filtering and aggregation

1. **Exclude approximate readings.** They remain visible in Stations.
2. **Prefer entries tagged `station`.** Without them, use non-approximate models.
   If the preferred entries have no values for a scalar metric (for example UV),
   models fill that metric; the card shows a model tag.
3. **Filter each metric with IQR**, then average surviving values. Wind direction
   uses a circular mean of the preferred pool, without IQR or per-metric fallback.

IQR and Windy free-tier changes recompute existing data immediately without
fetching again. Contributor counts describe each metric, not a count of
independent weather providers. The table's outlier marker is based on
**temperature**; other metrics are filtered independently.

| Symbol | Meaning |
| --- | --- |
| ● | In the preferred pool, not a temperature outlier. |
| ○ | Temperature outlier; other metrics may still contribute. |
| ◇ | Outside the preferred pool; may still fill a missing scalar metric. |
| ≈ | Approximate reading, excluded from every aggregate. |

### Settings and stored data

| Option | Choices / behavior |
| --- | --- |
| **Language** | Automatic browser detection (default), English, Czech, Spanish. |
| **Theme** | Light / Dark / System. |
| **Font size** | Small / Medium / Large / Extra large. |
| **Icon set** | Standard / Modern / Playful. |
| **Units** | Metric or imperial for temperature, pressure, precipitation and distance. Wind has its own display setting. |
| **Wind display** | m/s, km/h, mph, Beaufort, or combined m/s + Beaufort. |
| **IQR factor** | 1.0–3.0; lower is stricter, default 1.5. |
| **Auto-refresh** | 5 / 15 / 30 minutes or off; default 30 minutes. |
| **API Keys** | OpenWeatherMap, Tomorrow.io, Windy; Windy free-tier switch. |
| **Export / Import** | Full configuration as JSON, including API keys; invalid imports leave the existing config unchanged. |

Configuration is stored in browser `localStorage`; the full config is not sent to
a server. Weather requests send coordinates and the relevant provider key.
Place-name search uses Open-Meteo geocoding; reverse geocoding sends coordinates
to BigDataCloud. Successful weather GET requests may also be stored in the
service worker's Cache Storage, including API-key-bearing request URLs. Keep
exported config files private. Weather results themselves are not saved in
`localStorage`. Invalid stored config resets to defaults; missing fields in older
valid configs receive defaults.

### PWA, updates and offline use

Install through your browser's install action or **Add to Home Screen** on iOS.
Settings shows an install action when the browser's install prompt is available.
When a new service worker is detected, use the **Update** banner to load it.

The app shell is cached after successful service-worker installation. Weather GET
responses use a network-first cache with a 5-minute lifetime and up to 20 entries
per provider. Offline reload can display usable cached responses; it is not a
permanent history of all fetched weather. A failed same-query refresh can retain
the last successful in-memory result. Windy's POST is not cached by the current
GET rule. Geolocation, place search and uncached/expired requests may fail offline.

---

## Česky

Agregátor aktuálních dat z meteorologických API a numerických modelů (NWP).
Filtruje odlehlé hodnoty a zobrazuje agregované metriky. Čistě klientská React PWA
hostovaná na GitHub Pages.

**Živá aplikace:** https://honzabfu.github.io/jz-weatherfusion/

### Screenshoty

| Průměr | Stanice | Zdroje |
|:---:|:---:|:---:|
| ![Průměr — světlý](docs/screenshots/light-aggregated.png) | ![Stanice — světlý](docs/screenshots/light-stations.png) | ![Zdroje — světlý](docs/screenshots/light-sources.png) |
| ![Průměr — tmavý](docs/screenshots/dark-aggregated.png) | ![Stanice — tmavý](docs/screenshots/dark-stations.png) | ![Zdroje — tmavý](docs/screenshots/dark-sources.png) |

### Rychlý start a lokality

1. Otevřete aplikaci a přes **Přidat lokalitu** vyhledejte místo nebo zadejte souřadnice.
2. Open-Meteo funguje bez klíče a ihned poskytne modelová data.
3. Volitelné klíče OpenWeatherMap, Tomorrow.io a Windy přidejte v **Nastavení → API klíče**.
   Skutečnou dostupnost, chyby a čas načtení ověříte v záložce **Zdroje**.

Pro sledování zařízení ručně přidejte **📡 Moje aktuální poloha**. Při každém
obnovení aplikace zjišťuje polohu; uchovává poslední souřadnice a případně název
místa. Je potřeba povolení geolokace v prohlížeči. Dynamická lokalita se sama
nevytváří. Výchozí interval obnovení je 30 minut; zastaralá data se obnoví také
při návratu do aplikace. Úprava pevných souřadnic nebo poloměru spustí nové načtení.

### Záložky

| Záložka | Popis |
| --- | --- |
| **Průměr** | Filtrované metriky a počty přispívajících hodnot; štítek modelu označuje doplnění konkrétní metriky. |
| **Stanice** | Jednotlivé položky poskytovatelů, jejich stav, vzdálenost položek označených jako stanice a detail. |
| **Zdroje** | Stav poskytovatelů, chyby, čas načtení a diagnostický log. |

### Datové zdroje

| Zdroj | API klíč | Aktuální chování |
| --- | --- | --- |
| **Open-Meteo** | Není potřeba | Tři modelové dotazy (`best_match`, ICON, ECMWF); UV, pokud je dostupné. Best-match může odpovídat i jinému dotazovanému modelu. |
| **OpenWeatherMap** | Vyžadován | Až deset okolních položek aktuálního počasí, filtrovaných podle poloměru. Aplikace je označuje `station` a upřednostňuje v agregaci. |
| **Tomorrow.io** | Vyžadován | Realtime modelová data označená jako `model`. |
| **Windy** | Vyžadován | GFS přes Point Forecast API. Výchozí přepínač bezplatného tarifu označí data jako přibližná (≈) a vyloučí je. Jeho vypnutí pro odpovídající klíč umožní běžnou účast v modelovém průměru. |

Označení OWM jako **stanice** nezaručuje měření z jednotlivého fyzického PWS
senzoru. [OWM popisuje aktuální počasí](https://openweathermap.org/current) jako
kombinaci modelů, satelitů, radaru a meteorologických stanic. Klasifikace v aplikaci
je odlišná od prokázaného původu měření; nelze slíbit obecnou výhodu v přesnosti.

Klíče a aktuální limity tarifů: [OpenWeatherMap](https://openweathermap.org/api),
[Tomorrow.io](https://www.tomorrow.io), [Windy Point Forecast](https://api.windy.com/point-forecast).
Data bezplatného Windy tarifu jsou určena k testování a mohou být záměrně změněna.
Přístup mohou omezovat tarif i CORS v prohlížeči. Výběr časového kroku Windy má
navíc známý rozpor jednotek: [#59](https://github.com/honzabfu/jz-weatherfusion/issues/59).

### Filtrování a agregace

1. **Vyloučení přibližných dat.** Zůstávají viditelná v záložce Stanice.
2. **Preference položek označených `station`.** Bez nich se použijí nepřibližné
   modely. Pokud preferované položky neposkytují některou skalární metriku
   (například UV), doplní ji modely; karta ji označí štítkem modelu.
3. **IQR filtr pro každou metriku**, poté průměr zbývajících hodnot. Směr větru
   používá kruhový průměr preferované skupiny, bez IQR a bez samostatného doplnění
   z modelů.

Změna IQR nebo přepínače Windy ihned přepočítá existující data bez dalších síťových
dotazů. Počty přispěvatelů se vztahují ke konkrétní metrice, nikoli k nezávislým
poskytovatelům. Značka odlehlosti v tabulce vychází z **teploty**; ostatní metriky
se filtrují samostatně.

| Symbol | Význam |
| --- | --- |
| ● | V preferované skupině, teplota není označena jako odlehlá. |
| ○ | Odlehlá teplota; ostatní metriky mohou přispívat. |
| ◇ | Mimo preferovanou skupinu; může doplňovat chybějící skalární metriku. |
| ≈ | Přibližná data, vyloučená ze všech agregovaných metrik. |

### Nastavení a uložená data

| Možnost | Volby / chování |
| --- | --- |
| **Jazyk** | Automaticky podle prohlížeče (výchozí), angličtina, čeština, španělština. |
| **Motiv** | Světlý / Tmavý / Systémový. |
| **Velikost písma** | Malé / Výchozí / Velké / Velmi velké. |
| **Sada ikon** | Standardní / Moderní / Hravá. |
| **Jednotky** | Metrické nebo imperiální pro teplotu, tlak, srážky a vzdálenost. Vítr má samostatnou volbu. |
| **Zobrazení větru** | m/s, km/h, mph, Beaufort nebo kombinace m/s + Beaufort. |
| **IQR faktor** | 1,0–3,0; nižší je přísnější, výchozí 1,5. |
| **Automatické obnovení** | 5 / 15 / 30 minut nebo vypnuto; výchozí 30 minut. |
| **API klíče** | OpenWeatherMap, Tomorrow.io, Windy; přepínač bezplatného Windy tarifu. |
| **Export / Import** | Celá konfigurace v JSON včetně API klíčů; neplatný import ponechá původní konfiguraci. |

Konfigurace je v `localStorage` prohlížeče; jako celek se na server neposílá.
Meteorologické dotazy odesílají souřadnice a klíč příslušného poskytovatele.
Vyhledávání míst používá geokódování Open-Meteo; převod souřadnic na název místa
odesílá souřadnice BigDataCloud. Úspěšné GET dotazy mohou být také v Cache Storage
service workeru, včetně URL s API klíčem. Exportované soubory uchovávejte soukromě.
Samotné počasí se do `localStorage` neukládá. Neplatná uložená konfigurace se
obnoví na výchozí hodnoty; chybějící pole starších platných konfigurací se doplní.

### PWA, aktualizace a offline režim

Aplikaci nainstalujte nabídkou prohlížeče nebo přes **Přidat na plochu** na iOS.
Nastavení nabídne instalaci, pokud je dostupná instalační událost prohlížeče.
Při detekci nového service workeru použijte pruh **Aktualizovat**.

Po úspěšné instalaci service workeru je rozhraní v mezipaměti. GET odpovědi počasí
používají přednostně síť, s mezipamětí na 5 minut a nejvýše 20 položkami na
poskytovatele. Obnovení offline může zobrazit dostupné odpovědi z mezipaměti;
nejde o trvalou historii počasí. Při chybě obnovení stejného dotazu lze ponechat
poslední úspěšný výsledek v paměti otevřené aplikace. Windy POST se současným GET
pravidlem necachuje. Geolokace, vyhledávání míst a chybějící či expirované odpovědi
mohou offline selhat.
