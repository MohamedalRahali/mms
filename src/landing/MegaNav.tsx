import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import type { Copy, LandingLang } from './copy'
import { MENU_KEYS, PAGES, menuOf, hrefOf, type Mega, type MenuKey, type PageKey, type Target, type Visual } from './megaContent'
import { Icon, TourVisual } from './visuals'

/**
 * Navigation à méga-menus de la vitrine : cinq panneaux (Produit, Solutions, Pourquoi Mearsaad, Ressources,
 * Entreprise) ouverts au survol ou au clic, chacun avec ses colonnes de liens décrits et une carte vedette illustrée.
 * Sur mobile : tiroir plein écran avec accordéons. Clavier : Échap ferme, flèche bas ouvre et entre dans le panneau.
 */

export type Go = (to: Target) => (e?: ReactMouseEvent) => void

/** Illustration d'une carte vedette ou d'une page : schéma animé de l'interface */
export function Illustration({ visual, c, compact = false }: { visual: Visual; c: Copy; compact?: boolean }) {
  if (visual === 'monitor' || visual === 'broadcast' || visual === 'intel' || visual === 'ai' || visual === 'alerts' || visual === 'reports')
    return (
      <div className={`mm-illus${compact ? ' is-compact' : ''}`} aria-hidden>
        <div className="mm-illus__scale">
          <TourVisual k={visual} c={c} />
        </div>
      </div>
    )
  return (
    <div className={`mm-illus mm-illus--${visual}${compact ? ' is-compact' : ''}`} aria-hidden>
      {visual === 'shield' && (
        <div className="mm-shield">
          <span className="mm-shield__ring" />
          <span className="mm-shield__ring is-2" />
          <span className="mm-shield__core">
            <Icon name="shield" size={compact ? 40 : 64} />
          </span>
          {['lock', 'eye', 'users', 'check'].map((ic, n) => (
            <span key={ic} className={`mm-orbit is-${n}`}>
              <Icon name={ic} size={compact ? 14 : 18} />
            </span>
          ))}
        </div>
      )}
      {visual === 'globe' && (
        <div className="mm-globe">
          <span className="mm-globe__sphere">
            <i />
            <i />
            <i />
          </span>
          {[
            [28, 34],
            [56, 26],
            [64, 58],
            [38, 66],
            [74, 40],
          ].map(([t, l], n) => (
            <span key={n} className="mm-globe__pin" style={{ top: `${t}%`, left: `${l}%`, animationDelay: `${n * 0.5}s` }} />
          ))}
          <img src="/brand/mearsaad-intl-icon.png" alt="" width={256} height={256} className="mm-globe__logo" />
        </div>
      )}
      {visual === 'team' && (
        <div className="mm-team">
          {[0, 1, 2].map((n) => (
            <div key={n} className="mm-team__card" style={{ animationDelay: `${n * 0.2}s` }}>
              <span className="mm-team__avatar">
                <Icon name={['headset', 'users', 'spark'][n]} size={compact ? 16 : 20} />
              </span>
              <i style={{ width: `${[70, 55, 62][n]}%` }} />
              <i style={{ width: `${[45, 60, 38][n]}%` }} />
            </div>
          ))}
        </div>
      )}
      {visual === 'book' && (
        <div className="mm-book">
          <div className="mm-book__page">
            <b>
              <Icon name="search" size={12} /> <code dir="ltr">("مرصاد" OR "Mearsaad") AND NOT sport</code>
            </b>
            {[88, 72, 94, 60, 80].map((w, n) => (
              <i key={n} style={{ width: `${w}%`, animationDelay: `${0.2 + n * 0.12}s` }} />
            ))}
          </div>
          <div className="mm-book__tags" dir="ltr">
            {['AND', 'OR', 'NOT', '" "'].map((t, n) => (
              <span key={t} style={{ animationDelay: `${0.6 + n * 0.15}s` }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      {visual === 'code' && (
        <pre className="mm-code" dir="ltr">
          <span>GET /api/v1/items?q=energy</span>
          <span className="is-dim">Authorization: Bearer ••••••</span>
          <span>{'{ "items": [ { "title": … ,'}</span>
          <span>{'    "tone": "positive",'}</span>
          <span>{'    "source": "tv" } ] }'}</span>
        </pre>
      )}
    </div>
  )
}

function useHoverIntent(onOpen: (k: MenuKey) => void, onClose: () => void) {
  const t = useRef<number | undefined>(undefined)
  const clear = () => window.clearTimeout(t.current)
  return {
    enter: (k: MenuKey, delay = 90) => {
      clear()
      t.current = window.setTimeout(() => onOpen(k), delay)
    },
    leave: () => {
      clear()
      t.current = window.setTimeout(onClose, 220)
    },
    clear,
  }
}

/**
 * Mises en page possibles de la barre, de la plus aérée à la plus compacte. On garde la première où tout
 * tient sur une ligne : la place dépend de la langue, de la police chargée, du zoom et de la largeur de
 * l'écran, donc on mesure au lieu de deviner un point de rupture.
 * snug : espacements resserrés · nobrand : sans « by Around Expressions » · tight : textes un peu plus petits
 * burger : menus repliés dans le tiroir · noaux : sans Connexion ni Tarifs (dans le tiroir) · nolang : sans langues
 */
const FITS = ['', 'snug', 'snug nobrand', 'snug nobrand tight', 'burger', 'nobrand burger', 'nobrand burger noaux', 'nobrand burger noaux nolang']
const BURGER = FITS.indexOf('burger')
/** Même seuil que landing.css : en dessous, langues, Connexion, Tarifs et démo ne sont plus que dans le tiroir. */
const SMALL = '(max-width: 760px)'

function useFit(bar: RefObject<HTMLElement | null>, row: RefObject<HTMLDivElement | null>, deps: unknown[]) {
  const [fit, setFit] = useState(0)
  const width = useRef(0)
  const gutter = useRef(0)
  useLayoutEffect(() => {
    const el = bar.current
    const box = row.current
    if (!el || !box) return
    let alive = true
    let frame = 0
    const overflows = () => {
      const r = box.getBoundingClientRect()
      let lo = Infinity
      let hi = -Infinity
      for (const k of Array.from(box.children)) {
        const b = k.getBoundingClientRect()
        if (!b.width) continue
        lo = Math.min(lo, b.left)
        hi = Math.max(hi, b.right)
      }
      return hi - lo > r.width + 0.5
    }
    const measure = () => {
      if (!alive) return
      // Défilement bloqué (tiroir, formulaire de démo) : la barre de défilement de Windows disparaît et la ligne
      // s'élargit de quelques pixels. Tant que la fenêtre garde sa largeur, on ne revient pas à une mise en page
      // plus aérée (les menus complets refermeraient le tiroir aussitôt ouvert), mais on peut encore se resserrer,
      // par exemple après un changement de langue dans le tiroir. Si la fenêtre change de largeur pendant le
      // blocage, on mesure en retirant à la barre la place que prendrait la barre de défilement.
      const locked = document.body.style.overflow === 'hidden'
      const held = locked && window.innerWidth === width.current
      if (!locked) gutter.current = window.innerWidth - document.documentElement.clientWidth
      width.current = window.innerWidth
      const pad = locked && !held ? gutter.current : 0
      // Aucune transition pendant la mesure (voir mega.css) : avec « réduire les animations », chaque propriété
      // reçoit une transition très courte et les espacements garderaient leur ancienne valeur le temps de mesurer.
      el.dataset.measuring = ''
      if (pad) el.style.paddingRight = `${pad}px`
      // Petit écran : la feuille de style range déjà langues, Connexion, Tarifs et démo dans le tiroir, qui est
      // alors le seul accès : on part directement des mises en page avec menu replié.
      let n = Math.max(held ? FITS.indexOf(el.dataset.fit ?? '') : 0, window.matchMedia?.(SMALL).matches ? BURGER : 0)
      for (; n < FITS.length - 1; n++) {
        el.dataset.fit = FITS[n]
        if (!overflows()) break
      }
      el.dataset.fit = FITS[n]
      if (pad) el.style.paddingRight = ''
      box.getBoundingClientRect()
      delete el.dataset.measuring
      setFit(n)
    }
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    measure()
    // la ligne et chacun de ses blocs : une police appliquée un peu après son chargement élargit les textes
    // sans changer la largeur de la ligne
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(later) : null
    for (const k of [box, ...Array.from(box.children)]) ro?.observe(k)
    // blocage puis déblocage du défilement : on remesure une fois la page rendue
    const mo = typeof MutationObserver === 'function' ? new MutationObserver(later) : null
    mo?.observe(document.body, { attributes: true, attributeFilter: ['style'] })
    window.addEventListener('resize', later)
    const fonts = document.fonts
    fonts?.addEventListener?.('loadingdone', later)
    fonts?.ready?.then(later)
    return () => {
      alive = false
      cancelAnimationFrame(frame)
      ro?.disconnect()
      mo?.disconnect()
      window.removeEventListener('resize', later)
      fonts?.removeEventListener?.('loadingdone', later)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return FITS[fit]
}

function Panel({ mega, k, c, go, onNavigate }: { mega: Mega; k: MenuKey; c: Copy; go: Go; onNavigate: () => void }) {
  const m = mega.menus[k]
  const link = (to: Target) => (e: ReactMouseEvent) => {
    onNavigate()
    go(to)(e)
  }
  return (
    <div className={`mm-panel mm-panel--${m.layout}`} id={`mm-panel-${k}`} role="region" aria-label={m.label}>
      {m.intros && (
        <div className="mm-intro">
          {m.intros.map((it, n) => (
            <div key={it.title} className="mm-intro__block">
              {n > 0 && <hr />}
              <h3>
                {it.icon && (
                  <span className="mm-intro__ico">
                    <Icon name={it.icon} size={18} />
                  </span>
                )}
                {it.title}
              </h3>
              <p>{it.text}</p>
              <a className="mm-more" href={hrefOf(it.to)} onClick={link(it.to)}>
                {it.cta} <Icon name="arrow" size={16} />
              </a>
            </div>
          ))}
          {m.quick && (
            <>
              <hr />
              <ul className="mm-quick">
                {m.quick.map((q) => (
                  <li key={q.label}>
                    <a href={hrefOf(q.to)} onClick={link(q.to)}>
                      {q.label}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <div className="mm-cols" style={{ ['--mm-cols' as string]: m.cols.length }}>
        {m.cols.map((col, n) => (
          <div key={n} className="mm-col">
            {col.heading ? <h4>{col.heading}</h4> : m.layout === 'intro' && m.cols.length > 1 && <h4 aria-hidden className="mm-col__spacer" />}
            <ul>
              {col.items.map((it) => {
                const page = it.to.startsWith('#') ? null : PAGES[it.to as PageKey]
                return (
                  <li key={it.label}>
                    <a href={hrefOf(it.to)} onClick={link(it.to)} className={it.desc ? 'has-desc' : ''}>
                      {it.desc && page && (
                        <span className="mm-link__ico">
                          <Icon name={page.icon} size={18} />
                        </span>
                      )}
                      <span>
                        <b>{it.label}</b>
                        {it.desc && <small>{it.desc}</small>}
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      <a className="mm-feature" href={hrefOf(m.featured.to)} onClick={link(m.featured.to)}>
        <span className="mm-feature__art">
          <Illustration visual={m.featured.visual} c={c} compact />
          <em className="mm-feature__tag">{m.featured.tag}</em>
        </span>
        <b>{m.featured.title}</b>
        <span className="mm-feature__text">{m.featured.text}</span>
        <span className="mm-more">
          {m.featured.cta} <Icon name="arrow" size={16} />
        </span>
      </a>
    </div>
  )
}

export function MegaNav({
  c,
  mega,
  lang,
  setLang,
  go,
  openDemo,
  loginHref,
  brand,
  current,
}: {
  c: Copy
  mega: Mega
  lang: LandingLang
  setLang: (l: LandingLang) => void
  go: Go
  openDemo: () => void
  loginHref: string
  brand: React.ReactNode
  current: PageKey | null
}) {
  const [open, setOpen] = useState<MenuKey | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [acc, setAcc] = useState<MenuKey | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const row = useRef<HTMLDivElement>(null)
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({})
  const hover = useHoverIntent(setOpen, () => setOpen(null))
  const burger = useFit(ref, row, [lang, current]).includes('burger')

  // menus repliés : pas de panneau déroulant ; barre complète : pas de tiroir
  useEffect(() => {
    if (burger) setOpen(null)
    else setDrawer(false)
  }, [burger])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // Échap ferme ; clic en dehors ferme
  useEffect(() => {
    if (!open && !drawer) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (open) triggers.current[open]?.focus()
      setOpen(null)
      setDrawer(false)
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, drawer])
  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawer])

  const close = () => {
    setOpen(null)
    setDrawer(false)
  }
  const activeMenu = current && current !== 'pricing' ? menuOf(mega.menus, current) : null

  const langs = (long: boolean) => (
    <div className="lp-lang" role="group" aria-label="Language">
      {(['en', 'fr', 'ar'] as LandingLang[]).map((l) => (
        <button key={l} type="button" className={l === lang ? 'is-active' : ''} onClick={() => setLang(l)} lang={l}>
          {long ? (l === 'ar' ? 'العربية' : l === 'fr' ? 'Français' : 'English') : l === 'ar' ? 'ع' : l.toUpperCase()}
        </button>
      ))}
    </div>
  )

  return (
    <header ref={ref} className={`lp-nav mm-nav${scrolled ? ' is-scrolled' : ''}${open ? ' is-mega' : ''}${drawer ? ' is-open' : ''}`} onMouseLeave={hover.leave} onMouseEnter={hover.clear}>
      <div className="lp-wrap lp-nav__in" ref={row}>
        {brand}
        <nav className="mm-triggers" aria-label="Main">
          {MENU_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              ref={(el) => {
                triggers.current[k] = el
              }}
              className={`mm-trigger${open === k ? ' is-open' : ''}${activeMenu === k ? ' is-current' : ''}`}
              aria-expanded={open === k}
              aria-controls={`mm-panel-${k}`}
              onMouseEnter={() => hover.enter(k, open ? 0 : 90)}
              onClick={() => setOpen(open === k ? null : k)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setOpen(k)
                  requestAnimationFrame(() => ref.current?.querySelector<HTMLAnchorElement>(`#mm-panel-${k} a`)?.focus())
                }
              }}
            >
              {mega.menus[k].label}
              <Icon name="chevron" size={16} />
            </button>
          ))}
        </nav>
        <div className="lp-nav__cta">
          {langs(false)}
          <a className="lp-btn lp-btn--ghost" href={loginHref}>
            {c.nav.login}
          </a>
          <a className={`lp-btn lp-btn--ghost mm-pricing${current === 'pricing' ? ' is-current' : ''}`} href={hrefOf('pricing')} onClick={go('pricing')} aria-current={current === 'pricing' ? 'page' : undefined}>
            {mega.ui.pricing}
          </a>
          <button type="button" className="lp-btn lp-btn--primary" onClick={openDemo}>
            {c.nav.demo}
          </button>
        </div>
        <button type="button" className="lp-nav__burger mm-burger" aria-expanded={drawer} aria-label={drawer ? mega.ui.close : mega.ui.open} onClick={() => setDrawer(!drawer)}>
          <Icon name={drawer ? 'x' : 'menu'} size={24} />
        </button>
      </div>

      <div className={`mm-dropdown${open ? ' is-visible' : ''}`} aria-hidden={!open}>
        <div className="mm-dropdown__frame">
          {open && (
            <div className="lp-wrap mm-dropdown__in" key={open} onMouseEnter={hover.clear}>
              <Panel mega={mega} k={open} c={c} go={go} onNavigate={close} />
            </div>
          )}
        </div>
      </div>
      {open && <div className="mm-scrim" aria-hidden onMouseEnter={hover.leave} />}

      {drawer && (
        <div className="mm-drawer">
          <div className="mm-drawer__scroll">
            {MENU_KEYS.map((k) => {
              const m = mega.menus[k]
              const isOpen = acc === k
              const all = [...(m.intros ?? []).map((i) => ({ to: i.to, label: i.title, desc: i.text })), ...m.cols.flatMap((col) => col.items), ...(m.quick ?? [])]
              return (
                <section key={k} className={`mm-acc${isOpen ? ' is-open' : ''}`}>
                  <button type="button" className="mm-acc__head" aria-expanded={isOpen} onClick={() => setAcc(isOpen ? null : k)}>
                    {m.label}
                    <Icon name="chevron" size={20} />
                  </button>
                  {isOpen && (
                    <div className="mm-acc__body">
                      {all.map((it) => (
                        <a key={`${it.label}`} href={hrefOf(it.to)} onClick={(e) => (close(), go(it.to)(e))}>
                          <b>{it.label}</b>
                          {'desc' in it && it.desc && <small>{it.desc}</small>}
                        </a>
                      ))}
                      <a className="mm-acc__feature" href={hrefOf(m.featured.to)} onClick={(e) => (close(), go(m.featured.to)(e))}>
                        <em>{m.featured.tag}</em>
                        <b>{m.featured.title}</b>
                        <small>{m.featured.text}</small>
                      </a>
                    </div>
                  )}
                </section>
              )
            })}
            <a className="mm-acc__head mm-acc__link" href={hrefOf('pricing')} onClick={(e) => (close(), go('pricing')(e))}>
              {mega.ui.pricing}
              <Icon name="arrow" size={20} />
            </a>
          </div>
          <div className="mm-drawer__foot">
            {langs(true)}
            <a className="lp-btn lp-btn--ghost lp-btn--block" href={loginHref}>
              {c.nav.login}
            </a>
            <button type="button" className="lp-btn lp-btn--primary lp-btn--block" onClick={() => (close(), openDemo())}>
              {c.nav.demo}
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
