import { useEffect, useState, type FormEvent } from 'react'
import type { Copy } from './copy'
import { Illustration, type Go } from './MegaNav'
import { PAGES, menuOf, hrefOf, type Mega, type PageKey, type Target } from './megaContent'
import { Icon } from './visuals'

/** Page de présentation ouverte depuis un méga-menu (/features/…, /solutions/…, /company/…) */
export function SubPage({ k, c, mega, go, openDemo }: { k: PageKey; c: Copy; mega: Mega; go: Go; openDemo: () => void }) {
  const p = mega.pages[k]
  const meta = PAGES[k]
  // Liens voisins : les autres entrées du même menu
  const menuKey = menuOf(mega.menus, k)
  const menu = mega.menus[menuKey]
  const seen = new Set<string>([k])
  const related: { to: Target; label: string }[] = []
  for (const it of [...(menu.intros ?? []).map((i) => ({ to: i.to, label: i.title })), ...menu.cols.flatMap((col) => col.items), ...(menu.quick ?? [])]) {
    if (it.to.startsWith('#') || seen.has(it.to)) continue
    seen.add(it.to)
    related.push(it)
  }
  return (
    <main className="mm-page" key={k}>
      <section className="mm-page__hero">
        <div className="lp-hero__bg" aria-hidden>
          <span className="lp-orb lp-orb--1" />
          <span className="lp-grid" />
        </div>
        <div className="lp-wrap mm-page__hero-in">
          <div className="mm-page__copy">
            <nav className="mm-crumbs" aria-label="Breadcrumb">
              <a href="/" onClick={go('#top')}>
                {mega.ui.home}
              </a>
              <span aria-hidden>/</span>
              <span>{menu.label}</span>
            </nav>
            <span className="lp-eyebrow lp-eyebrow--light lp-anim">
              <Icon name={meta.icon} size={14} /> {p.eyebrow}
            </span>
            <h1 className="lp-anim" style={{ animationDelay: '0.08s' }}>
              {p.title}
            </h1>
            <p className="lp-anim" style={{ animationDelay: '0.16s' }}>
              {p.lead}
            </p>
            <div className="lp-hero__cta lp-anim" style={{ animationDelay: '0.24s' }}>
              <button type="button" className="lp-btn lp-btn--primary lp-btn--lg" onClick={openDemo}>
                {mega.ui.demo} <Icon name="arrow" size={18} />
              </button>
              <a className="lp-btn lp-btn--glass lp-btn--lg" href="/#tour" onClick={go('#tour')}>
                <Icon name="play" size={16} /> {c.hero.secondary}
              </a>
            </div>
          </div>
          <div className="mm-page__visual lp-anim" style={{ animationDelay: '0.2s' }}>
            <Illustration visual={meta.visual} c={c} />
          </div>
        </div>
      </section>

      <section className="lp-section mm-page__points">
        <div className="lp-wrap">
          <div className="mm-points">
            {p.points.map(([t, d], n) => (
              <article key={t} className="mm-point lp-anim" style={{ animationDelay: `${0.1 + n * 0.08}s` }}>
                <span className="mm-point__n">{String(n + 1).padStart(2, '0')}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
          {k === 'contact' && <ContactCard mega={mega} openDemo={openDemo} />}
        </div>
      </section>

      {related.length > 0 && (
        <section className="lp-section mm-related">
          <div className="lp-wrap">
            <h2>{mega.ui.related}</h2>
            <div className="mm-related__grid">
              {related.slice(0, 6).map((r) => {
                const rp = PAGES[r.to as PageKey]
                return (
                  <a key={r.to} href={hrefOf(r.to)} onClick={go(r.to)} className="mm-related__card">
                    <span className="mm-link__ico">
                      <Icon name={rp.icon} size={20} />
                    </span>
                    <b>{r.label}</b>
                    <small>{mega.pages[r.to as PageKey].lead}</small>
                    <span className="mm-more">
                      {mega.ui.explore} <Icon name="arrow" size={16} />
                    </span>
                  </a>
                )
              })}
            </div>
          </div>
        </section>
      )}

      <section className="lp-cta">
        <div className="lp-wrap lp-cta__in">
          <h2>{mega.ui.demoTitle}</h2>
          <p>{mega.ui.demoText}</p>
          <div className="lp-hero__cta">
            <button type="button" className="lp-btn lp-btn--white lp-btn--lg" onClick={openDemo}>
              {mega.ui.demo} <Icon name="arrow" size={18} />
            </button>
            <a className="lp-btn lp-btn--glass lp-btn--lg" href="/" onClick={go('#top')}>
              {mega.ui.back}
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}

function ContactCard({ mega, openDemo }: { mega: Mega; openDemo: () => void }) {
  return (
    <div className="mm-contact">
      <span className="mm-link__ico">
        <Icon name="mail" size={22} />
      </span>
      <div>
        <b>{mega.ui.demoTitle}</b>
        <p>{mega.ui.demoText}</p>
      </div>
      <button type="button" className="lp-btn lp-btn--primary lp-btn--lg" onClick={openDemo}>
        {mega.ui.demo} <Icon name="arrow" size={18} />
      </button>
    </div>
  )
}

/* ---------------------------------------------------------------- assistant flottant « Around » */

type Msg = { from: 'bot' | 'me'; text: string; to?: Target; demo?: boolean }

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ًͯ-ْ]/g, '')
    .replace(/[أإآ]/g, 'ا')

/** Assistant de la vitrine : réponses sur Mearsaad (questions fréquentes), lien vers la bonne page ou la démo */
export function AskAround({ mega, go, openDemo }: { mega: Mega; go: Go; openDemo: () => void }) {
  const a = mega.ask
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  useEffect(() => setMsgs([{ from: 'bot', text: a.hello }]), [a.hello])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  useEffect(() => {
    document.querySelector('.mm-ask__log')?.scrollTo({ top: 1e6, behavior: 'smooth' })
  }, [msgs, typing])

  const answer = (q: string) => {
    const n = norm(q)
    let best: (typeof a.qa)[number] | null = null
    let score = 0
    for (const item of a.qa) {
      const s = item.keys.filter((key) => n.includes(norm(key))).length + (norm(item.q) === n ? 5 : 0)
      if (s > score) {
        score = s
        best = item
      }
    }
    setMsgs((m) => [...m, { from: 'me', text: q }])
    setTyping(true)
    window.setTimeout(() => {
      setTyping(false)
      setMsgs((m) => [...m, best ? { from: 'bot', text: best.a, to: best.to } : { from: 'bot', text: a.fallback, demo: true }])
    }, 650)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = text.trim()
    if (!q) return
    setText('')
    answer(q)
  }
  const asked = new Set(msgs.filter((m) => m.from === 'me').map((m) => m.text))

  return (
    <div className={`mm-ask${open ? ' is-open' : ''}`}>
      {open && (
        <div className="mm-ask__panel" role="dialog" aria-label={a.title}>
          <header>
            <span className="mm-ask__avatar">
              <img src="/around-logo.png" alt="" width={64} height={64} />
            </span>
            <span>
              <b>{a.title}</b>
              <small>
                <i /> {a.subtitle}
              </small>
            </span>
            <button type="button" onClick={() => setOpen(false)} aria-label={mega.ui.close}>
              <Icon name="x" size={18} />
            </button>
          </header>
          <div className="mm-ask__log" aria-live="polite">
            {msgs.map((m, n) => (
              <div key={n} className={`mm-ask__msg is-${m.from}`}>
                <p>{m.text}</p>
                {m.to && (
                  <a
                    href={hrefOf(m.to)}
                    onClick={(e) => {
                      setOpen(false)
                      go(m.to!)(e)
                    }}
                  >
                    {a.readMore} <Icon name="arrow" size={14} />
                  </a>
                )}
                {m.demo && (
                  <button type="button" onClick={() => (setOpen(false), openDemo())}>
                    {a.demo} <Icon name="arrow" size={14} />
                  </button>
                )}
              </div>
            ))}
            {typing && (
              <div className="mm-ask__msg is-bot">
                <span className="tv-typing">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
            <div className="mm-ask__chips">
              <small>{a.suggestions}</small>
              {a.qa
                .filter((x) => !asked.has(x.q))
                .slice(0, 4)
                .map((x) => (
                  <button key={x.q} type="button" onClick={() => answer(x.q)}>
                    {x.q}
                  </button>
                ))}
            </div>
          </div>
          <form onSubmit={submit}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={a.placeholder} aria-label={a.placeholder} maxLength={300} />
            <button type="submit" aria-label={a.send} disabled={!text.trim()}>
              <Icon name="arrow" size={18} />
            </button>
          </form>
          <p className="mm-ask__note">{a.disclaimer}</p>
        </div>
      )}
      <button type="button" className="mm-ask__fab" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="mm-ask__fab-ico">
          <Icon name={open ? 'x' : 'spark'} size={18} />
        </span>
        {a.button}
      </button>
    </div>
  )
}
