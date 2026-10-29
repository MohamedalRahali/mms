import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { type Coverage, basisNote, fairChange } from '../lib/fair'
import { DataSince } from './DataSince'
import { type Count, type EngagementTotals, type Flux, type NewsItem, type Spike, type Stats, type Tone, DrillContext, TONES, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { TONE_COLORS, useIntel } from '../lib/intel'
import { compact, usePro } from '../lib/pro'
import { canDo, useAuth } from '../lib/auth'
import { useCountUp } from '../lib/motion'
import { NewsCard } from './NewsCard'
import { EngagementChips } from './Engagement'
import { PageHead } from './Extras'
import { LoadState } from './LoadState'
import { MailingListPicker } from './MailingLists'

/**
 * Fonctions de niveau Meltwater : assistant de requête booléenne, engagement des posts,
 * part de voix, comparaison de périodes, rapport exécutif et gestion de l'équipe (l'assistant Around est dans Around.tsx).
 */

const ACTOR_COLORS = ['#2fcb81', '#6ea7fd', '#e5b841', '#ff7a59', '#b39ddb', '#f4a3c0']

async function postJson<T>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.error || String(res.status)), { code: json.error || String(res.status) })
  return json as T
}

/* ---------------------------------------------------------------- assistant de requête */

/** Sous le champ de recherche : aide sur la syntaxe et rédaction de la requête par l'IA */
export function QueryAssistant({ onUse, error }: { onUse: (query: string) => void; error?: string }) {
  const p = usePro()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [state, setState] = useState<'' | 'loading' | 'error' | 'off'>('')
  const [result, setResult] = useState<{ query: string; explanation: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setState('loading')
    try {
      setResult(await postJson('/api/ai/query', { text }))
      setState('')
    } catch (err) {
      setState((err as { code?: string }).code === 'NO_KEY' ? 'off' : 'error')
    }
  }

  return (
    <div className="mms-qa">
      <p className="mms-qa__help">
        <span>{p.boolHelp}</span>
        <button type="button" className="mms-qa__toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          ✨ {p.aiQuery}
        </button>
      </p>
      {error && <p className="news-status news-status--error">{p.boolError}</p>}
      {open && (
        <form className="mms-qa__box" onSubmit={submit}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={p.aiQueryPlaceholder} maxLength={500} dir="auto" autoFocus />
          <button type="submit" className="news-btn" disabled={state === 'loading'}>
            {state === 'loading' ? p.working : p.aiQueryGo}
          </button>
          {state === 'error' && <p className="news-status news-status--error">{p.aiError}</p>}
          {state === 'off' && <p className="news-status news-status--error">{p.aiOff}</p>}
          {result && (
            <div className="mms-qa__result">
              <code dir="auto">{result.query}</code>
              <small dir="auto">{result.explanation}</small>
              <button
                type="button"
                className="news-btn news-btn--ghost"
                onClick={() => {
                  onUse(result.query)
                  setOpen(false)
                }}
              >
                {p.aiQueryUse}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- petits éléments communs */

// Jours couverts des deux périodes (réponse du serveur) : les variations se calculent à jours égaux
const CoverageContext = createContext<Coverage | null>(null)

function Delta({ cur, prev, invert = false }: { cur: number; prev: number; invert?: boolean }) {
  const p = usePro()
  const i = useI18n()
  const cov = useContext(CoverageContext)
  const d = fairChange(cur, prev, cov)
  if (d === null) return null
  if (d === 'new') return <span className="mms-delta is-new">{p.cmpNew}</span>
  // Vert = bonne nouvelle : la hausse de la tonalité négative est en rouge (invert)
  const good = invert ? d <= 0 : d >= 0
  return (
    <span className={`mms-delta ${good ? 'is-up' : 'is-down'}`} title={basisNote(cov, i.lang) || undefined}>
      {d >= 0 ? '▲' : '▼'} {Math.abs(d)}%
    </span>
  )
}

function Stat({ label, cur, prev, invert, index }: { label: string; cur: number; prev: number; invert?: boolean; index: number }) {
  const i = useI18n()
  const shown = useCountUp(cur, 1000)
  return (
    <div className="mms-stat fx-tilt" style={{ ['--i' as string]: index }}>
      <span>{label}</span>
      <strong>{i.num(shown)}</strong>
      <small>
        <Delta cur={cur} prev={prev} invert={invert} /> <em>{i.num(prev)}</em>
      </small>
    </div>
  )
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="mms-seg" role="group">
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" className={v === value ? 'is-active' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- part de voix */

type SovActor = { name: string; count: number; tones: Record<Tone, number>; perDay: number[]; sources: Count[]; engagement: EngagementTotals }
type Sov = { days: number; dates: string[]; total: number; actors: SovActor[] }

const SOV_KEY = 'mms-sov-actors'
function readActors(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SOV_KEY) || 'null')
    return Array.isArray(v) ? v.slice(0, 6) : []
  } catch {
    return []
  }
}

export function ShareOfVoice({ flux }: { flux: Flux | '' }) {
  const i = useI18n()
  const p = usePro()
  const x = useIntel()
  const drill = useContext(DrillContext)
  const [actors, setActors] = useState<string[]>(readActors)
  const [draft, setDraft] = useState('')
  const [days, setDays] = useState(30)
  const people = useFetch<Stats>(`/api/news/stats?days=30${flux ? `&flux=${flux}` : ''}`).data
  const suggestions = [...(people?.people ?? []).slice(0, 6), ...(people?.orgs ?? []).slice(0, 4)].map((r) => r.name).filter((n) => !actors.includes(n))
  // Premiers pas : les deux personnalités les plus citées
  useEffect(() => {
    if (!actors.length && people?.people?.length) setActors(people.people.slice(0, 3).map((r) => r.name))
  }, [actors.length, people])
  useEffect(() => {
    try {
      localStorage.setItem(SOV_KEY, JSON.stringify(actors))
    } catch {
      /* stockage indisponible */
    }
  }, [actors])
  const q = new URLSearchParams({ days: String(days), actors: actors.join('|') })
  if (flux) q.set('flux', flux)
  const { data, error } = useFetch<Sov>(actors.length ? `/api/news/sov?${q}` : '/api/news/sov?actors=')
  const rows = data?.actors ?? []
  const sum = rows.reduce((a, r) => a + r.count, 0) || 1
  const [hover, setHover] = useState<number | null>(null)

  function add(name: string) {
    const v = name.trim()
    if (v && !actors.includes(v) && actors.length < 6) setActors([...actors, v])
    setDraft('')
  }

  // Donut de la part de voix
  let a0 = -Math.PI / 2
  const arcs = rows.map((r, k) => {
    const a1 = a0 + (r.count / sum) * Math.PI * 2
    const pt = (a: number, rad: number) => `${50 + Math.cos(a) * rad},${50 + Math.sin(a) * rad}`
    const big = a1 - a0 > Math.PI ? 1 : 0
    const d =
      r.count === sum
        ? 'M50 8a42 42 0 1 1 0 84a42 42 0 1 1 0-84zM50 26a24 24 0 1 0 0 48a24 24 0 1 0 0-48z'
        : `M${pt(a0, 42)}A42 42 0 ${big} 1 ${pt(a1, 42)}L${pt(a1, 24)}A24 24 0 ${big} 0 ${pt(a0, 24)}Z`
    a0 = a1
    return { d, k }
  })
  const maxDay = Math.max(1, ...rows.flatMap((r) => r.perDay))
  const W = 600
  const H = 180

  return (
    <>
      <PageHead title={p.sovTitle} intro={p.sovIntro} />
      <div className="mms-toolbar">
        <form
          className="mms-actors"
          onSubmit={(e) => {
            e.preventDefault()
            add(draft)
          }}
        >
          {actors.map((a, k) => (
            <span key={a} className="mms-actor" style={{ ['--c' as string]: ACTOR_COLORS[k] }}>
              <i aria-hidden />
              <span dir="auto">{a}</span>
              <button type="button" aria-label={`× ${a}`} onClick={() => setActors(actors.filter((y) => y !== a))}>
                ×
              </button>
            </span>
          ))}
          {actors.length < 6 && (
            <>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={p.sovPlaceholder} dir="auto" maxLength={200} />
              <button type="submit" className="news-btn" disabled={!draft.trim()}>
                + {p.sovAdd}
              </button>
            </>
          )}
        </form>
        <Seg value={days} options={[7, 30, 90].map((d) => [d, d === 7 ? i.t.last7 : d === 30 ? i.t.last30 : `90`] as [number, string])} onChange={setDays} />
      </div>
      {!!suggestions.length && actors.length < 6 && (
        <p className="mms-suggest">
          <span>{p.sovSuggest} :</span>
          {suggestions.slice(0, 8).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} dir="auto">
              + {s}
            </button>
          ))}
        </p>
      )}
      {actors.length < 1 ? (
        <p className="news-status">{p.sovEmpty}</p>
      ) : !data ? (
        <LoadState error={error} />
      ) : (
        <div className="mms-pro-grid">
          <section className="mms-panel fx-tilt fx-soft">
            <h3>{p.sovShare}</h3>
            <div className="mms-sov-share">
              <svg viewBox="0 0 100 100" className="mms-sov-donut" onMouseLeave={() => setHover(null)}>
                {arcs.map(({ d, k }) => (
                  <path key={k} d={d} fill={ACTOR_COLORS[k]} opacity={hover === null || hover === k ? 1 : 0.4} onMouseEnter={() => setHover(k)} />
                ))}
                <text x="50" y="49" textAnchor="middle" className="mms-donut__value">
                  {hover !== null ? `${Math.round((rows[hover].count / sum) * 100)}%` : i.num(sum)}
                </text>
                <text x="50" y="60" textAnchor="middle" className="mms-donut__label">
                  {hover !== null ? rows[hover].name.slice(0, 16) : p.sovMentions}
                </text>
              </svg>
              <ul className="mms-sov-legend">
                {rows.map((r, k) => (
                  <li key={r.name} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} onClick={() => drill({ q: r.name })}>
                    <i style={{ background: ACTOR_COLORS[k] }} />
                    <span dir="auto">{r.name}</span>
                    <b>{i.num(r.count)}</b>
                    <small>{Math.round((r.count / sum) * 100)}%</small>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="mms-panel fx-tilt fx-soft">
            <h3>{p.sovTone}</h3>
            <ul className="mms-sov-tones">
              {rows.map((r, k) => {
                const tot = TONES.reduce((a, t) => a + r.tones[t], 0) || 1
                return (
                  <li key={r.name}>
                    <span dir="auto" style={{ color: ACTOR_COLORS[k] }}>
                      {r.name}
                    </span>
                    <div className="mms-sov-bar">
                      {TONES.map((t) => (
                        <i
                          key={t}
                          title={`${x.tones[t]} ${r.tones[t]}`}
                          style={{ width: `${(r.tones[t] / tot) * 100}%`, background: TONE_COLORS[t] }}
                          onClick={() => drill({ q: r.name, tone: t })}
                        />
                      ))}
                    </div>
                    <small>
                      {TONES.map((t) => (
                        <em key={t} style={{ color: TONE_COLORS[t] }}>
                          {Math.round((r.tones[t] / tot) * 100)}%
                        </em>
                      ))}
                    </small>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="mms-panel mms-panel--wide fx-tilt fx-soft">
            <h3>{p.sovTrend}</h3>
            <svg viewBox={`0 0 ${W} ${H}`} className="mms-sov-trend" preserveAspectRatio="none">
              {[0.25, 0.5, 0.75].map((f) => (
                <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="mms-sov-grid" />
              ))}
              {rows.map((r, k) => {
                const n = Math.max(r.perDay.length - 1, 1)
                const pts = r.perDay.map((v, d) => `${(d / n) * W},${H - (v / maxDay) * (H - 10) - 2}`).join(' ')
                return (
                  <polyline
                    key={r.name}
                    points={pts}
                    fill="none"
                    stroke={ACTOR_COLORS[k]}
                    strokeWidth="2.4"
                    vectorEffect="non-scaling-stroke"
                    className="mms-sov-line"
                  />
                )
              })}
            </svg>
            {data.dates.length > 0 && (
              <div className="news-daily__axis" dir="ltr">
                <span>{i.day(data.dates[0])}</span>
                <span>{i.day(data.dates[data.dates.length - 1])}</span>
              </div>
            )}
          </section>

          {rows.map((r, k) => (
            <section key={r.name} className="mms-panel fx-tilt" style={{ ['--c' as string]: ACTOR_COLORS[k] }}>
              <h3 className="mms-panel__actor" dir="auto">
                {r.name}
              </h3>
              <p className="mms-panel__big">
                {i.num(r.count)} <small>{p.sovMentions}</small>
              </p>
              {r.engagement.posts > 0 && (
                <EngagementChips
                  value={{ views: r.engagement.views, reactions: r.engagement.reactions, shares: r.engagement.shares, comments: r.engagement.comments }}
                />
              )}
              <p className="mms-panel__sub">{p.sovTopSources}</p>
              <ul className="mms-mini">
                {r.sources.map((s) => (
                  <li key={s.name} onClick={() => drill({ q: r.name, source: s.name })}>
                    <span dir="auto">{s.name}</span>
                    <b>{i.num(s.count)}</b>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- comparaison de périodes */

type Pair = { name: string; current: number; previous: number }
type Profile = { total: number; sources: number; important: number; tones: Record<Tone, number>; engagement: EngagementTotals }
type Compare = {
  insufficient?: boolean
  coverage?: Coverage
  days: number
  current: Profile
  previous: Profile
  categories: Pair[]
  sources: Pair[]
  channels: Pair[]
  people: Pair[]
  orgs: Pair[]
  places: Pair[]
}

function PairBars({ title, rows, label, onPick }: { title: string; rows: Pair[]; label?: (n: string) => string; onPick: (name: string) => void }) {
  const i = useI18n()
  const max = Math.max(1, ...rows.flatMap((r) => [r.current, r.previous]))
  return (
    <section className="mms-panel fx-tilt fx-soft">
      <h3>{title}</h3>
      <ul className="mms-pairs">
        {rows.slice(0, 8).map((r) => (
          <li key={r.name} onClick={() => onPick(r.name)}>
            <span className="mms-pairs__name" dir="auto">
              {label ? label(r.name) : r.name}
            </span>
            <span className="mms-pairs__bars">
              <i className="is-cur" style={{ width: `${(r.current / max) * 100}%` }} />
              <i className="is-prev" style={{ width: `${(r.previous / max) * 100}%` }} />
            </span>
            <b>{i.num(r.current)}</b>
            <Delta cur={r.current} prev={r.previous} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ComparePeriods({ flux }: { flux: Flux | '' }) {
  const i = useI18n()
  const p = usePro()
  const drill = useContext(DrillContext)
  const [days, setDays] = useState(7)
  const { data, error } = useFetch<Compare>(`/api/news/compare?days=${days}${flux ? `&flux=${flux}` : ''}`)
  const inter = (e: EngagementTotals) => e.reactions + e.shares + e.comments
  return (
    <>
      <PageHead title={p.cmpTitle} intro={p.cmpIntro} />
      <DataSince />
      {data?.insufficient && data.coverage && (
        <p className="mms-note" role="note">
          {i.lang === 'ar'
            ? `الفترة السابقة لا تغطيها البيانات إلا ${Math.round(data.coverage.previous)} يوم من ${data.coverage.days}: النسب محسوبة على متوسط الأيام المغطاة في كل فترة.`
            : `Data covers only ${Math.round(data.coverage.previous)} of the ${data.coverage.days} days of the previous period: percentages compare the daily average of the covered days.`}
        </p>
      )}
      <div className="mms-toolbar">
        <Seg value={days} options={[7, 14, 30, 90].map((d) => [d, p.cmpPeriods[d]] as [number, string])} onChange={setDays} />
        <p className="mms-legend-inline">
          <i className="is-cur" /> {p.cmpCurrent} <i className="is-prev" /> {p.cmpPrevious}
        </p>
      </div>
      {!data ? (
        <LoadState error={error} />
      ) : (
        <CoverageContext.Provider value={data.coverage ?? null}>
          <div className="mms-stats">
            <Stat index={0} label={p.cmpTotal} cur={data.current.total} prev={data.previous.total} />
            <Stat index={1} label={p.cmpSources} cur={data.current.sources} prev={data.previous.sources} />
            <Stat index={2} label={p.cmpImportant} cur={data.current.important} prev={data.previous.important} />
            <Stat index={3} label={p.cmpNegative} cur={data.current.tones.negative} prev={data.previous.tones.negative} invert />
            <Stat index={4} label={p.cmpPositive} cur={data.current.tones.positive} prev={data.previous.tones.positive} />
            {data.current.engagement.posts > 0 && (
              <Stat index={5} label={p.cmpInteractions} cur={inter(data.current.engagement)} prev={inter(data.previous.engagement)} />
            )}
          </div>
          <div className="mms-pro-grid">
            <PairBars title={p.cmpCategories} rows={data.categories} label={i.category} onPick={(n) => drill({ category: n, days: String(days) })} />
            <PairBars title={p.cmpPeople} rows={data.people} onPick={(n) => drill({ entity: n, days: String(days) })} />
            <PairBars title={p.cmpOrgs} rows={data.orgs} onPick={(n) => drill({ entity: n, days: String(days) })} />
            <PairBars title={p.cmpPlaces} rows={data.places} onPick={(n) => drill({ entity: n, days: String(days) })} />
            <PairBars title={p.cmpSourcesList} rows={data.sources} onPick={(n) => drill({ source: n, days: String(days) })} />
            <PairBars title={i.t.allChannels} rows={data.channels} label={i.channel} onPick={(n) => drill({ channel: n, days: String(days) })} />
          </div>
        </CoverageContext.Provider>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- rapport exécutif */

type Summary = { resume: string; faits: string[]; tendances: string[]; recommandations: string[]; at: string }
type Briefing = {
  days: number
  from: string
  to: string
  current: Profile
  previous: Profile
  coverage?: Coverage
  change: number | 'new' | null
  categories: Pair[]
  people: Pair[]
  orgs: Pair[]
  places: Pair[]
  sources: Pair[]
  spikes: Spike[]
  top: NewsItem[]
  engaged: NewsItem[]
  summary: Summary | null
  ai: boolean
}
type Schedule = {
  enabled: boolean
  weekday: number
  hour: number
  days: number
  recipients: string[]
  telegram: boolean
  lastSent: string
  lastError: string
  smtp: boolean
  telegramReady: boolean
  ai: boolean
}

function ScheduleForm() {
  const p = usePro()
  const { data, error } = useFetch<Schedule>('/api/briefing/schedule', 0)
  const [form, setForm] = useState<Schedule | null>(null)
  const [recipients, setRecipients] = useState('')
  const [state, setState] = useState<'' | 'saving' | 'saved' | 'sending' | 'sent' | 'error' | 'nochannel'>('')
  useEffect(() => {
    if (data && !form) {
      setForm(data)
      setRecipients(data.recipients.join(', '))
    }
  }, [data, form])
  if (!form) return null
  async function save() {
    setState('saving')
    try {
      const next = await postJson<Schedule>('/api/briefing/schedule', { ...form, recipients }, 'PUT')
      setForm(next)
      setRecipients(next.recipients.join(', '))
      setState('saved')
    } catch {
      setState('error')
    }
  }
  async function sendNow() {
    setState('sending')
    try {
      await postJson('/api/briefing/send')
      setState('sent')
    } catch (err) {
      setState((err as { code?: string }).code === 'NO_CHANNEL' ? 'nochannel' : 'error')
    }
  }
  const set = (patch: Partial<Schedule>) => setForm({ ...form, ...patch })
  return (
    <section className="mms-panel mms-schedule mms-noprint">
      <h3>{p.brSchedule}</h3>
      <label className="mms-check">
        <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        {p.brEnabled}
      </label>
      <div className="mms-schedule__row">
        <label>
          <span>{p.brDay}</span>
          <select value={form.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
            {p.weekdays.map((d, k) => (
              <option key={d} value={k}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{p.brHour}</span>
          <select value={form.hour} onChange={(e) => set({ hour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{p.brDays}</span>
          <select value={form.days} onChange={(e) => set({ days: Number(e.target.value) })}>
            {[7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {p.brPeriod[d]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mms-schedule__wide">
        <span>{p.brRecipients}</span>
        <input value={recipients} onChange={(e) => setRecipients(e.target.value)} dir="ltr" placeholder="name@npdc.gov.ly, …" />
        <MailingListPicker value={recipients} onChange={setRecipients} />
      </label>
      <label className="mms-check">
        <input type="checkbox" checked={form.telegram} onChange={(e) => set({ telegram: e.target.checked })} />
        {p.brTelegram}
      </label>
      {!form.smtp && !form.telegramReady && <p className="news-status news-status--error">{p.brNoChannel}</p>}
      <div className="mms-schedule__actions">
        <button type="button" className="news-btn" onClick={save} disabled={state === 'saving'}>
          {state === 'saved' ? `✓ ${p.brSaved}` : p.brSave}
        </button>
        <button type="button" className="news-btn news-btn--ghost" onClick={sendNow} disabled={state === 'sending'}>
          {state === 'sending' ? p.working : state === 'sent' ? `✓ ${p.brSent}` : p.brSendNow}
        </button>
        {form.lastSent && (
          <small>
            {p.brLast} : {form.lastSent}
          </small>
        )}
      </div>
      {state === 'error' && <p className="news-status news-status--error">{p.brSendError}</p>}
      {state === 'nochannel' && <p className="news-status news-status--error">{p.brNoChannel}</p>}
    </section>
  )
}

export function ExecutiveBriefing({ flux }: { flux: Flux | '' }) {
  const i = useI18n()
  const p = usePro()
  const x = useIntel()
  const auth = useAuth()
  const drill = useContext(DrillContext)
  const [days, setDays] = useState(7)
  const { data, error } = useFetch<Briefing>(`/api/briefing?days=${days}${flux ? `&flux=${flux}` : ''}`)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [state, setState] = useState<'' | 'loading' | 'error'>('')
  useEffect(() => setSummary(null), [days, flux])
  const shown = summary ?? data?.summary ?? null

  async function write() {
    setState('loading')
    try {
      const r = await postJson<{ summary: Summary }>(`/api/briefing/summary?days=${days}${flux ? `&flux=${flux}` : ''}`)
      setSummary(r.summary)
      setState('')
    } catch {
      setState('error')
    }
  }

  const fmt = new Intl.DateTimeFormat(i.lang === 'ar' ? 'ar-LY-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Tripoli',
  })
  return (
    <div className="mms-brief">
      <PageHead title={p.brTitle} intro={p.brIntro} />
      <div className="mms-toolbar mms-noprint">
        <Seg value={days} options={[7, 14, 30].map((d) => [d, p.brPeriod[d]] as [number, string])} onChange={setDays} />
        <div className="mms-toolbar__end">
          {data?.ai && canDo(auth?.user, 'ai_run') && (
            <button type="button" className="news-btn" onClick={write} disabled={state === 'loading' || !!shown}>
              {state === 'loading' ? p.working : shown ? `✓ ${p.brRewrite}` : `✨ ${p.brWrite}`}
            </button>
          )}
          {canDo(auth?.user, 'export') && (
            <button type="button" className="news-btn news-btn--ghost" onClick={() => window.print()}>
              {p.brPrint}
            </button>
          )}
        </div>
      </div>
      {state === 'error' && <p className="news-status news-status--error">{p.aiError}</p>}
      {!data ? (
        <LoadState error={error} />
      ) : (
        <CoverageContext.Provider value={data.coverage ?? null}>
        <article className="mms-brief__sheet">
          <header className="mms-brief__head">
            <div>
              <small>MMS · {p.brTitle}</small>
              <h2>
                {fmt.format(new Date(data.from))} – {fmt.format(new Date(data.to))}
              </h2>
            </div>
            {data.change === 'new' && (
              <p className="mms-brief__change is-up">
                {p.cmpNew} <small>{p.brVsPrev}</small>
              </p>
            )}
            {typeof data.change === 'number' && (
              <p className={data.change >= 0 ? 'mms-brief__change is-up' : 'mms-brief__change is-down'} title={basisNote(data.coverage, i.lang) || undefined}>
                {data.change >= 0 ? '▲' : '▼'} {Math.abs(data.change)}% <small>{p.brVsPrev}</small>
                {data.coverage?.partial && <small className="mms-brief__basis"> · {basisNote(data.coverage, i.lang)}</small>}
              </p>
            )}
          </header>
          <div className="mms-stats">
            <Stat index={0} label={p.cmpTotal} cur={data.current.total} prev={data.previous.total} />
            <Stat index={1} label={p.cmpSources} cur={data.current.sources} prev={data.previous.sources} />
            <Stat index={2} label={p.cmpImportant} cur={data.current.important} prev={data.previous.important} />
            <Stat index={3} label={p.cmpNegative} cur={data.current.tones.negative} prev={data.previous.tones.negative} invert />
          </div>
          {shown && (
            <div className="mms-brief__ai">
              <section>
                <h3>{p.brSummary}</h3>
                <p dir="auto">{shown.resume}</p>
              </section>
              <div className="mms-brief__cols">
                <section>
                  <h3>{p.brFacts}</h3>
                  <ul>
                    {shown.faits.map((f) => (
                      <li key={f} dir="auto">
                        {f}
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3>{p.brTrends}</h3>
                  <ul>
                    {shown.tendances.map((f) => (
                      <li key={f} dir="auto">
                        {f}
                      </li>
                    ))}
                  </ul>
                  <h3>{p.brReco}</h3>
                  <ul>
                    {shown.recommandations.map((f) => (
                      <li key={f} dir="auto">
                        {f}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          )}
          <div className="mms-pro-grid">
            <PairBars title={p.cmpCategories} rows={data.categories} label={i.category} onPick={(n) => drill({ category: n, days: String(days) })} />
            <PairBars title={p.cmpPeople} rows={data.people} onPick={(n) => drill({ entity: n, days: String(days) })} />
            <section className="mms-panel">
              <h3>{x.tone}</h3>
              <div className="mms-sov-bar mms-sov-bar--big">
                {TONES.map((t) => {
                  const tot = TONES.reduce((a, k) => a + data.current.tones[k], 0) || 1
                  return <i key={t} style={{ width: `${(data.current.tones[t] / tot) * 100}%`, background: TONE_COLORS[t] }} />
                })}
              </div>
              <p className="mms-tone-legend">
                {TONES.map((t) => (
                  <span key={t}>
                    <i style={{ background: TONE_COLORS[t] }} /> {x.tones[t]} <b>{i.num(data.current.tones[t])}</b>
                  </span>
                ))}
              </p>
              {data.spikes.length > 0 && (
                <>
                  <h3>{p.brSpikes}</h3>
                  <ul className="mms-mini">
                    {data.spikes.map((s) => (
                      <li key={s.dim + s.name}>
                        <span dir="auto">{s.dim === 'categories' ? i.category(s.name) : s.name}</span>
                        <b>{i.num(s.count)}</b>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
            <PairBars title={p.cmpOrgs} rows={data.orgs} onPick={(n) => drill({ entity: n, days: String(days) })} />
          </div>
          <h3 className="mms-brief__title">{p.brTop}</h3>
          <ol className="mms-brief__top">
            {data.top.slice(0, 10).map((it) => (
              <li key={it.id}>
                <a href={it.url || undefined} target="_blank" rel="noreferrer" dir="auto">
                  {it.title}
                </a>
                <small>
                  {it.origin} · {i.dateTime(it.date)}
                </small>
                <EngagementChips value={it.engagement} />
              </li>
            ))}
          </ol>
        </article>
        </CoverageContext.Provider>
      )}
      {canDo(auth?.user, 'schedule') && <ScheduleForm />}
    </div>
  )
}

/* ---------------------------------------------------------------- liste « les plus engageants » */

export function TopEngaged({ flux, days = 7 }: { flux: Flux | ''; days?: number }) {
  const p = usePro()
  const { data, error } = useFetch<Stats>(`/api/news/stats?days=${days}${flux ? `&flux=${flux}` : ''}`)
  const items = data?.topEngaged ?? []
  return (
    <section className="mms-panel mms-panel--wide">
      <h3>{p.engagementTitle}</h3>
      {items.length === 0 ? (
        <p className="news-status">{p.engagementEmpty}</p>
      ) : (
        <div className="news-list">
          {items.map((it) => (
            <NewsCard key={it.id} item={it} />
          ))}
        </div>
      )}
    </section>
  )
}
