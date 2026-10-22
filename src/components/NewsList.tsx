import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { NewsCard } from './NewsCard'
import { type Facets, type Filters, type Flux, type NewsResponse, EMPTY_FILTERS, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { WATCH_TEXT, type WatchOption } from '../lib/watches'

export function NewsList({ flux, initialWatch = '' }: { flux: Flux | ''; initialWatch?: string }) {
  const i = useI18n()
  const { t } = i
  const PERIODS = [
    { value: '', label: t.allPeriods },
    { value: '1', label: t.last24 },
    { value: '7', label: t.last7 },
    { value: '30', label: t.last30 },
  ]
  const [draft, setDraft] = useState('')
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, watch: initialWatch })
  const [page, setPage] = useState(1)
  const facets = useFetch<Facets>('/api/news/facets').data
  const watches = useFetch<{ watches: WatchOption[] }>('/api/news/watches').data?.watches ?? []

  useEffect(() => setPage(1), [flux])

  const url = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), size: '20' })
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
    if (flux) params.set('flux', flux)
    return `/api/news?${params.toString()}`
  }, [filters, flux, page])
  const { data, error, loading } = useFetch<NewsResponse>(url)

  function update(patch: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    update({ q: draft.trim() })
  }

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <>
      <form className="news-filters" onSubmit={onSubmit}>
        <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.searchPlaceholder} aria-label="Search" maxLength={200} />
        <button type="submit" className="news-btn">
          {t.search}
        </button>
        <select
          className={filters.watch ? 'news-filters__watch is-on' : 'news-filters__watch'}
          value={filters.watch}
          onChange={(e) => update({ watch: e.target.value })}
          aria-label={WATCH_TEXT[i.lang].menu}
        >
          <option value="">
            {WATCH_TEXT[i.lang].menu}: {WATCH_TEXT[i.lang].none}
          </option>
          {watches.map((w) => (
            <option key={w.id} value={w.id}>
              {WATCH_TEXT[i.lang].menu}: {w.name}
            </option>
          ))}
        </select>
        <select value={filters.days} onChange={(e) => update({ days: e.target.value })} aria-label="Period">
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select value={filters.category} onChange={(e) => update({ category: e.target.value })} aria-label="Category">
          <option value="">{t.allCategories}</option>
          {facets?.categories.map((c) => (
            <option key={c.name} value={c.name}>
              {i.category(c.name)}
            </option>
          ))}
        </select>
        <select value={filters.channel} onChange={(e) => update({ channel: e.target.value })} aria-label="Channel">
          <option value="">{t.allChannels}</option>
          {facets?.channels.map((c) => (
            <option key={c.name} value={c.name}>
              {i.channel(c.name)}
            </option>
          ))}
        </select>
        <select value={filters.lang} onChange={(e) => update({ lang: e.target.value })} aria-label="Language">
          <option value="">{t.allLanguages}</option>
          {facets?.languages.map((l) => (
            <option key={l.name} value={l.name}>
              {i.language(l.name)}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            className="news-btn news-btn--ghost"
            onClick={() => {
              setDraft('')
              setFilters(EMPTY_FILTERS)
              setPage(1)
            }}
          >
            {t.clear}
          </button>
        )}
      </form>

      {error && (
        <p className="news-status news-status--error" role="alert">
          {t.loadError}
        </p>
      )}
      {!error && data && (
        <p className="news-status" role="status">
          {data.total === 0 ? t.noMatch : t.countNews(i.num(data.total))}
          {data.lastUpdate && (
            <span>
              {' '}
              · {t.updated} : {i.dateTime(data.lastUpdate)}
            </span>
          )}
        </p>
      )}
      {loading && !data && <p className="news-status">{t.loading}</p>}

      <div className={loading && !data ? 'news-list is-loading' : 'news-list'}>
        {data?.items.map((it) => (
          <NewsCard key={it.id} item={it} />
        ))}
      </div>

      {data && data.pages > 1 && (
        <nav className="news-pager" aria-label="pages">
          <button type="button" className="news-btn news-btn--ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t.prev}
          </button>
          <span>{t.pageOf(data.page, data.pages)}</span>
          <button type="button" className="news-btn news-btn--ghost" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            {t.next}
          </button>
        </nav>
      )}
    </>
  )
}
