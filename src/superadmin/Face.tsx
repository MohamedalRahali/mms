import { useCallback, useEffect, useState } from 'react'
import { ago, api, errText } from './api'

/**
 * التحقق بالوجه (server/face.js) : mise en service progressive (متوقف / تجريبي / مفعّل للجميع), état des comptes,
 * exceptions limitées dans le temps et réinitialisation, toutes journalisées. Aucune donnée biométrique n'est affichée.
 */

type Account = { email: string; enrolled: boolean; enrolledAt: string | null; lastOkAt: string | null; lastFailAt: string | null; lockedUntil: string | null }
type Exception = { email: string; until: string; reason: string; by: string; at: string }
type State = { mode: 'off' | 'trial' | 'on'; trial: string[]; engine: { ready: boolean; missing: string[] }; exceptions: Exception[]; accounts: Account[] }

const MODE: Record<State['mode'], string> = { off: 'متوقف', trial: 'تجريبي (الحسابات المحددة فقط)', on: 'مفعّل لكل الحسابات' }

export function FaceCard() {
  const [data, setData] = useState<State | null>(null)
  const [msg, setMsg] = useState('')
  const [trial, setTrial] = useState('')
  const [ex, setEx] = useState({ email: '', hours: 24, reason: '' })
  const load = useCallback(() => {
    api<State>('/face')
      .then((d) => {
        setData(d)
        setTrial(d.trial.join(', '))
      })
      .catch((e) => setMsg(errText(e)))
  }, [])
  useEffect(load, [load])
  async function call(p: Promise<State>, ok: string) {
    try {
      const d = await p
      setData(d)
      setTrial(d.trial.join(', '))
      setMsg(ok)
    } catch (e) {
      setMsg(errText(e))
    }
  }
  if (!data) return msg ? <p className="sa-error">{msg}</p> : null
  const setMode = (mode: State['mode']) => {
    if (mode === 'on' && !window.confirm('سيُطلب من كل الحسابات تسجيل الوجه عند الدخول القادم. هل تريد المتابعة؟')) return
    call(api<State>('/face/policy', 'PUT', { mode, trial: trial.split(/[\s,;]+/).filter(Boolean) }), 'تم الحفظ.')
  }
  return (
    <div className="sa-card sa-card--wide">
      <div className="sa-card__head">
        <h2>التحقق بالوجه</h2>
        <span className={`sa-tag ${data.engine.ready ? '' : 'is-bad'}`}>{data.engine.ready ? 'المحرك جاهز' : 'المحرك غير مثبّت'}</span>
      </div>
      <p className="sa-muted">
        يُضاف إلى كلمة المرور والتحقق بخطوتين ولا يعوّضهما. لا تُحفظ أي صورة؛ نموذج الوجه مشفّر على الخادم ولا يظهر هنا. ما دام المحرك غير مثبّت لا يُطلب التحقق من أي حساب.
        {!data.engine.ready && data.engine.missing.length > 0 && ` الناقص: ${data.engine.missing.join('، ')}.`}
      </p>
      <div className="sa-row">
        {(Object.keys(MODE) as State['mode'][]).map((m) => (
          <button key={m} type="button" className={`sa-btn sa-btn--small ${data.mode === m ? 'is-on' : ''}`} aria-pressed={data.mode === m} onClick={() => setMode(m)}>
            {MODE[m]}
          </button>
        ))}
      </div>
      <label className="sa-muted">
        الحسابات في الوضع التجريبي (مفصولة بفاصلة)
        <input className="sa-input" dir="ltr" value={trial} onChange={(e) => setTrial(e.target.value)} onBlur={() => trial !== data.trial.join(', ') && setMode(data.mode)} />
      </label>
      {msg && <p className="sa-note">{msg}</p>}
      <h3>وصول مؤقت دون تحقق بالوجه (72 ساعة كحد أقصى، يُسجَّل في السجل)</h3>
      <div className="sa-row">
        <input className="sa-input" dir="ltr" placeholder="email" value={ex.email} onChange={(e) => setEx({ ...ex, email: e.target.value })} aria-label="البريد" />
        <input className="sa-input" type="number" min={1} max={72} value={ex.hours} onChange={(e) => setEx({ ...ex, hours: Number(e.target.value) })} aria-label="الساعات" />
        <input className="sa-input" placeholder="السبب (إلزامي)" value={ex.reason} onChange={(e) => setEx({ ...ex, reason: e.target.value })} aria-label="السبب" />
        <button type="button" className="sa-btn sa-btn--small" disabled={!ex.email || ex.reason.trim().length < 5} onClick={() => call(api<State>('/face/exception', 'POST', ex), 'تم منح الوصول المؤقت.')}>
          منح
        </button>
      </div>
      {data.exceptions.length > 0 && (
        <ul className="sa-list">
          {data.exceptions.map((x) => (
            <li key={x.email}>
              <span dir="ltr">{x.email}</span> · حتى {new Date(x.until).toLocaleString('ar-LY')} · {x.reason} · {x.by}
            </li>
          ))}
        </ul>
      )}
      {data.accounts.length > 0 && (
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>الحساب</th>
                <th>التسجيل</th>
                <th>آخر تحقق ناجح</th>
                <th>آخر فشل</th>
                <th>إيقاف مؤقت</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.email}>
                  <td dir="ltr">{a.email}</td>
                  <td>{a.enrolled ? <span className="sa-tag">مسجل {a.enrolledAt ? ago(a.enrolledAt) : ''}</span> : <span className="sa-tag is-bad">غير مسجل</span>}</td>
                  <td>{a.lastOkAt ? ago(a.lastOkAt) : '—'}</td>
                  <td>{a.lastFailAt ? ago(a.lastFailAt) : '—'}</td>
                  <td>{a.lockedUntil ? new Date(a.lockedUntil).toLocaleTimeString('ar-LY') : '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="sa-btn sa-btn--small"
                      onClick={() => window.confirm(`حذف نموذج وجه ${a.email} وإغلاق جلساته؟ سيُطلب منه التسجيل من جديد.`) && call(api<State>('/face/reset', 'POST', { email: a.email }), 'تمت إعادة التعيين.')}
                    >
                      إعادة تعيين
                    </button>
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
