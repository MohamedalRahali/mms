import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Builder } from './components/Builder'
import { Watches } from './components/Watches'
import { WATCH_TEXT } from './lib/watches'
import { NewsList } from './components/NewsList'
import { StatsView } from './components/StatsView'
import { DailyReport } from './components/DailyReport'
import { Toolbar } from './components/Toolbar'
import { AiAnalysis, Alerts, Favorites, Help, PageHead, Presentation, Survey, UpdateToast } from './components/Extras'
import { type Filters, type Flux, type NewsResponse, DrillContext, RefreshContext, ReloadContext, useFetch } from './lib/news'
import { SpikeBanner } from './components/Intel'
import { CommandHero } from './components/Hero'
import { MediaIcon } from './components/MediaParts'
import { type MediaIconName, type MediaPageType, MEDIA_PAGES, MEDIA_PAGE_TEXT, MEDIA_SUBS } from './lib/media'
import { useFx, useTheme } from './lib/fx'
import { ComparePeriods, ExecutiveBriefing, ShareOfVoice } from './components/Pro'
import { InstallButton } from './components/Install'
import { Radar, RadarBrief } from './components/Radar'
import { radarText } from './lib/radar'
import { PRO_TEXT } from './lib/pro'
import { type I18n, type Lang, I18nContext, initialLang, makeI18n, saveLang } from './lib/i18n'
import { useAlerts, useCollapsed, useFavorites } from './lib/prefs'
import { type MfaInfo, type ModuleKey, type User, canDo, hasModule, onBusy, useAuth } from './lib/auth'
import { MfaPanel } from './components/Mfa'
import { track } from './lib/track'
import { ReportTray } from './components/ReportPick'
import { CommandPalette, type PaletteEntry } from './components/CommandPalette'
import { useBrand } from './components/Share'
import { RegionsPanel } from './components/Regions'
import { DataSince } from './components/DataSince'

// Générateur de rapports (éditeur, exports Word et PDF) : chargé seulement à l'ouverture de la page
const Reports = lazy(() => import('./components/reports/Reports'))
// Autres pages lourdes, chargées à la première ouverture : l'arrivée sur le tableau de bord est plus rapide
const Around = lazy(() => import('./components/Around').then((m) => ({ default: m.Around })))
const MediaPage = lazy(() => import('./components/MediaPages').then((m) => ({ default: m.MediaPage })))
const LiveWall = lazy(() => import('./components/LiveWall').then((m) => ({ default: m.LiveWall })))
const ClipModal = lazy(() => import('./components/BroadcastStudio').then((m) => ({ default: m.ClipModal })))
const SearchPool = lazy(() => import('./components/SearchPool').then((m) => ({ default: m.SearchPool })))
const GeoPresence = lazy(() => import('./components/GeoPresence').then((m) => ({ default: m.GeoPresence })))

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
  | 'assistant'
  | 'sov'
  | 'compare'
  | 'briefing'
  | 'radar'
  | 'reports'
  | 'geo'
  | 'pool'
  | `media-${MediaPageType}`
  | 'media-live'
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
  'assistant',
  'sov',
  'compare',
  'briefing',
  'radar',
  'reports',
  'geo',
  'pool',
  ...MEDIA_PAGES.map((m) => `media-${m}` as const),
  'media-live',
]

/** Module de permissions dont dépend chaque page (null : toujours ouverte) */
function moduleOf(v: View): ModuleKey | null {
  if (v === 'help') return null
  if (v === 'search' || v === 'pool') return 'news'
  if (v.startsWith('media-')) return 'media'
  return v as ModuleKey
}
const viewAllowed = (user: User | undefined | null, v: View) => {
  const m = moduleOf(v)
  return !m || hasModule(user, m)
}

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
  reports: 'M4 3h10l4 4v5h-2V8h-3V5H6v14h6v2H4V3zm4 7h6v1.6H8zm0 3h4v1.6H8zm9 1l1.2 2.6 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4z',
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
  radar: 'M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2zm0 4a6 6 0 1 0 6 6h-2a4 4 0 1 1-4-4V6zm0 4a2 2 0 1 0 2 2h-2v-2zm1-8v10h2V4.1A8 8 0 0 1 19.9 9H22A10 10 0 0 0 13 2z',
  pool: 'M3 5h11v2H3zm0 4h7v2H3zm0 4h7v2H3zm0 4h11v2H3zm13.5-8a4.5 4.5 0 0 1 3.6 7.2l2.6 2.6-1.4 1.4-2.6-2.6A4.5 4.5 0 1 1 16.5 9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  geo: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 0 1 7.7 6H15l-1.5-2.5L12 10l-1.5-2.5L9 10H4.3A8 8 0 0 1 12 4zm0 16a8 8 0 0 1-7.7-8H9l1.5 2.5L12 12l1.5 2.5L15 12h4.7A8 8 0 0 1 12 20z',
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
const ROLE_LABEL = {
  ar: { admin: 'مدير', analyst: 'محلل', viewer: 'قارئ' },
  en: { admin: 'Administrator', analyst: 'Analyst', viewer: 'Viewer' },
} as const

function initials(name: string, email: string) {
  // Nom d'un seul mot tiré de l'adresse (« Farhat » pour w.farhat) : les initiales viennent de l'adresse (WF)
  const fromName = name.split(/[\s._-]+/).filter(Boolean)
  const fromEmail = email.split('@')[0].split(/[\s._-]+/).filter(Boolean)
  const words = fromName.length > 1 || fromEmail.length < 2 ? (name ? fromName : fromEmail) : fromEmail
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
    if (new URLSearchParams(window.location.search).get('clip')) return 'media-broadcast'
    return newsWatch ? 'news' : asked && VIEWS.includes(asked) ? asked : 'dashboard'
  })
  const auth = useAuth()
  // Page fermée par le profil du compte (lien direct, ou droits changés par le Super Admin) : première page permise
  const shown: View = viewAllowed(auth?.user, view) ? view : (VIEWS.find((v) => viewAllowed(auth?.user, v)) ?? 'help')
  // Sous-type de la page Broadcasts (tv, radio, youtube) : choisi dans le menu latéral ou par ?sub=
  const [mediaSub, setMediaSub] = useState(() => new URLSearchParams(window.location.search).get('sub') ?? '')
  // Lien d'un extrait de diffusion (/?clip=<id>&t=<secondes>&q=…) : la page Broadcasts s'ouvre avec l'extrait
  const [clip, setClip] = useState(() => {
    const s = new URLSearchParams(window.location.search)
    return s.get('clip') ? { id: s.get('clip') ?? '', t: Number(s.get('t')) || 0, e: s.get('e') ? Number(s.get('e')) : undefined, q: s.get('q') ?? '' } : null
  })
  // Une seule veille (Libye) : plus de choix de source, toutes les pages couvrent toutes les sources
  const flux: Flux | '' = ''
  const [bump, setBump] = useState(0)
  const [reportDay, setReportDay] = useState('')
  const [presenting, setPresenting] = useState(false)
  // Palette de commandes : Ctrl+K (⌘K sur Mac) depuis n'importe quelle page
  const [palette, setPalette] = useState(false)
  // Panneau « التحقق بخطوتين » du compte
  const [mfaOpen, setMfaOpen] = useState(false)
  const [mfaState, setMfaState] = useState<MfaInfo | null>(null)
  // Marque du client : nom de l'assistant IA (« Around » par défaut), réglé dans la console Super Admin
  const brand = useBrand()
  const renameAssistant = (label: string) => (brand?.assistant ? label.replace(/Around/g, brand.assistant) : label)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const closePalette = useCallback(() => setPalette(false), [])
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

    function setLang(next: Lang) {
      if (next !== lang) track('lang', next)
      saveLang(next)
      setLangState(next)
    }
    function go(next: View) {
      if (!viewAllowed(auth?.user, next)) return
      track('view', next)
      if (next === 'report') setReportDay('')
      if (next.startsWith('media-')) setMediaSub('')
      if (next === 'news') {
        setNewsWatch('')
        setDrill(null)
      }
      setView(next)
    }

    const pro = PRO_TEXT[lang]
    const TABS = (
      [
      { key: 'dashboard', label: t.navDashboard },
      { key: 'radar', label: radarText(lang).nav },
      { key: 'news', label: t.navNews },
      ...MEDIA_PAGES.map((m) => ({ key: `media-${m}` as View, label: MEDIA_PAGE_TEXT[lang].nav[m] })),
      { key: 'media-live', label: MEDIA_PAGE_TEXT[lang].nav.live },
      { key: 'watch', label: WATCH_TEXT[lang].menu },
      { key: 'stats', label: t.navStats },
      { key: 'assistant', label: renameAssistant(pro.navAssistantShort) },
      { key: 'sov', label: pro.navSov },
      { key: 'compare', label: pro.navCompare },
      { key: 'briefing', label: pro.navBriefing },
      { key: 'ai', label: t.sideAi },
      { key: 'report', label: t.navReport },
      { key: 'reports', label: lang === 'ar' ? 'التقارير' : 'Reports' },
      { key: 'alerts', label: t.sideAlerts },
      ] as { key: View; label: string }[]
    ).filter((v) => viewAllowed(auth?.user, v.key))
    const MENU: { group: string; items: { key: View; label: string; count?: number; sub?: string }[] }[] = [
      {
        group: t.sideMonitoring,
        items: [
          { key: 'dashboard', label: t.sideDashboards },
          { key: 'radar', label: radarText(lang).nav },
          { key: 'news', label: t.sideNewsBoard },
          { key: 'watch', label: WATCH_TEXT[lang].title },
          { key: 'stats', label: t.sideAnalysis },
          { key: 'assistant', label: renameAssistant(pro.navAssistant) },
          { key: 'ai', label: t.sideAi },
          { key: 'sov', label: pro.navSov },
          { key: 'compare', label: pro.navCompare },
          { key: 'geo', label: lang === 'ar' ? 'الحضور في إجابات الذكاء الاصطناعي' : 'Presence in AI answers' },
          { key: 'pool', label: lang === 'ar' ? 'مجمع البحث' : 'Search pool' },
          { key: 'search', label: t.sideSearch },
        ],
      },
      {
        group: MEDIA_PAGE_TEXT[lang].group,
        items: MEDIA_PAGES.flatMap((m) => [
          { key: `media-${m}` as View, label: MEDIA_PAGE_TEXT[lang].nav[m] },
          ...(m === 'broadcast' ? MEDIA_SUBS.map((sub) => ({ key: 'media-broadcast' as View, sub, label: MEDIA_PAGE_TEXT[lang].subTypes[sub] })) : []),
          ...(m === 'broadcast' ? [{ key: 'media-live' as View, label: MEDIA_PAGE_TEXT[lang].nav.live }] : []),
        ]),
      },
      {
        group: t.sideReviews,
        items: [
          { key: 'briefing', label: pro.navBriefing },
          { key: 'reports', label: lang === 'ar' ? 'التقارير' : 'Reports' },
          { key: 'report', label: t.sideReviews },
          { key: 'alerts', label: t.sideAlerts, count: alerts.length },
          { key: 'favorites', label: t.sideFavorites, count: fav.list.length },
        ],
      },
      {
        group: t.sideHelp,
        items: [
          { key: 'help', label: t.sideHelp },
        ],
      },
    ]
    // Menu réduit aux pages permises par le profil ; un groupe vide disparaît
    const menu = MENU.map((g) => ({ ...g, items: g.items.filter((v) => viewAllowed(auth?.user, v.key)) })).filter((g) => g.items.length)
    const other: Lang = lang === 'ar' ? 'en' : 'ar'
    // Entrées de la palette : les pages permises du menu, puis le thème et la langue
    const paletteEntries: PaletteEntry[] = [
      ...menu.flatMap((g) =>
        g.items.map((v) => ({
          id: `v-${v.key}${v.sub ?? ''}`,
          label: v.label,
          group: g.group,
          keywords: v.key,
          run: () => {
            go(v.key)
            if (v.sub) setMediaSub(v.sub)
          },
        })),
      ),
      {
        id: 'theme',
        label: theme === 'dark' ? (lang === 'ar' ? 'الوضع الفاتح' : 'Light mode') : lang === 'ar' ? 'الوضع الداكن' : 'Dark mode',
        group: lang === 'ar' ? 'الإعدادات' : 'Settings',
        keywords: 'theme dark light',
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      { id: 'lang', label: lang === 'ar' ? 'English' : 'العربية', group: lang === 'ar' ? 'الإعدادات' : 'Settings', keywords: 'language lang', run: () => setLang(other) },
    ]

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
                    {/* Logo du client (رئاسة مجلس الوزراء — المركز الوطني لدعم القرار), le produit en petit à côté */}
                    <span className="mms-head__logo">
                      <img src={theme === 'dark' ? '/logo-cnsd/v2/logo-anime-fond-sombre.svg' : '/logo-cnsd/v2/logo-anime.svg'} alt={lang === 'ar' ? 'المركز الوطني لدعم القرار' : 'National Decision Support Centre'} width={1679} height={322} />
                    </span>
                    <span className="mms-head__product">
                      <RadarMark size={18} />
                      <b>MMS Radar</b>
                    </span>
                  </div>
                  <span className="mms-live">
                    <i aria-hidden />
                    <span>
                      {t.live} · {sinceLabel(i18n, status?.lastUpdate ?? null)}
                    </span>
                  </span>
                  <div id="mms-appbar-slot" className="mms-appbar__slot" dir={i18n.dir} />
                  <div className="mms-head__tools" dir="ltr">
                    <button
                      type="button"
                      className="mms-tool__btn mms-cmdk-btn"
                      onClick={() => setPalette(true)}
                      title={lang === 'ar' ? 'انتقال سريع وبحث (Ctrl+K)' : 'Quick jump and search (Ctrl+K)'}
                      aria-label={lang === 'ar' ? 'انتقال سريع وبحث' : 'Quick jump and search'}
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                        <path fill="currentColor" d={ICONS.search} />
                      </svg>
                      <kbd>Ctrl K</kbd>
                    </button>
                    <Toolbar
                      onFavorites={hasModule(auth?.user, 'favorites') ? () => go('favorites') : undefined}
                      onPresent={() => setPresenting(true)}
                      onDay={
                        hasModule(auth?.user, 'report')
                          ? (d) => {
                              setReportDay(d)
                              setView('report')
                            }
                          : undefined
                      }
                      onRefresh={reload}
                      onLang={() => setLang(other)}
                    />
                    <InstallButton lang={lang} />
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
                  <div className="seg seg--lang" role="group" aria-label={lang === 'ar' ? 'اللغة' : 'Language'}>
                    <button type="button" className={lang === 'ar' ? 'seg__btn is-active' : 'seg__btn'} aria-pressed={lang === 'ar'} aria-label="العربية" onClick={() => setLang('ar')}>
                      ع
                    </button>
                    <button type="button" className={lang === 'en' ? 'seg__btn is-active' : 'seg__btn'} aria-pressed={lang === 'en'} aria-label="English" onClick={() => setLang('en')}>
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
                        <small>{ROLE_LABEL[lang === 'ar' ? 'ar' : 'en'][auth.user.role ?? 'admin']}</small>
                      </span>
                      <button
                        type="button"
                        className="mms-logout"
                        onClick={() => setMfaOpen(true)}
                        title={lang === 'ar' ? 'التحقق بخطوتين' : 'Two-step verification'}
                        aria-label={lang === 'ar' ? 'التحقق بخطوتين' : 'Two-step verification'}
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                          <path fill="currentColor" d="M12 1 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-4zm0 6a2.5 2.5 0 0 1 2.5 2.5V11h.5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h.5V9.5A2.5 2.5 0 0 1 12 7zm0 1.5a1 1 0 0 0-1 1V11h2V9.5a1 1 0 0 0-1-1z" />
                        </svg>
                      </button>
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
                <nav className="mms-tabs" aria-label={lang === 'ar' ? 'التنقل' : 'Navigation'}>
                  {TABS.map((v) => (
                    <button key={v.key} type="button" className={shown === v.key ? 'mms-tabs__btn is-active' : 'mms-tabs__btn'} onClick={() => go(v.key)}>
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
                      {menu.map((g) => (
                        <div key={g.group}>
                          <p className="mms-side__group">{g.group}</p>
                          {g.items.map((v) => (
                            <button
                              key={`${v.key}${v.sub ?? ''}`}
                              type="button"
                              title={v.label}
                              className={`mms-side__item${v.sub ? ' mms-side__item--sub' : ''}${shown === v.key && (v.sub ?? '') === (v.key === 'media-broadcast' ? mediaSub : '') ? ' is-active' : ''}`}
                              onClick={() => {
                                go(v.key)
                                if (v.sub) setMediaSub(v.sub)
                              }}
                            >
                              {v.key.startsWith('media-') ? (
                                <MediaIcon name={(v.sub ?? v.key.slice(6)) as MediaIconName} size={v.sub ? 18 : 22} />
                              ) : (
                                <Icon name={v.key} />
                              )}
                              <span className="mms-side__label">{v.label}</span>
                              {!!v.count && <span className="mms-side__count">{i18n.num(v.count)}</span>}
                            </button>
                          ))}
                        </div>
                      ))}
                    </nav>
                    <p className="mms-side__foot">
                      <img className="mms-side__logo" src="/around-logo-footer.png" alt="Around Expressions" width={120} height={91} loading="lazy" />
                      <span dir="ltr">© {new Date().getFullYear()} MMS — Copyright by Around Expressions</span>
                    </p>
                  </aside>

                  <main className="mms-main">
                    <div key={shown} className="mms-view">
                      <Suspense fallback={<p className="news-status">{t.loading}</p>}>
                      {shown === 'dashboard' && (
                        <>
                          <DataSince />
                          <CommandHero flux={flux} />
                          <RegionsPanel />
                          {hasModule(auth?.user, 'radar') && <RadarBrief flux={flux} onOpen={() => go('radar')} />}
                          <SpikeBanner flux={flux} />
                          <Builder flux={flux} />
                        </>
                      )}
                      {shown === 'news' && (
                        <NewsList key={`${newsWatch}|${drill?.n ?? 0}`} flux={flux} initialWatch={newsWatch} initialFilters={drill?.filters} />
                      )}
                      {shown === 'watch' && (
                        <Watches
                          onOpen={(id) => {
                            setNewsWatch(id)
                            setView('news')
                          }}
                        />
                      )}
                      {shown === 'search' && (
                        <>
                          <PageHead title={t.searchTitle} />
                          <NewsList flux={flux} />
                        </>
                      )}
                      {shown === 'stats' && <StatsView flux={flux} />}
                      {shown === 'ai' && <AiAnalysis flux={flux} />}
                      {shown === 'report' && <DailyReport key={`${flux}|${reportDay}`} flux={flux} initialDay={reportDay} />}
                      {shown === 'alerts' && <Alerts flux={flux} />}
                      {shown === 'favorites' && <Favorites />}
                      {shown === 'help' && <Help />}
                      {shown === 'assistant' &&
                        (canDo(auth?.user, 'ai_ask') ? (
                          <Around flux={flux} />
                        ) : (
                          <p className="mms-note">{lang === 'ar' ? 'طرح الأسئلة على Around غير مفعّل في ملف صلاحياتك. تواصل مع المشرف.' : 'Asking Around is not enabled for your profile. Contact your administrator.'}</p>
                        ))}
                      {shown === 'sov' && <ShareOfVoice flux={flux} />}
                      {shown === 'compare' && <ComparePeriods flux={flux} />}
                      {shown === 'briefing' && <ExecutiveBriefing flux={flux} />}
                      {shown === 'radar' && <Radar flux={flux} />}
                      {shown.startsWith('media-') && shown !== 'media-live' && (
                        <MediaPage key={shown} type={shown.slice(6) as MediaPageType} flux={flux} sub={mediaSub} onSub={setMediaSub} onLive={() => go('media-live')} />
                      )}
                      {shown === 'media-live' && <LiveWall />}
                      {shown === 'reports' && <Reports onNews={() => go('news')} />}
                      {shown === 'geo' && <GeoPresence />}
                      {shown === 'pool' && <SearchPool flux={flux} />}
                      </Suspense>
                    </div>
                  </main>
                </div>

                <UpdateToast onReload={reload} />
                <ReportTray hidden={shown === 'reports'} onGenerate={() => go('reports')} />
                <Survey />
                {palette && (
                  <CommandPalette
                    entries={paletteEntries}
                    onClose={closePalette}
                    onSearch={hasModule(auth?.user, 'news') ? (q) => drillTo({ q }) : null}
                  />
                )}
                {presenting && <Presentation flux={flux} onClose={closePresent} />}
                {mfaOpen && auth && (
                  <MfaPanel
                    lang={lang}
                    mfa={mfaState ?? auth.user.mfa ?? { enabled: false, required: false, setup: false, recoveryLeft: 0 }}
                    onChange={(m) => setMfaState(m)}
                    onClose={() => setMfaOpen(false)}
                  />
                )}
                {clip && hasModule(auth?.user, 'media') && (
                  <Suspense fallback={null}>
                    <ClipModal id={clip.id} t={clip.t} e={clip.e} q={clip.q} onClose={() => setClip(null)} />
                  </Suspense>
                )}
              </div>
            </DrillContext.Provider>
          </I18nContext.Provider>
        </ReloadContext.Provider>
      </RefreshContext.Provider>
    )
  }
}
