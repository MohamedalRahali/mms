import { useCallback, useEffect, useMemo, useState } from 'react'
import { Builder } from './components/Builder'
import { Watches } from './components/Watches'
import { WATCH_TEXT } from './lib/watches'
import { NewsList } from './components/NewsList'
import { StatsView } from './components/StatsView'
import { DailyReport } from './components/DailyReport'
import { Toolbar } from './components/Toolbar'
import { Admin, AiAnalysis, Alerts, Favorites, Help, PageHead, Presentation, Survey, UpdateToast } from './components/Extras'
import { type Facets, type Filters, type Flux, type NewsResponse, DrillContext, FLUX_KEYS, RefreshContext, ReloadContext, useFetch } from './lib/news'
import { SpikeBanner } from './components/Intel'
import { CommandHero } from './components/Hero'
import { useFx, useTheme } from './lib/fx'
import { Assistant, ComparePeriods, ExecutiveBriefing, InstallButton, ShareOfVoice, Team } from './components/Pro'
import { PRO_TEXT } from './lib/pro'
import { type I18n, type Lang, I18nContext, initialLang, makeI18n, saveLang } from './lib/i18n'
import { useAlerts, useCollapsed, useFavorites } from './lib/prefs'
import { can, onBusy, useAuth } from './lib/auth'
import { track } from './lib/track'

type View =
  | 'dashboard'
  | 'news'
  | 'watch'
  | 'search'
  | 'stats'
  | 'ai'
  | 'report'
  | 'alerts'
  | 'favorites'
  | 'help'
  | 'admin'
  | 'assistant'
  | 'sov'
  | 'compare'
  | 'briefing'
  | 'team'
const VIEWS: View[] = [
  'dashboard',
  'news',
  'watch',
  'search',
  'stats',
  'ai',
  'report',
  'alerts',
  'favorites',
  'help',
  'admin',
  'assistant',
  'sov',
  'compare',
  'briefing',
  'team',
]

function sinceLabel(i: I18n, iso: string | null) {
  if (!iso) return '—'
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (i.lang === 'ar') {
    if (minutes < 1) return 'الآن'
    if (minutes < 60) return `منذ ${minutes} د`
    if (minutes < 1440) return `منذ ${Math.round(minutes / 60)} س`
  } else {
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes} min ago`
    if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`
  }
  return i.dateTime(iso)
}

function RadarMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="mms-radar" viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <circle cx="16" cy="16" r="3.2" />
      <path d="M9.5 9.5a9 9 0 0 0 0 13M22.5 9.5a9 9 0 0 1 0 13M5.3 5.3a15 15 0 0 0 0 21.4M26.7 5.3a15 15 0 0 1 0 21.4" />
    </svg>
  )
}

/* Icônes du menu latéral, dans l'esprit de NewsBoard */
const ICONS: Record<string, string> = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  news: 'M4 5h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4z',
  stats: 'M5 9h3v11H5zm5.5-5h3v16h-3zM16 13h3v7h-3z',
  ai: 'M12 2l1.8 4.7L18.5 8.5l-4.7 1.8L12 15l-1.8-4.7L5.5 8.5l4.7-1.8L12 2zm6 11l.9 2.4 2.4.9-2.4.9L18 20.6l-.9-2.4-2.4-.9 2.4-.9L18 13zM6 14l.7 1.8 1.8.7-1.8.7L6 19l-.7-1.8-1.8-.7 1.8-.7L6 14z',
  search: 'M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  watch:
    'M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  report: 'M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM8 12h8v1.6H8zm0 3.5h8v1.6H8z',
  alerts: 'M12 22a2.5 2.5 0 0 0 2.4-2h-4.8a2.5 2.5 0 0 0 2.4 2zm7-6V11a7 7 0 0 0-5.5-6.8V3a1.5 1.5 0 0 0-3 0v1.2A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z',
  favorites: 'M12 21s-7.5-4.6-9.6-9.3C1 8.4 3 5 6.4 5c2 0 3.3 1 4.1 2.2h3C14.3 6 15.6 5 17.6 5 21 5 23 8.4 21.6 11.7 19.5 16.4 12 21 12 21z',
  help: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 17h-2v-2h2v2zm2.1-7.8l-.9.9c-.7.7-1.2 1.3-1.2 2.9h-2v-.5c0-1.1.4-2.1 1.2-2.8l1.2-1.3A2 2 0 1 0 10 9H8a4 4 0 1 1 7.1 2.2z',
  admin:
    'M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.2h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.7h4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5L19.4 13zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
  collapse: 'M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z',
  assistant: 'M4 4h16v11H8l-4 4V4zm4 4v2h8V8H8zm0 3v2h5v-2H8z',
  sov: 'M11 2v9H2a9 9 0 0 1 9-9zm2 0a9 9 0 1 1-9 11h9V2z',
  compare: 'M4 20V10h3v10H4zm5 0V4h3v16H9zm5 0v-8h3v8h-3zm5 0V8h3v12h-3z',
  briefing: 'M5 3h10l4 4v14H5V3zm9 1.5V8h3.5L14 4.5zM7 11h10v1.6H7zm0 3.5h10v1.6H7zm0 3.5h6v1.6H7z',
  team: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM1 20c0-3.3 3.6-6 8-6s8 2.7 8 6v1H1v-1zm17.5 1v-1c0-1.9-.8-3.6-2.1-4.8 3.5.3 6.6 2.3 6.6 4.8v1h-4.5z',
}

const SUN =
  'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0-5h0l1 3h-2l1-3zm0 20l-1-3h2l-1 3zM2 12l3-1v2l-3-1zm20 0l-3 1v-2l3 1zM4.9 4.9l2.8 1.4-1.4 1.4-1.4-2.8zm14.2 14.2l-2.8-1.4 1.4-1.4 1.4 2.8zM4.9 19.1l1.4-2.8 1.4 1.4-2.8 1.4zM19.1 4.9l-1.4 2.8-1.4-1.4 2.8-1.4z'
const MOON = 'M21 14.5A9 9 0 0 1 9.5 3a9 9 0 1 0 11.5 11.5z'

/** Fine barre de progression en haut de page pendant les chargements de l'API */
function TopProgress() {
  const [busy, setBusy] = useState(false)
  useEffect(() => onBusy((n) => setBusy(n > 0)), [])
  return <div className={busy ? 'mms-progress is-busy' : 'mms-progress'} aria-hidden />
}

/** Initiales affichées dans la pastille de l'utilisateur */
function initials(name: string, email: string) {
  const words = (name || email.split('@')[0]).split(/[\s._-]+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path d={ICONS[name]} fill="currentColor" />
    </svg>
  )
}

export default function App() {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const i18n = useMemo(() => makeI18n(lang), [lang])
  const { t } = i18n
  // Le lien de l'e-mail d'alerte (/?watch=<id>) ouvre directement الأخبار filtrées par la veille
  const [newsWatch, setNewsWatch] = useState(() => new URLSearchParams(window.location.search).get('watch') ?? '')
  // ?view=briefing (lien du rapport envoyé par e-mail) ouvre directement la page voulue
  const [view, setView] = useState<View>(() => {
    const asked = new URLSearchParams(window.location.search).get('view') as View | null
    return newsWatch ? 'news' : asked && VIEWS.includes(asked) ? asked : 'dashboard'
  })
  const [flux, setFlux] = useState<Flux | ''>('')
  const [bump, setBump] = useState(0)
  const [reportDay, setReportDay] = useState('')
  const [presenting, setPresenting] = useState(false)
  const auth = useAuth()
  const [collapsed, setCollapsed] = useCollapsed()
  const [alerts] = useAlerts()
  const fav = useFavorites()
  const reload = useCallback(() => setBump((n) => n + 1), [])
  // Clic sur un graphique, un pic ou une entité : la liste des actualités s'ouvre avec ces filtres
  const [drill, setDrill] = useState<{ n: number; filters: Partial<Filters> } | null>(null)
  const drillTo = useCallback((filters: Partial<Filters>) => {
    setDrill((d) => ({ n: (d?.n ?? 0) + 1, filters }))
    setNewsWatch('')
    setView('news')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])
  const closePresent = useCallback(() => setPresenting(false), [])
  const [theme, setTheme] = useTheme()
  useFx()

  {
    const status = useFetch<NewsResponse>('/api/news?size=1').data
    const facets = useFetch<Facets>('/api/news/facets').data

    function setLang(next: Lang) {
      if (next !== lang) track('lang', next)
      saveLang(next)
      setLangState(next)
    }
    function go(next: View) {
      track('view', next)
      if (next === 'report') setReportDay('')
      if (next === 'news') {
        setNewsWatch('')
        setDrill(null)
      }
      setView(next)
    }

    const pro = PRO_TEXT[lang]
    const TABS: { key: View; label: string }[] = [
      { key: 'dashboard', label: t.navDashboard },
      { key: 'news', label: t.navNews },
      { key: 'watch', label: WATCH_TEXT[lang].menu },
      { key: 'stats', label: t.navStats },
      { key: 'assistant', label: pro.navAssistant },
      { key: 'sov', label: pro.navSov },
      { key: 'compare', label: pro.navCompare },
      { key: 'briefing', label: pro.navBriefing },
      { key: 'ai', label: t.sideAi },
      { key: 'report', label: t.navReport },
      { key: 'alerts', label: t.sideAlerts },
    ]
    const MENU: { group: string; items: { key: View; label: string; count?: number }[] }[] = [
      {
        group: t.sideMonitoring,
        items: [
          { key: 'dashboard', label: t.sideDashboards },
          { key: 'news', label: t.sideNewsBoard },
          { key: 'watch', label: WATCH_TEXT[lang].title },
          { key: 'stats', label: t.sideAnalysis },
          { key: 'assistant', label: pro.navAssistant },
          { key: 'ai', label: t.sideAi },
          { key: 'sov', label: pro.navSov },
          { key: 'compare', label: pro.navCompare },
          { key: 'search', label: t.sideSearch },
        ],
      },
      {
        group: t.sideReviews,
        items: [
          { key: 'briefing', label: pro.navBriefing },
          { key: 'report', label: t.sideReviews },
          { key: 'alerts', label: t.sideAlerts, count: alerts.length },
          { key: 'favorites', label: t.sideFavorites, count: fav.list.length },
        ],
      },
      {
        group: t.sideHelp,
        items: [
          { key: 'help', label: t.sideHelp },
          { key: 'admin', label: t.sideAdmin },
          ...(can(auth?.user, 'admin') ? [{ key: 'team' as View, label: pro.navTeam }] : []),
        ],
      },
    ]
    const fluxCount = (f: Flux) => facets?.flux.find((c) => c.name === f)?.count ?? 0
    const other: Lang = lang === 'ar' ? 'en' : 'ar'

    return (
      <RefreshContext.Provider value={bump}>
        <ReloadContext.Provider value={reload}>
          <I18nContext.Provider value={i18n}>
            <DrillContext.Provider value={drillTo}>
              <div className="mms-app" lang={lang} dir={i18n.dir}>
                <TopProgress />
                {/* Barre unique, en verre : marque, flux, outils, thème, langue, compte */}
                <header className="mms-head">
                  <div className="mms-head__brand">
                    <span className="mms-head__mark">
                      <RadarMark size={30} />
                    </span>
                    <span className="mms-head__name">
                      <strong>MMS Radar</strong>
                      <small>{lang === 'ar' ? 'المركز الوطني لدعم القرار · طرابلس' : 'National Decision Support Centre · Tripoli'}</small>
                    </span>
                  </div>
                  <label className="mms-head__flux" title={t.switchFlux}>
                    <span className={`mms-flag mms-flag--${flux || 'all'}`} aria-hidden />
                    <select value={flux} onChange={(e) => setFlux(e.target.value as Flux | '')} aria-label={t.switchFlux}>
                      <option value="">{t.allSources}</option>
                      {FLUX_KEYS.map((f) => (
                        <option key={f} value={f}>
                          {i18n.flux(f)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="mms-live">
                    <i aria-hidden />
                    <span>
                      {t.live} · {sinceLabel(i18n, status?.lastUpdate ?? null)}
                    </span>
                  </span>
                  <div id="mms-appbar-slot" className="mms-appbar__slot" dir={i18n.dir} />
                  <div className="mms-head__tools" dir="ltr">
                    <Toolbar
                      onFavorites={() => go('favorites')}
                      onPresent={() => setPresenting(true)}
                      onDay={(d) => {
                        setReportDay(d)
                        setView('report')
                      }}
                      onRefresh={reload}
                      onLang={() => setLang(other)}
                    />
                    <InstallButton />
                    <button
                      type="button"
                      className="mms-tool__btn mms-theme-btn"
                      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                      title={theme === 'dark' ? (lang === 'ar' ? 'الوضع الفاتح' : 'Light mode') : lang === 'ar' ? 'الوضع الداكن' : 'Dark mode'}
                      aria-label={theme === 'dark' ? (lang === 'ar' ? 'الوضع الفاتح' : 'Light mode') : lang === 'ar' ? 'الوضع الداكن' : 'Dark mode'}
                    >
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                        <path fill="currentColor" d={theme === 'dark' ? SUN : MOON} />
                      </svg>
                    </button>
                  </div>
                  <div className="seg seg--lang" role="group" aria-label="Language">
                    <button type="button" className={lang === 'ar' ? 'seg__btn is-active' : 'seg__btn'} onClick={() => setLang('ar')}>
                      ع
                    </button>
                    <button type="button" className={lang === 'en' ? 'seg__btn is-active' : 'seg__btn'} onClick={() => setLang('en')}>
                      EN
                    </button>
                  </div>
                  {auth && (
                    <div className="mms-user" title={auth.user.email}>
                      <span className="mms-user__avatar" aria-hidden>
                        {initials(auth.user.name, auth.user.email)}
                      </span>
                      <span className="mms-user__id">
                        <strong>{auth.user.name || auth.user.email.split('@')[0]}</strong>
                        <small dir="ltr">{auth.user.email}</small>
                      </span>
                      <button
                        type="button"
                        className="mms-logout"
                        onClick={auth.logout}
                        title={lang === 'ar' ? 'تسجيل الخروج' : 'Log out'}
                        aria-label={lang === 'ar' ? 'تسجيل الخروج' : 'Log out'}
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                          <path
                            fill="currentColor"
                            d="M10 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-9v-2h9V5h-9V3zm-.6 4.6L10.8 9l-2 2H16v2H8.8l2 2-1.4 1.4L5 12l4.4-4.4z"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </header>
                {/* Onglets : utilisés sur mobile, où le menu latéral est replié */}
                <nav className="mms-tabs" aria-label="Navigation">
                  {TABS.map((v) => (
                    <button key={v.key} type="button" className={view === v.key ? 'mms-tabs__btn is-active' : 'mms-tabs__btn'} onClick={() => go(v.key)}>
                      {v.label}
                    </button>
                  ))}
                </nav>

                {status?.demo && (
                  <div className="mms-demo" role="status">
                    {t.demoBanner}
                  </div>
                )}

                <div className="mms-body">
                  <aside className={collapsed ? 'mms-side is-collapsed' : 'mms-side'}>
                    <button type="button" className="mms-side__collapse" onClick={() => setCollapsed(!collapsed)} title={collapsed ? t.expand : t.collapse}>
                      <Icon name="collapse" />
                      <span>{collapsed ? t.expand : t.collapse}</span>
                    </button>
                    <nav>
                      {MENU.map((g) => (
                        <div key={g.group}>
                          <p className="mms-side__group">{g.group}</p>
                          {g.items.map((v) => (
                            <button
                              key={v.key}
                              type="button"
                              title={v.label}
                              className={view === v.key ? 'mms-side__item is-active' : 'mms-side__item'}
                              onClick={() => go(v.key)}
                            >
                              <Icon name={v.key} />
                              <span className="mms-side__label">{v.label}</span>
                              {!!v.count && <span className="mms-side__count">{i18n.num(v.count)}</span>}
                            </button>
                          ))}
                        </div>
                      ))}
                      <p className="mms-side__group">{t.sideSources}</p>
                      <button
                        type="button"
                        title={t.allSources}
                        className={flux === '' ? 'mms-side__item is-active' : 'mms-side__item'}
                        onClick={() => setFlux('')}
                      >
                        <span className="mms-flag mms-flag--all" aria-hidden />
                        <span className="mms-side__label">{t.allSources}</span>
                      </button>
                      {FLUX_KEYS.map((f) => (
                        <button
                          key={f}
                          type="button"
                          title={i18n.flux(f)}
                          className={flux === f ? 'mms-side__item is-active' : 'mms-side__item'}
                          onClick={() => setFlux(f)}
                        >
                          <span className={`mms-flag mms-flag--${f}`} aria-hidden />
                          <span className="mms-side__label">{i18n.flux(f)}</span>
                          <span className="mms-side__count">{i18n.num(fluxCount(f))}</span>
                        </button>
                      ))}
                    </nav>
                    <p className="mms-side__foot">© MMS · {new Date().getFullYear()}</p>
                  </aside>

                  <main className="mms-main">
                    <div key={view} className="mms-view">
                      {view === 'dashboard' && (
                        <>
                          <CommandHero flux={flux} />
                          <SpikeBanner flux={flux} />
                          <Builder flux={flux} />
                        </>
                      )}
                      {view === 'news' && (
                        <NewsList key={`${newsWatch}|${drill?.n ?? 0}`} flux={flux} initialWatch={newsWatch} initialFilters={drill?.filters} />
                      )}
                      {view === 'watch' && (
                        <Watches
                          onOpen={(id) => {
                            setNewsWatch(id)
                            setView('news')
                          }}
                        />
                      )}
                      {view === 'search' && (
                        <>
                          <PageHead title={t.searchTitle} />
                          <NewsList flux={flux} />
                        </>
                      )}
                      {view === 'stats' && <StatsView flux={flux} />}
                      {view === 'ai' && <AiAnalysis flux={flux} />}
                      {view === 'report' && <DailyReport key={`${flux}|${reportDay}`} flux={flux} initialDay={reportDay} />}
                      {view === 'alerts' && <Alerts flux={flux} />}
                      {view === 'favorites' && <Favorites />}
                      {view === 'help' && <Help />}
                      {view === 'admin' && <Admin />}
                      {view === 'assistant' && <Assistant flux={flux} />}
                      {view === 'sov' && <ShareOfVoice flux={flux} />}
                      {view === 'compare' && <ComparePeriods flux={flux} />}
                      {view === 'briefing' && <ExecutiveBriefing flux={flux} />}
                      {view === 'team' && can(auth?.user, 'admin') && <Team />}
                    </div>
                  </main>
                </div>

                <UpdateToast onReload={reload} />
                <Survey />
                {presenting && <Presentation flux={flux} onClose={closePresent} />}
              </div>
            </DrillContext.Provider>
          </I18nContext.Provider>
        </ReloadContext.Provider>
      </RefreshContext.Provider>
    )
  }
}
