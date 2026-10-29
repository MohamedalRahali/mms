import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { NewsCard } from './NewsCard'
import { type Facets, type Filters, type Flux, type NewsResponse, EMPTY_FILTERS, MEDIA_TYPES, TONES, useFetch } from '../lib/news'
import { useMedia } from '../lib/media'
import { useIntel } from '../lib/intel'
import { useI18n } from '../lib/i18n'
import { WATCH_TEXT, type WatchOption } from '../lib/watches'
import { usePro } from '../lib/pro'
import { QueryAssistant } from './Pro'
import { MediaSelect } from './MediaParts'
import { PickPage } from './ReportPick'
import { canDo, hasModule, useAuth } from '../lib/auth'
import { SavedSearches } from './SavedSearches'
import { type Overview, type ResultTab, ChartsTab, GroupHeader, ListToolbar, NetworkChips, PeopleTab, ResultTabs, SaveSearchButton, SourcesTab, groupLabel, useListText } from './Listing'
import { countryName, flagOf, useListPrefs } from '../lib/listing'
import { PinboardsDialog } from './Pinboards'
import { AddItemButton } from './ItemEdit'
import { type Health } from '../lib/news'

// bare : la recherche et les filtres sont pilotés par la page appelante (مجمع البحث) ; seuls les résultats sont affichés
export function NewsList({ flux, initialWatch = '', initialFilters, bare = false }: { flux: Flux | ''; initialWatch?: string; initialFilters?: Partial<Filters>; bare?: boolean }) {
  const i = useI18n()
  const x = useIntel()
  const p = usePro()
  const m = useMedia()
  const auth = useAuth()
  const { t } = i
  const PERIODS = [
    { value: '', label: t.allPeriods },
    { value: '1', label: t.last24 },
    { value: '7', label: t.last7 },
    { value: '30', label: t.last30 },
  ]
  const [draft, setDraft] = useState(initialFilters?.q ?? '')
  const [pins, setPins] = useState(false)
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, watch: initialWatch, ...initialFilters })
  const [exclude, setExclude] = useState(initialFilters?.exclude ?? '')
  const [page, setPage] = useState(1)
  const l = useListText()
  // Présentation (regroupement, tri, sens, vue, histoires repliées) : gardée par compte
  const [prefs, setPrefs] = useListPrefs(auth?.user.email ?? '')
  const [tab, setTab] = useState<ResultTab>('news')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const facets = useFetch<Facets>('/api/news/facets').data
  const health = useFetch<Health>('/api/health', 0).data
  const briefs = Boolean(health?.ai) && canDo(auth?.user, 'ai_ask')
  const watches = useFetch<{ watches: WatchOption[] }>('/api/news/watches').data?.watches ?? []
  const pinboards = useFetch<{ boards: { id: string; name: string; count: number }[] }>('/api/pinboards').data?.boards ?? []

  useEffect(() => setPage(1), [flux, prefs.group, prefs.sort, prefs.dir, prefs.fold, prefs.view])
  useEffect(() => setCollapsed(new Set()), [prefs.group])

  // Mêmes filtres pour la liste, les onglets et l'export CSV
  const query = useMemo(() => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value && key !== 'sort') params.set(key, value)
    if (flux) params.set('flux', flux)
    return params.toString()
  }, [filters, flux])
  const columns = prefs.view === 'columns'
  const group = prefs.group || (columns ? 'category' : '')
  const present = new URLSearchParams({ page: String(page), size: group ? '60' : '20' })
  const sort = prefs.sort || filters.sort
  if (sort) present.set('sort', sort)
  if (prefs.dir) present.set('dir', prefs.dir)
  if (group) present.set('group', group)
  if (prefs.fold) present.set('fold', '1')
  const url = `/api/news?${present.toString()}${query ? `&${query}` : ''}`
  const { data, error, loading } = useFetch<NewsResponse>(url)
  const overview = useFetch<Overview>(`/api/news/overview${query ? `?${query}` : ''}`).data
  const stats = new Map((data?.groups ?? []).map((g) => [g.key, g]))
  const toggleGroup = (key: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

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
      {!bare && (
        <>
      <form className="news-filters" onSubmit={onSubmit}>
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={i.lang === 'ar' ? 'بحث' : 'Search'}
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
        <MediaSelect
          className={filters.media ? 'news-filters__media is-on' : 'news-filters__media'}
          value={filters.media}
          onChange={(media) => update({ media, sub: '' })}
          label={m.menu}
          current={filters.media ? undefined : `${m.menu}: ${m.all}`}
          options={[
            { value: '', label: m.all, icon: 'all' },
            ...MEDIA_TYPES.map((type) => ({ value: type, label: m.types[type], icon: type, count: facets?.media?.find((c) => c.name === type)?.count })),
          ]}
        />
        {filters.media === 'broadcast' && (
          <MediaSelect
            value={filters.sub}
            onChange={(sub) => update({ sub })}
            label={m.subAll}
            options={[
              { value: '', label: m.subAll, icon: 'broadcast' },
              ...(['tv', 'radio', 'youtube'] as const).map((sub) => ({ value: sub, label: m.subTypes[sub], icon: sub, count: facets?.subTypes?.find((c) => c.name === sub)?.count })),
            ]}
          />
        )}
        <select value={filters.days} onChange={(e) => update({ days: e.target.value })} aria-label={i.lang === 'ar' ? 'الفترة' : 'Period'}>
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select value={filters.category} onChange={(e) => update({ category: e.target.value })} aria-label={i.lang === 'ar' ? 'الموضوع' : 'Category'}>
          <option value="">{t.allCategories}</option>
          {facets?.categories.map((c) => (
            <option key={c.name} value={c.name}>
              {i.category(c.name)}
            </option>
          ))}
        </select>
        <select value={filters.channel} onChange={(e) => update({ channel: e.target.value })} aria-label={i.lang === 'ar' ? 'القناة' : 'Channel'}>
          <option value="">{t.allChannels}</option>
          {facets?.channels.map((c) => (
            <option key={c.name} value={c.name}>
              {i.channel(c.name)}
            </option>
          ))}
        </select>
        <select value={filters.lang} onChange={(e) => update({ lang: e.target.value })} aria-label={i.lang === 'ar' ? 'اللغة' : 'Language'}>
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
        {!!facets?.countries?.length && (
          <select className={filters.country ? 'is-on' : ''} value={filters.country} onChange={(e) => update({ country: e.target.value })} aria-label={l.country}>
            <option value="">{l.allCountries}</option>
            {filters.country && !facets.countries.some((c) => c.name === filters.country) && <option value={filters.country}>{countryName(filters.country, i.lang)}</option>}
            {facets.countries.map((c) => (
              <option key={c.name} value={c.name}>
                {flagOf(c.name)} {countryName(c.name, i.lang)} ({i.num(c.count)})
              </option>
            ))}
          </select>
        )}
        {pinboards.length > 0 && (
          <select className={filters.pinboard ? 'is-on' : ''} value={filters.pinboard} onChange={(e) => update({ pinboard: e.target.value })} aria-label={l.pinboard}>
            <option value="">{l.allPinboards}</option>
            {pinboards.map((b) => (
              <option key={b.id} value={b.id}>
                📌 {b.name} ({i.num(b.count)})
              </option>
            ))}
          </select>
        )}
        <select className={filters.processed ? 'is-on' : ''} value={filters.processed} onChange={(e) => update({ processed: e.target.value })} aria-label={l.status}>
          <option value="">{l.allStatus}</option>
          <option value="no">{l.unprocessed}</option>
          <option value="yes">{l.onlyProcessed}</option>
        </select>
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
        {canDo(auth?.user, 'export') && (
          <a className="news-btn news-btn--ghost news-filters__export" href={`/api/news/export.csv${query ? `?${query}` : ''}`} download>
            {x.exportCsv}
          </a>
        )}
      </form>
      {canDo(auth?.user, 'ai_ask') && (
        <QueryAssistant
          error={data?.queryError}
          onUse={(q) => {
            setDraft(q)
            update({ q })
          }}
        />
      )}
      <div className="mms-searchrow">
        {canDo(auth?.user, 'manage_watches') && hasModule(auth?.user, 'watch') && <SaveSearchButton filters={filters} email={auth?.user.email ?? ''} />}
        <button type="button" className="news-btn news-btn--ghost mms-savewatch" onClick={() => setPins(true)}>
          📌 {l.pinboards}
        </button>
        <AddItemButton />
        <NetworkChips value={filters.channel} counts={facets?.channels} onPick={(channel) => update({ channel })} />
      </div>
      <SavedSearches
        filters={filters}
        email={auth?.user.email ?? ''}
        alerts={hasModule(auth?.user, 'alerts')}
        onApply={(f) => {
          setDraft(f.q)
          setExclude(f.exclude)
          setFilters(f)
          setPage(1)
        }}
      />

        </>
      )}
      <ResultTabs tab={tab} onTab={setTab} total={data?.found ?? data?.total} overview={overview} />
      {tab === 'sources' && (
        <SourcesTab
          data={overview}
          onSource={(source) => {
            update({ source })
            setTab('news')
          }}
        />
      )}
      {tab === 'people' && (
        <PeopleTab
          data={overview}
          onPerson={(name, kind) => {
            const q = `"${name.replace(/"/g, '')}"`
            if (kind === 'authors') {
              setDraft(q)
              update({ q })
            } else update({ entity: name })
            setTab('news')
          }}
        />
      )}
      {tab === 'charts' && <ChartsTab query={query} days={filters.days} />}
      {tab === 'news' && (
        <>
      <ListToolbar prefs={prefs} onPrefs={setPrefs} />
      {error && (
        <p className="news-status news-status--error" role="alert">
          {t.loadError}
        </p>
      )}
      {!error && data && (
        <div className="rpt-pickrow">
          <p className="news-status" role="status">
            {data.total === 0 ? t.noMatch : t.countNews(i.num(data.total))}
            {data.lastUpdate && (
              <span>
                {' '}
                · {t.updated} : {i.dateTime(data.lastUpdate)}
              </span>
            )}
          </p>
          <PickPage items={data.items} />
        </div>
      )}
      {loading && !data && <p className="news-status">{t.loading}</p>}

      {columns ? (
        <div className={loading && !data ? 'mms-cols is-loading' : 'mms-cols'}>
          {[...new Set((data?.items ?? []).map((it) => it.group ?? ''))].map((key) => {
            const stat = stats.get(key)
            const rows = (data?.items ?? []).filter((it) => (it.group ?? '') === key)
            return (
              <section key={key} className="mms-col">
                {stat ? <GroupHeader group={group} stat={stat} collapsed={false} onToggle={() => {}} /> : <h3>{groupLabel(group, key, i, l.unknownGroup)}</h3>}
                <div className="mms-col__list">
                  {rows.map((it) => (
                    <NewsCard key={it.id} item={it} variant="compact" brief={briefs} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className={loading && !data ? 'news-list is-loading' : 'news-list'}>
          {data?.items.map((it, k) => {
            const head = group && (k === 0 || data.items[k - 1].group !== it.group) ? stats.get(it.group ?? '') : undefined
            const hidden = group && collapsed.has(it.group ?? '')
            return (
              <div key={it.id} className="news-list__row">
                {head && <GroupHeader group={group} stat={head} collapsed={collapsed.has(head.key)} onToggle={() => toggleGroup(head.key)} />}
                {!hidden && <NewsCard item={it} brief={briefs} />}
              </div>
            )
          })}
        </div>
      )}

      {data && data.pages > 1 && (
        <nav className="news-pager" aria-label={i.lang === 'ar' ? 'الصفحات' : 'Pages'}>
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
      )}
      {pins && <PinboardsDialog onClose={() => setPins(false)} />}
    </>
  )
}
