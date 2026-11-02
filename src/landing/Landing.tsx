import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { COPY, TOURS, type Copy, type LandingLang, type TourKey } from './copy'
import './landing.css'

/**
 * Page d'accueil publique de Mearsaad (مرصاد) by Around Expressions (adresse /, visiteurs sans session).
 * Concept « visite produit » : présentation de la plateforme fonction par fonction, démonstrations animées,
 * boutons Log in (/login) et Request a demo (formulaire enregistré pour la console Super Admin, POST /api/landing/demo).
 * Identité Mearsaad by Around Expressions uniquement (logo fourni, marine et turquoise) ; anglais, français, arabe.
 * Les illustrations sont des schémas de l'interface, sans chiffres ni noms inventés.
 */

const LANG_KEY = 'mms-landing-lang'
function firstLang(): LandingLang {
  const q = new URLSearchParams(location.search).get('lang')
  if (q === 'en' || q === 'fr' || q === 'ar') return q
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'en' || saved === 'fr' || saved === 'ar') return saved
  } catch {
    /* stockage indisponible */
  }
  const nav = (navigator.language || 'en').slice(0, 2)
  return nav === 'fr' ? 'fr' : nav === 'ar' ? 'ar' : 'en'
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Apparition au défilement : la classe is-in est posée quand l'élément entre à l'écran */
function useReveal() {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('.lp [data-reveal]')]
    if (reduced() || typeof IntersectionObserver !== 'function') {
      els.forEach((el) => el.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  })
}

/* ---------------------------------------------------------------- icônes */

const ICONS: Record<string, string> = {
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
  menu: 'M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z',
  x: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z',
}

function Icon({ name, size = 20 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg className="lp-ico" viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path fill="currentColor" d={ICONS[name] ?? ''} />
    </svg>
  )
}

const CHANNEL_ICONS = ['tv', 'radio', 'web', 'social', 'video', 'print', 'podcast', 'forum']
const TOUR_ICONS: Record<TourKey, string> = { monitor: 'search', broadcast: 'tv', intel: 'chart', ai: 'spark', alerts: 'bell', reports: 'doc' }

/* ---------------------------------------------------------------- logo */

function Brand({ light = false }: { light?: boolean }) {
  return (
    <a className={`lp-brand${light ? ' is-light' : ''}`} href="/" aria-label="Mearsaad — مرصاد, by Around Expressions">
      <img src={light ? '/brand/mearsaad-intl-light.png' : '/brand/mearsaad-intl-dark.png'} alt="" width={900} height={262} />
      <span dir="ltr">
        <small>by</small>
        <b>Around Expressions</b>
      </span>
    </a>
  )
}

/* ---------------------------------------------------------------- visuels animés (schémas de l'interface) */

/** Ligne « article » : icône du média, deux lignes de texte schématiques, pastille de tonalité */
function FeedRow({ icon, w1, w2, tone, delay }: { icon: string; w1: number; w2: number; tone: 'pos' | 'neu' | 'neg'; delay: number }) {
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

const ROWS: { icon: string; w1: number; w2: number; tone: 'pos' | 'neu' | 'neg' }[] = [
  { icon: 'web', w1: 86, w2: 54, tone: 'pos' },
  { icon: 'tv', w1: 72, w2: 40, tone: 'neu' },
  { icon: 'social', w1: 92, w2: 61, tone: 'neg' },
  { icon: 'radio', w1: 66, w2: 48, tone: 'neu' },
  { icon: 'video', w1: 80, w2: 35, tone: 'pos' },
  { icon: 'print', w1: 74, w2: 57, tone: 'neu' },
]

function HeroVisual({ c }: { c: Copy }) {
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

function TourVisual({ k, c }: { k: TourKey; c: Copy }) {
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

/* ---------------------------------------------------------------- visite produit */

const TOUR_MS = 7000

function Tour({ c }: { c: Copy }) {
  const [active, setActive] = useState<TourKey>('monitor')
  const [playing, setPlaying] = useState(() => !reduced())
  const [hover, setHover] = useState(false)
  // Clavier ou lecteur d'écran dans la visite : pas de défilement automatique sous le focus
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver !== 'function') return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const running = playing && !hover && !focused && visible
  // Flèches, Début et Fin entre les onglets (onglet actif seul dans l'ordre de tabulation)
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const n = TOURS.indexOf(active)
    const rtl = c.dir === 'rtl'
    const step = { ArrowDown: 1, ArrowUp: -1, ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key as 'ArrowDown']
    const next = e.key === 'Home' ? TOURS[0] : e.key === 'End' ? TOURS[TOURS.length - 1] : step ? TOURS[(n + step + TOURS.length) % TOURS.length] : null
    if (!next) return
    e.preventDefault()
    setActive(next)
    tabs.current[next]?.focus()
  }
  useEffect(() => {
    if (!running) return
    const id = setTimeout(() => setActive((a) => TOURS[(TOURS.indexOf(a) + 1) % TOURS.length]), TOUR_MS)
    return () => clearTimeout(id)
  }, [running, active])
  const item = c.tour.items[active]
  return (
    <section id="tour" className="lp-section lp-tour" ref={ref}>
      <header className="lp-head" data-reveal>
        <span className="lp-eyebrow">{c.tour.eyebrow}</span>
        <h2>{c.tour.title}</h2>
        <p>{c.tour.text}</p>
      </header>
      <div
        className="lp-tour__grid"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setFocused(false)}
        data-reveal
      >
        <div className="lp-tour__side">
        <div className="lp-tour__tabs" role="tablist" aria-label={c.tour.eyebrow} aria-orientation="vertical" onKeyDown={onKey}>
          {TOURS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`tour-tab-${k}`}
              aria-selected={k === active}
              aria-controls="tour-panel"
              tabIndex={k === active ? 0 : -1}
              ref={(el) => {
                tabs.current[k] = el
              }}
              className={k === active ? 'is-active' : ''}
              onClick={() => setActive(k)}
            >
              <span className="lp-tour__ico">
                <Icon name={TOUR_ICONS[k]} size={20} />
              </span>
              <span className="lp-tour__label">
                <b>{c.tour.items[k].name}</b>
                {k === active && <small>{c.tour.items[k].title}</small>}
              </span>
              {k === active && <span key={`${k}-${running}`} className={`lp-tour__progress${running ? ' is-running' : ''}`} style={{ animationDuration: `${TOUR_MS}ms` }} />}
            </button>
          ))}
        </div>
        <button type="button" className="lp-tour__play" aria-pressed={!playing} onClick={() => setPlaying(!playing)}>
          <Icon name={playing ? 'pause' : 'play'} size={16} /> {playing ? c.tour.pause : c.tour.play}
        </button>
        </div>
        <div className="lp-tour__panel" role="tabpanel" id="tour-panel" aria-labelledby={`tour-tab-${active}`}>
          <div className="lp-tour__stage" key={active}>
            <TourVisual k={active} c={c} />
          </div>
          <div className="lp-tour__copy" key={`copy-${active}`}>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
            <ul>
              {item.points.map((p) => (
                <li key={p}>
                  <Icon name="check" size={18} />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- demande de démonstration */

function DemoModal({ c, lang, onClose }: { c: Copy; lang: LandingLang; onClose: () => void }) {
  const f = c.form
  const [form, setForm] = useState({ name: '', email: '', company: '', role: '', country: '', phone: '', interest: 'platform', message: '', website: '' })
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState('')
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  async function submit(e: FormEvent) {
    e.preventDefault()
    setState('busy')
    setError('')
    try {
      const res = await fetch('/api/landing/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, lang }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'FAILED')
      setState('done')
    } catch (err) {
      setError(f.errors[(err as Error).message] ?? f.errors.FAILED)
      setState('idle')
    }
  }
  const field = (k: keyof typeof form, label: string, props: Record<string, unknown> = {}) => (
    <label className="lp-field">
      <span>{label}</span>
      <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} {...props} />
    </label>
  )
  return (
    <div className="lp-modal" role="dialog" aria-modal="true" aria-labelledby="lp-demo-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lp-modal__box">
        <button type="button" className="lp-modal__x" onClick={onClose} aria-label={f.close}>
          <Icon name="x" size={20} />
        </button>
        {state === 'done' ? (
          <div className="lp-modal__done">
            <span className="lp-modal__ok">
              <Icon name="check" size={34} />
            </span>
            <h3 id="lp-demo-title">{f.title}</h3>
            <p>{f.done}</p>
            <button type="button" className="lp-btn lp-btn--primary" onClick={onClose}>
              {f.close}
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3 id="lp-demo-title">{f.title}</h3>
            <p className="lp-modal__intro">{f.intro}</p>
            <div className="lp-form">
              <label className="lp-field">
                <span>{f.name}</span>
                <input ref={first} required minLength={2} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              {field('email', f.email, { type: 'email', required: true, autoComplete: 'email', dir: 'ltr' })}
              {field('company', f.company, { required: true, minLength: 2, autoComplete: 'organization' })}
              {field('role', f.role, { autoComplete: 'organization-title' })}
              {field('country', f.country, { autoComplete: 'country-name' })}
              {field('phone', f.phone, { type: 'tel', autoComplete: 'tel', dir: 'ltr' })}
              <label className="lp-field lp-field--wide">
                <span>{f.interest}</span>
                <select value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })}>
                  {Object.entries(f.interests).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="lp-field lp-field--wide">
                <span>{f.message}</span>
                <textarea rows={3} maxLength={2000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              </label>
              {/* Champ piège pour les robots, invisible et ignoré par les lecteurs d'écran */}
              <input className="lp-hp" tabIndex={-1} autoComplete="off" aria-hidden value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} name="website" />
            </div>
            {error && (
              <p className="lp-error" role="alert">
                {error}
              </p>
            )}
            <p className="lp-consent">
              <Icon name="lock" size={14} /> {f.consent}
            </p>
            <button type="submit" className="lp-btn lp-btn--primary lp-btn--block" disabled={state === 'busy'}>
              {state === 'busy' ? f.sending : f.send}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- page */

function Section({ id, className = '', children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={`lp-section ${className}`}>
      {children}
    </section>
  )
}

export default function Landing() {
  const [lang, setLangState] = useState<LandingLang>(firstLang)
  const c = COPY[lang]
  const [demo, setDemo] = useState(false)
  const [menu, setMenu] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useReveal()

  const setLang = (l: LandingLang) => {
    setLangState(l)
    try {
      localStorage.setItem(LANG_KEY, l)
    } catch {
      /* stockage indisponible */
    }
  }
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = lang === 'ar' ? 'مرصاد — الرصد والذكاء الإعلامي · Around Expressions' : 'Mearsaad — Media Monitoring & Intelligence · Around Expressions'
  }, [lang])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // Lien direct vers le formulaire (#demo)
  useEffect(() => {
    if (location.hash === '#demo') setDemo(true)
  }, [])

  const loginHref = `/login?lang=${lang}`
  const openDemo = () => {
    setMenu(false)
    setDemo(true)
  }
  const navLinks: [string, string][] = [
    ['#tour', c.nav.tour],
    ['#solutions', c.nav.solutions],
    ['#platform', c.nav.platform],
    ['#security', c.nav.security],
  ]

  return (
    <div className="lp" dir={c.dir} lang={lang}>
      <header className={`lp-nav${scrolled ? ' is-scrolled' : ''}${menu ? ' is-open' : ''}`}>
        <div className="lp-wrap lp-nav__in">
          <Brand />
          <nav className="lp-nav__links" aria-label="Main">
            {navLinks.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenu(false)}>
                {label}
              </a>
            ))}
          </nav>
          <div className="lp-nav__cta">
            <div className="lp-lang" role="group" aria-label="Language">
              {(['en', 'fr', 'ar'] as LandingLang[]).map((l) => (
                <button key={l} type="button" className={l === lang ? 'is-active' : ''} onClick={() => setLang(l)} lang={l}>
                  {l === 'ar' ? 'ع' : l.toUpperCase()}
                </button>
              ))}
            </div>
            <a className="lp-btn lp-btn--ghost" href={loginHref}>
              {c.nav.login}
            </a>
            <button type="button" className="lp-btn lp-btn--primary" onClick={openDemo}>
              {c.nav.demo}
            </button>
          </div>
          <button type="button" className="lp-nav__burger" aria-expanded={menu} aria-label={menu ? c.nav.close : c.nav.menu} onClick={() => setMenu(!menu)}>
            <Icon name={menu ? 'x' : 'menu'} size={24} />
          </button>
        </div>
        {menu && (
          <div className="lp-nav__mobile">
            {navLinks.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenu(false)}>
                {label}
              </a>
            ))}
            <div className="lp-lang" role="group" aria-label="Language">
              {(['en', 'fr', 'ar'] as LandingLang[]).map((l) => (
                <button key={l} type="button" className={l === lang ? 'is-active' : ''} onClick={() => setLang(l)} lang={l}>
                  {l === 'ar' ? 'العربية' : l === 'fr' ? 'Français' : 'English'}
                </button>
              ))}
            </div>
            <a className="lp-btn lp-btn--ghost lp-btn--block" href={loginHref}>
              {c.nav.login}
            </a>
            <button type="button" className="lp-btn lp-btn--primary lp-btn--block" onClick={openDemo}>
              {c.nav.demo}
            </button>
          </div>
        )}
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero__bg" aria-hidden>
            <span className="lp-orb lp-orb--1" />
            <span className="lp-orb lp-orb--2" />
            <span className="lp-grid" />
          </div>
          <div className="lp-wrap lp-hero__in">
            <div className="lp-hero__copy">
              <span className="lp-eyebrow lp-eyebrow--light lp-anim" style={{ animationDelay: '0.05s' }}>
                {c.hero.eyebrow}
              </span>
              <h1>
                {c.hero.title.map((line, n) => (
                  <span key={n} className="lp-anim" style={{ animationDelay: `${0.12 + n * 0.1}s` }}>
                    {n === 2 ? <em>{line}</em> : line}
                  </span>
                ))}
              </h1>
              <p className="lp-anim" style={{ animationDelay: '0.45s' }}>
                {c.hero.text}
              </p>
              <div className="lp-hero__cta lp-anim" style={{ animationDelay: '0.55s' }}>
                <button type="button" className="lp-btn lp-btn--primary lp-btn--lg" onClick={openDemo}>
                  {c.hero.primary} <Icon name="arrow" size={18} />
                </button>
                <a className="lp-btn lp-btn--glass lp-btn--lg" href="#tour">
                  <Icon name="play" size={16} /> {c.hero.secondary}
                </a>
              </div>
              <ul className="lp-hero__trust lp-anim" style={{ animationDelay: '0.65s' }}>
                {c.hero.trust.map((t, n) => (
                  <li key={t}>
                    <Icon name={['tv', 'web', 'social', 'print'][n]} size={16} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <HeroVisual c={c} />
          </div>
        </section>

        <div className="lp-marquee" aria-label={c.hero.trust.join(', ')}>
          <div className="lp-marquee__track">
            {[0, 1].map((rep) =>
              c.channels.map((ch, n) => (
                <span key={`${rep}-${n}`} aria-hidden={rep === 1}>
                  <Icon name={CHANNEL_ICONS[n]} size={18} />
                  {ch}
                </span>
              )),
            )}
          </div>
        </div>

        <Tour c={c} />

        <Section id="solutions" className="lp-solutions">
          <header className="lp-head" data-reveal>
            <span className="lp-eyebrow">{c.solutions.eyebrow}</span>
            <h2>{c.solutions.title}</h2>
          </header>
          <div className="lp-cards">
            {c.solutions.items.map((s, n) => (
              <article key={s.key} className="lp-sol" data-reveal style={{ transitionDelay: `${n * 0.08}s` }}>
                <span className="lp-sol__ico">
                  <Icon name={s.key} size={26} />
                </span>
                <h3>{s.name}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section id="platform" className="lp-platform">
          <header className="lp-head lp-head--light" data-reveal>
            <span className="lp-eyebrow lp-eyebrow--light">{c.platform.eyebrow}</span>
            <h2>{c.platform.title}</h2>
          </header>
          <div className="lp-pillars">
            {c.platform.pillars.map((p, n) => (
              <div key={p.label} className="lp-pillar" data-reveal style={{ transitionDelay: `${n * 0.08}s` }}>
                <strong dir="ltr">{p.value}</strong>
                <span>{p.label}</span>
              </div>
            ))}
          </div>
          <ol className="lp-steps">
            {c.platform.steps.map((s, n) => (
              <li key={s.title} data-reveal style={{ transitionDelay: `${n * 0.12}s` }}>
                <span className="lp-steps__n">{n + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="security" className="lp-security">
          <div className="lp-security__grid">
            <div data-reveal>
              <span className="lp-eyebrow">{c.security.eyebrow}</span>
              <h2>{c.security.title}</h2>
              <p className="lp-lead">{c.security.text}</p>
              <ul className="lp-checks">
                {c.security.points.map((p) => (
                  <li key={p}>
                    <Icon name="shield" size={18} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lp-roles" data-reveal>
              {c.security.roles.map((r, n) => (
                <div key={r.name} className={`lp-role is-${n}`}>
                  <span className="lp-role__ico">
                    <Icon name={n === 0 ? 'globe' : n === 1 ? 'users' : n === 2 ? 'chart' : 'search'} size={18} />
                  </span>
                  <span>
                    <b dir="ltr">{r.name}</b>
                    <small>{r.text}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <section className="lp-cta">
          <div className="lp-wrap lp-cta__in" data-reveal>
            <h2>{c.cta.title}</h2>
            <p>{c.cta.text}</p>
            <div className="lp-hero__cta">
              <button type="button" className="lp-btn lp-btn--white lp-btn--lg" onClick={openDemo}>
                {c.cta.primary} <Icon name="arrow" size={18} />
              </button>
              <a className="lp-btn lp-btn--glass lp-btn--lg" href={loginHref}>
                {c.cta.secondary}
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer__in">
          <div className="lp-footer__brand">
            <Brand light />
            {/* Signature du logo Mearsaad */}
            <p className="lp-footer__sign">
              <span dir="ltr">MEDIA MENTORING SYSTEM</span>
              <i aria-hidden />
              <span dir="rtl" lang="ar">نظام التوجيه الإعلامي</span>
            </p>
            <p>{c.footer.tagline}</p>
          </div>
          <nav aria-label={c.footer.platform}>
            <h4>{c.footer.platform}</h4>
            {navLinks.map(([href, label]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>
          <nav aria-label={c.footer.company}>
            <h4 dir="ltr">{c.footer.company}</h4>
            <a href={loginHref}>{c.nav.login}</a>
            <button type="button" onClick={openDemo}>
              {c.nav.demo}
            </button>
            <button type="button" onClick={openDemo}>
              {c.footer.contact}
            </button>
          </nav>
        </div>
        <p className="lp-footer__copy" dir="ltr">
          © {new Date().getFullYear()} Around Expressions LDA · Mearsaad. {c.footer.rights}
        </p>
      </footer>

      {demo && <DemoModal c={c} lang={lang} onClose={() => setDemo(false)} />}
    </div>
  )
}
