import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { TOURS, type Copy, type LandingLang, type TourKey } from './copy'
import type { Go } from './MegaNav'
import { hrefOf, menuOf, type Mega } from './megaContent'
import { TOUR_PAGE } from './tourContent'
import { Icon, TOUR_ICONS, TourVisual } from './visuals'

type Box = { top: number; left: number; width: number; height: number }
type Place = 'below' | 'above' | 'side' | 'inside' | 'center'
/** Hauteur de la bulle à pleine largeur (a), hauteur et largeur actuelles (cur, w) */
type TipSize = { a: number; cur: number; w: number }

const TIP_MAX = 340
const GAP = 16
const MARGIN = 12

/** Position d'un élément dans la scène, sans les transformations CSS (animations d'entrée des schémas) */
function boxIn(el: HTMLElement, root: HTMLElement): Box {
  let x = 0
  let y = 0
  let n: HTMLElement | null = el
  while (n && n !== root) {
    x += n.offsetLeft
    y += n.offsetTop
    const p = n.offsetParent as HTMLElement | null
    if (p && p !== root) {
      x += p.clientLeft
      y += p.clientTop
    }
    n = p
  }
  if (n === root) return { top: y, left: x, width: el.offsetWidth, height: el.offsetHeight }
  // Chaîne interrompue : repli sur la boîte affichée
  const r = el.getBoundingClientRect()
  const s = root.getBoundingClientRect()
  return { top: r.top - s.top - root.clientTop, left: r.left - s.left - root.clientLeft, width: r.width, height: r.height }
}

/** Place la bulle : sous la zone, sinon au-dessus, sinon à côté (largeur réduite si besoin), sinon dans le coin qui la couvre le moins */
function placeTip(box: Box | null, W: number, H: number, size: TipSize): { place: Place; style: CSSProperties } {
  const tw = Math.max(200, Math.min(TIP_MAX, W - 2 * MARGIN))
  const h = size.a
  if (!box) return { place: 'center', style: { width: tw, left: Math.max(MARGIN, (W - tw) / 2), top: Math.max(MARGIN, (H - h) / 2) } }
  const center = box.left + box.width / 2
  const clampX = (x: number) => Math.max(MARGIN, Math.min(W - tw - MARGIN, x))
  const arrow = (x: number) => ({ '--gt-arrow': `${Math.max(18, Math.min(tw - 18, center - x))}px` }) as CSSProperties
  if (H - (box.top + box.height) >= h + GAP + MARGIN) {
    const x = clampX(center - tw / 2)
    return { place: 'below', style: { width: tw, left: x, top: box.top + box.height + GAP, ...arrow(x) } }
  }
  if (box.top >= h + GAP + MARGIN) {
    const x = clampX(center - tw / 2)
    return { place: 'above', style: { width: tw, left: x, top: box.top - GAP - h, ...arrow(x) } }
  }
  const right = W - (box.left + box.width)
  const left = box.left
  const sideW = Math.min(tw, Math.max(right, left) - GAP - MARGIN)
  if (sideW >= 220) {
    // une bulle plus étroite est plus haute : on prend sa hauteur réelle dès qu'elle est connue à cette largeur
    const hs = Math.abs(size.w - sideW) < 1 ? size.cur : h
    const top = Math.max(MARGIN, Math.min(H - hs - MARGIN, box.top + box.height / 2 - hs / 2))
    return { place: 'side', style: { width: sideW, left: right >= left ? box.left + box.width + GAP : box.left - GAP - sideW, top } }
  }
  const corners: [number, number][] = [
    [MARGIN, H - h - MARGIN],
    [W - tw - MARGIN, H - h - MARGIN],
    [MARGIN, MARGIN],
    [W - tw - MARGIN, MARGIN],
  ]
  const overlap = ([x, y]: [number, number]) =>
    Math.max(0, Math.min(x + tw, box.left + box.width) - Math.max(x, box.left)) * Math.max(0, Math.min(y + h, box.top + box.height) - Math.max(y, box.top))
  const [x, y] = corners.reduce((best, c) => (overlap(c) < overlap(best) ? c : best))
  return { place: 'inside', style: { width: tw, left: Math.max(MARGIN, x), top: Math.max(MARGIN, y) } }
}

const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Page /product-tour : visite guidée pas à pas des sections de Mearsaad (zone mise en lumière + bulle explicative) */
export function TourPage({ lang, c, mega, go, openDemo }: { lang: LandingLang; c: Copy; mega: Mega; go: Go; openDemo: () => void }) {
  const t = TOUR_PAGE[lang]
  const total = t.steps.length
  // -1 : écran d'accueil ; total : écran de fin
  const [step, setStep] = useState(-1)
  const [box, setBox] = useState<Box | null>(null)
  const [tip, setTip] = useState<TipSize>({ a: 240, cur: 240, w: TIP_MAX })
  const [faq, setFaq] = useState<number | null>(0)
  const stage = useRef<HTMLDivElement>(null)
  const tipEl = useRef<HTMLDivElement>(null)
  const nextBtn = useRef<HTMLButtonElement>(null)
  const endBtn = useRef<HTMLButtonElement>(null)
  const cur = step >= 0 && step < total ? t.steps[step] : null
  const chapter: TourKey = cur ? cur.k : step >= total ? 'reports' : 'monitor'
  const crumb = mega.menus[menuOf(mega.menus, 'tour')].label

  // Zone à mettre en lumière, relative à la scène
  const measure = useCallback(() => {
    const root = stage.current
    const el = root && cur ? root.querySelector<HTMLElement>(cur.target) : null
    if (!root || !el) return setBox(null)
    const b = boxIn(el, root)
    const pad = 8
    const next = { top: b.top - pad, left: b.left - pad, width: b.width + pad * 2, height: b.height + pad * 2 }
    setBox((p) => (p && p.top === next.top && p.left === next.left && p.width === next.width && p.height === next.height ? p : next))
  }, [cur])

  useLayoutEffect(() => {
    measure()
    // les schémas se mettent en place à l'entrée (images, polices) : on remesure ensuite
    const a = window.setTimeout(measure, 450)
    const b = window.setTimeout(measure, 1200)
    window.addEventListener('resize', measure)
    const ro = typeof ResizeObserver !== 'undefined' && stage.current ? new ResizeObserver(() => measure()) : null
    if (ro && stage.current) ro.observe(stage.current)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
      window.removeEventListener('resize', measure)
      ro?.disconnect()
    }
  }, [measure])

  // Taille de la bulle : à pleine largeur (pour choisir sa place) et à sa largeur actuelle
  const measureTip = useCallback(() => {
    const el = tipEl.current
    const s = stage.current
    if (!el || !s) return
    const tw = Math.max(200, Math.min(TIP_MAX, s.clientWidth - 2 * MARGIN))
    const w = el.offsetWidth
    const now = el.offsetHeight
    let a = now
    if (Math.abs(w - tw) >= 1) {
      const prev = el.style.width
      el.style.width = `${tw}px`
      a = el.offsetHeight
      el.style.width = prev
    }
    setTip((p) => (p.a === a && p.cur === now && p.w === w ? p : { a, cur: now, w }))
  }, [])
  useLayoutEffect(measureTip)
  useEffect(() => {
    const el = tipEl.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measureTip())
    ro.observe(el)
    return () => ro.disconnect()
  }, [step, measureTip])

  // Focus : bouton Suivant à chaque étape, bouton principal de la carte de fin
  useEffect(() => {
    if (step >= 0 && step < total) nextBtn.current?.focus({ preventScroll: true })
    else if (step >= total) endBtn.current?.focus({ preventScroll: true })
  }, [step, total])

  // Téléphone : la bulle passe sous le schéma, on la garde à l'écran
  useEffect(() => {
    if (!isPhone() || step < 0) return
    const el = step < total ? tipEl.current : endBtn.current?.closest<HTMLElement>('.gt-card')
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.bottom > window.innerHeight || r.top < 72) el.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [step, total])

  const go2 = (n: number) => setStep(Math.max(0, Math.min(total, n)))
  const onKey = (e: ReactKeyboardEvent) => {
    if (step < 0 || step >= total) return
    const fwd = c.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
    const back = c.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
    if (e.key === fwd) (e.preventDefault(), go2(step + 1))
    if (e.key === back && step > 0) (e.preventDefault(), go2(step - 1))
  }

  const s = stage.current
  const placed = cur && s ? placeTip(box, s.clientWidth, s.clientHeight, tip) : null
  const tipId = `gt-tip-${step}`

  return (
    <main className="mm-page pr-page gt-page" key="tour">
      <section className="pr-hero gt-hero">
        <div className="lp-wrap pr-hero__in">
          <nav className="mm-crumbs" aria-label="Breadcrumb">
            <a href="/" onClick={go('#top')}>
              {mega.ui.home}
            </a>
            <span aria-hidden>/</span>
            <span>{crumb}</span>
          </nav>
          <span className="pr-kicker lp-anim">{t.eyebrow}</span>
          <h1 className="lp-anim" style={{ animationDelay: '0.06s' }}>
            {t.title}
          </h1>
          <p className="lp-anim" style={{ animationDelay: '0.12s' }}>
            {t.lead}
          </p>
          <div className="gt-hero__cta lp-anim" style={{ animationDelay: '0.18s' }}>
            <button type="button" className="lp-btn lp-btn--primary lp-btn--lg" onClick={openDemo}>
              {mega.ui.demo}
            </button>
            <a className="lp-btn lp-btn--ghost lp-btn--lg" href={hrefOf('pricing')} onClick={go('pricing')}>
              {t.pricing}
            </a>
          </div>
        </div>
      </section>

      <section className="gt-player-wrap">
        <div className="lp-wrap gt-player" onKeyDown={onKey}>
          <p className="gt-sr" aria-live="polite">
            {cur ? `${t.step(step + 1, total)}. ${cur.title}` : step >= total ? t.endTitle : ''}
          </p>
          <aside className="gt-chapters" aria-label={t.chapters}>
            <h2>{t.chapters}</h2>
            {TOURS.map((k) => {
              const first = t.steps.findIndex((x) => x.k === k)
              const count = t.steps.filter((x) => x.k === k).length
              const active = !!cur && cur.k === k
              const done = step >= total || (step >= 0 && t.steps.findIndex((x, n) => x.k === k && n >= step) === -1)
              return (
                <button
                  key={k}
                  type="button"
                  className={`gt-chapter${active ? ' is-active' : ''}${done ? ' is-done' : ''}`}
                  aria-current={active ? 'step' : undefined}
                  onClick={() => go2(first)}
                >
                  <span className="gt-chapter__ico" aria-hidden>
                    <Icon name={done ? 'check' : TOUR_ICONS[k]} size={18} />
                  </span>
                  <span>
                    <b>{t.names[k]}</b>
                    <small>
                      {t.stepsCount(count)}
                      {done && <span className="gt-sr">, {t.done}</span>}
                    </small>
                  </span>
                </button>
              )
            })}
          </aside>

          <div className="gt-frame">
            <div className="gt-frame__bar" aria-hidden>
              <span className="gt-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="gt-url" dir="ltr">
                <Icon name="lock" size={12} /> app.mearsaad.com
              </span>
            </div>
            <div className="gt-app">
              <nav className="gt-app__nav" aria-hidden>
                <img src="/brand/mearsaad-intl-icon.png" alt="" width={256} height={256} />
                {TOURS.map((k) => (
                  <span key={k} className={chapter === k ? 'is-active' : ''}>
                    <Icon name={TOUR_ICONS[k]} size={18} />
                  </span>
                ))}
              </nav>
              <div className="gt-app__main">
                <header className="gt-app__head" aria-hidden>
                  <b>{t.names[chapter]}</b>
                  <span>{c.tour.items[chapter].title}</span>
                </header>
                <div className={`gt-stage${cur ? '' : ' has-overlay'}`} ref={stage}>
                  <div className="gt-stage__visual" key={chapter} aria-hidden>
                    <TourVisual k={chapter} c={c} />
                  </div>

                  {cur && box && <span className="gt-spot" style={box} aria-hidden key={`spot-${step}`} />}
                  {cur && (
                    <div
                      ref={tipEl}
                      className={`gt-tip is-${placed ? placed.place : 'center'}`}
                      style={placed ? placed.style : { visibility: 'hidden' }}
                      role="group"
                      aria-labelledby={`${tipId}-t`}
                      aria-describedby={`${tipId}-d`}
                      key={tipId}
                    >
                      <small>{t.step(step + 1, total)}</small>
                      <h3 id={`${tipId}-t`}>{cur.title}</h3>
                      <p id={`${tipId}-d`}>{cur.text}</p>
                      <div className="gt-tip__bar" aria-hidden>
                        <i style={{ width: `${((step + 1) / total) * 100}%` }} />
                      </div>
                      <div className="gt-tip__nav">
                        <button type="button" className="gt-tip__prev" onClick={() => go2(step - 1)} disabled={step === 0}>
                          {t.prev}
                        </button>
                        <button type="button" ref={nextBtn} className="lp-btn lp-btn--primary" onClick={() => go2(step + 1)}>
                          {step === total - 1 ? t.finish : t.next} <Icon name="arrow" size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {step < 0 && (
                    <div className="gt-overlay">
                      <div className="gt-card">
                        <span className="gt-card__ico" aria-hidden>
                          <Icon name="play" size={22} />
                        </span>
                        <h3>{t.title}</h3>
                        <p>{t.startText}</p>
                        <small>{t.minutes}</small>
                        <button type="button" className="lp-btn lp-btn--primary lp-btn--lg" onClick={() => go2(0)}>
                          {t.start} <Icon name="arrow" size={18} />
                        </button>
                      </div>
                    </div>
                  )}
                  {step >= total && (
                    <div className="gt-overlay">
                      <div className="gt-card">
                        <span className="gt-card__ico" aria-hidden>
                          <Icon name="check" size={22} />
                        </span>
                        <h3>{t.endTitle}</h3>
                        <p>{t.endText}</p>
                        <div className="gt-card__cta">
                          <button type="button" ref={endBtn} className="lp-btn lp-btn--primary lp-btn--lg" onClick={openDemo}>
                            {t.endCta} <Icon name="arrow" size={18} />
                          </button>
                          <button type="button" className="gt-tip__prev" onClick={() => go2(0)}>
                            {t.restart}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section gt-value">
        <div className="lp-wrap">
          <h2 className="pr-h2">{t.value.title}</h2>
          <p className="gt-value__lead">{t.value.text}</p>
          <div className="pr-included__grid">
            {t.value.items.map(([icon, title, text]) => (
              <div key={title} className="pr-included__item">
                <span className="mm-link__ico" aria-hidden>
                  <Icon name={icon} size={22} />
                </span>
                <b>{title}</b>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section pr-faq">
        <div className="lp-wrap pr-faq__in">
          <div>
            <h2 className="pr-h2">{t.faq.title}</h2>
          </div>
          <div className="pr-faq__list">
            {t.faq.items.map((f, n) => {
              const open = faq === n
              return (
                <div key={f.q} className={`pr-faq__item${open ? ' is-open' : ''}`}>
                  <h3>
                    <button type="button" aria-expanded={open} onClick={() => setFaq(open ? null : n)}>
                      {f.q}
                      <Icon name="chevron" size={20} />
                    </button>
                  </h3>
                  {open && (
                    <div className="pr-faq__a">
                      <p>{f.a}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="lp-cta">
        <div className="lp-wrap lp-cta__in">
          <h2>{t.band.title}</h2>
          <p>{t.band.text}</p>
          <div className="lp-hero__cta">
            <button type="button" className="lp-btn lp-btn--white lp-btn--lg" onClick={openDemo}>
              {t.band.cta} <Icon name="arrow" size={18} />
            </button>
            <a className="lp-btn lp-btn--glass lp-btn--lg" href={hrefOf('pricing')} onClick={go('pricing')}>
              {t.band.second}
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
