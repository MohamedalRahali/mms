import { useEffect, useRef, useState, type ReactNode } from 'react'
import { type Health, type NewsItem, type NewsResponse, type Stats, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { useFavorites, useLastSeen } from '../lib/prefs'
import { HEART } from './NewsCard'
import { canDo, useAuth } from '../lib/auth'

/** Icônes de la barre noire, comme NewsBoard : notifications, favoris, présentation, historique, menu, annonces */

const PATHS = {
  bell: 'M12 22a2.5 2.5 0 0 0 2.4-2h-4.8a2.5 2.5 0 0 0 2.4 2zm7-6V11a7 7 0 0 0-5.5-6.8V3a1.5 1.5 0 0 0-3 0v1.2A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z',
  heart: HEART,
  screen: 'M3 4h18v12H3V4zm2 2v8h14V6H5zm3 12h8v2H8v-2z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-1 3v6l5 3 1-1.7-4-2.4V7h-2z',
  dots: 'M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  megaphone: 'M3 10v4h3l6 4V6L6 10H3zm13.5 2A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z',
}

export function ToolIcon({ name, size = 26 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path d={PATHS[name]} fill="currentColor" />
    </svg>
  )
}

/** Bouton d'icône avec panneau déroulant ; se ferme au clic dehors ou avec Échap */
function Drop({ icon, label, badge, children }: { icon: keyof typeof PATHS; label: string; badge?: number; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="mms-tool" ref={ref}>
      <button type="button" className="mms-tool__btn" title={label} aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        <ToolIcon name={icon} />
        {!!badge && <span className="mms-tool__badge">{badge > 99 ? '99+' : badge}</span>}
      </button>
      {open && (
        <div className="mms-pop" role="dialog" aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

// onFavorites / onDay absents : favoris ou revue du jour fermés par le profil du compte, leurs boutons sont masqués
export function Toolbar(props: { onFavorites?: () => void; onPresent: () => void; onDay?: (day: string) => void; onRefresh: () => void; onLang: () => void }) {
  const i = useI18n()
  const mayPrint = canDo(useAuth()?.user, 'export')
  const { t } = i
  const fav = useFavorites()
  const [seen, setSeen] = useLastSeen()
  const latest = useFetch<NewsResponse>('/api/news?size=30').data
  const stats = useFetch<Stats>('/api/news/stats?days=30').data
  const health = useFetch<Health>('/api/health').data

  // Premier passage : tout ce qui existe déjà compte comme lu
  useEffect(() => {
    if (seen === null && latest) setSeen(new Date().toISOString())
  }, [seen, latest, setSeen])
  const fresh: NewsItem[] = seen ? (latest?.items ?? []).filter((it) => Date.parse(it.date) > Date.parse(seen)) : []
  const days = [...(stats?.perDay ?? [])].filter((d) => d.count > 0).reverse()

  return (
    <div className="mms-tools" dir={i.dir}>
      <Drop icon="bell" label={t.toolNotifications} badge={fresh.length}>
        {(close) => (
          <>
            <p className="mms-pop__title">{fresh.length ? t.notifNew(fresh.length) : t.notifEmpty}</p>
            <ul className="mms-pop__list">
              {fresh.slice(0, 8).map((it) => (
                <li key={it.id}>
                  <b dir="auto">{it.title}</b>
                  <small>
                    {i.flux(it.flux)} · {i.dateTime(it.date)}
                  </small>
                </li>
              ))}
            </ul>
            {fresh.length > 0 && (
              <button
                type="button"
                className="news-btn news-btn--ghost"
                onClick={() => {
                  setSeen(new Date().toISOString())
                  close()
                }}
              >
                {t.markRead}
              </button>
            )}
          </>
        )}
      </Drop>
      {props.onFavorites && (
        <button type="button" className="mms-tool__btn" title={t.toolFavorites} aria-label={t.toolFavorites} onClick={props.onFavorites}>
          <ToolIcon name="heart" />
          {fav.list.length > 0 && <span className="mms-tool__badge mms-tool__badge--soft">{fav.list.length}</span>}
        </button>
      )}
      <button type="button" className="mms-tool__btn" title={t.toolPresent} aria-label={t.toolPresent} onClick={props.onPresent}>
        <ToolIcon name="screen" />
      </button>
      {props.onDay && (
      <Drop icon="clock" label={t.toolHistory}>
        {(close) => (
          <>
            <p className="mms-pop__title">{t.historyTitle}</p>
            <ul className="mms-pop__list mms-pop__list--links">
              {days.length === 0 && <li>{t.noData}</li>}
              {days.map((d) => (
                <li key={d.date}>
                  <button
                    type="button"
                    onClick={() => {
                      props.onDay?.(d.date)
                      close()
                    }}
                  >
                    <span>{i.dayLong(d.date)}</span>
                    <small>{t.historyItems(d.count)}</small>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Drop>
      )}
      <Drop icon="dots" label={t.toolMenu}>
        {(close) => (
          <ul className="mms-pop__list mms-pop__list--links">
            {[
              [t.menuRefresh, props.onRefresh],
              ...(mayPrint ? [[t.menuPrint, () => window.print()]] : []),
              [t.menuFullscreen, () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})],
              [t.translatePage, props.onLang],
            ].map(([label, run]) => (
              <li key={label as string}>
                <button
                  type="button"
                  onClick={() => {
                    close()
                    ;(run as () => void)()
                  }}
                >
                  <span>{label as string}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Drop>
      <Drop icon="megaphone" label={t.toolNews}>
        {() => (
          <>
            <p className="mms-pop__title">{t.newsTitle}</p>
            <ul className="mms-pop__list">
              <li>{t.newsRefresh}</li>
              <li>{health?.ai ? t.newsAiOn : t.newsAiOff}</li>
              {health?.demo && <li>{t.newsDemo}</li>}
              {health?.sources.find((s) => s.flux === 'libye')?.count === 0 && <li>{t.newsLibyeEmpty}</li>}
            </ul>
          </>
        )}
      </Drop>
    </div>
  )
}
