// src/hooks/useConfig.js
import { useState, useCallback, useEffect } from 'react'
import { loadConfig, saveConfig, newLocation, normalizeConfig } from '../lib/config.js'

export function useConfig() {
  const [config, setConfig] = useState(() => loadConfig())

  // Persist on every change
  useEffect(() => {
    saveConfig(config)
  }, [config])

  // ── Preferences ────────────────────────────────────────────────────────────
  const setPreference = useCallback((key, value) => {
    setConfig(c => ({
      ...c,
      preferences: { ...c.preferences, [key]: value }
    }))
  }, [])

  // ── API keys ───────────────────────────────────────────────────────────────
  const setApiKey = useCallback((service, value) => {
    setConfig(c => ({
      ...c,
      apiKeys: { ...c.apiKeys, [service]: value }
    }))
  }, [])

  // ── Locations ──────────────────────────────────────────────────────────────
  const addLocation = useCallback((label, lat, lon, radiusKm = 10, dynamic = false) => {
    const loc = newLocation(label, lat, lon, radiusKm, dynamic)
    setConfig(c => {
      const locations = [...c.locations, loc]
      return {
        ...c,
        locations,
        activeLocationId: c.activeLocationId ?? loc.id,
      }
    })
    return loc.id
  }, [])

  const updateLocation = useCallback((id, updates) => {
    setConfig(c => ({
      ...c,
      locations: c.locations.map(l => l.id === id ? { ...l, ...updates } : l)
    }))
  }, [])

  const deleteLocation = useCallback((id) => {
    setConfig(c => {
      const locations = c.locations.filter(l => l.id !== id)
      const activeLocationId = c.activeLocationId === id
        ? (locations[0]?.id ?? null)
        : c.activeLocationId
      return { ...c, locations, activeLocationId }
    })
  }, [])

  const setActiveLocation = useCallback((id) => {
    setConfig(c => ({ ...c, activeLocationId: id }))
  }, [])

  const activeLocation = config.locations.find(l => l.id === config.activeLocationId) ?? null

  // ── Import / replace ───────────────────────────────────────────────────────
  const replaceConfig = useCallback((newConfig) => {
    setConfig(normalizeConfig(newConfig))
  }, [])

  return {
    config,
    activeLocation,
    setPreference,
    setApiKey,
    addLocation,
    updateLocation,
    deleteLocation,
    setActiveLocation,
    replaceConfig,
  }
}
