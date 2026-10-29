import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { api, errText, flag, fmtDate, fmtNum } from './api'

/**
 * Réglages client de la console : pays et portée d'une source (ligne du tableau مصادر التغذية), logo et nom du client
 * (en tête des tableaux de bord), clés d'API, liens de partage des tableaux.
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

/** Pays (code ISO) et portée d'une source, modifiables sur place */
const RELIABILITY: Record<string, string> = { high: 'موثوق', medium: 'متوسط', low: 'غير مؤكد' }

export function SourceMetaCell({
  name,
  country,
  reach,
  reachSet,
  reliability = 'medium',
  reliabilitySet = false,
  onSaved,
}: {
  name: string
  country: string
  reach: number
  reachSet: boolean
  reliability?: string
  reliabilitySet?: boolean
  onSaved: (msg: string) => void
}) {
  const [cc, setCc] = useState(country)
  const [r, setR] = useState(reachSet ? String(reach) : '')
  // '' = valeur déduite (site officiel, réseau social, média)
  const [rel, setRel] = useState(reliabilitySet ? reliability : '')
  const [busy, setBusy] = useState(false)
  const dirty = cc !== country || r !== (reachSet ? String(reach) : '') || rel !== (reliabilitySet ? reliability : '')
  async function save() {
    setBusy(true)
    try {
      await api('/sources/meta', 'PUT', { name, country: cc.trim().toUpperCase(), reach: r.trim() === '' ? null : Number(r), reliability: rel })
      onSaved(`تم حفظ بلد «${name}» ومدى انتشاره وموثوقيته.`)
    } catch (e) {
      onSaved(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="sa-meta">
      <span className="sa-meta__flag">{flag(cc.toUpperCase())}</span>
      <input className="sa-input sa-meta__cc" value={cc} maxLength={2} onChange={(e) => setCc(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())} placeholder="LY" aria-label={`بلد ${name}`} dir="ltr" />
      <input
        className="sa-input sa-meta__reach"
        value={r}
        inputMode="numeric"
        onChange={(e) => setR(e.target.value.replace(/[^\d]/g, ''))}
        placeholder={`${fmtNum(reach)} (تقديري)`}
        aria-label={`مدى انتشار ${name}`}
        dir="ltr"
      />
      <select className="sa-input sa-meta__rel" value={rel} onChange={(e) => setRel(e.target.value)} aria-label={`موثوقية ${name}`}>
        <option value="">{`${RELIABILITY[reliability] ?? RELIABILITY.medium} (تلقائي)`}</option>
        {Object.entries(RELIABILITY).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {dirty && (
        <button type="button" className="sa-btn sa-btn--small" onClick={save} disabled={busy}>
          حفظ
        </button>
      )}
    </span>
  )
}

/* ---------------------------------------------------------------- شعار العميل */

export function BrandCard({ onMsg }: { onMsg: (m: string) => void }) {
  const { data, reload } = useList<{ brand: { name: string; logo: string; assistant?: string } }>('/brand')
  const [name, setName] = useState<string | null>(null)
  const [assistant, setAssistant] = useState<string | null>(null)
  const shown = name ?? data?.brand.name ?? ''
  const shownAssistant = assistant ?? data?.brand.assistant ?? ''
  async function save(patch: { name?: string; logo?: string; assistant?: string }) {
    try {
      await api('/brand', 'PUT', patch)
      onMsg('تم حفظ هوية العميل.')
      setName(null)
      reload()
    } catch (e) {
      onMsg(errText(e))
    }
  }
  function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return onMsg('الصيغ المقبولة: PNG أو JPEG أو WebP.')
    if (file.size > 290_000) return onMsg('حجم الشعار يجب ألا يتجاوز 290 كيلوبايت.')
    const reader = new FileReader()
    reader.onload = () => save({ logo: String(reader.result) })
    reader.readAsDataURL(file)
  }
  return (
    <div className="sa-card">
      <div className="sa-card__head">
        <h2>هوية العميل في لوحات القيادة</h2>
      </div>
      <p className="sa-muted">يظهر الشعار والاسم في رأس كل لوحة قيادة وفي الروابط المشتركة. بدون شعار يُستعمل شعار المنصة.</p>
      <div className="sa-row">
        <img className="sa-brandlogo" src={data?.brand.logo || '/logo-npdc.png'} alt="" />
      </div>
      <input className="sa-input" placeholder="اسم العميل (اختياري)" value={shown} maxLength={120} onChange={(e) => setName(e.target.value)} dir="auto" />
      <input className="sa-input" placeholder="اسم المساعد الذكي (Around افتراضياً)" value={shownAssistant} maxLength={40} onChange={(e) => setAssistant(e.target.value)} dir="auto" aria-label="اسم المساعد الذكي" />
      <div className="sa-row">
        <button type="button" className="sa-btn" onClick={() => save({ name: shown, assistant: shownAssistant })}>
          حفظ الاسم
        </button>
        <label className="sa-btn sa-btn--ghost">
          تغيير الشعار
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
        </label>
        {data?.brand.logo && (
          <button type="button" className="sa-btn sa-btn--ghost" onClick={() => save({ logo: '' })}>
            حذف الشعار
          </button>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- مفاتيح API */

type KeyRow = { id: string; name: string; prefix: string; rate: number; createdAt: string; revokedAt: string | null; lastUsedAt: string | null; calls: number }

export function ApiKeysCard({ onMsg }: { onMsg: (m: string) => void }) {
  const { data, reload } = useList<{ keys: KeyRow[] }>('/apikeys')
  const [name, setName] = useState('')
  const [rate, setRate] = useState('60')
  const [fresh, setFresh] = useState('')
  async function create(e: FormEvent) {
    e.preventDefault()
    try {
      const r = await api<{ key: string }>('/apikeys', 'POST', { name, rate: Number(rate) })
      setFresh(r.key)
      setName('')
      reload()
    } catch (err) {
      onMsg(errText(err))
    }
  }
  async function revoke(k: KeyRow) {
    if (!window.confirm(`إلغاء مفتاح «${k.name}»؟ يتوقف العميل عن الوصول فوراً.`)) return
    try {
      await api(`/apikeys/${k.id}`, 'DELETE')
      reload()
    } catch (err) {
      onMsg(errText(err))
    }
  }
  return (
    <div className="sa-card sa-card--wide">
      <div className="sa-card__head">
        <h2>مفاتيح API للعملاء (قراءة فقط)</h2>
      </div>
      <p className="sa-muted" dir="auto">
        يقرأ العميل الأخبار المفلترة بصيغة JSON: <code dir="ltr">GET /api/v1/news?q=…&amp;days=7&amp;country=LY</code> مع الترويسة <code dir="ltr">Authorization: Bearer mms_…</code>. حد لكل مفتاح في الدقيقة و2000 طلب يومياً.
      </p>
      <form className="sa-row" onSubmit={create}>
        <input className="sa-input" placeholder="اسم العميل" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required dir="auto" />
        <input className="sa-input sa-meta__reach" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d]/g, ''))} aria-label="طلبات في الدقيقة" dir="ltr" />
        <span className="sa-muted">طلب/دقيقة</span>
        <button type="submit" className="sa-btn">
          إنشاء مفتاح
        </button>
      </form>
      {fresh && (
        <p className="sa-note">
          المفتاح الجديد (يظهر مرة واحدة فقط، انسخه الآن): <code dir="ltr" className="sa-secret">{fresh}</code>
        </p>
      )}
      <table className="sa-table">
        <thead>
          <tr>
            <th>العميل</th>
            <th>المفتاح</th>
            <th>الحد</th>
            <th>الطلبات</th>
            <th>آخر استعمال</th>
            <th>الحالة</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(data?.keys ?? []).map((k) => (
            <tr key={k.id}>
              <td dir="auto">{k.name}</td>
              <td dir="ltr">{k.prefix}…</td>
              <td>{k.rate}/د</td>
              <td>{fmtNum(k.calls)}</td>
              <td>{fmtDate(k.lastUsedAt)}</td>
              <td>{k.revokedAt ? <span className="sa-tag is-bad">ملغى</span> : <span className="sa-tag">نشط</span>}</td>
              <td>
                {!k.revokedAt && (
                  <button type="button" className="sa-btn sa-btn--ghost sa-btn--small" onClick={() => revoke(k)}>
                    إلغاء
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------------------------------------------------------- روابط المشاركة */

type ShareRow = { id: string; boardName: string; boardId: string; createdBy: string; createdAt: string; expiresAt: string; status: string; views: number; lastViewAt: string | null }
const STATUS: Record<string, [string, string]> = { active: ['نشط', ''], expired: ['منتهٍ', 'is-warn'], revoked: ['ملغى', 'is-bad'] }

export function SharesCard({ onMsg }: { onMsg: (m: string) => void }) {
  const { data, reload } = useList<{ shares: ShareRow[] }>('/shares')
  async function revoke(s: ShareRow) {
    try {
      await api(`/shares/${s.id}`, 'DELETE')
      reload()
    } catch (err) {
      onMsg(errText(err))
    }
  }
  return (
    <div className="sa-card sa-card--wide">
      <div className="sa-card__head">
        <h2>روابط مشاركة لوحات القيادة</h2>
      </div>
      <p className="sa-muted">روابط للقراءة فقط أنشأها المستخدمون. الرابط لا يعرض إلا لوحته، وينتهي تلقائياً، ويمكن إلغاؤه من هنا.</p>
      {!data?.shares.length ? (
        <p className="sa-muted">لا توجد روابط.</p>
      ) : (
        <table className="sa-table">
          <thead>
            <tr>
              <th>اللوحة</th>
              <th>أنشأه</th>
              <th>تاريخ الإنشاء</th>
              <th>ينتهي</th>
              <th>المشاهدات</th>
              <th>الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.shares.map((s) => (
              <tr key={s.id}>
                <td dir="auto">{s.boardName || s.boardId}</td>
                <td dir="ltr">{s.createdBy}</td>
                <td>{fmtDate(s.createdAt)}</td>
                <td>{fmtDate(s.expiresAt)}</td>
                <td>{fmtNum(s.views)}</td>
                <td>
                  <span className={`sa-tag ${STATUS[s.status]?.[1] ?? ''}`}>{STATUS[s.status]?.[0] ?? s.status}</span>
                </td>
                <td>
                  {s.status === 'active' && (
                    <button type="button" className="sa-btn sa-btn--ghost sa-btn--small" onClick={() => revoke(s)}>
                      إلغاء
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
