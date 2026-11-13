import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react'
import { COPY, TOURS, type Copy, type LandingLang, type TourKey } from './copy'
import './landing.css'
import './mega.css'
import { MegaNav, type Go } from './MegaNav'
import { MEGA, MENU_KEYS, hrefOf, pageFromPath, type Target } from './megaContent'
import { AskAround, SubPage } from './SubPage'
import { CHANNEL_ICONS, HeroVisual, Icon, TOUR_ICONS, TourVisual } from './visuals'

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


/* ---------------------------------------------------------------- logo */

function Brand({ light = false, onClick }: { light?: boolean; onClick?: (e: ReactMouseEvent) => void }) {
  return (
    <a className={`lp-brand${light ? ' is-light' : ''}`} href="/" onClick={onClick} aria-label="Mearsaad — مرصاد, by Around Expressions">
      <img src={light ? '/brand/mearsaad-intl-light.png' : '/brand/mearsaad-intl-dark.png'} alt="" width={900} height={262} />
      <span dir="ltr">
        <small>by</small>
        <b>Around Expressions</b>
      </span>
    </a>
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
  const mega = MEGA[lang]
  const [demo, setDemo] = useState(false)
  // Page ouverte depuis un méga-menu (/features/…, /solutions/…), sinon la page d'accueil
  const [path, setPath] = useState(() => location.pathname)
  const page = pageFromPath(path)
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
    const base = lang === 'ar' ? 'مرصاد — الرصد والذكاء الإعلامي · Around Expressions' : 'Mearsaad — Media Monitoring & Intelligence · Around Expressions'
    document.title = page ? `${mega.pages[page].title} · ${lang === 'ar' ? 'مرصاد' : 'Mearsaad'}` : base
  }, [lang, page, mega])
  useEffect(() => {
    const onPop = () => setPath(location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  // Lien direct vers le formulaire (#demo)
  useEffect(() => {
    if (location.hash === '#demo') setDemo(true)
  }, [])

  /** Navigation interne sans rechargement : page de menu, ou ancre de la page d'accueil (#tour, #top) */
  const go: Go = (to) => (e) => {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return
    e?.preventDefault()
    const smooth: ScrollBehavior = reduced() ? 'auto' : 'smooth'
    if (to.startsWith('#')) {
      const id = to.slice(1)
      const scroll = () => (id === 'top' ? window.scrollTo({ top: 0, behavior: smooth }) : document.getElementById(id)?.scrollIntoView({ behavior: smooth, block: 'start' }))
      if (page) {
        history.pushState(null, '', id === 'top' ? '/' : `/#${id}`)
        setPath('/')
        window.scrollTo(0, 0)
        window.setTimeout(scroll, 80)
      } else {
        history.replaceState(null, '', id === 'top' ? '/' : `/#${id}`)
        scroll()
      }
      return
    }
    const href = hrefOf(to)
    if (href !== location.pathname) history.pushState(null, '', href)
    setPath(href)
    window.scrollTo(0, 0)
  }

  const loginHref = `/login?lang=${lang}`
  const openDemo = () => setDemo(true)
  const navLinks: [Target, string][] = [
    ['#tour', c.nav.tour],
    ['platform', c.nav.platform],
    ['security', c.nav.security],
    ['contact', mega.menus.company.cols[0].items[3].label],
  ]

  return (
    <div className="lp" dir={c.dir} lang={lang}>
      <MegaNav c={c} mega={mega} lang={lang} setLang={setLang} go={go} openDemo={openDemo} loginHref={loginHref} brand={<Brand onClick={go('#top')} />} current={page} />

      {page ? (
        <SubPage k={page} c={c} mega={mega} go={go} openDemo={openDemo} />
      ) : (
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
      )}

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer__in">
          <div className="lp-footer__brand">
            <Brand light />
            {/* Signature du logo Mearsaad */}
            <p className="lp-footer__sign">
              <span dir="ltr">MEDIA MINING &amp; MONITORING SYSTEM (MMS)</span>
              <i aria-hidden />
              <span dir="rtl" lang="ar">منظومة الرصد والتحليل الإعلامي</span>
            </p>
            <p>{c.footer.tagline}</p>
          </div>
          <nav aria-label={c.footer.platform}>
            <h4>{c.footer.platform}</h4>
            {navLinks.map(([to, label]) => (
              <a key={to} href={hrefOf(to)} onClick={go(to)}>
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
        <div className="lp-wrap mm-footer-cols">
          {MENU_KEYS.map((k) => {
            const m = mega.menus[k]
            const items = [...(m.intros ?? []).map((i) => ({ to: i.to, label: i.title })), ...m.cols.flatMap((col) => col.items)].filter((it, n, all) => all.findIndex((x) => x.to === it.to) === n)
            return (
              <nav key={k} aria-label={m.label}>
                <h4>{m.label}</h4>
                {items.slice(0, 7).map((it) => (
                  <a key={it.label} href={hrefOf(it.to)} onClick={go(it.to)}>
                    {it.label}
                  </a>
                ))}
              </nav>
            )
          })}
        </div>
        <p className="lp-footer__copy" dir="ltr">
          © {new Date().getFullYear()} Around Expressions LDA · Mearsaad. {c.footer.rights}
        </p>
      </footer>

      <AskAround mega={mega} go={go} openDemo={openDemo} />
      {demo && <DemoModal c={c} lang={lang} onClose={() => setDemo(false)} />}
    </div>
  )
}
