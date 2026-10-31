import { useContext, useEffect, useState, type FormEvent } from 'react'
import { BroadcastStudio } from './BroadcastStudio'
import { type Count, type Flux, type NewsResponse, type Tone, DrillContext, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { canDo, useAuth } from '../lib/auth'
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
type Capture = { id: string; name: string; sub: string; state: string; last: string; via: string; count: number; last24?: number }
type Reply = { id: string; author: string; text: string; date: string; tone?: Tone | ''; url?: string; depth?: number }
type Overview = {
  type?: MediaPageType
  total: number
  allTime: number
  last: string
  counters?: { today: number; week: number; sourcesWeek: number }
  capture?: Capture[]
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
        <Feed type={type} sub={sub} days={days} flux={flux} sources={(data?.sources ?? []).map((s) => s.name)} />
      )}
    </div>
  )
}

/** Bandeau commun des pages : fiches du jour (Tripoli), des 7 derniers jours et sources actives, quelle que soit la période */
function Counters({ data }: { data: Overview }) {
  const i = useI18n()
  const p = MEDIA_PAGE_TEXT[i.lang]
  if (!data.counters) return null
  const c = data.counters
  return (
    <ul className="mms-mcount">
      <li>
        <span>{p.counters.today}</span>
        <b>{i.num(c.today)}</b>
      </li>
      <li>
        <span>{p.counters.week}</span>
        <b>{i.num(c.week)}</b>
      </li>
      <li>
        <span>{p.counters.sources}</span>
        <b>{i.num(c.sourcesWeek)}</b>
      </li>
      {/* Broadcasts : la dernière fiche est déjà la tuile « آخر التقاط » */}
      {data.type !== 'broadcast' && (
        <li className="is-text">
          <span>{p.counters.last}</span>
          <b>{data.last ? i.dateTime(data.last) : p.never}</b>
        </li>
      )}
    </ul>
  )
}

/** État de chaque chaîne enregistrée (يعمل، خارج البث، محجوب…) : la raison d'une page vide ou d'une chaîne absente */
function CapturePanel({ rows }: { rows: Capture[] }) {
  const i = useI18n()
  const c = MEDIA_PAGE_TEXT[i.lang].capture
  const recorded = rows.filter((r) => r.state !== 'liveOnly' && r.state !== 'disabled')
  const working = recorded.filter((r) => r.state === 'ok').length
  const blocked = rows.filter((r) => r.state === 'blocked').length
  return (
    <details className="mms-capture" open={working < recorded.length || !recorded.length}>
      <summary>
        <b>{c.title}</b>
        <span>{recorded.length ? c.summary(i.num(working), i.num(recorded.length)) : c.none}</span>
      </summary>
      {blocked > 0 && <p className="mms-capture__note">{c.blockedNote(i.num(blocked))}</p>}
      <ul className="mms-capture__list">
        {rows.map((r) => (
          <li key={r.id} className={`is-${r.state}`}>
            <MediaIcon name={r.sub === 'radio' ? 'radio' : 'tv'} size={15} />
            <span className="mms-capture__name" dir="auto">
              {r.name}
            </span>
            <span className="mms-capture__badge" title={c.hints[r.state]}>
              {c.states[r.state] ?? r.state}
            </span>
            <small>
              {r.state !== 'liveOnly' && typeof r.last24 === 'number' && `${i.lang === 'ar' ? 'مقتطفات/24 س' : 'excerpts/24 h'} ${i.num(r.last24)} · `}
              {r.count > 0 && `${c.inPeriod} ${i.num(r.count)} · `}
              {r.last ? `${c.last} ${i.dateTime(r.last)}` : c.hints[r.state]}
            </small>
          </li>
        ))}
      </ul>
    </details>
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

  // Pas de chaîne de ce type en cours d'enregistrement (radios aujourd'hui) : la page vide le dit
  const noActive = !!data.capture && !data.capture.some((c) => ['ok', 'silent', 'stale', 'offline'].includes(c.state))

  return (
    <>
      <Counters data={data} />
      <Tiles tiles={tiles[type]} />
      {empty && (
        <p className="mms-mpage__empty">
          <MediaIcon name={type} size={20} />
          {data.allTime === 0 ? p.emptyNever : p.pages[type].empty}
          {data.allTime > 0 && days < 90 && <span>{p.tryLonger}</span>}
          {data.allTime > 0 && data.last && (
            <span>
              {' · '}
              {p.counters.last} : {i.dateTime(data.last)}
            </span>
          )}
          {noActive && <span className="mms-mpage__reason">{p.emptyNoActive}</span>}
        </p>
      )}
      {!!data.capture && <CapturePanel rows={data.capture} />}
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

/** Sources épinglées d'une page (navigateur seulement) : filtre en un clic */
function usePinned(type: MediaPageType) {
  const key = `mms.media.pinned.${type}`
  const [list, setList] = useState<string[]>(() => {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(key) || '[]')
      return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0, 20) : []
    } catch {
      return []
    }
  })
  function toggle(name: string) {
    const next = list.includes(name) ? list.filter((s) => s !== name) : [...list, name].slice(-20)
    setList(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      /* stockage indisponible : l'épingle vaut pour la session */
    }
  }
  return [list, toggle] as const
}

// Cellule CSV : guillemets si besoin ; « = + - @ » en tête neutralisés (formules exécutées par les tableurs)
const csvCell = (raw: string) => {
  const v = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return /[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** Export CSV de la liste filtrée (mêmes filtres et même limite par rôle que les exports Word et PDF) */
async function exportCsv(query: URLSearchParams, name: string, cols: string[], fmt: (iso: string) => string, tone: (t: string) => string, sort: string) {
  const res = await fetch(`/api/news/export.json?${query}`)
  if (!res.ok) throw new Error(String(res.status))
  const data = (await res.json()) as { items: { date: string; origin: string; title: string; summary: string; tone: string; url: string }[] }
  const items = data.items.slice()
  if (sort === 'source') items.sort((a, b) => a.origin.localeCompare(b.origin, 'ar') || b.date.localeCompare(a.date))
  else items.sort((a, b) => (sort === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)))
  const rows = [cols, ...items.map((it) => [fmt(it.date), it.origin, it.title, it.summary, it.tone ? tone(it.tone) : '', it.url])]
  // BOM : Excel lit l'arabe en UTF-8
  const body = rows.map((r) => r.map((v) => csvCell(String(v ?? ''))).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Liste paginée des fiches du type, avec recherche, source, tri et export ; mêmes cartes que لوحة الأخبار */
function Feed({ type, sub, days, flux, sources }: { type: MediaPageType; sub: string; days: number; flux: Flux | ''; sources: string[] }) {
  const i = useI18n()
  const p = MEDIA_PAGE_TEXT[i.lang]
  const f = p.feed
  const x = useIntel()
  const auth = useAuth()
  const drill = useContext(DrillContext)
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [tones, setTones] = useState<Tone[]>([])
  const [source, setSource] = useState('')
  const [sort, setSort] = useState('')
  const [pinned, togglePin] = usePinned(type)
  const [csv, setCsv] = useState<'' | 'busy' | 'error'>('')
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [type, sub, days, flux, q, tones, source, sort])
  const filters = new URLSearchParams({ media: type, days: String(days) })
  if (sub) filters.set('sub', sub)
  if (flux) filters.set('flux', flux)
  if (q) filters.set('q', q)
  if (tones.length) filters.set('tone', tones.join(','))
  if (source) filters.set('source', source)
  const params = new URLSearchParams(filters)
  params.set('page', String(page))
  params.set('size', '10')
  if (sort === 'asc') params.set('dir', 'asc')
  if (sort === 'source') params.set('sort', 'source')
  const ar = i.lang === 'ar'
  const { data, error, loading } = useFetch<NewsResponse>(`/api/news?${params}`)
  const sourceList = [...new Set([...pinned, ...sources, ...(source ? [source] : [])])]

  async function onCsv() {
    setCsv('busy')
    try {
      await exportCsv(filters, `mms-${type}`, f.cols, i.dateTime, (t) => x.tones[t as Tone] ?? t, sort)
      setCsv('')
    } catch {
      setCsv('error')
    }
  }

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
            onClick={() =>
              drill({ media: type, ...(sub ? { sub } : {}), days: String(days), ...(q ? { q } : {}), ...(tones.length ? { tone: tones.join(',') } : {}), ...(source ? { source } : {}) })
            }
          >
            {ar ? 'كل عوامل التصفية' : 'All filters'}
          </button>
        </form>
      </div>
      <div className="mms-feedtools">
        <label>
          <span>{f.source}</span>
          <select value={source} onChange={(e) => setSource(e.target.value)} dir="auto">
            <option value="">{f.allSources}</option>
            {sourceList.map((s) => (
              <option key={s} value={s}>
                {pinned.includes(s) ? `★ ${s}` : s}
              </option>
            ))}
          </select>
        </label>
        {source && (
          <button type="button" className="news-btn news-btn--ghost" aria-pressed={pinned.includes(source)} onClick={() => togglePin(source)}>
            {pinned.includes(source) ? `★ ${f.unpin}` : `☆ ${f.pin}`}
          </button>
        )}
        <label>
          <span>{f.sort}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(f.sorts).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {canDo(auth?.user, 'export') && (
          <button type="button" className="news-btn news-btn--ghost mms-feedtools__csv" disabled={csv === 'busy' || !data?.total} onClick={onCsv}>
            {csv === 'busy' ? f.csvBusy : f.csv}
          </button>
        )}
        {csv === 'error' && <small className="news-status news-status--error">{f.csvError}</small>}
      </div>
      {pinned.length > 0 && (
        <p className="mms-feedtools__pins" aria-label={f.pinned}>
          {pinned.map((s) => (
            <button key={s} type="button" className={s === source ? 'is-on' : undefined} aria-pressed={s === source} onClick={() => setSource(s === source ? '' : s)} dir="auto">
              ★ {s}
            </button>
          ))}
        </p>
      )}
      {(q || tones.length > 0 || source) && (
        <p className="news-active">
          {q && (
            <span className="mms-filterchip">
              {ar ? 'البحث' : 'Search'}: <b dir="auto">{q}</b>
              <button type="button" aria-label={ar ? 'إزالة' : 'Remove'} onClick={() => (setQ(''), setDraft(''))}>
                ×
              </button>
            </span>
          )}
          {source && (
            <span className="mms-filterchip">
              {f.source}: <b dir="auto">{source}</b>
              <button type="button" aria-label={ar ? 'إزالة' : 'Remove'} onClick={() => setSource('')}>
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
