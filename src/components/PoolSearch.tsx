import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { type Facets, type Filters, type Flux, EMPTY_FILTERS, MEDIA_TYPES, TONES, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { useIntel } from '../lib/intel'
import { useMedia } from '../lib/media'
import { canDo, hasModule, useAuth } from '../lib/auth'
import { WATCH_TEXT, type WatchOption } from '../lib/watches'
import { countryName, flagOf } from '../lib/listing'
import { NewsList } from './NewsList'
import { SaveSearchButton } from './Listing'
import { PinboardsDialog } from './Pinboards'
import './listing.css'
import './pool.css'

/**
 * Recherche de « مجمع البحث » : barre en haut (vue enregistrée, mot-clé, filtres, période, لوحات التثبيت, recherches
 * enregistrées), écran vide « ماذا تريد أن تبحث؟ » tant qu'aucun mot n'est saisi, puis les résultats (onglets,
 * regroupement, tri…). Recherche et filtres dans l'adresse : un lien ouvre la même recherche.
 */

const KEYS = Object.keys(EMPTY_FILTERS) as (keyof Filters)[]
const fromUrl = (): Filters => {
  const s = new URLSearchParams(location.search)
  const f = { ...EMPTY_FILTERS, days: '1' }
  for (const k of KEYS) {
    const v = s.get(k)
    if (v !== null) f[k] = v.slice(0, 500)
  }
  return f
}
function toUrl(f: Filters) {
  const s = new URLSearchParams({ view: 'pool' })
  for (const k of KEYS) if (f[k]) s.set(k, f[k])
  history.replaceState(null, '', `${location.pathname}?${s.toString()}`)
}

const TEXT = {
  ar: {
    title: 'مجمع البحث',
    views: 'عمليات بحث محفوظة',
    keyword: 'ابحث في الأخبار…',
    filter: 'تصفية',
    period: { 1: 'اليوم', 7: '7 أيام', 30: '30 يوماً', 90: '90 يوماً', 0: 'كل الفترة' } as Record<string, string>,
    pins: 'لوحات التثبيت',
    saved: 'عمليات البحث المحفوظة',
    ask: 'ماذا تريد أن تبحث؟',
    askSub: 'أدخل كلمة مفتاحية',
    hint: 'تدعم AND و OR و NOT و"عبارة دقيقة"، والصيغ العربية والإنجليزية والفرنسية.',
    apply: 'تطبيق',
    reset: 'إعادة ضبط',
    close: 'إغلاق',
    fields: {
      media: 'نوع الوسيلة',
      channel: 'القناة / الشبكة',
      source: 'المصدر',
      country: 'البلد',
      lang: 'اللغة',
      category: 'الموضوع',
      tone: 'النبرة',
      entity: 'شخصية أو جهة',
      region: 'المنطقة في ليبيا',
      processed: 'حالة المعالجة',
      important: 'المهمة فقط',
      exclude: 'استبعاد كلمات',
      watch: 'الرصد',
    },
    all: 'الكل',
    regions: { west: 'الغرب', east: 'الشرق', south: 'الجنوب' } as Record<string, string>,
    processed: { no: 'غير المعالجة', yes: 'المعالجة' } as Record<string, string>,
    newSearch: 'بحث جديد',
    active: (n: number) => `${n} فلتر`,
  },
  en: {
    title: 'Search pool',
    views: 'Saved searches',
    keyword: 'Search the news…',
    filter: 'Filter',
    period: { 1: 'Today', 7: '7 days', 30: '30 days', 90: '90 days', 0: 'All time' } as Record<string, string>,
    pins: 'Pin boards',
    saved: 'Saved searches',
    ask: 'What do you want to search for?',
    askSub: 'Enter a keyword',
    hint: 'Supports AND, OR, NOT and "exact phrases", with Arabic, English and French variants.',
    apply: 'Apply',
    reset: 'Reset',
    close: 'Close',
    fields: {
      media: 'Media type',
      channel: 'Channel / network',
      source: 'Source',
      country: 'Country',
      lang: 'Language',
      category: 'Topic',
      tone: 'Tone',
      entity: 'Person or organisation',
      region: 'Region of Libya',
      processed: 'Processing status',
      important: 'Important only',
      exclude: 'Exclude words',
      watch: 'Watch',
    },
    all: 'All',
    regions: { west: 'West', east: 'East', south: 'South' } as Record<string, string>,
    processed: { no: 'Not processed', yes: 'Processed' } as Record<string, string>,
    newSearch: 'New search',
    active: (n: number) => `${n} filters`,
  },
}

type Saved = { id: string; name: string; filters: Filters }
const savedOf = (email: string): Saved[] => {
  try {
    const list = JSON.parse(localStorage.getItem(`mms-saved-searches:${email.toLowerCase()}`) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** Panneau de tous les filtres */
function FilterPanel({ value, onApply, onClose }: { value: Filters; onApply: (f: Filters) => void; onClose: () => void }) {
  const i = useI18n()
  const x = useIntel()
  const m = useMedia()
  const t = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const facets = useFetch<Facets>('/api/news/facets').data
  const watches = useFetch<{ watches: WatchOption[] }>('/api/news/watches').data?.watches ?? []
  const [f, setF] = useState<Filters>(value)
  const set = (patch: Partial<Filters>) => setF((v) => ({ ...v, ...patch }))
  const sel = (key: keyof Filters, options: [string, string][]) => (
    <label className="pool-field">
      <span>{t.fields[key as keyof typeof t.fields]}</span>
      <select value={f[key]} onChange={(e) => set({ [key]: e.target.value })}>
        <option value="">{t.all}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <div className="mms-modal" role="dialog" aria-modal="true" aria-label={t.filter} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="mms-modal__box pool-panel"
        onSubmit={(e) => {
          e.preventDefault()
          onApply(f)
        }}
      >
        <h3>{t.filter}</h3>
        <div className="pool-panel__grid">
          {sel('media', MEDIA_TYPES.map((v) => [v, m.types[v]]))}
          {sel('channel', (facets?.channels ?? []).map((c) => [c.name, `${i.channel(c.name)} (${i.num(c.count)})`]))}
          {sel('source', (facets?.sources ?? []).map((c) => [c.name, c.name]))}
          {sel('country', (facets?.countries ?? []).map((c) => [c.name, `${flagOf(c.name)} ${countryName(c.name, i.lang)}`]))}
          {sel('lang', (facets?.languages ?? []).map((c) => [c.name, i.language(c.name)]))}
          {sel('category', (facets?.categories ?? []).map((c) => [c.name, i.category(c.name)]))}
          {sel('tone', TONES.map((v) => [v, x.tones[v]]))}
          {sel('region', Object.entries(t.regions))}
          {sel('processed', Object.entries(t.processed))}
          {sel('watch', watches.map((w) => [w.id, w.name]))}
          <label className="pool-field">
            <span>{t.fields.entity}</span>
            <input value={f.entity} onChange={(e) => set({ entity: e.target.value })} dir="auto" maxLength={120} />
          </label>
          <label className="pool-field">
            <span>{t.fields.exclude}</span>
            <input value={f.exclude} onChange={(e) => set({ exclude: e.target.value })} dir="auto" maxLength={200} />
          </label>
          <label className="pool-field pool-field--check">
            <input type="checkbox" checked={f.important === '1'} onChange={(e) => set({ important: e.target.checked ? '1' : '' })} />
            {t.fields.important}
          </label>
        </div>
        <div className="mms-modal__actions">
          <button type="submit" className="news-btn">
            {t.apply}
          </button>
          <button type="button" className="news-btn news-btn--ghost" onClick={() => setF({ ...EMPTY_FILTERS, q: f.q, days: f.days })}>
            {t.reset}
          </button>
          <button type="button" className="news-btn news-btn--ghost" onClick={onClose}>
            {t.close}
          </button>
        </div>
      </form>
    </div>
  )
}

export function PoolSearch({ flux }: { flux: Flux | '' }) {
  const i = useI18n()
  const t = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const auth = useAuth()
  const [filters, setFilters] = useState<Filters>(fromUrl)
  const [draft, setDraft] = useState(filters.q)
  const [panel, setPanel] = useState(false)
  const [pins, setPins] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
  const watches = useFetch<{ watches: WatchOption[] }>('/api/news/watches').data?.watches ?? []
  const saved = useMemo(() => savedOf(auth?.user.email ?? ''), [auth?.user.email, savedOpen])
  useEffect(() => toUrl(filters), [filters])
  // En quittant la page, l'adresse redevient celle de l'application
  useEffect(() => () => history.replaceState(null, '', location.pathname), [])
  const apply = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const active = KEYS.filter((k) => k !== 'q' && k !== 'days' && k !== 'sort' && filters[k]).length
  const searched = Boolean(filters.q || active)
  function submit(e: FormEvent) {
    e.preventDefault()
    apply({ q: draft.trim() })
  }
  const periodKeys = ['1', '7', '30', '90', '']
  return (
    <div className="pool-search">
      <div className="pool-bar">
        <select
          className="pool-bar__views"
          value=""
          onChange={(e) => {
            const v = e.target.value
            if (v.startsWith('w:')) setFilters({ ...EMPTY_FILTERS, watch: v.slice(2), days: '' })
            else {
              const s = saved.find((x) => x.id === v.slice(2))
              if (s) {
                setFilters({ ...EMPTY_FILTERS, ...s.filters })
                setDraft(s.filters.q || '')
              }
            }
          }}
          aria-label={t.views}
        >
          <option value="">{t.title}</option>
          {saved.map((s) => (
            <option key={s.id} value={`s:${s.id}`}>
              ★ {s.name}
            </option>
          ))}
          {watches.map((w) => (
            <option key={w.id} value={`w:${w.id}`}>
              {WATCH_TEXT[i.lang].menu}: {w.name}
            </option>
          ))}
        </select>
        <form className="pool-bar__search" onSubmit={submit}>
          <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.keyword} aria-label={t.keyword} maxLength={500} dir="auto" />
          <button type="submit" aria-label={t.keyword}>
            ⌕
          </button>
        </form>
        <button type="button" className={active ? 'pool-bar__filter is-on' : 'pool-bar__filter'} onClick={() => setPanel(true)}>
          ☰ {t.filter}
          {active > 0 && <b>{active}</b>}
        </button>
        <select className="pool-bar__period" value={filters.days} onChange={(e) => apply({ days: e.target.value })} aria-label={i.lang === 'ar' ? 'الفترة' : 'Period'}>
          {periodKeys.map((k) => (
            <option key={k || 'all'} value={k}>
              ◷ {t.period[k || '0']}
            </option>
          ))}
        </select>
        <span className="pool-bar__end">
          <button type="button" onClick={() => setPins(true)}>
            📌 {t.pins}
          </button>
          <button type="button" onClick={() => setSavedOpen(!savedOpen)} aria-expanded={savedOpen}>
            ★ {t.saved}
          </button>
        </span>
      </div>
      {savedOpen && (
        <div className="pool-saved">
          {!saved.length && !watches.length && <p className="news-status">{t.askSub}</p>}
          {saved.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setFilters({ ...EMPTY_FILTERS, ...s.filters })
                setDraft(s.filters.q || '')
                setSavedOpen(false)
              }}
            >
              ★ <span dir="auto">{s.name}</span>
            </button>
          ))}
          {watches.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                setFilters({ ...EMPTY_FILTERS, watch: w.id, days: '' })
                setSavedOpen(false)
              }}
            >
              👁 <span dir="auto">{w.name}</span>
            </button>
          ))}
        </div>
      )}

      {!searched ? (
        <div className="pool-empty">
          <span className="pool-empty__mark" aria-hidden>
            ?
          </span>
          <div>
            <h2>{t.ask}</h2>
            <p>{t.askSub}</p>
          </div>
          <form className="pool-empty__search" onSubmit={submit}>
            <input autoFocus type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.keyword} aria-label={t.keyword} maxLength={500} dir="auto" />
            <button type="submit" aria-label={t.keyword}>
              ⌕
            </button>
          </form>
          <small>{t.hint}</small>
        </div>
      ) : (
        <>
          <div className="pool-actions">
            {canDo(auth?.user, 'manage_watches') && hasModule(auth?.user, 'watch') && <SaveSearchButton filters={filters} email={auth?.user.email ?? ''} />}
            <button
              type="button"
              className="news-btn news-btn--ghost"
              onClick={() => {
                setFilters({ ...EMPTY_FILTERS, days: filters.days })
                setDraft('')
              }}
            >
              {t.newSearch}
            </button>
          </div>
          <NewsList key={JSON.stringify(filters)} flux={flux} initialFilters={filters} bare />
        </>
      )}
      {panel && (
        <FilterPanel
          value={filters}
          onApply={(f) => {
            setFilters(f)
            setPanel(false)
          }}
          onClose={() => setPanel(false)}
        />
      )}
      {pins && <PinboardsDialog onClose={() => setPins(false)} />}
    </div>
  )
}
