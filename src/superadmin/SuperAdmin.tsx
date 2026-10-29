import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import './superadmin.css'
import { Permissions, PermsSummary, ProfileSelect, loadCatalog } from './Permissions'
import { GeoGlobe } from './GeoGlobe'
import { ApiKeysCard, BrandCard, SharesCard, SourceMetaCell } from './ClientSettings'
import { AlertReviewCard, EntitiesEditor, MailPolicyCard, MfaPolicyCard, SourcePolicyCard } from './Governance'
import { ACTIVITY_LABEL, AUDIT_LABEL, ROLE_LABEL, SECURITY_LABEL, ago, api, errText, flag, fmtBytes, fmtDate, fmtDay, fmtMinutes, fmtNum, qs, setAuthLost } from './api'

/** Console Super Admin (وحدة التحكم العليا) : /superadmin, séparée de la plateforme */

type Section = 'dash' | 'users' | 'team' | 'perms' | 'access' | 'analytics' | 'activity' | 'security' | 'sources' | 'entities' | 'settings'
const SECTIONS: [Section, string, string][] = [
  ['dash', 'لوحة المراقبة', '◉'],
  ['users', 'المستخدمون', '👥'],
  ['team', 'الفريق والصلاحيات', '🔑'],
  ['perms', 'الصلاحيات التفصيلية', '🧩'],
  ['access', 'سجل الوصول', '⇄'],
  ['analytics', 'التحليلات والدول', '◔'],
  ['activity', 'سجل النشاط', '☰'],
  ['security', 'الأمان', '🛡'],
  ['sources', 'مصادر التغذية', '📡'],
  ['entities', 'المرجع الموحد للفاعلين', '🧭'],
  ['settings', 'الإعدادات', '⚙'],
]

type Me = { user: string; expires: string; ip: string; country: string }

/** Charge une ressource et la recharge à la demande (ou toutes les « every » ms) */
function useLoad<T>(path: string | null, every = 0) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!path) return
    let live = true
    const run = () =>
      api<T>(path)
        .then((d) => live && (setData(d), setError('')))
        .catch((e) => live && setError(errText(e)))
    run()
    const id = every ? setInterval(run, every) : 0
    return () => {
      live = false
      if (id) clearInterval(id)
    }
  }, [path, every, n])
  return { data, error, reload: useCallback(() => setN((x) => x + 1), []) }
}

export default function SuperAdmin() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [section, setSection] = useState<Section>(() => (SECTIONS.find(([k]) => `#${k}` === location.hash)?.[0] as Section) || 'dash')
  const [openUser, setOpenUser] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    document.documentElement.dir = 'rtl'
    document.documentElement.lang = 'ar'
    document.title = 'وحدة التحكم العليا — MMS'
    setAuthLost(() => setMe(null))
    api<Me>('/me')
      .then(setMe)
      .catch(() => setMe(null))
    const onHash = () => {
      const s = SECTIONS.find(([k]) => `#${k}` === location.hash)?.[0]
      if (s) setSection(s)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  function go(s: Section) {
    setSection(s)
    setMenu(false)
    history.replaceState(null, '', `#${s}`)
  }

  async function logout() {
    await api('/logout', 'POST').catch(() => {})
    setMe(null)
  }

  if (me === undefined) return <div className="sa-boot" />
  if (!me) return <SaLogin onLogin={setMe} />

  return (
    <div className="sa">
      <aside className={menu ? 'sa-side is-open' : 'sa-side'}>
        <div className="sa-brand">
          <span className="sa-brand__mark">MMS</span>
          <div>
            <strong>وحدة التحكم العليا</strong>
            <small>Super Admin</small>
          </div>
        </div>
        <nav>
          {SECTIONS.map(([k, label, icon]) => (
            <button key={k} type="button" className={section === k ? 'is-active' : ''} onClick={() => go(k)}>
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sa-side__foot">
          <div>
            {me.user}
            <small>
              {flag(me.country)} {me.ip}
            </small>
            <small>تنتهي الجلسة {fmtDate(me.expires)}</small>
          </div>
          <button type="button" className="sa-btn sa-btn--ghost" onClick={logout}>
            تسجيل الخروج
          </button>
          <p className="around-credit">
            <img src="/around-logo-footer.png" alt="Around Expressions" width={120} height={91} loading="lazy" />
            <span dir="ltr">© {new Date().getFullYear()} MMS — Copyright by Around Expressions</span>
          </p>
        </div>
      </aside>
      <main className="sa-main">
        <header className="sa-top">
          <button type="button" className="sa-burger" aria-label="القائمة" onClick={() => setMenu((m) => !m)}>
            ☰
          </button>
          <h1>{SECTIONS.find(([k]) => k === section)?.[1]}</h1>
        </header>
        {section === 'dash' && <Dashboard onUser={setOpenUser} />}
        {section === 'users' && <Users onUser={setOpenUser} />}
        {section === 'team' && <Team onUser={setOpenUser} />}
        {section === 'perms' && <Permissions />}
        {section === 'access' && <Access />}
        {section === 'analytics' && <Analytics />}
        {section === 'activity' && <Activity />}
        {section === 'security' && <Security />}
        {section === 'sources' && <Sources />}
        {section === 'entities' && <EntitiesEditor />}
        {section === 'settings' && <Settings />}
      </main>
      {openUser && <UserSheet email={openUser} onClose={() => setOpenUser(null)} />}
    </div>
  )
}

/* ---------------------------------------------------------------- connexion */

function SaLogin({ onLogin }: { onLogin: (m: Me) => void }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/login', 'POST', { login, password })
      onLogin(await api<Me>('/me'))
    } catch (err) {
      setError(errText(err))
      setPassword('')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="sa-login">
      <form className="sa-card sa-login__card" onSubmit={submit}>
        <span className="sa-brand__mark">MMS</span>
        <h1>وحدة التحكم العليا</h1>
        <p className="sa-muted">دخول مخصّص للمشرف الأعلى. كل محاولة تُسجَّل مع العنوان والجهاز.</p>
        <label>
          المعرّف
          <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required dir="ltr" />
        </label>
        <label>
          كلمة المرور
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required dir="ltr" />
        </label>
        {error && (
          <p className="sa-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="sa-btn" disabled={busy}>
          {busy ? 'جارٍ التحقق…' : 'دخول'}
        </button>
      </form>
    </div>
  )
}

/* ---------------------------------------------------------------- petits composants */

function Card({ title, children, actions, wide }: { title?: string; children: ReactNode; actions?: ReactNode; wide?: boolean }) {
  return (
    <section className={wide ? 'sa-card sa-card--wide' : 'sa-card'}>
      {(title || actions) && (
        <div className="sa-card__head">
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

function Kpi({ label, value, tone }: { label: string; value: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className={`sa-kpi${tone ? ` is-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Bars({ rows, label, value, fmt = fmtNum }: { rows: unknown[]; label: (r: any) => ReactNode; value: (r: any) => number; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map(value))
  if (!rows.length) return <p className="sa-muted">لا توجد بيانات بعد.</p>
  return (
    <ul className="sa-bars">
      {rows.map((r, i) => (
        <li key={i}>
          <span className="sa-bars__label">{label(r)}</span>
          <span className="sa-bars__track">
            <span style={{ width: `${(value(r) / max) * 100}%` }} />
          </span>
          <span className="sa-bars__value">{fmt(value(r))}</span>
        </li>
      ))}
    </ul>
  )
}

function Columns({ rows, value, label, title }: { rows: unknown[]; value: (r: any) => number; label: (r: any) => string; title: (r: any) => string }) {
  const max = Math.max(1, ...rows.map(value))
  return (
    <div className="sa-cols">
      {rows.map((r, i) => (
        <div key={i} className="sa-cols__col" title={title(r)}>
          <span style={{ height: `${(value(r) / max) * 100}%` }} />
          <small>{label(r)}</small>
        </div>
      ))}
    </div>
  )
}

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="sa-pager">
      <button type="button" className="sa-btn sa-btn--ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        السابق
      </button>
      <span>
        صفحة {page} من {pages} · {fmtNum(total)} سطر
      </span>
      <button type="button" className="sa-btn sa-btn--ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        التالي
      </button>
    </div>
  )
}

const Country = ({ cc, name }: { cc?: string; name?: string }) => (
  <span className="sa-country" title={name || cc}>
    {flag(cc)} {cc || '؟'}
  </span>
)

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? 'sa-switch is-on' : 'sa-switch'} onClick={() => onChange(!on)}>
      <span />
    </button>
  )
}

/** Exécute une action ; affiche l'erreur éventuelle */
function useAct() {
  const [msg, setMsg] = useState('')
  const act = async (fn: () => Promise<unknown>, ok = '') => {
    try {
      await fn()
      setMsg(ok)
      return true
    } catch (e) {
      setMsg(errText(e))
      return false
    }
  }
  return { msg, act, setMsg }
}

/* ---------------------------------------------------------------- لوحة المراقبة */

type Dash = {
  online: { email: string; name: string; ip: string; t: string; country: string }[]
  counts: { users: number; admins: number; disabled: number; hits24: number }
  activity24: { t: string; hits: number; users: number }[]
  topUsers: { email: string; name: string; minutes: number }[]
  alerts: { fails24: number; saFails24: number; suspicious: number; blocked24: number; denied24?: number; recent: { t: string; type: string; ip: string; login: string; country: string }[] }
  countries: { cc: string; country: string; hits: number; ips: number }[]
  server: {
    hostname: string
    os: string
    node: string
    uptime: number
    appUptime: number
    load: number[]
    cpus: number
    mem: { total: number; free: number; rss: number }
    disk: { total: number; free: number } | null
    geo: { ip: string; country: string; cc: string; city: string; isp: string } | null
  }
  sync: { lastUpdate: string | null; minutesAgo: number | null; total: number; last24: number; dirs: { dir: string; found: boolean }[] }
  keys?: { mms: KeyRow[]; libye: KeyRow[] | null }
  aiUsage?: { month: string; current: Record<string, UsageRow>; total: Record<string, UsageRow> }
}
type KeyRow = { name: string; set: boolean; budget?: number }
type UsageRow = { runs: number; input: number; output: number; cost: number }

const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Tripoli', hour: '2-digit', hourCycle: 'h23' })
const duration = (s: number) => (s > 86400 ? `${Math.floor(s / 86400)} يوم` : `${Math.floor(s / 3600)} س ${Math.floor((s % 3600) / 60)} د`)

function Dashboard({ onUser }: { onUser: (e: string) => void }) {
  const { data: d, error } = useLoad<Dash>('/dashboard', 30_000)
  if (error) return <p className="sa-error">{error}</p>
  if (!d) return <p className="sa-muted">جارٍ التحميل…</p>
  const a = d.alerts
  const alertTone = a.suspicious || a.saFails24 ? 'bad' : a.fails24 ? 'warn' : 'ok'
  const late = d.sync.minutesAgo == null || d.sync.minutesAgo > 180
  return (
    <div className="sa-grid">
      <div className="sa-kpis sa-card--wide">
        <Kpi label="متصل الآن" value={d.online.length} tone={d.online.length ? 'ok' : undefined} />
        <Kpi label="طلبات آخر 24 ساعة" value={fmtNum(d.counts.hits24)} />
        <Kpi label="الحسابات" value={`${d.counts.users} · ${d.counts.admins} مدير`} />
        <Kpi label="تنبيهات أمنية (24 س)" value={a.fails24 + a.saFails24 + a.blocked24} tone={alertTone} />
        <Kpi label="مزامنة الأخبار" value={d.sync.lastUpdate ? ago(d.sync.lastUpdate) : 'لا شيء'} tone={late ? 'warn' : 'ok'} />
      </div>

      <Card title="المتصلون الآن">
        {d.online.length ? (
          <ul className="sa-list">
            {d.online.map((o) => (
              <li key={o.email}>
                <button type="button" className="sa-link" onClick={() => onUser(o.email)}>
                  <span className="sa-dot is-on" /> {o.name}
                </button>
                <span className="sa-muted">
                  <Country cc={o.country} /> {o.ip} · {ago(o.t)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sa-muted">لا أحد متصل في آخر 5 دقائق.</p>
        )}
      </Card>

      <Card title="النشاط خلال 24 ساعة">
        <Columns rows={d.activity24} value={(r) => r.hits} label={(r) => hourFmt.format(new Date(r.t))} title={(r) => `${r.hits} طلب · ${r.users} مستخدم`} />
      </Card>

      <Card title="الأكثر استخدامًا هذا الأسبوع">
        <Bars
          rows={d.topUsers}
          label={(r) => (
            <button type="button" className="sa-link" onClick={() => onUser(r.email)}>
              {r.name}
            </button>
          )}
          value={(r) => r.minutes}
          fmt={fmtMinutes}
        />
      </Card>

      <Card title="تنبيهات الأمان">
        <div className="sa-mini-kpis">
          <span>دخول فاشل: {a.fails24}</span>
          <span>فشل اللوحة العليا: {a.saFails24}</span>
          <span>عناوين مشبوهة: {a.suspicious}</span>
          <span>طلبات محظورة: {a.blocked24}</span>
          <span>طلبات خارج الصلاحيات: {a.denied24 ?? 0}</span>
        </div>
        {a.recent.length ? (
          <ul className="sa-list">
            {a.recent.map((e, i) => (
              <li key={i}>
                <span className={e.type.includes('fail') || e.type.includes('locked') ? 'sa-tag is-bad' : 'sa-tag'}>{SECURITY_LABEL[e.type] || e.type}</span>
                <span className="sa-muted">
                  {e.login} · <Country cc={e.country} /> {e.ip} · {ago(e.t)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sa-muted">لا تنبيهات في آخر 24 ساعة.</p>
        )}
      </Card>

      <Card title="التوزيع حسب الدول (7 أيام)">
        <Bars rows={d.countries} label={(r) => <Country cc={r.cc} name={r.country} />} value={(r) => r.hits} />
      </Card>

      <Card title="استضافة الخادم">
        <dl className="sa-dl">
          <dt>الخادم</dt>
          <dd dir="ltr">{d.server.hostname}</dd>
          {d.server.geo && (
            <>
              <dt>الموقع</dt>
              <dd>
                {flag(d.server.geo.cc)} {d.server.geo.country} {d.server.geo.city && `· ${d.server.geo.city}`}
              </dd>
              <dt>المزوّد</dt>
              <dd dir="ltr">{d.server.geo.isp}</dd>
              <dt>العنوان العام</dt>
              <dd dir="ltr">{d.server.geo.ip}</dd>
            </>
          )}
          <dt>النظام</dt>
          <dd dir="ltr">
            {d.server.os} · Node {d.server.node}
          </dd>
          <dt>مدة التشغيل</dt>
          <dd>
            الخادم {duration(d.server.uptime)} · MMS {duration(d.server.appUptime)}
          </dd>
          <dt>المعالج</dt>
          <dd dir="ltr">
            {d.server.cpus} CPU · load {d.server.load.map((l) => l.toFixed(2)).join(' / ')}
          </dd>
          <dt>الذاكرة</dt>
          <dd dir="ltr">
            {fmtBytes(d.server.mem.total - d.server.mem.free)} / {fmtBytes(d.server.mem.total)} (MMS {fmtBytes(d.server.mem.rss)})
          </dd>
          {d.server.disk && (
            <>
              <dt>القرص</dt>
              <dd dir="ltr">
                {fmtBytes(d.server.disk.free)} free / {fmtBytes(d.server.disk.total)}
              </dd>
            </>
          )}
        </dl>
      </Card>

      <Card title="حالة مزامنة الأخبار">
        <dl className="sa-dl">
          <dt>آخر تحديث</dt>
          <dd>
            <span className={late ? 'sa-tag is-warn' : 'sa-tag is-ok'}>{late ? 'متأخرة' : 'تعمل'}</span> {fmtDate(d.sync.lastUpdate)} ({ago(d.sync.lastUpdate)})
          </dd>
          <dt>الأخبار</dt>
          <dd>
            {fmtNum(d.sync.total)} إجمالًا · {fmtNum(d.sync.last24)} في آخر 24 ساعة
          </dd>
          {d.sync.dirs.map((x) => (
            <span key={x.dir} style={{ display: 'contents' }}>
              <dt>المجلد</dt>
              <dd dir="ltr">
                {x.found ? '✓' : '✗'} {x.dir}
              </dd>
            </span>
          ))}
        </dl>
      </Card>

    </div>
  )
}

/* ---------------------------------------------------------------- المستخدمون */

type UserRow = { email: string; name: string; role: string; profile?: string; profileName?: string; disabled: boolean; mfa?: boolean; createdAt: string | null; online: boolean; lastSeen: string | null; lastIp: string; country: string; sessions: number; fails: number; note: string }
const FILTERS: [string, string][] = [
  ['all', 'الكل'],
  ['online', 'متصل'],
  ['npdc', 'NPDC'],
  ['gmail', 'Gmail'],
  ['other', 'نطاقات أخرى'],
  ['admins', 'المدراء'],
  ['disabled', 'معطّل'],
  ['failed', 'محاولات فاشلة'],
]

function Users({ onUser }: { onUser: (e: string) => void }) {
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const { data, error, reload } = useLoad<{ users: UserRow[] }>(`/users?${qs({ filter, q })}`, 30_000)
  return (
    <Card
      wide
      actions={
        <button type="button" className="sa-btn" onClick={() => setCreating(true)}>
          + حساب جديد
        </button>
      }
    >
      <div className="sa-toolbar">
        <div className="sa-chips">
          {FILTERS.map(([k, l]) => (
            <button key={k} type="button" className={filter === k ? 'is-active' : ''} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        <input className="sa-input" placeholder="بحث بالاسم أو البريد" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <p className="sa-error">{error}</p>}
      <div className="sa-table-wrap">
        <table className="sa-table">
          <thead>
            <tr>
              <th>الحساب</th>
              <th>الدور</th>
              <th>الحالة</th>
              <th>آخر ظهور</th>
              <th>آخر عنوان</th>
              <th>الجلسات</th>
              <th>محاولات فاشلة</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.email} className="is-click" onClick={() => onUser(u.email)}>
                <td>
                  <strong>{u.name}</strong>
                  <small dir="ltr">{u.email}</small>
                </td>
                <td>
                  <span className={u.role === 'admin' ? 'sa-tag is-gold' : 'sa-tag'}>{ROLE_LABEL[u.role] || u.role}</span>
                </td>
                <td>{u.disabled ? <span className="sa-tag is-bad">معطّل</span> : u.online ? <span className="sa-tag is-ok">متصل</span> : <span className="sa-muted">غير متصل</span>}</td>
                <td>{ago(u.lastSeen)}</td>
                <td dir="ltr">{u.lastIp ? <>{flag(u.country)} {u.lastIp}</> : '—'}</td>
                <td>{u.sessions}</td>
                <td>{u.fails ? <span className="sa-tag is-warn">{u.fails}</span> : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.users.length && <p className="sa-muted">لا حسابات تطابق هذا الفلتر.</p>}
      </div>
      {creating && (
        <CreateUser
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false)
            reload()
          }}
        />
      )}
    </Card>
  )
}

/* ---------------------------------------------------------------- الفريق والصلاحيات */

const ROLES_ORDER = ['admin', 'analyst', 'viewer'] as const
const ROLE_HELP: Record<string, string> = {
  admin: 'كل شيء في المنصة، بما فيه الإرسال التلقائي للتقارير ومصادر البث',
  analyst: 'ينشئ الرصد واللوحات والوسوم ويشغّل التحليل الذكي',
  viewer: 'قراءة وأسئلة Around وتصدير',
}
function Team({ onUser }: { onUser: (e: string) => void }) {
  const { data, error, reload } = useLoad<{ users: UserRow[] }>('/users', 30_000)
  const [creating, setCreating] = useState(false)
  const [reset, setReset] = useState<{ email: string; password: string } | null>(null)
  const { msg, act } = useAct()
  const users = [...(data?.users ?? [])].sort((a, b) => ROLES_ORDER.indexOf(a.role as never) - ROLES_ORDER.indexOf(b.role as never) || a.email.localeCompare(b.email))
  const run = async (fn: () => Promise<unknown>, ok: string) => (await act(fn, ok)) && reload()
  const path = (email: string) => `/users/${encodeURIComponent(email)}`

  return (
    <div className="sa-grid">
      <Card
        title="الفريق والصلاحيات"
        wide
        actions={
          <button type="button" className="sa-btn" onClick={() => setCreating(true)}>
            + عضو جديد
          </button>
        }
      >
        <p className="sa-muted">أنشئ حسابات الفريق وحدّد صلاحية كل عضو. كل تغيير يُسجَّل في سجل الإعدادات.</p>
        {error && <p className="sa-error">{error}</p>}
        {msg && <p className="sa-note">{msg}</p>}
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>البريد الإلكتروني</th>
                <th>الاسم</th>
                <th>الدور</th>
                <th>ملف الصلاحيات</th>
                <th>الحالة</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.email}>
                  <td dir="ltr">
                    <button type="button" className="sa-link" onClick={() => onUser(u.email)}>
                      {u.email}
                    </button>
                  </td>
                  <td dir="auto">{u.name}</td>
                  <td>
                    <select className="sa-input" value={u.role} onChange={(e) => run(() => api(path(u.email), 'PATCH', { role: e.target.value }), 'تم تغيير الدور.')}>
                      {ROLES_ORDER.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <ProfileSelect
                      value={u.profile || ''}
                      onChange={(id) => run(() => api(path(u.email), 'PATCH', { profile: id }).then(() => loadCatalog(true)), id ? 'تم إسناد ملف الصلاحيات.' : 'عاد الحساب إلى صلاحيات دوره.')}
                    />
                  </td>
                  <td>{u.disabled ? <span className="sa-tag is-bad">معطّل</span> : u.online ? <span className="sa-tag is-ok">متصل</span> : <span className="sa-tag">مفعّل</span>}</td>
                  <td>
                    <div className="sa-row">
                      <button type="button" className="sa-btn sa-btn--ghost" onClick={() => setReset({ email: u.email, password: '' })}>
                        كلمة مرور جديدة
                      </button>
                      <button
                        type="button"
                        className={u.disabled ? 'sa-btn' : 'sa-btn sa-btn--warn'}
                        onClick={() => run(() => api(path(u.email), 'PATCH', { disabled: !u.disabled }), u.disabled ? 'تم تفعيل الحساب.' : 'تم تعطيل الحساب وإغلاق كل جلساته.')}
                      >
                        {u.disabled ? 'تفعيل' : 'تعطيل'}
                      </button>
                      <button
                        type="button"
                        className="sa-btn sa-btn--bad"
                        onClick={() => confirm(`حذف الحساب ${u.email} ؟`) && run(() => api(path(u.email), 'DELETE'), 'تم حذف الحساب.')}
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {reset && (
          <form
            className="sa-row"
            onSubmit={async (e) => {
              e.preventDefault()
              if (await act(() => api(path(reset.email), 'PATCH', { password: reset.password }), 'تم تغيير كلمة المرور وإغلاق الجلسات.')) setReset(null)
            }}
          >
            <span dir="ltr">{reset.email}</span>
            <input
              className="sa-input"
              type="text"
              dir="ltr"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="8 أحرف على الأقل"
              value={reset.password}
              onChange={(e) => setReset({ ...reset, password: e.target.value })}
            />
            <button type="submit" className="sa-btn">
              حفظ
            </button>
            <button type="button" className="sa-btn sa-btn--ghost" onClick={() => setReset(null)}>
              إلغاء
            </button>
          </form>
        )}
      </Card>

      <Card title="ماذا يستطيع كل دور ؟" wide>
        <ul className="sa-role-help">
          {ROLES_ORDER.map((r) => (
            <li key={r}>
              <b>{ROLE_LABEL[r]}</b> — {ROLE_HELP[r]}
            </li>
          ))}
        </ul>
        <p className="sa-muted">
          الصلاحيات الفعلية لكل دور ولكل ملف مخصّص (الوحدات والأزرار) تُضبط في «الصلاحيات التفصيلية»، وتُطبَّق في الواجهة وعلى الخادم معًا.
        </p>
        <a className="sa-btn" href="#perms">
          فتح الصلاحيات التفصيلية
        </a>
        <p className="sa-muted">إدارة الحسابات والصلاحيات تتم من هذه الوحدة فقط، ولا يملكها أي دور داخل المنصة.</p>
      </Card>

      {creating && (
        <CreateUser
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function CreateUser({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ email: '', name: '', role: 'viewer', profile: '', password: '' })
  const { msg, act } = useAct()
  return (
    <div className="sa-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <form
        className="sa-card sa-form"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault()
          if (await act(() => api('/users', 'POST', form))) onDone()
        }}
      >
        <h2>حساب جديد</h2>
        <label>
          البريد الإلكتروني
          <input className="sa-input" type="email" dir="ltr" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>
          الاسم
          <input className="sa-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          الدور
          <select className="sa-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="viewer">قارئ</option>
            <option value="analyst">محلل</option>
            <option value="admin">مدير</option>
          </select>
        </label>
        <label>
          ملف الصلاحيات
          <ProfileSelect value={form.profile} onChange={(profile) => setForm({ ...form, profile })} />
        </label>
        <label>
          كلمة المرور المؤقتة (8 أحرف على الأقل)
          <input className="sa-input" type="text" dir="ltr" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
        </label>
        {msg && <p className="sa-error">{msg}</p>}
        <div className="sa-row">
          <button type="submit" className="sa-btn">
            إنشاء
          </button>
          <button type="button" className="sa-btn sa-btn--ghost" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </div>
  )
}

type UserDetail = {
  user: UserRow
  perms?: { profileName: string; modules: string[]; actions: string[] }
  noteAt: string | null
  sessions: { at: string | null; expires: string; ip: string; country: string; device: string }[]
  ips: { ip: string; hits: number; first: string; last: string; country: string; place: string }[]
  devices: { device: string; hits: number; last: string }[]
  days: { day: string; minutes: number }[]
  activity: { t: string; type: string; detail: string; ip: string }[]
  security: { t: string; type: string; ip: string; country: string }[]
}

function UserSheet({ email, onClose }: { email: string; onClose: () => void }) {
  const { data, error, reload } = useLoad<UserDetail>(`/users/${encodeURIComponent(email)}`)
  const { msg, act } = useAct()
  const [note, setNote] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [withHistory, setWithHistory] = useState(false)
  const path = `/users/${encodeURIComponent(email)}`
  const u = data?.user
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    if (await act(fn, ok)) reload()
  }
  return (
    <div className="sa-modal sa-modal--sheet" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sa-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sa-card__head">
          <h2>{u?.name || email}</h2>
          <button type="button" className="sa-btn sa-btn--ghost" onClick={onClose}>
            إغلاق
          </button>
        </div>
        {error && <p className="sa-error">{error}</p>}
        {u && data && (
          <>
            <p className="sa-muted" dir="ltr">
              {u.email}
            </p>
            <div className="sa-mini-kpis">
              <span>{u.disabled ? '⛔ معطّل' : u.online ? '🟢 متصل' : `آخر ظهور ${ago(u.lastSeen)}`}</span>
              <span>جلسات مفتوحة: {data.sessions.length}</span>
              <span>محاولات فاشلة (30 يومًا): {u.fails}</span>
              <span>أُنشئ: {fmtDate(u.createdAt)}</span>
            </div>
            {msg && <p className="sa-note">{msg}</p>}

            <div className="sa-actions">
              <label>
                الدور
                <select className="sa-input" value={u.role} onChange={(e) => run(() => api(path, 'PATCH', { role: e.target.value }), 'تم تغيير الدور.')}>
                  <option value="viewer">قارئ</option>
                  <option value="analyst">محلل</option>
                  <option value="admin">مدير</option>
                </select>
              </label>
              <label>
                ملف الصلاحيات
                <ProfileSelect value={u.profile || ''} onChange={(id) => run(() => api(path, 'PATCH', { profile: id }).then(() => loadCatalog(true)), 'تم تغيير ملف الصلاحيات.')} />
              </label>
              <button type="button" className={u.disabled ? 'sa-btn' : 'sa-btn sa-btn--warn'} onClick={() => run(() => api(path, 'PATCH', { disabled: !u.disabled }), u.disabled ? 'تم تفعيل الحساب.' : 'تم تعطيل الحساب وإغلاق كل جلساته.')}>
                {u.disabled ? 'تفعيل الحساب' : 'تعطيل الحساب'}
              </button>
              <button type="button" className="sa-btn sa-btn--ghost" onClick={() => run(() => api(`${path}/logout`, 'POST'), 'تم إغلاق كل الجلسات.')}>
                إغلاق الجلسات
              </button>
              {u.mfa && (
                <button
                  type="button"
                  className="sa-btn sa-btn--ghost"
                  onClick={() => {
                    if (window.confirm('إعادة تعيين التحقق بخطوتين لهذا الحساب؟ سيُطلب منه تفعيله من جديد عند الدخول.')) run(() => api(path, 'PATCH', { resetMfa: true }), 'تمت إعادة تعيين التحقق بخطوتين وإغلاق الجلسات.')
                  }}
                >
                  إعادة تعيين التحقق بخطوتين
                </button>
              )}
            </div>
            {data.perms && <PermsSummary perms={data.perms} />}

            <form
              className="sa-row"
              onSubmit={(e) => {
                e.preventDefault()
                run(() => api(path, 'PATCH', { password }), 'تم تغيير كلمة المرور وإغلاق الجلسات.').then(() => setPassword(''))
              }}
            >
              <input className="sa-input" dir="ltr" placeholder="كلمة مرور جديدة" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              <button type="submit" className="sa-btn sa-btn--ghost" disabled={password.length < 8}>
                إعادة تعيين كلمة المرور
              </button>
            </form>

            <h3>ملاحظة</h3>
            <textarea className="sa-input" rows={2} value={note ?? u.note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة داخلية لا يراها المستخدم" />
            <div className="sa-row">
              <button type="button" className="sa-btn sa-btn--ghost" disabled={note === null} onClick={() => run(() => api(`${path}/note`, 'PUT', { text: note ?? '' }), 'تم حفظ الملاحظة.').then(() => setNote(null))}>
                حفظ الملاحظة
              </button>
              {data.noteAt && <small className="sa-muted">آخر تعديل {fmtDate(data.noteAt)}</small>}
            </div>

            <h3>الوقت المستغرق يوميًا (30 يومًا)</h3>
            <Columns rows={data.days} value={(r) => r.minutes} label={(r) => r.day.slice(8)} title={(r) => `${fmtDay(r.day)} · ${fmtMinutes(r.minutes)}`} />

            <h3>الجلسات المفتوحة</h3>
            <SimpleTable
              rows={data.sessions}
              cols={[
                ['منذ', (s) => fmtDate(s.at)],
                ['تنتهي', (s) => fmtDate(s.expires)],
                ['العنوان', (s) => <span dir="ltr">{flag(s.country)} {s.ip || '—'}</span>],
                ['الجهاز', (s) => s.device],
              ]}
            />

            <h3>عناوين IP</h3>
            <SimpleTable
              rows={data.ips}
              cols={[
                ['العنوان', (i) => <span dir="ltr">{i.ip}</span>],
                ['الدولة', (i) => <Country cc={i.country} name={i.place} />],
                ['الطلبات', (i) => fmtNum(i.hits)],
                ['آخر مرة', (i) => fmtDate(i.last)],
              ]}
            />

            <h3>الأجهزة</h3>
            <SimpleTable
              rows={data.devices}
              cols={[
                ['الجهاز', (d) => d.device],
                ['الطلبات', (d) => fmtNum(d.hits)],
                ['آخر مرة', (d) => fmtDate(d.last)],
              ]}
            />

            <h3>النشاط</h3>
            <SimpleTable
              rows={data.activity}
              cols={[
                ['الوقت', (a) => fmtDate(a.t)],
                ['النوع', (a) => ACTIVITY_LABEL[a.type] || a.type],
                ['التفاصيل', (a) => a.detail],
              ]}
            />

            <div className="sa-danger">
              <h3>حذف الحساب</h3>
              {confirmDel ? (
                <>
                  <label className="sa-check">
                    <input type="checkbox" checked={withHistory} onChange={(e) => setWithHistory(e.target.checked)} /> حذف سجل وصوله ونشاطه أيضًا
                  </label>
                  <div className="sa-row">
                    <button type="button" className="sa-btn sa-btn--bad" onClick={() => act(() => api(`${path}${withHistory ? '?history=1' : ''}`, 'DELETE')).then((ok) => ok && onClose())}>
                      تأكيد الحذف النهائي
                    </button>
                    <button type="button" className="sa-btn sa-btn--ghost" onClick={() => setConfirmDel(false)}>
                      إلغاء
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" className="sa-btn sa-btn--bad" onClick={() => setConfirmDel(true)}>
                  حذف الحساب…
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SimpleTable<T>({ rows, cols }: { rows: T[]; cols: [string, (r: T) => ReactNode][] }) {
  if (!rows.length) return <p className="sa-muted">لا شيء.</p>
  return (
    <div className="sa-table-wrap">
      <table className="sa-table">
        <thead>
          <tr>
            {cols.map(([h]) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map(([h, f]) => (
                <td key={h}>{f(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------------------------------------------------------- سجل الوصول */

type AccessRow = { t: string; ip: string; country: string; user: string; method: string; path: string; status: number; bytes: number; ms: number; device: string }
type Paged<T> = { total: number; page: number; pages: number; rows: T[] }

function Access() {
  const [f, setF] = useState({ from: '', to: '', ip: '', user: '', country: '', path: '', status: '' })
  const [applied, setApplied] = useState(f)
  const [page, setPage] = useState(1)
  const query = qs({ ...applied, page, size: 50 })
  const { data, error } = useLoad<Paged<AccessRow>>(`/access?${query}`)
  const field = (k: keyof typeof f, label: string, type = 'text') => (
    <label>
      {label}
      <input className="sa-input" type={type} dir="ltr" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  )
  return (
    <Card
      wide
      actions={
        <a className="sa-btn sa-btn--ghost" href={`/api/superadmin/access.csv?${qs(applied)}`}>
          تصدير CSV
        </a>
      }
    >
      <form
        className="sa-filters"
        onSubmit={(e) => {
          e.preventDefault()
          setApplied(f)
          setPage(1)
        }}
      >
        {field('from', 'من', 'date')}
        {field('to', 'إلى', 'date')}
        {field('ip', 'IP')}
        {field('user', 'المستخدم')}
        {field('country', 'الدولة (LY)')}
        {field('path', 'الصفحة')}
        {field('status', 'الحالة')}
        <button type="submit" className="sa-btn">
          تصفية
        </button>
      </form>
      {error && <p className="sa-error">{error}</p>}
      {data && (
        <>
          <SimpleTable
            rows={data.rows}
            cols={[
              ['التاريخ', (r) => fmtDate(r.t)],
              ['IP', (r) => <span dir="ltr">{r.ip}</span>],
              ['الدولة', (r) => <Country cc={r.country} />],
              ['المستخدم', (r) => <span dir="ltr">{r.user || '—'}</span>],
              ['الصفحة', (r) => <code dir="ltr" title={r.path}>{r.method} {r.path.length > 70 ? `${r.path.slice(0, 70)}…` : r.path}</code>],
              ['الحالة', (r) => <span className={r.status >= 500 ? 'sa-tag is-bad' : r.status >= 400 ? 'sa-tag is-warn' : 'sa-tag is-ok'}>{r.status}</span>],
              ['الحجم', (r) => <span dir="ltr">{fmtBytes(r.bytes)}</span>],
              ['الجهاز', (r) => <small>{r.device}</small>],
            ]}
          />
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      )}
    </Card>
  )
}

/* ---------------------------------------------------------------- التحليلات والدول */

type IpStat = { ip: string; hits: number; bytes: number; users: string[]; last: string; country: string; place: string; isp: string }
type Analytics = {
  byHits: IpStat[]
  byBytes: IpStat[]
  countries: { cc: string; country: string; hits: number; bytes: number; ips: number; users: number }[]
  heat: number[][]
  days: { day: string; hits: number }[]
  server?: { cc: string; country: string } | null
}
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

function Analytics() {
  const { data: d, error } = useLoad<Analytics>('/analytics')
  if (error) return <p className="sa-error">{error}</p>
  if (!d) return <p className="sa-muted">جارٍ التحميل…</p>
  const max = Math.max(1, ...d.heat.flat())
  const ipCols: [string, (r: IpStat) => ReactNode][] = [
    ['العنوان', (r) => <span dir="ltr">{r.ip}</span>],
    ['الدولة', (r) => <Country cc={r.country} name={r.place} />],
    ['الزيارات', (r) => fmtNum(r.hits)],
    ['البيانات', (r) => <span dir="ltr">{fmtBytes(r.bytes)}</span>],
    ['المستخدمون', (r) => <small dir="ltr">{r.users.join(', ') || '—'}</small>],
    ['المزوّد', (r) => <small dir="ltr">{r.isp}</small>],
  ]
  return (
    <div className="sa-grid">
      <Card title="خريطة الزيارات حسب الدول (30 يومًا)" wide>
        <GeoGlobe rows={d.countries} server={d.server} />
      </Card>
      <Card title="الطلبات يوميًا (30 يومًا)" wide>
        <Columns rows={d.days} value={(r) => r.hits} label={(r) => r.day.slice(8)} title={(r) => `${fmtDay(r.day)} · ${fmtNum(r.hits)}`} />
      </Card>
      <Card title="أكثر العناوين نشاطًا (زيارات)" wide>
        <SimpleTable rows={d.byHits} cols={ipCols} />
      </Card>
      <Card title="أكثر العناوين استهلاكًا (بيانات)" wide>
        <SimpleTable rows={d.byBytes} cols={ipCols} />
      </Card>
      <Card title="التوزيع حسب الدول">
        <SimpleTable
          rows={d.countries}
          cols={[
            ['الدولة', (c) => <Country cc={c.cc} name={c.country} />],
            ['الاسم', (c) => c.country],
            ['الزيارات', (c) => fmtNum(c.hits)],
            ['البيانات', (c) => <span dir="ltr">{fmtBytes(c.bytes)}</span>],
            ['العناوين', (c) => c.ips],
            ['المستخدمون', (c) => c.users],
          ]}
        />
      </Card>
      <Card title="الأيام والساعات الأكثر نشاطًا (توقيت تونس)">
        <div className="sa-heat" dir="ltr">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <small key={h}>{h % 3 === 0 ? h : ''}</small>
          ))}
          {d.heat.map((row, wd) => (
            <span key={wd} style={{ display: 'contents' }}>
              <small className="sa-heat__day">{WEEKDAYS[wd]}</small>
              {row.map((v, h) => (
                <i key={h} title={`${WEEKDAYS[wd]} ${h}:00 · ${v}`} style={{ opacity: v ? 0.15 + (0.85 * v) / max : 0.06 }} />
              ))}
            </span>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* ---------------------------------------------------------------- سجل النشاط */

type ActivityRow = { t: string; u: string; ip: string; type: string; detail: string; country: string }

function Activity() {
  const [f, setF] = useState({ user: '', type: '', q: '' })
  const [applied, setApplied] = useState(f)
  const [page, setPage] = useState(1)
  const { data, error } = useLoad<Paged<ActivityRow>>(`/activity?${qs({ ...applied, page, size: 50 })}`)
  return (
    <Card
      wide
      actions={
        <a className="sa-btn sa-btn--ghost" href={`/api/superadmin/activity.csv?${qs(applied)}`}>
          تصدير CSV
        </a>
      }
    >
      <form
        className="sa-filters"
        onSubmit={(e) => {
          e.preventDefault()
          setApplied(f)
          setPage(1)
        }}
      >
        <label>
          المستخدم
          <input className="sa-input" dir="ltr" value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} />
        </label>
        <label>
          النوع
          <select className="sa-input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="">الكل</option>
            {Object.entries(ACTIVITY_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          نص
          <input className="sa-input" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        </label>
        <button type="submit" className="sa-btn">
          تصفية
        </button>
      </form>
      {error && <p className="sa-error">{error}</p>}
      {data && (
        <>
          <SimpleTable
            rows={data.rows}
            cols={[
              ['الوقت', (r) => fmtDate(r.t)],
              ['المستخدم', (r) => <span dir="ltr">{r.u}</span>],
              ['النوع', (r) => <span className="sa-tag">{ACTIVITY_LABEL[r.type] || r.type}</span>],
              ['التفاصيل', (r) => r.detail],
              ['العنوان', (r) => <span dir="ltr">{flag(r.country)} {r.ip}</span>],
            ]}
          />
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      )}
    </Card>
  )
}

/* ---------------------------------------------------------------- الأمان */

type SecurityData = {
  suspicious: { ip: string; fails: number; logins: string[]; last: string; country: string; blocked: boolean }[]
  multiIp: { email: string; ips: { ip: string; country: string }[] }[]
  events: { t: string; type: string; ip: string; ua: string; login: string; detail: string; country: string }[]
  blocks: { ips: { ip: string; at: string; reason: string }[]; countries: { cc: string; at: string }[] }
  me: { ip: string; country: string }
}

function Security() {
  const [type, setType] = useState('')
  const { data: d, error, reload } = useLoad<SecurityData>(`/security?${qs({ type })}`, 30_000)
  const { msg, act } = useAct()
  const [ip, setIp] = useState('')
  const [reason, setReason] = useState('')
  const [cc, setCc] = useState('')
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    if (await act(fn, ok)) reload()
  }
  if (error) return <p className="sa-error">{error}</p>
  if (!d) return <p className="sa-muted">جارٍ التحميل…</p>
  return (
    <div className="sa-grid">
      <p className="sa-note sa-card--wide">
        عنوانك الحالي: <span dir="ltr">{d.me.ip}</span> {flag(d.me.country)} {d.me.country} — لا يمكن حظره. الحظر يشمل كل المنصة ما عدا هذه اللوحة.
      </p>
      {msg && <p className="sa-note sa-card--wide">{msg}</p>}

      <Card title="عناوين مشبوهة (5 محاولات فاشلة أو أكثر، 7 أيام)" wide>
        <SimpleTable
          rows={d.suspicious}
          cols={[
            ['العنوان', (s) => <span dir="ltr">{s.ip}</span>],
            ['الدولة', (s) => <Country cc={s.country} />],
            ['المحاولات', (s) => <span className="sa-tag is-bad">{s.fails}</span>],
            ['المعرّفات المجرّبة', (s) => <small dir="ltr">{s.logins.join(', ')}</small>],
            ['آخر محاولة', (s) => fmtDate(s.last)],
            [
              '',
              (s) =>
                s.blocked ? (
                  <span className="sa-tag is-bad">محظور</span>
                ) : (
                  <button type="button" className="sa-btn sa-btn--bad" onClick={() => run(() => api('/blocks/ip', 'POST', { ip: s.ip, reason: `${s.fails} محاولات فاشلة` }), 'تم حظر العنوان.')}>
                    حظر
                  </button>
                ),
            ],
          ]}
        />
      </Card>

      <Card title="مستخدمون بعدة عناوين خلال 24 ساعة">
        <SimpleTable
          rows={d.multiIp}
          cols={[
            ['المستخدم', (m) => <span dir="ltr">{m.email}</span>],
            ['العناوين', (m) => <small dir="ltr">{m.ips.map((i) => `${flag(i.country)} ${i.ip}`).join(' · ')}</small>],
          ]}
        />
      </Card>

      <Card title="العناوين المحظورة">
        <form
          className="sa-row"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => api('/blocks/ip', 'POST', { ip, reason }), 'تم حظر العنوان.').then(() => (setIp(''), setReason('')))
          }}
        >
          <input className="sa-input" dir="ltr" placeholder="IP" value={ip} onChange={(e) => setIp(e.target.value)} required />
          <input className="sa-input" placeholder="السبب" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="submit" className="sa-btn sa-btn--bad">
            حظر
          </button>
        </form>
        <SimpleTable
          rows={d.blocks.ips}
          cols={[
            ['العنوان', (b) => <span dir="ltr">{b.ip}</span>],
            ['السبب', (b) => b.reason],
            ['منذ', (b) => fmtDate(b.at)],
            [
              '',
              (b) => (
                <button type="button" className="sa-btn sa-btn--ghost" onClick={() => run(() => api(`/blocks/ip/${encodeURIComponent(b.ip)}`, 'DELETE'), 'تم رفع الحظر.')}>
                  رفع الحظر
                </button>
              ),
            ],
          ]}
        />
      </Card>

      <Card title="الدول المحظورة">
        <form
          className="sa-row"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => api('/blocks/country', 'POST', { cc }), 'تم حظر الدولة.').then(() => setCc(''))
          }}
        >
          <input className="sa-input" dir="ltr" placeholder="رمز الدولة، مثل EG" maxLength={2} value={cc} onChange={(e) => setCc(e.target.value.toUpperCase())} required />
          <button type="submit" className="sa-btn sa-btn--bad">
            حظر الدولة
          </button>
        </form>
        <SimpleTable
          rows={d.blocks.countries}
          cols={[
            ['الدولة', (b) => <Country cc={b.cc} />],
            ['منذ', (b) => fmtDate(b.at)],
            [
              '',
              (b) => (
                <button type="button" className="sa-btn sa-btn--ghost" onClick={() => run(() => api(`/blocks/country/${b.cc}`, 'DELETE'), 'تم رفع الحظر.')}>
                  رفع الحظر
                </button>
              ),
            ],
          ]}
        />
      </Card>

      <Card
        title="سجل أحداث الأمان"
        wide
        actions={
          <select className="sa-input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">كل الأحداث</option>
            {Object.entries(SECURITY_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        }
      >
        <SimpleTable
          rows={d.events.slice(0, 200)}
          cols={[
            ['الوقت', (e) => fmtDate(e.t)],
            ['الحدث', (e) => <span className={/fail|locked|blocked|disabled/.test(e.type) ? 'sa-tag is-bad' : 'sa-tag is-ok'}>{SECURITY_LABEL[e.type] || e.type}</span>],
            ['المعرّف', (e) => <span dir="ltr">{e.login || '—'}</span>],
            ['العنوان', (e) => <span dir="ltr">{flag(e.country)} {e.ip}</span>],
            ['الجهاز', (e) => <small dir="ltr" title={e.ua}>{e.ua.slice(0, 60)}</small>],
          ]}
        />
      </Card>
    </div>
  )
}

/* ---------------------------------------------------------------- مصادر التغذية */

type SourcesData = {
  lastUpdate: string | null
  origins: { name: string; flux: string; url: string; total: number; week: number; last: string | null; channels: string[]; langs: string[]; topics: string[]; collector: string; enabled: boolean; country?: string; reach?: number; reachSet?: boolean }[]
  channels: { name: string; total: number; week: number; origins: number; enabled: boolean }[]
}

function Sources() {
  const { data: d, error, reload } = useLoad<SourcesData>('/sources')
  const { msg, act, setMsg } = useAct()
  const [q, setQ] = useState('')
  const set = async (kind: 'origin' | 'channel', name: string, enabled: boolean) => {
    if (await act(() => api('/sources', 'PUT', { kind, name, enabled }), enabled ? `تم تفعيل «${name}».` : `تم إيقاف «${name}»: أخباره لم تعد تظهر في المنصة.`)) reload()
  }
  if (error) return <p className="sa-error">{error}</p>
  if (!d) return <p className="sa-muted">جارٍ التحميل…</p>
  const shown = d.origins.filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()) || o.url.includes(q))
  return (
    <div className="sa-grid">
      {msg && <p className="sa-note sa-card--wide">{msg}</p>}
      <Card title="القنوات الرقمية" wide>
        <div className="sa-channels">
          {d.channels.map((c) => (
            <div key={c.name} className={c.enabled ? 'sa-channel' : 'sa-channel is-off'}>
              <div>
                <strong dir="ltr">{c.name}</strong>
                <small>
                  {fmtNum(c.total)} خبر · {c.origins} مصدر · {fmtNum(c.week)} هذا الأسبوع
                </small>
              </div>
              <Toggle on={c.enabled} label={c.name} onChange={(v) => set('channel', c.name, v)} />
            </div>
          ))}
        </div>
      </Card>
      <Card title={`المواقع والصفحات (${d.origins.length})`} wide actions={<input className="sa-input" placeholder="بحث" value={q} onChange={(e) => setQ(e.target.value)} />}>
        <SimpleTable
          rows={shown}
          cols={[
            [
              'المصدر',
              (o) => (
                <>
                  <strong>{o.name}</strong>
                  {o.url && (
                    <small dir="ltr">
                      <a href={o.url} target="_blank" rel="noreferrer">
                        {o.url.replace(/^https?:\/\//, '')}
                      </a>
                    </small>
                  )}
                </>
              ),
            ],
            ['القناة', (o) => <small dir="ltr">{o.channels.join(', ')}</small>],
            [
              'البلد · مدى الانتشار',
              (o) => (
                <SourceMetaCell
                  name={o.name}
                  country={o.country ?? ''}
                  reach={o.reach ?? 0}
                  reachSet={Boolean(o.reachSet)}
                  onSaved={(m) => {
                    setMsg(m)
                    reload()
                  }}
                />
              ),
            ],
            ['اللغات', (o) => <small dir="ltr">{o.langs.join(', ') || '—'}</small>],
            ['المواضيع', (o) => <small>{o.topics.join('، ') || '—'}</small>],
            ['الأخبار', (o) => `${fmtNum(o.week)} / ${fmtNum(o.total)}`],
            ['آخر خبر', (o) => ago(o.last)],
            ['الجامع', (o) => (o.collector === 'off' ? <span className="sa-tag is-warn">متوقف في الجامع</span> : o.collector === 'active' ? <span className="sa-tag">مفعّل</span> : '—')],
            ['في المنصة', (o) => <Toggle on={o.enabled} label={o.name} onChange={(v) => set('origin', o.name, v)} />],
          ]}
        />
      </Card>
    </div>
  )
}

/* ---------------------------------------------------------------- الإعدادات */

type SettingsData = {
  settings: { announcement: { on: boolean; text: string; level: string }; maintenance: { on: boolean; message: string } }
  audit: { t: string; actor: string; ip: string; action: string; target: string; detail: string; country: string }[]
}

function Settings() {
  const { data, error, reload } = useLoad<SettingsData>('/settings')
  const [s, setS] = useState<SettingsData['settings'] | null>(null)
  const { msg, act, setMsg } = useAct()
  useEffect(() => {
    if (data) setS(data.settings)
  }, [data])
  if (error) return <p className="sa-error">{error}</p>
  if (!data || !s) return <p className="sa-muted">جارٍ التحميل…</p>
  const save = async () => {
    if (await act(() => api('/settings', 'PUT', s), 'تم حفظ الإعدادات.')) reload()
  }
  return (
    <div className="sa-grid">
      {msg && <p className="sa-note sa-card--wide">{msg}</p>}
      <Card title="شريط الإعلان">
        <div className="sa-row">
          <Toggle on={s.announcement.on} label="شريط الإعلان" onChange={(on) => setS({ ...s, announcement: { ...s.announcement, on } })} />
          <span>{s.announcement.on ? 'ظاهر لكل المستخدمين' : 'مخفي'}</span>
        </div>
        <textarea className="sa-input" rows={3} placeholder="نص الإعلان" value={s.announcement.text} onChange={(e) => setS({ ...s, announcement: { ...s.announcement, text: e.target.value } })} />
        <select className="sa-input" value={s.announcement.level} onChange={(e) => setS({ ...s, announcement: { ...s.announcement, level: e.target.value } })}>
          <option value="info">معلومة</option>
          <option value="warning">تنبيه</option>
          <option value="danger">عاجل</option>
        </select>
      </Card>
      <Card title="وضع الصيانة">
        <div className="sa-row">
          <Toggle on={s.maintenance.on} label="وضع الصيانة" onChange={(on) => setS({ ...s, maintenance: { ...s.maintenance, on } })} />
          <span className={s.maintenance.on ? 'sa-tag is-bad' : ''}>{s.maintenance.on ? 'المنصة مغلقة للمستخدمين' : 'المنصة مفتوحة'}</span>
        </div>
        <textarea className="sa-input" rows={3} placeholder="رسالة الصيانة" value={s.maintenance.message} onChange={(e) => setS({ ...s, maintenance: { ...s.maintenance, message: e.target.value } })} />
        <p className="sa-muted">في وضع الصيانة يرى الجميع هذه الرسالة، وتبقى هذه اللوحة متاحة.</p>
      </Card>
      <MailPolicyCard onMsg={setMsg} />
      <MfaPolicyCard onMsg={setMsg} />
      <SourcePolicyCard onMsg={setMsg} />
      <AlertReviewCard onMsg={setMsg} />
      <BrandCard onMsg={setMsg} />
      <Card title="التسجيل">
        <p className="sa-muted">لا يوجد تسجيل ذاتي في MMS: الحسابات تُنشأ فقط من قسم «المستخدمون» أو من لوحة الإدارة.</p>
      </Card>
      <div className="sa-row sa-card--wide">
        <button type="button" className="sa-btn" onClick={save}>
          حفظ الإعدادات
        </button>
      </div>
      <ApiKeysCard onMsg={setMsg} />
      <SharesCard onMsg={setMsg} />
      <Card title="سجل إجراءات الإدارة العليا" wide>
        <SimpleTable
          rows={data.audit}
          cols={[
            ['الوقت', (a) => fmtDate(a.t)],
            ['الإجراء', (a) => <span className="sa-tag">{AUDIT_LABEL[a.action] || a.action}</span>],
            ['الهدف', (a) => <span dir="auto">{a.target}</span>],
            ['التفاصيل', (a) => <small dir="auto">{a.detail}</small>],
            ['بواسطة', (a) => <span dir="ltr">{a.actor}</span>],
            ['العنوان', (a) => <span dir="ltr">{flag(a.country)} {a.ip}</span>],
          ]}
        />
      </Card>
    </div>
  )
}
