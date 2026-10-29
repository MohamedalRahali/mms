import { useCallback, useEffect, useState } from 'react'
import { ago, api, errText, fmtNum } from './api'

/**
 * صحة التصدير (server/exportHealth.js) : contrôle programmé toutes les 6 heures et résultat des derniers exports
 * réels (PDF, Word) ; une alerte part à l'adresse du support technique en cas d'échec.
 */

type Test = { id: string; ok: boolean; detail: string }
type Event = { at: string; kind: string; format: string; pages: number; blank: number; bytes: number; error: string; ok: boolean; by: string }
type State = { last: { at: string; ok: boolean; tests: Test[] } | null; day: { total: number; failed: number }; events: Event[]; alertedAt: string }

const TEST: Record<string, string> = { data: 'بيانات التصدير', guard: 'فحص الصفحات الفارغة', logo: 'شعار الجهة', real: 'التصديرات الفعلية (24 ساعة)' }
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} م.ب` : `${fmtNum(Math.round(n / 1024))} ك.ب`)

export function ExportHealthCard() {
  const [data, setData] = useState<State | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    api<State>('/export-health')
      .then(setData)
      .catch((e) => setMsg(errText(e)))
  }, [])
  useEffect(load, [load])
  async function runNow() {
    setBusy(true)
    try {
      setData(await api<State>('/export-health/run', 'POST', {}))
    } catch (e) {
      setMsg(errText(e))
    } finally {
      setBusy(false)
    }
  }
  if (!data) return msg ? <p className="sa-error">{msg}</p> : null
  return (
    <div className="sa-card sa-card--wide">
      <div className="sa-card__head">
        <h2>صحة التصدير</h2>
        <button type="button" className="sa-btn sa-btn--small" disabled={busy} onClick={runNow}>
          {busy ? 'جارٍ الفحص…' : 'فحص الآن'}
        </button>
      </div>
      <p className="sa-muted">
        كل تنزيل PDF أو Word يرسل نتيجته (عدد الصفحات، الصفحات الفارغة المحذوفة، الحجم) دون محتوى الملف، ويُفحص كل 6 ساعات ما يحتاجه التصدير. عند أي خلل يُرسل تنبيه إلى بريد الدعم الفني.
      </p>
      {data.last ? (
        <ul className="sa-list">
          {data.last.tests.map((t) => (
            <li key={t.id}>
              <span className={`sa-tag ${t.ok ? '' : 'is-bad'}`}>{t.ok ? 'سليم' : 'خلل'}</span> {TEST[t.id] ?? t.id} : <small>{t.detail}</small>
            </li>
          ))}
          <li>
            <small>
              آخر فحص: {ago(data.last.at)}
              {data.alertedAt ? ` · آخر تنبيه: ${ago(data.alertedAt)}` : ''}
            </small>
          </li>
        </ul>
      ) : (
        <p className="sa-muted">لم يُجرَ أي فحص بعد (أول فحص بعد دقيقة من تشغيل الخادم).</p>
      )}
      <p className="sa-muted">
        خلال 24 ساعة: {fmtNum(data.day.total)} تصدير، {fmtNum(data.day.failed)} فارغ أو فاشل.
      </p>
      {data.events.length > 0 && (
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>الوقت</th>
                <th>الصفحة</th>
                <th>الصيغة</th>
                <th>الصفحات</th>
                <th>الحجم</th>
                <th>المستخدم</th>
                <th>النتيجة</th>
              </tr>
            </thead>
            <tbody>
              {data.events.slice(0, 30).map((e, k) => (
                <tr key={k}>
                  <td>
                    <small>{ago(e.at)}</small>
                  </td>
                  <td dir="ltr">{e.kind}</td>
                  <td>{e.format.toUpperCase()}</td>
                  <td>{e.format === 'pdf' ? `${fmtNum(e.pages - e.blank)} / ${fmtNum(e.pages)}` : '—'}</td>
                  <td>{kb(e.bytes)}</td>
                  <td dir="ltr">
                    <small>{e.by}</small>
                  </td>
                  <td>
                    <span className={`sa-tag ${e.ok ? '' : 'is-bad'}`}>{e.ok ? 'سليم' : e.error || 'فارغ'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
