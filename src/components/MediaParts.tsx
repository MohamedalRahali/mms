import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { type NewsItem } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { MEDIA_ICON, type MediaIconName, useMedia } from '../lib/media'
import { EngagementChips } from './Engagement'
import { ToneBadge } from './Intel'
import './media.css'

/** Parties de la carte propres aux types de médias : badge, transcription, commentaires, fil de forum */

export function MediaIcon({ name, size = 16 }: { name: MediaIconName; size?: number }) {
  return (
    <svg className="mms-mi" viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path d={MEDIA_ICON[name]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function MediaBadge({ item }: { item: NewsItem }) {
  const m = useMedia()
  if (!item.media) return null
  const sub = item.media === 'broadcast' && item.subType ? m.subTypes[item.subType] : ''
  const icon = (sub && item.subType && item.subType in MEDIA_ICON ? item.subType : item.media) as MediaIconName
  return (
    <span className={`mms-media mms-media--${item.media}`}>
      <MediaIcon name={icon} size={13} />
      {m.badge[item.media]}
      {sub && ` · ${sub}`}
    </span>
  )
}

export type MediaOption = { value: string; label: string; icon: MediaIconName; count?: number }

/** Liste déroulante à pictogrammes (bouton + listbox) : remplace un <select>, qui ne peut pas afficher d'icônes */
export function MediaSelect({
  value,
  options,
  onChange,
  label,
  current,
  className = '',
}: {
  value: string
  options: MediaOption[]
  onChange: (value: string) => void
  label: string
  /** Texte du bouton ; par défaut le libellé de l'option choisie */
  current?: string
  className?: string
}) {
  const i = useI18n()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const selected = options[index]

  useEffect(() => {
    if (!open) return
    list.current?.focus()
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  useEffect(() => {
    if (open) list.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function show(at = index) {
    setActive(at)
    setOpen(true)
  }
  function pick(at: number) {
    setOpen(false)
    btn.current?.focus()
    if (options[at] && options[at].value !== value) onChange(options[at].value)
  }
  function onButtonKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      show()
    }
  }
  function onListKey(e: KeyboardEvent) {
    const last = options.length - 1
    const moves: Record<string, number> = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last, PageDown: last, PageUp: 0 }
    if (e.key in moves) {
      e.preventDefault()
      setActive(moves[e.key])
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(active)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      btn.current?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    } else if (e.key.length === 1) {
      const key = e.key.toLocaleLowerCase()
      const from = [...options.slice(active + 1), ...options.slice(0, active + 1)]
      const hit = from.find((o) => o.label.toLocaleLowerCase().startsWith(key))
      if (hit) setActive(options.indexOf(hit))
    }
  }

  return (
    <div className="mms-msel" ref={box}>
      <button
        ref={btn}
        type="button"
        className={`mms-msel__btn ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={selected && selected.label !== label ? `${label}: ${selected.label}` : label}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onButtonKey}
      >
        {selected && <MediaIcon name={selected.icon} />}
        <span className="mms-msel__text">{current ?? selected?.label}</span>
        <svg className="mms-msel__caret" viewBox="0 0 24 24" width="14" height="14" aria-hidden>
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          className="mms-msel__list"
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
        >
          {options.map((o, n) => (
            <li
              key={o.value}
              id={`${id}-${n}`}
              role="option"
              aria-selected={o.value === value}
              className={`mms-msel__opt${n === active ? ' is-active' : ''}${o.value === value ? ' is-on' : ''}`}
              onPointerEnter={() => setActive(n)}
              onClick={() => pick(n)}
            >
              <span className={`mms-msel__ico mms-media--${o.icon}`}>
                <MediaIcon name={o.icon} size={17} />
              </span>
              <span className="mms-msel__label">{o.label}</span>
              {!!o.count && <span className="mms-msel__count">{i.num(o.count)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Au-dessus du titre : publication commentée, ou chemin Forum › Sujet */
export function MediaContext({ item }: { item: NewsItem }) {
  const m = useMedia()
  if (item.media === 'comment' && item.parent?.title) {
    return (
      <p className="mms-crumb">
        {m.commentOn}{' '}
        {item.parent.url ? (
          <a href={item.parent.url} target="_blank" rel="noopener noreferrer" dir="auto">
            {item.parent.title}
          </a>
        ) : (
          <span dir="auto">{item.parent.title}</span>
        )}
      </p>
    )
  }
  if (item.media === 'forum' && item.thread && (item.thread.forum || item.thread.topic)) {
    return (
      <p className="mms-crumb">
        <span dir="auto">{item.thread.forum}</span>
        {item.thread.topic && item.thread.topic !== item.title && (
          <>
            <span className="mms-crumb__sep" aria-hidden>
              ›
            </span>
            {item.thread.topicUrl ? (
              <a href={item.thread.topicUrl} target="_blank" rel="noopener noreferrer" dir="auto">
                {item.thread.topic}
              </a>
            ) : (
              <span dir="auto">{item.thread.topic}</span>
            )}
          </>
        )}
      </p>
    )
  }
  return null
}

/** Émissions et podcasts : lecteur ou lien vers l'original, et transcription dépliable */
export function MediaTranscript({ item }: { item: NewsItem }) {
  const m = useMedia()
  if (item.media !== 'broadcast' && item.media !== 'podcast') return null
  const audio = item.media === 'podcast' && item.mediaUrl && !/youtube\.com|youtu\.be/.test(item.mediaUrl)
  const link = item.mediaUrl && /^https?:/.test(item.mediaUrl) ? item.mediaUrl : ''
  if (!item.transcription && !link) return null
  return (
    <div className="mms-transcript">
      {audio && <audio controls preload="none" src={item.mediaUrl} />}
      {link && !audio && (
        <a className="mms-transcript__orig" href={link} target="_blank" rel="noopener noreferrer">
          {/youtube\.com|youtu\.be/.test(link) ? m.watch : m.original}
        </a>
      )}
      {item.transcription && (
        <details>
          <summary>{m.transcript}</summary>
          <p dir="auto">{item.transcription}</p>
        </details>
      )}
    </div>
  )
}

/** Commentaires d'une publication, ou fil de discussion d'un message de forum (réponses en retrait) */
export function MediaReactions({ item }: { item: NewsItem }) {
  const i = useI18n()
  const m = useMedia()
  const list = item.reactions ?? []
  if (!list.length) return null
  const forum = item.media === 'forum'
  const label = forum ? `${m.thread} · ${m.replies(list.length)}` : m.comments(item.comments ?? list.length)
  return (
    <details className="mms-reactions">
      <summary>{label}</summary>
      <ul>
        {list.map((r) => (
          <li key={r.id} className={r.id === item.id ? 'is-self' : undefined} style={{ marginInlineStart: `${r.depth * 1.4}rem` }}>
            <p className="mms-reactions__head">
              <b dir="auto">{r.author}</b>
              <span>{i.dateTime(r.date)}</span>
              <ToneBadge tone={r.tone} />
            </p>
            <p className="mms-reactions__text" dir="auto">
              {r.text}
            </p>
            <EngagementChips value={r.engagement} />
          </li>
        ))}
      </ul>
    </details>
  )
}
