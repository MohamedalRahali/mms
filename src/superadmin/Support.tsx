import { useCallback, useEffect, useState } from 'react'
import { ago, api, errText } from './api'

/**
 * الدعم الفني (server/support.js) : adresse qui reçoit les demandes du chat d'aide, et liste des demandes avec leur
 * statut (جديد / قيد المعالجة / مغلق).
 */

type Ticket = {
  id: string
  at: string
  status: 'new' | 'progress' | 'closed'
  user: { name: string; email: string; role: string }
  message: string
  page: string
  mail: string
}
type State = { conf: { email: string }; tickets: Ticket[] }

const STATUS: Record<Ticket['status'], string> = { new: 'جديد', progress: 'قيد المعالجة', closed: 'مغلق' }
const KEYS = Object.keys(STATUS) as Ticket['status'][]

export function SupportCard() {
  const [data, setData] = useState<State | null>(null)
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [only, setOnly] = useState<'' | Ticket['status']>('')
  const load = useCallback(() => {
    api<State>('/support')
      .then((d) => {
        setData(d)
        setEmail(d.conf.email)
      })
      .catch((e) => setMsg(errText(e)))
  }, [])
  useEffect(load, [load])
  async function saveEmail() {
    try {
      const r = await api<{ conf: State['conf'] }>('/support', 'PUT', { email })
      setMsg(`تم الحفظ: ${r.conf.email}`)
      load()
    } catch (e) {
      setMsg(errText(e))
    }
  }
  async function setStatus(id: string, status: Ticket['status']) {
    try {
      await api(`/support/tickets/${encodeURIComponent(id)}`, 'PUT', { status })
      load()
    } catch (e) {
      setMsg(errText(e))
    }
  }
  if (!data) return msg ? <p className="sa-error">{msg}</p> : null
  const shown = data.tickets.filter((t) => !only || t.status === only)
  const open = data.tickets.filter((t) => t.status !== 'closed').length
  return (
    <div className="sa-card sa-card--wide">
      <div className="sa-card__head">
        <h2>الدعم الفني</h2>
        <span className="sa-tag">{open} طلب مفتوح</span>
      </div>
      <p className="sa-muted">
        الطلبات المرسلة من زر « الدعم الفني » تصل إلى هذا البريد مع اسم المستخدم والصفحة والمتصفح وآخر أخطاء الصفحة، دون أي كلمة مرور أو رمز دخول. الحد: 5 طلبات في الساعة لكل حساب.
      </p>
      <div className="sa-row">
        <input className="sa-input" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="بريد الدعم الفني" />
        <button type="button" className="sa-btn sa-btn--small" onClick={saveEmail} disabled={!email || email === data.conf.email}>
          حفظ بريد الدعم الفني
        </button>
        <select className="sa-input" value={only} onChange={(e) => setOnly(e.target.value as typeof only)} aria-label="الحالة">
          <option value="">كل الطلبات ({data.tickets.length})</option>
          {KEYS.map((s) => (
            <option key={s} value={s}>
              {STATUS[s]}
            </option>
          ))}
        </select>
      </div>
      {msg && <p className="sa-note">{msg}</p>}
      {shown.length ? (
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>الوقت</th>
                <th>المستخدم</th>
                <th>الرسالة</th>
                <th>البريد</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id} className={t.status === 'closed' ? 'is-off' : ''}>
                  <td>
                    <small>{ago(t.at)}</small>
                  </td>
                  <td dir="auto">
                    {t.user.name}
                    <br />
                    <small dir="ltr">{t.user.email}</small>
                  </td>
                  <td dir="auto" style={{ whiteSpace: 'pre-wrap', maxWidth: 420 }}>
                    {t.message}
                    <br />
                    <small dir="ltr">{t.page}</small>
                  </td>
                  <td>
                    <span className={`sa-tag ${t.mail === 'sent' ? '' : 'is-bad'}`}>{t.mail === 'sent' ? 'أُرسل' : 'لم يُرسل'}</span>
                  </td>
                  <td>
                    <select className="sa-input" value={t.status} onChange={(e) => setStatus(t.id, e.target.value as Ticket['status'])} aria-label="الحالة">
                      {KEYS.map((s) => (
                        <option key={s} value={s}>
                          {STATUS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="sa-muted">لا توجد طلبات.</p>
      )}
    </div>
  )
}
