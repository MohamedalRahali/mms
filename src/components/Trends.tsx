import { useContext, useState, type PointerEvent } from 'react'
import { type Coverage, basisNote, fairChange, formatChange } from '../lib/fair'
import { type Count, type Stats, type Tone, DrillContext, TONES } from '../lib/news'
import { TONE_COLORS, useIntel } from '../lib/intel'
import { useI18n } from '../lib/i18n'
import './trends.css'

/**
 * Tendances de la page « التحليل » : évolution par rapport à la période précédente, indice net du sentiment
 * jour par jour (courbe interactive), répartition des tonalités et entités les plus citées (clic → actualités).
 */

const TEXT = {
  ar: {
    vsPrev: 'مقارنة بالفترة السابقة',
    same: 'دون تغيير',
    mood: 'المزاج العام واتجاهه',
    moodIntro: 'مؤشر صافٍ من −100 (كل الأخبار سلبية) إلى +100 (كلها إيجابية)، يومًا بيوم. مرّر على المنحنى للتفاصيل.',
    index: 'المؤشر',
    trendUp: 'المزاج يتحسن',
    trendDown: 'المزاج يتراجع',
    trendFlat: 'المزاج مستقر',
    firstHalf: 'النصف الأول',
    secondHalf: 'النصف الثاني',
    noTone: 'لا توجد نبرة محددة للأخبار في هذه الفترة.',
    split: 'توزيع النبرة',
    entities: 'الأكثر ذكرًا',
    people: 'الشخصيات',
    orgs: 'المؤسسات',
    places: 'الأماكن',
    open: 'عرض الأخبار',
  },
  en: {
    vsPrev: 'vs previous period',
    same: 'no change',
    mood: 'Overall mood and trend',
    moodIntro: 'Net index from −100 (all negative) to +100 (all positive), day by day. Hover the curve for details.',
    index: 'Index',
    trendUp: 'Mood improving',
    trendDown: 'Mood worsening',
    trendFlat: 'Mood stable',
    firstHalf: 'First half',
    secondHalf: 'Second half',
    noTone: 'No tone recorded for news in this period.',
    split: 'Tone split',
    entities: 'Most mentioned',
    people: 'People',
    orgs: 'Organisations',
    places: 'Places',
    open: 'Show news',
  },
}
const useText = () => TEXT[useI18n().lang === 'ar' ? 'ar' : 'en']

/** Variation en % par rapport à la période précédente, avec flèche et couleur */
// cov : jours couverts des deux périodes ; la valeur précédente est ramenée aux mêmes jours (lib/fair.ts)
export function Delta({ now, before, cov }: { now: number; before: number | null; cov?: Coverage | null }) {
  const x = useText()
  const { num, lang } = useI18n()
  if (before == null) return null
  const pct = fairChange(now, before, cov)
  if (pct === null) return null
  if (pct === 'new') return <small className="tr-delta is-up">{lang === 'ar' ? 'جديد' : 'new'}</small>
  const cls = pct > 0 ? 'tr-delta is-up' : pct < 0 ? 'tr-delta is-down' : 'tr-delta'
  const note = basisNote(cov, lang)
  return (
    <small className={cls} title={`${num(before)} → ${num(now)}${note ? ` · ${note}` : ''}`}>
      {pct > 0 ? '▲' : pct < 0 ? '▼' : '='} {pct ? (pct > 100 ? formatChange(pct, lang).text : `${pct > 0 ? '+' : ''}${num(pct)}%`) : x.same} <span>{x.vsPrev}</span>
      {note && <span> · {note}</span>}
    </small>
  )
}

const netOf = (d: Record<Tone, number>) => {
  const n = d.positive + d.neutral + d.negative
  return n ? Math.round(((d.positive - d.negative) / n) * 100) : null
}

/** Indice net du sentiment, jour par jour : aire verte au-dessus de zéro, orange en dessous, curseur au survol */
function MoodCurve({ days }: { days: NonNullable<Stats['toneDays']> }) {
  const i = useI18n()
  const x = useText()
  const ix = useIntel()
  const drill = useContext(DrillContext)
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const H = 180
  const mid = H / 2
  const pts = days.map((d, k) => ({ d, k, v: netOf(d) }))
  const known = pts.filter((p) => p.v !== null) as { d: (typeof days)[number]; k: number; v: number }[]
  if (known.length < 2) return <p className="news-status">{x.noTone}</p>
  const n = Math.max(days.length - 1, 1)
  const X = (k: number) => (k / n) * W
  const Y = (v: number) => mid - (v / 100) * (mid - 10)
  const line = known.map((p) => `${X(p.k).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ')
  const area = `${X(known[0].k)},${mid} ${line} ${X(known[known.length - 1].k)},${mid}`
  // Tendance : moyenne de la seconde moitié contre la première
  const half = Math.floor(known.length / 2)
  const avg = (list: typeof known) => Math.round(list.reduce((s, p) => s + p.v, 0) / Math.max(list.length, 1))
  const a1 = avg(known.slice(0, half))
  const a2 = avg(known.slice(half))
  const trend = a2 - a1 >= 5 ? 'up' : a2 - a1 <= -5 ? 'down' : 'flat'
  const active = hover !== null ? pts[hover] : null
  function onMove(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    setHover(Math.min(Math.max(Math.round(((e.clientX - box.left) / box.width) * n), 0), days.length - 1))
  }
  return (
    <div className="tr-mood">
      <div className="tr-mood__head">
        <span className={`tr-mood__trend is-${trend}`}>
          {trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→'} {trend === 'up' ? x.trendUp : trend === 'down' ? x.trendDown : x.trendFlat}
        </span>
        <span className="tr-mood__halves">
          {x.firstHalf} <b dir="ltr">{a1 > 0 ? `+${a1}` : a1}</b> · {x.secondHalf} <b dir="ltr">{a2 > 0 ? `+${a2}` : a2}</b>
        </span>
      </div>
      <p className="mms-chart__readout" role="status">
        {active
          ? `${i.day(active.d.date)} : ${x.index} ${active.v === null ? '—' : active.v > 0 ? `+${active.v}` : active.v} · ${TONES.map((t) => `${ix.tones[t]} ${i.num(active.d[t])}`).join(' · ')}`
          : x.moodIntro}
      </p>
      <svg className="tr-mood__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" direction="ltr" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={x.mood}>
        <defs>
          <clipPath id="mood-up">
            <rect x="0" y="0" width={W} height={mid} />
          </clipPath>
          <clipPath id="mood-down">
            <rect x="0" y={mid} width={W} height={mid} />
          </clipPath>
        </defs>
        {[-50, 50].map((v) => (
          <line key={v} x1="0" x2={W} y1={Y(v)} y2={Y(v)} className="tr-mood__grid" vectorEffect="non-scaling-stroke" />
        ))}
        <polygon points={area} clipPath="url(#mood-up)" fill={TONE_COLORS.positive} opacity="0.28" />
        <polygon points={area} clipPath="url(#mood-down)" fill={TONE_COLORS.negative} opacity="0.28" />
        <line x1="0" x2={W} y1={mid} y2={mid} className="tr-mood__zero" vectorEffect="non-scaling-stroke" />
        <polyline points={line} className="tr-mood__line" vectorEffect="non-scaling-stroke" />
        {active && active.v !== null && (
          <>
            <line x1={X(active.k)} x2={X(active.k)} y1="0" y2={H} className="mms-line__cross" vectorEffect="non-scaling-stroke" />
            <circle cx={X(active.k)} cy={Y(active.v)} r="5" fill={active.v >= 0 ? TONE_COLORS.positive : TONE_COLORS.negative} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <div className="news-daily__axis" dir="ltr">
        <span>{i.day(days[0].date)}</span>
        <span className="tr-mood__scale">+100 / 0 / −100</span>
        <span>{i.day(days[days.length - 1].date)}</span>
      </div>
      <ul className="mms-legend mms-legend--row">
        {TONES.map((t) => (
          <li key={t} className="is-link" onClick={() => drill({ tone: t })} title={x.open}>
            <i style={{ background: TONE_COLORS[t] }} />
            <span>{ix.tones[t]}</span>
            <b>{i.num(days.reduce((s, d) => s + d[t], 0))}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Barre empilée des tonalités (part de chacune), cliquable */
function ToneSplit({ tones }: { tones: Count[] }) {
  const i = useI18n()
  const ix = useIntel()
  const drill = useContext(DrillContext)
  const total = tones.reduce((s, r) => s + r.count, 0)
  if (!total) return null
  return (
    <div className="tr-split" dir="ltr">
      {TONES.map((t) => {
        const c = tones.find((r) => r.name === t)?.count ?? 0
        if (!c) return null
        const pct = Math.round((c / total) * 100)
        return (
          <button key={t} type="button" style={{ width: `${(c / total) * 100}%`, background: TONE_COLORS[t] }} onClick={() => drill({ tone: t })} title={`${ix.tones[t]} : ${i.num(c)} (${pct}%)`}>
            {pct >= 8 && <span>{pct}%</span>}
          </button>
        )
      })}
    </div>
  )
}

export function MoodPanel({ stats }: { stats: Stats }) {
  const x = useText()
  if (!stats.toneDays?.length) return null
  return (
    <section className="news-panel news-panel--wide tr-trends">
      <h3>{x.mood}</h3>
      {!!stats.tones?.length && (
        <>
          <p className="tr-trends__label">{x.split}</p>
          <ToneSplit tones={stats.tones} />
        </>
      )}
      <MoodCurve days={stats.toneDays} />
    </section>
  )
}

/** Entités les plus citées : clic → actualités qui les mentionnent */
export function EntityPanel({ stats, days }: { stats: Stats; days: number }) {
  const x = useText()
  const i = useI18n()
  const drill = useContext(DrillContext)
  const groups = (
    [
      ['people', stats.people],
      ['orgs', stats.orgs],
      ['places', stats.places],
    ] as const
  ).filter(([, rows]) => rows && rows.length)
  if (!groups.length) return null
  return (
    <section className="news-panel news-panel--wide">
      <h3>{x.entities}</h3>
      <div className="tr-entpanel">
        {groups.map(([key, rows]) => {
          const top = (rows ?? []).slice(0, 8)
          const max = Math.max(...top.map((r) => r.count), 1)
          return (
            <div key={key}>
              <p className="tr-trends__label">{x[key]}</p>
              <ul className="news-hbars">
                {top.map((r) => (
                  <li key={r.name}>
                    <button type="button" className="tr-entpanel__btn" onClick={() => drill({ entity: r.name, days: String(days) })} title={x.open}>
                      <span className="news-hbars__label" dir="auto">
                        {r.name}
                      </span>
                      <span className="news-hbars__track">
                        <span className="news-hbars__bar" style={{ width: `${(r.count / max) * 100}%` }} />
                      </span>
                      <span className="news-hbars__value">{i.num(r.count)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
