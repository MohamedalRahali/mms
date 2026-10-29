import type { Lang } from './i18n'
import type { Tone } from './news'

/** Types et libellés du « Radar intelligent » (sujets émergents, histoires, sentiment, alertes) */

type ToneCount = Record<Tone, number>

export type Emerging = {
  key: string
  label: string
  kind: 'word' | 'phrase' | 'entity'
  recent: number
  baseline: number
  growth: number
  isNew: boolean
  sources: number
  tone: ToneCount
  sentiment: number
  perDay: number[]
  sample: { id: string; title: string; origin: string; date: string; url: string }[]
}

export type Story = {
  id: string
  title: string
  summary: string
  size: number
  sources: string[]
  channels: string[]
  first: { origin: string; date: string; url: string }
  lastDate: string
  perHour: number
  tone: ToneCount
  sentiment: number
  query: string[]
  items: { id: string; title: string; origin: string; channel: string; date: string; url: string; tone: Tone }[]
}

export type ToneRow = ToneCount & { name: string; count: number; sentiment: number }

export type Barometer = ToneCount & {
  days: number
  total: number
  sentiment: number
  inferredShare: number
  perDay: (ToneCount & { date: string; sentiment: number })[]
  actors: ToneRow[]
  actorsLy?: ToneRow[]
  sources: ToneRow[]
}

export type SmartAlert = {
  id: string
  kind: 'spike' | 'emerging' | 'negative' | 'story'
  level: 1 | 2 | 3
  label: string
  detail: Record<string, number | string>
  filter: Record<string, string>
  flow?: AlertFlow
}
export type AlertStatus = 'new' | 'ack' | 'assigned' | 'escalated' | 'validated' | 'closed'
export type AlertFlow = { status: AlertStatus; assignee?: string; history: { at: string; by: string; status: AlertStatus; assignee?: string; comment?: string }[] }

export const RADAR_TEXT = {
  ar: {
    nav: 'الرادار الذكي',
    title: 'الرادار الذكي',
    intro: 'ما يجب أن تعرفه الآن دون أن تبحث عنه: المواضيع الصاعدة، الأخبار التي تتناقلها عدة مصادر، ومؤشر المزاج الإعلامي حول الفاعلين.',
    alerts: 'تنبيهات ذكية',
    alertsEmpty: 'لا شيء غير عادي في آخر 24 ساعة.',
    levels: { 3: 'حرج', 2: 'مرتفع', 1: 'معلومة' } as Record<number, string>,
    kinds: { spike: 'ارتفاع مفاجئ', emerging: 'موضوع جديد', negative: 'تصاعد السلبية', story: 'خبر واسع الانتشار' } as Record<SmartAlert['kind'], string>,
    alertLine: (a: SmartAlert, num: (n: number) => string) => {
      const d = a.detail
      if (a.kind === 'spike')
        return `${num(Number(d.recent))} خبر في 24 ساعة مقابل ${num(Number(d.avg))} في المتوسط${d.negative ? ` · ${num(Number(d.negative))}٪ سلبي` : ''}`
      if (a.kind === 'emerging') return `${num(Number(d.recent))} خبر من ${num(Number(d.sources))} مصادر، لم يُذكر في الأسبوع الماضي`
      if (a.kind === 'negative') return `${num(Number(d.share))}٪ من الأخبار سلبية مقابل ${num(Number(d.before))}٪ قبل ذلك`
      return `تناقلته ${num(Number(d.sources))} مصادر (${num(Number(d.size))} خبر)`
    },
    emerging: 'المواضيع الصاعدة',
    emergingHint: 'كلمات وعبارات يرتفع ذكرها بشكل غير معتاد مقارنة بالأيام السبعة السابقة، من مصدرين على الأقل.',
    windows: { 6: '6 س', 24: '24 س', 72: '3 أيام' } as Record<number, string>,
    isNew: 'جديد',
    growth: (g: string) => `×${g}`,
    mentions: (n: string, s: string) => `${n} خبر · ${s} مصادر`,
    emergingEmpty: 'لا توجد مواضيع صاعدة في هذه الفترة.',
    stories: 'أخبار تتناقلها عدة مصادر',
    storiesHint: 'الأخبار التي تروي الحدث نفسه مجمّعة معاً: كم مصدراً نقلها ومن نشرها أولاً.',
    storiesEmpty: 'لا توجد أخبار متكررة في هذه الفترة.',
    firstBy: (o: string, when: string) => `أول من نشر: ${o} · ${when}`,
    sourcesN: (n: string) => `${n} مصادر`,
    itemsN: (n: string) => `${n} خبر`,
    perHour: (n: string) => `${n} خبر/ساعة`,
    showItems: 'عرض الأخبار',
    hideItems: 'إخفاء',
    openAll: 'فتح في الأخبار',
    barometer: 'مؤشر المزاج الإعلامي',
    barometerHint: 'صافي المزاج = نسبة الأخبار الإيجابية ناقص نسبة السلبية، من −100 إلى +100.',
    netLabel: 'صافي المزاج',
    inferred: (n: string) => `${n}٪ من الأخبار قُدّرت نبرتها آلياً لأن الرصد لم يحددها.`,
    byActor: 'حسب الفاعلين',
    actorsLy: 'الفاعلون الليبيون',
    actorsAll: 'الكل',
    bySource: 'حسب المصادر',
    actor: 'الفاعل',
    source: 'المصدر',
    net: 'الصافي',
    volume: 'الحجم',
    perDay: 'المزاج يوماً بيوم',
    loading: 'جارٍ التحليل…',
    briefTitle: 'تنبيهات حرجة',
    briefMore: 'كل التنبيهات',
  },
  en: {
    nav: 'Smart Radar',
    title: 'Smart Radar',
    intro: 'What you need to know now without searching for it: rising topics, stories picked up by many outlets, and the media mood around key actors.',
    alerts: 'Smart alerts',
    alertsEmpty: 'Nothing unusual in the last 24 hours.',
    levels: { 3: 'Critical', 2: 'High', 1: 'Info' } as Record<number, string>,
    kinds: { spike: 'Sudden spike', emerging: 'New topic', negative: 'Negative surge', story: 'Widely covered story' } as Record<SmartAlert['kind'], string>,
    alertLine: (a: SmartAlert, num: (n: number) => string) => {
      const d = a.detail
      if (a.kind === 'spike') return `${num(Number(d.recent))} items in 24 h vs ${num(Number(d.avg))} on average${d.negative ? ` · ${num(Number(d.negative))}% negative` : ''}`
      if (a.kind === 'emerging') return `${num(Number(d.recent))} items from ${num(Number(d.sources))} sources, absent last week`
      if (a.kind === 'negative') return `${num(Number(d.share))}% negative coverage vs ${num(Number(d.before))}% before`
      return `Picked up by ${num(Number(d.sources))} sources (${num(Number(d.size))} items)`
    },
    emerging: 'Rising topics',
    emergingHint: 'Words and phrases mentioned far more than over the previous 7 days, by at least two sources.',
    windows: { 6: '6 h', 24: '24 h', 72: '3 days' } as Record<number, string>,
    isNew: 'New',
    growth: (g: string) => `×${g}`,
    mentions: (n: string, s: string) => `${n} items · ${s} sources`,
    emergingEmpty: 'No rising topics in this period.',
    stories: 'Stories covered by several outlets',
    storiesHint: 'Items telling the same event, grouped: how many outlets carried it and who published first.',
    storiesEmpty: 'No repeated stories in this period.',
    firstBy: (o: string, when: string) => `First: ${o} · ${when}`,
    sourcesN: (n: string) => `${n} sources`,
    itemsN: (n: string) => `${n} items`,
    perHour: (n: string) => `${n} items/h`,
    showItems: 'Show items',
    hideItems: 'Hide',
    openAll: 'Open in news',
    barometer: 'Media mood barometer',
    barometerHint: 'Net mood = share of positive items minus share of negative items, from −100 to +100.',
    netLabel: 'Net mood',
    inferred: (n: string) => `${n}% of items had their tone estimated automatically because the monitoring did not set it.`,
    byActor: 'By actor',
    actorsLy: 'Libyan actors',
    actorsAll: 'All',
    bySource: 'By source',
    actor: 'Actor',
    source: 'Source',
    net: 'Net',
    volume: 'Volume',
    perDay: 'Mood day by day',
    loading: 'Analysing…',
    briefTitle: 'Critical alerts',
    briefMore: 'All alerts',
  },
}

export const radarText = (lang: Lang) => RADAR_TEXT[lang === 'ar' ? 'ar' : 'en']
