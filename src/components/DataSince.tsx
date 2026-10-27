import { useI18n } from '../lib/i18n'
import { shortDay, useHistory } from '../lib/history'

/** Bandeau « البيانات منذ JJ/MM » ; signale que les comparaisons attendent 14 jours d'historique */
export function DataSince({ compact = false }: { compact?: boolean }) {
  const i = useI18n()
  const h = useHistory()
  if (!h?.since) return null
  const ar = i.lang === 'ar'
  const since = shortDay(h.since)
  const text = ar ? `البيانات متوفرة منذ ${since} (${h.days} يوماً)` : `Data available since ${since} (${h.days} days)`
  const warn = h.enough ? '' : ar ? ` · المقارنات و«الارتفاعات المفاجئة» تظهر بعد ${h.min} يوماً من البيانات` : ` · Comparisons and “sudden rises” appear after ${h.min} days of data`
  return (
    <p className={`mms-since${h.enough ? '' : ' is-short'}${compact ? ' is-compact' : ''}`} role="note">
      <span aria-hidden>🗓</span> {text}
      {!compact && warn}
    </p>
  )
}
