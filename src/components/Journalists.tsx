import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { useFetch } from '../lib/news'
import { PageHead } from './Extras'

/**
 * قاعدة الصحفيين ووسائل الإعلام (server/journalists.js) : journalistes et médias libyens, leurs publications et les
 * citations par d'autres sources, mois par mois. Première version, calculée sur les fiches de la veille.
 */

type Kind = 'journalist' | 'media'
type Row = { name: string; kind: Kind; count: number; first: string; last: string; libyan?: boolean; outlets?: { name: string; count: number }[]; channels?: string[]; authors?: string[]; reliability?: string }
type List = { total: number; page: number; pages: number; counts: { journalists: number; libyanJournalists: number; media: number }; rows: Row[] }
type Brief = { id: string; title: string; origin: string; date: string; url: string }
type Entry = Row & { published: Brief[]; publishedTotal: number; citations: Brief[]; citationsTotal: number; citedBy: string[]; timeline: { months: string[]; published: Record<string, number>; cited: Record<string, number> } }

const TEXT = {
  ar: {
    title: 'الصحفيون ووسائل الإعلام',
    intro: 'قاعدة أولى للصحفيين ووسائل الإعلام الليبية، مبنية من توقيعات المقالات والمدونات وما ترصده المنصة، مع سجل ما نشروه وما نُقل عنهم.',
    journalists: 'الصحفيون',
    media: 'وسائل الإعلام',
    libyanOnly: 'الليبيون فقط',
    search: 'ابحث عن اسم أو وسيلة',
    count: (n: number) => `${n} منشور`,
    since: (a: string, b: string) => `من ${a} إلى ${b}`,
    outlets: 'ينشر في',
    published: 'المنشورات',
    citations: 'نُقل عنه / ذُكر في',
    citedBy: 'المصادر التي ذكرته',
    timeline: 'آخر 12 شهراً (منشورات / ذكر)',
    back: '→ العودة إلى القائمة',
    empty: 'لا توجد نتائج. تُبنى القاعدة من توقيعات المقالات: تظهر الأسماء مع وصول مقالات موقّعة.',
    prev: 'السابق',
    next: 'التالي',
    rel: { high: 'موثوقية عالية', medium: 'موثوقية متوسطة', social: 'حساب اجتماعي معروف', low: 'غير مؤكد' } as Record<string, string>,
  },
  en: {
    title: 'Journalists & media',
    intro: 'A first database of Libyan journalists and media, built from article and blog bylines and what the platform monitors, with what they published and where they were quoted.',
    journalists: 'Journalists',
    media: 'Media',
    libyanOnly: 'Libyan only',
    search: 'Search a name or outlet',
    count: (n: number) => `${n} items`,
    since: (a: string, b: string) => `from ${a} to ${b}`,
    outlets: 'Writes for',
    published: 'Published',
    citations: 'Quoted / mentioned in',
    citedBy: 'Sources that mention them',
    timeline: 'Last 12 months (published / mentioned)',
    back: '← Back to the list',
    empty: 'No result. The base is built from bylines: names appear as signed articles arrive.',
    prev: 'Previous',
    next: 'Next',
    rel: { high: 'High reliability', medium: 'Medium reliability', social: 'Identified social account', low: 'Unverified' } as Record<string, string>,
  },
}

export function Journalists() {
  const i = useI18n()
  const t = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const [kind, setKind] = useState<Kind>('journalist')
  const [q, setQ] = useState('')
  const [libyan, setLibyan] = useState(true)
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<Row | null>(null)
  const { data } = useFetch<List>(`/api/journalists?kind=${kind}&q=${encodeURIComponent(q)}&libyan=${libyan ? 1 : 0}&page=${page}`)
  const day = (iso: string) => i.dateTime(iso).split(/[،,]/)[0]
  if (open) return <EntryView row={open} t={t} onBack={() => setOpen(null)} />
  return (
    <>
      <PageHead title={t.title} intro={t.intro} />
      <div className="news-filters">
        <div className="seg" role="tablist">
          {(['journalist', 'media'] as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={kind === k ? 'seg__btn is-active' : 'seg__btn'}
              onClick={() => {
                setKind(k)
                setPage(1)
              }}
            >
              {k === 'journalist' ? t.journalists : t.media}
              {data && <small> {k === 'journalist' ? (libyan ? data.counts.libyanJournalists : data.counts.journalists) : data.counts.media}</small>}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
          placeholder={t.search}
          dir="auto"
        />
        {kind === 'journalist' && (
          <label>
            <input type="checkbox" checked={libyan} onChange={(e) => setLibyan(e.target.checked)} /> {t.libyanOnly}
          </label>
        )}
      </div>
      {data && data.rows.length === 0 && <p className="news-status">{t.empty}</p>}
      <div className="jr-grid">
        {data?.rows.map((r) => (
          <button key={r.name} type="button" className="news-card jr-card" onClick={() => setOpen(r)}>
            <b dir="auto">{r.name}</b>
            <small>
              {t.count(r.count)} · {t.since(day(r.first), day(r.last))}
            </small>
            {r.outlets && (
              <small dir="auto">
                {t.outlets}: {r.outlets.slice(0, 3).map((o) => o.name).join('، ')}
              </small>
            )}
            {r.reliability && <small>{t.rel[r.reliability] ?? r.reliability}</small>}
          </button>
        ))}
      </div>
      {data && data.pages > 1 && (
        <div className="pf-pager">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t.prev}
          </button>
          <span>
            {data.page} / {data.pages}
          </span>
          <button type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            {t.next}
          </button>
        </div>
      )}
    </>
  )
}

function EntryView({ row, t, onBack }: { row: Row; t: (typeof TEXT)['ar'] | (typeof TEXT)['en']; onBack: () => void }) {
  const i = useI18n()
  const { data } = useFetch<Entry>(`/api/journalists/entry?kind=${row.kind}&name=${encodeURIComponent(row.name)}`, 0)
  const max = data ? Math.max(1, ...data.timeline.months.map((m) => (data.timeline.published[m] || 0) + (data.timeline.cited[m] || 0))) : 1
  const list = (items: Brief[]) => (
    <ul className="jr-list">
      {items.map((b) => (
        <li key={b.id}>
          <a href={b.url || undefined} target="_blank" rel="noopener noreferrer nofollow" dir="auto">
            {b.title}
          </a>
          <small>
            {' '}
            · {b.origin} · {i.dateTime(b.date)}
          </small>
        </li>
      ))}
    </ul>
  )
  return (
    <>
      <button type="button" className="news-btn news-btn--ghost" onClick={onBack}>
        {t.back}
      </button>
      <PageHead title={row.name} />
      {data && (
        <>
          <section className="news-card">
            <h3>{t.timeline}</h3>
            <div className="jr-bars">
              {data.timeline.months.map((m) => (
                <div key={m} title={`${m}: ${data.timeline.published[m] || 0} / ${data.timeline.cited[m] || 0}`}>
                  <i style={{ blockSize: `${((data.timeline.published[m] || 0) / max) * 100}%` }} />
                  <i className="is-cited" style={{ blockSize: `${((data.timeline.cited[m] || 0) / max) * 100}%` }} />
                  <small>{m.slice(5)}</small>
                </div>
              ))}
            </div>
            {data.citedBy.length > 0 && (
              <p dir="auto">
                {t.citedBy}: {data.citedBy.join('، ')}
              </p>
            )}
          </section>
          <section className="news-card">
            <h3>
              {t.published} ({data.publishedTotal})
            </h3>
            {list(data.published)}
          </section>
          <section className="news-card">
            <h3>
              {t.citations} ({data.citationsTotal})
            </h3>
            {list(data.citations)}
          </section>
        </>
      )}
    </>
  )
}

export default Journalists
