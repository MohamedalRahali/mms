import { useEffect, useState } from 'react'
import { api, errText, fmtDate } from './api'

/**
 * سجل التدقيق (server/auditTrail.js) : qui a fait quoi — connexions, enregistrements, portail public, veilles,
 * exports, comptes et réglages. Dans la console Super Admin seulement (déplacé de l'application client le 30/10) ;
 * filtres, export CSV, chaîne d'empreintes vérifiée. Arabe par défaut, anglais au choix.
 */

type Row = { t: string; actor: string; role: string; ip: string; category: string; action: string; target: string; status: number; detail?: string; shared?: boolean }
type Data = { rows: Row[]; summary: { total: number; last7: Record<string, number>; actors: string[]; intact: boolean } }

const CATS = ['login', 'recording', 'portal', 'watch', 'export', 'users', 'sources', 'settings', 'other', 'shared'] as const

const TEXT = {
  ar: {
    title: 'سجل التدقيق',
    intro: 'كل عملية حساسة على المنصة: من دخل، ومن برمج تسجيلاً، ومن نشر على البوابة، ومن عدّل رصداً أو صدّر بيانات أو غيّر الحسابات. لا تُسجّل كلمات المرور ولا المحتوى.',
    cats: { login: 'الدخول', recording: 'التسجيلات', portal: 'البوابة العامة', watch: 'الرصد', export: 'التصدير والتقارير', users: 'الحسابات والصلاحيات', sources: 'مصادر البث', settings: 'الإعدادات', other: 'أخرى', shared: '⚠ الحسابات المشتركة' } as Record<string, string>,
    all: 'كل الفئات',
    actor: 'الحساب',
    q: 'بحث',
    from: 'من',
    to: 'إلى',
    csv: 'تنزيل CSV',
    intact: 'السجل سليم: لم يُعدّل أي سطر (سلسلة البصمات صحيحة).',
    broken: 'تنبيه: سلسلة البصمات مكسورة، قد يكون سطر قد عُدّل أو حُذف.',
    total: (n: number) => `${n} عملية مسجّلة`,
    cols: ['التاريخ', 'الحساب', 'الفئة', 'العملية', 'النتيجة', 'العنوان'],
    ok: 'نجحت',
    ko: 'رُفضت',
    empty: 'لا توجد عمليات مطابقة.',
    actions: { login_ok: 'تسجيل دخول', login_failed: 'محاولة دخول فاشلة', login_disabled: 'دخول بحساب معطّل', logout: 'خروج', shared_account_disabled: 'تعطيل الحساب المشترك', shared_account_used: 'استعمال حساب مشترك', shared_account_blocked: 'عملية مرفوضة: حساب مشترك للقراءة فقط', nominative_admin_created: 'إنشاء حساب مدير اسمي', activation_link_issued: 'إنشاء رابط تفعيل', account_activated: 'تفعيل حساب', shared_account_kept: 'الإبقاء على الحساب المشترك', mfa_asked: 'كلمة مرور صحيحة، بانتظار الرمز', stream_cut: 'انقطاع بث', stream_back: 'عودة البث' } as Record<string, string>,
  },
  en: {
    title: 'Audit log',
    intro: 'Every sensitive action on the platform: who signed in, who scheduled a recording, who published on the portal, who changed a watch, exported data or changed accounts. Passwords and content are never recorded.',
    cats: { login: 'Sign-in', recording: 'Recordings', portal: 'Public portal', watch: 'Watches', export: 'Exports & reports', users: 'Accounts & permissions', sources: 'Broadcast sources', settings: 'Settings', other: 'Other', shared: '⚠ Shared accounts' } as Record<string, string>,
    all: 'All categories',
    actor: 'Account',
    q: 'Search',
    from: 'From',
    to: 'To',
    csv: 'Download CSV',
    intact: 'Log intact: no line has been altered (hash chain valid).',
    broken: 'Warning: the hash chain is broken, a line may have been altered or removed.',
    total: (n: number) => `${n} recorded actions`,
    cols: ['Date', 'Account', 'Category', 'Action', 'Result', 'IP'],
    ok: 'OK',
    ko: 'Refused',
    empty: 'No matching action.',
    actions: { login_ok: 'Sign-in', login_failed: 'Failed sign-in', login_disabled: 'Sign-in on disabled account', logout: 'Sign-out', shared_account_disabled: 'Shared account disabled', shared_account_used: 'Shared account used', shared_account_blocked: 'Refused: shared account is read-only', nominative_admin_created: 'Named admin account created', activation_link_issued: 'Activation link issued', account_activated: 'Account activated', shared_account_kept: 'Shared account kept', mfa_asked: 'Password OK, waiting for code', stream_cut: 'Stream cut', stream_back: 'Stream back' } as Record<string, string>,
  },
}

type Lang = 'ar' | 'en'

export function LangToggle({ lang, onLang }: { lang: Lang; onLang: (l: Lang) => void }) {
  return (
    <span className="sa-lang" role="group" aria-label="اللغة / Language">
      <button type="button" className={lang === 'ar' ? 'sa-btn' : 'sa-btn sa-btn--ghost'} onClick={() => onLang('ar')}>
        العربية
      </button>
      <button type="button" className={lang === 'en' ? 'sa-btn' : 'sa-btn sa-btn--ghost'} onClick={() => onLang('en')}>
        English
      </button>
    </span>
  )
}

export function AuditLog() {
  const [lang, setLang] = useState<Lang>('ar')
  const t = TEXT[lang]
  const [f, setF] = useState({ category: '', actor: '', q: '', from: '', to: '' })
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    api<Data>(`/audit-trail?${qs}&limit=500`)
      .then((d) => live && (setData(d), setError('')))
      .catch((e) => live && setError(errText(e)))
    return () => {
      live = false
    }
  }, [qs])
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const when = (iso: string) => (lang === 'ar' ? fmtDate(iso) : new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Tripoli', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))
  return (
    <section className="sa-card sa-card--wide" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      <div className="sa-card__head">
        <h2>{t.title}</h2>
        <span className="sa-row">
          <LangToggle lang={lang} onLang={setLang} />
          <a className="sa-btn sa-btn--ghost" href={`/api/superadmin/audit-trail.csv?${qs}`} download>
            {t.csv}
          </a>
        </span>
      </div>
      <p className="sa-muted">{t.intro}</p>
      {error && <p className="sa-error">{error}</p>}
      {data && (
        <p className="sa-note" role={data.summary.intact ? undefined : 'alert'}>
          <span className={data.summary.intact ? 'sa-tag is-ok' : 'sa-tag is-bad'}>{data.summary.intact ? '🔒' : '⚠'}</span> {data.summary.intact ? t.intact : t.broken} · {t.total(data.summary.total)}
        </p>
      )}
      <form className="sa-filters" onSubmit={(e) => e.preventDefault()}>
        <label>
          {t.all}
          <select className="sa-input" value={f.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">{t.all}</option>
            {CATS.map((c) => (
              <option key={c} value={c}>
                {t.cats[c]}
                {data?.summary.last7[c] ? ` (${data.summary.last7[c]})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.actor}
          <input className="sa-input" list="audit-actors" value={f.actor} onChange={(e) => set('actor', e.target.value)} dir="ltr" />
        </label>
        <datalist id="audit-actors">
          {data?.summary.actors.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <label>
          {t.q}
          <input className="sa-input" value={f.q} onChange={(e) => set('q', e.target.value)} dir="auto" />
        </label>
        <label>
          {t.from}
          <input className="sa-input" type="date" value={f.from} onChange={(e) => set('from', e.target.value)} />
        </label>
        <label>
          {t.to}
          <input className="sa-input" type="date" value={f.to} onChange={(e) => set('to', e.target.value)} />
        </label>
      </form>
      {data && data.rows.length === 0 && <p className="sa-muted">{t.empty}</p>}
      {data && data.rows.length > 0 && (
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                {t.cols.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, k) => (
                <tr key={k} className={r.shared ? 'sa-row--shared' : undefined}>
                  <td>{when(r.t)}</td>
                  <td dir="ltr">
                    {r.actor || '—'}
                    {r.shared && <span className="sa-tag is-bad">{lang === 'ar' ? 'حساب مشترك' : 'Shared account'}</span>}
                  </td>
                  <td>
                    <span className="sa-tag">{t.cats[r.category] ?? r.category}</span>
                  </td>
                  <td dir="auto">
                    {t.actions[r.action] ?? r.action}
                    {r.target && <small> · {r.target}</small>}
                    {r.detail && <small> · {r.detail}</small>}
                  </td>
                  <td>
                    <span className={r.status >= 400 ? 'sa-tag is-bad' : 'sa-tag is-ok'}>{r.status >= 400 ? t.ko : t.ok}</span>
                  </td>
                  <td dir="ltr">{r.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
