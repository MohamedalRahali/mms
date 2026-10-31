import { useI18n } from '../lib/i18n'
import { shortDay, useHistory } from '../lib/history'

/** Bandeau « البيانات منذ JJ/MM » ; signale que les comparaisons attendent 14 jours d'historique */
export function DataSince({ compact = false }: { compact?: boolean }) {
  const i = useI18n()
  const h = useHistory()
  if (!h?.since) return null
  const ar = i.lang === 'ar'
  const since = shortDay(h.since)
  // Couverture complète depuis « since » ; avant, quelques données partielles seulement (reprise d'historique en cours)
  const partial = h.partialSince ? shortDay(h.partialSince) : ''
  const text = ar
    ? `التغطية كاملة منذ ${since} (${h.days} يوماً)${partial ? ` · بيانات جزئية فقط منذ ${partial} (استرجاع الأرشيف جارٍ)` : ''}`
    : `Complete coverage since ${since} (${h.days} days)${partial ? ` · partial data only since ${partial} (archive back-fill in progress)` : ''}`
  const warn = h.enough ? '' : ar ? ` · المقارنات و«الارتفاعات المفاجئة» تظهر بعد ${h.min} يوماً من البيانات` : ` · Comparisons and “sudden rises” appear after ${h.min} days of data`
  // Reprise d'historique (veille) : avancement et volume par mois, pour ne pas confondre archive et collecte
  const b = h.backfill
  const month = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`
  const progress =
    b && b.active
      ? b.finished
        ? ar
          ? ` · استرجاع الأرشيف مكتمل (${b.total} أسبوعاً)`
          : ` · archive back-fill complete (${b.total} weeks)`
        : ar
          ? ` · استرجاع الأرشيف جارٍ: ${b.done} من ${b.total} أسبوعاً${b.oldest ? `، وصل إلى ${shortDay(b.oldest)}/${b.oldest.slice(0, 4)}` : ''}`
          : ` · archive back-fill in progress: ${b.done} of ${b.total} weeks${b.oldest ? `, reached ${shortDay(b.oldest)}/${b.oldest.slice(0, 4)}` : ''}`
      : ''
  return (
    <div className={`mms-since${h.enough ? '' : ' is-short'}${compact ? ' is-compact' : ''}`} role="note">
      <p>
        <span aria-hidden>🗓</span> {text}
        {progress}
        {!compact && warn}
      </p>
      {!compact && b && b.perMonth.length > 1 && (
        <p className="mms-since__months">
          {ar ? 'الأخبار حسب الشهر: ' : 'News per month: '}
          {b.perMonth.slice(-12).map((r) => `${month(r.month)} ${i.num(r.count)}`).join(' · ')}
        </p>
      )}
    </div>
  )
}
