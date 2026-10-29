import { type FormEvent, useEffect, useState } from 'react'
import { makeI18n, type Lang } from '../lib/i18n'
import { applyTheme } from '../lib/fx'
import './portal.css'

/**
 * Vitrine publique d'actualités (/portal) : seulement les actualités approuvées pour le public dans MMS, avec les
 * couleurs, la typographie et les formes de MMS, sans rien de l'interface interne. Données : /api/portal (server/portal.js).
 */

type Item = { id: string; title: string; summary: string; source: string; date: string; url: string; image: string; category: string; lang: string }
type Count = { name: string; count: number }
type Page = { total: number; page: number; pages: number; items: Item[]; facets: { categories: Count[]; sources: Count[]; langs: Count[] } }

const TEXT = {
  ar: {
    brand: 'MMS · الأخبار',
    tagline: 'مختارات من الأخبار المعتمدة للنشر',
    search: 'ابحث في الأخبار',
    go: 'بحث',
    all: 'الكل',
    source: 'المصدر',
    allSources: 'كل المصادر',
    from: 'من',
    to: 'إلى',
    reset: 'إعادة الضبط',
    featured: 'أبرز الأخبار',
    latest: 'آخر الأخبار',
    more: 'المزيد',
    read: 'قراءة الخبر في مصدره',
    close: 'إغلاق',
    none: 'لا توجد أخبار مطابقة.',
    empty: 'لا توجد أخبار منشورة حالياً.',
    error: 'تعذّر تحميل الأخبار. أعد المحاولة بعد قليل.',
    loading: 'جارٍ التحميل…',
    results: (n: number) => `${n} خبر`,
    theme: 'تبديل المظهر',
    foot: 'تُعرض هنا الأخبار التي وافق فريق التحرير على نشرها فقط، مع رابط إلى مصدرها الأصلي.',
    active: 'عوامل التصفية',
    remove: 'إزالة',
  },
  en: {
    brand: 'MMS · News',
    tagline: 'A selection of news approved for publication',
    search: 'Search the news',
    go: 'Search',
    all: 'All',
    source: 'Source',
    allSources: 'All sources',
    from: 'From',
    to: 'To',
    reset: 'Reset',
    featured: 'Top stories',
    latest: 'Latest news',
    more: 'Load more',
    read: 'Read at the source',
    close: 'Close',
    none: 'No matching news.',
    empty: 'No news published yet.',
    error: 'The news could not be loaded. Try again in a moment.',
    loading: 'Loading…',
    results: (n: number) => `${n} news`,
    theme: 'Toggle theme',
    foot: 'Only news approved for publication by the editorial team appear here, with a link to the original source.',
    active: 'Filters',
    remove: 'Remove',
  },
}

const readTheme = () => {
  try {
    return localStorage.getItem('mms-portal-theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function Portal() {
  const params = new URLSearchParams(location.search)
  const [lang, setLang] = useState<Lang>(params.get('lang') === 'en' ? 'en' : 'ar')
  const i = makeI18n(lang)
  const t = TEXT[lang]
  const [theme, setTheme] = useState<'light' | 'dark'>(readTheme)
  const [draft, setDraft] = useState(params.get('q') ?? '')
  const [f, setF] = useState({ q: params.get('q') ?? '', category: params.get('category') ?? '', source: params.get('source') ?? '', from: params.get('from') ?? '', to: params.get('to') ?? '' })
  const [pages, setPages] = useState(1)
  const [data, setData] = useState<{ items: Item[]; total: number; pages: number; facets: Page['facets'] } | null>(null)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState<Item | null>(null)

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem('mms-portal-theme', theme)
    } catch {
      /* préférence non gardée */
    }
  }, [theme])
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.title = t.brand
  }, [lang, t.brand])
  // Filtres gardés dans l'adresse : lien partageable, bouton « retour » du navigateur cohérent
  useEffect(() => {
    const p = new URLSearchParams(Object.entries({ ...f, lang: lang === 'en' ? 'en' : '' }).filter(([, v]) => v))
    history.replaceState(null, '', `${location.pathname}${p.toString() ? `?${p}` : ''}`)
  }, [f, lang])
  useEffect(() => {
    let off = false
    setError(false)
    const load = async () => {
      const all: Item[] = []
      let last: Page | null = null
      for (let p = 1; p <= pages; p++) {
        const q = new URLSearchParams(Object.entries({ ...f, page: String(p), size: '12' }).filter(([, v]) => v))
        const r = await fetch(`/api/portal/news?${q}`)
        if (!r.ok) throw new Error(String(r.status))
        last = (await r.json()) as Page
        all.push(...last.items)
        if (p >= last.pages) break
      }
      if (!off && last) setData({ items: all, total: last.total, pages: last.pages, facets: last.facets })
    }
    load().catch(() => !off && setError(true))
    return () => {
      off = true
    }
  }, [f, pages])

  const set = (patch: Partial<typeof f>) => {
    setPages(1)
    setF((x) => ({ ...x, ...patch }))
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    set({ q: draft.trim() })
  }
  const filtered = Boolean(f.q || f.category || f.source || f.from || f.to)
  const featured = !filtered ? data?.items.filter((x) => x.image).slice(0, 1)[0] : undefined
  const rest = (data?.items ?? []).filter((x) => x !== featured)
  const chips = [
    f.q && { k: 'q' as const, label: `« ${f.q} »` },
    f.category && { k: 'category' as const, label: i.category(f.category) },
    f.source && { k: 'source' as const, label: f.source },
    f.from && { k: 'from' as const, label: `${t.from} ${f.from}` },
    f.to && { k: 'to' as const, label: `${t.to} ${f.to}` },
  ].filter(Boolean) as { k: keyof typeof f; label: string }[]

  return (
    <div className="pt" dir={i.dir} lang={lang}>
      <header className="pt-head">
        <div className="pt-head__brand">
          <span className="pt-logo" aria-hidden>
            MMS
          </span>
          <div>
            <h1>{t.brand}</h1>
            <p>{t.tagline}</p>
          </div>
        </div>
        <div className="pt-head__tools">
          <div className="pt-seg" role="group" aria-label="Language">
            <button type="button" className={lang === 'ar' ? 'is-on' : ''} aria-pressed={lang === 'ar'} onClick={() => setLang('ar')}>
              ع
            </button>
            <button type="button" className={lang === 'en' ? 'is-on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
              EN
            </button>
          </div>
          <button type="button" className="pt-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={t.theme} title={t.theme}>
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <main className="pt-main">
        <form className="pt-search" onSubmit={submit} role="search">
          <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.search} aria-label={t.search} dir="auto" />
          <button type="submit">{t.go}</button>
        </form>

        {data && data.facets.categories.length > 0 && (
          <nav className="pt-cats" aria-label="Categories">
            <button type="button" className={!f.category ? 'is-on' : ''} onClick={() => set({ category: '' })}>
              {t.all}
            </button>
            {data.facets.categories.map((c) => (
              <button key={c.name} type="button" className={f.category === c.name ? 'is-on' : ''} aria-pressed={f.category === c.name} onClick={() => set({ category: f.category === c.name ? '' : c.name })}>
                {i.category(c.name)} <small>{c.count}</small>
              </button>
            ))}
          </nav>
        )}

        <div className="pt-filters">
          <label>
            <span>{t.source}</span>
            <select value={f.source} onChange={(e) => set({ source: e.target.value })}>
              <option value="">{t.allSources}</option>
              {data?.facets.sources.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.count})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.from}</span>
            <input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} />
          </label>
          <label>
            <span>{t.to}</span>
            <input type="date" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} />
          </label>
          {filtered && (
            <button
              type="button"
              className="pt-reset"
              onClick={() => {
                setDraft('')
                set({ q: '', category: '', source: '', from: '', to: '' })
              }}
            >
              {t.reset}
            </button>
          )}
        </div>

        {chips.length > 0 && (
          <p className="pt-chips" aria-label={t.active}>
            {chips.map((c) => (
              <button key={c.k} type="button" onClick={() => (c.k === 'q' && setDraft(''), set({ [c.k]: '' }))} aria-label={`${t.remove}: ${c.label}`}>
                {c.label} ✕
              </button>
            ))}
            {data && <span>{t.results(data.total)}</span>}
          </p>
        )}

        {error && <p className="pt-status pt-status--error">{t.error}</p>}
        {!data && !error && <p className="pt-status">{t.loading}</p>}
        {data && data.total === 0 && <p className="pt-status">{filtered ? t.none : t.empty}</p>}

        {featured && (
          <section aria-label={t.featured}>
            <h2 className="pt-h">{t.featured}</h2>
            <article className="pt-feature" onClick={() => setOpen(featured)}>
              <img src={featured.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
              <div>
                <p className="pt-meta">
                  <b dir="auto">{featured.source}</b> · {i.dateTime(featured.date)} · {i.category(featured.category)}
                </p>
                <h3 dir="auto">{featured.title}</h3>
                <p dir="auto">{featured.summary}</p>
              </div>
            </article>
          </section>
        )}

        {rest.length > 0 && (
          <section aria-label={t.latest}>
            <h2 className="pt-h">{t.latest}</h2>
            <div className="pt-grid">
              {rest.map((x) => (
                <article key={x.id} className="pt-card">
                  {x.image && <img src={x.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                  <div className="pt-card__body">
                    <p className="pt-meta">
                      <b dir="auto">{x.source}</b> · {i.dateTime(x.date)}
                    </p>
                    <h3 dir="auto">
                      <button type="button" onClick={() => setOpen(x)}>
                        {x.title}
                      </button>
                    </h3>
                    <p dir="auto">{x.summary}</p>
                    <span className="pt-tag">{i.category(x.category)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {data && data.pages > pages && (
          <div className="pt-more">
            <button type="button" onClick={() => setPages(pages + 1)}>
              {t.more}
            </button>
          </div>
        )}
      </main>

      <footer className="pt-foot">
        <p>{t.foot}</p>
      </footer>

      {open && (
        <div className="pt-modal" role="dialog" aria-modal="true" aria-label={open.title} onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <article className="pt-modal__box">
            {open.image && <img src={open.image} alt="" referrerPolicy="no-referrer" />}
            <p className="pt-meta">
              <b dir="auto">{open.source}</b> · {i.dateTime(open.date)} · {i.category(open.category)}
            </p>
            <h3 dir="auto">{open.title}</h3>
            <p dir="auto">{open.summary}</p>
            <div className="pt-modal__actions">
              {open.url && (
                <a href={open.url} target="_blank" rel="noopener noreferrer nofollow">
                  {t.read} ↗
                </a>
              )}
              <button type="button" onClick={() => setOpen(null)}>
                {t.close}
              </button>
            </div>
          </article>
        </div>
      )}
    </div>
  )
}

export default Portal
