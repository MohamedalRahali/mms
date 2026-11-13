import type { Copy, TourKey } from './copy'

/* ---------------------------------------------------------------- icônes */

export const ICONS: Record<string, string> = {
  tv: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm1 2v8h14V8H5zm4 12h6v2H9z M8 2l4 3 4-3',
  radio: 'M5 8h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zm3 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm6 1h4v1.5h-4zm0 3h4v1.5h-4zM6 7 17 3l.6 1.5L8.5 8z',
  web: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15 15 0 0 0-1.3-4 8 8 0 0 1 4.3 4zM12 4c.8 1 1.6 2.4 2 4h-4c.4-1.6 1.2-3 2-4zM4.3 14a8 8 0 0 1 0-4h3.4a16 16 0 0 0 0 4H4.3zm.8 2h3a15 15 0 0 0 1.3 4 8 8 0 0 1-4.3-4zm3-8h-3a8 8 0 0 1 4.3-4 15 15 0 0 0-1.3 4zM12 20c-.8-1-1.6-2.4-2-4h4c-.4 1.6-1.2 3-2 4zm2.3-6H9.7a14 14 0 0 1 0-4h4.6a14 14 0 0 1 0 4zm.3 6a15 15 0 0 0 1.3-4h3a8 8 0 0 1-4.3 4zm1.7-6a16 16 0 0 0 0-4h3.4a8 8 0 0 1 0 4h-3.4z',
  social: 'M17 3a3 3 0 1 1-2.8 4.1L9.8 9.3a3 3 0 0 1 0 1.4l4.4 2.2A3 3 0 1 1 13.6 15l-4.4-2.2a3 3 0 1 1 0-3.6l4.4-2.2A3 3 0 0 1 17 3z',
  video: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6zm7 3v6l5-3-5-3z',
  print: 'M5 3h10l4 4v14H5V3zm2 5v2h10V8H7zm0 4v2h10v-2H7zm0 4v2h6v-2H7z',
  podcast: 'M12 2a6 6 0 0 1 6 6c0 2.4-1.4 4.4-3.4 5.4l-.6-1.8A4 4 0 1 0 10 11.6l-.6 1.8A6 6 0 0 1 12 2zm0 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-1 6h2l1 10h-4z',
  forum: 'M3 4h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8l-4 3v-3H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm16 4h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-1v3l-4-3h-6a1 1 0 0 1-1-1v-1h9a1 1 0 0 0 1-1V8z',
  check: 'M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z',
  shield: 'M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3zm-1 14-4-4 1.4-1.4 2.6 2.6 5.6-5.6L18 9l-7 7z',
  gov: 'M12 2 2 7v2h20V7L12 2zM4 10v7h3v-7H4zm6.5 0v7h3v-7h-3zM17 10v7h3v-7h-3zM2 19v3h20v-3H2z',
  pr: 'M3 10v4h3l5 4V6L6 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z',
  brands: 'M12 2 3 6v6c0 5.5 3.8 10 9 11 5.2-1 9-5.5 9-11V6l-9-4zm0 5 1.6 3.3 3.6.5-2.6 2.5.6 3.6L12 15.2l-3.2 1.7.6-3.6-2.6-2.5 3.6-.5L12 7z',
  media: 'M4 4h16v12H4zM2 18h20v2H2zm5-11v6l5-3-5-3zm7 0h4v2h-4zm0 4h4v2h-4z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
  spark: 'M12 2l1.8 4.7L18.5 8.5l-4.7 1.8L12 15l-1.8-4.7L5.5 8.5l4.7-1.8L12 2zm6 11l.9 2.4 2.4.9-2.4.9L18 20.6l-.9-2.4-2.4-.9 2.4-.9L18 13zM6 14l.7 1.8 1.8.7-1.8.7L6 19l-.7-1.8-1.8-.7 1.8-.7L6 14z',
  doc: 'M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM8 12h10v1.6H8zm0 3.5h10v1.6H8zm0 3.5h6v1.6H8z',
  chart: 'M5 9h3v11H5zm5.5-5h3v16h-3zM16 13h3v7h-3z',
  bell: 'M12 22a2.5 2.5 0 0 0 2.4-2h-4.8a2.5 2.5 0 0 0 2.4 2zm7-6V11a7 7 0 0 0-5.5-6.8V3a1.5 1.5 0 0 0-3 0v1.2A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z',
  search: 'M10 2a8 8 0 0 1 6.3 12.9l5.4 5.4-1.4 1.4-5.4-5.4A8 8 0 1 1 10 2zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12z',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 17.9A8 8 0 0 1 4.1 11H7c.1 3.3 1.5 6.4 4 8.9zM7 9H4.1A8 8 0 0 1 11 4.1C8.6 6.6 7.2 9.7 7 9zm6 10.9c2.5-2.5 3.9-5.6 4-8.9h2.9a8 8 0 0 1-6.9 8.9zM17 9c-.2-.7-1.6-2.4-4-4.9A8 8 0 0 1 19.9 9H17zM9 11h6c-.2 2.8-1.3 5.4-3 7.4-1.7-2-2.8-4.6-3-7.4zm0-2c.2-2.8 1.3-5.4 3-7.4 1.7 2 2.8 4.6 3 7.4H9z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM1 21v-2c0-3 4-5 8-5s8 2 8 5v2H1zm17 0v-2c0-1.5-.7-2.8-2-3.8 3 .4 6 1.8 6 3.8v2h-4z',
  lock: 'M6 10V8a6 6 0 1 1 12 0v2h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h1zm2 0h8V8a4 4 0 1 0-8 0v2zm4 4a2 2 0 0 0-1 3.7V19h2v-1.3a2 2 0 0 0-1-3.7z',
  arrow: 'M5 11h11.2l-4.6-4.6L13 5l7 7-7 7-1.4-1.4 4.6-4.6H5z',
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  book: 'M4 4a2 2 0 0 1 2-2h13v18H6a1 1 0 0 0 0 2h13v-2h1v4H6a3 3 0 0 1-3-3V4h1zm3 1v2h9V5H7zm0 4v2h7V9H7z',
  layers: 'M12 2 2 7l10 5 10-5-10-5zm-8.2 9L2 12l10 5 10-5-1.8-1L12 15 3.8 11zm0 5L2 17l10 5 10-5-1.8-1L12 20l-8.2-4z',
  plug: 'M7 2h2v5h6V2h2v5h2v4a7 7 0 0 1-6 6.9V22h-2v-4.1A7 7 0 0 1 5 11V7h2V2z',
  target: 'M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2zm0 4a6 6 0 1 0 6 6h-2a4 4 0 1 1-4-4V6zm0 4a2 2 0 1 0 2 2h-2v-2zm7-8 1 3 3 1-3.5 3.5-2.4-.6L12.7 12.3l-1-1 4.4-4.4-.6-2.4L19 1z',
  trend: 'M3 17.6 9.3 11.3l4 4L19.6 9H16V7h7v7h-2v-3.6l-7.7 7.7-4-4L4.4 19z',
  language: 'M3 4h10v2h-4c-.4 2.6-1.4 4.8-3 6.6 1 .9 2.2 1.6 3.6 2.1l-.7 1.9A13 13 0 0 1 4.6 14 13 13 0 0 1 1.3 16l-.6-1.9A11 11 0 0 0 3.2 12.6 11 11 0 0 1 1.6 9h2.1a9 9 0 0 0 1 1.9A9.8 9.8 0 0 0 7 6H3V4zm13 6h2l4.5 11h-2.2l-1-2.6h-4.6l-1 2.6h-2.2L16 10zm1 3.2-1.6 3.4h3.2L17 13.2z',
  headset: 'M12 2a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h2v-8H5v-1a7 7 0 0 1 14 0v1h-3v8h3v1h-6v2h6a2 2 0 0 0 2-2v-10a9 9 0 0 0-9-9z',
  news: 'M4 4h13v15a2 2 0 0 0 2 2H5a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zm2 3v4h5V7H6zm7 0v1.6h3V7h-3zm0 3v1.6h3V10h-3zM6 13v1.6h10V13H6zm0 3v1.6h10V16H6zm13-8h2v11a2 2 0 0 1-2 2V8z',
  building: 'M4 2h11v6h5v14H4V2zm2 2v16h3v-3h2v3h2V4H6zm2 2h3v2H8zm0 4h3v2H8zm7 0v10h3V10h-3zM8 14h3v2H8z',
  star: 'M12 2.5 14.9 9l7 .6-5.3 4.6 1.6 6.9L12 17.5l-6.2 3.6 1.6-6.9L2.1 9.6l7-.6L12 2.5z',
  chat: 'M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3 6v2h2V9H7zm4 0v2h2V9h-2zm4 0v2h2V9h-2z',
  mail: 'M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2.4V17h16V7.4l-8 5.3-8-5.3zM5.6 7l6.4 4.2L18.4 7H5.6z',
  briefcase: 'M9 3h6a2 2 0 0 1 2 2v2h4a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1h4V5a2 2 0 0 1 2-2zm0 2v2h6V5H9zM4 9v4h16V9H4zm0 6v4h16v-4h-7v1h-2v-1H4z',
  eye: 'M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  chevron: 'M7.4 9 12 13.6 16.6 9 18 10.4l-6 6-6-6z',
  code: 'M8.6 16.6 4 12l4.6-4.6L7.2 6 1.2 12l6 6 1.4-1.4zm6.8 0L20 12l-4.6-4.6L16.8 6l6 6-6 6-1.4-1.4zM13.5 4l1.9.6-5 15.4-1.9-.6L13.5 4z',
  pin: 'M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  mic: 'M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm-7 9h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h3v2H8v-2h3v-3.1A7 7 0 0 1 5 11z',
  external: 'M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14V3zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  menu: 'M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z',
  x: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z',
}

export function Icon({ name, size = 20 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg className="lp-ico" viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path fill="currentColor" d={ICONS[name] ?? ''} />
    </svg>
  )
}

export const CHANNEL_ICONS = ['tv', 'radio', 'web', 'social', 'video', 'print', 'podcast', 'forum']
export const TOUR_ICONS: Record<TourKey, string> = { monitor: 'search', broadcast: 'tv', intel: 'chart', ai: 'spark', alerts: 'bell', reports: 'doc' }
/* ---------------------------------------------------------------- visuels animés (schémas de l'interface) */

/** Ligne « article » : icône du média, deux lignes de texte schématiques, pastille de tonalité */
export function FeedRow({ icon, w1, w2, tone, delay }: { icon: string; w1: number; w2: number; tone: 'pos' | 'neu' | 'neg'; delay: number }) {
  return (
    <div className="lp-row" style={{ animationDelay: `${delay}s` }}>
      <span className="lp-row__ico">
        <Icon name={icon} size={15} />
      </span>
      <span className="lp-row__txt">
        <i style={{ width: `${w1}%` }} />
        <i style={{ width: `${w2}%` }} />
      </span>
      <span className={`lp-tone is-${tone}`} />
    </div>
  )
}

export const ROWS: { icon: string; w1: number; w2: number; tone: 'pos' | 'neu' | 'neg' }[] = [
  { icon: 'web', w1: 86, w2: 54, tone: 'pos' },
  { icon: 'tv', w1: 72, w2: 40, tone: 'neu' },
  { icon: 'social', w1: 92, w2: 61, tone: 'neg' },
  { icon: 'radio', w1: 66, w2: 48, tone: 'neu' },
  { icon: 'video', w1: 80, w2: 35, tone: 'pos' },
  { icon: 'print', w1: 74, w2: 57, tone: 'neu' },
]

export function HeroVisual({ c }: { c: Copy }) {
  return (
    <div className="lp-hero__visual" aria-hidden>
      <div className="lp-dash">
        <div className="lp-dash__bar">
          <span />
          <span />
          <span />
          <b>Mearsaad</b>
          <em className="lp-live">
            <i /> {c.hero.live}
          </em>
        </div>
        <div className="lp-dash__body">
          <div className="lp-card lp-card--feed">
            <h4>{c.hero.feed}</h4>
            <div className="lp-feed">
              <div className="lp-feed__track">
                {[...ROWS, ...ROWS].map((r, k) => (
                  <FeedRow key={k} {...r} delay={0} />
                ))}
              </div>
            </div>
          </div>
          <div className="lp-dash__side">
            <div className="lp-card">
              <h4>{c.hero.tone}</h4>
              <svg viewBox="0 0 42 42" className="lp-donut">
                <circle cx="21" cy="21" r="15.9" className="lp-donut__bg" />
                <circle cx="21" cy="21" r="15.9" className="lp-donut__a" />
                <circle cx="21" cy="21" r="15.9" className="lp-donut__b" />
                <circle cx="21" cy="21" r="15.9" className="lp-donut__c" />
              </svg>
            </div>
            <div className="lp-card">
              <h4>{c.hero.volume}</h4>
              <svg viewBox="0 0 120 44" className="lp-spark" preserveAspectRatio="none">
                <path className="lp-spark__area" d="M0 36 L17 30 L34 33 L51 22 L68 26 L85 12 L102 18 L120 6 L120 44 L0 44 Z" />
                <path className="lp-spark__line" d="M0 36 L17 30 L34 33 L51 22 L68 26 L85 12 L102 18 L120 6" />
              </svg>
            </div>
            <div className="lp-card lp-card--radar">
              <h4>{c.hero.radar}</h4>
              <div className="lp-radar">
                <span className="lp-radar__sweep" />
                <i style={{ top: '30%', left: '62%' }} />
                <i style={{ top: '64%', left: '28%', animationDelay: '1.2s' }} />
                <i style={{ top: '48%', left: '72%', animationDelay: '2.1s' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="lp-float lp-float--alert">
        <span className="lp-float__ico">
          <Icon name="bolt" size={16} />
        </span>
        <span>
          <b>{c.hero.alert}</b>
          <small>{c.hero.alertSub}</small>
        </span>
      </div>
      <div className="lp-float lp-float--ai">
        <span className="lp-float__ico">
          <Icon name="spark" size={16} />
        </span>
        <b>{c.hero.summary}</b>
      </div>
    </div>
  )
}

export function TourVisual({ k, c }: { k: TourKey; c: Copy }) {
  if (k === 'monitor')
    return (
      <div className="tv tv--monitor">
        <div className="tv-sources">
          {CHANNEL_ICONS.slice(0, 6).map((ic, n) => (
            <span key={ic} style={{ animationDelay: `${n * 0.25}s` }}>
              <Icon name={ic} size={18} />
            </span>
          ))}
        </div>
        <div className="tv-merge">
          <svg viewBox="0 0 60 200" preserveAspectRatio="none">
            {[20, 50, 80, 110, 140, 170].map((y, n) => (
              <path key={y} d={`M0 ${y} C 30 ${y}, 30 100, 60 100`} style={{ animationDelay: `${n * 0.25}s` }} />
            ))}
          </svg>
        </div>
        <div className="tv-feed">
          <div className="tv-search">
            <Icon name="search" size={14} />
            <code dir="ltr">("energy" OR "fuel") AND NOT sport</code>
          </div>
          {ROWS.slice(0, 5).map((r, n) => (
            <FeedRow key={n} {...r} delay={0.3 + n * 0.35} />
          ))}
        </div>
      </div>
    )
  if (k === 'broadcast')
    return (
      <div className="tv tv--broadcast">
        <div className="tv-wall">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="tv-screen" style={{ animationDelay: `${n * 0.15}s` }}>
              <em className="lp-live">
                <i /> LIVE
              </em>
              <Icon name={n % 3 === 1 ? 'radio' : 'tv'} size={20} />
              <div className="tv-eq">
                {[0, 1, 2, 3, 4, 5, 6].map((b) => (
                  <i key={b} style={{ animationDelay: `${(b * 0.13 + n * 0.07) % 1}s` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="tv-transcript">
          <h5>{c.tour.transcript}</h5>
          {[92, 78, 85, 60].map((w, n) => (
            <p key={n} style={{ animationDelay: `${0.6 + n * 0.5}s` }}>
              <time dir="ltr">{`00:${String(12 + n * 7).padStart(2, '0')}`}</time>
              <i style={{ width: `${w}%` }} className={n === 1 ? 'is-hit' : ''} />
            </p>
          ))}
        </div>
      </div>
    )
  if (k === 'intel')
    return (
      <div className="tv tv--intel">
        <div className="tv-bars">
          {[46, 72, 58, 88, 64, 96, 78].map((h, n) => (
            <i key={n} style={{ height: `${h}%`, animationDelay: `${n * 0.09}s` }} />
          ))}
        </div>
        <div className="tv-intel-side">
          <svg viewBox="0 0 42 42" className="lp-donut">
            <circle cx="21" cy="21" r="15.9" className="lp-donut__bg" />
            <circle cx="21" cy="21" r="15.9" className="lp-donut__a" />
            <circle cx="21" cy="21" r="15.9" className="lp-donut__b" />
            <circle cx="21" cy="21" r="15.9" className="lp-donut__c" />
          </svg>
          <div className="tv-sov">
            {[54, 28, 18].map((w, n) => (
              <i key={n} style={{ width: `${w}%`, animationDelay: `${0.4 + n * 0.15}s` }} />
            ))}
          </div>
          <div className="tv-entities">
            {[70, 52, 40, 31].map((w, n) => (
              <p key={n}>
                <span className="tv-avatar" />
                <i style={{ width: `${w}%`, animationDelay: `${0.5 + n * 0.12}s` }} />
              </p>
            ))}
          </div>
        </div>
      </div>
    )
  if (k === 'ai')
    return (
      <div className="tv tv--ai">
        <div className="tv-bubble tv-bubble--q">{c.tour.ask}</div>
        <div className="tv-bubble tv-bubble--a">
          <span className="tv-typing">
            <i />
            <i />
            <i />
          </span>
          <div className="tv-answer">
            {[96, 88, 92, 70].map((w, n) => (
              <i key={n} style={{ width: `${w}%`, animationDelay: `${1.4 + n * 0.25}s` }} />
            ))}
            <p className="tv-cites">
              <b>{c.tour.sources}</b>
              {[1, 2, 3].map((n) => (
                <span key={n} style={{ animationDelay: `${2.6 + n * 0.15}s` }}>
                  [{n}]
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>
    )
  if (k === 'alerts')
    return (
      <div className="tv tv--alerts">
        <div className="lp-radar lp-radar--big">
          <span className="lp-radar__sweep" />
          <i style={{ top: '28%', left: '64%' }} />
          <i style={{ top: '62%', left: '30%', animationDelay: '1s' }} />
          <i style={{ top: '45%', left: '76%', animationDelay: '2s' }} />
          <i style={{ top: '72%', left: '58%', animationDelay: '2.6s' }} />
        </div>
        <div className="tv-alerts">
          {c.tour.alertKinds.map((label, n) => (
            <div key={label} className={`tv-alert is-${n}`} style={{ animationDelay: `${0.4 + n * 0.6}s` }}>
              <Icon name={n === 0 ? 'bolt' : n === 1 ? 'bell' : 'spark'} size={16} />
              <b>{label}</b>
              <i />
            </div>
          ))}
        </div>
      </div>
    )
  return (
    <div className="tv tv--reports">
      <div className="tv-pages">
        {[0, 1, 2].map((n) => (
          <div key={n} className="tv-page" style={{ animationDelay: `${n * 0.3}s` }}>
            <span className="tv-page__logo">
              <img src="/brand/mearsaad-intl-icon.png" alt="" width={256} height={256} />
            </span>
            <i style={{ width: '70%' }} />
            <div className="tv-page__chart">
              {[40, 70, 55, 85].map((h, b) => (
                <b key={b} style={{ height: `${h}%` }} />
              ))}
            </div>
            <i style={{ width: '90%' }} />
            <i style={{ width: '82%' }} />
            <i style={{ width: '60%' }} />
          </div>
        ))}
      </div>
      <div className="tv-exports">
        <b>{c.tour.exports}</b>
        {['PDF', 'Word', 'PowerPoint', 'CSV'].map((f, n) => (
          <span key={f} style={{ animationDelay: `${0.8 + n * 0.15}s` }}>
            {f}
          </span>
        ))}
        <em>
          <Icon name="bell" size={14} /> {c.tour.schedule}
        </em>
      </div>
    </div>
  )
}
