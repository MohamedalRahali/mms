import { useState } from 'react'
import { NewsCard } from './NewsCard'
import { type Count, type Flux, type NewsItem, type NewsResponse, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'

/** Contenus réutilisés par les widgets du tableau de bord : résumé des actualités et barres « Buzz » */

function CategoryGroup({ name, items }: { name: string; items: NewsItem[] }) {
  const i = useI18n()
  const [open, setOpen] = useState(true)
  return (
    <section className="mms-group">
      <button type="button" className="mms-group__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          {i.category(name)} <em>({i.num(items.length)})</em>
        </span>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden className={open ? 'is-open' : ''}>
          <path d="M7 14l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      {open && (
        <div className="mms-group__list">
          {items.map((it) => (
            <NewsCard key={it.id} item={it} variant="board" />
          ))}
        </div>
      )}
    </section>
  )
}

/** Résumé d'une veille, regroupé par thème comme le NewsBoard */
export function NewsDigest({ flux, days, category, extra = {} }: { flux: Flux | ''; days: number; category?: string; extra?: Record<string, string> }) {
  const i = useI18n()
  const params = new URLSearchParams({ days: String(days), size: '40' })
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v)
  if (flux) params.set('flux', flux)
  if (category) params.set('category', category)
  const { data, error } = useFetch<NewsResponse>(`/api/news?${params.toString()}`)
  // Un même sujet peut revenir plusieurs jours : le résumé n'en garde que la diffusion la plus récente
  const seen = new Set<string>()
  const groups = new Map<string, NewsItem[]>()
  for (const it of data?.items ?? []) {
    const key = it.title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    groups.set(it.category, [...(groups.get(it.category) ?? []), it])
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
  if (error) return <p className="news-status news-status--error">{i.t.loadError}</p>
  if (!data) return <p className="news-status">{i.t.loading}</p>
  if (data.items.length === 0) return <p className="news-status">{i.t.noNews}</p>
  return (
    <>
      {ordered.map(([name, items]) => (
        <CategoryGroup key={name} name={name} items={items} />
      ))}
    </>
  )
}

export function BuzzBars({
  rows,
  label,
  color,
  onPick,
}: {
  rows: Count[]
  label: (name: string) => string
  color?: (name: string, rank: number) => string
  onPick?: (name: string) => void
}) {
  const i = useI18n()
  if (rows.length === 0) return <p className="news-status">{i.t.noData}</p>
  const max = Math.max(...rows.map((r) => r.count), 1)
  return (
    <ul className="mms-buzz">
      {rows.map((r, k) => (
        <li key={r.name} className={onPick ? 'is-link' : undefined} onClick={() => onPick?.(r.name)}>
          <span dir="auto">
            {label(r.name)}: <b>{i.num(r.count)}</b>
          </span>
          <i style={{ width: `${(r.count / max) * 100}%`, background: color?.(r.name, k) }} />
        </li>
      ))}
    </ul>
  )
}
