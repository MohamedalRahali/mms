import { useEffect, useState, type FormEvent } from 'react'
import { NewsCard } from './NewsCard'
import { type Flux, type Health, type KeyState, type NewsItem, type UsageRow, type NewsResponse, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { useAlerts, useFavorites } from '../lib/prefs'

/** Bandeau orange « mises à jour disponibles », avec compte à rebours, comme NewsRadar */
export function UpdateToast({ onReload }: { onReload: () => void }) {
  const { t } = useI18n()
  const status = useFetch<NewsResponse>('/api/news?size=1', 20_000).data
  const [base, setBase] = useState<number | null>(null)
  const [left, setLeft] = useState(15)
  const total = status?.total ?? null
  const fresh = base !== null && total !== null && total > base ? total - base : 0

  useEffect(() => {
    if (base === null && total !== null) setBase(total)
    if (base !== null && total !== null && total < base) setBase(total)
  }, [base, total])

  useEffect(() => {
    if (!fresh) return
    setLeft(15)
    const id = window.setInterval(() => setLeft((n) => n - 1), 1000)
    return () => window.clearInterval(id)
  }, [fresh])

  function reload() {
    setBase(total)
    onReload()
  }
  useEffect(() => {
    if (fresh && left <= 0) reload()
  })

  if (!fresh) return null
  return (
    <div className="mms-toast" role="status">
      <strong>{t.updatesTitle}</strong>
      <span>
        {t.updatesText(fresh)} {Math.max(left, 0)} {t.seconds}
      </span>
      <button type="button" onClick={reload}>
        {t.updatesNow}
      </button>
    </div>
  )
}

/** Mode présentation plein écran : les dernières actualités défilent toutes seules */
export function Presentation({ flux, onClose }: { flux: Flux | ''; onClose: () => void }) {
  const i = useI18n()
  const { data } = useFetch<NewsResponse>(`/api/news?size=20${flux ? `&flux=${flux}` : ''}`)
  const items = data?.items ?? []
  const [n, setN] = useState(0)

  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {})
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setN((k) => k + 1)
      if (e.key === 'ArrowRight') setN((k) => k - 1)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [onClose])

  useEffect(() => {
    const id = window.setInterval(() => setN((k) => k + 1), 12_000)
    return () => window.clearInterval(id)
  }, [])

  const count = items.length
  const at = count ? ((n % count) + count) % count : 0
  const it = items[at]
  return (
    <div className="mms-present" dir={i.dir}>
      <button type="button" className="mms-present__exit" onClick={onClose}>
        {i.t.presentExit}
      </button>
      {it ? (
        <article key={it.id} className="mms-present__slide">
          <p className="mms-present__src">
            <span className={`mms-flag mms-flag--${it.flux}`} /> {i.flux(it.flux)} · {it.origin} · {i.dateTime(it.date)}
          </p>
          <h2 dir="auto">{it.title}</h2>
          {it.image && <img src={it.image} alt="" referrerPolicy="no-referrer" />}
          <p dir="auto">{it.summary}</p>
          <span className="news-badge">{i.category(it.category)}</span>
        </article>
      ) : (
        <p className="mms-present__slide">{i.t.loading}</p>
      )}
      <div className="mms-present__nav">
        <button type="button" onClick={() => setN((k) => k - 1)} aria-label={i.t.prev}>
          ‹
        </button>
        <span>{i.t.presentOf(at + 1, count)}</span>
        <button type="button" onClick={() => setN((k) => k + 1)} aria-label={i.t.next}>
          ›
        </button>
      </div>
    </div>
  )
}

export function PageHead({ title, intro }: { title: string; intro?: string }) {
  return (
    <header className="mms-page__head">
      <h2>{title}</h2>
      {intro && <p>{intro}</p>}
    </header>
  )
}

export function Favorites() {
  const { t } = useI18n()
  const fav = useFavorites()
  return (
    <>
      <PageHead title={t.sideFavorites} />
      {fav.list.length === 0 ? (
        <p className="news-status">{t.favEmpty}</p>
      ) : (
        <>
          <div className="news-filters">
            <button type="button" className="news-btn news-btn--ghost" onClick={fav.clear}>
              {t.favClear}
            </button>
          </div>
          <div className="news-list">
            {fav.list.map((it) => (
              <NewsCard key={it.id} item={it} />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function AlertBlock({ word, flux, onRemove }: { word: string; flux: Flux | ''; onRemove: () => void }) {
  const i = useI18n()
  const [open, setOpen] = useState(false)
  const { data } = useFetch<NewsResponse>(`/api/news?q=${encodeURIComponent(word)}&days=7&size=20${flux ? `&flux=${flux}` : ''}`)
  return (
    <section className="mms-widget">
      <header className="mms-widget__head mms-widget__head--red mms-alert__head">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
          <strong dir="auto">« {word} »</strong>
          <span>{data ? i.t.alertsMatches(data.total) : i.t.loading}</span>
        </button>
        <button type="button" className="mms-alert__remove" onClick={onRemove}>
          {i.t.alertsRemove}
        </button>
      </header>
      {open && (
        <div className="mms-widget__body news-list">
          {data?.items.length === 0 && <p className="news-status">{i.t.noMatch}</p>}
          {data?.items.map((it: NewsItem) => (
            <NewsCard key={it.id} item={it} />
          ))}
        </div>
      )}
    </section>
  )
}

export function Alerts({ flux }: { flux: Flux | '' }) {
  const { t } = useI18n()
  const [words, setWords] = useAlerts()
  const [draft, setDraft] = useState('')
  function add(e: FormEvent) {
    e.preventDefault()
    const w = draft.trim()
    if (w && !words.includes(w)) setWords([...words, w])
    setDraft('')
  }
  return (
    <>
      <PageHead title={t.sideAlerts} intro={t.alertsIntro} />
      <form className="news-filters" onSubmit={add}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.alertsPlaceholder} dir="auto" />
        <button type="submit" className="news-btn">
          {t.alertsAdd}
        </button>
      </form>
      {words.length === 0 && <p className="news-status">{t.alertsEmpty}</p>}
      {words.map((w) => (
        <AlertBlock key={w} word={w} flux={flux} onRemove={() => setWords(words.filter((x) => x !== w))} />
      ))}
    </>
  )
}

type Analysis = { synthese: string; themes: { titre: string; points: string[] }[]; a_surveiller: string[]; at: string; count: number }
type AnalysisState = { enabled: boolean; count: number; running: boolean; result: Analysis | null }

export function AiAnalysis({ flux }: { flux: Flux | '' }) {
  const i = useI18n()
  const { t } = i
  const [days, setDays] = useState('7')
  const query = `days=${days}${flux ? `&flux=${flux}` : ''}`
  const state = useFetch<AnalysisState>(`/api/ai/analysis?${query}`).data
  const [result, setResult] = useState<Analysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setResult(null)
    setError('')
  }, [query])
  const shown = result ?? state?.result ?? null

  async function run() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/ai/analysis?${query}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'FAILED')
      setResult(json.result)
    } catch (err) {
      const code = (err as Error).message
      setError(code === 'NO_KEY' ? t.aiNoKey : code === 'NO_SDK' ? t.aiNoSdk : code === 'NO_ITEMS' ? t.aiNoItems : t.aiFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead title={t.aiTitle} intro={t.aiIntro} />
      <div className="news-filters">
        <select value={days} onChange={(e) => setDays(e.target.value)} aria-label="period">
          <option value="1">{t.last24}</option>
          <option value="7">{t.last7}</option>
          <option value="30">{t.last30}</option>
        </select>
        <button type="button" className="news-btn" onClick={run} disabled={busy || state?.enabled === false || state?.count === 0}>
          {shown ? t.aiRerun : t.aiRun}
        </button>
        {state && <span className="news-status">{t.aiCount(state.count)}</span>}
      </div>
      {state?.enabled === false && <p className="mms-note">{t.aiNoKey}</p>}
      {busy && <p className="news-status">{t.aiRunning}</p>}
      {error && <p className="news-status news-status--error">{error}</p>}
      {shown && (
        <div className="mms-ai">
          <article className="mms-widget">
            <header className="mms-widget__head mms-widget__head--red">
              <span>{`MMS / ${flux ? i.flux(flux) : t.allSources} / ${t.aiBased(shown.count)}`}</span>
              <strong>{t.aiSummary}</strong>
            </header>
            <div className="mms-widget__body">
              <p className="mms-ai__text">{shown.synthese}</p>
              <small className="news-status">{i.dateTime(shown.at)}</small>
            </div>
          </article>
          <article className="mms-widget">
            <header className="mms-widget__head mms-widget__head--plain">
              <strong>{t.aiThemes}</strong>
            </header>
            <div className="mms-widget__body">
              {shown.themes.map((th) => (
                <section key={th.titre} className="mms-ai__theme">
                  <h3>{th.titre}</h3>
                  <ul>
                    {th.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </article>
          <article className="mms-widget">
            <header className="mms-widget__head mms-widget__head--plain">
              <strong>{t.aiWatch}</strong>
            </header>
            <div className="mms-widget__body">
              <ul className="mms-ai__watch">
                {shown.a_surveiller.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          </article>
        </div>
      )}
    </>
  )
}

export function Help() {
  const { t } = useI18n()
  return (
    <>
      <PageHead title={t.helpTitle} />
      <div className="mms-help">
        {t.helpItems.map(([title, text]) => (
          <article key={title} className="mms-widget">
            <div className="mms-widget__body">
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

export function Admin() {
  const i = useI18n()
  const { t } = i
  const { data } = useFetch<Health>('/api/health')
  if (!data) return <p className="news-status">{t.loading}</p>
  return (
    <>
      <PageHead title={t.adminTitle} />
      <div className="mms-admin">
        {data.sources.map((s) => (
          <article key={s.flux} className="mms-widget">
            <div className="mms-widget__body">
              <h3>
                <span className={`mms-flag mms-flag--${s.flux}`} /> {i.flux(s.flux)}
              </h3>
              <p>
                {t.adminFolder} : <code dir="ltr">{s.dir}</code> — <b className={s.found ? 'is-ok' : 'is-bad'}>{s.found ? t.adminFound : t.adminMissing}</b>
              </p>
              <p>
                {t.adminReal} : <b>{i.num(s.count)}</b>
              </p>
            </div>
          </article>
        ))}
        <article className="mms-widget">
          <div className="mms-widget__body">
            <p>
              {t.adminAi} : <b className={data.ai ? 'is-ok' : 'is-bad'}>{data.ai ? t.on : t.off}</b>
              {data.aiProvider ? <> · {PROVIDERS[data.aiProvider]}</> : null}
            </p>
            <p>
              {t.adminDemo} : <b>{data.demo ? t.on : t.off}</b>
            </p>
            <p>
              {t.updated} : <b>{data.lastUpdate ? i.dateTime(data.lastUpdate) : '—'}</b>
            </p>
          </div>
        </article>
        {data.aiUsage ? <Usage usage={data.aiUsage} /> : null}
        {data.keys ? (
          <>
            <KeyList title={t.adminKeysMms} keys={data.keys.mms} />
            {data.keys.libye ? (
              <KeyList title={t.adminKeysLibye} keys={data.keys.libye} libye />
            ) : (
              <article className="mms-widget">
                <div className="mms-widget__body">
                  <h3>{t.adminKeysLibye}</h3>
                  <p>{t.adminKeysNone}</p>
                </div>
              </article>
            )}
          </>
        ) : null}
      </div>
    </>
  )
}

const PROVIDERS: Record<string, string> = { claude: 'Claude', gemini: 'Gemini', openai: 'OpenAI' }

/** Dépense de l'analyse intelligente, calculée par MMS à partir des jetons consommés */
function Usage({ usage }: { usage: NonNullable<Health['aiUsage']> }) {
  const i = useI18n()
  const { t } = i
  const money = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`
  const table = (title: string, rows: Record<string, UsageRow>) => {
    const list = Object.entries(rows)
    const sum = list.reduce((a, [, r]) => a + r.cost, 0)
    return (
      <>
        <h4>
          {title} <b>{money(sum)}</b>
        </h4>
        {list.length ? (
          <table>
            <thead>
              <tr>
                <th />
                <th>{t.usageRuns}</th>
                <th>{t.usageTokens}</th>
                <th>{t.usageCost}</th>
              </tr>
            </thead>
            <tbody>
              {list.map(([p, r]) => (
                <tr key={p}>
                  <td>{PROVIDERS[p] || p}</td>
                  <td>{i.num(r.runs)}</td>
                  <td dir="ltr">
                    {i.num(r.input)} / {i.num(r.output)}
                  </td>
                  <td dir="ltr">{money(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>{t.usageNone}</p>
        )}
      </>
    )
  }
  return (
    <article className="mms-widget mms-keys mms-usage">
      <div className="mms-widget__body">
        <h3>{t.usageTitle}</h3>
        {table(`${t.usageMonth} (${usage.month})`, usage.current)}
        {Object.keys(usage.total).length ? table(t.usageTotal, usage.total) : null}
        <p className="mms-keys__note">{t.usageNote}</p>
      </div>
    </article>
  )
}

/** Clés présentes ou absentes (la valeur n'est jamais envoyée au navigateur) */
function KeyList({ title, keys, libye = false }: { title: string; keys: KeyState[]; libye?: boolean }) {
  const { t } = useI18n()
  return (
    <article className="mms-widget mms-keys">
      <div className="mms-widget__body">
        <h3>{title}</h3>
        <ul>
          {keys.map((k) => (
            <li key={k.name}>
              <b className={k.set ? 'is-ok' : 'is-bad'}>{k.set ? t.keySet : t.keyMissing}</b>
              <code dir="ltr">{k.name}</code>
              <span>
                {(libye && t.keyLabelsLibye[k.name]) || t.keyLabels[k.name] || ''}
                {k.budget ? <b className="mms-keys__budget">{t.keyBudget.replace('{n}', String(k.budget))}</b> : null}
              </span>
            </li>
          ))}
        </ul>
        <p className="mms-keys__note">{t.adminKeysNote}</p>
      </div>
    </article>
  )
}

/** Onglet « استطلاع » sur le bord de l'écran, comme le sondage de NewsRadar */
export function Survey() {
  const { t, dir } = useI18n()
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [sent, setSent] = useState(false)
  async function send(e: FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, comment }) })
    if (res.ok) {
      setSent(true)
      setRating(0)
      setComment('')
    }
  }
  return (
    <>
      <button
        type="button"
        className="mms-survey__tab mms-noprint"
        onClick={() => {
          setOpen(!open)
          setSent(false)
        }}
      >
        {t.survey}
      </button>
      {open && (
        <form className="mms-survey" dir={dir} onSubmit={send}>
          <strong>{t.surveyTitle}</strong>
          {sent ? (
            <p>{t.surveyThanks}</p>
          ) : (
            <>
              <div className="mms-survey__stars" dir="ltr">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className={n <= rating ? 'is-on' : ''} onClick={() => setRating(n)} aria-label={String(n)}>
                    ★
                  </button>
                ))}
              </div>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t.surveyComment} rows={4} dir="auto" />
              <button type="submit" className="news-btn" disabled={!rating && !comment.trim()}>
                {t.surveySend}
              </button>
            </>
          )}
        </form>
      )}
    </>
  )
}
