// src/App.jsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { useConfig }   from './hooks/useConfig.js'
import { useWeather }  from './hooks/useWeather.js'
import { useTheme }    from './hooks/useTheme.js'
import { usePullToRefresh } from './hooks/usePullToRefresh.js'
import { useSwipeNav } from './hooks/useSwipeNav.js'
import { useOnlineStatus } from './hooks/useOnlineStatus.js'
import { MetricCard }    from './components/MetricCard.jsx'
import { Compass }       from './components/Compass.jsx'
import { StationsTable } from './components/StationsTable.jsx'
import { StationDetail } from './components/StationDetail.jsx'
import { SettingsModal } from './components/SettingsModal.jsx'
import { LocationModal } from './components/LocationModal.jsx'
import { UpdateBanner }  from './components/UpdateBanner.jsx'
import { SOURCES } from './lib/sources/registry.js'
import { windDirLabel, displayWind } from './lib/units.js'
import { metricIcon } from './lib/icons.js'
import { t, resolveLanguage } from './lib/i18n.js'
import strings from './lib/i18n.js'
import { reverseGeocode } from './lib/geocode.js'

const TABS = ['aggregated', 'stations', 'sources']

function LocationPicker({ locations, activeId, onSelect, onDelete, onEdit, onAdd, onAddDynamic, lang }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const active = locations.find(l => l.id === activeId)
  const hasDynamic = locations.some(l => l.dynamic)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)',
          padding: '6px 10px',
          fontSize: '0.8125rem', fontWeight: 600,
          cursor: 'pointer', maxWidth: 180,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {active?.dynamic ? '📡' : '📍'} {active?.label ?? '—'}
        </span>
        <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', flexShrink: 0 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          minWidth: 200, zIndex: 200,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
        }}>
          {locations.map(l => (
            <div key={l.id} style={{
              display: 'flex', alignItems: 'center',
              borderBottom: '1px solid var(--border)',
            }}>
              <button
                onClick={() => { onSelect(l.id); setOpen(false) }}
                style={{
                  flex: 1, textAlign: 'left',
                  padding: '10px 12px',
                  background: l.id === activeId ? 'var(--bg-elevated)' : 'transparent',
                  border: 'none', color: 'var(--text-primary)',
                  fontSize: '0.8125rem', fontWeight: l.id === activeId ? 700 : 400,
                  cursor: 'pointer',
                }}
              >
                {l.id === activeId && '✓ '}{l.dynamic ? '📡 ' : ''}{l.label}
                {l.dynamic && (
                  <span style={{
                    marginLeft: 6, padding: '1px 6px',
                    fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                    background: 'var(--accent)', color: '#fff',
                    borderRadius: 'var(--radius-sm)', verticalAlign: 'middle',
                  }}>
                    {t(lang, 'locationDynamicBadge')}
                  </span>
                )}
              </button>
              <button
                onClick={() => { onEdit(l); setOpen(false) }}
                title={t(lang, 'locationEdit')}
                style={{
                  padding: '10px 10px',
                  background: 'transparent', border: 'none',
                  color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1,
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                ✎
              </button>
              <button
                onClick={() => onDelete(l.id)}
                title={t(lang, 'locationDelete')}
                style={{
                  padding: '10px 12px',
                  background: 'transparent', border: 'none',
                  color: 'var(--error)', fontSize: '1.125rem', lineHeight: 1,
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
          {!hasDynamic && (
            <button
              onClick={() => { onAddDynamic(); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 12px',
                background: 'transparent', border: 'none',
                borderBottom: '1px solid var(--border)',
                color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📡 {t(lang, 'locationDynamicAdd')}
            </button>
          )}
          <button
            onClick={() => { onAdd(); setOpen(false) }}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 12px',
              background: 'transparent', border: 'none',
              color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + {t(lang, 'actionAddLocation')}
          </button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const {
    config, activeLocation,
    setPreference, setApiKey,
    addLocation, updateLocation, deleteLocation, setActiveLocation,
    replaceConfig,
  } = useConfig()

  const { preferences, apiKeys } = config
  const lang = resolveLanguage(preferences.language)
  const langStrings = strings[lang] ?? strings.en

  useTheme(preferences.theme, preferences.fontSize)

  // Cache a dynamic location's resolved GPS coordinates back into config so the
  // info bar and station-distance calculations reflect the real position.
  const handleResolveCoords = useCallback(
    (id, coords) => updateLocation(id, coords),
    [updateLocation],
  )

  const { result, sourceStatus, loading, lastUpdated, geoError, log, refetch } = useWeather(
    activeLocation,
    apiKeys,
    preferences.iqrFactor,
    preferences.refreshIntervalMin,
    preferences.windyKeyFree,
    handleResolveCoords,
  )

  // A dynamic location starts at the 0/0 placeholder until its first GPS fix.
  const dynamicUnresolved = !!activeLocation?.dynamic && activeLocation.lat === 0 && activeLocation.lon === 0

  const addDynamicLocation = () => {
    const id = addLocation(t(lang, 'locationDynamicLabel'), 0, 0, 10, true)
    setActiveLocation(id)
  }

  // Reverse-geocode a dynamic location's resolved coordinates into a place name
  // (best-effort, no key). Only fires when the position has actually moved
  // (~>1 km) or no name exists yet, so a stationary user costs one call total.
  useEffect(() => {
    const loc = activeLocation
    if (!loc?.dynamic || (loc.lat === 0 && loc.lon === 0)) return
    const dLat = Math.abs((loc.placeNameLat ?? 999) - loc.lat)
    const dLon = Math.abs((loc.placeNameLon ?? 999) - loc.lon)
    if (loc.placeName && dLat < 0.01 && dLon < 0.01) return
    const ctrl = new AbortController()
    reverseGeocode(loc.lat, loc.lon, lang, ctrl.signal)
      .then(name => {
        if (name) updateLocation(loc.id, { placeName: name, placeNameLat: loc.lat, placeNameLon: loc.lon })
      })
      .catch(() => { /* best-effort — name stays optional */ })
    return () => ctrl.abort()
  }, [activeLocation?.id, activeLocation?.lat, activeLocation?.lon, activeLocation?.dynamic, lang, updateLocation])  // eslint-disable-line

  const [tab,             setTab]             = useState('aggregated')
  const [showSettings,    setShowSettings]    = useState(false)
  const [showAddLoc,      setShowAddLoc]      = useState(false)
  const [editLoc,         setEditLoc]         = useState(null)
  const [showLog,         setShowLog]         = useState(false)
  const [stationFilter,   setStationFilter]   = useState('all')
  const [selection, setSelection] = useState(null)
  const selectionScope = activeLocation ? JSON.stringify([
    activeLocation.id, activeLocation.dynamic, activeLocation.lat,
    activeLocation.lon, activeLocation.radiusKm,
  ]) : null
  const selectedStation = selection?.scope === selectionScope
    ? result?.rawReadings.find(r => r.stationId === selection.stationId && r.source === selection.source)
    : null
  const setSelectedStation = (reading) => setSelection(reading ? {
    scope: selectionScope, stationId: reading.stationId, source: reading.source,
  } : null)
  // Windy free key is excluded from the aggregate, so it doesn't improve accuracy
  const hasUsefulKey = !!(
    apiKeys.owm ||
    apiKeys.tomorrow ||
    (apiKeys.windy && !preferences.windyKeyFree)
  )

  // Pull-to-refresh (touch). Disabled while a modal is open or there's nothing
  // to fetch, so the gesture never fights with an overlay or fires uselessly.
  const { pullDistance, refreshing, threshold } = usePullToRefresh(refetch, {
    disabled: !activeLocation || showSettings || showAddLoc || !!editLoc,
  })
  const pullProgress = Math.min(1, pullDistance / threshold)

  // Swipe left/right to move between tabs on touch devices. Disabled while a
  // modal or a station detail is open, or when there's no location yet, so the
  // gesture never yanks the user out of those contexts.
  const changeTab = (dir) => {
    setSelectedStation(null)
    setTab(cur => {
      const i = TABS.indexOf(cur)
      const next = i + dir
      if (next < 0 || next >= TABS.length) return cur
      // Light haptic tick on a successful swipe (Android; no-op on iOS).
      navigator.vibrate?.(10)
      return TABS[next]
    })
  }
  useSwipeNav(() => changeTab(1), () => changeTab(-1), {
    disabled: !activeLocation || showSettings || showAddLoc || !!editLoc || !!selectedStation,
  })

  const online = useOnlineStatus()

  const METRIC_DEFS = [
    { key: 'temp',      labelKey: 'metricTemp'     },
    { key: 'humidity',  labelKey: 'metricHumidity' },
    { key: 'pressure',  labelKey: 'metricPressure' },
    { key: 'clouds',    labelKey: 'metricClouds'   },
    { key: 'precip',    labelKey: 'metricPrecip'   },
    { key: 'uvIndex',   labelKey: 'metricUV'       },
  ]

  const windDisplay = result
    ? displayWind(result.perMetric?.windSpeed?.value ?? null, preferences.windDisplay, lang, langStrings)
    : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Pull-to-refresh indicator (touch) ───────────────────────────────── */}
      {(pullDistance > 0 || refreshing) && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: 0,
            left: '50%',
            transform: `translateX(-50%) translateY(${(refreshing ? threshold : pullDistance) - 8}px)`,
            width: 36, height: 36,
            borderRadius: '50%',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-md)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100,
            color: 'var(--accent)',
            fontSize: '1.125rem',
            opacity: refreshing ? 1 : pullProgress,
            transition: refreshing || pullDistance === 0 ? 'transform 0.2s ease, opacity 0.2s ease' : 'none',
            pointerEvents: 'none',
          }}
        >
          <span style={{
            display: 'inline-block',
            animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
            transform: refreshing ? 'none' : `rotate(${pullProgress * 270}deg)`,
          }}>
            ⟳
          </span>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        // Pad past the notch / status bar and side cutouts in standalone PWA mode.
        padding: 'calc(12px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) 12px calc(16px + env(safe-area-inset-left))',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '0.9375rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--accent)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {t(lang, 'appName')}
          </div>
        </div>

        {/* Location picker */}
        {config.locations.length > 0 && (
          <LocationPicker
            locations={config.locations}
            activeId={config.activeLocationId}
            onSelect={setActiveLocation}
            onDelete={deleteLocation}
            onEdit={setEditLoc}
            onAdd={() => setShowAddLoc(true)}
            onAddDynamic={addDynamicLocation}
            lang={lang}
          />
        )}

        {(() => {
          // Icon-only to save header space on phones; the label lives in
          // title/aria-label for hover and assistive tech.
          const actionLabel = loading
            ? t(lang, 'statusFetching')
            : activeLocation ? t(lang, 'actionRefresh') : t(lang, 'actionAddLocation')
          return (
            <button
              onClick={() => activeLocation ? refetch() : setShowAddLoc(true)}
              disabled={loading}
              className="btn btn-primary"
              style={{ padding: '8px', minWidth: 40, justifyContent: 'center' }}
              title={actionLabel}
              aria-label={actionLabel}
            >
              {activeLocation ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                  style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }}>
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              )}
            </button>
          )
        })()}

        <button onClick={() => setShowSettings(true)} className="btn-icon" title={t(lang, 'actionSettings')}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      {/* ── Offline banner ──────────────────────────────────────────────────── */}
      {!online && (
        <div style={{
          background: 'var(--warning)',
          color: '#000',
          fontSize: '0.75rem',
          fontWeight: 600,
          textAlign: 'center',
          padding: '6px calc(8px + env(safe-area-inset-right)) 6px calc(8px + env(safe-area-inset-left))',
        }}>
          {t(lang, 'statusOffline')}
        </div>
      )}

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main style={{
        flex: 1,
        // Clear the home indicator and side cutouts; top stays 16px under the header.
        padding: '16px calc(16px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))',
        maxWidth: 720, width: '100%', margin: '0 auto',
      }}>

        {/* No location state */}
        {config.locations.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '48px 24px',
            color: 'var(--text-muted)', fontSize: '0.875rem',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>📍</div>
            <div style={{ marginBottom: 16 }}>{t(lang, 'locationNoData')}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => setShowAddLoc(true)}
                style={{ justifyContent: 'center' }}>
                + {t(lang, 'actionAddLocation')}
              </button>
              <button className="btn btn-ghost" onClick={addDynamicLocation}
                style={{ justifyContent: 'center' }}>
                📡 {t(lang, 'locationDynamicAdd')}
              </button>
            </div>
          </div>
        )}

        {/* Location info bar */}
        {activeLocation && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              {activeLocation.dynamic && <span>📡</span>}
              {activeLocation.dynamic && activeLocation.placeName && !dynamicUnresolved
                ? activeLocation.placeName
                : activeLocation.label}
              {activeLocation.dynamic && (
                <span style={{
                  padding: '2px 7px',
                  fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                  background: 'var(--accent)', color: '#fff',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  {t(lang, 'locationDynamicBadge')}
                </span>
              )}
            </div>
            {geoError ? (
              <div style={{ fontSize: '0.6875rem', color: 'var(--error)', marginTop: 2 }}>
                {t(lang, 'locationDynamicError')}
              </div>
            ) : (
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {dynamicUnresolved
                  ? t(lang, 'locationLocating')
                  : <>{activeLocation.lat.toFixed(4)}° N, {activeLocation.lon.toFixed(4)}° E</>}
                {' · '}{activeLocation.radiusKm} km
                {lastUpdated && !dynamicUnresolved && (
                  <span style={{ marginLeft: 8 }}>
                    · {t(lang, 'statusUpdated')} {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}
            {activeLocation.dynamic && !geoError && (
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {t(lang, 'locationDynamicDesc')}
              </div>
            )}
          </div>
        )}

        {/* No API keys onboarding banner */}
        {activeLocation && !hasUsefulKey && !preferences.apiKeyBannerDismissed && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            marginBottom: 16,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
                {t(lang, 'noApiKeysBannerTitle')}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {t(lang, 'noApiKeysBannerDesc')}
              </div>
              <button
                className="btn btn-primary"
                style={{ marginTop: 10, padding: '5px 14px', fontSize: '0.75rem' }}
                onClick={() => setShowSettings(true)}
              >
                {t(lang, 'noApiKeysBannerCta')}
              </button>
            </div>
            <button
              onClick={() => setPreference('apiKeyBannerDismissed', true)}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--text-muted)', fontSize: '1.125rem',
                cursor: 'pointer', padding: '0 4px', flexShrink: 0,
                lineHeight: 1,
              }}
              aria-label={t(lang, 'actionCancel')}
            >
              ×
            </button>
          </div>
        )}

        {/* No OWM key banner — shown when user has other keys but physical stations are missing */}
        {activeLocation && hasUsefulKey && !apiKeys.owm && !preferences.owmBannerDismissed && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--warning)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            marginBottom: 16,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
                {t(lang, 'noOWMBannerTitle')}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {t(lang, 'noOWMBannerDesc')}
              </div>
              <button
                className="btn btn-primary"
                style={{ marginTop: 10, padding: '5px 14px', fontSize: '0.75rem' }}
                onClick={() => setShowSettings(true)}
              >
                {t(lang, 'noOWMBannerCta')}
              </button>
            </div>
            <button
              onClick={() => setPreference('owmBannerDismissed', true)}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--text-muted)', fontSize: '1.125rem',
                cursor: 'pointer', padding: '0 4px', flexShrink: 0,
                lineHeight: 1,
              }}
              aria-label={t(lang, 'actionCancel')}
            >
              ×
            </button>
          </div>
        )}

        {/* Tab bar */}
        {activeLocation && (
          <div style={{
            display: 'flex', gap: 2,
            background: 'var(--bg-elevated)',
            padding: 3, borderRadius: 'var(--radius-md)',
            marginBottom: 20,
          }}>
            {TABS.map(tb => (
              <button key={tb} onClick={() => { setTab(tb); setSelectedStation(null) }} style={{
                flex: 1, padding: '8px', border: 'none',
                borderRadius: 'var(--radius-sm)',
                background: tab === tb ? 'var(--bg-surface)' : 'transparent',
                color: tab === tb ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: tab === tb ? 700 : 400,
                fontSize: '0.8125rem',
                boxShadow: tab === tb ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s',
              }}>
                {t(lang, `tab${tb.charAt(0).toUpperCase() + tb.slice(1)}`)}
              </button>
            ))}
          </div>
        )}

        {/* Loading indicator */}
        {loading && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: 16 }}>
            <span style={{ animation: 'pulse 1s infinite' }}>⟳</span> {t(lang, 'statusFetching')}
          </div>
        )}

        {/* ── Tab: Aggregated ─────────────────────────────────────────────── */}
        {tab === 'aggregated' && result && (
          <>
            {result.stationCount > 0 && (
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: 12, fontStyle: 'italic' }}>
                {t(lang, result.usingStations ? 'aggUsingStations' : 'aggUsingModels', result.stationCount)}
              </div>
            )}
            <div className="metric-grid" style={{ marginBottom: 16 }}>
              {METRIC_DEFS.map(({ key, labelKey }) => {
                const data = result.perMetric[key]
                if (!data || data.total === 0) return null
                const isHero = key === 'temp'
                return (
                  <MetricCard
                    key={key}
                    metric={key}
                    label={t(lang, labelKey)}
                    data={data}
                    prefs={preferences}
                    langStrings={langStrings}
                    hero={isHero}
                    className={isHero ? 'metric-hero' : undefined}
                    onClick={() => setTab('stations')}
                  />
                )
              })}
            </div>

            {/* Merged wind card — speed + direction + compass */}
            {(result.windDirMean !== null || (result.perMetric?.windSpeed?.total ?? 0) > 0) && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setTab('stations')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setTab('stations') }}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px 20px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 20,
                  marginBottom: 16,
                  borderTop: '3px solid var(--metric-wind)',
                  cursor: 'pointer',
                }}
              >
                {result.windDirMean !== null && (
                  <Compass deg={result.windDirMean} lang={lang} size={88} />
                )}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{metricIcon(preferences.iconSet, 'windSpeed')}</span>
                    <span className="label-xs">{t(lang, 'metricWind')}</span>
                  </div>
                  {windDisplay?.value !== null && (
                    <div style={{
                      fontSize: '2rem', fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
                    }}>
                      {windDisplay.value}
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginLeft: 4 }}>
                        {windDisplay.unit}
                      </span>
                    </div>
                  )}
                  {result.windDirMean !== null && (
                    <div style={{ fontSize: '1rem', fontWeight: 600, marginTop: 4 }}>
                      {windDirLabel(result.windDirMean, lang)}
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginLeft: 8, fontFamily: 'monospace' }}>
                        {result.windDirMean}°
                      </span>
                    </div>
                  )}
                  {windDisplay?.combined && windDisplay.beaufort !== null && windDisplay.label && (
                    <div style={{ fontSize: '0.6875rem', color: 'var(--metric-wind)', fontWeight: 600, marginTop: 2 }}>
                      Bft {windDisplay.beaufort} · {windDisplay.label}
                    </div>
                  )}
                  {(() => {
                    const ws = result.perMetric?.windSpeed
                    if (!ws) return null
                    return (
                      <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 4 }}>
                        {ws.contributors}/{ws.total}
                        {ws.removed > 0 && (
                          <span style={{ color: 'var(--warning)', marginLeft: 6 }}>−{t(lang, 'outliersRemoved', ws.removed)}</span>
                        )}
                        {ws.min !== null && ws.max !== null && (
                          <span style={{ marginLeft: 6 }}>({ws.min}–{ws.max})</span>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Stations ───────────────────────────────────────────────── */}
        {tab === 'stations' && (() => {
          if (selectedStation) {
            return (
              <StationDetail
                reading={selectedStation}
                prefs={preferences}
                langStrings={langStrings}
                onBack={() => setSelectedStation(null)}
                origin={activeLocation}
              />
            )
          }

          const raw = result?.rawReadings ?? []
          const filtered = stationFilter === 'active'
            ? raw.filter(r => !r.isOutlier && !r.approximate && !r.excludedBySourceType)
            : stationFilter === 'outlier'
              ? raw.filter(r => r.isOutlier || r.approximate || r.excludedBySourceType)
              : raw

          const SOURCE_LABELS = Object.fromEntries(
            SOURCES.map(s => [s.key, t(lang, s.labelKey)])
          )
          const noKeySources = Object.entries(sourceStatus).filter(([, s]) => s.status === 'no-key')
          const errorSources = Object.entries(sourceStatus).filter(([, s]) => s.status === 'error')

          return (
            <>
              {raw.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                  {[
                    { key: 'all',     label: t(lang, 'stationAll') },
                    { key: 'active',  label: t(lang, 'stationActive') },
                    { key: 'outlier', label: t(lang, 'stationOutlier') },
                  ].map(f => (
                    <button key={f.key} onClick={() => setStationFilter(f.key)} style={{
                      padding: '5px 12px',
                      fontSize: '0.75rem', fontWeight: stationFilter === f.key ? 700 : 400,
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: stationFilter === f.key ? 'var(--accent)' : 'var(--bg-elevated)',
                      color: stationFilter === f.key ? '#fff' : 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}>{f.label}</button>
                  ))}
                </div>
              )}
              {raw.length === 0 && noKeySources.length === 0 && errorSources.length === 0 && !loading && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', padding: '12px 0' }}>
                  {t(lang, 'errorNoSources')}
                </div>
              )}
              <StationsTable
                readings={filtered}
                prefs={preferences}
                langStrings={langStrings}
                onSelect={setSelectedStation}
                origin={activeLocation}
              />
              {(errorSources.length > 0 || noKeySources.length > 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: raw.length > 0 ? 12 : 0 }}>
                  {errorSources.map(([key, s]) => (
                    <div key={key} style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderLeft: '3px solid var(--error)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}>
                      <span className="dot dot-error" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                          {SOURCE_LABELS[key] ?? key}
                        </div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--error)' }}>
                          {s.error}
                        </div>
                      </div>
                    </div>
                  ))}
                  {noKeySources.map(([key]) => (
                    <div key={key} style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}>
                      <span className="dot dot-idle" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                          {SOURCE_LABELS[key] ?? key}
                        </div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                          {t(lang, 'sourceNoKey')}
                        </div>
                      </div>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 10px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                        onClick={() => setShowSettings(true)}
                      >
                        {t(lang, 'noApiKeysBannerCta')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )
        })()}

        {/* ── Tab: Sources ────────────────────────────────────────────────── */}
        {tab === 'sources' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(sourceStatus).map(([key, status]) => (
              <div key={key} style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <span className={`dot dot-${status.status}`} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{key}</div>
                  {status.error && <div style={{ fontSize: '0.6875rem', color: 'var(--error)' }}>{status.error}</div>}
                  {status.fetchedAt && (
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                      {new Date(status.fetchedAt).toLocaleTimeString()} · {status.count} {t(lang, 'readings')}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {status.status}
                </span>
              </div>
            ))}

            {/* Debug log toggle */}
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setShowLog(!showLog)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}>
                {showLog ? '▾' : '▸'} Debug log ({log.length})
              </button>
              {showLog && (
                <div style={{
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  marginTop: 6,
                  maxHeight: 200,
                  overflowY: 'auto',
                }}>
                  {log.map((l, i) => (
                    <div key={i} style={{
                      fontSize: '0.6875rem', fontFamily: 'monospace', lineHeight: 1.7,
                      color: l.includes('✗') ? 'var(--error)' : l.includes('✓') ? 'var(--success)' : 'var(--text-muted)',
                    }}>{l}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showSettings && (
        <SettingsModal
          config={config}
          lang={lang}
          onSetPreference={setPreference}
          onSetApiKey={setApiKey}
          onReplaceConfig={replaceConfig}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showAddLoc && (
        <LocationModal
          lang={lang}
          onAdd={addLocation}
          onClose={() => setShowAddLoc(false)}
        />
      )}

      {editLoc && (
        <LocationModal
          lang={lang}
          initialValues={editLoc}
          onAdd={(label, lat, lon, radiusKm) => {
            updateLocation(editLoc.id, { label, lat, lon, radiusKm })
            setEditLoc(null)
          }}
          onClose={() => setEditLoc(null)}
        />
      )}

      <UpdateBanner lang={lang} />
    </div>
  )
}
