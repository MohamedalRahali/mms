import { type FormEvent, type ReactNode, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { DataSince } from './DataSince'
import { type Count, type Filters, type GroupStat, type NewsItem, type SimilarItem, type Stats, type Tone, DrillContext, TONES, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { useIntel } from '../lib/intel'
import { canDo, useAuth } from '../lib/auth'
import { WATCH_TEXT } from '../lib/watches'
import { type GroupBy, type ListPrefs, type Network, LIST_TEXT, NETWORKS, NETWORK_COLOR, NETWORK_ICON, countryName, effectiveDir, flagOf, fmtReach, isNetwork } from '../lib/listing'
import { BuzzBars } from './Dashboard'
import { Donut, Line, ToneTrend, colorFor } from './Charts'
import './listing.css'
import { MailingListPicker } from './MailingLists'

/** Liste des actualités enrichie : barre de présentation, onglets, en-têtes de groupe, colonnes, statut, résumé IA */

export const useListText = () => LIST_TEXT[useI18n().lang === 'ar' ? 'ar' : 'en']

/* ---------------------------------------------------------------- barre de présentation */

export function ListToolbar({ prefs, onPrefs }: { prefs: ListPrefs; onPrefs: (p: Partial<ListPrefs>) => void }) {
  const l = useListText()
  const dir = effectiveDir(prefs)
  return (
    <div className="mms-listbar" role="toolbar" aria-label={`${l.groupBy} · ${l.sortBy}`}>
      <label className="mms-listbar__field">
        <span>{l.groupBy}</span>
        <select value={prefs.group} onChange={(e) => onPrefs({ group: e.target.value as GroupBy })}>
          {Object.entries(l.groups).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="mms-listbar__field">
        <span>{l.sortBy}</span>
        <select value={prefs.sort} onChange={(e) => onPrefs({ sort: e.target.value as ListPrefs['sort'], dir: '' })}>
          {Object.entries(l.sorts).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="mms-listbar__dir" onClick={() => onPrefs({ dir: dir === 'asc' ? 'desc' : 'asc' })} title={l.toggleDir} aria-label={`${l.toggleDir} : ${dir === 'asc' ? l.asc : l.desc}`}>
        {dir === 'asc' ? '↑' : '↓'}
        <span>{dir === 'asc' ? l.asc : l.desc}</span>
      </button>
      <label className="mms-listbar__check">
        <input type="checkbox" checked={prefs.fold} onChange={(e) => onPrefs({ fold: e.target.checked })} />
        {l.fold}
      </label>
      <div className="mms-listbar__views" role="group" aria-label={`${l.viewList} / ${l.viewColumns}`}>
        <button type="button" className={prefs.view === 'list' ? 'is-on' : ''} aria-pressed={prefs.view === 'list'} onClick={() => onPrefs({ view: 'list' })} title={l.viewList} aria-label={l.viewList}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M4 5h16v3H4zm0 5.5h16v3H4zM4 16h16v3H4z" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          className={prefs.view === 'columns' ? 'is-on' : ''}
          aria-pressed={prefs.view === 'columns'}
          onClick={() => onPrefs({ view: 'columns', group: prefs.group || 'category' })}
          title={l.viewColumns}
          aria-label={l.viewColumns}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M3 4h5v16H3zm6.5 0h5v16h-5zM16 4h5v16h-5z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- onglets */

export type ResultTab = 'news' | 'sources' | 'people' | 'charts'
export type Overview = {
  total: number
  sourcesCount: number
  sources: { name: string; count: number; reach: number; country: string; tone: Record<Tone, number>; sentiment: number; channel: string; last: string }[]
  peopleKind: 'authors' | 'entities'
  peopleCount: number
  people: Count[]
  countries: Count[]
}

export function ResultTabs({ tab, onTab, total, overview }: { tab: ResultTab; onTab: (t: ResultTab) => void; total?: number; overview?: Overview | null }) {
  const l = useListText()
  const i = useI18n()
  const counts: Record<ResultTab, number | undefined> = { news: total, sources: overview?.sourcesCount, people: overview?.peopleCount, charts: undefined }
  return (
    <div className="mms-rtabs" role="tablist">
      {(Object.keys(l.tabs) as ResultTab[]).map((k) => (
        <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => onTab(k)}>
          {l.tabs[k]}
          {counts[k] != null && <b>{i.num(counts[k] ?? 0)}</b>}
        </button>
      ))}
    </div>
  )
}

/** Barre de tonalité (positif / neutre / négatif) et indice net, comme le baromètre du radar */
export function ToneMeter({ tone, sentiment }: { tone: Record<Tone, number>; sentiment: number }) {
  const x = useIntel()
  const sum = TONES.reduce((n, t) => n + tone[t], 0) || 1
  return (
    <span className="mms-tonemeter" title={TONES.map((t) => `${x.tones[t]} ${Math.round((tone[t] / sum) * 100)}%`).join(' · ')}>
      <span className="mms-tonemeter__bar" aria-hidden>
        {TONES.map((t) => (
          <i key={t} className={`is-${t}`} style={{ width: `${(tone[t] / sum) * 100}%` }} />
        ))}
      </span>
      <b className={sentiment > 10 ? 'is-positive' : sentiment < -10 ? 'is-negative' : ''} dir="ltr">
        {sentiment > 0 ? '+' : ''}
        {sentiment}
      </b>
    </span>
  )
}

export function groupLabel(group: GroupBy, key: string, i: ReturnType<typeof useI18n>, unknown: string) {
  if (!key) return unknown
  if (group === 'category') return i.category(key)
  if (group === 'channel') return i.channel(key)
  if (group === 'country') return `${flagOf(key)} ${countryName(key, i.lang)}`
  if (group === 'day') return i.dayLong(key)
  return key
}

export function GroupHeader({ group, stat, collapsed, onToggle }: { group: GroupBy; stat: GroupStat; collapsed: boolean; onToggle: () => void }) {
  const l = useListText()
  const i = useI18n()
  return (
    <button type="button" className={collapsed ? 'mms-ghead is-collapsed' : 'mms-ghead'} aria-expanded={!collapsed} onClick={onToggle} title={collapsed ? l.expand : l.collapse}>
      <span className="mms-ghead__chev" aria-hidden>
        ▾
      </span>
      <strong dir="auto">{groupLabel(group, stat.key, i, l.unknownGroup)}</strong>
      <span className="mms-ghead__stats">
        <span title={l.buzz}>
          <small>{l.buzz}</small> {i.num(stat.count)}
        </span>
        <span title={l.reachHint}>
          <small>{l.reach}</small> {fmtReach(stat.reach, i.lang)}
        </span>
        <ToneMeter tone={stat.tone} sentiment={stat.sentiment} />
      </span>
    </button>
  )
}

/* ---------------------------------------------------------------- onglet المصادر */

export function SourcesTab({ data, onSource }: { data: Overview | null | undefined; onSource: (name: string) => void }) {
  const l = useListText()
  const i = useI18n()
  if (!data) return <p className="news-status">{i.t.loading}</p>
  if (!data.sources.length) return <p className="news-status">{i.t.noMatch}</p>
  const max = Math.max(...data.sources.map((s) => s.count), 1)
  return (
    <div className="mms-rtable" role="table">
      <div className="mms-rtable__head" role="row">
        {l.sourceCols.map((c) => (
          <span key={c} role="columnheader">
            {c}
          </span>
        ))}
      </div>
      {data.sources.map((s, k) => (
        <button key={s.name} type="button" className="mms-rtable__row" role="row" onClick={() => onSource(s.name)}>
          <span role="cell" className="mms-rtable__name">
            <em>{k + 1}</em>
            <span dir="auto">{s.name}</span>
          </span>
          <span role="cell">{s.country ? `${flagOf(s.country)} ${countryName(s.country, i.lang)}` : '—'}</span>
          <span role="cell" className="mms-rtable__bar">
            <i style={{ width: `${(s.count / max) * 100}%` }} />
            <b>{i.num(s.count)}</b>
          </span>
          <span role="cell">{fmtReach(s.reach, i.lang)}</span>
          <span role="cell">
            <ToneMeter tone={s.tone} sentiment={s.sentiment} />
          </span>
          <span role="cell">{s.last ? i.dateTime(s.last) : '—'}</span>
        </button>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- onglet الشخصيات */

export function PeopleTab({ data, onPerson }: { data: Overview | null | undefined; onPerson: (name: string, kind: Overview['peopleKind']) => void }) {
  const l = useListText()
  const i = useI18n()
  if (!data) return <p className="news-status">{i.t.loading}</p>
  if (!data.people.length) return <p className="news-status">{i.t.noMatch}</p>
  const max = Math.max(...data.people.map((p) => p.count), 1)
  return (
    <section>
      <h3 className="mms-rsub">{data.peopleKind === 'authors' ? l.authors : l.entities}</h3>
      <div className="mms-people">
        {data.people.map((p) => (
          <button key={p.name} type="button" className="mms-people__row" onClick={() => onPerson(p.name, data.peopleKind)}>
            <span className="mms-people__avatar" aria-hidden>
              {p.name.replace(/^@/, '').slice(0, 1)}
            </span>
            <span className="mms-people__name" dir="auto">
              {p.name}
            </span>
            <span className="mms-people__bar">
              <i style={{ width: `${(p.count / max) * 100}%` }} />
            </span>
            <b>{i.num(p.count)}</b>
          </button>
        ))}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- onglet الرسوم البيانية */

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mms-rchart">
      <h3>{title}</h3>
      <div className="mms-rchart__body">{children}</div>
    </section>
  )
}

/** Icône d'un réseau social (pictogramme MMS) */
export function NetworkIcon({ name, size = 16 }: { name: Network; size?: number }) {
  return (
    <svg className="mms-net" viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ color: NETWORK_COLOR[name] }}>
      <path d={NETWORK_ICON[name]} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ChartsTab({ query, days }: { query: string; days: string }) {
  const l = useListText()
  const i = useI18n()
  const drill = useContext(DrillContext)
  const d = days || '30'
  const { data, error } = useFetch<Stats>(`/api/news/stats?${query ? `${query}&` : ''}days=${d}`)
  if (error) return <p className="news-status news-status--error">{i.t.loadError}</p>
  if (!data) return <p className="news-status">{i.t.loading}</p>
  const networks = (data.channels || []).filter((c) => isNetwork(c.name))
  const countries = (data.countries || []).map((c) => ({ name: c.name, count: c.count }))
  const label = (cc: string) => `${flagOf(cc)} ${countryName(cc, i.lang)}`
  return (
    <>
      <p className="news-status">{l.chartsNote(days ? `${i.num(Number(days))} ${i.lang === 'ar' ? 'يوم' : 'days'}` : l.last30)}</p>
      <DataSince />
      <div className="mms-rcharts">
        <ChartCard title={l.perDay}>
          <Line perDay={data.perDay} />
        </ChartCard>
        <ChartCard title={l.toneTrend}>
          <ToneTrend days={data.toneDays ?? []} onPick={(tone) => drill({ tone })} />
        </ChartCard>
        <ChartCard title={l.bySource}>
          <BuzzBars rows={data.sources} label={(n) => n} color={(name, k) => colorFor('sources', name, k)} onPick={(source) => drill({ source })} />
        </ChartCard>
        <ChartCard title={l.byCategory}>
          <Donut rows={data.categories} dim="categories" onPick={(category) => drill({ category })} />
        </ChartCard>
        {data.reach && data.reach.total > 0 && (
          <ChartCard title={`${i.lang === 'ar' ? 'جمهور المصادر المحتمل' : 'Potential audience of the sources'}: ${fmtReach(data.reach.total, i.lang)}${data.reach.estimated ? (i.lang === 'ar' ? ' (تقديري)' : ' (estimated)') : ''}`}>
            <Line perDay={data.reach.perDay} label={i.lang === 'ar' ? 'جمهور المصادر النشطة في اليوم (كل مصدر مرة واحدة)' : 'Audience of active sources per day (each source once)'} />
            <BuzzBars rows={data.reach.sources} label={(n) => n} color={(name, k) => colorFor('sources', name, k)} onPick={(source) => drill({ source })} />
          </ChartCard>
        )}
        {countries.length > 0 && (
          <ChartCard title={l.byCountry}>
            <BuzzBars rows={countries} label={label} color={(_n, k) => colorFor('places', _n, k)} onPick={(country) => drill({ country } as Partial<Filters>)} />
          </ChartCard>
        )}
        <ChartCard title={l.byNetwork}>
          {networks.length ? (
            <BuzzBars rows={networks} label={(n) => i.channel(n)} color={(n) => NETWORK_COLOR[n as Network] ?? '#888'} onPick={(channel) => drill({ channel })} />
          ) : (
            <p className="news-status">{i.lang === 'ar' ? 'لا توجد منشورات من الشبكات الاجتماعية في هذه النتائج بعد.' : 'No social network posts in these results yet.'}</p>
          )}
        </ChartCard>
      </div>
    </>
  )
}

/** Filtres rapides par réseau social (canal), avec le nombre de publications */
export function NetworkChips({ value, counts, onPick }: { value: string; counts: Count[] | undefined; onPick: (channel: string) => void }) {
  const l = useListText()
  const i = useI18n()
  const shown = NETWORKS.filter((n) => counts?.some((c) => c.name === n) || value === n)
  return (
    <div className="mms-netchips" role="group" aria-label={l.networks}>
      <span className="mms-netchips__title">{l.networks}</span>
      {NETWORKS.map((n) => {
        const count = counts?.find((c) => c.name === n)?.count ?? 0
        return (
          <button
            key={n}
            type="button"
            className={value === n ? 'is-on' : count ? '' : 'is-empty'}
            aria-pressed={value === n}
            onClick={() => onPick(value === n ? '' : n)}
            title={count ? `${i.channel(n)} · ${i.num(count)}` : i.lang === 'ar' ? `${i.channel(n)} · جاهز لاستقبال البيانات` : `${i.channel(n)} · ready for data`}
          >
            <NetworkIcon name={n} />
            <span>{i.channel(n)}</span>
            {count > 0 && <b>{i.num(count)}</b>}
          </button>
        )
      })}
      {!shown.length && null}
    </div>
  )
}

/* ---------------------------------------------------------------- carte : pays, statut, similaires, résumé IA */

export function CountryFlag({ cc }: { cc?: string }) {
  const i = useI18n()
  if (!cc) return null
  return (
    <span className="mms-cflag" title={countryName(cc, i.lang)} aria-label={countryName(cc, i.lang)}>
      {flagOf(cc)}
    </span>
  )
}

export function ProcessedToggle({ item }: { item: NewsItem }) {
  const l = useListText()
  const i = useI18n()
  const auth = useAuth()
  const [mark, setMark] = useState(item.processed ?? null)
  const [busy, setBusy] = useState(false)
  const allowed = canDo(auth?.user, 'mark_processed')
  if (!item.key) return null
  const title = mark ? l.processedBy(mark.by || '—', i.dateTime(mark.at)) : l.markProcessed
  if (!allowed)
    return mark ? (
      <span className="mms-done is-on is-readonly" title={title}>
        ✓ <span>{l.processed}</span>
      </span>
    ) : null
  async function toggle() {
    setBusy(true)
    try {
      const res = await fetch('/api/news/processed', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: item.key, done: !mark }) })
      if (res.ok) setMark((await res.json()).processed)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" className={mark ? 'mms-done is-on' : 'mms-done'} aria-pressed={Boolean(mark)} disabled={busy} onClick={toggle} title={mark ? `${title} — ${l.unmark}` : title}>
      ✓ <span>{mark ? l.processed : l.markProcessed}</span>
    </button>
  )
}

export function SimilarFold({ items, more = 0 }: { items?: SimilarItem[]; more?: number }) {
  const l = useListText()
  const i = useI18n()
  const [open, setOpen] = useState(false)
  if (!items?.length) return null
  const n = items.length + more
  return (
    <div className={open ? 'mms-similar is-open' : 'mms-similar'}>
      <button type="button" className="mms-similar__btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? l.less : l.more(n)}
        <span className="mms-similar__srcs" aria-hidden>
          {[...new Set(items.map((s) => s.origin))].slice(0, 4).join(' · ')}
        </span>
      </button>
      {open && (
        <ul>
          {items.map((s) => (
            <li key={s.id}>
              <CountryFlag cc={s.country} />
              <b dir="auto">{s.origin}</b>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" dir="auto">
                  {s.title}
                </a>
              ) : (
                <span dir="auto">{s.title}</span>
              )}
              <time>{i.dateTime(s.date)}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function BriefButton({ item }: { item: NewsItem }) {
  const l = useListText()
  const [text, setText] = useState(item.brief || '')
  const [state, setState] = useState<'' | 'loading' | 'error' | 'limit'>('')
  if (text)
    return (
      <p className="mms-brief" dir="rtl" lang="ar">
        <span aria-hidden>✦</span> {text}
      </p>
    )
  async function run() {
    setState('loading')
    try {
      const res = await fetch('/api/ai/brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.brief?.text) {
        setText(json.brief.text)
        setState('')
      } else setState(json.error === 'DAY_LIMIT' ? 'limit' : 'error')
    } catch {
      setState('error')
    }
  }
  return (
    <button type="button" className="mms-brief-btn" onClick={run} disabled={state === 'loading'}>
      ✦ {state === 'loading' ? l.briefLoading : state === 'error' ? l.briefError : state === 'limit' ? l.briefLimit : l.brief}
    </button>
  )
}

/* ---------------------------------------------------------------- حفظ البحث → رصد */

const WATCH_KEYS = ['source', 'category', 'channel', 'lang', 'tone', 'media', 'country', 'exclude'] as const

// askKeyword : champ « mot-clé » dans la fenêtre (alerte créée depuis un graphique) ; compact : bouton icône seule
export function SaveSearchButton({ filters, email, askKeyword = false, compact = false, context = '' }: { filters: Filters; email: string; askKeyword?: boolean; compact?: boolean; context?: string }) {
  const l = useListText()
  const i = useI18n()
  const x = useIntel()
  const [open, setOpen] = useState(false)
  const [kw, setKw] = useState(filters.q)
  const [name, setName] = useState('')
  const [to, setTo] = useState(email)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const picked = WATCH_KEYS.filter((k) => filters[k])
  const q = kw.trim()
  const has = Boolean(q || picked.length)
  const label = (k: (typeof WATCH_KEYS)[number]) => {
    const v = filters[k]
    if (k === 'category') return i.category(v)
    if (k === 'channel') return i.channel(v)
    if (k === 'lang') return i.language(v)
    if (k === 'tone') return x.tones[v as Tone] ?? v
    if (k === 'country') return `${flagOf(v)} ${countryName(v, i.lang)}`
    if (k === 'exclude') return `− ${v}`
    return v
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!has) return setMsg(l.needCriteria)
    setBusy(true)
    setMsg('')
    try {
      const send = (force: boolean) =>
        fetch('/api/watches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() || context || q || picked.map(label).join(' · '), query: q, filters: Object.fromEntries(picked.map((k) => [k, filters[k]])), recipients: to, force }),
        })
      let res = await send(false)
      let json = await res.json().catch(() => ({}))
      // Veille identique déjà active : on dit laquelle et qui l'a créée avant d'en faire une seconde
      if (res.status === 409 && json.existing && window.confirm(WATCH_TEXT[i.lang].duplicate(json.existing.name, json.existing.createdBy))) {
        res = await send(true)
        json = await res.json().catch(() => ({}))
      }
      if (!res.ok) throw new Error(json.error || 'FAILED')
      setMsg(l.created)
      setTimeout(() => setOpen(false), 1800)
    } catch (err) {
      const code = (err as Error).message
      setMsg(WATCH_TEXT[i.lang].errors[code] ?? `${i.lang === 'ar' ? 'تعذّر الإنشاء' : 'Could not create'} (${code})`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button
        type="button"
        className={compact ? 'mms-wmenu__btn mms-noprint' : 'news-btn news-btn--ghost mms-savewatch'}
        disabled={!has && !askKeyword}
        title={has || askKeyword ? l.saveTitle : l.needCriteria}
        aria-label={l.saveTitle}
        onClick={() => {
          setMsg('')
          setName(context || filters.q)
          setOpen(true)
        }}
      >
        🔔{compact ? '' : ` ${l.saveSearch}`}
      </button>
      {open &&
        // Fenêtre rendue au niveau de la page : un widget animé (transform) la couperait sinon
        createPortal(
        <div className="mms-modal" role="dialog" aria-modal="true" aria-label={l.saveTitle} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form className="mms-modal__box" onSubmit={submit}>
            <h3>{l.saveTitle}</h3>
            <p className="news-status">{l.saveIntro}</p>
            <div className="mms-modal__criteria">
              <span>{l.criteria}:</span>
              {q && !askKeyword && (
                <code dir="auto" className="mms-chip">
                  {q}
                </code>
              )}
              {context && (
                <span className="mms-chip" dir="auto">
                  📊 {context}
                </span>
              )}
              {picked.map((k) => (
                <span key={k} className="mms-chip" dir="auto">
                  {label(k)}
                </span>
              ))}
            </div>
            {askKeyword && (
              <label>
                <span>{i.lang === 'ar' ? 'كلمات مفتاحية (AND / OR / NOT)' : 'Keywords (AND / OR / NOT)'}</span>
                <input value={kw} onChange={(e) => setKw(e.target.value)} maxLength={500} dir="auto" placeholder={i.lang === 'ar' ? 'مثال: (النفط OR الشرارة) AND إغلاق' : 'e.g. (oil OR Sharara) AND closure'} />
              </label>
            )}
            <label>
              <span>{l.watchName}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} dir="auto" />
            </label>
            <label>
              <span>{l.recipients}</span>
              <input value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" inputMode="email" maxLength={600} />
            </label>
            <MailingListPicker value={to} onChange={setTo} />
            {msg && (
              <p className="news-status" role="status">
                {msg}
              </p>
            )}
            <div className="mms-modal__actions">
              <button type="submit" className="news-btn" disabled={busy}>
                {l.create}
              </button>
              <button type="button" className="news-btn news-btn--ghost" onClick={() => setOpen(false)}>
                {l.cancel}
              </button>
            </div>
          </form>
        </div>,
          document.body,
        )}
    </>
  )
}
