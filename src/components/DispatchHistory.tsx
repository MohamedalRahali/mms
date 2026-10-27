import { useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'

/** سجل الإرسال : envois des veilles, alertes du radar, briefing et rapports (server/dispatchLog.js) */

type Row = { at: string; kind: 'watch' | 'radar' | 'briefing' | 'report'; name: string; count: number; channels: string[]; recipients: number; status: 'sent' | 'failed' | 'blocked'; error?: string; by?: string }

const TEXT = {
  ar: {
    title: 'سجل الإرسال',
    intro: 'كل ما أرسلته المنصة بالبريد أو Telegram: الرصد، تنبيهات الرادار، التقرير التنفيذي والتقارير.',
    empty: 'لم يُرسل شيء بعد.',
    kinds: { watch: 'رصد', radar: 'تنبيه الرادار', briefing: 'تقرير تنفيذي', report: 'تقرير' },
    status: { sent: 'أُرسل', failed: 'فشل', blocked: 'محجوب (خارج النطاقات)' },
    cols: ['الوقت', 'النوع', 'الموضوع', 'الأخبار', 'القنوات', 'المستلمون', 'النتيجة'],
  },
  en: {
    title: 'Dispatch history',
    intro: 'Everything the platform sent by email or Telegram: watches, radar alerts, executive briefing and reports.',
    empty: 'Nothing sent yet.',
    kinds: { watch: 'Watch', radar: 'Radar alert', briefing: 'Executive briefing', report: 'Report' },
    status: { sent: 'Sent', failed: 'Failed', blocked: 'Blocked (domain)' },
    cols: ['Time', 'Type', 'Subject', 'News', 'Channels', 'Recipients', 'Result'],
  },
}

export function DispatchHistory() {
  const i = useI18n()
  const t = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const { data } = useFetch<{ rows: Row[] }>('/api/watches/history')
  return (
    <section className="mms-widget dispatch">
      <header className="mms-widget__head mms-widget__head--plain">
        <div>
          <span>MMS / {t.title}</span>
          <strong>{t.title}</strong>
        </div>
      </header>
      <div className="mms-widget__body">
        <p className="news-status">{t.intro}</p>
        {data && !data.rows.length && <p className="news-status">{t.empty}</p>}
        {!!data?.rows.length && (
          <div className="dispatch__table" role="table">
            <div className="dispatch__row dispatch__row--head" role="row">
              {t.cols.map((c) => (
                <span key={c} role="columnheader">
                  {c}
                </span>
              ))}
            </div>
            {data.rows.map((r, k) => (
              <div key={k} className={`dispatch__row is-${r.status}`} role="row">
                <span role="cell">{i.dateTime(r.at)}</span>
                <span role="cell">{t.kinds[r.kind] ?? r.kind}</span>
                <span role="cell" dir="auto">
                  {r.name}
                </span>
                <span role="cell">{r.count ? i.num(r.count) : '—'}</span>
                <span role="cell">{r.channels.join(' · ') || '—'}</span>
                <span role="cell">{i.num(r.recipients)}</span>
                <span role="cell">
                  <b className={`dispatch__status is-${r.status}`}>{t.status[r.status]}</b>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
