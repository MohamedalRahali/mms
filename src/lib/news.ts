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
  // Couche « intelligence » : tonalité et entités viennent du tri IA de la veille, les étiquettes de l'équipe
  tone?: Tone | ''
  people?: string[]
  orgs?: string[]
  places?: string[]
  importance?: number
  key?: string
  tags?: string[]
  // Portée et engagement du post, quand la source les donne
  engagement?: Engagement
  // Type de média (déduit du canal pour les anciennes fiches) et liens entre publications
  media?: MediaType
  subType?: string
  ref?: string
  mediaUrl?: string
  transcription?: string
  author?: string
  parent?: { id: string; url: string; title: string }
  thread?: { forum: string; topic: string; topicUrl: string; messageId: string; replyTo: string }
  comments?: number
  replies?: number
  reactions?: Reaction[]
}

export type MediaType = 'article' | 'broadcast' | 'podcast' | 'blog' | 'comment' | 'forum' | 'social'
export const MEDIA_TYPES: MediaType[] = ['article', 'broadcast', 'podcast', 'blog', 'comment', 'forum', 'social']

/** Commentaire d'une publication ou message d'un fil de forum ; depth = niveau de réponse */
export type Reaction = { id: string; media: MediaType; author: string; text: string; date: string; url: string; tone?: Tone | ''; engagement?: Engagement; depth: number }

export type Engagement = { views?: number; reactions?: number; shares?: number; comments?: number }
export type EngagementTotals = { posts: number; views: number; reactions: number; shares: number; comments: number }

export type Tone = 'positive' | 'neutral' | 'negative'
export const TONES: Tone[] = ['positive', 'neutral', 'negative']

export type Count = { name: string; count: number }

export type NewsResponse = {
  total: number
  page: number
  pages: number
  items: NewsItem[]
  queryError?: string
  lastUpdate: string | null
  demo: boolean
}

export type Facets = {
  flux: Count[]
  categories: Count[]
  channels: Count[]
  languages: Count[]
  sources?: Count[]
  tags?: Count[]
  media?: Count[]
  subTypes?: Count[]
}

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
  media?: Count[]
  reactions?: { editorial: number; comments: number; replies: number }
  tones?: Count[]
  toneDays?: ({ date: string } & Record<Tone, number>)[]
  people?: Count[]
  orgs?: Count[]
  places?: Count[]
  engagement?: EngagementTotals
  topEngaged?: NewsItem[]
  lastUpdate: string | null
  demo: boolean
}

export type Spike = {
  dim: 'categories' | 'sources' | 'people' | 'orgs' | 'places'
  filter: 'category' | 'source' | 'entity'
  name: string
  count: number
  avg: number
}

export type Report = { day: string | null; available: string[]; items: NewsItem[]; demo: boolean }

export type Filters = {
  q: string
  days: string
  category: string
  channel: string
  media: string
  sub: string
  lang: string
  watch: string
  source: string
  tone: string
  entity: string
  tag: string
  exclude: string
  important: string
  sort: string
}
export const EMPTY_FILTERS: Filters = {
  q: '',
  days: '',
  category: '',
  channel: '',
  media: '',
  sub: '',
  lang: '',
  watch: '',
  source: '',
  tone: '',
  entity: '',
  tag: '',
  exclude: '',
  important: '',
  sort: '',
}

/** Clic sur un graphique ou une entité : ouvre la liste des actualités avec ces filtres */
export const DrillContext = createContext<(filters: Partial<Filters>) => void>(() => {})

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
  sources: { flux: Flux; dir?: string; found: boolean; count: number }[]
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
