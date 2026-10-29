/**
 * Variations en % justes quand la période précédente n'est couverte qu'en partie par la collecte : la valeur
 * précédente est ramenée aux mêmes jours couverts que la période en cours (moyenne par jour couvert). Même règle que
 * le serveur (server/insights.js fairChange). 'new' : base trop petite pour un pourcentage parlant.
 */
export type Coverage = { days: number; current: number; previous: number; partial: boolean }
const DAY = 86_400_000

/** Jours couverts de la période en cours et de la précédente, à partir du début des données (since) */
export function coverageFrom(days: number, since: string | null | undefined, now = Date.now()): Coverage | null {
  if (!since) return null
  const start = Date.parse(since)
  if (!Number.isFinite(start)) return null
  const span = (a: number, b: number) => Math.max(0, Math.min(b - Math.max(a, start), b - a)) / DAY
  const current = Math.round(span(now - days * DAY, now) * 10) / 10
  const previous = Math.round(span(now - 2 * days * DAY, now - days * DAY) * 10) / 10
  return { days, current, previous, partial: previous < days - 0.5 }
}

export function fairChange(cur: number, prev: number, cov: Coverage | null | undefined): number | 'new' | null {
  if (!cov) return prev ? Math.round(((cur - prev) / prev) * 100) : cur ? 'new' : null
  if (cov.previous < 1 || cov.current <= 0) return cur ? 'new' : null
  const base = prev * (cov.current / cov.previous)
  if (base < 5) return cur ? 'new' : null
  return Math.round(((cur - base) / base) * 100)
}

/** Petite mention de la base de calcul quand la période précédente est partielle */
export const basisNote = (cov: Coverage | null | undefined, lang: string) =>
  cov?.partial ? (lang === 'ar' ? `على أساس متوسط ${Math.round(cov.previous)} يوم` : `based on a ${Math.round(cov.previous)}-day average`) : ''
