import { type Engagement } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { compact, usePro } from '../lib/pro'

/** Portée et engagement d'un post : vues, réactions, partages, commentaires */

const ENG_ICON: Record<keyof Engagement, string> = {
  views: 'M12 5C6.5 5 2.7 9.4 1.5 12c1.2 2.6 5 7 10.5 7s9.3-4.4 10.5-7C21.3 9.4 17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z',
  reactions: 'M12 21s-7.5-4.6-9.6-9.3C1 8.4 3 5 6.4 5c2 0 3.3 1 4.1 2.2h3C14.3 6 15.6 5 17.6 5 21 5 23 8.4 21.6 11.7 19.5 16.4 12 21 12 21z',
  shares: 'M18 16a3 3 0 0 0-2.4 1.2l-6.8-3.4a3 3 0 0 0 0-1.6l6.8-3.4A3 3 0 1 0 15 7l-6.8 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1z',
  comments: 'M4 4h16v12H7l-3 3V4z',
}

export function EngagementChips({ value }: { value?: Engagement }) {
  const i = useI18n()
  const p = usePro()
  if (!value) return null
  const keys = (['views', 'reactions', 'shares', 'comments'] as const).filter((k) => value[k] != null)
  if (!keys.length) return null
  return (
    <p className="mms-eng">
      {keys.map((k) => (
        <span key={k} title={`${i.num(value[k]!)} ${p[k]}`}>
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
            <path d={ENG_ICON[k]} fill="currentColor" />
          </svg>
          {compact(value[k]!, i.lang)}
        </span>
      ))}
    </p>
  )
}
