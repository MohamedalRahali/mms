import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { type Flux, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { useAuth } from '../lib/auth'
import { TONE_COLORS } from '../lib/intel'
import {
  type AgentId,
  type AgentStats,
  type Conversation,
  type Source,
  type Turn,
  readFavorites,
  readHistory,
  removeConversation,
  saveConversation,
  saveFavorites,
  uid,
  useAround,
} from '../lib/around'
import { type Block, parseInline, parseMd } from '../lib/aroundMd'
import { downloadPptx, kpiRows, openReport, turnText, turnTitle } from '../lib/aroundExport'

/**
 * Around, l'assistant IA de MMS, sur le modèle de Meltwater Mira Studio :
 * accueil (salutation, veille, période), bibliothèque de prompts, agents multi-étapes avec confirmation,
 * réponses structurées et sourcées, cartes d'articles, relances, exports, historique, vues Fil et Canevas.
 */

const ICONS: Record<string, string> = {
  prompts: 'M6 3h12v18l-6-4-6 4V3zm2 2v12l4-2.7 4 2.7V5H8z',
  history: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-1 3v6l5 3 1-1.7-4-2.3V7h-2z',
  folder: 'M3 5h7l2 2h9v12H3V5zm2 4v8h14V9H5z',
  calendar: 'M7 2h2v2h6V2h2v2h3v17H4V4h3V2zm-1 7v10h12V9H6zm2 2h3v3H8z',
  send: 'M12 4l7 7-1.4 1.4L13 7.8V20h-2V7.8l-4.6 4.6L5 11z',
  caret: 'M7 10l5 5 5-5z',
  back: 'M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z',
  thread: 'M3 4h18v12H3V4zm2 2v8h14V6H5zm1 12h12v2H6z',
  canvas: 'M3 3h18v18H3V3zm2 2v14h6V5H5zm8 0v14h6V5h-6z',
  newchat: 'M3 6h12v2H3zm0 4h12v2H3zm0 4h7v2H3zm14.6-1.4 1.4-1.4 2.8 2.8-1.4 1.4zM16.2 14l2.8 2.8-5.2 5.2H11v-2.8z',
  star: 'M12 2l3 6.9 7.5.6-5.7 4.9 1.8 7.3L12 17.8l-6.6 3.9 1.8-7.3-5.7-4.9L9 8.9z',
  starOff:
    'M12 2 9 8.9l-7.5.6 5.7 4.9-1.8 7.3L12 17.8l6.6 3.9-1.8-7.3 5.7-4.9L15 8.9zm0 3.8 1.7 4 4.3.4-3.3 2.8 1 4.2L12 15l-3.7 2.2 1-4.2L6 10.2l4.3-.4z',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-1 3h2v2h-2zm0 4h2v6h-2z',
  up: 'M2 10h4v11H2zm6 11h9.3c.9 0 1.6-.6 1.8-1.4l2-7c.3-1.1-.6-2.1-1.7-2.1H14l1-4.4c.2-.9-.4-1.8-1.3-2L13 4l-5 6.5z',
  down: 'M22 14h-4V3h4zm-6-11H6.7c-.9 0-1.6.6-1.8 1.4l-2 7c-.3 1.1.6 2.1 1.7 2.1H10l-1 4.4c-.2.9.4 1.8 1.3 2l.7.1 5-6.5z',
  copy: 'M8 3h11v13h-2V5H8zM4 7h11v14H4zm2 2v10h7V9z',
  refresh: 'M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.2L13 11h7V4z',
  mail: 'M3 5h18v14H3zm2 2v.5l7 4.5 7-4.5V7zm0 2.9V17h14V9.9l-7 4.5z',
  pdf: 'M6 2h9l5 5v15H6zm8 1.5V8h4.5zM8 12h8v2H8zm0 4h8v2H8z',
  web: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 9h-3a15 15 0 0 0-1.3-5.5A8 8 0 0 1 18.9 11zM12 4c.9 1.2 1.8 3.6 2 7h-4c.2-3.4 1.1-5.8 2-7zM9.4 5.5A15 15 0 0 0 8.1 11h-3a8 8 0 0 1 4.3-5.5zM5.1 13h3a15 15 0 0 0 1.3 5.5A8 8 0 0 1 5.1 13zm6.9 7c-.9-1.2-1.8-3.6-2-7h4c-.2 3.4-1.1 5.8-2 7zm2.6-1.5a15 15 0 0 0 1.3-5.5h3a8 8 0 0 1-4.3 5.5z',
  ppt: 'M3 4h18v13h-8v2h3v2H8v-2h3v-2H3zm2 2v9h14V6zm2 2h6v5H7zm8 0h2v2h-2zm0 3h2v2h-2z',
  sparkle: 'M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9z',
  coverage: 'M4 20V10h3v10zm6 0V4h3v16zm6 0v-7h3v7z',
  brief: 'M9 3h6v3h5v14H4V6h5zm2 2v1h2V5zM6 8v10h12V8z',
  release: 'M3 10v4h3l5 4V6l-5 4zm12-3v10a5 5 0 0 0 0-10zm0-4v2a7 7 0 0 1 0 14v2a9 9 0 0 0 0-18z',
  roundup: 'M4 4h14v3h2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2 2v12h10V6zm2 2h6v3H8zm0 5h6v2H8z',
  close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z',
  trash: 'M9 3h6v2h5v2H4V5h5zm-3 6h12l-1 12H7z',
  chevron: 'M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z',
  arrowDown: 'M11 4h2v12.2l5.6-5.6L20 12l-8 8-8-8 1.4-1.4 5.6 5.6z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
}

function Icon({ name, size = 18, flip = false }: { name: string; size?: number; flip?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={flip ? 'around-flip' : undefined}>
      <path fill="currentColor" fillRule="evenodd" d={ICONS[name]} />
    </svg>
  )
}

function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="around-logo" style={{ width: size, height: size }} aria-hidden>
      <img src="/around-logo.png" alt="" />
    </span>
  )
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.error || String(res.status)), { code: json.error || String(res.status) })
  return json as T
}

/** Menu déroulant simple, fermé par un clic à l'extérieur */
function Menu({ label, children, className = '' }: { label: ReactNode; children: (close: () => void) => ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])
  return (
    <div className={`around-menu ${className}`} ref={box}>
      <button type="button" className="around-menu__btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && <div className="around-menu__list">{children(() => setOpen(false))}</div>}
    </div>
  )
}

const PERIODS = [1, 7, 30, 90, 180, 365]
const AGENT_ORDER: AgentId[] = ['coverage', 'brief', 'release', 'roundup']

/* ---------------------------------------------------------------- zone de question */

type ComposerProps = {
  draft: string
  setDraft: (v: string) => void
  agent: AgentId | null
  setAgent: (a: AgentId | null) => void
  days: number
  setDays: (d: number) => void
  watch: string
  setWatch: (id: string) => void
  watches: { id: string; name: string }[]
  busy: boolean
  onSend: () => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  compact?: boolean
}

function Composer(p: ComposerProps) {
  const a = useAround()
  const watchName = p.watches.find((w) => w.id === p.watch)?.name
  const agentDef = a.agentDefs.find((x) => x.id === p.agent)
  return (
    <form
      className={`around-composer ${p.compact ? 'around-composer--compact' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        p.onSend()
      }}
    >
      <div className="around-composer__head">
        <Menu
          label={
            <>
              <Icon name="folder" />
              <span>{watchName || a.connect}</span>
              <Icon name="caret" />
            </>
          }
        >
          {(close) => (
            <>
              <button
                type="button"
                className={!p.watch ? 'is-on' : ''}
                onClick={() => {
                  p.setWatch('')
                  close()
                }}
              >
                {a.allMms}
              </button>
              {p.watches.length > 0 && <p className="around-menu__title">{a.watches}</p>}
              {p.watches.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={p.watch === w.id ? 'is-on' : ''}
                  onClick={() => {
                    p.setWatch(w.id)
                    close()
                  }}
                  dir="auto"
                >
                  {w.name}
                </button>
              ))}
            </>
          )}
        </Menu>
        {agentDef && (
          <span className="around-agent-chip">
            <Icon name={agentDef.id} size={15} />
            {agentDef.title}
            <button type="button" aria-label={a.remove} onClick={() => p.setAgent(null)}>
              <Icon name="close" size={14} />
            </button>
          </span>
        )}
      </div>
      <textarea
        ref={p.inputRef}
        value={p.draft}
        onChange={(e) => p.setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            p.onSend()
          }
        }}
        placeholder={agentDef ? `${a.agentPlaceholder(agentDef.subject)} (${agentDef.example})` : a.placeholder}
        rows={p.compact ? 1 : 3}
        maxLength={800}
        dir="auto"
      />
      <div className="around-composer__foot">
        <Menu
          className="around-menu--up"
          label={
            <>
              <Icon name="calendar" size={16} />
              <span>{a.periods[p.days]}</span>
            </>
          }
        >
          {(close) =>
            PERIODS.map((d) => (
              <button
                key={d}
                type="button"
                className={p.days === d ? 'is-on' : ''}
                onClick={() => {
                  p.setDays(d)
                  close()
                }}
              >
                {a.periods[d]}
              </button>
            ))
          }
        </Menu>
        <button type="submit" className="around-send" disabled={p.busy || (!p.draft.trim() && !p.agent)} aria-label={a.send} title={a.send}>
          <Icon name="send" size={20} />
        </button>
      </div>
    </form>
  )
}

/* ---------------------------------------------------------------- rendu des réponses */

function initials(name: string) {
  const words = String(name || '?').trim().split(/\s+/)
  return (words[0]?.[0] || '?') + (words[1]?.[0] || '')
}

/** Renvoi aux sources, à la Mira : nom du premier média + nombre d'autres */
function CiteChip({ ns, sources }: { ns: number[]; sources: Source[] }) {
  const found = [...new Set(ns)].map((n) => sources.find((s) => s.n === n)).filter(Boolean) as Source[]
  if (!found.length) return null
  const first = found[0]
  return (
    <a
      className="around-cite"
      href={first.url || undefined}
      target="_blank"
      rel="noreferrer"
      title={found.map((s) => `${s.origin} · ${s.title}`).join('\n')}
    >
      <i>{initials(first.origin)}</i>
      <span dir="auto">{first.origin}</span>
      {found.length > 1 && <b dir="ltr">+{found.length - 1}</b>}
    </a>
  )
}

function Rich({ text, sources }: { text: string; sources: Source[] }) {
  return (
    <>
      {parseInline(text).map((x, k) =>
        x.t === 'text' ? <Fragment key={k}>{x.v}</Fragment> : x.t === 'bold' ? <strong key={k}>{x.v}</strong> : <CiteChip key={k} ns={x.ns} sources={sources} />,
      )}
    </>
  )
}

function Markdown({ blocks, sources }: { blocks: Block[]; sources: Source[] }) {
  return (
    <div className="around-md" dir="auto">
      {blocks.map((b, k) => {
        if (b.t === 'h') {
          const Tag = (`h${Math.min(b.level + 2, 5)}` as 'h3' | 'h4' | 'h5')
          return (
            <Tag key={k}>
              <Rich text={b.text} sources={sources} />
            </Tag>
          )
        }
        if (b.t === 'p')
          return (
            <p key={k}>
              <Rich text={b.text} sources={sources} />
            </p>
          )
        if (b.t === 'table')
          return (
            <div key={k} className="around-table">
              <table>
                <thead>
                  <tr>
                    {b.head.map((c, n) => (
                      <th key={n}>
                        <Rich text={c} sources={sources} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, n) => (
                    <tr key={n}>
                      {r.map((c, m) => (
                        <td key={m}>
                          <Rich text={c} sources={sources} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        const List = b.ordered ? 'ol' : 'ul'
        return (
          <List key={k} className={b.ordered && b.items.some((it) => it.children.length) ? 'around-topics' : undefined}>
            {b.items.map((it, n) => (
              <li key={n}>
                <Rich text={it.text} sources={sources} />
                {it.children.length > 0 && (
                  <ul>
                    {it.children.map((c, m) => (
                      <li key={m}>
                        <Rich text={c} sources={sources} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}

function ArticleCards({ sources }: { sources: Source[] }) {
  const i = useI18n()
  const a = useAround()
  // Les articles illustrés d'abord, comme les cartes de Mira
  const list = [...sources].sort((x, y) => Number(Boolean(y.image)) - Number(Boolean(x.image))).slice(0, 6)
  if (!list.length) return null
  return (
    <section className="around-cards">
      <h4>{a.articles}</h4>
      <div className="around-cards__grid">
        {list.map((s) => (
          <a key={s.n} className="around-card" href={s.url || undefined} target="_blank" rel="noreferrer">
            <span className="around-card__img">
              {s.image ? <img src={s.image} alt="" loading="lazy" /> : <span className="around-card__ph">{initials(s.origin)}</span>}
              <b className="around-card__n">{s.n}</b>
            </span>
            <span className="around-card__meta">
              <i>{initials(s.origin)}</i>
              <span>
                <strong dir="auto">{s.origin}</strong>
                <small>{i.dateTime(s.date)}</small>
              </span>
            </span>
            <span className="around-card__title" dir="auto">
              {s.title}
            </span>
            {s.tone && <span className="around-card__tone" style={{ background: TONE_COLORS[s.tone as keyof typeof TONE_COLORS] }} title={a.tones[s.tone]} />}
          </a>
        ))}
      </div>
    </section>
  )
}

function Timeline({ stats }: { stats: AgentStats }) {
  const i = useI18n()
  const max = Math.max(...stats.perDay, 1)
  const spikes = new Set(stats.spikes.map((s) => s.day))
  return (
    <div className="around-timeline">
      <div className="around-timeline__bars">
        {stats.perDay.map((v, k) => (
          <span
            key={k}
            className={spikes.has(stats.dates[k]) ? 'is-spike' : ''}
            style={{ height: `${Math.max((v / max) * 100, v ? 3 : 0)}%` }}
            title={`${i.day(stats.dates[k])} : ${i.num(v)}`}
          />
        ))}
      </div>
      <div className="around-timeline__axis">
        <span>{i.day(stats.dates[0])}</span>
        <span>{i.day(stats.dates[stats.dates.length - 1])}</span>
      </div>
    </div>
  )
}

function ToneBar({ tones }: { tones: AgentStats['current']['tones'] }) {
  const a = useAround()
  const total = tones.positive + tones.neutral + tones.negative || 1
  return (
    <div className="around-tone">
      <div className="around-tone__bar">
        {(['positive', 'neutral', 'negative'] as const).map((t) => (
          <span key={t} style={{ width: `${(tones[t] / total) * 100}%`, background: TONE_COLORS[t] }} />
        ))}
      </div>
      <p>
        {(['positive', 'neutral', 'negative'] as const).map((t) => (
          <span key={t}>
            <i style={{ background: TONE_COLORS[t] }} /> {a.tones[t]} <b>{Math.round((tones[t] / total) * 100)}%</b>
          </span>
        ))}
      </p>
    </div>
  )
}

function AgentReport({ t }: { t: Turn }) {
  const i = useI18n()
  const a = useAround()
  const s = t.stats
  const src = t.sources ?? []
  return (
    <div className="around-report" dir="auto">
      <section className="around-exec">
        <h4>{a.exec}</h4>
        <p>
          <Rich text={t.summary || ''} sources={src} />
        </p>
      </section>
      {s && (
        <>
          <h4>{a.kpis}</h4>
          <div className="around-table">
            <table>
              <thead>
                <tr>
                  <th>{a.metric}</th>
                  <th>{a.current}</th>
                  <th>{a.previous}</th>
                  <th>{a.change}</th>
                </tr>
              </thead>
              <tbody>
                {kpiRows(s, a).map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>{i.num(r.cur)}</td>
                    <td>{i.num(r.prev)}</td>
                    <td className={r.tone ? `is-${r.tone}` : ''} dir="ltr">
                      {r.change}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="around-report__duo">
            <section>
              <h4>{a.timeline}</h4>
              <Timeline stats={s} />
            </section>
            <section>
              <h4>{a.tone}</h4>
              <ToneBar tones={s.current.tones} />
              {s.sources.length > 0 && (
                <>
                  <h4>{a.topSources}</h4>
                  <ul className="around-rank">
                    {s.sources.slice(0, 5).map((x) => (
                      <li key={x.name}>
                        <span dir="auto">{x.name}</span>
                        <i style={{ width: `${(x.count / s.sources[0].count) * 100}%` }} />
                        <b>{i.num(x.count)}</b>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        </>
      )}
      {(t.sections ?? []).map((sec) => (
        <section key={sec.titre} className="around-section">
          <h4>{sec.titre}</h4>
          <ul>
            {sec.points.map((pt, k) => (
              <li key={k}>
                <Rich text={pt} sources={src} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {s && s.spikes.length > 0 && (
        <section className="around-section">
          <h4>{a.spikes}</h4>
          {s.spikes.map((p) => (
            <p key={p.day} className="around-spike">
              <strong>{i.day(p.day)}</strong> · {a.spikeLine(i.num(p.count))} · {p.sources.map((x) => x.name).join('، ')}
              {p.top && <small dir="auto">{p.top}</small>}
            </p>
          ))}
        </section>
      )}
      {s && s.places.length > 0 && (
        <section className="around-section">
          <h4>{a.geo}</h4>
          <div className="around-table">
            <table>
              <thead>
                <tr>
                  <th>{a.place}</th>
                  <th>{a.mentions}</th>
                  <th>{a.tone}</th>
                </tr>
              </thead>
              <tbody>
                {s.places.map((p) => (
                  <tr key={p.name}>
                    <td dir="auto">{p.name}</td>
                    <td>{i.num(p.count)}</td>
                    <td className="around-geo-tone">
                      <ToneBar tones={p.tones} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {!!t.recommendations?.length && (
        <section className="around-reco">
          <h4>{a.recommendations}</h4>
          <ol>
            {t.recommendations.map((r, k) => (
              <li key={k}>
                <Rich text={r} sources={src} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

function AgentSteps() {
  const a = useAround()
  const [step, setStep] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => Math.min(s + 1, a.steps.length - 1)), 2600)
    return () => window.clearInterval(id)
  }, [a.steps.length])
  return (
    <ol className="around-steps">
      {a.steps.map((s, k) => (
        <li key={s} className={k < step ? 'is-done' : k === step ? 'is-on' : ''}>
          <span>{k < step ? <Icon name="check" size={14} /> : k + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  )
}

function Thinking() {
  const a = useAround()
  return (
    <p className="around-thinking">
      <i />
      <i />
      <i />
      {a.thinking}
    </p>
  )
}

type Actions = {
  onConfirm: (t: Turn) => void
  onEdit: (t: Turn) => void
  onRetry: (t: Turn) => void
  onFollow: (q: string) => void
  onRate: (t: Turn, r: 1 | -1) => void
  onCanvas: (t: Turn) => void
}

function ConfirmCard({ t, act }: { t: Turn; act: Actions }) {
  const a = useAround()
  const now = Date.now()
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const from = now - t.days * 86_400_000
  return (
    <div className="around-confirm">
      <p>{a.confirmIntro}</p>
      <ul>
        <li>
          <b>{a.pAgent} :</b> {a.agentDefs.find((x) => x.id === t.agent)?.title}
        </li>
        <li>
          <b>{a.pSubject} :</b> <span dir="auto">{t.subject || a.allSubject}</span>
        </li>
        <li>
          <b>{a.pWatch} :</b> <span dir="auto">{t.watchName || a.allMms}</span>
        </li>
        <li>
          <b>{a.pPeriod} :</b> <span dir="ltr">{day(from)} → {day(now)}</span> ({a.periods[t.days]})
        </li>
        <li>
          <b>{a.pPrev} :</b> <span dir="ltr">{day(from - t.days * 86_400_000)} → {day(from)}</span>
        </li>
        <li>
          <b>{a.pSources} :</b> {a.pSourcesVal}
        </li>
      </ul>
      {t.status === 'confirm' ? (
        <>
          <p className="around-muted">{a.confirmOutro}</p>
          <div className="around-confirm__btns">
            <button type="button" className="around-btn around-btn--solid" onClick={() => act.onConfirm(t)}>
              <Icon name="check" size={16} /> {a.confirm}
            </button>
            <button type="button" className="around-btn" onClick={() => act.onEdit(t)}>
              {a.edit}
            </button>
          </div>
        </>
      ) : t.status === 'cancelled' ? (
        <p className="around-muted">{a.cancelled}</p>
      ) : null}
    </div>
  )
}

function TitleCard({ t, act, inCanvas }: { t: Turn; act: Actions; inCanvas?: boolean }) {
  const a = useAround()
  const i = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <div className="around-titlecard">
      <span className="around-titlecard__icon">
        <Icon name={t.agent || 'sparkle'} size={20} />
      </span>
      <h3 dir="auto">{turnTitle(t, a)}</h3>
      <div className="around-titlecard__btns">
        <button type="button" className="around-btn around-btn--sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {a.details} <Icon name="chevron" size={16} />
        </button>
        {!inCanvas && (
          <button type="button" className="around-btn around-btn--sm" onClick={() => act.onCanvas(t)}>
            <Icon name="canvas" size={15} /> {a.openCanvas}
          </button>
        )}
      </div>
      {open && (
        <dl className="around-titlecard__details">
          {t.agent && (
            <>
              <dt>{a.pAgent}</dt>
              <dd>{a.agentDefs.find((x) => x.id === t.agent)?.title}</dd>
            </>
          )}
          <dt>{a.pWatch}</dt>
          <dd dir="auto">{t.watchName || a.allMms}</dd>
          <dt>{a.period}</dt>
          <dd>{a.periods[t.days]}</dd>
          <dt>{a.sources}</dt>
          <dd>
            {i.num(t.sources?.length ?? 0)} · {a.considered(i.num(t.considered ?? 0))}
          </dd>
          <dt>{a.generatedOn}</dt>
          <dd>{i.dateTime(t.at)}</dd>
        </dl>
      )}
    </div>
  )
}

function AnswerTools({ t, act }: { t: Turn; act: Actions }) {
  const a = useAround()
  const i = useI18n()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const ctx = { a, lang: i.lang, num: i.num, dateTime: i.dateTime, day: i.day }
  return (
    <>
      <div className="around-export">
        <button type="button" className="around-btn around-btn--wide" onClick={() => openReport(t, ctx)}>
          <Icon name="web" /> {a.webReport}
        </button>
        <button
          type="button"
          className="around-btn around-btn--wide"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await downloadPptx(t, ctx)
            } finally {
              setBusy(false)
            }
          }}
        >
          <Icon name="ppt" /> {a.ppt}
        </button>
      </div>
      <div className="around-actions">
        <button type="button" className={t.rating === 1 ? 'is-on' : ''} title={a.good} aria-label={a.good} onClick={() => act.onRate(t, 1)}>
          <Icon name="up" />
        </button>
        <button type="button" className={t.rating === -1 ? 'is-on' : ''} title={a.bad} aria-label={a.bad} onClick={() => act.onRate(t, -1)}>
          <Icon name="down" />
        </button>
        <button
          type="button"
          title={copied ? a.copied : a.copy}
          aria-label={a.copy}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(turnText(t, a))
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              /* presse-papiers refusé */
            }
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} />
        </button>
        <button type="button" title={a.regenerate} aria-label={a.regenerate} onClick={() => act.onRetry(t)}>
          <Icon name="refresh" />
        </button>
        <a
          title={a.email}
          aria-label={a.email}
          href={`mailto:?subject=${encodeURIComponent(turnTitle(t, a))}&body=${encodeURIComponent(turnText(t, a).slice(0, 1800))}`}
        >
          <Icon name="mail" />
        </a>
        <button type="button" title={a.pdf} aria-label={a.pdf} onClick={() => openReport(t, ctx, true)}>
          <Icon name="pdf" />
        </button>
        {t.rating && <span className="around-actions__thanks">{a.thanks}</span>}
      </div>
    </>
  )
}

function FollowUps({ list, onPick }: { list: string[]; onPick: (q: string) => void }) {
  const a = useAround()
  const [open, setOpen] = useState(true)
  if (!list.length) return null
  return (
    <section className="around-follow">
      <button type="button" className="around-follow__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="sparkle" size={20} />
        <span>{a.followups}</span>
        <Icon name="chevron" />
      </button>
      {open && (
        <ul>
          {list.map((q) => (
            <li key={q}>
              <button type="button" onClick={() => onPick(q)} dir="auto">
                <Icon name="sparkle" size={13} />
                <span>{q}</span>
                <Icon name="arrowDown" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Corps d'une réponse terminée : titre, contenu, cartes, exports */
function AnswerBody({ t, act, inCanvas }: { t: Turn; act: Actions; inCanvas?: boolean }) {
  return (
    <>
      <TitleCard t={t} act={act} inCanvas={inCanvas} />
      {t.kind === 'ask' ? <Markdown blocks={parseMd(t.answer || '')} sources={t.sources ?? []} /> : <AgentReport t={t} />}
      <ArticleCards sources={t.sources ?? []} />
      <AnswerTools t={t} act={act} />
    </>
  )
}

function TurnView({ t, last, act, compact }: { t: Turn; last: boolean; act: Actions; compact?: boolean }) {
  const a = useAround()
  return (
    <div className="around-turn">
      <p className="around-q" dir="auto">
        {t.agent && (
          <span className="around-q__agent">
            <Icon name={t.agent} size={14} /> {a.agentTitle[t.agent]}
          </span>
        )}
        {t.q}
      </p>
      <div className="around-a">
        <p className="around-a__who">
          <Logo size={26} /> Around
        </p>
        {t.kind === 'agent' && (t.status === 'confirm' || t.status === 'cancelled') ? (
          <ConfirmCard t={t} act={act} />
        ) : t.status === 'running' ? (
          t.kind === 'agent' ? (
            <AgentSteps />
          ) : (
            <Thinking />
          )
        ) : t.status === 'error' ? (
          <div className="around-error">
            <p>{t.error || a.aiError}</p>
            <button type="button" className="around-btn around-btn--sm" onClick={() => act.onRetry(t)}>
              <Icon name="refresh" size={15} /> {a.regenerate}
            </button>
          </div>
        ) : t.empty ? (
          <p className="around-muted">{a.empty}</p>
        ) : compact ? (
          <button type="button" className="around-mini" onClick={() => act.onCanvas(t)}>
            <Icon name={t.agent || 'sparkle'} size={16} />
            <span dir="auto">{turnTitle(t, a)}</span>
            <Icon name="canvas" size={15} />
          </button>
        ) : (
          <AnswerBody t={t} act={act} />
        )}
        {last && t.status === 'done' && <FollowUps list={t.followups ?? []} onPick={act.onFollow} />}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- pages : accueil, bibliothèque, historique */

function AgentCards({ onPick }: { onPick: (id: AgentId) => void }) {
  const a = useAround()
  return (
    <div className="around-grid around-grid--agents">
      {AGENT_ORDER.map((id) => {
        const d = a.agentDefs.find((x) => x.id === id)!
        return (
          <button key={id} type="button" className="around-agent" onClick={() => onPick(id)}>
            <span className="around-agent__icon">
              <Icon name={id} size={20} />
            </span>
            <span>
              <strong>{d.title}</strong>
              <small>{d.desc}</small>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function PromptCard({ id, fav, onFav, onUse }: { id: string; fav: boolean; onFav: () => void; onUse: () => void }) {
  const a = useAround()
  const d = a.library.find((x) => x.id === id)!
  const [info, setInfo] = useState(false)
  return (
    <div className="around-prompt" role="button" tabIndex={0} onClick={onUse} onKeyDown={(e) => e.key === 'Enter' && onUse()}>
      <strong>{d.title}</strong>
      <p className={info ? 'is-open' : ''}>{info ? `${d.desc} — « ${d.text} »` : d.desc}</p>
      <div className="around-prompt__foot">
        <button
          type="button"
          className={fav ? 'is-fav' : ''}
          aria-label={a.favorites}
          aria-pressed={fav}
          onClick={(e) => {
            e.stopPropagation()
            onFav()
          }}
        >
          <Icon name={fav ? 'star' : 'starOff'} />
        </button>
        <button
          type="button"
          aria-label={a.about}
          title={a.about}
          onClick={(e) => {
            e.stopPropagation()
            setInfo((v) => !v)
          }}
        >
          <Icon name="info" />
        </button>
      </div>
    </div>
  )
}

function Library({ favs, toggleFav, onUse, onBack }: { favs: string[]; toggleFav: (id: string) => void; onUse: (text: string) => void; onBack: () => void }) {
  const a = useAround()
  const i = useI18n()
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const list = a.library.filter((p) => (cat === 'all' || p.cat === cat) && (!q || `${p.title} ${p.desc}`.toLowerCase().includes(q.toLowerCase())))
  return (
    <div className="around-library">
      <header className="around-bar">
        <button type="button" className="around-icon-btn" onClick={onBack} aria-label={a.back}>
          <Icon name="back" flip={i.dir === 'rtl'} />
        </button>
        <h2>{a.libraryTitle}</h2>
      </header>
      <p className="around-muted around-library__intro">{a.libraryIntro}</p>
      <div className="around-library__tools">
        <div className="around-tabs" role="tablist">
          {Object.entries(a.cats).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={cat === k} className={cat === k ? 'is-on' : ''} onClick={() => setCat(k)}>
              {label}
            </button>
          ))}
        </div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={a.search} aria-label={a.search} dir="auto" />
      </div>
      <div className="around-grid around-grid--prompts">
        {list.map((p) => (
          <PromptCard key={p.id} id={p.id} fav={favs.includes(p.id)} onFav={() => toggleFav(p.id)} onUse={() => onUse(p.text)} />
        ))}
      </div>
    </div>
  )
}

function HistoryPanel({ email, currentId, onOpen, onClose }: { email: string; currentId: string; onOpen: (c: Conversation) => void; onClose: () => void }) {
  const a = useAround()
  const i = useI18n()
  const [list, setList] = useState(() => readHistory(email))
  const today = new Date().toISOString().slice(0, 10)
  const groups: [string, Conversation[]][] = [
    [a.today, list.filter((c) => c.at.slice(0, 10) === today)],
    [a.earlier, list.filter((c) => c.at.slice(0, 10) !== today)],
  ]
  return (
    <div className="around-drawer" role="dialog" aria-label={a.history}>
      <button type="button" className="around-drawer__shade" aria-label={a.back} onClick={onClose} />
      <aside className="around-drawer__panel">
        <header>
          <h3>
            <Icon name="history" /> {a.history}
          </h3>
          <button type="button" className="around-icon-btn" onClick={onClose} aria-label={a.back}>
            <Icon name="close" />
          </button>
        </header>
        {!list.length && <p className="around-muted">{a.noHistory}</p>}
        {groups.map(
          ([label, items]) =>
            items.length > 0 && (
              <section key={label}>
                <h4>{label}</h4>
                <ul>
                  {items.map((c) => (
                    <li key={c.id} className={c.id === currentId ? 'is-on' : ''}>
                      <button type="button" onClick={() => onOpen(c)}>
                        <span dir="auto">{c.title}</span>
                        <small>
                          {i.dateTime(c.at)} · {c.turns.length}
                        </small>
                      </button>
                      <button
                        type="button"
                        className="around-icon-btn"
                        aria-label={a.remove}
                        title={a.remove}
                        onClick={() => {
                          removeConversation(email, c.id)
                          setList(readHistory(email))
                        }}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ),
        )}
      </aside>
    </div>
  )
}

/* ---------------------------------------------------------------- page Around */

const newConv = (): Conversation => ({ id: uid(), title: '', at: new Date().toISOString(), turns: [] })

export function Around({ flux }: { flux: Flux | '' }) {
  const i = useI18n()
  const a = useAround()
  const auth = useAuth()
  const email = auth?.user.email || 'local'
  const name = auth?.user.name || email.split('@')[0]
  const { data: watchData } = useFetch<{ watches: { id: string; name: string }[] }>('/api/news/watches', 0)
  const watches = watchData?.watches ?? []

  const [page, setPage] = useState<'home' | 'library'>('home')
  const [mode, setMode] = useState<'thread' | 'canvas'>('thread')
  const [conv, setConv] = useState<Conversation>(newConv)
  const [canvasId, setCanvasId] = useState('')
  const [draft, setDraft] = useState('')
  const [agent, setAgent] = useState<AgentId | null>(null)
  const [days, setDays] = useState(30)
  const [watch, setWatch] = useState('')
  const [tab, setTab] = useState<'agents' | 'favorites'>('agents')
  const [favs, setFavs] = useState(readFavorites)
  const [historyOpen, setHistoryOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const convRef = useRef(conv)
  convRef.current = conv

  const busy = conv.turns.some((t) => t.status === 'running')
  const inChat = conv.turns.length > 0
  const watchName = watches.find((w) => w.id === watch)?.name || ''

  // Accolades obligatoires : scrollIntoView peut renvoyer une promesse, que React prendrait pour un nettoyage
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [conv.turns.length, mode])

  // Historique : la conversation est gardée sur ce poste à chaque réponse
  useEffect(() => {
    if (conv.turns.some((t) => t.status === 'done' || t.status === 'confirm')) saveConversation(email, conv)
  }, [conv, email])

  const patch = (id: string, change: Partial<Turn>) =>
    setConv((c) => {
      const turns = c.turns.map((t) => (t.id === id ? { ...t, ...change } : t))
      const first = turns.find((t) => t.status === 'done')
      return { ...c, turns, title: c.title || (first ? turnTitle(first, a) : turns[0]?.q || '') }
    })

  const errorOf = (err: unknown) => {
    const code = (err as { code?: string }).code
    return code === 'NO_KEY' ? a.aiOff : code === 'BUSY' ? a.busy : a.aiError
  }

  async function runAsk(t: Turn, regen = false) {
    const history = convRef.current.turns
      .filter((x) => x.id !== t.id && x.status === 'done')
      .map((x) => ({ q: x.q, a: x.kind === 'ask' ? x.answer || '' : `${x.summary || ''}` }))
    try {
      const r = await postJson<{ title: string; answer: string; sources: Source[]; followups: string[]; considered: number }>('/api/ai/ask', {
        question: t.q,
        history,
        days: t.days,
        watch: t.watch,
        flux,
        regen,
      })
      patch(t.id, { status: 'done', title: r.title, answer: r.answer, sources: r.sources, followups: r.followups, considered: r.considered, at: new Date().toISOString() })
    } catch (err) {
      patch(t.id, { status: 'error', error: errorOf(err) })
    }
  }

  async function runAgent(t: Turn, regen = false) {
    try {
      const r = await postJson<{
        empty?: boolean
        title: string
        summary: string
        sections: Turn['sections']
        recommendations: string[]
        followups: string[]
        sources: Source[]
        stats: AgentStats
        considered: number
      }>('/api/ai/agent', { agent: t.agent, subject: t.subject, days: t.days, watch: t.watch, flux, lang: i.lang, regen })
      patch(t.id, { status: 'done', ...r, at: new Date().toISOString() })
    } catch (err) {
      patch(t.id, { status: 'error', error: errorOf(err) })
    }
  }

  function send(text = draft) {
    const q = text.trim()
    if (busy || (!q && !agent)) return
    const base = { id: uid(), days, watch, watchName, at: new Date().toISOString() }
    setPage('home')
    setDraft('')
    if (agent) {
      const def = a.agentDefs.find((x) => x.id === agent)!
      const t: Turn = { ...base, kind: 'agent', agent, subject: q, q: `${def.title} : ${q || a.allSubject}`, status: 'confirm' }
      setConv((c) => ({ ...c, turns: [...c.turns, t] }))
      setAgent(null)
      return
    }
    const t: Turn = { ...base, kind: 'ask', q, status: 'running' }
    setConv((c) => ({ ...c, turns: [...c.turns, t] }))
    runAsk(t)
  }

  const act: Actions = {
    onConfirm: (t) => {
      patch(t.id, { status: 'running' })
      runAgent(t)
    },
    onEdit: (t) => {
      patch(t.id, { status: 'cancelled' })
      setAgent(t.agent ?? null)
      setDraft(t.subject || '')
      setDays(t.days)
      setWatch(t.watch)
      setTimeout(() => inputRef.current?.focus(), 50)
    },
    onRetry: (t) => {
      if (busy) return
      patch(t.id, { status: 'running', error: '', rating: undefined })
      if (t.kind === 'agent') runAgent(t, true)
      else runAsk(t, true)
    },
    onFollow: (q) => send(q),
    onRate: (t, r) => {
      patch(t.id, { rating: r })
      fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating: r === 1 ? 5 : 1, comment: `Around : ${t.q}` }),
      }).catch(() => {})
    },
    onCanvas: (t) => {
      setCanvasId(t.id)
      setMode('canvas')
    },
  }

  function applyPrompt(text: string) {
    setPage('home')
    setAgent(null)
    setDraft(text)
    // Sélectionne le premier [champ à remplir] pour le remplacer en tapant
    setTimeout(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      const start = text.indexOf('[')
      const stop = text.indexOf(']', start)
      if (start >= 0 && stop > start) el.setSelectionRange(start, stop + 1)
    }, 60)
  }

  function pickAgent(id: AgentId) {
    setAgent(id)
    setDraft('')
    setTimeout(() => inputRef.current?.focus(), 60)
  }

  function reset() {
    setConv(newConv())
    setMode('thread')
    setCanvasId('')
    setAgent(null)
    setDraft('')
  }

  const toggleFav = (id: string) =>
    setFavs((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id]
      saveFavorites(next)
      return next
    })

  const composer = (compact?: boolean) => (
    <Composer
      draft={draft}
      setDraft={setDraft}
      agent={agent}
      setAgent={setAgent}
      days={days}
      setDays={setDays}
      watch={watch}
      setWatch={setWatch}
      watches={watches}
      busy={busy}
      onSend={() => send()}
      inputRef={inputRef}
      compact={compact}
    />
  )

  const topLinks = (
    <div className="around-links">
      <button type="button" onClick={() => setPage('library')}>
        <Icon name="prompts" /> {a.prompts}
      </button>
      <button type="button" onClick={() => setHistoryOpen(true)}>
        <Icon name="history" /> {a.history}
      </button>
    </div>
  )

  const done = conv.turns.filter((t) => t.status === 'done' && !t.empty)
  const canvasTurn = done.find((t) => t.id === canvasId) || done[done.length - 1]
  const hello = a.hello(name)

  let body: ReactNode
  if (page === 'library') {
    body = <Library favs={favs} toggleFav={toggleFav} onUse={applyPrompt} onBack={() => setPage('home')} />
  } else if (!inChat) {
    body = (
      <div className="around-home">
        {topLinks}
        <div className="around-hello">
          <Logo size={88} />
          <h2>
            <b>{hello[0]}</b>
            {hello[1]}
          </h2>
        </div>
        {composer()}
        <div className="around-home__tabs">
          <div className="around-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'agents'} className={tab === 'agents' ? 'is-on' : ''} onClick={() => setTab('agents')}>
              {a.agents}
              <span className="around-info" title={a.agentsInfo}>
                <Icon name="info" size={15} />
              </span>
            </button>
            <button type="button" role="tab" aria-selected={tab === 'favorites'} className={tab === 'favorites' ? 'is-on' : ''} onClick={() => setTab('favorites')}>
              {a.favorites}
            </button>
          </div>
          <button type="button" className="around-browse" onClick={() => setPage('library')}>
            {a.browseAll} <Icon name="back" size={16} flip={i.dir === 'ltr'} />
          </button>
        </div>
        {tab === 'agents' ? (
          <AgentCards onPick={pickAgent} />
        ) : favs.length ? (
          <div className="around-grid around-grid--prompts">
            {favs
              .filter((id) => a.library.some((p) => p.id === id))
              .map((id) => (
                <PromptCard key={id} id={id} fav onFav={() => toggleFav(id)} onUse={() => applyPrompt(a.library.find((p) => p.id === id)!.text)} />
              ))}
          </div>
        ) : (
          <p className="around-muted">{a.noFavorites}</p>
        )}
      </div>
    )
  } else {
    const turns = conv.turns
    body = (
      <div className={`around-chat around-chat--${mode}`}>
        <header className="around-bar around-bar--chat">
          <button type="button" className="around-icon-btn" onClick={reset} aria-label={a.back} title={a.back}>
            <Icon name="back" flip={i.dir === 'rtl'} />
          </button>
          <h2 dir="auto">{conv.title || turns[0]?.q}</h2>
          <div className="around-seg" role="tablist">
            <button type="button" className={mode === 'thread' ? 'is-on' : ''} onClick={() => setMode('thread')}>
              <Icon name="thread" /> {a.thread}
            </button>
            <button type="button" className={mode === 'canvas' ? 'is-on' : ''} disabled={!done.length} onClick={() => setMode('canvas')}>
              <Icon name="canvas" /> {a.canvas}
            </button>
          </div>
          <button type="button" className="around-link" onClick={reset}>
            <Icon name="newchat" /> {a.newChat}
          </button>
          <button type="button" className="around-icon-btn" onClick={() => setHistoryOpen(true)} aria-label={a.history} title={a.history}>
            <Icon name="history" />
          </button>
          <button type="button" className="around-icon-btn" onClick={() => setPage('library')} aria-label={a.prompts} title={a.prompts}>
            <Icon name="prompts" />
          </button>
        </header>
        <div className="around-chat__body">
          <div className="around-chat__thread">
            <div className="around-log">
              {turns.map((t, k) => (
                <TurnView key={t.id} t={t} last={k === turns.length - 1} act={act} compact={mode === 'canvas'} />
              ))}
              <div ref={end} />
            </div>
            <div className="around-chat__input">
              {composer(true)}
              <p className="around-disclaimer">{a.disclaimer}</p>
            </div>
          </div>
          {mode === 'canvas' && canvasTurn && (
            <article className="around-canvas" key={canvasTurn.id}>
              <AnswerBody t={canvasTurn} act={act} inCanvas />
            </article>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="around" dir={i.dir}>
      {body}
      {historyOpen && (
        <HistoryPanel
          email={email}
          currentId={conv.id}
          onClose={() => setHistoryOpen(false)}
          onOpen={(c) => {
            setConv(c)
            setPage('home')
            setMode('thread')
            setHistoryOpen(false)
          }}
        />
      )}
    </div>
  )
}

