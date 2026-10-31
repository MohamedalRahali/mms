/**
 * Variations en % justes quand la période précédente n'est couverte qu'en partie par la collecte : la valeur
 * précédente est ramenée aux mêmes jours couverts que la période en cours (moyenne par jour couvert). Même règle que
 * le serveur (server/insights.js fairChange). 'new' : base trop petite pour un pourcentage parlant.
 */
export type Coverage = { days: number; current: number; previous: number; partial: boolean; since?: string | null }
/** Période précédente en partie couverte : 'average' (moyenne par jour couvert, base affichée) ou 'hide' (« جديد ») */
export const PARTIAL_MODE: 'average' | 'hide' = 'average'
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
  // Période précédente couverte à moins de moitié : % sur la moyenne par jour des jours couverts (base indiquée à
  // l'écran) ; PARTIAL_MODE = 'hide' : « جديد » à la place (choix du client)
  if (cov.previous < 1 || cov.current <= 0) return cur ? 'new' : null
  if (PARTIAL_MODE === 'hide' && cov.previous < cov.days / 2) return cur ? 'new' : null
  const base = prev * (cov.current / cov.previous)
  if (base < 5) return cur ? 'new' : null
  const pct = Math.round(((cur - base) / base) * 100)
  // Pas de multiplicateur sur une base faible (×16 sur 10 articles, audit v5) : même règle que le serveur
  if (pct > 100 && base < 20) return 'new'
  return pct
}

/** Petite mention de la base de calcul quand la période précédente est partielle */
export const basisNote = (cov: Coverage | null | undefined, lang: string) =>
  cov?.partial ? (lang === 'ar' ? `على أساس متوسط ${Math.round(cov.previous)} يوم` : `based on a ${Math.round(cov.previous)}-day average`) : ''

/**
 * Affichage d'une variation : entre -100 % et +100 %, le pourcentage ; au-delà, un multiplicateur (+166 % → « ×2,7 »),
 * plus parlant qu'un pourcentage supérieur à 100 % (le % exact reste dans l'infobulle). Rien n'est plafonné.
 */
export function formatChange(d: number, lang: string): { text: string; title: string } {
  const exact = `${d > 0 ? '+' : ''}${Math.round(d)}%`
  if (d <= 100) return { text: `${Math.abs(Math.round(d))}%`, title: exact }
  const factor = (1 + d / 100).toLocaleString(lang === 'ar' ? 'ar-LY' : 'en', { maximumFractionDigits: 1 })
  const words = lang === 'ar' ? (d >= 200 ? `أكثر من ${d >= 300 ? 'ثلاثة' : 'ضعفين'} أضعاف` : 'أكثر من الضعف') : d >= 200 ? `more than ${d >= 300 ? 'three' : 'two'}-fold` : 'more than double'
  return { text: `×${factor}`, title: `${words} (${exact})` }
}
