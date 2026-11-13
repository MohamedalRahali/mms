import { useState } from 'react'
import type { LandingLang } from './copy'
import type { Go } from './MegaNav'
import { hrefOf, type Mega } from './megaContent'
import { PRICING, type Cell } from './pricingContent'
import { Icon } from './visuals'

/** Page /pricing : quatre formules sur devis, comparatif détaillé, inclus partout, questions fréquentes */
export function Pricing({ lang, mega, go, openDemo }: { lang: LandingLang; mega: Mega; go: Go; openDemo: () => void }) {
  const t = PRICING[lang]
  const [faq, setFaq] = useState<number | null>(0)
  const cell = (v: Cell) =>
    v === true ? (
      <span className="pr-yes" aria-label={t.compare.yes}>
        <Icon name="check" size={16} />
      </span>
    ) : v === false ? (
      <span className="pr-no" aria-label={t.compare.no}>
        –
      </span>
    ) : (
      <span className="pr-txt">{v}</span>
    )

  return (
    <main className="mm-page pr-page" key="pricing">
      <section className="pr-hero">
        <div className="lp-wrap pr-hero__in">
          <nav className="mm-crumbs" aria-label="Breadcrumb">
            <a href="/" onClick={go('#top')}>
              {mega.ui.home}
            </a>
            <span aria-hidden>/</span>
            <span>{t.eyebrow}</span>
          </nav>
          <span className="pr-kicker lp-anim">{t.eyebrow}</span>
          <h1 className="lp-anim" style={{ animationDelay: '0.06s' }}>
            {t.title}
          </h1>
          <p className="lp-anim" style={{ animationDelay: '0.12s' }}>
            {t.lead}
          </p>
          <small className="pr-note lp-anim" style={{ animationDelay: '0.18s' }}>
            <Icon name="doc" size={14} /> {t.note}
          </small>
        </div>
      </section>

      <section className="pr-plans-wrap">
        <div className="lp-wrap pr-plans">
          {t.plans.map((p, n) => (
            <article key={p.key} className={`pr-plan pr-plan--${p.key} lp-anim`} style={{ animationDelay: `${0.1 + n * 0.07}s` }}>
              <header>
                <h2>{p.name}</h2>
                <p>{p.tagline}</p>
                <button type="button" className="lp-btn lp-btn--primary lp-btn--block" onClick={openDemo}>
                  {t.contactTeam}
                </button>
              </header>
              <div className="pr-plan__block">
                <h3>{t.capsTitle}</h3>
                <ul className="pr-caps">
                  {p.caps.map((x) => (
                    <li key={x}>
                      <Icon name="check" size={16} /> {x}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pr-plan__block">
                <h3>{t.bestTitle}</h3>
                <ul className="pr-list">
                  {p.best.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <div className="pr-plan__block">
                <h3>{t.featTitle}</h3>
                <ul className="pr-list">
                  {p.features.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <button type="button" className="pr-plan__quote" onClick={openDemo}>
                {t.quote} <Icon name="arrow" size={16} />
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section pr-compare">
        <div className="lp-wrap">
          <span className="pr-kicker">{t.compare.eyebrow}</span>
          <h2 className="pr-h2">{t.compare.title}</h2>
          <div className="pr-table-scroll">
            <table className="pr-table">
              <thead>
                <tr>
                  <th scope="col">{t.compare.feature}</th>
                  {t.plans.map((p) => (
                    <th key={p.key} scope="col">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              {t.compare.groups.map((g) => (
                <tbody key={g.title}>
                  <tr className="pr-table__group">
                    <th colSpan={t.plans.length + 1} scope="colgroup">
                      {g.title}
                    </th>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.label}>
                      <th scope="row">{r.label}</th>
                      {r.cells.map((v, n) => (
                        <td key={n}>{cell(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
              <tfoot>
                <tr>
                  <th />
                  {t.plans.map((p) => (
                    <td key={p.key}>
                      <button type="button" className="lp-btn lp-btn--ghost pr-table__cta" onClick={openDemo}>
                        {t.quote}
                      </button>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      <section className="pr-included">
        <div className="lp-wrap">
          <h2 className="pr-h2">{t.included.title}</h2>
          <div className="pr-included__grid">
            {t.included.items.map(([icon, title, text]) => (
              <div key={title} className="pr-included__item">
                <span className="mm-link__ico">
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
            <span className="pr-kicker">{t.faq.eyebrow}</span>
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
                      {f.to && (
                        <a href={hrefOf(f.to)} onClick={go(f.to)}>
                          {f.link} <Icon name="arrow" size={14} />
                        </a>
                      )}
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
            <a className="lp-btn lp-btn--glass lp-btn--lg" href={hrefOf('contact')} onClick={go('contact')}>
              {t.band.second}
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
