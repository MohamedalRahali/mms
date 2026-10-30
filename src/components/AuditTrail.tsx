import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { useFetch } from '../lib/news'
import { PageHead } from './Extras'

/**
 * سجل التدقيق (server/auditTrail.js) : qui a fait quoi — connexions, enregistrements, portail public, veilles,
 * exports, comptes et réglages. Réservé aux administrateurs du client ; export CSV ; chaîne d'empreintes vérifiée.
 */

type Row = { t: string; actor: string; role: string; ip: string; category: string; action: string; target: string; status: number; detail?: string }
type Data = { rows: Row[]; summary: { total: number; last7: Record<string, number>; actors: string[]; intact: boolean } }

const CATS = ['login', 'recording', 'portal', 'watch', 'export', 'users', 'sources', 'settings', 'other'] as const

const TEXT = {
  ar: {
    title: 'سجل التدقيق',
    intro: 'كل عملية حساسة على المنصة: من دخل، ومن برمج تسجيلاً، ومن نشر على البوابة، ومن عدّل رصداً أو صدّر بيانات أو غيّر الحسابات. لا تُسجّل كلمات المرور ولا المحتوى.',
    cats: { login: 'الدخول', recording: 'التسجيلات', portal: 'البوابة العامة', watch: 'الرصد', export: 'التصدير والتقارير', users: 'الحسابات والصلاحيات', sources: 'مصادر البث', settings: 'الإعدادات', other: 'أخرى' } as Record<string, string>,
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
    denied: 'هذه الصفحة خاصة بمديري المنصة.',
    actions: { login_ok: 'تسجيل دخول', login_failed: 'محاولة دخول فاشلة', login_disabled: 'دخول بحساب معطّل', logout: 'خروج', shared_account_disabled: 'تعطيل الحساب المشترك', shared_account_kept: 'الإبقاء على الحساب المشترك', stream_cut: 'انقطاع بث', stream_back: 'عودة البث' } as Record<string, string>,
  },
  en: {
    title: 'Audit log',
    intro: 'Every sensitive action on the platform: who signed in, who scheduled a recording, who published on the portal, who changed a watch, exported data or changed accounts. Passwords and content are never recorded.',
    cats: { login: 'Sign-in', recording: 'Recordings', portal: 'Public portal', watch: 'Watches', export: 'Exports & reports', users: 'Accounts & permissions', sources: 'Broadcast sources', settings: 'Settings', other: 'Other' } as Record<string, string>,
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
    denied: 'This page is for platform administrators.',
    actions: { login_ok: 'Sign-in', login_failed: 'Failed sign-in', login_disabled: 'Sign-in on disabled account', logout: 'Sign-out', shared_account_disabled: 'Shared account disabled', shared_account_kept: 'Shared account kept', stream_cut: 'Stream cut', stream_back: 'Stream back' } as Record<string, string>,
  },
}

export function AuditTrail() {
  const i = useI18n()
  const t = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const [f, setF] = useState({ category: '', actor: '', q: '', from: '', to: '' })
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()
  const { data, error } = useFetch<Data>(`/api/audit-trail?${qs}&limit=500`)
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  return (
    <>
      <PageHead title={t.title} intro={t.intro} />
      {error && <p className="mms-note">{t.denied}</p>}
      {data && (
        <p className={data.summary.intact ? 'news-status' : 'mms-note'} role={data.summary.intact ? undefined : 'alert'}>
          {data.summary.intact ? '🔒 ' : '⚠ '}
          {data.summary.intact ? t.intact : t.broken} · {t.total(data.summary.total)}
        </p>
      )}
      <form className="news-filters audit-filters" onSubmit={(e) => e.preventDefault()}>
        <select value={f.category} onChange={(e) => set('category', e.target.value)} aria-label={t.all}>
          <option value="">{t.all}</option>
          {CATS.map((c) => (
            <option key={c} value={c}>
              {t.cats[c]}
              {data?.summary.last7[c] ? ` (${data.summary.last7[c]})` : ''}
            </option>
          ))}
        </select>
        <input list="audit-actors" value={f.actor} onChange={(e) => set('actor', e.target.value)} placeholder={t.actor} dir="ltr" />
        <datalist id="audit-actors">
          {data?.summary.actors.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <input value={f.q} onChange={(e) => set('q', e.target.value)} placeholder={t.q} dir="auto" />
        <label>
          {t.from} <input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} />
        </label>
        <label>
          {t.to} <input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} />
        </label>
        <a className="news-btn news-btn--ghost" href={`/api/audit-trail.csv?${qs}`} download>
          {t.csv}
        </a>
      </form>
      {data && data.rows.length === 0 && <p className="news-status">{t.empty}</p>}
      {data && data.rows.length > 0 && (
        <div className="audit-table" role="table">
          <div className="audit-row audit-row--head" role="row">
            {t.cols.map((c) => (
              <span key={c} role="columnheader">
                {c}
              </span>
            ))}
          </div>
          {data.rows.map((r, k) => (
            <div key={k} className={`audit-row${r.status >= 400 ? ' is-ko' : ''}`} role="row">
              <span role="cell">{i.dateTime(r.t)}</span>
              <span role="cell" dir="ltr">
                {r.actor || '—'}
              </span>
              <span role="cell">{t.cats[r.category] ?? r.category}</span>
              <span role="cell" dir="auto">
                {t.actions[r.action] ?? r.action}
                {r.target && <small> · {r.target}</small>}
                {r.detail && <small> · {r.detail}</small>}
              </span>
              <span role="cell">{r.status >= 400 ? t.ko : t.ok}</span>
              <span role="cell" dir="ltr">
                {r.ip}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default AuditTrail
