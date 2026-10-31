/**
 * Début réel de la collecte : premier jour d'une suite ininterrompue (jusqu'à hier) de jours à plein régime, chacun
 * à au moins 35 % du volume habituel (médiane des 7 jours les plus chargés) et à 5 fiches au moins ; un seul jour creux
 * isolé est toléré (panne d'une nuit). Les quelques articles anciens (dates de 2012, 2021…), les jours de montée en
 * charge et la reprise d'historique encore clairsemée (quelques fiches par jour) ne comptent pas : sinon une période
 * précédente presque vide passerait pour couverte, et les variations en % seraient gonflées (+73 %, ×16 — audit v5).
 * Partagé par les variations en % (insights.js coverageOf) et la profondeur d'historique (radar.js historyOf).
 *
 * Couverture d'un jour (dayCoverage) : part du volume habituel atteinte ce jour-là (0 à 1). Une période précédente
 * couverte à moitié par la collecte compte donc pour une demi-période, même si quelques fiches existent.
 */

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli', year: 'numeric', month: '2-digit', day: '2-digit' })
const DAY_MS = 86_400_000
const FULL_SHARE = 0.35

const memo = new WeakMap()
function stats(items, now = Date.now()) {
  const hit = memo.get(items)
  if (hit && Math.abs(hit.now - now) < 60_000) return hit
  const perDay = new Map()
  for (const it of items) {
    if (it.media === 'comment') continue
    const t = Date.parse(it.date)
    if (!Number.isFinite(t) || t > now + 3_600_000) continue
    const d = dayKey.format(new Date(t))
    perDay.set(d, (perDay.get(d) || 0) + 1)
  }
  const busiest = [...perDay.values()].sort((a, b) => b - a).slice(0, 7)
  const median = busiest.length ? busiest[Math.floor(busiest.length / 2)] : 0
  const floor = Math.max(5, median * FULL_SHARE)
  const out = { now, perDay, median, floor, start: startOf(perDay, floor, now) }
  if (items && typeof items === 'object') memo.set(items, out)
  return out
}

function startOf(perDay, floor, now) {
  if (!perDay.size) return null
  // On remonte depuis hier (aujourd'hui est incomplet) tant que les jours sont pleins ; un seul creux isolé toléré
  let d = dayKey.format(new Date(now - DAY_MS))
  const full = (k) => (perDay.get(k) || 0) >= floor
  const prev = (k) => dayKey.format(new Date(Date.parse(`${k}T12:00:00Z`) - DAY_MS))
  if (!full(d)) {
    // Hier creux (collecte interrompue) : on part du dernier jour plein connu
    const fulls = [...perDay.keys()].filter(full).sort()
    if (!fulls.length) return null
    d = fulls[fulls.length - 1]
  }
  let start = d
  for (let k = prev(d), guard = 0; guard < 800; guard++, k = prev(k)) {
    if (full(k)) start = k
    else if (full(prev(k))) continue // creux isolé
    else break
  }
  return start
}

export function collectionStartDay(items, now = Date.now()) {
  return stats(items, now).start
}

/** Même date en millisecondes (minuit, heure de Tripoli), ou null */
export function collectionStart(items, now = Date.now()) {
  const d = collectionStartDay(items, now)
  return d ? Date.parse(`${d}T00:00:00+02:00`) : null
}

/** Premier jour avec au moins 5 fiches (données partielles : reprise d'historique, montée en charge), ou null */
export function firstDataDay(items, now = Date.now()) {
  const { perDay } = stats(items, now)
  return [...perDay.entries()].filter(([, n]) => n >= 5).map(([d]) => d).sort()[0] ?? null
}

/**
 * Jours réellement couverts entre a et b (ms) : chaque jour compte pour la part du volume habituel qu'il atteint
 * (1 jour plein = 1 ; un jour à 10 % du volume habituel = 0,29 avec le seuil de 35 %), au prorata de la fenêtre.
 * Les jours à partir du début à plein régime comptent toujours pour 1 (un jour calme n'est pas un trou de collecte).
 */
export function coveredDays(items, a, b, now = Date.now()) {
  const { perDay, floor, start } = stats(items, now)
  const startMs = start ? Date.parse(`${start}T00:00:00+02:00`) : Infinity
  let total = 0
  for (let t = a; t < b; ) {
    const k = dayKey.format(new Date(t))
    const dayStart = Date.parse(`${k}T00:00:00+02:00`)
    const end = Math.min(b, dayStart + DAY_MS)
    const share = dayStart >= startMs ? 1 : Math.min(1, (perDay.get(k) || 0) / floor)
    total += (share * Math.max(0, end - t)) / DAY_MS
    t = end > t ? end : t + DAY_MS
  }
  return total
}
