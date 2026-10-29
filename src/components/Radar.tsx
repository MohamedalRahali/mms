import { useContext, useState } from 'react'
import { DataSince } from './DataSince'
import { type Filters, type Flux, type Tone, DrillContext, TONES, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { TONE_COLORS, useIntel } from '../lib/intel'
import { type Barometer, type Emerging, type SmartAlert, type Story, type ToneRow, radarText } from '../lib/radar'
import { PageHead } from './Extras'
import { canDo, useAuth } from '../lib/auth'
import { AlertFlowBar } from './AlertFlow'
import { LoadState } from './LoadState'

/**
 * « الرادار الذكي » : alertes classées, sujets émergents, histoires reprises par plusieurs médias et
 * baromètre du sentiment. Chaque élément ouvre la liste des actualités correspondantes.
 */

const fluxParam = (flux: Flux | '', sep = '?') => (flux ? `${sep}flux=${flux}` : '')

function ToneBar({ tone }: { tone: Record<Tone, number> }) {
  const sum = TONES.reduce((n, t) => n + tone[t], 0) || 1
  return (
    <span className="radar-tonebar" aria-hidden>
      {TONES.map((t) => (tone[t] ? <i key={t} style={{ width: `${(tone[t] / sum) * 100}%`, background: TONE_COLORS[t] }} /> : null))}
    </span>
  )
}

/** Courbe des 8 derniers jours ; le dernier point (fenêtre récente) est mis en avant */
function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  const W = 84
  const H = 26
  const step = W / Math.max(values.length - 1, 1)
  const pts = values.map((v, k) => `${(k * step).toFixed(1)},${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`)
  const last = pts[pts.length - 1]?.split(',')
  return (
    <svg className="radar-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden>
      <polyline points={pts.join(' ')} />
      {last && <circle cx={last[0]} cy={last[1]} r="2.6" />}
    </svg>
  )
}

type Explained = { explication: string; points: string[] }

/** Bouton « لماذا؟ » : résumé par l'IA d'une histoire ou d'un sujet (POST /api/radar/explain) */
function Explain({ kind, id, hours, flux }: { kind: 'story' | 'topic'; id: string; hours: number; flux: Flux | '' }) {
  const x = useIntel()
  const i = useI18n()
  const [state, setState] = useState<'' | 'loading' | 'error' | 'nokey'>('')
  const [result, setResult] = useState<Explained | null>(null)
  const mayAsk = canDo(useAuth()?.user, 'ai_ask')
  async function go() {
    setState('loading')
    try {
      const res = await fetch('/api/radar/explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, key: id, hours, flux }),
      })
      if (res.status === 400) return setState('nokey')
      if (!res.ok) throw new Error(String(res.status))
      setResult(((await res.json()) as { result: Explained }).result)
      setState('')
    } catch {
      setState('error')
    }
  }
  if (result)
    return (
      <div className="mms-spike__ai radar-ai" dir="auto">
        <p>{result.explication}</p>
        {result.points.length > 0 && (
          <ul>
            {result.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    )
  if (!mayAsk) return null
  return (
    <>
      <button type="button" className="news-btn news-btn--ghost" onClick={go} disabled={state === 'loading'}>
        {state === 'loading' ? x.explaining : x.why}
      </button>
      {state === 'error' && <p className="news-status news-status--error">{x.explainError}</p>}
      {state === 'nokey' && <p className="news-status">{i.lang === 'ar' ? 'التحليل الذكي غير مفعّل (مفتاح الذكاء الاصطناعي غير مضبوط).' : 'AI analysis is not enabled (no AI key configured).'}</p>}
    </>
  )
}

const signed = (n: number, num: (n: number) => string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${num(Math.abs(n))}`
const netClass = (n: number) => (n >= 15 ? 'is-pos' : n <= -15 ? 'is-neg' : 'is-neu')

function Alerts({ flux }: { flux: Flux | '' }) {
  const i = useI18n()
  const r = radarText(i.lang)
  const drill = useContext(DrillContext)
  const { data, loading } = useFetch<{ alerts: SmartAlert[] }>(`/api/radar/alerts${fluxParam(flux)}`)
  const alerts = data?.alerts ?? []
  return (
    <section className="radar-block" aria-label={r.alerts}>
      <h3>{r.alerts}</h3>
      {loading && !data && <p className="news-status">{r.loading}</p>}
      {data && !alerts.length && <p className="news-status">{r.alertsEmpty}</p>}
      <ul className="radar-alerts">
        {alerts.map((a) => (
          <li key={a.id}>
            <button type="button" className={`radar-alert radar-alert--${a.level}`} onClick={() => drill({ ...(a.filter as Partial<Filters>), days: '1' })}>
              <span className="radar-alert__top">
                <b>{r.levels[a.level]}</b>
                <small>{r.kinds[a.kind]}</small>
              </span>
              <strong dir="auto">{a.kind === 'spike' && a.detail.dim === 'categories' ? i.category(a.label) : a.label}</strong>
              <span className="radar-alert__line">{r.alertLine(a, i.num)}</span>
            </button>
            <AlertFlowBar alert={a} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function EmergingTopics({ flux }: { flux: Flux | '' }) {
  const i = useI18n()
  const r = radarText(i.lang)
  const drill = useContext(DrillContext)
  const [hours, setHours] = useState(24)
  const [picked, setPicked] = useState('')
  const { data, loading } = useFetch<{ topics: Emerging[] }>(`/api/radar/emerging?hours=${hours}${fluxParam(flux, '&')}`)
  const topics = data?.topics ?? []
  const open = (t: Emerging) =>
    drill({
      ...(t.kind === 'entity' ? { entity: t.label } : { q: t.kind === 'phrase' ? `"${t.label}"` : t.label }),
      days: String(Math.max(1, Math.ceil(hours / 24))),
    })
  return (
    <section className="radar-block news-panel">
      <header className="radar-block__head">
        <div>
          <h3>{r.emerging}</h3>
          <p>{r.emergingHint}</p>
        </div>
        <div className="mms-seg" role="group">
          {[6, 24, 72].map((h) => (
            <button key={h} type="button" className={h === hours ? 'is-active' : ''} onClick={() => setHours(h)}>
              {r.windows[h]}
            </button>
          ))}
        </div>
      </header>
      {loading && !data && <p className="news-status">{r.loading}</p>}
      {data && !topics.length && <p className="news-status">{r.emergingEmpty}</p>}
      <ol className="radar-topics">
        {topics.map((t, k) => (
          <li key={t.key} className={picked === t.key ? 'is-open' : ''}>
            <button type="button" className="radar-topic" onClick={() => open(t)} title={t.sample.map((s) => `• ${s.title}`).join('\n')}>
              <span className="radar-topic__rank">{i.num(k + 1)}</span>
              <span className="radar-topic__main">
                <strong dir="auto">
                  {t.label}
                  {t.isNew && <em className="radar-new">{r.isNew}</em>}
                </strong>
                <small>{r.mentions(i.num(t.recent), i.num(t.sources))}</small>
                <ToneBar tone={t.tone} />
              </span>
              <Spark values={t.perDay} />
              <span className="radar-topic__growth">{t.isNew ? '▲' : r.growth(i.num(t.growth))}</span>
            </button>
            <button type="button" className="radar-topic__more" aria-expanded={picked === t.key} onClick={() => setPicked(picked === t.key ? '' : t.key)}>
              {picked === t.key ? '−' : '+'}
            </button>
            {picked === t.key && (
              <div className="radar-topic__detail">
                <ul>
                  {t.sample.map((it) => (
                    <li key={it.id} dir="auto">
                      {it.title} <small>· {it.origin}</small>
                    </li>
                  ))}
                </ul>
                <Explain kind="topic" id={t.key} hours={hours} flux={flux} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function StoryCard({ story, hours, flux }: { story: Story; hours: number; flux: Flux | '' }) {
  const i = useI18n()
  const r = radarText(i.lang)
  const drill = useContext(DrillContext)
  const [open, setOpen] = useState(false)
  return (
    <article className="radar-story news-panel">
      <div className="radar-story__badge">
        <strong>{i.num(story.sources.length)}</strong>
        <small>{r.sourcesN('').trim()}</small>
      </div>
      <div className="radar-story__body">
        <h4 dir="auto">{story.title}</h4>
        <p className="radar-story__meta">
          {r.firstBy(story.first.origin, i.dateTime(story.first.date))} · {r.itemsN(i.num(story.size))}
        </p>
        <ToneBar tone={story.tone} />
        <p className="radar-story__sources">
          {story.sources.slice(0, 8).map((s) => (
            <span key={s} dir="auto">
              {s}
            </span>
          ))}
          {story.sources.length > 8 && <span>+{i.num(story.sources.length - 8)}</span>}
        </p>
        <div className="radar-story__actions">
          <button type="button" className="news-btn news-btn--ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? r.hideItems : r.showItems}
          </button>
          <button type="button" className="news-btn news-btn--ghost" onClick={() => drill({ q: story.query.join(' '), days: '3' })}>
            {r.openAll}
          </button>
          <Explain kind="story" id={story.id} hours={hours} flux={flux} />
        </div>
        {open && (
          <ul className="radar-story__items">
            {story.items.map((it) => (
              <li key={it.id}>
                <i style={{ background: TONE_COLORS[it.tone] }} aria-hidden />
                {it.url ? (
                  <a href={it.url} target="_blank" rel="noopener noreferrer" dir="auto">
                    {it.title}
                  </a>
                ) : (
                  <span dir="auto">{it.title}</span>
                )}
                <small dir="auto">
                  {it.origin} · {i.channel(it.channel)} · {i.dateTime(it.date)}
                </small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}

function Stories({ flux }: { flux: Flux | '' }) {
  const i = useI18n()
  const r = radarText(i.lang)
  const [hours, setHours] = useState(48)
  const { data, loading } = useFetch<{ stories: Story[] }>(`/api/radar/stories?hours=${hours}${fluxParam(flux, '&')}`)
  const stories = data?.stories ?? []
  return (
    <section className="radar-block">
      <header className="radar-block__head">
        <div>
          <h3>{r.stories}</h3>
          <p>{r.storiesHint}</p>
        </div>
        <div className="mms-seg" role="group">
          {[24, 48, 168].map((h) => (
            <button key={h} type="button" className={h === hours ? 'is-active' : ''} onClick={() => setHours(h)}>
              {h === 24 ? r.windows[24] : h === 48 ? (i.lang === 'ar' ? 'يومان' : '2 days') : i.lang === 'ar' ? '7 أيام' : '7 days'}
            </button>
          ))}
        </div>
      </header>
      {loading && !data && <p className="news-status">{r.loading}</p>}
      {data && !stories.length && <p className="news-status">{r.storiesEmpty}</p>}
      <div className="radar-stories">
        {stories.slice(0, 10).map((s) => (
          <StoryCard key={s.id} story={s} hours={hours} flux={flux} />
        ))}
      </div>
    </section>
  )
}

/** Demi-cadran de −100 à +100 */
function Gauge({ value }: { value: number }) {
  const a = Math.PI * (1 - (value + 100) / 200)
  const x = 60 + Math.cos(a) * 46
  const y = 62 - Math.sin(a) * 46
  return (
    <svg className="radar-gauge" viewBox="0 0 120 70" aria-hidden>
      <path d="M14 62a46 46 0 0 1 30.5-43.3" className="radar-gauge__neg" />
      <path d="M44.5 18.7a46 46 0 0 1 31 0" className="radar-gauge__neu" />
      <path d="M75.5 18.7A46 46 0 0 1 106 62" className="radar-gauge__pos" />
      <line x1="60" y1="62" x2={x.toFixed(1)} y2={y.toFixed(1)} className="radar-gauge__needle" />
      <circle cx="60" cy="62" r="4" className="radar-gauge__hub" />
    </svg>
  )
}

function ToneTable({ rows, head, onPick }: { rows: ToneRow[]; head: string; onPick: (name: string) => void }) {
  const i = useI18n()
  const r = radarText(i.lang)
  const x = useIntel()
  return (
    <table className="news-table radar-table">
      <thead>
        <tr>
          <th>{head}</th>
          <th>{r.volume}</th>
          <th>{r.net}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td>
              <button type="button" className="radar-link" onClick={() => onPick(row.name)} dir="auto">
                {row.name}
              </button>
            </td>
            <td title={TONES.map((t) => `${x.tones[t]} ${row[t]}`).join(' · ')}>
              {i.num(row.count)}
              <ToneBar tone={row} />
            </td>
            <td>
              <span className={`radar-net ${netClass(row.sentiment)}`} dir="ltr">
                <span className="radar-net__track">
                  <i style={{ [row.sentiment >= 0 ? 'left' : 'right']: '50%', width: `${Math.abs(row.sentiment) / 2}%` }} />
                </span>
                <b>{signed(row.sentiment, i.num)}</b>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SentimentBarometer({ flux }: { flux: Flux | '' }) {
  const i = useI18n()
  const r = radarText(i.lang)
  const x = useIntel()
  const drill = useContext(DrillContext)
  const { data, error } = useFetch<Barometer>(`/api/radar/sentiment?days=14${fluxParam(flux, '&')}`)
  // Vue par défaut : acteurs libyens quand le référentiel en trouve, sinon tous les acteurs
  const [allActors, setAllActors] = useState(false)
  if (!data) return <LoadState error={error} />
  const hasLy = Boolean(data.actorsLy?.length)
  const actorRows = hasLy && !allActors ? data.actorsLy! : data.actors
  const max = Math.max(1, ...data.perDay.map((d) => Math.max(d.positive, d.negative)))
  return (
    <section className="radar-block">
      <header className="radar-block__head">
        <div>
          <h3>{r.barometer}</h3>
          <p>{r.barometerHint}</p>
        </div>
      </header>
      <div className="radar-baro">
        <div className="news-panel radar-baro__gauge">
          <Gauge value={data.sentiment} />
          <strong className={netClass(data.sentiment)} dir="ltr">
            {signed(data.sentiment, i.num)}
          </strong>
          <span>{r.netLabel}</span>
          <ul className="radar-baro__totals">
            {TONES.map((t) => (
              <li key={t}>
                <i style={{ background: TONE_COLORS[t] }} aria-hidden />
                {x.tones[t]} <b>{i.num(data[t])}</b>
              </li>
            ))}
          </ul>
          {data.inferredShare > 0 && <small>{r.inferred(i.num(data.inferredShare))}</small>}
        </div>
        <div className="news-panel radar-baro__days">
          <h4>{r.perDay}</h4>
          <div className="radar-days" dir="ltr">
            {data.perDay.map((d) => (
              <div key={d.date} className="radar-days__col" title={`${d.date} · +${d.positive} / −${d.negative} · ${d.sentiment}`}>
                <span className="radar-days__pos" style={{ height: `${(d.positive / max) * 50}%` }} />
                <span className="radar-days__neg" style={{ height: `${(d.negative / max) * 50}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="radar-baro__tables">
        <div className="news-panel">
          <h4>
            {r.byActor}
            {hasLy && (
              <span className="mms-seg radar-baro__seg" role="group">
                <button type="button" className={!allActors ? 'is-active' : ''} aria-pressed={!allActors} onClick={() => setAllActors(false)}>
                  {r.actorsLy}
                </button>
                <button type="button" className={allActors ? 'is-active' : ''} aria-pressed={allActors} onClick={() => setAllActors(true)}>
                  {r.actorsAll}
                </button>
              </span>
            )}
          </h4>
          <ToneTable rows={actorRows} head={r.actor} onPick={(name) => drill({ entity: name, days: '14' })} />
        </div>
        <div className="news-panel">
          <h4>{r.bySource}</h4>
          <ToneTable rows={data.sources} head={r.source} onPick={(name) => drill({ source: name, days: '14' })} />
        </div>
      </div>
    </section>
  )
}

export function Radar({ flux }: { flux: Flux | '' }) {
  const i = useI18n()
  const r = radarText(i.lang)
  return (
    <div className="radar">
      <PageHead title={r.title} intro={r.intro} />
      <DataSince />
      <Alerts flux={flux} />
      <div className="radar-grid">
        <EmergingTopics flux={flux} />
        <SentimentBarometer flux={flux} />
      </div>
      <Stories flux={flux} />
    </div>
  )
}

/** Bandeau du tableau de bord : les alertes critiques seulement, avec un lien vers le radar */
export function RadarBrief({ flux, onOpen }: { flux: Flux | ''; onOpen: () => void }) {
  const i = useI18n()
  const r = radarText(i.lang)
  const drill = useContext(DrillContext)
  const { data, error } = useFetch<{ alerts: SmartAlert[] }>(`/api/radar/alerts${fluxParam(flux)}`)
  // Les pics sont déjà dans le bandeau « نشاط غير معتاد » juste en dessous : ici, le reste des alertes critiques
  const critical = (data?.alerts ?? []).filter((a) => a.level === 3 && a.kind !== 'spike').slice(0, 3)
  if (!critical.length) return null
  return (
    <section className="radar-brief" aria-label={r.briefTitle}>
      <h2>{r.briefTitle}</h2>
      <ul>
        {critical.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => drill({ ...(a.filter as Partial<Filters>), days: '1' })}>
              <small>{r.kinds[a.kind]}</small>
              <strong dir="auto">{a.kind === 'spike' && a.detail.dim === 'categories' ? i.category(a.label) : a.label}</strong>
              <span>{r.alertLine(a, i.num)}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="radar-brief__more" onClick={onOpen}>
        {r.briefMore} {i.dir === 'rtl' ? '←' : '→'}
      </button>
    </section>
  )
}

/** Versions compactes pour les tableaux de bord composés (types de widget emerging, stories, alerts, mood) */
export function RadarWidget({ type, flux, days }: { type: 'emerging' | 'stories' | 'alerts' | 'mood'; flux: Flux | ''; days: number }) {
  const i = useI18n()
  const r = radarText(i.lang)
  const x = useIntel()
  const drill = useContext(DrillContext)
  const hours = Math.min(Math.max(days, 1) * 24, type === 'emerging' ? 72 : 336)
  const url =
    type === 'emerging'
      ? `/api/radar/emerging?hours=${hours}${fluxParam(flux, '&')}`
      : type === 'stories'
        ? `/api/radar/stories?hours=${hours}${fluxParam(flux, '&')}`
        : type === 'alerts'
          ? `/api/radar/alerts${fluxParam(flux)}`
          : `/api/radar/sentiment?days=${Math.min(Math.max(days, 2), 90)}${fluxParam(flux, '&')}`
  const { data, error } = useFetch<{ topics?: Emerging[]; stories?: Story[]; alerts?: SmartAlert[] } & Partial<Barometer>>(url)
  if (!data) return <LoadState error={error} />
  if (type === 'mood')
    return (
      <div className="radar-baro__gauge radar-widget">
        <Gauge value={data.sentiment ?? 0} />
        <strong className={netClass(data.sentiment ?? 0)} dir="ltr">
          {signed(data.sentiment ?? 0, i.num)}
        </strong>
        <span>{r.netLabel}</span>
        <ul className="radar-baro__totals">
          {TONES.map((t) => (
            <li key={t}>
              <i style={{ background: TONE_COLORS[t] }} aria-hidden />
              {x.tones[t]} <b>{i.num(data[t] ?? 0)}</b>
            </li>
          ))}
        </ul>
      </div>
    )
  if (type === 'alerts') {
    const alerts = data.alerts ?? []
    if (!alerts.length) return <p className="news-status">{r.alertsEmpty}</p>
    return (
      <ul className="radar-alerts radar-widget">
        {alerts.slice(0, 8).map((a) => (
          <li key={a.id}>
            <button type="button" className={`radar-alert radar-alert--${a.level}`} onClick={() => drill({ ...(a.filter as Partial<Filters>), days: '1' })}>
              <span className="radar-alert__top">
                <b>{r.levels[a.level]}</b>
                <small>{r.kinds[a.kind]}</small>
              </span>
              <strong dir="auto">{a.kind === 'spike' && a.detail.dim === 'categories' ? i.category(a.label) : a.label}</strong>
            </button>
          </li>
        ))}
      </ul>
    )
  }
  if (type === 'stories') {
    const stories = data.stories ?? []
    if (!stories.length) return <p className="news-status">{r.storiesEmpty}</p>
    return (
      <ul className="radar-mini radar-widget">
        {stories.slice(0, 8).map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => drill({ q: s.query.join(' '), days: String(Math.ceil(hours / 24)) })}>
              <b>{i.num(s.sources.length)}</b>
              <span dir="auto">{s.title}</span>
            </button>
          </li>
        ))}
      </ul>
    )
  }
  const topics = data.topics ?? []
  if (!topics.length) return <p className="news-status">{r.emergingEmpty}</p>
  return (
    <ul className="radar-mini radar-widget">
      {topics.slice(0, 10).map((t) => (
        <li key={t.key}>
          <button
            type="button"
            onClick={() => drill({ ...(t.kind === 'entity' ? { entity: t.label } : { q: t.kind === 'phrase' ? `"${t.label}"` : t.label }), days: String(Math.ceil(hours / 24)) })}
          >
            <b>{t.isNew ? '▲' : r.growth(i.num(t.growth))}</b>
            <span dir="auto">{t.label}</span>
            <small>{r.mentions(i.num(t.recent), i.num(t.sources))}</small>
          </button>
        </li>
      ))}
    </ul>
  )
}
