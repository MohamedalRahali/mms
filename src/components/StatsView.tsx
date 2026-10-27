import { useState } from 'react'
import { DataSince } from './DataSince'
import { type Count, type Flux, type Stats, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { useCountUp } from '../lib/motion'
import { TopEngaged } from './Pro'
import { useMedia } from '../lib/media'
import { type MediaType } from '../lib/news'
import { Delta, EntityPanel, MoodPanel } from './Trends'

function CountUp({ value, num }: { value: number; num: (n: number) => string }) {
  return <>{num(useCountUp(value))}</>
}

function HBars({ rows, label }: { rows: Count[]; label: (name: string) => string }) {
  const { t, num } = useI18n()
  if (rows.length === 0) return <p className="news-status">{t.noData}</p>
  const max = Math.max(...rows.map((r) => r.count), 1)
  return (
    <ul className="news-hbars">
      {rows.map((r) => (
        <li key={r.name} title={`${label(r.name)}: ${num(r.count)}`}>
          <span className="news-hbars__label" dir="auto">
            {label(r.name)}
          </span>
          <span className="news-hbars__track">
            <span className="news-hbars__bar" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="news-hbars__value">{num(r.count)}</span>
        </li>
      ))}
    </ul>
  )
}

function DailyChart({ perDay }: { perDay: Stats['perDay'] }) {
  const { t, num, day: formatDay } = useI18n()
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...perDay.map((d) => d.count), 1)
  const active = hover != null ? perDay[hover] : null
  const average = Math.round(perDay.reduce((n, d) => n + d.count, 0) / Math.max(perDay.length, 1))

  return (
    <div className="news-daily">
      <p className="news-daily__readout" role="status">
        {active ? (
          <>
            <strong>{num(active.count)}</strong> {t.newsUnit} · {formatDay(active.date)}
          </>
        ) : (
          <>
            <strong>{num(average)}</strong> {t.perDayAvg}
          </>
        )}
      </p>
      <div className="news-daily__plot" dir="ltr" onPointerLeave={() => setHover(null)}>
        <span className="news-daily__max">{num(max)}</span>
        {perDay.map((d, i) => (
          <button
            key={d.date}
            type="button"
            className={hover === i ? 'news-daily__col is-active' : 'news-daily__col'}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`${formatDay(d.date)}: ${d.count}`}
          >
            <span style={{ height: `${(d.count / max) * 100}%` }} />
          </button>
        ))}
      </div>
      <div className="news-daily__axis" dir="ltr">
        <span>{formatDay(perDay[0].date)}</span>
        <span>{formatDay(perDay[perDay.length - 1].date)}</span>
      </div>
    </div>
  )
}

export function StatsView({ flux }: { flux: Flux | '' }) {
  const i = useI18n()
  const { t, num, day: formatDay } = i
  const m = useMedia()
  const [days, setDays] = useState('30')
  const { data, error, loading } = useFetch<Stats>(`/api/news/stats?days=${days}${flux ? `&flux=${flux}` : ''}`)
  // Période double : la différence donne la période précédente, pour les variations des chiffres clés
  const wide = useFetch<Stats>(`/api/news/stats?days=${Number(days) * 2}${flux ? `&flux=${flux}` : ''}`).data
  const prev = wide && data && wide.days === data.days * 2 ? { total: wide.total - data.total, broadcasts: wide.broadcasts - data.broadcasts } : null

  return (
    <>
      <DataSince />
      <div className="news-filters">
        <select value={days} onChange={(e) => setDays(e.target.value)} aria-label="period">
          <option value="7">{t.last7}</option>
          <option value="30">{t.last30}</option>
          <option value="90">{t.last90}</option>
        </select>
      </div>

      {error && (
        <p className="news-status news-status--error" role="alert">
          {t.loadError}
        </p>
      )}
      {loading && !data && <p className="news-status">{t.loading}</p>}

      {data && (
        <div className="news-stats">
          <div className="news-tiles">
            <div className="news-tile">
              <span>{t.tileTotal}</span>
              <strong>
                <CountUp value={data.total} num={num} />
              </strong>
              <Delta now={data.total} before={prev?.total ?? null} />
            </div>
            <div className="news-tile">
              <span>{t.tileBroadcasts}</span>
              <strong>
                <CountUp value={data.broadcasts} num={num} />
              </strong>
              <Delta now={data.broadcasts} before={prev?.broadcasts ?? null} />
            </div>
            <div className="news-tile">
              <span>{t.tileSources}</span>
              <strong>
                <CountUp value={data.sourcesCount} num={num} />
              </strong>
            </div>
            <div className="news-tile">
              <span>{t.tileAverage}</span>
              <strong>
                <CountUp value={Math.round(data.total / data.days)} num={num} />
              </strong>
            </div>
          </div>

          <section className="news-panel news-panel--wide">
            <h3>{t.perDay}</h3>
            <DailyChart perDay={data.perDay} />
            <details className="news-table">
              <summary>{t.showTable}</summary>
              <table>
                <thead>
                  <tr>
                    <th>{t.day}</th>
                    <th>{t.count}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.perDay].reverse().map((d) => (
                    <tr key={d.date}>
                      <td>{formatDay(d.date)}</td>
                      <td>{num(d.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>

          <MoodPanel stats={data} />

          <section className="news-panel">
            <h3>{t.categories}</h3>
            <HBars rows={data.categories} label={i.category} />
          </section>

          <section className="news-panel">
            <h3>{t.topSources}</h3>
            <HBars rows={data.sources} label={(n) => n} />
          </section>

          <section className="news-panel">
            <h3>{t.channels}</h3>
            <HBars rows={data.channels} label={i.channel} />
          </section>

          {!!data.media?.length && (
            <section className="news-panel">
              <h3>{m.mediaTitle}</h3>
              <HBars rows={data.media} label={(n) => m.types[n as MediaType] ?? n} />
            </section>
          )}

          {data.reactions && (
            <section className="news-panel">
              <h3>{m.reactionsTitle}</h3>
              <HBars
                rows={[
                  { name: m.editorial, count: data.reactions.editorial },
                  { name: m.commentsLabel, count: data.reactions.comments },
                  { name: m.repliesLabel, count: data.reactions.replies },
                ]}
                label={(n) => n}
              />
            </section>
          )}

          <EntityPanel stats={data} days={data.days} />

          <section className="news-panel">
            <h3>{t.fluxes}</h3>
            <HBars rows={data.flux} label={i.flux} />
          </section>
        </div>
      )}
      {data && <TopEngaged flux={flux} days={Number(days)} />}
    </>
  )
}
