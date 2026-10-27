import { useCallback, useEffect, useState } from 'react'
import { api, errText, fmtNum } from './api'

/**
 * Gouvernance (audit produit, P0) : domaines destinataires autorisés et adresses mises de côté, règle de double
 * authentification, référentiel des acteurs (alias, type, région, média ou acteur).
 */

function useList<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(() => {
    api<T>(path)
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((e) => setError(errText(e)))
  }, [path])
  useEffect(reload, [reload])
  return { data, error, reload }
}

/* ---------------------------------------------------------------- النطاقات المسموح بها */

type Blocked = { watches: { id: string; name: string; createdBy: string; blocked: string[] }[]; briefing: string[] }

export function MailPolicyCard({ onMsg }: { onMsg: (m: string) => void }) {
  const { data, reload } = useList<{ policy: { domains: string[] }; blocked: Blocked }>('/mail-policy')
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? data?.policy.domains.join(', ') ?? ''
  async function save() {
    try {
      await api('/mail-policy', 'PUT', { domains: shown })
      setText(null)
      onMsg('تم حفظ النطاقات المسموح بها.')
      reload()
    } catch (e) {
      onMsg(errText(e))
    }
  }
  const blockedCount = (data?.blocked.watches.reduce((n, w) => n + w.blocked.length, 0) ?? 0) + (data?.blocked.briefing.length ?? 0)
  return (
    <div className="sa-card sa-card--wide">
      <div className="sa-card__head">
        <h2>النطاقات المسموح بها لإرسال البريد</h2>
      </div>
      <p className="sa-muted">
        لا يُرسل أي بريد من المنصة (الرصد، التقارير، التقرير التنفيذي، تنبيهات الرادار) إلا إلى عناوين ضمن هذه النطاقات. العناوين المسجلة خارجها لا تُحذف: تُعلَّق وتظهر أدناه، وتعود تلقائياً إذا أُضيف نطاقها.
      </p>
      <div className="sa-row">
        <input className="sa-input" value={shown} onChange={(e) => setText(e.target.value)} placeholder="npdc.gov.ly" dir="ltr" aria-label="النطاقات" />
        <button type="button" className="sa-btn" onClick={save}>
          حفظ
        </button>
      </div>
      <h3 className="sa-sub">العناوين المعلّقة ({blockedCount})</h3>
      {blockedCount === 0 ? (
        <p className="sa-muted">لا توجد عناوين خارج النطاقات المسموح بها.</p>
      ) : (
        <table className="sa-table">
          <thead>
            <tr>
              <th>المصدر</th>
              <th>أنشأه</th>
              <th>العناوين المعلّقة</th>
            </tr>
          </thead>
          <tbody>
            {data?.blocked.watches.map((w) => (
              <tr key={w.id}>
                <td dir="auto">الرصد: {w.name}</td>
                <td dir="ltr">{w.createdBy || '—'}</td>
                <td dir="ltr">{w.blocked.join(', ')}</td>
              </tr>
            ))}
            {!!data?.blocked.briefing.length && (
              <tr>
                <td>التقرير التنفيذي المجدول</td>
                <td>—</td>
                <td dir="ltr">{data.blocked.briefing.join(', ')}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- التحقق بخطوتين */

export function MfaPolicyCard({ onMsg }: { onMsg: (m: string) => void }) {
  const { data, reload } = useList<{ policy: { requireAdmins: boolean; requireAll: boolean } }>('/mfa-policy')
  if (!data) return null
  const set = async (p: { requireAdmins: boolean; requireAll: boolean }) => {
    try {
      await api('/mfa-policy', 'PUT', p)
      onMsg('تم حفظ قاعدة التحقق بخطوتين.')
      reload()
    } catch (e) {
      onMsg(errText(e))
    }
  }
  const p = data.policy
  return (
    <div className="sa-card">
      <div className="sa-card__head">
        <h2>التحقق بخطوتين</h2>
      </div>
      <p className="sa-muted">رمز من 6 أرقام من تطبيق مصادقة على الهاتف، مع رموز استرداد. لا يُمنع أحد من الدخول: من يلزمه التحقق يُطلب منه تفعيله عند الدخول، ويمكن إعادة تعيينه من بطاقة المستخدم.</p>
      <label className="sa-row">
        <input type="checkbox" checked={p.requireAdmins} onChange={(e) => set({ ...p, requireAdmins: e.target.checked })} />
        إلزامي للمديرين
      </label>
      <label className="sa-row">
        <input type="checkbox" checked={p.requireAll} onChange={(e) => set({ ...p, requireAll: e.target.checked })} />
        إلزامي لكل المستخدمين
      </label>
    </div>
  )
}

/* ---------------------------------------------------------------- اعتماد التنبيهات الحرجة */

export function AlertReviewCard({ onMsg }: { onMsg: (m: string) => void }) {
  const { data, reload } = useList<{ review: { critical: boolean } }>('/alert-review')
  if (!data) return null
  return (
    <div className="sa-card">
      <div className="sa-card__head">
        <h2>اعتماد التنبيهات قبل الإرسال</h2>
      </div>
      <p className="sa-muted">عند التفعيل، لا يُرسل التنبيه الحرج بالبريد أو Telegram إلا بعد أن يعتمده محلل من صفحة «الرادار الذكي».</p>
      <label className="sa-row">
        <input
          type="checkbox"
          checked={data.review.critical}
          onChange={async (e) => {
            try {
              await api('/alert-review', 'PUT', { critical: e.target.checked })
              onMsg('تم الحفظ.')
              reload()
            } catch (err) {
              onMsg(errText(err))
            }
          }}
        />
        اعتماد التنبيهات الحرجة من محلل قبل إرسالها
      </label>
    </div>
  )
}

/* ---------------------------------------------------------------- المرجع الموحد للفاعلين */

type Entity = { name: string; type: 'person' | 'org' | 'place' | 'media'; aliases: string[]; libyan: boolean; region?: string }
const TYPE_AR: Record<Entity['type'], string> = { person: 'شخصية', org: 'مؤسسة', place: 'مكان', media: 'وسيلة إعلام' }
const REGION_AR: Record<string, string> = { west: 'الغرب', east: 'الشرق', south: 'الجنوب' }

export function EntitiesEditor() {
  const { data, error, reload } = useList<{ entities: Entity[] }>('/entities')
  const [rows, setRows] = useState<Entity[] | null>(null)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const list = rows ?? data?.entities ?? []
  const edit = (k: number, patch: Partial<Entity>) => setRows(list.map((e, i) => (i === k ? { ...e, ...patch } : e)))
  async function save() {
    try {
      const r = await api<{ entities: Entity[] }>('/entities', 'PUT', { entities: list })
      setRows(null)
      setMsg(`تم الحفظ: ${fmtNum(r.entities.length)} عنصر. تُطبَّق على كل الأخبار خلال دقيقة.`)
      reload()
    } catch (e) {
      setMsg(errText(e))
    }
  }
  if (error) return <p className="sa-error">{error}</p>
  if (!data) return <p className="sa-muted">جارٍ التحميل…</p>
  const shown = list.map((e, k) => ({ e, k })).filter(({ e }) => !q || e.name.includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q.toLowerCase())))
  return (
    <div className="sa-grid">
      {msg && <p className="sa-note sa-card--wide">{msg}</p>}
      <div className="sa-card sa-card--wide">
        <div className="sa-card__head">
          <h2>المرجع الموحد للفاعلين ({fmtNum(list.length)})</h2>
          <input className="sa-input" placeholder="بحث" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <p className="sa-muted">
          كل اسم معتمد مع صيغه الأخرى (عربية، لاتينية، لهجة): تُدمج الصيغ تحت الاسم المعتمد في كل الإحصاءات والتنبيهات. «وسيلة إعلام» لا تُحسب أبداً كفاعل. الأماكن الليبية تُربط بمنطقة (غرب، شرق، جنوب).
        </p>
        <div className="sa-row">
          <button type="button" className="sa-btn sa-btn--ghost" onClick={() => setRows([{ name: '', type: 'person', aliases: [], libyan: true }, ...list])}>
            + إضافة
          </button>
          <button type="button" className="sa-btn" onClick={save} disabled={!rows}>
            حفظ التعديلات
          </button>
        </div>
        <table className="sa-table sa-entities">
          <thead>
            <tr>
              <th>الاسم المعتمد</th>
              <th>النوع</th>
              <th>المنطقة</th>
              <th>ليبي</th>
              <th>الصيغ الأخرى (مفصولة بفواصل)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 400).map(({ e, k }) => (
              <tr key={k}>
                <td>
                  <input className="sa-input" value={e.name} onChange={(ev) => edit(k, { name: ev.target.value })} dir="auto" aria-label="الاسم المعتمد" />
                </td>
                <td>
                  <select className="sa-input" value={e.type} onChange={(ev) => edit(k, { type: ev.target.value as Entity['type'] })} aria-label="النوع">
                    {Object.entries(TYPE_AR).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {e.type === 'place' ? (
                    <select className="sa-input" value={e.region || ''} onChange={(ev) => edit(k, { region: ev.target.value || undefined })} aria-label="المنطقة">
                      <option value="">—</option>
                      {Object.entries(REGION_AR).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <input type="checkbox" checked={e.libyan} disabled={e.type === 'media'} onChange={(ev) => edit(k, { libyan: ev.target.checked })} aria-label="ليبي" />
                </td>
                <td>
                  <input
                    key={`${k}|${e.name}|${e.aliases.length}`}
                    className="sa-input"
                    defaultValue={e.aliases.join('، ')}
                    onBlur={(ev) =>
                      edit(k, {
                        aliases: ev.target.value
                          .split(/[,،]/)
                          .map((a) => a.trim())
                          .filter(Boolean),
                      })
                    }
                    dir="auto"
                    aria-label="الصيغ الأخرى"
                  />
                </td>
                <td>
                  <button type="button" className="sa-btn sa-btn--ghost sa-btn--small" onClick={() => setRows(list.filter((_x, i) => i !== k))}>
                    حذف
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
