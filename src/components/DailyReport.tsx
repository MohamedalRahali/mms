import { useState } from 'react'
import { type Flux, type NewsItem, type Report, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'

/** Rapport d'une journée, classé par catégorie, prêt à imprimer ou à enregistrer en PDF */
export function DailyReport({ flux, initialDay = '' }: { flux: Flux | ''; initialDay?: string }) {
  const i = useI18n()
  const { t } = i
  const [day, setDay] = useState(initialDay)
  const { data, error, loading } = useFetch<Report>(`/api/report?day=${day}${flux ? `&flux=${flux}` : ''}`)

  const groups = new Map<string, NewsItem[]>()
  for (const it of data?.items ?? []) groups.set(it.category, [...(groups.get(it.category) ?? []), it])
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)

  return (
    <>
      <div className="news-filters mms-noprint">
        <select value={data?.day ?? ''} onChange={(e) => setDay(e.target.value)} aria-label="day" disabled={!data?.available.length}>
          {data?.available.map((d) => (
            <option key={d} value={d}>
              {i.day(d)}
            </option>
          ))}
        </select>
        <button type="button" className="news-btn" onClick={() => window.print()} disabled={!data?.items.length}>
          {t.print}
        </button>
      </div>

      {error && (
        <p className="news-status news-status--error" role="alert">
          {t.loadError}
        </p>
      )}
      {loading && !data && <p className="news-status">{t.loading}</p>}
      {data && !data.day && <p className="news-status">{t.noNews}</p>}

      {data?.day && (
        <article className="mms-report">
          <header className="mms-report__head">
            <p>MMS{flux ? ` · ${i.flux(flux)}` : ''}</p>
            <h2>
              {t.reportOf} {i.dayLong(data.day)}
            </h2>
            <p>
              {t.reportCount(i.num(data.items.length))}
              {data.demo && t.reportDemo}
            </p>
          </header>
          {ordered.map(([category, items]) => (
            <section key={category} className="mms-report__group">
              <h3>
                {i.category(category)} <span>({items.length})</span>
              </h3>
              <ul>
                {items.map((it) => (
                  <li key={it.id}>
                    <p className="mms-report__line">
                      <b>{i.time(it.date)}</b>
                      <strong dir="auto">{it.title}</strong>
                    </p>
                    {it.summary && <p dir="auto">{it.summary}</p>}
                    <p className="mms-report__src">
                      {it.origin} · {i.channel(it.channel)}
                      {it.broadcasts > 1 && ` · ${t.broadcastShort(it.broadcasts)}`}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </article>
      )}
    </>
  )
}
