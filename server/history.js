/**
 * Début réel de la collecte : premier jour où elle tourne à plein régime, au moins un quart du volume habituel
 * (médiane des 7 jours les plus chargés), et au moins 5 fiches. Les quelques articles anciens (dates de 2012, 2021…)
 * et les jours de montée en charge (nouvelles sources branchées) ne comptent pas : sinon une période précédente
 * presque vide passerait pour couverte, et les variations en % seraient gonflées (+157 % au lieu de « جديد »).
 * Partagé par les variations en % (insights.js coverageOf) et la profondeur d'historique (radar.js historyOf).
 */

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli', year: 'numeric', month: '2-digit', day: '2-digit' })

export function collectionStartDay(items) {
  const perDay = new Map()
  for (const it of items) {
    if (it.media === 'comment') continue
    const t = Date.parse(it.date)
    if (!Number.isFinite(t)) continue
    const d = dayKey.format(new Date(t))
    perDay.set(d, (perDay.get(d) || 0) + 1)
  }
  if (!perDay.size) return null
  const busiest = [...perDay.values()].sort((a, b) => b - a).slice(0, 7)
  const median = busiest[Math.floor(busiest.length / 2)]
  const floor = Math.max(5, median * 0.25)
  return [...perDay.entries()]
    .filter(([, n]) => n >= floor)
    .map(([d]) => d)
    .sort()[0] ?? null
}

/** Même date en millisecondes (minuit, heure de Tripoli), ou null */
export function collectionStart(items) {
  const d = collectionStartDay(items)
  return d ? Date.parse(`${d}T00:00:00+02:00`) : null
}
