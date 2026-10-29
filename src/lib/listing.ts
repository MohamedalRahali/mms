import { useEffect, useState } from 'react'
import { type Lang } from './i18n'

/**
 * Liste des actualités enrichie : regroupement, tri, vue en colonnes, onglets, pays et drapeaux, statut traité,
 * résumé IA, partage des tableaux. Réglages d'affichage gardés par compte dans ce navigateur.
 */

export type GroupBy = '' | 'category' | 'source' | 'channel' | 'country' | 'day'
export type SortBy = '' | 'reach' | 'source' | 'engagement' | 'importance'
export type ListPrefs = { group: GroupBy; sort: SortBy; dir: '' | 'asc' | 'desc'; view: 'list' | 'columns'; fold: boolean }
export const DEFAULT_PREFS: ListPrefs = { group: '', sort: '', dir: '', view: 'list', fold: true }

const GROUPS: GroupBy[] = ['', 'category', 'source', 'channel', 'country', 'day']
const SORTS: SortBy[] = ['', 'reach', 'source', 'engagement', 'importance']
const prefsKey = (email: string) => `mms-list-prefs:${email.toLowerCase()}`

function readPrefs(email: string): ListPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(prefsKey(email)) || '{}')
    return {
      group: GROUPS.includes(p.group) ? p.group : '',
      sort: SORTS.includes(p.sort) ? p.sort : '',
      dir: p.dir === 'asc' || p.dir === 'desc' ? p.dir : '',
      view: p.view === 'columns' ? 'columns' : 'list',
      fold: p.fold !== false,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

/** Réglages d'affichage de la liste, propres à chaque compte */
export function useListPrefs(email: string) {
  const [prefs, setPrefs] = useState<ListPrefs>(() => readPrefs(email))
  useEffect(() => {
    try {
      localStorage.setItem(prefsKey(email), JSON.stringify(prefs))
    } catch {
      /* stockage indisponible : réglages gardés pour cette page */
    }
  }, [email, prefs])
  return [prefs, (patch: Partial<ListPrefs>) => setPrefs((p) => ({ ...p, ...patch }))] as const
}

/** Sens effectif du tri (la source est alphabétique par défaut, le reste décroissant) */
export const effectiveDir = (p: ListPrefs) => p.dir || (p.sort === 'source' ? 'asc' : 'desc')

/** Drapeau à partir du code pays ISO (LY → 🇱🇾) */
export function flagOf(cc?: string) {
  if (!cc || !/^[A-Z]{2}$/.test(cc)) return ''
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

const names = new Map<string, Intl.DisplayNames | null>()
/** Nom du pays dans la langue de l'interface */
export function countryName(cc: string, lang: Lang) {
  if (!cc) return lang === 'ar' ? 'غير محدد' : 'Unknown'
  if (!names.has(lang)) {
    try {
      names.set(lang, new Intl.DisplayNames([lang === 'ar' ? 'ar' : 'en'], { type: 'region' }))
    } catch {
      names.set(lang, null)
    }
  }
  try {
    return names.get(lang)?.of(cc) || cc
  } catch {
    return cc
  }
}

/** Portée lisible : 1 200 → 1,2 ألف / 1.2K */
export function fmtReach(n: number | undefined, lang: Lang) {
  const v = n || 0
  if (v >= 1_000_000) return lang === 'ar' ? `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')} مليون` : `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (v >= 1000) return lang === 'ar' ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')} ألف` : `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return String(v)
}

/** Réseaux sociaux reconnus comme canaux (icône, filtre rapide, graphique par réseau) */
export const NETWORKS = ['facebook', 'x', 'instagram', 'tiktok', 'youtube', 'telegram', 'linkedin'] as const
export type Network = (typeof NETWORKS)[number]
export const NETWORK_COLOR: Record<Network, string> = { facebook: '#1877f2', x: '#6b7280', instagram: '#d62976', tiktok: '#25f4ee', youtube: '#ff0000', telegram: '#229ed9', linkedin: '#0a66c2' }
// Pictogrammes simples (traits), dessinés pour MMS
export const NETWORK_ICON: Record<Network, string> = {
  facebook: 'M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v7h4v-7h3l1-4h-4V8z',
  x: 'M4 4l16 16M20 4L4 20',
  instagram: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM17.5 6.5h0',
  tiktok: 'M14 3v11a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.5 2.5 4.5 5 5',
  youtube: 'M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM10 9v6l5-3z',
  telegram: 'M21 4L3 11l6 2 2 6 3-4 5 4 2-15zM9 13l9-7',
  linkedin: 'M4 9h3v11H4zM5.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM10 9h3v2c.6-1.2 2-2 3.5-2 2.5 0 3.5 1.6 3.5 4.2V20h-3v-6c0-1.3-.5-2.2-1.7-2.2S13 12.8 13 14v6h-3z',
}
export const isNetwork = (c: string): c is Network => (NETWORKS as readonly string[]).includes(c)

export const LIST_TEXT = {
  ar: {
    groupBy: 'تجميع حسب',
    sortBy: 'ترتيب حسب',
    groups: { '': 'بدون تجميع', category: 'الموضوع', source: 'المصدر', channel: 'القناة', country: 'البلد', day: 'اليوم' } as Record<GroupBy, string>,
    sorts: { '': 'التاريخ', reach: 'مدى الانتشار', source: 'المصدر', engagement: 'التفاعل', importance: 'الأهمية' } as Record<SortBy, string>,
    asc: 'تصاعدي ↑',
    desc: 'تنازلي ↓',
    toggleDir: 'عكس اتجاه الترتيب',
    viewList: 'عرض قائمة',
    viewColumns: 'عرض أعمدة',
    fold: 'دمج المنشورات المتشابهة',
    buzz: 'Buzz',
    reach: 'الانتشار',
    reachHint: 'مدى انتشار المصدر (تقديري ما لم يحدده المشرف)',
    tone: 'النبرة',
    collapse: 'طي المجموعة',
    expand: 'فتح المجموعة',
    more: (n: number) => `+${n} منشورات أخرى`,
    less: 'إخفاء المنشورات المتشابهة',
    tabs: { news: 'الأخبار', sources: 'المصادر', people: 'الشخصيات', charts: 'الرسوم البيانية' },
    authors: 'الحسابات والكتّاب',
    entities: 'الشخصيات المذكورة',
    sourceCols: ['المصدر', 'البلد', 'Buzz', 'الانتشار', 'النبرة', 'آخر خبر'],
    peopleCols: ['الاسم', 'عدد الذكر'],
    chartsNote: (d: string) => `الرسوم مبنية على البحث والفلاتر الحالية · ${d}`,
    last30: 'آخر 30 يوماً',
    byNetwork: 'حسب الشبكة الاجتماعية',
    byCountry: 'حسب البلد',
    perDay: 'عدد الأخبار يومياً',
    toneTrend: 'تطور النبرة',
    bySource: 'أهم المصادر',
    byCategory: 'حسب الموضوع',
    country: 'البلد',
    allCountries: 'كل البلدان',
    pinboard: 'لوحة التثبيت',
    allPinboards: 'كل لوحات التثبيت',
    pinboards: 'لوحات التثبيت',
    processed: 'تمت المعالجة',
    markProcessed: 'تحديد كمُعالَج',
    unmark: 'إلغاء المعالجة',
    processedBy: (by: string, at: string) => `عولج بواسطة ${by} · ${at}`,
    status: 'الحالة',
    allStatus: 'كل الحالات',
    unprocessed: 'غير المعالجة',
    onlyProcessed: 'المعالجة فقط',
    brief: 'ملخص بالعربية',
    briefLoading: 'جارٍ التلخيص…',
    briefError: 'تعذّر التلخيص الآن',
    briefLimit: 'بلغ حد الملخصات اليومي',
    saveSearch: 'حفظ البحث',
    saveTitle: 'حفظ البحث كرصد مع تنبيهات',
    saveIntro: 'يُنشأ رصد بنفس البحث والفلاتر الحالية. تُرسل الأخبار الجديدة المطابقة بالبريد الإلكتروني (وTelegram إن كان مفعّلاً).',
    watchName: 'اسم الرصد',
    recipients: 'المرسَل إليهم (بريد إلكتروني، مفصول بفواصل)',
    criteria: 'المعايير',
    create: 'إنشاء الرصد',
    cancel: 'إلغاء',
    created: 'تم إنشاء الرصد. يمكنك إدارته من «الرصد المبرمج».',
    needCriteria: 'ابحث أو اختر فلتراً أولاً.',
    networks: 'الشبكات',
    allNetworks: 'كل الشبكات',
    unknownGroup: 'غير محدد',
  },
  en: {
    groupBy: 'Group by',
    sortBy: 'Sort by',
    groups: { '': 'No grouping', category: 'Topic', source: 'Source', channel: 'Channel', country: 'Country', day: 'Day' } as Record<GroupBy, string>,
    sorts: { '': 'Date', reach: 'Reach', source: 'Source', engagement: 'Engagement', importance: 'Importance' } as Record<SortBy, string>,
    asc: 'Ascending ↑',
    desc: 'Descending ↓',
    toggleDir: 'Reverse sort order',
    viewList: 'List view',
    viewColumns: 'Column view',
    fold: 'Merge similar posts',
    buzz: 'Buzz',
    reach: 'Reach',
    reachHint: 'Source reach (estimated unless set by the administrator)',
    tone: 'Tone',
    collapse: 'Collapse group',
    expand: 'Expand group',
    more: (n: number) => `+${n} more posts`,
    less: 'Hide similar posts',
    tabs: { news: 'News', sources: 'Sources', people: 'People', charts: 'Charts' },
    authors: 'Accounts and authors',
    entities: 'People mentioned',
    sourceCols: ['Source', 'Country', 'Buzz', 'Reach', 'Tone', 'Latest'],
    peopleCols: ['Name', 'Mentions'],
    chartsNote: (d: string) => `Charts follow the current search and filters · ${d}`,
    last30: 'last 30 days',
    byNetwork: 'By social network',
    byCountry: 'By country',
    perDay: 'News per day',
    toneTrend: 'Tone trend',
    bySource: 'Top sources',
    byCategory: 'By topic',
    country: 'Country',
    allCountries: 'All countries',
    pinboard: 'Pin board',
    allPinboards: 'All pin boards',
    pinboards: 'Pin boards',
    processed: 'Processed',
    markProcessed: 'Mark as processed',
    unmark: 'Unmark',
    processedBy: (by: string, at: string) => `Processed by ${by} · ${at}`,
    status: 'Status',
    allStatus: 'All statuses',
    unprocessed: 'Not processed',
    onlyProcessed: 'Processed only',
    brief: 'Arabic summary',
    briefLoading: 'Summarising…',
    briefError: 'Summary unavailable right now',
    briefLimit: 'Daily summary limit reached',
    saveSearch: 'Save search',
    saveTitle: 'Save the search as a watch with alerts',
    saveIntro: 'A watch is created with the current search and filters. New matching news are emailed (and sent to Telegram when enabled).',
    watchName: 'Watch name',
    recipients: 'Recipients (emails, comma separated)',
    criteria: 'Criteria',
    create: 'Create the watch',
    cancel: 'Cancel',
    created: 'Watch created. Manage it from “Scheduled watch”.',
    needCriteria: 'Search or pick a filter first.',
    networks: 'Networks',
    allNetworks: 'All networks',
    unknownGroup: 'Unknown',
  },
}
