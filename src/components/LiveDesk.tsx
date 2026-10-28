import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { canDo, useAuth } from '../lib/auth'
import { type Clip, Highlight } from './BroadcastStudio'
import { type BoardSummary, listBoards } from './Pinboards'
import { Recordings } from './Recordings'

/**
 * Panneau de la chaîne ouverte en grand sur le mur du direct : ce qui a été dit (transcriptions des tranches
 * enregistrées, mots surlignés, suivi de la plus récente), fiche du programme, chiffres d'audience disponibles,
 * et découpeur d'extrait (début / fin) enregistré comme article dans un tableau d'épingles.
 * Données : /api/media/broadcast/search (même source que la page « البث ») et /api/media/live/stats.
 */

export type LiveStat = { name: string; news: number; segments: number; minutes: number; reach: number; last: string }
type Search = { total: number; news: number; terms: string[]; items: Clip[] }
type Tab = 'text' | 'program' | 'audience' | 'editor' | 'record'
type Selection = { clip: Clip; start: number; end: number | null }

const TEXT = {
  ar: {
    tabs: { text: 'النص', program: 'البرنامج', audience: 'الجمهور', editor: 'المحرّر', record: 'تسجيل حسب الطلب' } as Record<Tab, string>,
    search: 'ابحث فيما قيل على هذه القناة',
    go: 'بحث',
    highlight: 'تمييز الكلمات',
    follow: 'متابعة الأحدث',
    none: 'لا توجد مقاطع مسجّلة ومفرّغة لهذه القناة خلال الأيام السبعة الأخيرة.',
    noneHint: 'تُسجَّل القنوات المفعّلة في الرصد خلال فتراتها المحدّدة ثم تُفرَّغ نصوصها؛ قنوات العرض المباشر فقط لا تُسجَّل.',
    approx: 'التوقيت تقريبي',
    news: (n: number) => `+${n} خبر`,
    extracted: 'الأخبار المستخرجة من هذا المقطع',
    pickHint: 'انقر على توقيت مقطع لتعيين البداية، ثم على آخر لتعيين النهاية.',
    start: 'البداية',
    end: 'النهاية',
    duration: 'المدة التقريبية',
    setStart: 'تعيين البداية',
    setEnd: 'تعيين النهاية',
    clear: 'مسح الاختيار',
    preview: 'معاينة المقطع المختار',
    copyLink: 'نسخ رابط المقطع',
    copyText: 'نسخ النص',
    copied: 'تم النسخ',
    save: 'حفظ كمقال في لوحة تثبيت',
    board: 'لوحة التثبيت',
    saved: (b: string) => `حُفظ المقطع في «${b}»`,
    noBoard: 'أنشئ لوحة تثبيت أولاً من صفحة الأخبار (📌).',
    saveError: 'تعذّر الحفظ.',
    noRight: 'الحفظ في لوحات التثبيت متاح لملفات المحللين والمشرفين.',
    openEditor: 'فتح المحرّر',
    channel: 'القناة',
    kind: 'النوع',
    tv: 'تلفزيون',
    radio: 'إذاعة',
    source: 'مصدر البث',
    slots: 'فترات التسجيل والتفريغ (توقيت طرابلس)',
    noSlots: 'غير مسجّلة: عرض مباشر فقط',
    last: 'آخر تسجيل',
    recent: 'آخر المقاطع المسجّلة',
    topics: 'المواضيع',
    day: 'آخر 24 ساعة',
    buzz: 'الأخبار المستخرجة',
    segments: 'المقاطع المسجّلة',
    minutes: 'زمن البث التقديري',
    reach: 'الانتشار التقديري',
    min: (n: number) => `${n} د`,
    audienceNote: 'لا تتوفر قياسات مشاهدة فعلية للقنوات الليبية. الانتشار رقم تقديري يضبطه المشرف لكل قناة من وحدة الإدارة، ويُستعمل في ترتيب الأخبار وحساب الحضور.',
    noStats: 'لا توجد أخبار مستخرجة من هذه القناة خلال آخر 24 ساعة.',
  },
  en: {
    tabs: { text: 'Transcript', program: 'Program', audience: 'Audience', editor: 'Editor', record: 'Record on demand' } as Record<Tab, string>,
    search: 'Search what was said on this channel',
    go: 'Search',
    highlight: 'Highlight words',
    follow: 'Follow latest',
    none: 'No recorded and transcribed segment for this channel in the last 7 days.',
    noneHint: 'Channels enabled in the monitoring are recorded during their time slots, then transcribed; live-only channels are not recorded.',
    approx: 'Times are approximate',
    news: (n: number) => `+${n} news`,
    extracted: 'News extracted from this segment',
    pickHint: 'Click a passage time to set the start, then another one to set the end.',
    start: 'Start',
    end: 'End',
    duration: 'Approximate duration',
    setStart: 'Set start',
    setEnd: 'Set end',
    clear: 'Clear selection',
    preview: 'Preview of the selected clip',
    copyLink: 'Copy clip link',
    copyText: 'Copy text',
    copied: 'Copied',
    save: 'Save as an article on a pinboard',
    board: 'Pinboard',
    saved: (b: string) => `Clip saved to “${b}”`,
    noBoard: 'Create a pinboard first from the news page (📌).',
    saveError: 'Saving failed.',
    noRight: 'Saving to pinboards is available to analyst and admin profiles.',
    openEditor: 'Open the editor',
    channel: 'Channel',
    kind: 'Type',
    tv: 'TV',
    radio: 'Radio',
    source: 'Stream source',
    slots: 'Recording and transcription slots (Tripoli time)',
    noSlots: 'Not recorded: live display only',
    last: 'Last recording',
    recent: 'Latest recorded segments',
    topics: 'Topics',
    day: 'Last 24 hours',
    buzz: 'News extracted',
    segments: 'Recorded segments',
    minutes: 'Estimated airtime',
    reach: 'Estimated reach',
    min: (n: number) => `${n} min`,
    audienceNote: 'No measured viewing figures exist for Libyan channels. Reach is an estimate set per channel by the administrator, used to rank news and compute share of voice.',
    noStats: 'No news extracted from this channel in the last 24 hours.',
  },
}

const useText = () => TEXT[useI18n().lang === 'ar' ? 'ar' : 'en']
const clipLink = (id: string, start: number, end: number) => `${location.origin}/?clip=${encodeURIComponent(id)}&t=${start}&e=${end}`
const fmtDuration = (s: number, lang: string) => {
  const m = Math.floor(s / 60)
  const r = s % 60
  return lang === 'ar' ? `${m} د ${r} ث` : `${m} min ${r} s`
}

/** Passages entre le début et la fin choisis (fin incluse ; sans fin, le seul passage de début) */
function chosen(sel: Selection | null) {
  if (!sel) return []
  const end = sel.end ?? sel.start
  return sel.clip.passages.filter((p) => p.offset >= sel.start && p.offset <= end)
}

function SegmentList({ data, terms, sel, onPick, follow }: { data: Search; terms: string[]; sel: Selection | null; onPick: (c: Clip, offset: number) => void; follow: boolean }) {
  const i = useI18n()
  const t = useText()
  const box = useRef<HTMLDivElement>(null)
  // Suivi : la tranche la plus récente reste en haut de la liste à chaque actualisation
  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = 0
  }, [data, follow])
  return (
    <div className="ld-segs" ref={box}>
      {data.items.map((c) => (
        <article key={c.id} className="ld-seg">
          <header>
            <time>
              {i.dateTime(c.start)} – {i.time(new Date(Date.parse(c.start) + 10 * 60_000).toISOString())}
            </time>
            {c.news.length > 0 && (
              <details className="ld-seg__news">
                <summary>{t.news(c.news.length)}</summary>
                <ul>
                  {c.news.map((n) => (
                    <li key={n.id} dir="auto">
                      <time>{i.time(n.date)}</time> {n.title}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </header>
          <ol className="bc-passages ld-passages">
            {c.passages.map((p) => {
              const inSel = sel?.clip.id === c.id && p.offset >= sel.start && p.offset <= (sel.end ?? sel.start)
              return (
                <li key={p.n} className={`${p.hit && terms.length ? 'is-hit' : ''}${inSel ? ' is-sel' : ''}`}>
                  <button type="button" className="bc-passages__time" onClick={() => onPick(c, p.offset)} title={t.pickHint}>
                    ≈ {i.time(p.at)}
                  </button>
                  <p dir="auto">
                    <Highlight text={p.text} terms={terms} />
                  </p>
                </li>
              )
            })}
          </ol>
        </article>
      ))}
    </div>
  )
}

function Editor({ sel, onClear }: { sel: Selection | null; onClear: () => void }) {
  const i = useI18n()
  const t = useText()
  const auth = useAuth()
  const can = canDo(auth?.user, 'tags')
  const [boards, setBoards] = useState<BoardSummary[] | null>(null)
  const [board, setBoard] = useState('')
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState('')
  useEffect(() => {
    if (can) listBoards().then((b) => (setBoards(b), setBoard(b[0]?.id ?? '')))
  }, [can])
  if (!sel) return <p className="news-status">{t.pickHint}</p>
  const parts = chosen(sel)
  const first = parts[0]
  const last = parts[parts.length - 1]
  const words = parts.map((p) => p.text).join(' ')
  const seconds = last ? last.offset - first.offset + Math.round((last.text.split(/\s+/).length / 130) * 60) : 0
  const end = sel.end ?? sel.start
  const copy = (what: string, value: string) =>
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(what)
        setTimeout(() => setCopied(''), 1600)
      },
      () => {},
    )
  async function save() {
    setMsg('')
    const r = await fetch(`/api/pinboards/${board}/clips`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sel!.clip.id, start: sel!.start, end }) })
    setMsg(r.ok ? t.saved(boards?.find((b) => b.id === board)?.name ?? '') : t.saveError)
  }
  return (
    <div className="ld-editor">
      <div className="ld-editor__range">
        <span className="ld-editor__mark is-start">
          {t.start} <b>≈ {first ? i.time(first.at) : '—'}</b>
        </span>
        <span className="ld-editor__mark is-end">
          {t.end} <b>≈ {sel.end != null && last ? i.time(last.at) : '—'}</b>
        </span>
        <span className="ld-editor__mark">
          {t.duration} <b>{fmtDuration(seconds, i.lang)}</b>
        </span>
        <button type="button" className="news-btn news-btn--ghost" onClick={onClear}>
          {t.clear}
        </button>
      </div>
      <p className="ld-editor__label">
        {t.preview} · <b dir="auto">{sel.clip.origin}</b>
      </p>
      <blockquote className="ld-editor__preview" dir="auto">
        {words}
      </blockquote>
      <div className="ld-editor__actions">
        <button type="button" className="news-btn news-btn--ghost" onClick={() => copy('link', clipLink(sel.clip.id, sel.start, end))}>
          {copied === 'link' ? t.copied : t.copyLink}
        </button>
        <button type="button" className="news-btn news-btn--ghost" onClick={() => copy('text', `${sel.clip.origin} · ${i.dateTime(first.at)}\n${words}`)}>
          {copied === 'text' ? t.copied : t.copyText}
        </button>
      </div>
      {can ? (
        boards && boards.length === 0 ? (
          <p className="news-status">{t.noBoard}</p>
        ) : (
          <div className="ld-editor__save">
            <label>
              <span>{t.board}</span>
              <select value={board} onChange={(e) => setBoard(e.target.value)}>
                {boards?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="news-btn" onClick={save} disabled={!board}>
              {t.save}
            </button>
          </div>
        )
      ) : (
        <p className="news-status">{t.noRight}</p>
      )}
      {msg && <p className="news-status">{msg}</p>}
    </div>
  )
}

export function LiveDesk({ id, name, canal, slots, last, via, stat }: { id: string; name: string; canal: 'tv' | 'radio'; slots: string[]; last?: string | null; via: string; stat?: LiveStat }) {
  const i = useI18n()
  const t = useText()
  const [tab, setTab] = useState<Tab>('text')
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [highlight, setHighlight] = useState(true)
  const [follow, setFollow] = useState(true)
  const [sel, setSel] = useState<Selection | null>(null)
  const params = new URLSearchParams({ channel: name, days: '7', size: '8' })
  if (q) params.set('q', q)
  const { data, error } = useFetch<Search>(`/api/media/broadcast/search?${params.toString()}`, 60_000)
  const terms = highlight ? (data?.terms ?? []) : []
  function submit(e: FormEvent) {
    e.preventDefault()
    setQ(draft.trim())
  }
  // Premier clic : début ; deuxième clic dans la même tranche : fin (l'ordre est rétabli si besoin) ; ensuite on recommence
  function pick(c: Clip, offset: number) {
    setSel((s) => {
      if (!s || s.clip.id !== c.id || s.end != null) return { clip: c, start: offset, end: null }
      return offset >= s.start ? { ...s, end: offset } : { clip: c, start: offset, end: s.start }
    })
  }
  const topics = [...new Set((data?.items ?? []).flatMap((c) => c.news.map((n) => n.category)).filter(Boolean))].slice(0, 8)
  return (
    <section className="ld">
      <div className="mms-rtabs ld-tabs" role="tablist">
        {(['text', 'program', 'audience', 'editor', 'record'] as Tab[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-active' : ''} onClick={() => setTab(k)}>
            {t.tabs[k]}
            {k === 'editor' && sel && <i className="ld-dot" aria-hidden />}
          </button>
        ))}
      </div>

      {tab === 'text' && (
        <>
          <form className="ld-bar" onSubmit={submit}>
            <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.search} dir="auto" aria-label={t.search} />
            <button type="submit" className="news-btn">
              {t.go}
            </button>
            <button type="button" className={highlight ? 'ld-toggle is-on' : 'ld-toggle'} aria-pressed={highlight} onClick={() => setHighlight(!highlight)}>
              {t.highlight}
            </button>
            <button type="button" className={follow ? 'ld-toggle is-on' : 'ld-toggle'} aria-pressed={follow} onClick={() => setFollow(!follow)}>
              {t.follow}
            </button>
          </form>
          <p className="ld-hint">
            ≈ {t.approx} · {t.pickHint}
          </p>
          {sel && (
            <p className="ld-selbar">
              {t.start} ≈ {i.time(chosen(sel)[0]?.at ?? sel.clip.start)}
              {sel.end != null && ` · ${t.end} ≈ ${i.time(chosen(sel).slice(-1)[0]?.at ?? sel.clip.start)}`}
              <button type="button" className="news-btn" onClick={() => setTab('editor')}>
                {t.openEditor}
              </button>
            </p>
          )}
          {error && <p className="news-status news-status--error">{i.t.loadError}</p>}
          {!data && !error && <p className="news-status">{i.t.loading}</p>}
          {data && data.items.length === 0 && (
            <div className="mms-mpage__empty">
              <p>{t.none}</p>
              <small>{t.noneHint}</small>
            </div>
          )}
          {data && data.items.length > 0 && <SegmentList data={data} terms={terms} sel={sel} onPick={pick} follow={follow} />}
        </>
      )}

      {tab === 'program' && (
        <dl className="ld-facts">
          <dt>{t.channel}</dt>
          <dd dir="auto">{name}</dd>
          <dt>{t.kind}</dt>
          <dd>{canal === 'radio' ? t.radio : t.tv}</dd>
          <dt>{t.source}</dt>
          <dd>{via || '—'}</dd>
          <dt>{t.slots}</dt>
          <dd dir="ltr">{slots.length ? slots.join(' · ') : t.noSlots}</dd>
          {last && (
            <>
              <dt>{t.last}</dt>
              <dd>{i.dateTime(last)}</dd>
            </>
          )}
          {topics.length > 0 && (
            <>
              <dt>{t.topics}</dt>
              <dd>
                {topics.map((c) => (
                  <span key={c} className="news-badge">
                    {i.category(c)}
                  </span>
                ))}
              </dd>
            </>
          )}
          {data && data.items.length > 0 && (
            <>
              <dt>{t.recent}</dt>
              <dd>
                <ul className="ld-recent">
                  {data.items.slice(0, 5).map((c) => (
                    <li key={c.id}>
                      <time>{i.dateTime(c.start)}</time> <span dir="auto">{c.news[0]?.title ?? c.title}</span> {c.news.length > 1 && <em>{t.news(c.news.length - 1)}</em>}
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
        </dl>
      )}

      {tab === 'audience' && (
        <div className="ld-audience">
          <p className="ld-hint">{t.day}</p>
          {stat ? (
            <div className="ld-kpis">
              <div>
                <span>{t.buzz}</span>
                <b>{i.num(stat.news)}</b>
              </div>
              <div>
                <span>{t.segments}</span>
                <b>{i.num(stat.segments)}</b>
              </div>
              <div>
                <span>{t.minutes}</span>
                <b>{t.min(Math.round(stat.minutes))}</b>
              </div>
              <div>
                <span>{t.reach}</span>
                <b>{i.num(stat.reach)}</b>
              </div>
            </div>
          ) : (
            <p className="news-status">{t.noStats}</p>
          )}
          <p className="ld-hint">{t.audienceNote}</p>
        </div>
      )}

      {tab === 'editor' && <Editor sel={sel} onClear={() => setSel(null)} />}
      {tab === 'record' && <Recordings channel={id} />}
    </section>
  )
}
