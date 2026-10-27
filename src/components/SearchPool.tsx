import { useContext, useMemo, useState } from 'react'
import { type Count, type Flux, DrillContext, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { hasModule, useAuth } from '../lib/auth'
import { WATCH_TEXT, type WatchOption } from '../lib/watches'
import { countryName, flagOf, fmtReach, isNetwork } from '../lib/listing'
import { NewsList } from './NewsList'
import { NetworkIcon } from './Listing'
import { Diffusion } from './Diffusion'
import './listing.css'
import './pool.css'

/**
 * مجمع البحث (équivalent du « SearchPool ») : recherche libre et rétrospective sur toute la base, catalogue des
 * sources reçues (type, pays, langues, portée, activité), chaînes TV et radio enregistrées, recherches enregistrées.
 * L'activation des sources reste dans la console Super Admin (مصادر التغذية) et le panneau des sources de diffusion.
 */

type Source = {
  name: string
  channel: string
  channels: string[]
  media: string
  langs: string[]
  country: string
  reach: number
  reachSet: boolean
  url: string
  total: number
  week: number
  day: number
  last: string | null
  status: 'active' | 'quiet' | 'idle'
}
type Catalog = { total: number; active: number; byMedia: Count[]; byChannel: Count[]; byCountry: Count[]; sources: Source[] }
type Tab = 'search' | 'sources' | 'broadcast' | 'queries'

const TEXT = {
  ar: {
    title: 'مجمع البحث',
    sub: 'بحث حر في كل ما تجمعه المنصة، مع فهرس المصادر والمحطات وعمليات البحث المحفوظة.',
    tabs: { search: 'البحث الحر', sources: 'المصادر', broadcast: 'محطات التلفزيون والإذاعة', queries: 'عمليات البحث المحفوظة' },
    find: 'ابحث عن مصدر',
    allTypes: 'كل الأنواع',
    allCountries: 'كل البلدان',
    allStatus: 'كل الحالات',
    status: { active: 'نشط', quiet: 'هادئ', idle: 'متوقف' },
    cols: ['المصدر', 'النوع', 'البلد', 'اللغة', 'الانتشار', 'هذا الأسبوع', 'المجموع', 'آخر خبر', 'الحالة'],
    summary: (n: string, a: string) => `${n} مصدر · ${a} نشط هذا الأسبوع`,
    estimated: 'تقديري',
    manage: 'تفعيل المصادر وإيقافها وتحديد بلدها ومدى انتشارها من لوحة المشرف الأعلى (مصادر التغذية).',
    watches: 'عمليات الرصد المبرمج',
    local: 'عمليات البحث المحفوظة في هذا المتصفح',
    none: 'لا شيء بعد.',
    open: 'فتح',
    hint: 'احفظ بحثاً من «البحث الحر» بزر «حفظ البحث» ليصبح رصداً مع تنبيهات.',
  },
  en: {
    title: 'Search pool',
    sub: 'Free search across everything the platform collects, with the source index, stations and saved searches.',
    tabs: { search: 'Free search', sources: 'Sources', broadcast: 'TV and radio stations', queries: 'Saved searches' },
    find: 'Find a source',
    allTypes: 'All types',
    allCountries: 'All countries',
    allStatus: 'All statuses',
    status: { active: 'Active', quiet: 'Quiet', idle: 'Idle' },
    cols: ['Source', 'Type', 'Country', 'Language', 'Reach', 'This week', 'Total', 'Latest', 'Status'],
    summary: (n: string, a: string) => `${n} sources · ${a} active this week`,
    estimated: 'estimated',
    manage: 'Sources are enabled, disabled and given a country and reach in the Super Admin console (Feed sources).',
    watches: 'Scheduled watches',
    local: 'Searches saved in this browser',
    none: 'Nothing yet.',
    open: 'Open',
    hint: 'Save a search from “Free search” with “Save search” to turn it into a watch with alerts.',
  },
}

function SourcesIndex() {
  const i = useI18n()
  const s = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const drill = useContext(DrillContext)
  const { data } = useFetch<Catalog>('/api/sources/catalog')
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [cc, setCc] = useState('')
  const [st, setSt] = useState('')
  const shown = useMemo(
    () =>
      (data?.sources ?? []).filter(
        (x) => (!q || x.name.toLowerCase().includes(q.toLowerCase()) || x.url.includes(q.toLowerCase())) && (!type || x.channel === type) && (!cc || x.country === cc) && (!st || x.status === st),
      ),
    [data, q, type, cc, st],
  )
  if (!data) return <p className="news-status">{i.t.loading}</p>
  return (
    <section>
      <p className="news-status">
        {s.summary(i.num(data.total), i.num(data.active))} · {s.manage}
      </p>
      <div className="news-filters pool-filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={s.find} aria-label={s.find} dir="auto" />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label={s.allTypes}>
          <option value="">{s.allTypes}</option>
          {data.byChannel.map((c) => (
            <option key={c.name} value={c.name}>
              {i.channel(c.name)} ({i.num(c.count)})
            </option>
          ))}
        </select>
        <select value={cc} onChange={(e) => setCc(e.target.value)} aria-label={s.allCountries}>
          <option value="">{s.allCountries}</option>
          {data.byCountry.map((c) => (
            <option key={c.name} value={c.name}>
              {flagOf(c.name)} {countryName(c.name, i.lang)} ({i.num(c.count)})
            </option>
          ))}
        </select>
        <select value={st} onChange={(e) => setSt(e.target.value)} aria-label={s.allStatus}>
          <option value="">{s.allStatus}</option>
          {(['active', 'quiet', 'idle'] as const).map((k) => (
            <option key={k} value={k}>
              {s.status[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="pool-table" role="table">
        <div className="pool-table__head" role="row">
          {s.cols.map((c) => (
            <span key={c} role="columnheader">
              {c}
            </span>
          ))}
        </div>
        {shown.slice(0, 300).map((x) => (
          <button key={x.name} type="button" role="row" className="pool-table__row" onClick={() => drill({ source: x.name })}>
            <span role="cell" data-label={s.cols[0]} className="pool-table__name">
              <b dir="auto">{x.name}</b>
              {x.url && <small dir="ltr">{x.url.replace(/^https?:\/\/(www\.)?/, '')}</small>}
            </span>
            <span role="cell" data-label={s.cols[1]} className="pool-table__type">
              {isNetwork(x.channel) && <NetworkIcon name={x.channel} size={14} />}
              {i.channel(x.channel)}
            </span>
            <span role="cell" data-label={s.cols[2]}>{x.country ? `${flagOf(x.country)} ${countryName(x.country, i.lang)}` : '—'}</span>
            <span role="cell" data-label={s.cols[3]}>{x.langs.map((l) => i.language(l)).join('، ') || '—'}</span>
            <span role="cell" data-label={s.cols[4]} title={x.reachSet ? '' : s.estimated}>
              {fmtReach(x.reach, i.lang)}
              {!x.reachSet && <small> ≈</small>}
            </span>
            <span role="cell" data-label={s.cols[5]}>{i.num(x.week)}</span>
            <span role="cell" data-label={s.cols[6]}>{i.num(x.total)}</span>
            <span role="cell" data-label={s.cols[7]}>{x.last ? i.dateTime(x.last) : '—'}</span>
            <span role="cell" data-label={s.cols[8]}>
              <span className={`pool-status is-${x.status}`}>{s.status[x.status]}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function SavedQueries() {
  const i = useI18n()
  const s = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const drill = useContext(DrillContext)
  const auth = useAuth()
  const watches = useFetch<{ watches: WatchOption[] }>('/api/news/watches').data?.watches ?? []
  const local = useMemo(() => {
    try {
      const list = JSON.parse(localStorage.getItem(`mms-saved-searches:${(auth?.user.email ?? '').toLowerCase()}`) || '[]')
      return Array.isArray(list) ? (list as { id: string; name: string; filters: Record<string, string> }[]) : []
    } catch {
      return []
    }
  }, [auth?.user.email])
  return (
    <div className="pool-queries">
      <section>
        <h3>{s.watches}</h3>
        {!watches.length && <p className="news-status">{s.none}</p>}
        <ul>
          {watches.map((w) => (
            <li key={w.id}>
              <b dir="auto">{w.name}</b>
              <span className={`mms-watch__status mms-watch__status--${w.status}`}>{WATCH_TEXT[i.lang].status[w.status]}</span>
              <button type="button" className="news-btn news-btn--ghost" onClick={() => drill({ watch: w.id })}>
                {s.open}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>{s.local}</h3>
        {!local.length && <p className="news-status">{s.none}</p>}
        <ul>
          {local.map((x) => (
            <li key={x.id}>
              <b dir="auto">★ {x.name}</b>
              {x.filters.q && <code dir="auto">{x.filters.q}</code>}
              <button type="button" className="news-btn news-btn--ghost" onClick={() => drill(x.filters)}>
                {s.open}
              </button>
            </li>
          ))}
        </ul>
        <p className="news-status">{s.hint}</p>
      </section>
    </div>
  )
}

export function SearchPool({ flux }: { flux: Flux | '' }) {
  const i = useI18n()
  const s = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const auth = useAuth()
  const [tab, setTab] = useState<Tab>('search')
  const tabs = (Object.keys(s.tabs) as Tab[]).filter((t) => t !== 'broadcast' || hasModule(auth?.user, 'media'))
  return (
    <div className="pool">
      <header className="pool__head">
        <h2>{s.title}</h2>
        <p>{s.sub}</p>
      </header>
      <div className="mms-rtabs" role="tablist">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)}>
            {s.tabs[t]}
          </button>
        ))}
      </div>
      {tab === 'search' && <NewsList flux={flux} />}
      {tab === 'sources' && <SourcesIndex />}
      {tab === 'broadcast' && <Diffusion />}
      {tab === 'queries' && <SavedQueries />}
    </div>
  )
}
