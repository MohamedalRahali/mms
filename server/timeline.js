import { toneOf } from './radar.js'

/**
 * Courbe dans le temps des tableaux de bord : nombre d'articles par heure, jour, semaine, mois, trimestre ou année
 * (heure de Tripoli), en une série ou découpée par canal, tonalité, type de média ou thème, ou en comparant plusieurs
 * recherches enregistrées (veilles). Les séries au-delà des 8 plus fournies sont regroupées dans « other ».
 */

export const STEPS = ['hour', 'day', 'week', 'month', 'quarter', 'year']
export const SPLITS = ['', 'channel', 'tone', 'media', 'category', 'compare']
const MAX_SERIES = 8
const HOUR = 3_600_000

const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
const memo = new Map()
function local(t) {
  const key = Math.floor(t / HOUR)
  let p = memo.get(key)
  if (!p) {
    if (memo.size > 100_000) memo.clear()
    p = Object.fromEntries(parts.formatToParts(new Date(key * HOUR)).map((x) => [x.type, x.value]))
    memo.set(key, p)
  }
  return p
}

/** Libellé du pas de temps qui contient l'instant t (semaines commençant le lundi) */
export function bucketOf(t, step) {
  const p = local(t)
  if (step === 'hour') return `${p.year}-${p.month}-${p.day} ${p.hour}h`
  if (step === 'month') return `${p.year}-${p.month}`
  if (step === 'quarter') return `${p.year}-T${Math.floor((Number(p.month) - 1) / 3) + 1}`
  if (step === 'year') return p.year
  const day = `${p.year}-${p.month}-${p.day}`
  if (step !== 'week') return day
  const d = new Date(`${day}T12:00:00Z`)
  const back = (d.getUTCDay() + 6) % 7
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10)
}

/** Tous les pas de la période, du plus ancien au plus récent (même les vides) */
export function bucketsBetween(from, to, step) {
  const out = []
  const inc = step === 'hour' ? HOUR : 6 * HOUR
  for (let t = from; t <= to; t += inc) {
    const b = bucketOf(t, step)
    if (out[out.length - 1] !== b) out.push(b)
  }
  const last = bucketOf(to, step)
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

const keyOf = (it, split) => (split === 'channel' ? it.channel : split === 'tone' ? toneOf(it).tone : split === 'media' ? it.media || 'article' : split === 'category' ? it.category : 'total')

/**
 * items : fiches déjà filtrées ; groups (compare) : [{ name, items }] pour comparer des recherches enregistrées.
 * Renvoie { step, buckets, series: [{ key, values }] }.
 */
export function timeline(items, { days = 30, step = 'day', split = '', groups = null, now = Date.now() } = {}) {
  const s = STEPS.includes(step) ? step : 'day'
  // Pas horaire limité à 7 jours (168 points au plus)
  const span = Math.min(Math.max(Number(days) || 30, 1), s === 'hour' ? 7 : 365)
  const from = now - span * 86_400_000
  const buckets = bucketsBetween(from, now, s)
  const index = new Map(buckets.map((b, k) => [b, k]))
  const series = new Map()
  const add = (key, t) => {
    const k = index.get(bucketOf(t, s))
    if (k == null) return
    let v = series.get(key)
    if (!v) series.set(key, (v = new Array(buckets.length).fill(0)))
    v[k]++
  }
  const sources = groups || [{ name: null, items }]
  for (const g of sources)
    for (const it of g.items) {
      const t = Date.parse(it.date)
      if (t < from || t > now) continue
      add(g.name ?? keyOf(it, split), t)
    }
  let rows = [...series.entries()].map(([key, values]) => ({ key, values, total: values.reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total)
  if (!groups && rows.length > MAX_SERIES) {
    const rest = rows.slice(MAX_SERIES - 1)
    const other = new Array(buckets.length).fill(0)
    for (const r of rest) r.values.forEach((v, k) => (other[k] += v))
    rows = [...rows.slice(0, MAX_SERIES - 1), { key: 'other', values: other, total: other.reduce((a, b) => a + b, 0) }]
  }
  if (groups) rows = groups.map((g) => rows.find((r) => r.key === g.name) || { key: g.name, values: new Array(buckets.length).fill(0), total: 0 })
  return { step: s, days: span, buckets, series: rows.map(({ key, values, total }) => ({ key, values, total })) }
}
