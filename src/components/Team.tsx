import { useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '../lib/i18n'
import { useAuth } from '../lib/auth'
import { PageHead } from './Extras'
import './team.css'

/**
 * إدارة الفريق والصلاحيات : l'administrateur de l'organisation (Client Admin) gère ses comptes sans passer par
 * Around Expressions — création (lien d'activation ou mot de passe provisoire), rôle, profil de permissions,
 * désactivation, sessions, suppression ; profils de permissions de l'organisation ; activité des comptes.
 * Serveur : /api/team (server/team.js), limité aux comptes de l'organisation de la session.
 */

type Member = { email: string; name: string; role: Role; profile: string; profileName: string; disabled: boolean; pending: boolean; mfa: boolean; createdAt: string | null; lastSeen: string | null; online: boolean; sessions: number }
type Role = 'admin' | 'analyst' | 'viewer'
type ProfileRef = { id: string; name: string; builtin: boolean }
type TeamData = { org: { id: string; name: string; main: boolean; seats?: number }; seats: number; users: Member[]; profiles: ProfileRef[] }
type Perm = { key: string; label: string }
type Profile = ProfileRef & { modules: string[]; actions: string[]; users: number }
type PermData = { modules: Perm[]; actions: Perm[]; profiles: Profile[] }
type Activity = { t: string; user: string; type: string; detail: string; ip: string }
type Tab = 'members' | 'profiles' | 'activity'

const TEXT = {
  ar: {
    title: 'إدارة الفريق والصلاحيات',
    intro: 'أنشئ حسابات فريقك، وحدّد دور كل عضو وصلاحياته، وتابع نشاط الحسابات. كل ما هنا خاص بمؤسستك وحدها.',
    tabs: { members: 'الأعضاء', profiles: 'ملفات الصلاحيات', activity: 'النشاط' },
    roles: { admin: 'مسؤول الحساب', analyst: 'مدير', viewer: 'مستخدم' } as Record<Role, string>,
    roleHelp: { admin: 'يدير الفريق والصلاحيات وكل وظائف المنصة', analyst: 'ينشئ الرصد واللوحات والتقارير ويشغّل التحليل', viewer: 'اطلاع وبحث وتصدير حسب الصلاحيات' } as Record<Role, string>,
    seats: (n: number, max: number) => (max ? `${n} من ${max} حساباً` : `${n} حساباً`),
    add: 'إضافة عضو',
    email: 'البريد الإلكتروني',
    name: 'الاسم',
    role: 'الدور',
    profile: 'ملف الصلاحيات',
    profileOfRole: 'حسب الدور',
    mode: 'طريقة الدخول الأولى',
    modeLink: 'رابط تفعيل (يختار العضو كلمة مروره)',
    modePw: 'كلمة مرور مؤقتة',
    password: 'كلمة المرور المؤقتة (10 أحرف على الأقل)',
    create: 'إنشاء الحساب',
    cancel: 'إلغاء',
    linkReady: 'رابط التفعيل جاهز، صالح 7 أيام ولمرة واحدة. أرسله إلى العضو:',
    copy: 'نسخ',
    copied: 'تم النسخ',
    cols: ['العضو', 'الدور', 'ملف الصلاحيات', 'الحالة', 'آخر نشاط', ''],
    active: 'نشط',
    online: 'متصل الآن',
    pending: 'بانتظار التفعيل',
    disabled: 'معطّل',
    never: 'لم يدخل بعد',
    you: 'أنت',
    disable: 'تعطيل',
    enable: 'تفعيل',
    newLink: 'رابط جديد',
    logout: 'إنهاء الجلسات',
    remove: 'حذف',
    confirmRemove: (e: string) => `حذف الحساب ${e} نهائياً؟`,
    closed: (n: number) => `أُنهيت ${n} جلسة.`,
    errors: {
      BAD_EMAIL: 'البريد الإلكتروني غير صالح.',
      EXISTS: 'هذا البريد مستعمل في المنصة.',
      SEATS: 'بلغت مؤسستك الحد الأقصى للحسابات في اشتراكها. اتصل بـ Around Expressions لزيادته.',
      SHORT_PASSWORD: 'كلمة المرور قصيرة: 10 أحرف على الأقل.',
      LAST_ADMIN: 'يجب أن يبقى مسؤول حساب نشط واحد على الأقل.',
      SELF: 'لا يمكنك تغيير دورك أو تعطيل حسابك بنفسك.',
      BAD_PROFILE: 'ملف الصلاحيات غير موجود.',
      NO_MODULE: 'اختر صفحة واحدة على الأقل.',
      EXISTS_PROFILE: 'يوجد ملف بهذا الاسم.',
      FAILED: 'تعذّرت العملية.',
    } as Record<string, string>,
    newProfile: 'ملف جديد',
    profileName: 'اسم الملف',
    copyOf: 'نسخة من',
    none: 'بدون صلاحيات',
    modules: 'الصفحات',
    actions: 'الأزرار والعمليات',
    save: 'حفظ',
    saved: 'تم الحفظ.',
    builtin: 'ملف أساسي (حسب الدور)',
    usedBy: (n: number) => `${n} حساب`,
    deleteProfile: 'حذف الملف',
    actTypes: { '': 'كل العمليات', login: 'دخول', logout: 'خروج', search: 'بحث', filter: 'تصفية', export: 'تصدير', report: 'تقرير', ai: 'ذكاء اصطناعي', send: 'إرسال', share: 'مشاركة', delete: 'حذف', alert: 'تنبيه', open: 'فتح', print: 'طباعة', view: 'عرض' } as Record<string, string>,
    allUsers: 'كل الأعضاء',
    days: (n: number) => `آخر ${n} أيام`,
    actCols: ['التاريخ', 'العضو', 'العملية', 'التفاصيل'],
    empty: 'لا نشاط في هذه الفترة.',
  },
  en: {
    title: 'Team & permissions',
    intro: "Create your team's accounts, set each member's role and permissions, and follow account activity. Everything here belongs to your organisation only.",
    tabs: { members: 'Members', profiles: 'Permission profiles', activity: 'Activity' },
    roles: { admin: 'Client Admin', analyst: 'Manager', viewer: 'User' } as Record<Role, string>,
    roleHelp: { admin: 'Manages the team, permissions and every platform feature', analyst: 'Creates watches, dashboards and reports, runs analysis', viewer: 'Read, search and export as permitted' } as Record<Role, string>,
    seats: (n: number, max: number) => (max ? `${n} of ${max} accounts` : `${n} accounts`),
    add: 'Add member',
    email: 'Email',
    name: 'Name',
    role: 'Role',
    profile: 'Permission profile',
    profileOfRole: 'From role',
    mode: 'First sign-in',
    modeLink: 'Activation link (member chooses a password)',
    modePw: 'Temporary password',
    password: 'Temporary password (at least 10 characters)',
    create: 'Create account',
    cancel: 'Cancel',
    linkReady: 'Activation link ready, valid 7 days and single-use. Send it to the member:',
    copy: 'Copy',
    copied: 'Copied',
    cols: ['Member', 'Role', 'Permission profile', 'Status', 'Last activity', ''],
    active: 'Active',
    online: 'Online now',
    pending: 'Awaiting activation',
    disabled: 'Disabled',
    never: 'Never signed in',
    you: 'You',
    disable: 'Disable',
    enable: 'Enable',
    newLink: 'New link',
    logout: 'End sessions',
    remove: 'Delete',
    confirmRemove: (e: string) => `Permanently delete ${e}?`,
    closed: (n: number) => `${n} session(s) ended.`,
    errors: {
      BAD_EMAIL: 'Invalid email address.',
      EXISTS: 'This email is already used on the platform.',
      SEATS: "Your organisation has reached its subscription's account limit. Contact Around Expressions to raise it.",
      SHORT_PASSWORD: 'Password too short: at least 10 characters.',
      LAST_ADMIN: 'At least one active Client Admin must remain.',
      SELF: 'You cannot change your own role or disable your own account.',
      BAD_PROFILE: 'Unknown permission profile.',
      NO_MODULE: 'Select at least one page.',
      EXISTS_PROFILE: 'A profile with this name already exists.',
      FAILED: 'The operation failed.',
    } as Record<string, string>,
    newProfile: 'New profile',
    profileName: 'Profile name',
    copyOf: 'Copy of',
    none: 'No permissions',
    modules: 'Pages',
    actions: 'Buttons & operations',
    save: 'Save',
    saved: 'Saved.',
    builtin: 'Base profile (from role)',
    usedBy: (n: number) => `${n} account(s)`,
    deleteProfile: 'Delete profile',
    actTypes: { '': 'All operations', login: 'Sign-in', logout: 'Sign-out', search: 'Search', filter: 'Filter', export: 'Export', report: 'Report', ai: 'AI', send: 'Send', share: 'Share', delete: 'Delete', alert: 'Alert', open: 'Open', print: 'Print', view: 'View' } as Record<string, string>,
    allUsers: 'All members',
    days: (n: number) => `Last ${n} days`,
    actCols: ['Date', 'Member', 'Operation', 'Details'],
    empty: 'No activity in this period.',
  },
}
type T = (typeof TEXT)['ar']

async function api<R>(url: string, method = 'GET', body?: unknown): Promise<R> {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'FAILED')
  return json as R
}

export default function Team() {
  const i = useI18n()
  const t = TEXT[i.lang === 'en' ? 'en' : 'ar']
  const [tab, setTab] = useState<Tab>('members')
  const [data, setData] = useState<TeamData | null>(null)
  const [error, setError] = useState('')
  const load = () =>
    api<TeamData>('/api/team')
      .then(setData)
      .catch((e) => setError(e.message))
  useEffect(() => {
    load()
  }, [])
  return (
    <div className="tm">
      <PageHead title={t.title} intro={t.intro} />
      {data && (
        <p className="tm-org">
          <strong dir="auto">{data.org.name}</strong>
          <span>{t.seats(data.users.length, data.seats)}</span>
        </p>
      )}
      <div className="mms-rtabs tm-tabs" role="tablist">
        {(Object.keys(t.tabs) as Tab[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-active' : ''} onClick={() => setTab(k)}>
            {t.tabs[k]}
          </button>
        ))}
      </div>
      {error && !data && <p className="news-status news-status--error">{t.errors[error] ?? i.t.loadError}</p>}
      {tab === 'members' && data && <Members t={t} data={data} reload={load} />}
      {tab === 'profiles' && <Profiles t={t} onChange={load} />}
      {tab === 'activity' && data && <ActivityLog t={t} users={data.users} />}
    </div>
  )
}

function CopyLink({ t, url }: { t: T; url: string }) {
  const full = new URL(url, location.origin).toString()
  const [done, setDone] = useState(false)
  return (
    <div className="tm-link">
      <p>{t.linkReady}</p>
      <div>
        <input readOnly value={full} dir="ltr" onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          onClick={() =>
            navigator.clipboard
              ?.writeText(full)
              .then(() => setDone(true))
              .catch(() => {})
          }
        >
          {done ? t.copied : t.copy}
        </button>
      </div>
    </div>
  )
}

function Members({ t, data, reload }: { t: T; data: TeamData; reload: () => void }) {
  const i = useI18n()
  const me = useAuth()?.user?.email?.toLowerCase()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', role: 'viewer' as Role, profile: '', mode: 'link', password: '' })
  const [msg, setMsg] = useState<{ error?: string; link?: string; info?: string; for?: string }>({})
  const [busy, setBusy] = useState(false)
  const full = Boolean(data.seats && data.users.length >= data.seats)

  async function run(fn: () => Promise<unknown>, target = '') {
    setBusy(true)
    setMsg({})
    try {
      await fn()
      reload()
    } catch (e) {
      setMsg({ error: (e as Error).message, for: target })
    } finally {
      setBusy(false)
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    await run(async () => {
      const r = await api<{ activation: { url: string } | null }>('/api/team/users', 'POST', {
        email: form.email.trim(),
        name: form.name.trim(),
        role: form.role,
        profile: form.profile,
        ...(form.mode === 'password' ? { password: form.password } : {}),
      })
      setAdding(false)
      setForm({ email: '', name: '', role: 'viewer', profile: '', mode: 'link', password: '' })
      if (r.activation) setMsg({ link: r.activation.url, for: form.email.trim().toLowerCase() })
    })
  }

  const patch = (email: string, body: object) => run(() => api(`/api/team/users/${encodeURIComponent(email)}`, 'PATCH', body), email)
  const custom = data.profiles.filter((p) => !p.builtin)

  return (
    <section className="tm-members">
      <div className="tm-bar">
        <button type="button" className="tm-primary" disabled={full || busy} onClick={() => setAdding(!adding)} title={full ? t.errors.SEATS : undefined}>
          + {t.add}
        </button>
        {full && <span className="tm-warn">{t.errors.SEATS}</span>}
      </div>
      {adding && (
        <form className="tm-form" onSubmit={create}>
          <label>
            <span>{t.email}</span>
            <input type="email" required dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoFocus />
          </label>
          <label>
            <span>{t.name}</span>
            <input value={form.name} dir="auto" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            <span>{t.role}</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {(['viewer', 'analyst', 'admin'] as Role[]).map((r) => (
                <option key={r} value={r}>
                  {t.roles[r]}
                </option>
              ))}
            </select>
            <small>{t.roleHelp[form.role]}</small>
          </label>
          <label>
            <span>{t.profile}</span>
            <select value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })}>
              <option value="">{t.profileOfRole}</option>
              {custom.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>{t.mode}</legend>
            <label className="tm-radio">
              <input type="radio" name="mode" checked={form.mode === 'link'} onChange={() => setForm({ ...form, mode: 'link' })} /> {t.modeLink}
            </label>
            <label className="tm-radio">
              <input type="radio" name="mode" checked={form.mode === 'password'} onChange={() => setForm({ ...form, mode: 'password' })} /> {t.modePw}
            </label>
            {form.mode === 'password' && <input type="password" dir="ltr" minLength={10} required autoComplete="new-password" aria-label={t.password} placeholder={t.password} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
          </fieldset>
          <div className="tm-actions">
            <button type="submit" className="tm-primary" disabled={busy}>
              {t.create}
            </button>
            <button type="button" onClick={() => setAdding(false)}>
              {t.cancel}
            </button>
          </div>
        </form>
      )}
      {msg.error && (
        <p className="mms-note mms-note--danger" role="alert">
          {msg.for && <b dir="ltr">{msg.for} · </b>}
          {t.errors[msg.error] ?? t.errors.FAILED}
        </p>
      )}
      {msg.info && <p className="mms-note">{msg.info}</p>}
      {msg.link && <CopyLink key={msg.link} t={t} url={msg.link} />}
      <div className="tm-table">
        <table>
          <thead>
            <tr>
              {t.cols.map((c, k) => (
                <th key={k}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => {
              const self = u.email.toLowerCase() === me
              return (
                <tr key={u.email} className={u.disabled ? 'is-off' : undefined}>
                  <td>
                    <strong dir="auto">{u.name}</strong>
                    {self && <em className="tm-you">{t.you}</em>}
                    <small dir="ltr">{u.email}</small>
                  </td>
                  <td>
                    <select value={u.role} disabled={self || busy} onChange={(e) => patch(u.email, { role: e.target.value })} aria-label={t.role}>
                      {(['viewer', 'analyst', 'admin'] as Role[]).map((r) => (
                        <option key={r} value={r}>
                          {t.roles[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={u.profile} disabled={busy} onChange={(e) => patch(u.email, { profile: e.target.value })} aria-label={t.profile}>
                      <option value="">{t.profileOfRole}</option>
                      {custom.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className={`tm-status ${u.disabled ? 'is-off' : u.pending ? 'is-pending' : u.online ? 'is-online' : 'is-on'}`}>
                      {u.disabled ? t.disabled : u.pending ? t.pending : u.online ? t.online : t.active}
                    </span>
                  </td>
                  <td>{u.lastSeen ? i.dateTime(u.lastSeen) : <small>{t.never}</small>}</td>
                  <td className="tm-row-actions">
                    {!self && (
                      <button type="button" disabled={busy} onClick={() => patch(u.email, { disabled: !u.disabled })}>
                        {u.disabled ? t.enable : t.disable}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const r = await api<{ activation: { url: string } }>(`/api/team/users/${encodeURIComponent(u.email)}/activation`, 'POST')
                          setMsg({ link: r.activation.url, for: u.email })
                        }, u.email)
                      }
                    >
                      {t.newLink}
                    </button>
                    {u.sessions > 0 && !self && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            const r = await api<{ closed: number }>(`/api/team/users/${encodeURIComponent(u.email)}/logout`, 'POST')
                            setMsg({ info: `${u.email} · ${t.closed(r.closed)}` })
                          }, u.email)
                        }
                      >
                        {t.logout}
                      </button>
                    )}
                    {!self && (
                      <button type="button" className="tm-danger" disabled={busy} onClick={() => window.confirm(t.confirmRemove(u.email)) && run(() => api(`/api/team/users/${encodeURIComponent(u.email)}`, 'DELETE'), u.email)}>
                        {t.remove}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Profiles({ t, onChange }: { t: T; onChange: () => void }) {
  const [data, setData] = useState<PermData | null>(null)
  const [sel, setSel] = useState('')
  const [draft, setDraft] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [copyOf, setCopyOf] = useState('viewer')
  const [msg, setMsg] = useState<{ error?: string; info?: string }>({})
  const load = (keep = sel) =>
    api<PermData>('/api/team/permissions').then((d) => {
      setData(d)
      const p = d.profiles.find((x) => x.id === keep) || d.profiles[0]
      setSel(p.id)
      setDraft({ ...p })
    })
  useEffect(() => {
    load().catch(() => setMsg({ error: 'FAILED' }))
  }, [])
  if (!data || !draft) return msg.error ? <p className="news-status news-status--error">{t.errors.FAILED}</p> : null
  const toggle = (list: 'modules' | 'actions', key: string) => setDraft({ ...draft, [list]: draft[list].includes(key) ? draft[list].filter((k) => k !== key) : [...draft[list], key] })
  async function act(fn: () => Promise<unknown>, info = '') {
    setMsg({})
    try {
      await fn()
      setMsg({ info })
      onChange()
    } catch (e) {
      const code = (e as Error).message
      setMsg({ error: code === 'EXISTS' ? 'EXISTS_PROFILE' : code })
    }
  }
  return (
    <section className="tm-profiles">
      <aside>
        {data.profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            className={p.id === sel ? 'is-active' : ''}
            onClick={() => {
              setSel(p.id)
              setDraft({ ...p })
              setMsg({})
            }}
          >
            <b dir="auto">{p.name}</b>
            <small>{p.builtin ? t.builtin : t.usedBy(p.users)}</small>
          </button>
        ))}
        <form
          className="tm-newprof"
          onSubmit={(e) => {
            e.preventDefault()
            act(async () => {
              const r = await api<{ profile: Profile }>('/api/team/permissions', 'POST', { name, copyOf })
              setName('')
              await load(r.profile.id)
            })
          }}
        >
          <input required value={name} dir="auto" placeholder={t.profileName} aria-label={t.profileName} onChange={(e) => setName(e.target.value)} />
          <select value={copyOf} onChange={(e) => setCopyOf(e.target.value)} aria-label={t.copyOf}>
            {data.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {t.copyOf} {p.name}
              </option>
            ))}
            <option value="">{t.none}</option>
          </select>
          <button type="submit">+ {t.newProfile}</button>
        </form>
      </aside>
      <div className="tm-prof">
        <h3 dir="auto">{draft.name}</h3>
        <fieldset>
          <legend>{t.modules}</legend>
          {data.modules.map((m) => (
            <label key={m.key} className="tm-check">
              <input type="checkbox" checked={draft.modules.includes(m.key)} onChange={() => toggle('modules', m.key)} /> <span dir="auto">{m.label}</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>{t.actions}</legend>
          {data.actions.map((a) => (
            <label key={a.key} className="tm-check">
              <input type="checkbox" checked={draft.actions.includes(a.key)} onChange={() => toggle('actions', a.key)} /> <span dir="auto">{a.label}</span>
            </label>
          ))}
        </fieldset>
        {msg.error && (
          <p className="mms-note mms-note--danger" role="alert">
            {t.errors[msg.error] ?? t.errors.FAILED}
          </p>
        )}
        {msg.info && <p className="mms-note">{msg.info}</p>}
        <div className="tm-actions">
          <button type="button" className="tm-primary" onClick={() => act(async () => (await api(`/api/team/permissions/${draft.id}`, 'PUT', { modules: draft.modules, actions: draft.actions }), load(draft.id)), t.saved)}>
            {t.save}
          </button>
          {!draft.builtin && (
            <button type="button" className="tm-danger" onClick={() => act(async () => (await api(`/api/team/permissions/${draft.id}`, 'DELETE'), load('admin')))}>
              {t.deleteProfile}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function ActivityLog({ t, users }: { t: T; users: Member[] }) {
  const i = useI18n()
  const [f, setF] = useState({ email: '', type: '', days: 7 })
  const [rows, setRows] = useState<Activity[] | null>(null)
  useEffect(() => {
    const q = new URLSearchParams({ days: String(f.days), ...(f.email ? { email: f.email } : {}), ...(f.type ? { type: f.type } : {}) })
    api<{ rows: Activity[] }>(`/api/team/activity?${q}`)
      .then((r) => setRows(r.rows))
      .catch(() => setRows([]))
  }, [f])
  const nameOf = new Map(users.map((u) => [u.email.toLowerCase(), u.name]))
  return (
    <section>
      <div className="news-filters">
        <select value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-label={t.allUsers}>
          <option value="">{t.allUsers}</option>
          {users.map((u) => (
            <option key={u.email} value={u.email}>
              {u.name}
            </option>
          ))}
        </select>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label={t.actTypes['']}>
          {Object.entries(t.actTypes).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })}>
          {[1, 7, 30].map((d) => (
            <option key={d} value={d}>
              {t.days(d)}
            </option>
          ))}
        </select>
      </div>
      {rows && rows.length === 0 && <p className="news-status">{t.empty}</p>}
      {rows && rows.length > 0 && (
        <div className="tm-table">
          <table>
            <thead>
              <tr>
                {t.actCols.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, k) => (
                <tr key={k}>
                  <td>{i.dateTime(r.t)}</td>
                  <td>
                    <span dir="auto">{nameOf.get(r.user.toLowerCase()) || r.user}</span>
                  </td>
                  <td>{t.actTypes[r.type] ?? r.type}</td>
                  <td dir="auto">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
