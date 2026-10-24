import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { NewsCard } from './NewsCard'
import { type Facets, type Filters, type Flux, type NewsResponse, EMPTY_FILTERS, MEDIA_TYPES, TONES, useFetch } from '../lib/news'
import { useMedia } from '../lib/media'
import { useIntel } from '../lib/intel'
import { useI18n } from '../lib/i18n'
import { WATCH_TEXT, type WatchOption } from '../lib/watches'
import { usePro } from '../lib/pro'
import { QueryAssistant } from './Pro'

export function NewsList({ flux, initialWatch = '', initialFilters }: { flux: Flux | ''; initialWatch?: string; initialFilters?: Partial<Filters> }) {
  const i = useI18n()
  const x = useIntel()
  const p = usePro()
  const m = useMedia()
  const { t } = i
  const PERIODS = [
    { value: '', label: t.allPeriods },
    { value: '1', label: t.last24 },
    { value: '7', label: t.last7 },
    { value: '30', label: t.last30 },
  ]
  const [draft, setDraft] = useState(initialFilters?.q ?? '')
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, watch: initialWatch, ...initialFilters })
  const [exclude, setExclude] = useState(initialFilters?.exclude ?? '')
  const [page, setPage] = useState(1)
  const facets = useFetch<Facets>('/api/news/facets').data
  const watches = useFetch<{ watches: WatchOption[] }>('/api/news/watches').data?.watches ?? []

  useEffect(() => setPage(1), [flux])

  // Mêmes filtres pour la liste et pour l'export CSV
  const query = useMemo(() => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
    if (flux) params.set('flux', flux)
    return params.toString()
  }, [filters, flux])
  const url = `/api/news?page=${page}&size=20${query ? `&${query}` : ''}`
  const { data, error, loading } = useFetch<NewsResponse>(url)

  function update(patch: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    update({ q: draft.trim(), exclude: exclude.trim() })
  }

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <>
      <form className="news-filters" onSubmit={onSubmit}>
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label="Search"
          maxLength={500}
          dir="auto"
        />
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
        <select
          className={filters.media ? 'news-filters__media is-on' : 'news-filters__media'}
          value={filters.media}
          onChange={(e) => update({ media: e.target.value, sub: '' })}
          aria-label={m.menu}
        >
          <option value="">
            {m.menu}: {m.all}
          </option>
          {MEDIA_TYPES.map((type) => {
            const n = facets?.media?.find((c) => c.name === type)?.count
            return (
              <option key={type} value={type}>
                {m.types[type]}
                {n ? ` (${i.num(n)})` : ''}
              </option>
            )
          })}
        </select>
        {filters.media === 'broadcast' && (
          <select value={filters.sub} onChange={(e) => update({ sub: e.target.value })} aria-label={m.subAll}>
            <option value="">{m.subAll}</option>
            {['tv', 'radio', 'youtube'].map((sub) => {
              const n = facets?.subTypes?.find((c) => c.name === sub)?.count
              return (
                <option key={sub} value={sub}>
                  {m.subTypes[sub]}
                  {n ? ` (${i.num(n)})` : ''}
                </option>
              )
            })}
          </select>
        )}
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
        <select value={filters.tone} onChange={(e) => update({ tone: e.target.value })} aria-label={x.tone}>
          <option value="">{x.allTones}</option>
          {TONES.map((tone) => (
            <option key={tone} value={tone}>
              {x.tones[tone]}
            </option>
          ))}
        </select>
        <select value={filters.source} onChange={(e) => update({ source: e.target.value })} aria-label={x.source}>
          <option value="">{x.allSources}</option>
          {filters.source && !facets?.sources?.some((c) => c.name === filters.source) && <option value={filters.source}>{filters.source}</option>}
          {facets?.sources?.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        {!!facets?.tags?.length && (
          <select value={filters.tag} onChange={(e) => update({ tag: e.target.value })} aria-label={x.tag}>
            <option value="">{x.allTags}</option>
            {facets.tags.map((c) => (
              <option key={c.name} value={c.name}>
                #{c.name}
              </option>
            ))}
          </select>
        )}
        <input
          type="text"
          className="news-filters__exclude"
          value={exclude}
          onChange={(e) => setExclude(e.target.value)}
          onBlur={() => exclude.trim() !== filters.exclude && update({ exclude: exclude.trim() })}
          placeholder={x.exclude}
          aria-label={x.exclude}
          maxLength={200}
        />
        <select value={filters.sort} onChange={(e) => update({ sort: e.target.value })} aria-label={p.sortLabel}>
          {Object.entries(p.sorts).map(([value, label]) => (
            <option key={value} value={value}>
              {p.sortLabel}: {label}
            </option>
          ))}
        </select>
        <label className="news-filters__check">
          <input type="checkbox" checked={filters.important === '1'} onChange={(e) => update({ important: e.target.checked ? '1' : '' })} />
          {x.important}
        </label>
        {filters.entity && (
          <span className="mms-filterchip">
            {x.entityFilter}: <b dir="auto">{filters.entity}</b>
            <button type="button" aria-label={x.removeFilter} title={x.removeFilter} onClick={() => update({ entity: '' })}>
              ×
            </button>
          </span>
        )}
        {hasFilters && (
          <button
            type="button"
            className="news-btn news-btn--ghost"
            onClick={() => {
              setDraft('')
              setExclude('')
              setFilters(EMPTY_FILTERS)
              setPage(1)
            }}
          >
            {t.clear}
          </button>
        )}
        <a className="news-btn news-btn--ghost news-filters__export" href={`/api/news/export.csv${query ? `?${query}` : ''}`} download>
          {x.exportCsv}
        </a>
      </form>
      <QueryAssistant
        error={data?.queryError}
        onUse={(q) => {
          setDraft(q)
          update({ q })
        }}
      />

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
