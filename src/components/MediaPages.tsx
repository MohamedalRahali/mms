import { useContext, useEffect, useState, type FormEvent } from 'react'
import { BroadcastStudio } from './BroadcastStudio'
import { type Count, type Flux, type NewsResponse, type Tone, DrillContext, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { type MediaIconName, type MediaPageType, MEDIA_PAGE_TEXT, MEDIA_SUBS, useMedia } from '../lib/media'
import { BuzzBars } from './Dashboard'
import { Donut, Line } from './Charts'
import { Diffusion } from './Diffusion'
import { Recordings } from './Recordings'
import { MediaIcon } from './MediaParts'
import { NewsCard } from './NewsCard'
import { PickPage } from './ReportPick'
import { ToneBadge } from './Intel'
import { useIntel } from '../lib/intel'

/** Pages « الوسائط » : tableau de bord et liste propres à chaque type de média (menu latéral) */

type Card = { id: string; title: string; summary: string; origin: string; url: string; date: string; tone?: Tone | ''; lang?: string; subType?: string; author?: string }
type Reply = { id: string; author: string; text: string; date: string; tone?: Tone | ''; url?: string; depth?: number }
type Overview = {
  total: number
  allTime: number
  last: string
  sourcesCount: number
  transcripts: number
  minutes: number
  perDay: { date: string; count: number }[]
  sources: Count[]
  tones: Count[]
  langs: Count[]
  people: Count[]
  orgs: Count[]
  places: Count[]
  subTypes?: Count[]
  channels?: { name: string; count: number; sub: string; last: string; perDay: number[] }[]
  shows?: { name: string; total: number; count: number; last: string; url: string; lang: string }[]
  blogs?: Count[]
  authors?: number
  publications?: number
  tonesComments?: Count[]
  tonesParents?: Count[]
  top?: { item: Card; count: number; comments: Reply[] }[]
  topics?: number
  forums?: number
  activeTopics?: number
  tree?: { name: string; count: number; topics: { topic: string; url: string; count: number; last: string }[] }[]
  threads?: { forum: string; topic: string; url: string; count: number; last: string; root: Card | null; replies: Reply[] }[]
}

const PERIODS = [1, 7, 30, 90] as const

export function MediaPage({
  type,
  flux,
  sub,
  onSub,
  onLive,
}: {
  type: MediaPageType
  flux: Flux | ''
  sub: string
  onSub: (sub: string) => void
  onLive?: () => void
}) {
  const i = useI18n()
  const p = MEDIA_PAGE_TEXT[i.lang]
  const [days, setDays] = useState<number>(7)
  const q = `days=${days}${flux ? `&flux=${flux}` : ''}${sub ? `&sub=${sub}` : ''}`
  const { data, error } = useFetch<Overview>(`/api/media/${type}/overview?${q}`)
  // Période presque vide alors que des fiches plus anciennes existent : on élargit (7 → 30 → 90 jours) pour que la page ne soit pas vide
  const [auto, setAuto] = useState(true)
  useEffect(() => {
    if (auto && days >= 7 && days < 90 && data && data.total < 3 && data.allTime > data.total) setDays(days === 7 ? 30 : 90)
  }, [auto, days, data])
  const page = p.pages[type]

  return (
    <div className={`mms-mpage mms-media--${type}`}>
      <header className="mms-mpage__head">
        <span className="mms-mpage__ico">
          <MediaIcon name={type} size={26} />
        </span>
        <div>
          <h2>{page.title}</h2>
          <p>{page.sub}</p>
        </div>
        <div className="mms-mpage__periods" role="group" aria-label={p.period}>
          {PERIODS.map((d) => (
            <button key={d} type="button" className={d === days ? 'is-on' : undefined} aria-pressed={d === days} onClick={() => {
                setAuto(false)
                setDays(d)
              }}
            >
              {p.periods[d]}
            </button>
          ))}
        </div>
      </header>

      {type === 'broadcast' && (
        <div className="mms-mpage__subs" role="group" aria-label={p.subLabel}>
          {onLive && (
            <button type="button" className="mms-mpage__live" onClick={onLive}>
              <MediaIcon name="live" size={15} />
              {p.openLive}
            </button>
          )}
          {['', ...MEDIA_SUBS].map((s) => (
            <button key={s || 'all'} type="button" className={`mms-media--${s || 'broadcast'}${s === sub ? ' is-on' : ''}`} aria-pressed={s === sub} onClick={() => onSub(s)}>
              <MediaIcon name={(s || 'broadcast') as MediaIconName} size={15} />
              {s ? p.subTypes[s] : p.allSubs}
              {!!data?.subTypes && !sub && s && <b>{i.num(data.subTypes.find((c) => c.name === s)?.count ?? 0)}</b>}
            </button>
          ))}
        </div>
      )}

      {error && <p className="news-status news-status--error">{i.t.loadError}</p>}
      {!data && !error && <p className="news-status">{i.t.loading}</p>}
      {data && <Board type={type} data={data} days={days} />}
      {type === 'broadcast' && <Diffusion />}
      {/* تسجيل حسب الطلب (برمجة التسجيل، الرصد المبرمج، البحث الذكي) : sur la page Broadcasts, ouvert par défaut */}
      {type === 'broadcast' && (
        <details className="lw-rec" id="rec" open>
          <summary>⏺ {i.lang === 'ar' ? 'تسجيل حسب الطلب: اختيار قناة وفترة محددة، تفريغ النص وتنزيله' : 'Record on demand: pick a channel and a period, then read and download the transcript'}</summary>
          <Recordings />
        </details>
      )}
      {type === 'broadcast' ? (
        <BroadcastStudio days={days} sub={sub} flux={flux} channels={(data?.sources ?? []).map((s) => s.name)} />
      ) : (
        <Feed type={type} sub={sub} days={days} flux={flux} />
      )}
    </div>
  )
}

function Tiles({ tiles }: { tiles: { label: string; value: string; text?: boolean }[] }) {
  return (
    <div className="news-tiles mms-mpage__tiles">
      {tiles.map((t) => (
        <div key={t.label} className={t.text ? 'news-tile is-text' : 'news-tile'}>
          <span>{t.label}</span>
          <strong>{t.value}</strong>
        </div>
      ))}
    </div>
  )
}

function Panel({ title, wide, children }: { title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={wide ? 'mms-panel mms-panel--wide' : 'mms-panel'}>
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Board({ type, data, days }: { type: MediaPageType; data: Overview; days: number }) {
  const i = useI18n()
  const p = MEDIA_PAGE_TEXT[i.lang]
  const drill = useContext(DrillContext)
  const empty = data.total === 0
  const n = (v: number) => i.num(v)
  const hours = (min: number) => (min >= 120 ? `${n(Math.round(min / 6) / 10)} ${p.hoursUnit}` : `${n(min)} ${p.minutesUnit}`)
  const entity = (name: string) => drill({ entity: name, media: type, days: String(days) })

  const tiles: Record<MediaPageType, { label: string; value: string; text?: boolean }[]> = {
    broadcast: [
      { label: p.kpi.broadcast, value: n(data.total) },
      { label: p.kpi.transcripts, value: n(data.transcripts) },
      { label: p.kpi.transcribed, value: hours(data.minutes) },
      { label: p.kpi.channels, value: n(data.sourcesCount) },
      { label: p.kpi.lastCapture, value: data.last ? i.dateTime(data.last) : p.never, text: true },
    ],
    podcast: [
      { label: p.kpi.podcast, value: n(data.total) },
      { label: p.kpi.transcribed, value: hours(data.minutes) },
      { label: p.kpi.shows, value: n(data.shows?.length ?? 0) },
      { label: p.kpi.langs, value: n(data.langs.length) },
    ],
    blog: [
      { label: p.kpi.blog, value: n(data.total) },
      { label: p.kpi.blogs, value: n(data.sourcesCount) },
      { label: p.kpi.authors, value: n(data.authors ?? 0) },
    ],
    comment: [
      { label: p.kpi.comment, value: n(data.total) },
      { label: p.kpi.publications, value: n(data.publications ?? 0) },
      { label: p.kpi.avg, value: data.publications ? (data.total / data.publications).toFixed(1) : '0' },
    ],
    forum: [
      { label: p.kpi.forum, value: n(data.total) },
      { label: p.kpi.topics, value: n(data.topics ?? 0) },
      { label: p.kpi.forums, value: n(data.forums ?? 0) },
      { label: p.kpi.activeTopics, value: n(data.activeTopics ?? 0) },
    ],
  }

  return (
    <>
      <Tiles tiles={tiles[type]} />
      {empty && (
        <p className="mms-mpage__empty">
          <MediaIcon name={type} size={20} />
          {p.pages[type].empty}
          {data.allTime > 0 && days < 90 && <span>{p.tryLonger}</span>}
        </p>
      )}
      <div className="mms-pro-grid">
        <Panel title={p.panels.volume} wide>
          <Line perDay={data.perDay} />
        </Panel>

        {type === 'broadcast' && !!data.channels?.length && (
          <Panel title={p.panels.perChannel} wide>
            <ChannelRows channels={data.channels} />
          </Panel>
        )}
        {type === 'podcast' && (
          <Panel title={p.panels.shows} wide>
            <Shows shows={data.shows ?? []} />
          </Panel>
        )}
        {type === 'blog' && !empty && (
          <Panel title={p.panels.perBlog}>
            <BuzzBars rows={data.blogs ?? []} label={(s) => s} onPick={(source) => drill({ source, media: 'blog', days: String(days) })} />
          </Panel>
        )}
        {type === 'comment' && !empty && (
          <Panel title={p.panels.toneCompare} wide>
            <div className="mms-mpage__duo">
              <div>
                <h4>{p.panels.tonesComments}</h4>
                <ToneDonut rows={data.tonesComments ?? []} />
              </div>
              <div>
                <h4>{p.panels.tonesParents}</h4>
                <ToneDonut rows={data.tonesParents ?? []} />
              </div>
            </div>
          </Panel>
        )}
        {type === 'forum' && !!data.tree?.length && (
          <Panel title={p.panels.tree}>
            <ForumTree tree={data.tree} />
          </Panel>
        )}

        {type !== 'comment' && !empty && (
          <Panel title={p.panels.tone}>
            <ToneDonut rows={data.tones} />
          </Panel>
        )}
        {type === 'podcast' && !empty && (
          <Panel title={p.panels.langs}>
            <BuzzBars rows={data.langs} label={(l) => i.language(l)} />
          </Panel>
        )}
        {!empty && data.people.length + data.orgs.length + data.places.length > 0 && (
          <Panel title={p.panels.entities}>
            <Entities data={data} onPick={entity} />
          </Panel>
        )}

        {type === 'comment' && !!data.top?.length && (
          <Panel title={p.panels.mostCommented} wide>
            <MostCommented top={data.top} />
          </Panel>
        )}
        {type === 'forum' && !!data.threads?.length && (
          <Panel title={p.panels.mostActive} wide>
            <Threads threads={data.threads} />
          </Panel>
        )}
      </div>
    </>
  )
}

function ToneDonut({ rows }: { rows: Count[] }) {
  const i = useI18n()
  if (!rows.length) return <p className="news-status">{i.t.noData}</p>
  return <Donut rows={rows} dim="tones" />
}

function Entities({ data, onPick }: { data: Overview; onPick: (name: string) => void }) {
  const i = useI18n()
  const p = MEDIA_PAGE_TEXT[i.lang]
  const [tab, setTab] = useState<'people' | 'orgs' | 'places'>('people')
  return (
    <>
      <div className="mms-mpage__tabs" role="tablist">
        {(['people', 'orgs', 'places'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : undefined} onClick={() => setTab(k)}>
            {p.entities[k]}
          </button>
        ))}
      </div>
      <BuzzBars rows={data[tab]} label={(s) => s} onPick={onPick} />
    </>
  )
}

/** Volume de chaque chaîne sur la période, en petites colonnes alignées */
function ChannelRows({ channels }: { channels: NonNullable<Overview['channels']> }) {
  const i = useI18n()
  const p = MEDIA_PAGE_TEXT[i.lang]
  const max = Math.max(...channels.flatMap((c) => c.perDay), 1)
  return (
    <ul className="mms-chan">
      {channels.map((c) => (
        <li key={c.name} className={`mms-media--${c.sub || 'broadcast'}`}>
          <span className="mms-chan__name" dir="auto">
            <MediaIcon name={(MEDIA_SUBS.includes(c.sub as (typeof MEDIA_SUBS)[number]) ? c.sub : 'broadcast') as MediaIconName} size={15} />
            {c.name}
          </span>
          <span className="mms-chan__bars" aria-hidden>
            {c.perDay.map((v, k) => (
              <i key={k} style={{ height: `${Math.max((v / max) * 100, v ? 6 : 2)}%` }} />
            ))}
          </span>
          <b>{i.num(c.count)}</b>
          <small>{c.last ? `${p.lastLabel} ${i.dateTime(c.last)}` : ''}</small>
        </li>
      ))}
    </ul>
  )
}

function Shows({ shows }: { shows: NonNullable<Overview['shows']> }) {
  const i = useI18n()
  const p = MEDIA_PAGE_TEXT[i.lang]
  if (!shows.length) return <p className="news-status">{p.noShows}</p>
  const week = Date.now() - 7 * 86_400_000
  return (
    <div className="mms-mpage__table">
      <table>
        <thead>
          <tr>
            <th>{p.cols.show}</th>
            <th>{p.cols.lastEpisode}</th>
            <th>{p.cols.inPeriod}</th>
            <th>{p.cols.total}</th>
            <th>{p.cols.lang}</th>
            <th>{p.cols.status}</th>
          </tr>
        </thead>
        <tbody>
          {shows.map((s) => (
            <tr key={s.name}>
              <td dir="auto">{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a> : s.name}</td>
              <td>{i.dateTime(s.last)}</td>
              <td>{i.num(s.count)}</td>
              <td>{i.num(s.total)}</td>
              <td>{s.lang ? i.language(s.lang) : ''}</td>
              <td>
                <span className={Date.parse(s.last) >= week ? 'mms-dot is-on' : 'mms-dot'}>{Date.parse(s.last) >= week ? p.statusActive : p.statusQuiet}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReplyList({ replies, indent }: { replies: Reply[]; indent?: boolean }) {
  const i = useI18n()
  return (
    <ul className="mms-reactions__list">
      {replies.map((r) => (
        <li key={r.id} style={indent && r.depth ? { marginInlineStart: `${r.depth * 1.4}rem` } : undefined}>
          <p className="mms-reactions__head">
            <b dir="auto">{r.author}</b>
            <span>{i.dateTime(r.date)}</span>
            <ToneBadge tone={r.tone} />
          </p>
          <p className="mms-reactions__text" dir="auto">
            {r.text}
          </p>
        </li>
      ))}
    </ul>
  )
}

function MostCommented({ top }: { top: NonNullable<Overview['top']> }) {
  const i = useI18n()
  const m = useMedia()
  return (
    <div className="mms-mpage__groups">
      {top.map((g) => (
        <details key={g.item.id} className="mms-reactions">
          <summary>
            <span className="mms-mpage__gtitle" dir="auto">
              <b>{g.item.origin}</b> {g.item.title}
            </span>
            <span className="mms-mpage__gcount">{m.comments(g.count)}</span>
          </summary>
          {g.item.url && (
            <a className="mms-transcript__orig" href={g.item.url} target="_blank" rel="noopener noreferrer">
              {m.original}
            </a>
          )}
          <p className="mms-mpage__gmeta">
            {i.dateTime(g.item.date)} <ToneBadge tone={g.item.tone} />
          </p>
          <ReplyList replies={g.comments} />
        </details>
      ))}
    </div>
  )
}

function ForumTree({ tree }: { tree: NonNullable<Overview['tree']> }) {
  const i = useI18n()
  return (
    <ul className="mms-ftree">
      {tree.map((f, k) => (
        <li key={f.name}>
          <details open={k === 0}>
            <summary>
              <MediaIcon name="forum" size={15} />
              <span dir="auto">{f.name}</span>
              <b>{i.num(f.count)}</b>
            </summary>
            <ul>
              {f.topics.map((t) => (
                <li key={t.topic}>
                  <span dir="auto">{t.url ? <a href={t.url} target="_blank" rel="noopener noreferrer">{t.topic}</a> : t.topic}</span>
                  <b>{i.num(t.count)}</b>
                </li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  )
}

function Threads({ threads }: { threads: NonNullable<Overview['threads']> }) {
  const i = useI18n()
  const m = useMedia()
  return (
    <div className="mms-mpage__groups">
      {threads.map((t) => (
        <details key={`${t.forum}|${t.topic}`} className="mms-reactions">
          <summary>
            <span className="mms-mpage__gtitle" dir="auto">
              <b>{t.forum}</b> › {t.topic}
            </span>
            <span className="mms-mpage__gcount">{m.replies(t.count)}</span>
          </summary>
          {t.root && (
            <div className="mms-mpage__root">
              <p className="mms-reactions__head">
                <b dir="auto">{t.root.author || t.root.origin}</b>
                <span>{i.dateTime(t.root.date)}</span>
                <ToneBadge tone={t.root.tone} />
              </p>
              <p className="mms-reactions__text" dir="auto">
                {t.root.summary || t.root.title}
              </p>
            </div>
          )}
          <ReplyList replies={t.replies} indent />
        </details>
      ))}
    </div>
  )
}

/** Liste paginée des fiches du type, avec recherche ; mêmes cartes que لوحة الأخبار */
function Feed({ type, sub, days, flux }: { type: MediaPageType; sub: string; days: number; flux: Flux | '' }) {
  const i = useI18n()
  const p = MEDIA_PAGE_TEXT[i.lang]
  const x = useIntel()
  const drill = useContext(DrillContext)
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [tones, setTones] = useState<Tone[]>([])
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [type, sub, days, flux, q, tones])
  const params = new URLSearchParams({ page: String(page), size: '10', media: type, days: String(days) })
  if (sub) params.set('sub', sub)
  if (flux) params.set('flux', flux)
  if (q) params.set('q', q)
  if (tones.length) params.set('tone', tones.join(','))
  const ar = i.lang === 'ar'
  const { data, error, loading } = useFetch<NewsResponse>(`/api/news?${params}`)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setQ(draft.trim())
  }

  return (
    <section className="mms-mpage__feed">
      <div className="mms-mpage__feedhead">
        <h3>
          {p.list}
          {data && <small>{i.num(data.total)}</small>}
        </h3>
        <form className="news-filters" onSubmit={onSubmit}>
          <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={p.search} aria-label={p.search} maxLength={300} dir="auto" />
          <button type="submit" className="news-btn">
            {i.t.search}
          </button>
          <fieldset className={tones.length ? 'news-tones is-on' : 'news-tones'} aria-label={x.tone}>
            {(['positive', 'neutral', 'negative'] as Tone[]).map((tone) => (
              <label key={tone} className={`news-tones__opt is-${tone}`}>
                <input type="checkbox" checked={tones.includes(tone)} onChange={() => setTones(tones.includes(tone) ? tones.filter((t) => t !== tone) : [...tones, tone])} />
                {x.tones[tone]}
              </label>
            ))}
          </fieldset>
          {/* Tous les filtres (source, thème, pays, période précise…) : la liste des actualités, déjà limitée à ce média */}
          <button
            type="button"
            className="news-btn news-btn--ghost"
            onClick={() => drill({ media: type, ...(sub ? { sub } : {}), days: String(days), ...(q ? { q } : {}), ...(tones.length ? { tone: tones.join(',') } : {}) })}
          >
            {ar ? 'كل عوامل التصفية' : 'All filters'}
          </button>
        </form>
      </div>
      {(q || tones.length > 0) && (
        <p className="news-active">
          {q && (
            <span className="mms-filterchip">
              {ar ? 'البحث' : 'Search'}: <b dir="auto">{q}</b>
              <button type="button" aria-label={ar ? 'إزالة' : 'Remove'} onClick={() => (setQ(''), setDraft(''))}>
                ×
              </button>
            </span>
          )}
          {tones.length > 0 && (
            <span className="mms-filterchip">
              {x.tone}: <b>{tones.map((t) => x.tones[t]).join('، ')}</b>
              <button type="button" aria-label={ar ? 'إزالة' : 'Remove'} onClick={() => setTones([])}>
                ×
              </button>
            </span>
          )}
        </p>
      )}
      {error && <p className="news-status news-status--error">{i.t.loadError}</p>}
      {loading && !data && <p className="news-status">{i.t.loading}</p>}
      {data && data.items.length === 0 && <p className="mms-mpage__empty">{p.pages[type].empty}</p>}
      {data && data.items.length > 0 && (
        <>
          <div className="rpt-pickrow">
            <span />
            <PickPage items={data.items} />
          </div>
          <div className="news-list">
            {data.items.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
          {data.pages > 1 && (
            <nav className="news-pager">
              <button type="button" className="news-btn news-btn--ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                {i.t.prev}
              </button>
              <span>{i.t.pageOf(page, data.pages)}</span>
              <button type="button" className="news-btn news-btn--ghost" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
                {i.t.next}
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}
