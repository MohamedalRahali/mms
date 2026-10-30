import { useMemo } from 'react'
import { useI18n } from './i18n'
import { assistantName, renameAround, useBrand } from './brand'

/**
 * Around, l'assistant IA de MMS, sur le modèle de Meltwater Mira Studio :
 * textes (arabe / anglais), bibliothèque de prompts, agents et historique des conversations.
 */

export type AnalysisId = 'overview' | 'crisis' | 'media' | 'topics' | 'narratives' | 'audiences' | 'swot' | 'esg' | 'reputation' | 'benchmark' | 'touchpoints' | 'bias' | 'framing' | 'summary' | 'executive' | 'management'
export type AgentId = 'coverage' | 'brief' | 'release' | 'roundup' | AnalysisId
/** Types d'analyse (server/around.js ANALYSIS_TASKS) */
// « المواضيع » couvre aussi les récits et les émotions ; « narratives » reste lisible dans l'historique
export const ANALYSIS_IDS: AnalysisId[] = ['overview', 'crisis', 'media', 'topics', 'audiences', 'swot', 'esg', 'reputation', 'benchmark', 'touchpoints', 'bias', 'framing', 'summary', 'executive', 'management']

export type Source = {
  n: number
  id: string
  title: string
  summary: string
  origin: string
  date: string
  url: string
  image: string
  tone: string
  channel: string
}

type Side = { total: number; perDay: number; sources: number; tones: { positive: number; neutral: number; negative: number }; engagement: { posts: number; views: number; reactions: number; shares: number; comments: number } }
type Named = { name: string; count: number }
export type AgentStats = {
  days: number
  from: string
  to: string
  prevFrom: string
  current: Side
  previous: Side
  dates: string[]
  perDay: number[]
  spikes: { day: string; count: number; sources: Named[]; top: string }[]
  sources: Named[]
  channels: Named[]
  people: Named[]
  orgs: Named[]
  places: (Named & { tones: Side['tones'] })[]
}

export type Turn = {
  id: string
  q: string
  kind: 'ask' | 'agent'
  agent?: AgentId
  subject?: string
  status: 'confirm' | 'running' | 'done' | 'error' | 'cancelled'
  days: number
  watch: string
  watchName: string
  at: string
  title?: string
  answer?: string
  summary?: string
  sections?: { titre: string; points: string[] }[]
  recommendations?: string[]
  stats?: AgentStats
  empty?: boolean
  sources?: Source[]
  followups?: string[]
  considered?: number
  error?: string
  rating?: 1 | -1
  /** Publications cochées sur lesquelles porte la question */
  ids?: string[]
}

export type Conversation = { id: string; title: string; at: string; turns: Turn[] }

export type PromptDef = { id: string; cat: 'summary' | 'analysis' | 'reputation' | 'social'; title: string; desc: string; text: string }
export type AgentDef = { id: AgentId; title: string; desc: string; subject: string; example: string }

const AR = {
  hello: (name: string) => [`مرحباً ${name}`, '، أنا Around. كيف يمكنني مساعدتك اليوم؟'] as [string, string],
  placeholder: 'اسألني عن التغطية الإعلامية، المواضيع، الاتجاهات، وأكثر…',
  agentPlaceholder: (a: string) => `اكتب ${a}…`,
  connect: 'ربط الرصد',
  allMms: 'كل أخبار MMS',
  watches: 'الرصد المبرمج',
  period: 'الفترة',
  periods: { 1: 'آخر 24 ساعة', 7: 'آخر 7 أيام', 30: 'آخر 30 يوماً', 90: 'آخر 90 يوماً', 180: 'آخر 6 أشهر', 365: 'آخر سنة' } as Record<number, string>,
  send: 'إرسال',
  prompts: 'المطالبات',
  history: 'السجل',
  newChat: 'محادثة جديدة',
  back: 'رجوع',
  thread: 'المحادثة',
  canvas: 'اللوحة',
  openCanvas: 'فتح في اللوحة',
  details: 'التفاصيل',
  agents: 'الوكلاء',
  analyses: 'أنواع التحليل',
  express: 'سريع',
  custom: 'تخصيص',
  expressHint: 'اضغط على نوع التحليل ليبدأ فوراً على كل أخبار النطاق والفترة المختارة.',
  customHint: 'اضغط على نوع التحليل ثم اكتب الجهة أو الموضوع واختر الفترة والرصد قبل التشغيل.',
  analysesInfo: 'سريع: تحليل فوري لكل أخبار النطاق والفترة المختارة · مخصّص: اختر الجهة أو الموضوع والفترة والرصد قبل التشغيل. يعمل بمحرك ذكاء اصطناعي لا يعيد استخدام بياناتكم، ويستند إلى أخبار MMS المرقّمة فقط.',
  tooFew: 'الأخبار قليلة جداً لتحليل جدي (أقل من 5). وسّع الفترة أو النطاق.',
  agentsInfo: 'الوكلاء ينفّذون مهام متعددة الخطوات: يجمعون الأخبار، يحسبون المؤشرات ثم يكتبون تقريراً كاملاً.',
  favorites: 'المطالبات المفضلة',
  browseAll: 'تصفح كل المطالبات',
  noFavorites: 'لا توجد مطالبات مفضلة بعد. اضغط ☆ على أي مطالبة في المكتبة لإضافتها هنا.',
  libraryTitle: 'مكتبة المطالبات',
  libraryIntro: 'مطالبات جاهزة لتحليل التغطية، تلخيص الأخبار، متابعة المنافسين وإعداد التقارير. اختر واحدة واترك Around يكمل الباقي.',
  cats: { all: 'الكل', summary: 'ملخصات', analysis: 'تحليل', reputation: 'السمعة والمنافسة', social: 'شبكات التواصل' } as Record<string, string>,
  use: 'استخدام',
  search: 'ابحث في المطالبات…',
  about: 'حول هذه المطالبة',
  thinking: 'يبحث Around في الأخبار…',
  suggestTitle: 'جرّب أن تسأل',
  selChip: (n: string) => `${n} منشورات محددة`,
  selHint: 'عند التفعيل، يجيب Around من المنشورات المحددة فقط (بدل كل أخبار الفترة).',
  selPlaceholder: 'اسأل عن المنشورات المحددة: لخّصها، قارن بينها، استخرج أبرز ما فيها…',
  selEmpty: 'لم أعد أجد المنشورات المحددة في قاعدة MMS (ربما حُذفت أو خرجت من فترة الحفظ). حدّد منشورات أخرى ثم أعد السؤال.',
  noWatches: 'لا يوجد رصد مبرمج بعد. أنشئ رصداً من صفحة «الرصد المبرمج».',
  suggestions: ['ما أبرز أخبار اليوم في ليبيا؟', 'ما المواضيع الأكثر تناولاً هذا الأسبوع؟', 'هل توجد مؤشرات أزمة في التغطية الأخيرة؟', 'ما وسائل الإعلام الأكثر نشاطاً هذا الشهر؟'],
  thinkingSteps: ['يبحث في أخبار MMS…', 'يختار الأخبار الأكثر صلة…', 'يكتب الإجابة ويوثّق المصادر…'],
  confirmIntro: 'قبل أن أبدأ، يرجى تأكيد معايير التقرير:',
  confirmOutro: 'اضغط «تأكيد» للمتابعة، أو «تعديل» لتغيير أي معيار.',
  confirm: 'تأكيد',
  edit: 'تعديل',
  cancelled: 'تم الإلغاء. عدّل الطلب في خانة الكتابة ثم أرسله من جديد.',
  pSubject: 'الموضوع',
  pAgent: 'الوكيل',
  pWatch: 'الرصد',
  pPeriod: 'فترة التقرير',
  pPrev: 'الفترة السابقة (للمقارنة)',
  pSources: 'المصادر',
  pSourcesVal: 'الأخبار، المواقع، شبكات التواصل والبث في MMS',
  allSubject: 'كل الأخبار',
  sources: 'المصادر',
  considered: (n: string) => `من ${n} خبراً ذا صلة`,
  webReport: 'إنشاء تقرير ويب',
  ppt: 'إنشاء عرض PowerPoint',
  pdf: 'تصدير PDF',
  copy: 'نسخ',
  copied: 'تم النسخ',
  regenerate: 'إعادة التوليد',
  email: 'إرسال بالبريد',
  good: 'إجابة مفيدة',
  bad: 'إجابة غير مفيدة',
  thanks: 'شكراً على رأيك',
  followups: 'أسئلة مقترحة للمتابعة',
  disclaimer: 'قد يخطئ Around. استخدم 👍 أو 👎 لتخبرنا بجودة الإجابة.',
  aiOff: 'Around غير مفعّل: لم تُضبط بعد مفاتيح الذكاء الاصطناعي على الخادم.',
  aiError: 'تعذّر الحصول على إجابة. حاول مرة أخرى بعد قليل.',
  errors: {
    KEY: 'مفتاح الذكاء الاصطناعي على الخادم مرفوض أو منتهي الصلاحية. يجب على المشرف تحديثه.',
    QUOTA: 'بلغ محرك الذكاء الاصطناعي حدّ الاستخدام المسموح حالياً. أعد المحاولة بعد دقائق، أو اطلب من المشرف رفع الحد.',
    MODEL: 'نموذج الذكاء الاصطناعي المضبوط لم يعد متاحاً لدى المزوّد ولم يُعثر على بديل. أبلغ المشرف.',
    TIMEOUT: 'استغرق محرك الذكاء الاصطناعي وقتاً أطول من المسموح. جرّب فترة أقصر أو سؤالاً أدق.',
    TRUNCATED: 'كانت الإجابة أطول من الحد المسموح فقُطعت. جرّب سؤالاً أضيق أو فترة أقصر.',
    REFUSED: 'رفض محرك الذكاء الاصطناعي هذا الطلب. أعد صياغة السؤال.',
    PARSE: 'وصلت إجابة غير مكتملة من محرك الذكاء الاصطناعي. اضغط «إعادة التوليد».',
    PROVIDER: 'محرك الذكاء الاصطناعي لا يستجيب حالياً (خطأ لدى المزوّد). حاول مرة أخرى بعد قليل.',
    NETWORK: 'تعذّر الاتصال بخادم MMS. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.',
    AUTH: 'انتهت جلستك أو لا تملك صلاحية استعمال Around. أعد تسجيل الدخول أو تواصل مع المشرف.',
  } as Record<string, string>,
  busy: 'Around مشغول بطلبات أخرى، أعد المحاولة بعد لحظات.',
  empty: 'لم أجد أخباراً عن هذا الموضوع في الفترة والرصد المحددين. جرّب فترة أطول أو صياغة أخرى.',
  noHistory: 'لا توجد محادثات سابقة بعد.',
  today: 'اليوم',
  earlier: 'سابقاً',
  remove: 'حذف',
  exec: 'الملخص التنفيذي',
  kpis: 'المؤشرات الرئيسية',
  metric: 'المؤشر',
  current: 'الفترة الحالية',
  previous: 'الفترة السابقة',
  change: 'التغيّر',
  mVolume: 'إجمالي الأخبار',
  mPerDay: 'متوسط الأخبار يومياً',
  mSources: 'عدد المصادر',
  mPositive: 'أخبار إيجابية',
  mNegative: 'أخبار سلبية',
  mEngagement: 'التفاعلات على المنشورات',
  timeline: 'تطور التغطية يومياً',
  spikes: 'الذروات المكتشفة',
  spikeLine: (n: string) => `${n} خبراً`,
  topSources: 'أبرز المصادر',
  tone: 'النبرة',
  tones: { positive: 'إيجابي', neutral: 'محايد', negative: 'سلبي' } as Record<string, string>,
  geo: 'النبرة حسب المكان',
  place: 'المكان',
  mentions: 'الإشارات',
  voices: 'الشخصيات الأبرز',
  recommendations: 'التوصيات',
  articles: 'أبرز الأخبار',
  generatedBy: 'أُعدّ بواسطة Around · MMS',
  generatedOn: 'تاريخ الإعداد',
  scope: 'النطاق',
  print: 'طباعة / حفظ PDF',
  steps: ['جمع الأخبار المطابقة', 'حساب المؤشرات ومقارنة الفترتين', 'كشف الذروات وتحليل المصادر', 'كتابة التقرير'],
  agentTitle: { coverage: 'تقرير تغطية', brief: 'إحاطة إعلامية', release: 'أثر بيان صحفي', roundup: 'مراجعة قطاعية', overview: 'نظرة عامة', crisis: 'تحليل الأزمة', media: 'الوسائل الإعلامية', topics: 'المواضيع والسرديات والمشاعر', narratives: 'السرديات والمشاعر', audiences: 'الفئات المستهدفة', swot: 'تحليل SWOT', esg: 'تحليل ESG', reputation: 'السمعة', benchmark: 'مقارنة', touchpoints: 'نقاط التواصل', bias: 'التحيّز السياسي', framing: 'التأطير', summary: 'ملخص', executive: 'ملخص تنفيذي', management: 'ملخص للإدارة' } as Record<AgentId, string>,
  mobileTitle: 'Around على هاتفك',
  mobileText: 'ثبّت MMS على الهاتف لتسأل عن التغطية والاتجاهات أينما كنت.',
  library: [
    { id: 'brand', cat: 'summary', title: 'نظرة عامة على أخبار جهة', desc: 'ملخص سريع لأحدث التغطية الإعلامية لجهة أو شخصية، مع العناوين الرئيسية وروابط المصادر.', text: 'أعطني نظرة عامة على أبرز أخبار [الجهة أو الشخصية] في الفترة المحددة، مع العناوين الرئيسية وملخص كل خبر.' },
    { id: 'topic', cat: 'summary', title: 'ملخص المقالات عن موضوع', desc: 'أهم المقالات والتقارير المنشورة حول موضوع أو جهة، مرتبة حسب الأهمية.', text: 'لخّص أهم المقالات والتقارير المنشورة عن [الموضوع]، ورتّبها حسب الأهمية.' },
    { id: 'reaction', cat: 'analysis', title: 'رد فعل الإعلام على قرار', desc: 'كيف تناولت وسائل الإعلام قراراً أو حدثاً: المواقف المؤيدة والمعارضة والنبرة العامة.', text: 'كيف تفاعلت وسائل الإعلام مع [القرار أو الحدث]؟ ما المواقف المؤيدة والمعارضة، وما النبرة الغالبة؟' },
    { id: 'themes', cat: 'analysis', title: 'تحليل التغطية حسب المواضيع', desc: 'المواضيع الأكثر تناولاً في تغطية جهة ما، ونبرة كل موضوع وأبرز مصادره.', text: 'حلّل التغطية الإعلامية لـ[الجهة] حسب المواضيع: ما المواضيع الأكثر تناولاً، وما نبرة كل منها وأبرز مصادرها؟' },
    { id: 'spokesperson', cat: 'reputation', title: 'تصريحات متحدث رئيسي', desc: 'أبرز تصريحات شخصية أو متحدث رسمي وكيف نقلتها وسائل الإعلام.', text: 'ما أبرز تصريحات [اسم المتحدث] في الفترة المحددة، وكيف نقلتها وعلّقت عليها وسائل الإعلام؟' },
    { id: 'outlets', cat: 'analysis', title: 'تحليل المنصات الإعلامية', desc: 'وسائل الإعلام الأكثر تغطية لجهة ما، وزاوية تناول كل منها.', text: 'ما وسائل الإعلام الأكثر تغطية لـ[الجهة]، وما زاوية تناول كل منها؟' },
    { id: 'geo', cat: 'analysis', title: 'النبرة حسب المناطق', desc: 'تحليل جغرافي لنبرة التغطية حسب المدن والمناطق الليبية.', text: 'حلّل نبرة التغطية الإعلامية عن [الجهة أو الموضوع] حسب المدن والمناطق الليبية.' },
    { id: 'compare', cat: 'reputation', title: 'مقارنة بين جهتين', desc: 'حصة الصوت والنبرة والمواضيع لجهتين متنافستين.', text: 'قارن التغطية الإعلامية بين [الجهة 1] و[الجهة 2]: حجم التغطية، النبرة، والمواضيع الأبرز لكل منهما.' },
    { id: 'crisis', cat: 'reputation', title: 'رصد مؤشرات الأزمة', desc: 'انتقادات متصاعدة أو أخبار سلبية قد تتحول إلى أزمة.', text: 'هل توجد مؤشرات أزمة أو انتقادات متصاعدة حول [الجهة]؟ ما مصدرها ومدى انتشارها؟' },
    { id: 'social', cat: 'social', title: 'الأكثر تفاعلاً على الشبكات', desc: 'المنشورات الأكثر تفاعلاً على شبكات التواصل حول موضوع.', text: 'ما المنشورات الأكثر تفاعلاً على شبكات التواصل حول [الموضوع]، وما الذي يقوله الجمهور؟' },
    { id: 'journalists', cat: 'social', title: 'الصحفيون والمصادر الأكثر نشاطاً', desc: 'من يكتب أكثر عن موضوعك، لتحديد من تتواصل معه.', text: 'من هم الصحفيون والمصادر الأكثر تناولاً لـ[الموضوع]، وما زاوية كل منهم؟' },
    { id: 'today', cat: 'summary', title: 'أبرز أخبار اليوم', desc: 'موجز سريع لأهم ما نُشر خلال آخر 24 ساعة.', text: 'ما أبرز أخبار اليوم في ليبيا؟ رتّبها حسب الأهمية.' },
  ] as PromptDef[],
  agentDefs: [
    { id: 'coverage', title: 'وكيل تقرير التغطية', desc: 'تقرير تغطية شامل جاهز للعرض: ملخص تنفيذي، مؤشرات ومقارنة، روايات رئيسية، ذروات وتوصيات.', subject: 'الجهة أو الموضوع', example: 'المؤسسة الوطنية للنفط' },
    { id: 'brief', title: 'وكيل الإحاطة الإعلامية', desc: 'تحضير المسؤولين للمقابلات: ما يقوله الإعلام، الصحفيون الأنشط، الرسائل والأسئلة المتوقعة.', subject: 'الشخصية أو الموضوع', example: 'حكومة الوحدة الوطنية' },
    { id: 'release', title: 'وكيل أثر البيان الصحفي', desc: 'تتبّع انتشار بيانك الصحفي في الأخبار وشبكات التواصل: من نشره ومتى وبأي نبرة.', subject: 'عنوان البيان أو عبارة منه', example: 'إطلاق الخدمة الإلكترونية الجديدة' },
    { id: 'roundup', title: 'وكيل المراجعة القطاعية', desc: 'مراجعة دورية لقطاع أو ملف: أهم الأخبار، الفاعلون، الاتجاهات والإشارات الضعيفة.', subject: 'القطاع أو الملف', example: 'قطاع النفط والطاقة' },
    { id: 'overview', title: 'نظرة عامة', desc: 'الصورة العامة للتغطية مع توصيات استراتيجية.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
    { id: 'crisis', title: 'تحليل الأزمة', desc: 'رصد مؤشرات الأزمة ودرجة خطورتها ومصادرها والإجراءات الفورية.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
    { id: 'media', title: 'الوسائل الإعلامية', desc: 'دور كل وسيلة وحضورها ونبرتها.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
    { id: 'topics', title: 'المواضيع والسرديات والمشاعر', desc: 'أهم المواضيع ووزنها، كيف يرويها الإعلام، والمشاعر الغالبة.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
    { id: 'narratives', title: 'السرديات والمشاعر', desc: 'كيف يروي الإعلام الموضوع والمشاعر الغالبة.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
    { id: 'audiences', title: 'الفئات المستهدفة', desc: 'الفئات المعنية وما يهم كل فئة.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
    { id: 'swot', title: 'تحليل SWOT', desc: 'نقاط القوة والضعف والفرص والتهديدات في الصورة الإعلامية.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
    { id: 'esg', title: 'تحليل ESG', desc: 'البيئة والمجتمع والحوكمة في التغطية.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
    { id: 'reputation', title: 'السمعة', desc: 'صورة الجهة وعوامل تحسين السمعة والإضرار بها.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
    { id: 'benchmark', title: 'مقارنة', desc: 'مقارنة الجهات أو الفترات: الحضور والنبرة والمواضيع.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
    { id: 'touchpoints', title: 'نقاط التواصل', desc: 'القنوات والتوقيت والوسائط الأكثر تفاعلاً.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
    { id: 'bias', title: 'التحيّز السياسي', desc: 'اتجاهات المصادر وتوازن التغطية.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
    { id: 'framing', title: 'التأطير', desc: 'الأطر المستعملة وكيف يُؤطَّر الفاعلون.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
    { id: 'summary', title: 'ملخص', desc: 'أهم الأخبار في سطور.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
    { id: 'executive', title: 'ملخص تنفيذي', desc: 'الخلاصة في دقيقة لصاحب القرار.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
    { id: 'management', title: 'ملخص للإدارة', desc: 'الوضع والمخاطر والفرص والأولويات.', subject: 'الجهة أو الموضوع (اختياري)', example: 'المؤسسة الوطنية للنفط' },
  ] as AgentDef[],
}

const EN: typeof AR = {
  hello: (name: string) => [`Hello ${name}`, ", I'm Around. How can I help you today?"] as [string, string],
  placeholder: 'Ask me about your media coverage, insights, trends, and more!',
  agentPlaceholder: (a: string) => `Type the ${a}…`,
  connect: 'Connect a watch',
  allMms: 'All MMS news',
  watches: 'Scheduled watches',
  period: 'Period',
  periods: { 1: 'Last 24 hours', 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days', 180: 'Last 6 months', 365: 'Last year' },
  send: 'Send',
  prompts: 'Prompts',
  history: 'View history',
  newChat: 'New chat',
  back: 'Back',
  thread: 'Thread',
  canvas: 'Canvas',
  openCanvas: 'Open canvas',
  details: 'Details',
  agents: 'Agents',
  analyses: 'Analysis types',
  express: 'Express',
  custom: 'Configure',
  expressHint: 'Click an analysis type to run it at once on all news in the selected scope and period.',
  customHint: 'Click an analysis type, then type the entity or topic and pick the period and watch before running.',
  analysesInfo: 'Express: instant analysis of all news in the selected scope and period · Custom: choose the entity or topic, period and watch first. Runs on an AI engine that does not reuse your data, and only uses numbered MMS news.',
  tooFew: 'Too few news items for a serious analysis (fewer than 5). Widen the period or scope.',
  agentsInfo: 'Agents run multi-step workflows: they gather the news, compute the metrics, then write a full report.',
  favorites: 'Favorite prompts',
  browseAll: 'Browse all prompts',
  noFavorites: 'No favorite prompts yet. Click ☆ on any prompt in the library to add it here.',
  libraryTitle: 'Prompt library',
  libraryIntro: 'Ready-made prompts to analyse coverage, summarise news, monitor competitors and build reports. Pick one and let Around do the rest.',
  cats: { all: 'All', summary: 'Summaries', analysis: 'Analysis', reputation: 'Reputation & competition', social: 'Social media' },
  use: 'Use',
  search: 'Search prompts…',
  about: 'About this prompt',
  thinking: 'Around is searching the news…',
  suggestTitle: 'Try asking',
  selChip: (n: string) => `${n} selected posts`,
  selHint: 'When on, Around answers from the selected posts only (instead of all news in the period).',
  selPlaceholder: 'Ask about the selected posts: summarise, compare, pull out the key points…',
  selEmpty: 'The selected posts are no longer in the MMS database (deleted or past the retention period). Select other posts and ask again.',
  noWatches: 'No scheduled watch yet. Create one from the “Scheduled watches” page.',
  suggestions: ['What are the top news in Libya today?', 'Which topics were most covered this week?', 'Are there signs of a crisis in recent coverage?', 'Which media outlets were most active this month?'],
  thinkingSteps: ['Searching MMS news…', 'Picking the most relevant stories…', 'Writing the answer and citing sources…'],
  confirmIntro: 'Before I proceed, please confirm the report parameters:',
  confirmOutro: 'Click “Confirm” to proceed, or “Edit” to change any parameter.',
  confirm: 'Confirm',
  edit: 'Edit',
  cancelled: 'Cancelled. Edit your request in the box below and send it again.',
  pSubject: 'Subject of interest',
  pAgent: 'Agent',
  pWatch: 'Watch',
  pPeriod: 'Reporting period',
  pPrev: 'Prior period (comparison)',
  pSources: 'Sources',
  pSourcesVal: 'News, websites, social media and broadcast in MMS',
  allSubject: 'All news',
  sources: 'Sources',
  considered: (n: string) => `from ${n} relevant news`,
  webReport: 'Generate web report',
  ppt: 'Generate PowerPoint',
  pdf: 'Export PDF',
  copy: 'Copy',
  copied: 'Copied',
  regenerate: 'Regenerate',
  email: 'Send by email',
  good: 'Helpful answer',
  bad: 'Unhelpful answer',
  thanks: 'Thanks for your feedback',
  followups: 'Suggested follow-ups',
  disclaimer: 'Around can make mistakes. Use 👍 or 👎 to let us know how it did.',
  aiOff: 'Around is off: the AI keys are not set on the server yet.',
  aiError: 'Could not get an answer. Please try again in a moment.',
  errors: {
    KEY: 'The AI key on the server was rejected or has expired. An administrator must update it.',
    QUOTA: 'The AI engine has reached its usage limit for now. Try again in a few minutes, or ask an administrator to raise the limit.',
    MODEL: 'The configured AI model is no longer offered by the provider and no replacement was found. Please tell an administrator.',
    TIMEOUT: 'The AI engine took too long to answer. Try a shorter period or a more precise question.',
    TRUNCATED: 'The answer was longer than allowed and got cut off. Try a narrower question or a shorter period.',
    REFUSED: 'The AI engine declined this request. Please rephrase your question.',
    PARSE: 'The AI engine returned an incomplete answer. Click “Regenerate”.',
    PROVIDER: 'The AI engine is not responding right now (provider error). Please try again in a moment.',
    NETWORK: 'Could not reach the MMS server. Check your internet connection and try again.',
    AUTH: 'Your session has expired or you are not allowed to use Around. Sign in again or contact your administrator.',
  },
  busy: 'Around is busy with other requests, try again in a few seconds.',
  empty: 'I found no news on this subject for the selected watch and period. Try a longer period or other wording.',
  noHistory: 'No previous conversations yet.',
  today: 'Today',
  earlier: 'Earlier',
  remove: 'Delete',
  exec: 'Executive summary',
  kpis: 'Key metrics',
  metric: 'Metric',
  current: 'Current period',
  previous: 'Prior period',
  change: 'Change',
  mVolume: 'Total volume',
  mPerDay: 'Avg. mentions per day',
  mSources: 'Sources',
  mPositive: 'Positive news',
  mNegative: 'Negative news',
  mEngagement: 'Post interactions',
  timeline: 'Daily coverage',
  spikes: 'Detected spikes',
  spikeLine: (n: string) => `${n} mentions`,
  topSources: 'Top sources',
  tone: 'Sentiment',
  tones: { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' },
  geo: 'Sentiment by location',
  place: 'Location',
  mentions: 'Mentions',
  voices: 'Top voices',
  recommendations: 'Recommendations',
  articles: 'Top articles',
  generatedBy: 'Generated by Around · MMS',
  generatedOn: 'Generated on',
  scope: 'Scope',
  print: 'Print / save as PDF',
  steps: ['Gathering matching news', 'Computing metrics and comparing periods', 'Detecting spikes and analysing sources', 'Writing the report'],
  agentTitle: { coverage: 'Coverage report', brief: 'Media brief', release: 'Release impact', roundup: 'Industry roundup', overview: 'Overview', crisis: 'Crisis analysis', media: 'Media', topics: 'Topics, narratives & emotions', narratives: 'Narratives & emotions', audiences: 'Target groups', swot: 'SWOT', esg: 'ESG', reputation: 'Reputation', benchmark: 'Benchmark', touchpoints: 'Touchpoints', bias: 'Political bias', framing: 'Framing', summary: 'Summary', executive: 'Executive summary', management: 'Management summary' },
  mobileTitle: 'Around on your phone',
  mobileText: 'Install MMS on your phone to ask about coverage and trends wherever you are.',
  library: [
    { id: 'brand', cat: 'summary', title: 'News overview for a brand', desc: "A quick summary of a brand's or person's recent coverage, with key headlines and links to the sources.", text: 'Give me an overview of the top news about [brand or person] in the selected period, with the key headlines and a summary of each story.' },
    { id: 'topic', cat: 'summary', title: 'Article overview on a topic', desc: 'The most important articles and reports about a topic or brand, ranked by importance.', text: 'Summarise the most important articles and reports about [topic], ranked by importance.' },
    { id: 'reaction', cat: 'analysis', title: 'Media reaction to a decision', desc: 'How the media covered a decision or event: supportive and critical positions and overall tone.', text: 'How did the media react to [decision or event]? What are the supportive and critical positions, and the dominant tone?' },
    { id: 'themes', cat: 'analysis', title: 'Coverage analysis by topic', desc: "The most covered topics in a brand's coverage, with the tone and main sources of each.", text: 'Analyse the media coverage of [brand] by topic: which topics are most covered, and what is the tone and main sources of each?' },
    { id: 'spokesperson', cat: 'reputation', title: 'Mentions of a key spokesperson', desc: "A spokesperson's main statements and how the media reported them.", text: 'What were the main statements of [spokesperson] in the selected period, and how did the media report and comment on them?' },
    { id: 'outlets', cat: 'analysis', title: 'Media outlet analysis', desc: 'The outlets covering a brand the most, and the angle each one takes.', text: 'Which media outlets covered [brand] the most, and what angle does each take?' },
    { id: 'geo', cat: 'analysis', title: 'Geographic sentiment analysis', desc: 'Sentiment of the coverage by Libyan city and region.', text: 'Analyse the sentiment of media coverage about [brand or topic] by Libyan city and region.' },
    { id: 'compare', cat: 'reputation', title: 'Compare two brands', desc: 'Share of voice, sentiment and topics for two competitors.', text: 'Compare the media coverage of [brand 1] and [brand 2]: volume, sentiment and the main topics of each.' },
    { id: 'crisis', cat: 'reputation', title: 'Crisis early warning', desc: 'Rising criticism or negative news that could turn into a crisis.', text: 'Are there signs of a crisis or rising criticism around [brand]? Where does it come from and how far has it spread?' },
    { id: 'social', cat: 'social', title: 'Most engaging social posts', desc: 'The most engaging social media posts about a topic.', text: 'What are the most engaging social media posts about [topic], and what is the audience saying?' },
    { id: 'journalists', cat: 'social', title: 'Most active journalists and sources', desc: 'Who writes most about your topic, so you know whom to reach.', text: 'Who are the journalists and sources covering [topic] the most, and what is the angle of each?' },
    { id: 'today', cat: 'summary', title: "Today's top news", desc: 'A quick brief of the most important news of the last 24 hours.', text: 'What are the top news in Libya today? Rank them by importance.' },
  ],
  agentDefs: [
    { id: 'coverage', title: 'Coverage Report Agent', desc: 'A comprehensive, presentation-ready report: executive overview, metrics and comparison, key narratives, spikes and recommendations.', subject: 'brand or topic', example: 'National Oil Corporation' },
    { id: 'brief', title: 'Media Brief Agent', desc: 'Prepare executives for media interviews: what the media say, most active journalists, key messages and likely questions.', subject: 'person or topic', example: 'Government of National Unity' },
    { id: 'release', title: 'Release Impact Agent', desc: 'Track where your press release appears across news and social media: who picked it up, when, and with what tone.', subject: 'release title or a phrase from it', example: 'launch of the new e-service' },
    { id: 'roundup', title: 'Industry Roundup Agent', desc: 'A periodic review of a sector: top news, key players, trends and weak signals.', subject: 'sector or issue', example: 'oil and energy sector' },
    { id: 'overview', title: 'Overview', desc: 'The big picture of the coverage with strategic recommendations.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
    { id: 'crisis', title: 'Crisis analysis', desc: 'Crisis signals, severity, triggers and immediate actions.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
    { id: 'media', title: 'Media', desc: 'Role, visibility and tone of each outlet.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
    { id: 'topics', title: 'Topics, narratives & emotions', desc: 'Main topics and their weight, how the media tell them, and the dominant emotions.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
    { id: 'narratives', title: 'Narratives & emotions', desc: 'How the media tell the story and the dominant emotions.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
    { id: 'audiences', title: 'Target groups', desc: 'Groups concerned and what matters to each.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
    { id: 'swot', title: 'SWOT', desc: 'Strengths, weaknesses, opportunities and threats of the media image.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
    { id: 'esg', title: 'ESG', desc: 'Environment, social and governance in the coverage.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
    { id: 'reputation', title: 'Reputation', desc: 'Image of the entity and what helps or hurts it.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
    { id: 'benchmark', title: 'Benchmark', desc: 'Compare entities or periods: presence, tone, topics.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
    { id: 'touchpoints', title: 'Touchpoints', desc: 'Channels, timing and most engaging media.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
    { id: 'bias', title: 'Political bias', desc: 'Leanings of sources and balance of coverage.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
    { id: 'framing', title: 'Framing', desc: 'Frames used and how actors are framed.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
    { id: 'summary', title: 'Summary', desc: 'The main news in a few lines.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
    { id: 'executive', title: 'Executive summary', desc: 'One-minute digest for decision-makers.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
    { id: 'management', title: 'Management summary', desc: 'Situation, risks, opportunities, priorities.', subject: 'entity or topic (optional)', example: 'National Oil Corporation' },
  ],
}

export function useAround() {
  const i = useI18n()
  // Nom de l'assistant choisi par le client (ou marque blanche) : remplace « Around » dans tous les textes
  const name = assistantName(useBrand(), i.lang)
  const base = i.lang === 'en' ? EN : AR
  return useMemo(() => renameAround(base, name), [base, name])
}

export type AroundText = typeof AR

/* ---------------------------------------------------------------- historique et favoris (sur ce poste) */

const histKey = (email: string) => `mms-around-history:${email}`
const FAV_KEY = 'mms-around-fav'
const MAX_CONV = 40

export function readHistory(email: string): Conversation[] {
  try {
    const list = JSON.parse(localStorage.getItem(histKey(email)) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveConversation(email: string, conv: Conversation) {
  if (!conv.turns.length) return
  // Les demandes en cours ne sont pas gardées : elles ne reprendraient pas au rechargement
  const turns = conv.turns.map((t) => (t.status === 'running' ? { ...t, status: 'error' as const, error: '' } : t))
  const list = [{ ...conv, turns }, ...readHistory(email).filter((c) => c.id !== conv.id)].slice(0, MAX_CONV)
  try {
    localStorage.setItem(histKey(email), JSON.stringify(list))
  } catch {
    /* stockage plein ou bloqué */
  }
}

export function removeConversation(email: string, id: string) {
  try {
    localStorage.setItem(histKey(email), JSON.stringify(readHistory(email).filter((c) => c.id !== id)))
  } catch {
    /* stockage bloqué */
  }
}

export function readFavorites(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(FAV_KEY) || '["brand","themes"]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveFavorites(ids: string[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(ids))
  } catch {
    /* stockage bloqué */
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
