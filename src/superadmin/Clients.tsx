import { useEffect, useState, type FormEvent } from 'react'
import { ROLE_LABEL, api, errText, fmtDate } from './api'

/**
 * العملاء : espaces clients de la plateforme (multi-tenant). Création automatique d'un espace (dossier, processus,
 * premier administrateur du client avec lien d'activation), suspension et réactivation, nombre de comptes,
 * redémarrage, comptes de chaque espace (lecture), et demandes de démonstration reçues par la page d'accueil.
 * Serveur : server/orgsAdmin.js.
 */

type OrgRow = {
  id: string
  main?: boolean
  name: string
  displayName?: string
  status: 'active' | 'suspended'
  plan: string
  seats: number
  contact?: string
  createdAt: string | null
  users: number
  admins: number
  managers: number
  viewers: number
  disabled: number
  pending: number
  state: { running: boolean; pid?: number | null; port?: number; startedAt?: string | null; restarts?: number; lastExit?: { at: string; code: number | null } | null }
}
type OrgUser = { email: string; name: string; role: string; disabled: boolean; pending: boolean; mfa: boolean; createdAt: string | null }
type Demo = { id: string; at: string; name: string; email: string; company: string; role: string; country: string; phone: string; interest: string; message: string; lang: string; status: string }

const ERR: Record<string, string> = {
  NO_NAME: 'اسم المؤسسة مطلوب (حرفان على الأقل).',
  EMAIL_TAKEN: 'هذا البريد مستعمل في مؤسسة أخرى على المنصة.',
  EXISTS: 'توجد مؤسسة بهذا الاسم.',
}
const err = (e: unknown) => ERR[(e as Error)?.message] || errText(e)
const PLANS: Record<string, string> = { essential: 'Essential', professional: 'Professional', enterprise: 'Enterprise' }
const DEMO_STATUS: Record<string, string> = { new: 'جديد', contacted: 'تم التواصل', converted: 'أصبح عميلاً', closed: 'مغلق' }
const fullLink = (path: string) => new URL(path, location.origin).toString()

function LinkBox({ title, path }: { title: string; path: string }) {
  const url = fullLink(path)
  const [copied, setCopied] = useState(false)
  return (
    <div className="sa-note sa-linkbox">
      <p>{title}</p>
      <div className="sa-row">
        <input className="sa-input" readOnly dir="ltr" value={url} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="sa-btn" onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true))}>
          {copied ? 'تم النسخ' : 'نسخ'}
        </button>
      </div>
    </div>
  )
}

export function Clients() {
  const [data, setData] = useState<{ orgs: OrgRow[]; demo: { total: number; fresh: number } } | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ name: string; path: string } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [tab, setTab] = useState<'orgs' | 'demo'>('orgs')
  const load = () =>
    api<{ orgs: OrgRow[]; demo: { total: number; fresh: number } }>('/orgs')
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((e) => setError(err(e)))
  useEffect(() => {
    load()
    const id = setInterval(load, 15_000)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="sa-card sa-card--wide">
      <div className="sa-card__head">
        <h2>العملاء ومساحاتهم</h2>
        <button type="button" className="sa-btn" onClick={() => setCreating(true)}>
          + مساحة عميل جديدة
        </button>
      </div>
      <p className="sa-muted">
        لكل مؤسسة عميلة مساحة معزولة: حساباتها وبياناتها ولوحاتها وإعداداتها في مجلد خاص وعملية خادم خاصة. يدير مسؤول الحساب لدى العميل فريقه من «إدارة الفريق والصلاحيات» داخل المنصة.
      </p>
      <div className="sa-chips">
        <button type="button" className={tab === 'orgs' ? 'is-active' : ''} onClick={() => setTab('orgs')}>
          المساحات ({data ? data.orgs.length : '…'})
        </button>
        <button type="button" className={tab === 'demo' ? 'is-active' : ''} onClick={() => setTab('demo')}>
          طلبات العرض التجريبي {data?.demo.fresh ? <b className="sa-tag is-warn">{data.demo.fresh} جديد</b> : null}
        </button>
      </div>
      {error && <p className="sa-error">{error}</p>}
      {created && <LinkBox title={`تم إنشاء مساحة «${created.name}». أرسل رابط التفعيل هذا إلى مسؤول الحساب لدى العميل (صالح 7 أيام، لمرة واحدة):`} path={created.path} />}
      {tab === 'orgs' && data && (
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>المؤسسة</th>
                <th>الحالة</th>
                <th>الحسابات</th>
                <th>الاشتراك</th>
                <th>العملية</th>
                <th>تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody>
              {data.orgs.map((o) => (
                <tr key={o.id} className="is-click" onClick={() => setOpen(o.id)}>
                  <td>
                    <strong>{o.displayName || o.name}</strong>
                    <small dir="ltr">{o.main ? 'العميل الأصلي (data/)' : o.id}</small>
                  </td>
                  <td>{o.status === 'active' ? <span className="sa-tag is-ok">نشطة</span> : <span className="sa-tag is-bad">موقوفة</span>}</td>
                  <td>
                    {o.users}
                    {o.seats ? <span className="sa-muted"> / {o.seats}</span> : null}
                    <small>
                      {o.admins} مسؤول · {o.managers} مدير · {o.viewers} مستخدم{o.pending ? ` · ${o.pending} بانتظار التفعيل` : ''}
                    </small>
                  </td>
                  <td>{PLANS[o.plan] || o.plan}</td>
                  <td>{o.state.running ? <span className="sa-tag is-ok">تعمل</span> : o.status === 'active' ? <span className="sa-tag is-warn">متوقفة</span> : <span className="sa-muted">—</span>}</td>
                  <td>{fmtDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'demo' && <DemoRequests onChange={load} />}
      {creating && (
        <CreateOrg
          onClose={() => setCreating(false)}
          onDone={(name, path) => {
            setCreating(false)
            setCreated({ name, path })
            load()
          }}
        />
      )}
      {open && data && <OrgSheet org={data.orgs.find((o) => o.id === open)!} onClose={() => setOpen(null)} onChange={load} />}
    </section>
  )
}

function CreateOrg({ onClose, onDone }: { onClose: () => void; onDone: (name: string, path: string) => void }) {
  const [form, setForm] = useState({ name: '', adminEmail: '', adminName: '', seats: 10, plan: 'professional', contact: '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    try {
      const r = await api<{ org: { name: string }; activation: { path: string } }>('/orgs', 'POST', form)
      onDone(r.org.name, r.activation.path)
    } catch (x) {
      setMsg(err(x))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="sa-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <form className="sa-card sa-form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>مساحة عميل جديدة</h2>
        <p className="sa-muted">تُنشأ المساحة فوراً: مجلد بياناتها، وعملية الخادم الخاصة بها، وحساب مسؤول الحساب لدى العميل مع رابط تفعيل.</p>
        <label>
          اسم المؤسسة العميلة
          <input className="sa-input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          بريد مسؤول الحساب لدى العميل (Client Admin)
          <input className="sa-input" type="email" dir="ltr" required value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
        </label>
        <label>
          اسم مسؤول الحساب
          <input className="sa-input" value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
        </label>
        <label>
          الحد الأقصى للحسابات
          <input className="sa-input" type="number" min={1} max={1000} value={form.seats} onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })} />
        </label>
        <label>
          الاشتراك
          <select className="sa-input" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
            {Object.entries(PLANS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          جهة الاتصال (اختياري)
          <input className="sa-input" dir="auto" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
        </label>
        {msg && <p className="sa-error">{msg}</p>}
        <div className="sa-row">
          <button type="submit" className="sa-btn" disabled={busy}>
            {busy ? 'جارٍ الإنشاء…' : 'إنشاء المساحة'}
          </button>
          <button type="button" className="sa-btn sa-btn--ghost" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </div>
  )
}

function OrgSheet({ org, onClose, onChange }: { org: OrgRow; onClose: () => void; onChange: () => void }) {
  const [users, setUsers] = useState<OrgUser[] | null>(null)
  const [msg, setMsg] = useState('')
  const [link, setLink] = useState<{ email: string; path: string } | null>(null)
  const [edit, setEdit] = useState({ name: org.name, seats: org.seats, plan: org.plan, contact: org.contact || '' })
  useEffect(() => {
    api<{ users: OrgUser[] }>(`/orgs/${org.id}/users`)
      .then((r) => setUsers(r.users))
      .catch((e) => setMsg(err(e)))
  }, [org.id])
  const act = async (fn: () => Promise<unknown>, ok = '') => {
    setMsg('')
    try {
      await fn()
      setMsg(ok)
      onChange()
    } catch (e) {
      setMsg(err(e))
    }
  }
  return (
    <div className="sa-modal sa-modal--sheet" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sa-card sa-form" onClick={(e) => e.stopPropagation()}>
        <div className="sa-card__head">
          <h2>{org.displayName || org.name}</h2>
          <button type="button" className="sa-btn sa-btn--ghost" onClick={onClose}>
            إغلاق
          </button>
        </div>
        {org.main ? (
          <p className="sa-muted">العميل الأصلي للمنصة: حساباته في «المستخدمون» وإعداداته في باقي أقسام هذه الوحدة، دون أي تغيير.</p>
        ) : (
          <>
            <p className="sa-muted" dir="ltr">
              {org.id} · port {org.state.port ?? '—'} · pid {org.state.pid ?? '—'} · {org.state.restarts ? `${org.state.restarts} restart(s)` : 'stable'}
            </p>
            <div className="sa-grid2">
              <label>
                الاسم المعروض
                <input className="sa-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </label>
              <label>
                الحد الأقصى للحسابات
                <input className="sa-input" type="number" min={1} max={1000} value={edit.seats} onChange={(e) => setEdit({ ...edit, seats: Number(e.target.value) })} />
              </label>
              <label>
                الاشتراك
                <select className="sa-input" value={edit.plan} onChange={(e) => setEdit({ ...edit, plan: e.target.value })}>
                  {Object.entries(PLANS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                جهة الاتصال
                <input className="sa-input" dir="auto" value={edit.contact} onChange={(e) => setEdit({ ...edit, contact: e.target.value })} />
              </label>
            </div>
            <div className="sa-row">
              <button type="button" className="sa-btn" onClick={() => act(() => api(`/orgs/${org.id}`, 'PATCH', edit), 'تم الحفظ.')}>
                حفظ
              </button>
              {org.status === 'active' ? (
                <button type="button" className="sa-btn sa-btn--bad" onClick={() => window.confirm(`إيقاف مساحة «${org.name}»؟ لن يتمكن أي من مستخدميها من الدخول، وتبقى بياناتها محفوظة.`) && act(() => api(`/orgs/${org.id}`, 'PATCH', { status: 'suspended' }), 'تم إيقاف المساحة.')}>
                  إيقاف المساحة
                </button>
              ) : (
                <button type="button" className="sa-btn" onClick={() => act(() => api(`/orgs/${org.id}`, 'PATCH', { status: 'active' }), 'تمت إعادة تفعيل المساحة.')}>
                  إعادة التفعيل
                </button>
              )}
              {org.status === 'active' && (
                <button type="button" className="sa-btn sa-btn--ghost" onClick={() => act(() => api(`/orgs/${org.id}/restart`, 'POST'), 'أُعيد تشغيل عملية المساحة.')}>
                  إعادة تشغيل العملية
                </button>
              )}
            </div>
          </>
        )}
        {msg && <p className="sa-note">{msg}</p>}
        {link && <LinkBox title={`رابط تفعيل جديد لـ ${link.email} (صالح 7 أيام):`} path={link.path} />}
        <h3>الحسابات ({users?.length ?? '…'})</h3>
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>الحساب</th>
                <th>الدور</th>
                <th>الحالة</th>
                <th>أُنشئ</th>
                {!org.main && <th />}
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.email}>
                  <td>
                    <strong>{u.name}</strong>
                    <small dir="ltr">{u.email}</small>
                  </td>
                  <td>
                    <span className={u.role === 'admin' ? 'sa-tag is-gold' : 'sa-tag'}>{ROLE_LABEL[u.role] || u.role}</span>
                  </td>
                  <td>{u.disabled ? <span className="sa-tag is-bad">معطّل</span> : u.pending ? <span className="sa-tag is-warn">بانتظار التفعيل</span> : <span className="sa-tag is-ok">نشط</span>}</td>
                  <td>{fmtDate(u.createdAt)}</td>
                  {!org.main && (
                    <td>
                      <button
                        type="button"
                        className="sa-btn sa-btn--ghost"
                        onClick={() =>
                          act(async () => {
                            const r = await api<{ activation: { email: string; path: string } }>(`/orgs/${org.id}/activation`, 'POST', { email: u.email })
                            setLink(r.activation)
                          })
                        }
                      >
                        رابط تفعيل
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function DemoRequests({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Demo[] | null>(null)
  const [msg, setMsg] = useState('')
  const load = () =>
    api<{ requests: Demo[] }>('/demo-requests')
      .then((r) => setRows(r.requests))
      .catch((e) => setMsg(err(e)))
  useEffect(() => {
    load()
  }, [])
  if (msg) return <p className="sa-error">{msg}</p>
  if (!rows) return null
  if (!rows.length) return <p className="sa-muted">لا طلبات بعد. تصل الطلبات من زر «Request a demo» في الصفحة الرئيسية، وتُرسل أيضاً إلى بريد الدعم الفني.</p>
  return (
    <div className="sa-table-wrap">
      <table className="sa-table">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>الشخص</th>
            <th>المؤسسة</th>
            <th>الاهتمام والرسالة</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{fmtDate(r.at)}</td>
              <td>
                <strong>{r.name}</strong>
                <small dir="ltr">
                  <a href={`mailto:${r.email}`}>{r.email}</a>
                  {r.phone ? ` · ${r.phone}` : ''}
                </small>
              </td>
              <td>
                <strong>{r.company}</strong>
                <small>{[r.role, r.country].filter(Boolean).join(' · ')}</small>
              </td>
              <td>
                <span className="sa-tag">{r.interest}</span>
                {r.message && <small dir="auto">{r.message}</small>}
              </td>
              <td>
                <select
                  className="sa-input"
                  value={r.status}
                  onChange={(e) =>
                    api(`/demo-requests/${r.id}`, 'PATCH', { status: e.target.value })
                      .then(() => (load(), onChange()))
                      .catch((x) => setMsg(err(x)))
                  }
                >
                  {Object.entries(DEMO_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
