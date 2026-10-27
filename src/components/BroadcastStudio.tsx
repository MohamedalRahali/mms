import { type FormEvent, useEffect, useRef, useState } from 'react'
import { type Filters, type Tone, EMPTY_FILTERS, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { canDo, hasModule, useAuth } from '../lib/auth'
import { ToneBadge } from './Intel'
import { MediaIcon } from './MediaParts'
import { SaveSearchButton } from './Listing'
import { type MediaIconName } from '../lib/media'
import './broadcast.css'
import { LoadState } from './LoadState'

/**
 * Broadcasts — البث : temps d'antenne estimé, recherche dans les transcriptions avec passages surlignés et horodatés,
 * extraits à partager entre utilisateurs connectés (/?clip=<id>&t=<secondes>), alerte par mot-clé (veilles).
 * Données : server/broadcast.js. Les heures des passages sont estimées (pas d'horodatage dans les transcriptions).
 */

type Passage = { n: number; offset: number; at: string; text: string; hit: boolean }
export type Clip = {
  id: string
  title: string
  summary: string
  origin: string
  sub: string
  category: string
  tone: Tone | ''
  date: string
  start: string
  people: string[]
  clipUrl: string
  liveUrl: string
  passages: Passage[]
  hits: number
  news: { id: string; title: string; category: string; tone: Tone | ''; date: string; people: string[] }[]
}
type Airtime = {
  minutes: number
  segments: number
  channels: { name: string; minutes: number; count: number; sub?: string }[]
  topics: { name: string; minutes: number; count: number }[]
  people: { name: string; minutes: number; count: number }[]
  orgs: { name: string; minutes: number; count: number }[]
  perDay: { date: string; minutes: number }[]
}
type SearchResult = { total: number; news: number; page: number; pages: number; terms: string[]; items: Clip[] }

const TEXT = {
  ar: {
    airtime: 'زمن البث التقديري',
    airHint: 'تقدير: مدة كل مقطع مسجّل (10 دقائق كحد أقصى) موزّعة على الأخبار المستخرجة منه.',
    byChannel: 'حسب القناة',
    byTopic: 'حسب الموضوع',
    byPerson: 'حسب الشخصية',
    min: (n: number) => `${n} د`,
    total: (m: string, s: string) => `${m} دقيقة في ${s} مقطع`,
    search: 'البحث في نصوص البث',
    placeholder: 'كلمة أو عبارة "بين علامتي تنصيص"، مع AND / OR / NOT',
    allChannels: 'كل القنوات',
    allTopics: 'كل المواضيع',
    results: (n: string, k: string) => `${n} مقطع بث · ${k} خبر مستخرج`,
    extracted: 'الأخبار المستخرجة من هذا المقطع',
    hits: (n: number) => `${n} مقطع مطابق`,
    approx: 'التوقيت تقريبي',
    showAll: 'كل النص',
    showHits: 'المقاطع المطابقة فقط',
    share: 'نسخ رابط المقطع',
    copied: 'تم نسخ الرابط',
    live: 'البث المباشر للقناة',
    noAudio: 'التسجيل الصوتي غير متاح (يُحذف بعد 3 أيام في الجامع)',
    empty: 'لا توجد مقاطع مطابقة في هذه الفترة.',
    close: 'إغلاق',
    clipTitle: 'مقطع من البث',
    notFound: 'المقطع غير موجود أو لم يعد ضمن البيانات.',
  },
  en: {
    airtime: 'Estimated airtime',
    airHint: 'Estimate: each recorded segment (10 minutes at most) is split between the news extracted from it.',
    byChannel: 'By channel',
    byTopic: 'By topic',
    byPerson: 'By person',
    min: (n: number) => `${n} min`,
    total: (m: string, s: string) => `${m} minutes in ${s} segments`,
    search: 'Search broadcast transcripts',
    placeholder: 'Word or "exact phrase", with AND / OR / NOT',
    allChannels: 'All channels',
    allTopics: 'All topics',
    results: (n: string, k: string) => `${n} broadcast segments · ${k} news extracted`,
    extracted: 'News extracted from this segment',
    hits: (n: number) => `${n} matching passages`,
    approx: 'Times are approximate',
    showAll: 'Full text',
    showHits: 'Matching passages only',
    share: 'Copy link to this passage',
    copied: 'Link copied',
    live: "Channel's live stream",
    noAudio: 'Audio not available (deleted after 3 days by the collector)',
    empty: 'No matching segments in this period.',
    close: 'Close',
    clipTitle: 'Broadcast clip',
    notFound: 'This clip no longer exists in the data.',
  },
}

const useText = () => TEXT[useI18n().lang === 'ar' ? 'ar' : 'en']

/** Mots surlignés dans un passage (comparaison simple, insensible à la casse) */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const usable = terms.filter((t) => t.length >= 2)
  if (!usable.length) return <>{text}</>
  const re = new RegExp(`(${usable.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return (
    <>
      {text.split(re).map((part, k) =>
        k % 2 ? (
          <mark key={k} className="bc-mark">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}

const clipLink = (id: string, offset: number, q = '') => `${location.origin}/?clip=${encodeURIComponent(id)}&t=${offset}${q ? `&q=${encodeURIComponent(q)}` : ''}`

/** Un extrait : en-tête, passages horodatés (cliquables : lecture de l'audio si disponible, sinon lien à copier) */
export function ClipCard({ clip, terms, query, focus }: { clip: Clip; terms: string[]; query: string; focus?: number }) {
  const i = useI18n()
  const b = useText()
  const [all, setAll] = useState(!clip.hits || focus != null)
  const [copied, setCopied] = useState(-1)
  const audio = useRef<HTMLAudioElement>(null)
  const focused = useRef<HTMLLIElement>(null)
  useEffect(() => focused.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), [])
  const shown = all ? clip.passages : clip.passages.filter((p) => p.hit)
  const pick = (p: Passage) => {
    if (audio.current) {
      audio.current.currentTime = p.offset
      audio.current.play().catch(() => {})
    }
  }
  const copy = (p: Passage) => {
    navigator.clipboard?.writeText(clipLink(clip.id, p.offset, query)).then(
      () => {
        setCopied(p.n)
        setTimeout(() => setCopied(-1), 1600)
      },
      () => {},
    )
  }
  const time = (iso: string) => i.time(iso)
  const near = focus != null ? clip.passages.reduce((best, p) => (Math.abs(p.offset - focus) < Math.abs(best.offset - focus) ? p : best), clip.passages[0]) : null
  return (
    <article className="bc-clip">
      <header className="bc-clip__head">
        <span className={`mms-media mms-media--${clip.sub}`}>
          <MediaIcon name={(['tv', 'radio', 'youtube'].includes(clip.sub) ? clip.sub : 'broadcast') as MediaIconName} size={14} />
        </span>
        <b dir="auto">{clip.origin}</b>
        <time>
          {i.dateTime(clip.start)} – {time(new Date(Date.parse(clip.start) + 10 * 60_000).toISOString())}
        </time>
      </header>
      <h4 dir="auto">
        <Highlight text={clip.news[0]?.title ?? clip.title} terms={terms} />
      </h4>
      {clip.news.length > 1 && (
        <details className="bc-clip__news">
          <summary>
            {b.extracted} ({i.num(clip.news.length)})
          </summary>
          <ul>
            {clip.news.map((n) => (
              <li key={n.id}>
                <time>{i.time(n.date)}</time>
                <span dir="auto">
                  <Highlight text={n.title} terms={terms} />
                </span>
                <span className="news-badge">{i.category(n.category)}</span>
                <ToneBadge tone={n.tone} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {clip.news.length <= 1 && clip.summary && (
        <p className="bc-clip__sum" dir="auto">
          <Highlight text={clip.summary} terms={terms} />
        </p>
      )}
      {clip.clipUrl ? (
        <audio ref={audio} controls preload="none" src={clip.clipUrl} className="bc-clip__audio" />
      ) : (
        <p className="bc-clip__note">
          {b.noAudio}
          {clip.liveUrl && (
            <>
              {' · '}
              <a href={clip.liveUrl} target="_blank" rel="noopener noreferrer">
                {b.live}
              </a>
            </>
          )}
        </p>
      )}
      {clip.passages.length > 0 && (
        <>
          <div className="bc-clip__bar">
            {clip.hits > 0 && <span className="bc-clip__hits">{b.hits(clip.hits)}</span>}
            <span className="bc-clip__approx">≈ {b.approx}</span>
            {clip.hits > 0 && (
              <button type="button" className="news-btn news-btn--ghost" onClick={() => setAll(!all)}>
                {all ? b.showHits : b.showAll}
              </button>
            )}
          </div>
          <ol className="bc-passages">
            {shown.map((p) => (
              <li key={p.n} ref={near?.n === p.n ? focused : undefined} className={`${p.hit ? 'is-hit' : ''}${near?.n === p.n ? ' is-focus' : ''}`}>
                <button type="button" className="bc-passages__time" onClick={() => pick(p)} title={clip.clipUrl ? '▶' : b.approx} disabled={!clip.clipUrl}>
                  ≈ {time(p.at)}
                </button>
                <p dir="auto">
                  <Highlight text={p.text} terms={terms} />
                </p>
                <button type="button" className="bc-passages__share" onClick={() => copy(p)} title={b.share} aria-label={b.share}>
                  {copied === p.n ? '✓' : '🔗'}
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </article>
  )
}

/** Temps d'antenne estimé : par chaîne, par thème, par personnalité */
function AirtimePanel({ query }: { query: string }) {
  const i = useI18n()
  const b = useText()
  const { data, error } = useFetch<Airtime>(`/api/media/broadcast/airtime?${query}`)
  if (!data) return <LoadState error={error} />
  const bars = (list: { name: string; minutes: number }[], label: (n: string) => string) => {
    if (!list.length) return <p className="news-status">{i.t.noData}</p>
    const max = Math.max(...list.map((r) => r.minutes), 0.1)
    return (
      <ul className="bc-bars">
        {list.slice(0, 8).map((r) => (
          <li key={r.name}>
            <span dir="auto">{label(r.name)}</span>
            <b>{b.min(r.minutes)}</b>
            <i style={{ width: `${(r.minutes / max) * 100}%` }} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <section className="bc-air">
      <header>
        <h3>{b.airtime}</h3>
        <span>{b.total(i.num(data.minutes), i.num(data.segments))}</span>
        <small>{b.airHint}</small>
      </header>
      <div className="bc-air__grid">
        <div>
          <h4>{b.byChannel}</h4>
          {bars(data.channels, (n) => n)}
        </div>
        <div>
          <h4>{b.byTopic}</h4>
          {bars(data.topics, (n) => i.category(n))}
        </div>
        <div>
          <h4>{b.byPerson}</h4>
          {bars(data.people, (n) => n)}
        </div>
      </div>
    </section>
  )
}

/** Partie « studio » de la page Broadcasts : temps d'antenne puis recherche dans les transcriptions */
export function BroadcastStudio({ days, sub, flux, channels }: { days: number; sub: string; flux: string; channels: string[] }) {
  const i = useI18n()
  const b = useText()
  const auth = useAuth()
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [channel, setChannel] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [days, sub, flux, q, channel, category])
  const params = new URLSearchParams({ days: String(days) })
  if (sub) params.set('sub', sub)
  if (flux) params.set('flux', flux)
  if (q) params.set('q', q)
  if (channel) params.set('channel', channel)
  if (category) params.set('category', category)
  const base = params.toString()
  const { data, loading } = useFetch<SearchResult>(`/api/media/broadcast/search?${base}&page=${page}&size=8`)
  const topics = useFetch<Airtime>(`/api/media/broadcast/airtime?days=${days}${sub ? `&sub=${sub}` : ''}`).data?.topics ?? []
  function submit(e: FormEvent) {
    e.preventDefault()
    setQ(draft.trim())
  }
  // Alerte par mot-clé sur l'antenne : veille avec la requête et les filtres de diffusion
  const watchFilters: Filters = { ...EMPTY_FILTERS, q, media: 'broadcast', source: channel, category }
  return (
    <>
      <AirtimePanel query={base} />
      <section className="bc-search">
        <h3>{b.search}</h3>
        <form className="news-filters" onSubmit={submit}>
          <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={b.placeholder} aria-label={b.search} maxLength={300} dir="auto" />
          <button type="submit" className="news-btn">
            {i.t.search}
          </button>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label={b.allChannels}>
            <option value="">{b.allChannels}</option>
            {channels.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={b.allTopics}>
            <option value="">{b.allTopics}</option>
            {topics.map((t) => (
              <option key={t.name} value={t.name}>
                {i.category(t.name)}
              </option>
            ))}
          </select>
          {canDo(auth?.user, 'manage_watches') && hasModule(auth?.user, 'watch') && <SaveSearchButton filters={watchFilters} email={auth?.user.email ?? ''} />}
        </form>
        {data && <p className="news-status">{b.results(i.num(data.total), i.num(data.news))}</p>}
        {loading && !data && <p className="news-status">{i.t.loading}</p>}
        {data && data.items.length === 0 && <p className="mms-mpage__empty">{b.empty}</p>}
        <div className="bc-list">
          {data?.items.map((c) => (
            <ClipCard key={`${c.id}|${q}`} clip={c} terms={data.terms} query={q} />
          ))}
        </div>
        {data && data.pages > 1 && (
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
      </section>
    </>
  )
}

/** Extrait ouvert depuis un lien partagé (/?clip=<id>&t=<secondes>&q=…) */
export function ClipModal({ id, t, q, onClose }: { id: string; t: number; q: string; onClose: () => void }) {
  const i = useI18n()
  const b = useText()
  const { data, error } = useFetch<Clip>(`/api/media/broadcast/clip/${encodeURIComponent(id)}${q ? `?q=${encodeURIComponent(q)}` : ''}`, 0)
  return (
    <div className="mms-modal" role="dialog" aria-modal="true" aria-label={b.clipTitle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mms-modal__box bc-modal">
        <h3>{b.clipTitle}</h3>
        {error && <p className="news-status news-status--error">{b.notFound}</p>}
        {!data && !error && <p className="news-status">{i.t.loading}</p>}
        {data && <ClipCard clip={data} terms={q ? [q] : []} query={q} focus={t} />}
        <div className="mms-modal__actions">
          <button type="button" className="news-btn news-btn--ghost" onClick={onClose}>
            {b.close}
          </button>
        </div>
      </div>
    </div>
  )
}
