import { useContext, useState } from 'react'
import { BuzzBars, NewsDigest } from './Dashboard'
import { type Count, type Filters, type Stats, type Tone, DrillContext, TONES, useFetch } from '../lib/news'
import { TONE_COLORS, useIntel } from '../lib/intel'
import { useI18n } from '../lib/i18n'
import { useCountUp } from '../lib/motion'
import { BUILDER_TEXT, type Dim, type WidgetConf } from '../lib/dashboards'
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
  const b = BUILDER_TEXT[i.lang]
  return (name: string) =>
    name === '__other'
      ? b.other
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

export function Line({ perDay }: { perDay: { date: string; count: number }[] }) {
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
        {active ? `${i.day(active.date)} : ${i.num(active.count)}` : `${BUILDER_TEXT[i.lang].perDay} · max ${i.num(max)}`}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={BUILDER_TEXT[i.lang].perDay}
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
        ? stats.sourcesCount
        : metric === 'average'
          ? Math.round((stats.total / stats.days) * 10) / 10
          : stats.total
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
  if (dim === 'tones') return TONES.map((t) => stats.tones?.find((r) => r.name === t)).filter((r): r is Count => Boolean(r))
  if (dim === 'people' || dim === 'orgs' || dim === 'places') return stats[dim] ?? []
  return dim === 'channels' ? stats.channels : dim === 'categories' ? stats.categories : dim === 'flux' ? stats.flux : stats.sources
}

/** Tonalité jour par jour en colonnes empilées : vert positif, gris neutre, rouge négatif */
function ToneTrend({ days, onPick }: { days: NonNullable<Stats['toneDays']>; onPick?: (tone: string) => void }) {
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
  const { data, error } = useFetch<Stats>(`/api/news/stats?days=${conf.days}${conf.flux ? `&flux=${conf.flux}` : ''}`)
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
  if (conf.type === 'news') return <NewsDigest flux={conf.flux} days={conf.days} category={conf.category} />
  return <StatsBody conf={conf} />
}

/** Titre par défaut : « Mosaïque FM / 7 derniers jours » et « Canaux / camembert » */
export function useWidgetTitles(conf: WidgetConf) {
  const i = useI18n()
  const b = BUILDER_TEXT[i.lang]
  const path = `MMS / ${conf.flux ? i.flux(conf.flux) : i.t.allSources} / ${b.days(conf.days)}`
  const auto =
    conf.type === 'news'
      ? conf.category
        ? `${i.t.digest} / ${i.category(conf.category)}`
        : i.t.digest
      : conf.type === 'line'
        ? b.perDay
        : conf.type === 'tone' || conf.type === 'emerging' || conf.type === 'stories' || conf.type === 'alerts' || conf.type === 'mood'
          ? b.types[conf.type]
          : conf.type === 'kpi'
            ? b.metrics[conf.metric]
            : `${b.dims[conf.dim]} / ${b.types[conf.type]}`
  return { path, title: conf.title.trim() || auto }
}
