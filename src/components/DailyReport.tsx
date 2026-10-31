import { useState } from 'react'
import { type Flux, type NewsItem, type Report, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { canDo, useAuth } from '../lib/auth'

/** Rapport d'une journée, classé par catégorie, prêt à imprimer ou à enregistrer en PDF */
type Validation = {
  day: string
  due: string
  deadline: string
  status: 'validated_on_time' | 'validated_late' | 'overdue' | 'pending'
  validation: { by: string; at: string; note: string } | null
  rate: { due: number; onTime: number; rate: number | null }
}

/**
 * Revue validée par un analyste (server/reviewValidation.js) : statut par rapport à l'heure limite de livraison,
 * bouton « اعتماد المراجعة » pour les analystes et administrateurs, taux de livraison à l'heure sur 30 jours.
 */
function ReviewValidation({ day, count }: { day: string; count: number }) {
  const i = useI18n()
  const ar = i.lang === 'ar'
  const auth = useAuth()
  const [bump, setBump] = useState(0)
  const { data } = useFetch<Validation>(`/api/report/validation?day=${day}&n=${bump}`)
  const [note, setNote] = useState('')
  const can = auth?.user?.role === 'admin' || auth?.user?.role === 'analyst'
  if (!data) return null
  const label = {
    validated_on_time: ar ? '✓ مراجعة معتمدة في الموعد' : '✓ Validated on time',
    validated_late: ar ? '✓ مراجعة معتمدة بعد الموعد' : '✓ Validated late',
    overdue: ar ? '⚠ لم تُعتمد بعد — تجاوزت موعد التسليم' : '⚠ Not validated yet — past the delivery time',
    pending: ar ? 'بانتظار اعتماد محلل' : 'Awaiting analyst validation',
  }[data.status]
  async function validate() {
    const r = await fetch('/api/report/validation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day, note, count }) })
    if (r.ok) setBump((n) => n + 1)
  }
  return (
    <div className={`mms-review mms-review--${data.status}`}>
      <b>{label}</b>
      <small>
        {ar ? `موعد التسليم: ${i.dateTime(data.due)}` : `Delivery time: ${i.dateTime(data.due)}`}
        {data.validation && (ar ? ` · اعتمدها ${data.validation.by} في ${i.dateTime(data.validation.at)}` : ` · validated by ${data.validation.by} on ${i.dateTime(data.validation.at)}`)}
        {data.rate.rate !== null && (ar ? ` · التسليم في الموعد (30 يوماً): ${data.rate.rate}%` : ` · on-time delivery (30 days): ${data.rate.rate}%`)}
      </small>
      {data.validation?.note && <small dir="auto">{data.validation.note}</small>}
      {can && !data.validation && (
        <span className="mms-review__act mms-noprint">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={ar ? 'ملاحظة المحلل (اختياري)' : 'Analyst note (optional)'} dir="auto" />
          <button type="button" className="news-btn" onClick={validate}>
            {ar ? 'اعتماد المراجعة' : 'Validate the review'}
          </button>
        </span>
      )}
    </div>
  )
}

export function DailyReport({ flux, initialDay = '' }: { flux: Flux | ''; initialDay?: string }) {
  const i = useI18n()
  const { t } = i
  const auth = useAuth()
  const [day, setDay] = useState(initialDay)
  const { data, error, loading } = useFetch<Report & { total?: number; merged?: number; social?: NewsItem[]; excluded?: number }>(`/api/report?day=${day}${flux ? `&flux=${flux}` : ''}`)
  const ar = i.lang === 'ar'
  const REL: Record<string, string> = ar
    ? { high: 'موثوقية عالية', medium: 'موثوقية متوسطة', social: 'حساب معروف', low: 'غير مؤكد' }
    : { high: 'high reliability', medium: 'medium reliability', social: 'identified account', low: 'unverified' }

  const groups = new Map<string, NewsItem[]>()
  for (const it of data?.items ?? []) groups.set(it.category, [...(groups.get(it.category) ?? []), it])
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)

  return (
    <>
      <div className="news-filters mms-noprint">
        <select value={data?.day ?? ''} onChange={(e) => setDay(e.target.value)} aria-label="day" disabled={!data?.available.length}>
          {data?.available.map((d) => (
            <option key={d} value={d}>
              {i.day(d)}
            </option>
          ))}
        </select>
        <button type="button" className="news-btn" onClick={() => window.print()} disabled={!data?.items.length} hidden={!canDo(auth?.user, 'export')}>
          {t.print}
        </button>
      </div>

      {error && (
        <p className="news-status news-status--error" role="alert">
          {t.loadError}
        </p>
      )}
      {loading && !data && <p className="news-status">{t.loading}</p>}
      {data && !data.day && <p className="news-status">{t.noNews}</p>}

      {data?.day && (
        <article className="mms-report">
          <header className="mms-report__head">
            <p>MMS{flux ? ` · ${i.flux(flux)}` : ''}</p>
            <h2>
              {t.reportOf} {i.dayLong(data.day)}
            </h2>
            <p>
              {t.reportCount(i.num(data.items.length))}
              {data.demo && t.reportDemo}
              {Boolean(data.merged) && (i.lang === 'ar' ? ` · ${i.num(data.merged ?? 0)} تكرار مدمج` : ` · ${i.num(data.merged ?? 0)} duplicates merged`)}
            </p>
            {Boolean(data.excluded) && (
              <p className="mms-report__note">
                {ar
                  ? `${i.num(data.excluded ?? 0)} منشوراً من حسابات مجهولة أو منتديات أو تعليقات غير مدرجة في المراجعة الرسمية.`
                  : `${i.num(data.excluded ?? 0)} posts from anonymous accounts, forums or comments are left out of the official review.`}
              </p>
            )}
            <ReviewValidation day={data.day} count={data.items.length} />
          </header>
          {data.items.length > 0 && <h3 className="mms-report__part">{ar ? 'الوكالات ووسائل الإعلام' : 'Wires and media'}</h3>}
          {ordered.map(([category, items]) => (
            <section key={category} className="mms-report__group">
              <h3>
                {i.category(category)} <span>({items.length})</span>
              </h3>
              <ul>
                {items.map((it) => (
                  <li key={it.id}>
                    <p className="mms-report__line">
                      <b>{i.time(it.date)}</b>
                      <strong dir="auto">{it.title}</strong>
                    </p>
                    {it.summary && <p dir="auto">{it.summary}</p>}
                    <p className="mms-report__src">
                      {it.origin} · {i.channel(it.channel)}
                      {it.reliability && ` · ${REL[it.reliability] ?? it.reliability}`}
                      {it.broadcasts > 1 && ` · ${t.broadcastShort(it.broadcasts)}`}
                      {(it as NewsItem & { also?: { origin: string }[] }).also?.length
                        ? ` · ${i.lang === 'ar' ? 'نشرته أيضاً' : 'also in'}: ${[...new Set((it as NewsItem & { also: { origin: string }[] }).also.map((a) => a.origin))].join('، ')}`
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {/* Réseaux sociaux : rubrique séparée, comptes identifiés seulement (audit v5) */}
          {Boolean(data.social?.length) && (
            <section className="mms-report__group mms-report__group--social">
              <h3 className="mms-report__part">
                {ar ? 'منشورات الشبكات الاجتماعية' : 'Social media posts'} <span>({data.social!.length})</span>
              </h3>
              <ul>
                {data.social!.map((it) => (
                  <li key={it.id}>
                    <p className="mms-report__line">
                      <b>{i.time(it.date)}</b>
                      <strong dir="auto">{it.title}</strong>
                    </p>
                    <p className="mms-report__src">
                      {it.origin} · {i.channel(it.channel)} · {REL[it.reliability ?? 'social']}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      )}
    </>
  )
}
