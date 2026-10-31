import { useState } from 'react'
import { useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { PageHead } from './Extras'

/**
 * سجل التدقيق pour l'administrateur du client, en LECTURE SEULE (audit v5, P0 ; décision du 31/10) : consultation et
 * filtres, sans export ni modification. Adresses IP masquées, actions internes de la console Super Admin retirées.
 * La version complète (CSV, chaîne d'empreintes) reste dans la console Super Admin. Serveur : GET /api/audit-trail.
 */

type Row = { t: string; actor: string; role: string; ip: string; category: string; action: string; target: string; status: number; detail?: string; shared?: boolean }
type Data = { rows: Row[]; summary: { total: number; last7: Record<string, number>; intact: boolean; shared: { count: number } } }

const CATS = ['login', 'recording', 'portal', 'watch', 'export', 'users', 'sources', 'other', 'shared'] as const
const TEXT = {
  ar: {
    title: 'سجل التدقيق',
    intro: 'من دخل، ومن برمج تسجيلاً، ومن نشر على البوابة، ومن عدّل رصداً أو صدّر بيانات. للاطلاع فقط: لا يمكن تعديل أي سطر أو حذفه.',
    cats: { login: 'الدخول', recording: 'التسجيلات', portal: 'البوابة العامة', watch: 'الرصد', export: 'التصدير والتقارير', users: 'الحسابات', sources: 'مصادر البث', other: 'أخرى', shared: '⚠ الحسابات المشتركة' } as Record<string, string>,
    actions: { login_ok: 'تسجيل دخول', login_failed: 'محاولة دخول فاشلة', login_disabled: 'دخول بحساب معطّل', logout: 'خروج', shared_account_used: 'استعمال حساب مشترك', shared_account_blocked: 'عملية مرفوضة: حساب مشترك للقراءة فقط', shared_account_disabled: 'تعطيل الحساب المشترك', nominative_admin_created: 'إنشاء حساب مدير اسمي', account_activated: 'تفعيل حساب', mfa_asked: 'كلمة مرور صحيحة، بانتظار الرمز' } as Record<string, string>,
    all: 'كل الفئات',
    actor: 'الحساب',
    q: 'بحث',
    cols: ['التاريخ', 'الحساب', 'الفئة', 'العملية', 'النتيجة', 'العنوان'],
    ok: 'نجحت',
    ko: 'رُفضت',
    intact: 'السجل سليم: لم يُعدّل أي سطر.',
    broken: 'تنبيه: قد يكون سطر قد عُدّل أو حُذف؛ أُبلغت الإدارة.',
    shared: (n: number) => `⚠ ${n} عملية بحساب مشترك خلال 7 أيام`,
    empty: 'لا عمليات مطابقة.',
    readOnly: 'للاطلاع فقط',
  },
  en: {
    title: 'Audit log',
    intro: 'Who signed in, scheduled a recording, published on the portal, changed a watch or exported data. Read-only: no line can be changed or deleted.',
    cats: { login: 'Sign-in', recording: 'Recordings', portal: 'Public portal', watch: 'Watches', export: 'Exports & reports', users: 'Accounts', sources: 'Broadcast sources', other: 'Other', shared: '⚠ Shared accounts' } as Record<string, string>,
    actions: { login_ok: 'Sign-in', login_failed: 'Failed sign-in', login_disabled: 'Sign-in on disabled account', logout: 'Sign-out', shared_account_used: 'Shared account used', shared_account_blocked: 'Refused: shared account is read-only', shared_account_disabled: 'Shared account disabled', nominative_admin_created: 'Named admin account created', account_activated: 'Account activated', mfa_asked: 'Password OK, waiting for code' } as Record<string, string>,
    all: 'All categories',
    actor: 'Account',
    q: 'Search',
    cols: ['Date', 'Account', 'Category', 'Action', 'Result', 'Address'],
    ok: 'Done',
    ko: 'Refused',
    intact: 'The log is intact: no line was changed.',
    broken: 'Warning: a line may have been changed or deleted; administrators were notified.',
    shared: (n: number) => `⚠ ${n} actions by a shared account in 7 days`,
    empty: 'No matching action.',
    readOnly: 'Read-only',
  },
}

export function AuditLogClient() {
  const i = useI18n()
  const t = TEXT[i.lang === 'en' ? 'en' : 'ar']
  const [f, setF] = useState({ category: '', actor: '', q: '' })
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()
  const { data, error } = useFetch<Data>(`/api/audit-trail?${qs}`, 60_000)
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v })
  return (
    <>
      <PageHead title={`${t.title} · ${t.readOnly}`} intro={t.intro} />
      {error && <p className="news-status news-status--error">{i.t.loadError}</p>}
      {data && (
        <p className={data.summary.intact ? 'mms-note' : 'mms-note mms-note--danger'}>
          {data.summary.intact ? t.intact : t.broken}
          {data.summary.shared.count > 0 && <b> · {t.shared(data.summary.shared.count)}</b>}
        </p>
      )}
      <div className="news-filters">
        <select value={f.category} onChange={(e) => set('category', e.target.value)} aria-label={t.all}>
          <option value="">{t.all}</option>
          {CATS.map((c) => (
            <option key={c} value={c}>
              {t.cats[c]}
            </option>
          ))}
        </select>
        <input value={f.actor} onChange={(e) => set('actor', e.target.value)} placeholder={t.actor} dir="ltr" aria-label={t.actor} />
        <input value={f.q} onChange={(e) => set('q', e.target.value)} placeholder={t.q} dir="auto" aria-label={t.q} />
      </div>
      {data && data.rows.length === 0 && <p className="news-status">{t.empty}</p>}
      {data && data.rows.length > 0 && (
        <div className="audit-client">
          <table>
            <thead>
              <tr>
                {t.cols.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, k) => (
                <tr key={k} className={r.shared ? 'is-shared' : undefined}>
                  <td>{i.dateTime(r.t)}</td>
                  <td dir="ltr">{r.actor || '—'}</td>
                  <td>{t.cats[r.category] ?? r.category}</td>
                  <td dir="auto">
                    {t.actions[r.action] ?? r.action}
                    {r.target && <small> · {r.target}</small>}
                    {r.detail && <small> · {r.detail}</small>}
                  </td>
                  <td>{r.status >= 400 ? t.ko : t.ok}</td>
                  <td dir="ltr">{r.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
