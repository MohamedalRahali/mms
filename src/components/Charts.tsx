import { useContext, useEffect, useRef, useState } from 'react'
import { shortDay, useHistory } from '../lib/history'
import { BuzzBars, NewsDigest } from './Dashboard'
import { NewsCard } from './NewsCard'
import { useMedia } from '../lib/media'
import { countryName, flagOf } from '../lib/listing'
import { type Count, type Filters, type NewsResponse, type Stats, type Tone, DrillContext, TONES, useFetch } from '../lib/news'
import { TONE_COLORS, useIntel } from '../lib/intel'
import { useI18n } from '../lib/i18n'
import { useCountUp } from '../lib/motion'
import { BUILDER_TEXT, type Dim, type Step, type WidgetConf } from '../lib/dashboards'
import { RadarWidget } from './Radar'
import { hasModule, useAuth } from '../lib/auth'

/** Rendu de chaque type de widget : listes, barres, colonnes, camembert, courbe, chiffre clé, tableau, nuage */

// Palette catégorielle de référence, dans l'ordre fixe ; le gris sert pour « autres »
const SERIES = ['#2fcb81', '#6ea7fd', '#e5b841', '#ff7a59', '#8ee5b8', '#b39ddb', '#f4a3c0', '#1d7a4e']
const OTHER = '#8a9e93'
const CATEGORY_SLOT: Record<string, number> = { politique: 0, économie: 1, société: 2, international: 3, sécurité: 4, sport: 5, culture: 6, santé: 7 }
const FLUX_COLORS: Record<string, string> = { mosaique: '#2fcb81', libye: '#e5b841' }

/** Couleur propre à chaque canal, comme les barres « Channels / Buzz » de NewsBoard */
export const CHANNEL_COLORS: Record<string, string> = {
  site: '#a6cfe6',
  x: '#000000',
  youtube: '#e62117',
  bluesky: '#1185fe',
  facebook: '#1877f2',
  instagram: '#c13584',
  linkedin: '#0a66c2',
  tiktok: '#25c2c8',
  telegram: '#29a9eb',
  radio: '#2fcb81',
  tv: '#7b5ea7',
  presse: '#b8862b',
}

/** La couleur suit l'entité (canal, thème, veille), jamais son rang ; seules les sources n'ont pas de couleur attitrée */
export function colorFor(dim: Dim, name: string, rank: number) {
  if (name === '__other') return OTHER
  if (dim === 'channels') return CHANNEL_COLORS[name] ?? OTHER
  if (dim === 'flux') return FLUX_COLORS[name] ?? OTHER
  if (dim === 'categories') return name in CATEGORY_SLOT ? SERIES[CATEGORY_SLOT[name]] : OTHER
  if (dim === 'tones') return TONE_COLORS[name as Tone] ?? OTHER
  return SERIES[rank] ?? OTHER
}

// Filtre de la liste d'actualités ouvert par un clic sur chaque dimension ; « الرصد » reste le choix de la barre noire
const DRILL_KEY: Partial<Record<Dim, keyof Filters>> = {
  channels: 'channel',
  categories: 'category',
  sources: 'source',
  tones: 'tone',
  people: 'entity',
  orgs: 'entity',
  places: 'entity',
  languages: 'lang',
  media: 'media',
  countries: 'country',
  regions: 'region',
}

/** Clic sur une part, une barre ou un mot : la liste des actualités correspondantes, sur la période du widget */
function useDrill(dim: Dim, days: number) {
  const drill = useContext(DrillContext)
  const key = DRILL_KEY[dim]
  if (!key) return undefined
  return (name: string) => {
    if (name !== '__other') drill({ [key]: name, days: String(days) })
  }
}

function useLabel(dim: Dim) {
  const i = useI18n()
  const x = useIntel()
  const m = useMedia()
  const b = BUILDER_TEXT[i.lang]
  return (name: string) =>
    name === '__other'
      ? b.other
      : dim === 'languages'
        ? i.language(name)
        : dim === 'media'
          ? (m.types[name as keyof typeof m.types] ?? name)
          : dim === 'countries'
            ? `${flagOf(name)} ${countryName(name, i.lang)}`
            : dim === 'regions'
              ? (REGION_TEXT[i.lang][name] ?? name)
      : dim === 'channels'
        ? i.channel(name)
        : dim === 'categories'
          ? i.category(name)
          : dim === 'flux'
            ? i.flux(name)
            : dim === 'tones'
              ? (x.tones[name as Tone] ?? name)
              : name
}

/** Au-delà de « keep » parts, le reste est regroupé dans « autres » */
function fold(rows: Count[], keep: number): Count[] {
  if (rows.length <= keep) return rows
  const rest = rows.slice(keep - 1).reduce((n, r) => n + r.count, 0)
  return [...rows.slice(0, keep - 1), { name: '__other', count: rest }]
}

function Columns({ rows, dim, onPick }: { rows: Count[]; dim: Dim; onPick?: (name: string) => void }) {
  const i = useI18n()
  const label = useLabel(dim)
  const [hover, setHover] = useState<number | null>(null)
  const shown = fold(rows, 10)
  const max = Math.max(...shown.map((r) => r.count), 1)
  const active = hover !== null ? shown[hover] : null
  return (
    <div className="mms-cols">
      <p className="mms-chart__readout">{active ? `${label(active.name)} : ${i.num(active.count)}` : ' '}</p>
      <div className="mms-cols__plot" onMouseLeave={() => setHover(null)}>
        {shown.map((r, k) => (
          <button
            key={r.name}
            type="button"
            className="mms-cols__col"
            onMouseEnter={() => setHover(k)}
            onFocus={() => setHover(k)}
            onClick={() => onPick?.(r.name)}
            style={{ cursor: onPick && r.name !== '__other' ? 'pointer' : undefined }}
            aria-label={`${label(r.name)}: ${r.count}`}
          >
            <span style={{ height: `${(r.count / max) * 100}%`, background: colorFor(dim, r.name, k), opacity: hover === null || hover === k ? 1 : 0.45 }} />
          </button>
        ))}
      </div>
      <div className="mms-cols__labels">
        {shown.map((r) => (
          <span key={r.name} dir="auto" title={label(r.name)}>
            {label(r.name)}
          </span>
        ))}
      </div>
    </div>
  )
}

export function Donut({ rows, dim, onPick }: { rows: Count[]; dim: Dim; onPick?: (name: string) => void }) {
  const i = useI18n()
  const label = useLabel(dim)
  const [hover, setHover] = useState<number | null>(null)
  const shown = fold(rows, 7)
  const total = shown.reduce((n, r) => n + r.count, 0) || 1
  let angle = -Math.PI / 2
  const arcs = shown.map((r, k) => {
    const a0 = angle
    const a1 = angle + (r.count / total) * Math.PI * 2
    angle = a1
    const big = a1 - a0 > Math.PI ? 1 : 0
    const p = (a: number, rad: number) => `${50 + rad * Math.cos(a)} ${50 + rad * Math.sin(a)}`
    const full = shown.length === 1
    const d = full
      ? 'M50 8a42 42 0 1 1 0 84a42 42 0 1 1 0-84zM50 26a24 24 0 1 0 0 48a24 24 0 1 0 0-48z'
      : `M${p(a0, 42)}A42 42 0 ${big} 1 ${p(a1, 42)}L${p(a1, 24)}A24 24 0 ${big} 0 ${p(a0, 24)}Z`
    return { r, k, d }
  })
  const active = hover !== null ? shown[hover] : null
  return (
    <div className="mms-donut">
      <svg viewBox="0 0 100 100" role="img" aria-label={shown.map((r) => `${label(r.name)} ${r.count}`).join(', ')} onMouseLeave={() => setHover(null)}>
        {arcs.map(({ r, k, d }) => (
          <path
            key={r.name}
            d={d}
            fill={colorFor(dim, r.name, k)}
            stroke="#fff"
            strokeWidth="1"
            fillRule="evenodd"
            opacity={hover === null || hover === k ? 1 : 0.45}
            onMouseEnter={() => setHover(k)}
            onClick={() => onPick?.(r.name)}
            style={{ cursor: onPick && r.name !== '__other' ? 'pointer' : undefined }}
          />
        ))}
        <text x="50" y="49" textAnchor="middle" className="mms-donut__value">
          {i.num(active ? active.count : total)}
        </text>
        <text x="50" y="60" textAnchor="middle" className="mms-donut__label">
          {active ? `${Math.round((active.count / total) * 100)}%` : ''}
        </text>
      </svg>
      <ul className="mms-legend">
        {shown.map((r, k) => (
          <li
            key={r.name}
            onMouseEnter={() => setHover(k)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onPick?.(r.name)}
            className={onPick && r.name !== '__other' ? 'is-link' : undefined}
          >
            <i style={{ background: colorFor(dim, r.name, k) }} />
            <span dir="auto">{label(r.name)}</span>
            <b>{i.num(r.count)}</b>
            <small>{Math.round((r.count / total) * 100)}%</small>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Line({ perDay, label }: { perDay: { date: string; count: number }[]; label?: string }) {
  const i = useI18n()
  const [hover, setHover] = useState<number | null>(null)
  const W = 600
  const H = 200
  const max = Math.max(...perDay.map((d) => d.count), 1)
  const n = Math.max(perDay.length - 1, 1)
  const pt = (k: number, v: number) => [(k / n) * W, H - (v / max) * (H - 12) - 2]
  const line = perDay.map((d, k) => pt(k, d.count).join(',')).join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  const active = hover !== null ? perDay[hover] : null
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const k = Math.round(((e.clientX - box.left) / box.width) * n)
    setHover(Math.min(Math.max(k, 0), perDay.length - 1))
  }
  return (
    <div className="mms-line" dir="ltr">
      <p className="mms-chart__readout" dir={i.dir}>
        {active ? `${i.day(active.date)} : ${i.num(active.count)}` : `${label ?? BUILDER_TEXT[i.lang].perDay} · max ${i.num(max)}`}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={label ?? BUILDER_TEXT[i.lang].perDay}
      >
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="mms-line__base" />
        <polygon points={area} className="mms-line__area" />
        <polyline points={line} className="mms-line__stroke" vectorEffect="non-scaling-stroke" />
        {active && hover !== null && (
          <>
            <line x1={pt(hover, 0)[0]} x2={pt(hover, 0)[0]} y1="0" y2={H} className="mms-line__cross" vectorEffect="non-scaling-stroke" />
            <circle cx={pt(hover, active.count)[0]} cy={pt(hover, active.count)[1]} r="5" className="mms-line__dot" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {perDay.length > 0 && (
        <div className="news-daily__axis">
          <span>{i.day(perDay[0].date)}</span>
          <span>{i.day(perDay[perDay.length - 1].date)}</span>
        </div>
      )}
    </div>
  )
}

function Table({ rows, dim, onPick }: { rows: Count[]; dim: Dim; onPick?: (name: string) => void }) {
  const i = useI18n()
  const label = useLabel(dim)
  const b = BUILDER_TEXT[i.lang]
  return (
    <table className="mms-table">
      <thead>
        <tr>
          <th>{b.dims[dim]}</th>
          <th>{i.t.count}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} onClick={() => onPick?.(r.name)} className={onPick ? 'is-link' : undefined}>
            <td dir="auto">{label(r.name)}</td>
            <td>{i.num(r.count)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Cloud({ rows, dim, onPick }: { rows: Count[]; dim: Dim; onPick?: (name: string) => void }) {
  const i = useI18n()
  const label = useLabel(dim)
  const max = Math.max(...rows.map((r) => r.count), 1)
  const min = Math.min(...rows.map((r) => r.count), max)
  return (
    <p className="mms-cloud">
      {rows.map((r) => {
        const k = max === min ? 1 : (r.count - min) / (max - min)
        return (
          <span
            key={r.name}
            dir="auto"
            title={`${label(r.name)}: ${i.num(r.count)}`}
            onClick={() => onPick?.(r.name)}
            className={onPick ? 'is-link' : undefined}
            style={{ fontSize: `${0.9 + k * 1.6}rem`, fontWeight: k > 0.5 ? 800 : 600, opacity: 0.6 + k * 0.4 }}
          >
            {label(r.name)}
          </span>
        )
      })}
    </p>
  )
}

function Kpi({ stats, metric }: { stats: Stats; metric: WidgetConf['metric'] }) {
  const i = useI18n()
  const b = BUILDER_TEXT[i.lang]
  const value =
    metric === 'broadcasts'
      ? stats.broadcasts
      : metric === 'sources'
        ? (stats.mediaSources ?? stats.sourcesCount)
        : metric === 'average'
          ? Math.round(((stats.unique ?? stats.total) / stats.days) * 10) / 10
          : (stats.unique ?? stats.total)
  const counted = useCountUp(Math.round(value * 10)) / 10
  const spark = stats.perDay.map((d) => d.count)
  const max = Math.max(...spark, 1)
  return (
    <div className="mms-kpi">
      <strong>{i.num(counted)}</strong>
      <span>{b.metrics[metric]}</span>
      {spark.length > 1 && (
        <svg viewBox={`0 0 ${spark.length - 1} 20`} preserveAspectRatio="none" aria-hidden>
          <polyline points={spark.map((v, k) => `${k},${20 - (v / max) * 18 - 1}`).join(' ')} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  )
}

function rowsOf(stats: Stats, dim: Dim): Count[] {
  return rawRows(stats, dim).filter((r) => r.count > 0)
}

function rawRows(stats: Stats, dim: Dim): Count[] {
  if (dim === 'tones') return TONES.map((t) => stats.tones?.find((r) => r.name === t)).filter((r): r is Count => Boolean(r))
  if (dim === 'people' || dim === 'orgs' || dim === 'places' || dim === 'languages' || dim === 'media' || dim === 'countries' || dim === 'regions') return stats[dim] ?? []
  return dim === 'channels' ? stats.channels : dim === 'categories' ? stats.categories : dim === 'flux' ? stats.flux : stats.sources
}

/** Tonalité jour par jour en colonnes empilées : vert positif, gris neutre, rouge négatif */
export function ToneTrend({ days, onPick }: { days: NonNullable<Stats['toneDays']>; onPick?: (tone: string) => void }) {
  const i = useI18n()
  const x = useIntel()
  const [hover, setHover] = useState<number | null>(null)
  const totals = days.map((d) => d.positive + d.neutral + d.negative)
  const max = Math.max(...totals, 1)
  const active = hover !== null ? days[hover] : null
  if (totals.every((n) => n === 0)) return <p className="news-status">{i.t.noData}</p>
  return (
    <div className="mms-tone">
      <p className="mms-chart__readout">
        {active ? `${i.day(active.date)} : ${TONES.map((t) => `${x.tones[t]} ${i.num(active[t])}`).join(' · ')}` : `${x.toneTrend}`}
      </p>
      <div className="mms-tone__plot" dir="ltr" onMouseLeave={() => setHover(null)}>
        {days.map((d, k) => (
          <span key={d.date} className="mms-tone__day" onMouseEnter={() => setHover(k)} style={{ opacity: hover === null || hover === k ? 1 : 0.5 }}>
            {TONES.map((t) => (
              <i key={t} style={{ height: `${(d[t] / max) * 100}%`, background: TONE_COLORS[t] }} />
            ))}
          </span>
        ))}
      </div>
      {days.length > 0 && (
        <div className="news-daily__axis" dir="ltr">
          <span>{i.day(days[0].date)}</span>
          <span>{i.day(days[days.length - 1].date)}</span>
        </div>
      )}
      <ul className="mms-legend mms-legend--row">
        {TONES.map((t) => (
          <li key={t} onClick={() => onPick?.(t)} className={onPick ? 'is-link' : undefined}>
            <i style={{ background: TONE_COLORS[t] }} />
            <span>{x.tones[t]}</span>
            <b>{i.num(days.reduce((n, d) => n + d[t], 0))}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatsBody({ conf }: { conf: WidgetConf }) {
  const i = useI18n()
  const { data, error } = useFetch<Stats>(`/api/news/stats?${widgetParams(conf)}`)
  const label = useLabel(conf.dim)
  const pick = useDrill(conf.dim, conf.days)
  const pickTone = useDrill('tones', conf.days)
  if (error) return <p className="news-status news-status--error">{i.t.loadError}</p>
  if (!data) return <p className="news-status">{i.t.loading}</p>
  const rows = rowsOf(data, conf.dim)
  if (conf.type === 'line') return <Line perDay={data.perDay} />
  if (conf.type === 'kpi') return <Kpi stats={data} metric={conf.metric} />
  if (conf.type === 'tone') return <ToneTrend days={data.toneDays ?? []} onPick={pickTone} />
  if (rows.length === 0) return <p className="news-status">{i.t.noData}</p>
  if (conf.type === 'bars') return <BuzzBars rows={rows} label={label} color={(name, k) => colorFor(conf.dim, name, k)} onPick={pick} />
  if (conf.type === 'columns') return <Columns rows={rows} dim={conf.dim} onPick={pick} />
  if (conf.type === 'pie') return <Donut rows={rows} dim={conf.dim} onPick={pick} />
  if (conf.type === 'table') return <Table rows={rows} dim={conf.dim} onPick={pick} />
  if (conf.type === 'treemap') return <Treemap rows={rows} dim={conf.dim} onPick={pick} />
  return <Cloud rows={rows} dim={conf.dim} onPick={pick} />
}

export function WidgetBody({ conf }: { conf: WidgetConf }) {
  const auth = useAuth()
  const { lang } = useI18n()
  if (conf.type === 'emerging' || conf.type === 'stories' || conf.type === 'alerts' || conf.type === 'mood')
    // Widgets du radar : seulement si le module « الرادار الذكي » est ouvert au profil (le serveur refuse sinon)
    return hasModule(auth?.user, 'radar') ? (
      <RadarWidget type={conf.type} flux={conf.flux} days={conf.days} />
    ) : (
      <p className="news-status">{lang === 'ar' ? 'هذه الأداة غير متاحة في ملف صلاحياتك.' : 'Not available for your profile.'}</p>
    )
  if (conf.type === 'news') return <NewsDigest flux={conf.flux} days={conf.days} category={conf.category} extra={{ w: conf.id, q: conf.q?.trim() ?? '', watch: conf.watch ?? '' }} />
  if (conf.type === 'timeline') return <TimelineWidget conf={conf} />
  if (conf.type === 'feed') return <FeedWidget conf={conf} />
  if (conf.type === 'text') return <TextWidget conf={conf} />
  return <StatsBody conf={conf} />
}

/** Titre par défaut : « Mosaïque FM / 7 derniers jours » et « Canaux / camembert » */
export function useWidgetTitles(conf: WidgetConf) {
  const i = useI18n()
  const b = BUILDER_TEXT[i.lang]
  const history = useHistory()
  const since = history?.since ? ` · ${i.lang === 'ar' ? 'منذ' : 'since'} ${shortDay(history.since)}` : ''
  const scope = conf.q?.trim() ? ` / « ${conf.q.trim()} »` : ''
  const path = conf.type === 'text' ? 'MMS' : `MMS / ${conf.flux ? i.flux(conf.flux) : i.t.allSources}${scope} / ${b.days(conf.days)}${since}`
  const auto =
    conf.type === 'news'
      ? conf.category
        ? `${i.t.digest} / ${i.category(conf.category)}`
        : i.t.digest
      : conf.type === 'timeline'
        ? `${b.types.timeline} / ${b.steps[conf.step ?? 'day']}${conf.split ? ` / ${b.splits[conf.split]}` : ''}`
        : conf.type === 'feed'
          ? `${b.types.feed}${conf.channel ? ` / ${i.channel(conf.channel)}` : ''}`
          : conf.type === 'text'
            ? b.types.text
      : conf.type === 'line'
        ? b.perDay
        : conf.type === 'tone' || conf.type === 'emerging' || conf.type === 'stories' || conf.type === 'alerts' || conf.type === 'mood'
          ? b.types[conf.type]
          : conf.type === 'kpi'
            ? b.metrics[conf.metric]
            : `${b.dims[conf.dim]} / ${b.types[conf.type]}`
  return { path, title: conf.title.trim() || auto }
}

/** Paramètres communs d'un widget : période, flux, recherche enregistrée, mots-clés ; w désigne le widget sur un lien public */
function widgetParams(conf: WidgetConf, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ days: String(conf.days), w: conf.id })
  if (conf.flux) p.set('flux', conf.flux)
  if (conf.q?.trim()) p.set('q', conf.q.trim())
  if (conf.watch) p.set('watch', conf.watch)
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v)
  return p.toString()
}

type Timeline = { step: Step; days: number; buckets: string[]; series: { key: string; values: number[]; total: number }[] }

const REGION_TEXT = { ar: { west: 'الغرب', east: 'الشرق', south: 'الجنوب' }, en: { west: 'West', east: 'East', south: 'South' } } as Record<string, Record<string, string>>

/** Libellé d'un pas de temps : jour et semaine en date courte, heure avec l'heure, mois, trimestre et année tels quels */
function bucketLabel(b: string, step: Step, day: (d: string) => string) {
  if (step === 'hour') return `${day(b.slice(0, 10))} ${b.slice(11, 13)}:00`
  if (step === 'day' || step === 'week') return day(b)
  return b
}

/** Courbe dans le temps : une série ou plusieurs (canal, tonalité, média, thème, veilles comparées) */
function TimelineWidget({ conf }: { conf: WidgetConf }) {
  const i = useI18n()
  const x = useIntel()
  const m = useMedia()
  const b = BUILDER_TEXT[i.lang]
  const split = conf.split ?? ''
  const extra = { step: conf.step ?? 'day', split, compare: split === 'compare' ? (conf.compare ?? []).join(',') : '' }
  const { data, error } = useFetch<Timeline>(`/api/news/timeline?${widgetParams(conf, extra)}`)
  const [hover, setHover] = useState<number | null>(null)
  const [hidden, setHidden] = useState<string[]>([])
  // Nombre de dates lisibles sous la courbe selon la largeur réelle du widget
  const axis = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const el = axis.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [data])
  if (error) return <p className="news-status news-status--error">{i.t.loadError}</p>
  if (!data) return <p className="news-status">{i.t.loading}</p>
  if (data.series.every((s) => s.total === 0)) return <p className="news-status">{i.t.noData}</p>
  const style = conf.style ?? 'area'
  const label = (key: string) =>
    key === 'total' ? b.total : key === 'other' ? b.other : split === 'channel' ? i.channel(key) : split === 'tone' ? (x.tones[key as Tone] ?? key) : split === 'category' ? i.category(key) : split === 'media' ? (m.types[key as keyof typeof m.types] ?? key) : key
  const color = (key: string, k: number) =>
    key === 'other' ? OTHER : split === 'channel' ? (CHANNEL_COLORS[key] ?? SERIES[k]) : split === 'tone' ? (TONE_COLORS[key as Tone] ?? SERIES[k]) : split === 'category' ? colorFor('categories', key, k) : SERIES[k % SERIES.length]
  const shown = data.series.map((s, k) => ({ ...s, color: color(s.key, k) })).filter((s) => !hidden.includes(s.key))
  const n = data.buckets.length
  const W = 600
  const H = 200
  const stacked = style === 'stacked' || style === 'bars'
  // Bases cumulées pour l'empilement
  const base = shown.map(() => new Array(n).fill(0))
  if (stacked) for (let s = 1; s < shown.length; s++) for (let k = 0; k < n; k++) base[s][k] = base[s - 1][k] + shown[s - 1].values[k]
  const top = (s: number, k: number) => (stacked ? base[s][k] : 0) + shown[s].values[k]
  // Échelle arrondie (1, 2, 5 × 10^n) pour des repères de valeurs lisibles
  const peak = Math.max(1, ...shown.flatMap((_, s) => data.buckets.map((__, k) => top(s, k))))
  const raw = peak / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const stepV = Math.max(1, [1, 2, 5, 10].map((f) => f * mag).find((v) => v >= raw) ?? 10 * mag)
  const max = stepV * Math.ceil(peak / stepV)
  const yTicks = Array.from({ length: Math.round(max / stepV) + 1 }, (_, k) => k * stepV)
  const X = (k: number) => (n === 1 ? W / 2 : (k / (n - 1)) * W)
  const Y = (v: number) => H - (v / max) * (H - 8)
  const slot = W / n
  const tick = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(width / 95))))
  const current = data.step === 'day' ? b.inProgressDay : b.inProgress
  const readout = `${b.steps[data.step]} · ${b.total} ${i.num(shown.reduce((t, s) => t + s.total, 0))}`
  const xPct = (k: number) => (style === 'bars' ? ((k + 0.5) / n) * 100 : n === 1 ? 50 : (k / (n - 1)) * 100)
  return (
    <div className="mms-tl">
      <p className="mms-chart__readout" dir="auto">
        {readout}
      </p>
      <div className="mms-tl__wrap" dir="ltr">
      <svg
        className="mms-tl__plot"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={readout}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const f = (e.clientX - r.left) / r.width
          const k = style === 'bars' ? Math.floor(f * n) : Math.round(f * (n - 1))
          setHover(Math.min(Math.max(k, 0), n - 1))
        }}
      >
        {yTicks.slice(1).map((v) => (
          <line key={v} x1="0" x2={W} y1={Y(v)} y2={Y(v)} className="mms-tl__grid" />
        ))}
        {n > 1 && <rect x={style === 'bars' ? (n - 1) * slot : X(n - 2)} width={style === 'bars' ? slot : X(n - 1) - X(n - 2)} y="0" height={H} className="mms-tl__current" />}
        {style === 'bars'
          ? shown.map((s, si) =>
              s.values.map((v, k) =>
                v ? <rect key={`${s.key}-${k}`} x={k * slot + slot * 0.15} width={slot * 0.7} y={Y(top(si, k))} height={Y(base[si][k]) - Y(top(si, k))} fill={s.color} opacity={(hover === null || hover === k ? 1 : 0.5) * (k === n - 1 ? 0.55 : 1)} /> : null,
              ),
            )
          : shown.map((s, si) => {
              const pts = s.values.map((_, k) => `${X(k)},${Y(top(si, k))}`)
              const line = pts.join(' ')
              const floor = s.values.map((_, k) => `${X(n - 1 - k)},${Y(stacked ? base[si][n - 1 - k] : 0)}`).join(' ')
              return (
                <g key={s.key}>
                  {style !== 'line' && <polygon points={`${line} ${floor}`} fill={s.color} opacity={stacked ? 0.75 : 0.22} />}
                  {/* Le dernier pas (jour, semaine… en cours) est en pointillé : il n'est pas encore complet */}
                  <polyline points={(n > 1 ? pts.slice(0, -1) : pts).join(' ')} fill="none" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  {n > 1 && <polyline points={pts.slice(-2).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
                </g>
              )
            })}
        {hover !== null && style !== 'bars' && <line x1={X(hover)} x2={X(hover)} y1="0" y2={H} className="mms-tl__cursor" />}
      </svg>
      {yTicks.slice(1).map((v) => (
        <span key={v} className="mms-tl__yval" style={{ top: `${(Y(v) / H) * 100}%` }}>
          {i.num(v)}
        </span>
      ))}
      {hover !== null && (
        <div
          className="mms-tl__tip"
          role="status"
          style={{ left: `${xPct(hover)}%`, transform: `translateX(${xPct(hover) > 65 ? '-100%' : xPct(hover) < 35 ? '0' : '-50%'})` }}
          dir={i.dir}
        >
          <b>
            {bucketLabel(data.buckets[hover], data.step, i.day)}
            {hover === n - 1 && <em> · {current}</em>}
          </b>
          {shown.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} />
              <span dir="auto">{label(s.key)}</span> <strong>{i.num(s.values[hover])}</strong>
            </span>
          ))}
        </div>
      )}
      </div>
      <div className="mms-tl__axis" dir="ltr" ref={axis}>
        {data.buckets.map((bk, k) => (
          <span key={bk} style={{ insetInlineStart: `${style === 'bars' ? (k + 0.5) * (100 / n) : n === 1 ? 50 : (k / (n - 1)) * 100}%` }}>
            {k % tick === 0 ? bucketLabel(bk, data.step, i.day) : ''}
          </span>
        ))}
      </div>
      {n > 1 && (
        <p className="mms-tl__note">
          <i aria-hidden /> {current} — {i.lang === 'ar' ? 'لم تكتمل بعد' : 'not complete yet'}
        </p>
      )}
      {(data.series.length > 1 || hidden.length > 0) && (
        <ul className="mms-tl__legend">
          {data.series.map((s, k) => (
            <li key={s.key}>
              <button type="button" aria-pressed={!hidden.includes(s.key)} onClick={() => setHidden((h) => (h.includes(s.key) ? h.filter((v) => v !== s.key) : [...h, s.key]))}>
                <i style={{ background: color(s.key, k) }} />
                <span dir="auto">{label(s.key)}</span> <b>{i.num(s.total)}</b>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Mosaïque de rectangles proportionnels (découpe en deux moitiés de poids voisins, dans le sens le plus long) */
function layoutTree(rows: Count[], x: number, y: number, w: number, h: number, out: { r: Count; k: number; x: number; y: number; w: number; h: number }[], offset = 0) {
  if (!rows.length) return out
  if (rows.length === 1) {
    out.push({ r: rows[0], k: offset, x, y, w, h })
    return out
  }
  const total = rows.reduce((t, r) => t + r.count, 0) || 1
  let acc = 0
  let cut = 1
  for (let k = 0; k < rows.length - 1; k++) {
    acc += rows[k].count
    cut = k + 1
    if (acc >= total / 2) break
  }
  const left = rows.slice(0, cut)
  const share = left.reduce((t, r) => t + r.count, 0) / total
  if (w >= h) {
    layoutTree(left, x, y, w * share, h, out, offset)
    layoutTree(rows.slice(cut), x + w * share, y, w * (1 - share), h, out, offset + cut)
  } else {
    layoutTree(left, x, y, w, h * share, out, offset)
    layoutTree(rows.slice(cut), x, y + h * share, w, h * (1 - share), out, offset + cut)
  }
  return out
}

/** Texte foncé sur couleur claire, blanc sur couleur sombre */
function inkOn(hex: string) {
  const v = /^#([0-9a-f]{6})$/i.exec(hex)?.[1]
  if (!v) return '#06170f'
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(v.slice(k, k + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#06170f' : '#ffffff'
}

function Treemap({ rows, dim, onPick }: { rows: Count[]; dim: Dim; onPick?: (name: string) => void }) {
  const i = useI18n()
  const label = useLabel(dim)
  const [hover, setHover] = useState<string | null>(null)
  const shown = fold(rows, 12)
  const total = shown.reduce((t, r) => t + r.count, 0) || 1
  const cells = layoutTree(shown, 0, 0, 100, 100, [])
  const active = shown.find((r) => r.name === hover)
  return (
    <div className="mms-tree">
      <p className="mms-chart__readout">{active ? `${label(active.name)} : ${i.num(active.count)} (${Math.round((active.count / total) * 100)}%)` : ' '}</p>
      <div className="mms-tree__plot" onMouseLeave={() => setHover(null)}>
        {cells.map(({ r, k, x, y, w, h }) => (
          <button
            key={r.name}
            type="button"
            className="mms-tree__cell"
            style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, background: colorFor(dim, r.name, k), color: inkOn(colorFor(dim, r.name, k)), opacity: hover === null || hover === r.name ? 1 : 0.55, cursor: onPick && r.name !== '__other' ? 'pointer' : 'default' }}
            onMouseEnter={() => setHover(r.name)}
            onFocus={() => setHover(r.name)}
            onClick={() => onPick?.(r.name)}
            aria-label={`${label(r.name)}: ${r.count}`}
          >
            {w * h > 90 && (
              <span dir="auto">
                {label(r.name)} <b>{i.num(r.count)}</b>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Fil d'actualités d'un canal ou d'une recherche enregistrée, qui peut défiler tout seul sur un écran mural */
function FeedWidget({ conf }: { conf: WidgetConf }) {
  const i = useI18n()
  const { data, error } = useFetch<NewsResponse>(`/api/news?${widgetParams(conf, { size: '20', channel: conf.channel ?? '' })}`)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el || document.documentElement.dataset.autoscroll !== '1') return
    const timer = window.setInterval(() => {
      const cell = el.closest('.mms-cell__body') ?? el
      if (cell.scrollTop + cell.clientHeight >= cell.scrollHeight - 2) cell.scrollTop = 0
      else cell.scrollTop += 1
    }, 60)
    return () => window.clearInterval(timer)
  }, [data])
  if (error) return <p className="news-status news-status--error">{i.t.loadError}</p>
  if (!data) return <p className="news-status">{i.t.loading}</p>
  if (data.items.length === 0) return <p className="news-status">{i.t.noNews}</p>
  return (
    <div className="mms-feed" ref={box}>
      {data.items.map((it) => (
        <NewsCard key={it.id} item={it} variant="compact" />
      ))}
    </div>
  )
}

/** Texte libre ou lien d'image, pour titrer une section ou afficher une consigne sur l'écran */
function TextWidget({ conf }: { conf: WidgetConf }) {
  const text = (conf.text ?? '').trim()
  const image = /^https:\/\/\S+\.(?:png|jpe?g|gif|webp|svg)(?:\?\S*)?$/i.test(text) ? text : ''
  if (image) return <img className="mms-textw__img" src={image} alt={conf.title} />
  return (
    <div className="mms-textw" dir="auto">
      {text.split(/\n{2,}/).map((p, k) => (
        <p key={k}>{p}</p>
      ))}
    </div>
  )
}
