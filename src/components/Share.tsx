import { useEffect, useState } from 'react'
import { type Board, ROW_PX, GAP_PX } from '../lib/dashboards'
import { useI18n } from '../lib/i18n'
import { WidgetBody, useWidgetTitles } from './Charts'
import { type WidgetConf } from '../lib/dashboards'
import './listing.css'

/** Partage d'un tableau de bord par lien (lecture seule, expiration, révocation) et page publique du lien */

export type Brand = { name: string; logo: string }

/** Logo et nom du client, réglés dans la console Super Admin (sinon le logo de la plateforme) */
export function useBrand() {
  const [brand, setBrand] = useState<Brand | null>(null)
  useEffect(() => {
    fetch('/api/platform/brand')
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setBrand(b ?? { name: '', logo: '' }))
      .catch(() => setBrand({ name: '', logo: '' }))
  }, [])
  return brand
}

const TEXT = {
  ar: {
    share: 'مشاركة',
    title: 'مشاركة اللوحة برابط للقراءة فقط',
    intro: 'من يملك الرابط يرى هذه اللوحة فقط، دون تسجيل الدخول، ولا يمكنه البحث أو فتح صفحات أخرى. يمكنك إلغاء الرابط في أي وقت.',
    expires: 'مدة الصلاحية',
    days: { 1: 'يوم واحد', 7: '7 أيام', 30: '30 يوماً', 90: '90 يوماً' } as Record<number, string>,
    create: 'إنشاء الرابط',
    copy: 'نسخ',
    copied: 'تم النسخ',
    once: 'احفظ الرابط الآن: لن يظهر مرة أخرى.',
    active: 'الروابط الحالية لهذه اللوحة',
    none: 'لا توجد روابط نشطة.',
    revoke: 'إلغاء',
    until: (d: string) => `ينتهي ${d}`,
    views: (n: number) => `${n} مشاهدة`,
    close: 'إغلاق',
    error: 'تعذّرت العملية.',
    expired: 'هذا الرابط غير صالح أو انتهت صلاحيته.',
    readOnly: 'لوحة مشتركة للقراءة فقط',
    unsaved: 'احفظ اللوحة أولاً («تعديل اللوحة» ثم «حفظ») قبل مشاركتها.',
  },
  en: {
    share: 'Share',
    title: 'Share the dashboard with a read-only link',
    intro: 'Anyone with the link sees this dashboard only, without signing in, and cannot search or open other pages. You can revoke the link at any time.',
    expires: 'Valid for',
    days: { 1: '1 day', 7: '7 days', 30: '30 days', 90: '90 days' } as Record<number, string>,
    create: 'Create link',
    copy: 'Copy',
    copied: 'Copied',
    once: 'Save the link now: it will not be shown again.',
    active: 'Current links for this dashboard',
    none: 'No active links.',
    revoke: 'Revoke',
    until: (d: string) => `expires ${d}`,
    views: (n: number) => `${n} views`,
    close: 'Close',
    error: 'The operation failed.',
    expired: 'This link is invalid or has expired.',
    readOnly: 'Shared read-only dashboard',
    unsaved: 'Save the dashboard first (“Edit” then “Save”) before sharing it.',
  },
}

type ShareRow = { id: string; boardId: string; boardName: string; createdBy: string; createdAt: string; expiresAt: string; status: string; views: number }

// onPersist : enregistre les tableaux par défaut quand aucun n'a encore été enregistré sur le serveur
export function ShareDialog({ board, boardName, onClose, onPersist }: { board: Board; boardName: string; onClose: () => void; onPersist?: () => Promise<boolean> }) {
  const i = useI18n()
  const s = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const [days, setDays] = useState(7)
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [rows, setRows] = useState<ShareRow[]>([])
  const [msg, setMsg] = useState('')
  const load = () =>
    fetch('/api/shares')
      .then((r) => (r.ok ? r.json() : { shares: [] }))
      .then((j) => setRows((j.shares as ShareRow[]).filter((x) => x.boardId === board.id && x.status === 'active')))
      .catch(() => {})
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id])
  async function create() {
    setMsg('')
    const post = () => fetch('/api/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boardId: board.id, boardName, days }) })
    let res = await post()
    if (res.status === 404 && onPersist && (await onPersist())) res = await post()
    const json = await res.json().catch(() => ({}))
    if (json.error === 'NO_BOARD') return setMsg(s.unsaved)
    if (!res.ok) return setMsg(`${s.error} (${json.error || res.status})`)
    setLink(`${location.origin}/share/${json.token}`)
    setCopied(false)
    load()
  }
  async function revoke(id: string) {
    await fetch(`/api/shares/${id}`, { method: 'DELETE' }).catch(() => {})
    load()
  }
  return (
    <div className="mms-modal" role="dialog" aria-modal="true" aria-label={s.title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mms-modal__box">
        <h3>
          {s.title} — <span dir="auto">{boardName}</span>
        </h3>
        <p className="news-status">{s.intro}</p>
        <label>
          <span>{s.expires}</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[1, 7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {s.days[d]}
              </option>
            ))}
          </select>
        </label>
        <div className="mms-modal__actions">
          <button type="button" className="news-btn" onClick={create}>
            {s.create}
          </button>
        </div>
        {link && (
          <>
            <div className="mms-sharelink">
              <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="URL" />
              <button
                type="button"
                className="news-btn news-btn--ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {})
                }}
              >
                {copied ? s.copied : s.copy}
              </button>
            </div>
            <p className="news-status">{s.once}</p>
          </>
        )}
        {msg && <p className="news-status news-status--error">{msg}</p>}
        <h4>{s.active}</h4>
        {rows.length === 0 ? (
          <p className="news-status">{s.none}</p>
        ) : (
          <ul className="mms-sharelist">
            {rows.map((r) => (
              <li key={r.id}>
                <b dir="ltr">…{r.id.slice(-4)}</b>
                <span>{s.until(i.dateTime(r.expiresAt))}</span>
                <span>{s.views(r.views)}</span>
                <span dir="ltr">{r.createdBy}</span>
                <button type="button" className="news-btn news-btn--ghost" onClick={() => revoke(r.id)}>
                  {s.revoke}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mms-modal__actions">
          <button type="button" className="news-btn news-btn--ghost" onClick={onClose}>
            {s.close}
          </button>
        </div>
      </div>
    </div>
  )
}

function SharedWidget({ conf }: { conf: WidgetConf }) {
  const { path, title } = useWidgetTitles(conf)
  return (
    <article className="mms-widget mms-cell" style={{ gridColumn: `${conf.x + 1} / span ${conf.w}`, gridRow: `${conf.y + 1} / span ${conf.h}`, ['--h' as string]: conf.h }}>
      <header className={`mms-widget__head mms-widget__head--${conf.type === 'news' ? 'red' : 'plain'}`}>
        <div>
          <span>{path}</span>
          <strong dir="auto">{title}</strong>
        </div>
      </header>
      <div className="mms-widget__body mms-cell__body">
        <WidgetBody conf={conf} />
      </div>
    </article>
  )
}

/** Page publique /share/<jeton> : le tableau, en lecture seule, avec le logo du client */
export function SharedBoard({ token }: { token: string }) {
  const i = useI18n()
  const s = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const [data, setData] = useState<{ board: Board; expiresAt: string; brand: Brand } | null | undefined>(undefined)
  useEffect(() => {
    fetch(`/api/public/share/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
  }, [token])
  if (data === undefined) return <div className="mms-boot" aria-busy="true" />
  if (!data)
    return (
      <div className="mms-maintenance" dir={i.dir}>
        <p>{s.expired}</p>
      </div>
    )
  const ordered = [...data.board.widgets].sort((a, b) => a.y - b.y || a.x - b.x)
  return (
    <div className="mms-shared" dir={i.dir} lang={i.lang}>
      <header className="mms-boardhead">
        <img src={data.brand.logo || '/logo-npdc.png'} alt={data.brand.name || ''} />
        <div>
          <h2 dir="auto">{data.board.name || data.brand.name || 'MMS'}</h2>
          <small>
            {s.readOnly} · {s.until(i.dateTime(data.expiresAt))}
          </small>
        </div>
      </header>
      <div className="mms-grid" style={{ gridAutoRows: `${ROW_PX}px`, gap: `${GAP_PX}px` }}>
        {ordered.map((w) => (
          <SharedWidget key={w.id} conf={w} />
        ))}
      </div>
      <p className="mms-shared__foot" dir="ltr">
        MMS — Around Expressions
      </p>
    </div>
  )
}
