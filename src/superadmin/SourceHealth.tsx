import { useCallback, useEffect, useState } from 'react'
import { ago, api, errText, fmtDate, fmtNum } from './api'

/**
 * صحة المصادر : état de chaque collecteur et enregistreur de la veille (server/sourceHealth.js), avec filtres par statut
 * et par type, recherche, et budgets du jour et du mois.
 */

type Status = 'ok' | 'error' | 'stale' | 'never' | 'off'
type Row = {
  id: string
  name: string
  section: string
  active: boolean
  lastRun: string | null
  lastSuccess: string | null
  error: string
  lastCount: number
  total: number
  note: string
  lastRecording?: string | null
  lastTranscript?: string | null
  slots?: string[]
  status: Status
}
type Budget = { jour: number; plafond_jour: number; mois: number; plafond_mois: number; atteint: boolean }
type Health = { updatedAt: string | null; available: boolean; counts: Record<Status, number>; rows: Row[]; budgets: Record<string, Budget> }

const STATUS: Record<Status, [string, string]> = {
  error: ['خطأ', 'is-bad'],
  stale: ['متأخر', 'is-warn'],
  never: ['لم يعمل بعد', 'is-warn'],
  ok: ['سليم', 'is-ok'],
  off: ['معطّل', ''],
}
const SECTIONS: Record<string, string> = {
  sites: 'مواقع',
  officiels: 'مصادر رسمية',
  diffusion: 'تلفزيون وإذاعة',
  youtube: 'يوتيوب',
  telegram: 'تيليغرام',
  reddit: 'Reddit',
  x: 'X',
  podcasts: 'بودكاست',
  blogs: 'مدونات',
  forums: 'منتديات',
  commentaires: 'تعليقات',
  mastodon: 'Mastodon',
  bluesky: 'Bluesky',
}
const BUDGETS: Record<string, string> = {
  x: 'X',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  transcription: 'تفريغ نشرات التلفزيون والإذاعة',
  medias: 'تفريغ البودكاست والفيديو',
  enregistrements: 'التسجيلات حسب الطلب',
}

export function SourceHealthCard() {
  const [data, setData] = useState<Health | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Status | ''>('')
  const [section, setSection] = useState('')
  const [q, setQ] = useState('')
  const reload = useCallback(() => {
    api<Health>('/source-health')
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((e) => setError(errText(e)))
  }, [])
  useEffect(reload, [reload])
  if (error) return <p className="sa-error sa-card--wide">{error}</p>
  if (!data) return null
  const sections = [...new Set(data.rows.map((r) => r.section))].sort()
  const shown = data.rows.filter((r) => (!status || r.status === status) && (!section || r.section === section) && (!q || `${r.name} ${r.id}`.toLowerCase().includes(q.toLowerCase())))
  const filtered = Boolean(status || section || q)
  return (
    <div className="sa-card sa-card--wide">
      <div className="sa-card__head">
        <h2>صحة المصادر</h2>
        <button type="button" className="sa-btn sa-btn--small" onClick={reload}>
          تحديث
        </button>
      </div>
      {!data.available ? (
        <p className="sa-muted">لم يكتب جامع الأخبار حالة المصادر بعد: تظهر بعد مروره القادم (كل 10 دقائق).</p>
      ) : (
        <>
          <p className="sa-muted">
            حالة كل جامع ومسجّل في آخر مرور ({ago(data.updatedAt)}). «متأخر» = لا نجاح منذ مدة أطول من إيقاعه المعتاد.
          </p>
          <div className="sa-row sa-health__counts" role="group" aria-label="الحالة">
            {(Object.keys(STATUS) as Status[]).map((s) => (
              <button key={s} type="button" className={`sa-tag ${STATUS[s][1]}${status === s ? ' is-picked' : ''}`} aria-pressed={status === s} onClick={() => setStatus(status === s ? '' : s)}>
                {STATUS[s][0]} · {fmtNum(data.counts[s] || 0)}
              </button>
            ))}
          </div>
          {Object.keys(data.budgets).length > 0 && (
            <div className="sa-health__budgets">
              {Object.entries(data.budgets).map(([k, b]) => (
                <span key={k} className={`sa-tag ${b.atteint ? 'is-bad' : ''}`} title={`الشهر: ${b.mois.toFixed(2)} / ${b.plafond_mois.toFixed(2)} $`}>
                  {BUDGETS[k] ?? k}: {b.jour.toFixed(2)} / {b.plafond_jour.toFixed(2)} $ اليوم{b.atteint ? ' · بلغ السقف' : ''}
                </span>
              ))}
            </div>
          )}
          <div className="sa-row">
            <input className="sa-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث عن مصدر" aria-label="بحث عن مصدر" />
            <select className="sa-input" value={section} onChange={(e) => setSection(e.target.value)} aria-label="النوع">
              <option value="">كل الأنواع</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {SECTIONS[s] ?? s}
                </option>
              ))}
            </select>
            {filtered && (
              <button
                type="button"
                className="sa-btn sa-btn--small"
                onClick={() => {
                  setStatus('')
                  setSection('')
                  setQ('')
                }}
              >
                إعادة الضبط
              </button>
            )}
            <span className="sa-muted">
              {fmtNum(shown.length)} / {fmtNum(data.rows.length)}
            </span>
          </div>
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>المصدر</th>
                  <th>النوع</th>
                  <th>الحالة</th>
                  <th>آخر مرور</th>
                  <th>آخر نجاح</th>
                  <th>الأخبار (آخر مرور / المجموع)</th>
                  <th>ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 300).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b dir="auto">{r.name}</b>
                      <br />
                      <small dir="ltr" className="sa-muted">
                        {r.id}
                      </small>
                    </td>
                    <td>{SECTIONS[r.section] ?? r.section}</td>
                    <td>
                      <span className={`sa-tag ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
                    </td>
                    <td title={fmtDate(r.lastRun)}>{ago(r.lastRun)}</td>
                    <td title={fmtDate(r.lastSuccess)}>{ago(r.lastSuccess)}</td>
                    <td>
                      {fmtNum(r.lastCount)} / {fmtNum(r.total)}
                    </td>
                    <td className="sa-health__note">
                      {r.error && (
                        <span dir="ltr" className="sa-health__err">
                          {r.error}
                        </span>
                      )}
                      {r.slots && r.slots.length > 0 && <small>المواعيد: {r.slots.join('، ')} · آخر تسجيل: {ago(r.lastRecording)}</small>}
                      {!r.error && r.note && <small dir="auto">{r.note}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
