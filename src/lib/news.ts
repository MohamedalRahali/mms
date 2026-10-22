import { createContext, useContext, useEffect, useState } from 'react'

/** Types, libellés et outils partagés par les pages d'actualités, les statistiques et le rapport */

export type Flux = 'mosaique' | 'libye'

export type NewsItem = {
  id: string
  flux: Flux
  title: string
  summary: string
  category: string
  date: string
  origin: string
  channel: string
  lang: string
  url: string
  broadcasts: number
  live: boolean
  image?: string
  demo?: boolean
}

export type Count = { name: string; count: number }

export type NewsResponse = {
  total: number
  page: number
  pages: number
  items: NewsItem[]
  lastUpdate: string | null
  demo: boolean
}

export type Facets = { flux: Count[]; categories: Count[]; channels: Count[]; languages: Count[] }

export type Stats = {
  days: number
  total: number
  sourcesCount: number
  broadcasts: number
  perDay: { date: string; count: number }[]
  flux: Count[]
  categories: Count[]
  sources: Count[]
  channels: Count[]
  lastUpdate: string | null
  demo: boolean
}

export type Report = { day: string | null; available: string[]; items: NewsItem[]; demo: boolean }

export type Filters = { q: string; days: string; category: string; channel: string; lang: string; watch: string }
export const EMPTY_FILTERS: Filters = { q: '', days: '', category: '', channel: '', lang: '', watch: '' }

// Mosaïque FM n'est plus suivie : seule la veille Libye alimente MMS
export const FLUX_KEYS: Flux[] = ['libye']

/** Recharge toutes les 60 s : la plateforme diffuse les actualités au fil de la veille */
export const REFRESH_MS = 60_000

/** Incrémenté par « تحديث الآن » ou le menu : toutes les données se rechargent aussitôt */
export const RefreshContext = createContext(0)
export const ReloadContext = createContext<() => void>(() => {})

export type KeyState = { name: string; set: boolean; budget?: number }
export type UsageRow = { runs: number; input: number; output: number; cost: number }

export type Health = {
  ok: boolean
  lastUpdate: string | null
  demo: boolean
  ai: boolean
  aiProvider?: '' | 'claude' | 'gemini' | 'openai'
  keys?: { mms: KeyState[]; libye: KeyState[] | null }
  aiUsage?: { month: string; current: Record<string, UsageRow>; total: Record<string, UsageRow> }
  sources: { flux: Flux; dir: string; found: boolean; count: number }[]
}

export function useFetch<T>(url: string, refreshMs = REFRESH_MS) {
  const bump = useContext(RefreshContext)
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!refreshMs) return
    const id = window.setInterval(() => setTick((t) => t + 1), refreshMs)
    return () => window.clearInterval(id)
  }, [refreshMs])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json) => {
        if (cancelled) return
        setData(json as T)
        setError(false)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [url, tick, bump])

  return { data, error, loading }
}
