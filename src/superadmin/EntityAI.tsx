import { useCallback, useEffect, useState } from 'react'
import { ago, api, errText, fmtNum } from './api'

/**
 * تصحيح الفاعلين بالذكاء الاصطناعي (server/entityAI.js) : passages (une fois par jour, et à la demande), décisions de
 * l'IA (fusion de variantes, rejets, nationalité, fonction), correction ou annulation par le Super Admin.
 */

type Decision = { raw: string; canonical: string; type: string; libyan: boolean; role: string; reject: boolean; reason: string; source: 'ai' | 'admin'; at: string }
type Run = { at: string; names: number; applied?: number; merged?: number; rejected?: number; error?: string; manual?: boolean }
type State = { runs: Run[]; decisions: Decision[]; ai: boolean; provider: string }

const TYPE: Record<string, string> = { person: 'شخص', org: 'مؤسسة', place: 'مكان', other: 'غير ذلك' }

export function EntityAICard() {
  const [data, setData] = useState<State | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'' | 'merge' | 'reject' | 'admin'>('')
  const load = useCallback(() => {
    api<State>('/entity-ai')
      .then(setData)
      .catch((e) => setMsg(errText(e)))
  }, [])
  useEffect(load, [load])
  async function runNow() {
    setBusy(true)
    setMsg('')
    try {
      const r = await api<State & { run: Run & { skipped?: string } }>('/entity-ai/run', 'POST', {})
      setData(r)
      setMsg(r.run.skipped === 'DAILY_CAP' ? 'تم بلوغ الحد اليومي للتشغيل.' : r.run.skipped === 'NOTHING_NEW' ? 'لا توجد أسماء جديدة للتصحيح.' : `تم: ${r.run.applied ?? 0} قرار (${r.run.merged ?? 0} دمج، ${r.run.rejected ?? 0} رفض).`)
    } catch (e) {
      setMsg(errText(e))
    } finally {
      setBusy(false)
    }
  }
  async function edit(raw: string, patch: Partial<Decision> & { remove?: boolean }) {
    try {
      setData(await api<State>('/entity-ai', 'PUT', { raw, ...patch }))
    } catch (e) {
      setMsg(errText(e))
    }
  }
  if (!data) return msg ? <p className="sa-error">{msg}</p> : null
  const shown = data.decisions.filter(
    (d) =>
      (!q || `${d.raw} ${d.canonical} ${d.role}`.includes(q)) &&
      (!only || (only === 'reject' ? d.reject : only === 'admin' ? d.source === 'admin' : !d.reject && d.canonical !== d.raw)),
  )
  const last = data.runs[0]
  return (
    <div className="sa-card sa-card--wide">
      <div className="sa-card__head">
        <h2>تصحيح الفاعلين بالذكاء الاصطناعي</h2>
        <button type="button" className="sa-btn sa-btn--small" disabled={busy || !data.ai} onClick={runNow}>
          {busy ? 'جارٍ التشغيل…' : 'تشغيل الآن'}
        </button>
      </div>
      <p className="sa-muted">
        كل يوم (الساعة 3 صباحاً) تُرسل الأسماء الأكثر ذكراً غير الموجودة في المرجع إلى الذكاء الاصطناعي ({data.provider || 'غير مُعدّ'}) لدمج طرق الكتابة المختلفة، واستبعاد ما ليس فاعلاً (اسم أول وحده، لقب عام، خطأ استخراج)، وتحديد الجنسية والصفة. تُطبَّق القرارات على كل الترتيبات والمقارنات بأثر رجعي، ولا يُحذف شيء من الأخبار. المرجع اليدوي وتعديلاتك هنا لها الأولوية.
      </p>
      {last && (
        <p className="sa-muted">
          آخر تشغيل: {ago(last.at)} · {fmtNum(last.names)} اسم · {last.error ? `خطأ: ${last.error}` : `${fmtNum(last.applied ?? 0)} قرار، ${fmtNum(last.merged ?? 0)} دمج، ${fmtNum(last.rejected ?? 0)} رفض`}
        </p>
      )}
      {msg && <p className="sa-note">{msg}</p>}
      <div className="sa-row">
        <input className="sa-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث عن اسم" aria-label="بحث عن اسم" />
        <select className="sa-input" value={only} onChange={(e) => setOnly(e.target.value as typeof only)} aria-label="نوع القرار">
          <option value="">كل القرارات ({fmtNum(data.decisions.length)})</option>
          <option value="merge">دمج</option>
          <option value="reject">رفض</option>
          <option value="admin">تعديلاتي</option>
        </select>
      </div>
      <div className="sa-table-wrap">
        <table className="sa-table">
          <thead>
            <tr>
              <th>الاسم المستخرج</th>
              <th>الاسم الموحد</th>
              <th>النوع</th>
              <th>ليبي</th>
              <th>الصفة</th>
              <th>المصدر</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 300).map((d) => (
              <tr key={d.raw} className={d.reject ? 'is-off' : ''}>
                <td dir="auto">{d.raw}</td>
                <td dir="auto">{d.reject ? <span className="sa-tag is-bad">مستبعد</span> : d.canonical}</td>
                <td>{TYPE[d.type] ?? d.type}</td>
                <td>{d.libyan ? 'نعم' : 'لا'}</td>
                <td dir="auto">
                  <small>{d.role || d.reason}</small>
                </td>
                <td>
                  <span className={`sa-tag ${d.source === 'admin' ? 'is-gold' : ''}`}>{d.source === 'admin' ? 'يدوي' : 'ذكاء اصطناعي'}</span>
                </td>
                <td>
                  <span className="sa-row">
                    <button type="button" className="sa-btn sa-btn--small" onClick={() => edit(d.raw, d.reject ? { reject: false, canonical: d.raw } : { reject: true })}>
                      {d.reject ? 'قبول' : 'استبعاد'}
                    </button>
                    <button
                      type="button"
                      className="sa-btn sa-btn--small"
                      onClick={() => {
                        const c = window.prompt('الاسم الموحد', d.canonical || d.raw)
                        if (c) edit(d.raw, { canonical: c.trim(), reject: false })
                      }}
                    >
                      تعديل
                    </button>
                    <button type="button" className="sa-btn sa-btn--small" onClick={() => edit(d.raw, { remove: true })} title="يعود الاسم كما استُخرج">
                      إلغاء
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
