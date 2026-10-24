import { type NewsItem } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { useMedia } from '../lib/media'
import { EngagementChips } from './Engagement'
import { ToneBadge } from './Intel'

/** Parties de la carte propres aux types de médias : badge, transcription, commentaires, fil de forum */

export function MediaBadge({ item }: { item: NewsItem }) {
  const m = useMedia()
  if (!item.media) return null
  const sub = item.media === 'broadcast' && item.subType ? m.subTypes[item.subType] : ''
  return (
    <span className={`mms-media mms-media--${item.media}`}>
      {m.badge[item.media]}
      {sub && ` · ${sub}`}
    </span>
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
