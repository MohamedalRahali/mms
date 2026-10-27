import { useEffect, useState } from 'react'

/**
 * Profondeur des données (server/radar.js historyOf) : « données depuis le JJ/MM », nombre de jours, et si les
 * comparaisons (hausses, moyennes, sujets nouveaux) sont fiables (14 jours au moins). Lu une fois par page.
 */
export type History = { since: string | null; days: number; enough: boolean; min: number }

let cached: Promise<History | null> | null = null
let at = 0
function load() {
  if (!cached || Date.now() - at > 10 * 60_000) {
    at = Date.now()
    cached = fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => (h?.history as History) ?? null)
      .catch(() => null)
  }
  return cached
}

export function useHistory() {
  const [h, setH] = useState<History | null>(null)
  useEffect(() => {
    let off = false
    load().then((v) => !off && setH(v))
    return () => {
      off = true
    }
  }, [])
  return h
}

/** « 20/10 » */
export const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`
