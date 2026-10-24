import { type Tone } from './news'
import { useI18n } from './i18n'

/** Libellés de la couche « intelligence » : tonalité, entités, pics, étiquettes, exports */

export const TONE_COLORS: Record<Tone, string> = { positive: '#2fcb81', neutral: '#8a9e93', negative: '#ff7a59' }

export const INTEL_TEXT = {
  ar: {
    tones: { positive: 'إيجابي', neutral: 'محايد', negative: 'سلبي' } as Record<Tone, string>,
    tone: 'النبرة',
    allTones: 'كل النبرات',
    toneTrend: 'تطور النبرة',
    people: 'الشخصيات',
    orgs: 'المؤسسات',
    places: 'الأماكن',
    source: 'المصدر',
    allSources: 'كل المصادر',
    tag: 'الوسم',
    allTags: 'كل الوسوم',
    exclude: 'استبعاد كلمات (مفصولة بفواصل)',
    important: 'المهمة فقط',
    entityFilter: 'الكيان',
    removeFilter: 'إزالة هذا المرشّح',
    exportCsv: 'تصدير Excel (CSV)',
    tags: 'الوسوم',
    addTag: 'إضافة وسم',
    tagPlaceholder: 'اسم الوسم ثم Enter',
    tagError: 'تعذّر حفظ الوسم.',
    importance: { 3: 'حدث وطني بارز', 2: 'خبر لافت' } as Record<number, string>,
    spikesTitle: 'نشاط غير معتاد خلال 24 ساعة',
    spikeLine: (count: string, avg: string) => `${count} إشارة مقابل ${avg} يومياً في المتوسط`,
    spikeNew: (count: string) => `${count} إشارة، موضوع جديد هذا الأسبوع`,
    spikeDims: { categories: 'موضوع', sources: 'مصدر', people: 'شخصية', orgs: 'مؤسسة', places: 'مكان' } as Record<string, string>,
    why: 'لماذا؟',
    showAll: (n: number) => `عرض الكل (${n})`,
    explaining: 'جارٍ التحليل…',
    explainError: 'تعذّر التحليل الآن.',
    seeNews: 'عرض الأخبار',
    drillHint: 'انقر لعرض الأخبار المعنية',
  },
  en: {
    tones: { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' } as Record<Tone, string>,
    tone: 'Tone',
    allTones: 'All tones',
    toneTrend: 'Tone over time',
    people: 'People',
    orgs: 'Organizations',
    places: 'Places',
    source: 'Source',
    allSources: 'All sources',
    tag: 'Tag',
    allTags: 'All tags',
    exclude: 'Exclude words (comma-separated)',
    important: 'Important only',
    entityFilter: 'Entity',
    removeFilter: 'Remove this filter',
    exportCsv: 'Export to Excel (CSV)',
    tags: 'Tags',
    addTag: 'Add a tag',
    tagPlaceholder: 'Tag name, then Enter',
    tagError: 'The tag could not be saved.',
    importance: { 3: 'Major national event', 2: 'Notable' } as Record<number, string>,
    spikesTitle: 'Unusual activity in the last 24 hours',
    spikeLine: (count: string, avg: string) => `${count} mentions vs ${avg} a day on average`,
    spikeNew: (count: string) => `${count} mentions, new this week`,
    spikeDims: { categories: 'Topic', sources: 'Source', people: 'Person', orgs: 'Organization', places: 'Place' } as Record<string, string>,
    why: 'Why?',
    showAll: (n: number) => `Show all (${n})`,
    explaining: 'Analyzing…',
    explainError: 'The analysis is not available right now.',
    seeNews: 'See the news',
    drillHint: 'Click to see the matching news',
  },
}

export function useIntel() {
  const i = useI18n()
  return INTEL_TEXT[i.lang]
}
