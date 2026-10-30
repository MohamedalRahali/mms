import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useI18n } from '../lib/i18n'
import { PageHead } from './Extras'
import './portalFeed.css'

/**
 * إدارة البوابة العامة : publication MANUELLE sur la vitrine publique /portal (server/portalFeed.js).
 * Les règles à gauche ne font que proposer des actualités (onglet « مقترحة ») ; chaque publication passe par
 * l'éditeur : titre et résumé réécrits, lien vers la source, case de validation. Journal des publications en bas.
 * Réservé au droit « publish_public ».
 */

type FeedType = 'article' | 'tv' | 'radio' | 'youtube' | 'podcast' | 'blog' | 'social' | 'forum'
type Config = {
  enabled: boolean
  auto: boolean
  includeApproved: boolean
  types: FeedType[]
  langs: string[]
  categories: string[]
  sourceMode: 'all' | 'include' | 'exclude'
  sources: string[]
  keywords: string[]
  excludeKeywords: string[]
  minImportance: number
  tones: string[]
  maxAgeDays: number
  requireSummary: boolean
  requireImage: boolean
  perSourceDaily: number
  title: string
  intro: string
}
type Count = { name: string; count: number }
type Mark = { id: string; by: string; at: string; until?: string; title: string; source: string; date: string; missing: boolean }
type Published = { title: string; summary: string; url: string; by: string; at: string; updatedBy?: string; updatedAt?: string }
type LogRow = { at: string; action: string; by: string; id: string; title: string; original?: string; source?: string }
type FeedState = {
  config: Config
  defaults: Config
  published: Mark[]
  log: LogRow[]
  pins: Mark[]
  excluded: Mark[]
  updatedBy: string
  updatedAt: string
  history: { by: string; at: string; what: string }[]
  options: { types: Count[]; langs: Count[]; categories: Count[]; sources: Count[] }
}
type Row = {
  id: string
  title: string
  summary: string
  source: string
  date: string
  type: FeedType
  lang: string
  category: string
  image: string
  url: string
  importance: number
  status: 'pinned' | 'shown' | 'suggested' | 'hidden' | 'excluded'
  reason: string
  published: Published | null
}
type Preview = {
  stats: { shown: number; suggested: number; pinned: number; approved: number; excluded: number; last24h: number; byType: Record<string, number>; byLang: Record<string, number>; bySource: Count[]; hiddenBy: Record<string, number> }
  total: number
  page: number
  pages: number
  items: Row[]
}
type Tab = 'suggested' | 'shown' | 'hidden' | 'pinned' | 'excluded'

const TYPES: FeedType[] = ['article', 'tv', 'radio', 'youtube', 'podcast', 'blog', 'social', 'forum']
const ICON: Record<FeedType, string> = { article: '📰', tv: '📺', radio: '📻', youtube: '▶', podcast: '🎙', blog: '✍', social: '💬', forum: '🗨' }

const TEXT = {
  ar: {
    title: 'إدارة البوابة العامة',
    intro: 'النشر على البوابة العامة يدوي فقط: القواعد أدناه تقترح الأخبار، ولا يُنشر أي خبر إلا بعد مراجعته وإعادة صياغة عنوانه وملخصه وإرفاق رابط المصدر. كل عملية نشر أو سحب مسجّلة في سجل النشر.',
    manualOnly: 'نشر يدوي فقط — لا شيء يُنشر تلقائياً',
    manualHint: 'القواعد تحدد الأخبار المقترحة فقط. افتح « مقترحة »، ثم « إعادة الصياغة والنشر ».',
    kSuggested: 'مقترحة (30 يوماً)',
    publishBtn: 'إعادة الصياغة والنشر',
    editBtn: 'تعديل النص المنشور',
    unpublish: 'سحب من البوابة',
    unpublishAsk: 'سحب هذا الخبر من البوابة العامة؟',
    edTitle: 'العنوان المنشور (بصياغتكم)',
    edSummary: 'الملخص المنشور (بصياغتكم، 40 إلى 600 حرف)',
    edUrl: 'رابط المصدر الأصلي',
    edOriginal: 'النص الأصلي (للمرجع، لا يُنشر)',
    edConfirm: 'راجعتُ الخبر وتحققتُ من مصدره، وأعدتُ صياغة العنوان والملخص.',
    edNote: 'لا تُنشر الفيديوهات ولا منشورات X والشبكات كاملة: الملخص المعاد صياغته والرابط فقط.',
    edSave: 'نشر على البوابة',
    edUpdate: 'حفظ التعديل',
    edCancel: 'إلغاء',
    pubBy: (by: string, at: string) => `نشره ${by || '—'} في ${at}`,
    errs: {
      NOT_CONFIRMED: 'يجب تأكيد المراجعة قبل النشر.',
      TITLE_LENGTH: 'العنوان بين 10 و200 حرف.',
      SUMMARY_LENGTH: 'الملخص بين 40 و600 حرف.',
      NO_URL: 'رابط المصدر مطلوب (يبدأ بـ http).',
      TITLE_COPY: 'العنوان منسوخ من المصدر: أعيدوا صياغته.',
      SUMMARY_COPY: 'الملخص منسوخ من المصدر: أعيدوا صياغته.',
      NOT_PUBLISHED: 'لا يمكن تثبيت خبر غير منشور.',
      TYPE: 'التعليقات لا تُنشر.',
    } as Record<string, string>,
    log: 'سجل النشر',
    logCsv: 'تنزيل السجل (CSV)',
    logEmpty: 'لا توجد عمليات نشر بعد.',
    acts: { publish: 'نشر', update: 'تعديل', unpublish: 'سحب', pin: 'تثبيت', unpin: 'إلغاء تثبيت', exclude: 'استبعاد', include: 'إرجاع', manual_only: 'تفعيل النشر اليدوي فقط' } as Record<string, string>,
    open: 'فتح البوابة ↗',
    on: 'النشر مفعّل',
    off: 'النشر متوقف',
    offNote: 'البوابة لا تعرض أي خبر حالياً.',
    auto: 'تلقائي حسب القواعد',
    manual: 'يدوي فقط (المثبّتة والمعتمدة)',
    mode: 'طريقة النشر',
    kShown: 'معروض الآن',
    k24: 'خلال 24 ساعة',
    kPinned: 'مثبّت',
    kExcluded: 'مستبعد',
    last: (by: string, at: string) => `آخر تعديل: ${at}${by ? ` — ${by}` : ''}`,
    types: 'أنواع المحتوى',
    typesHint: 'لا يُنشر إلا ما تختاره هنا.',
    type: { article: 'مقالات', tv: 'تلفزيون', radio: 'إذاعة', youtube: 'يوتيوب', podcast: 'بودكاست', blog: 'مدونات', social: 'شبكات التواصل', forum: 'منتديات' } as Record<FeedType, string>,
    langs: 'اللغات',
    cats: 'المواضيع',
    all: 'الكل',
    allHint: 'بدون اختيار = الكل',
    sources: 'المصادر',
    srcAll: 'كل المصادر',
    srcInclude: 'هذه المصادر فقط',
    srcExclude: 'كل المصادر ما عدا',
    srcSearch: 'ابحث عن مصدر',
    srcPicked: (n: number) => `${n} مصدر مختار`,
    srcClear: 'إلغاء الاختيار',
    keywords: 'كلمات يجب أن يتضمنها الخبر',
    keywordsHint: 'يكفي وجود كلمة واحدة. بدون كلمات = لا شرط.',
    banned: 'كلمات تمنع النشر',
    bannedHint: 'أي خبر يحتوي إحدى هذه الكلمات لا يُنشر أبداً.',
    addWord: 'اكتب كلمة ثم Enter',
    quality: 'الجودة والحداثة',
    importance: 'الأهمية الدنيا',
    imp: ['كل الأخبار', 'متوسطة فأعلى', 'مرتفعة فقط'],
    tones: 'النبرة',
    tone: { positive: 'إيجابية', neutral: 'محايدة', negative: 'سلبية' } as Record<string, string>,
    age: 'عمر الخبر',
    ages: { 1: 'آخر 24 ساعة', 3: 'آخر 3 أيام', 7: 'آخر أسبوع', 14: 'آخر أسبوعين', 30: 'آخر 30 يوماً', 90: 'آخر 3 أشهر', 365: 'آخر سنة', 0: 'بدون حد' } as Record<number, string>,
    reqSummary: 'ملخص مطلوب',
    reqImage: 'صورة مطلوبة',
    cap: 'الحد الأقصى لكل مصدر في اليوم',
    capNone: 'بدون حد',
    approved: '',
    site: 'واجهة البوابة',
    siteTitle: 'عنوان البوابة',
    siteIntro: 'نص تعريفي قصير',
    siteHint: 'يظهر في رأس البوابة. اتركه فارغاً للنص الافتراضي.',
    save: 'حفظ قواعد الاقتراح',
    saving: 'جارٍ الحفظ…',
    saved: 'تم الحفظ. البوابة تتحدّث خلال دقيقة.',
    discard: 'تجاهل التغييرات',
    reset: 'القواعد الافتراضية',
    resetAsk: 'إرجاع كل القواعد إلى الإعدادات الافتراضية؟ التثبيت والاستبعاد لا يتغيران.',
    dirty: 'تغييرات غير محفوظة — المعاينة تعرض النتيجة بعد الحفظ',
    preview: 'المعاينة',
    tabs: { suggested: 'مقترحة', shown: 'المنشور', hidden: 'غير المقترح', pinned: 'المثبّت', excluded: 'المستبعد' } as Record<Tab, string>,
    search: 'ابحث في العناوين',
    allTypes: 'كل الأنواع',
    pinFor: 'مدة التثبيت',
    pinFors: { 0: 'دائم', 1: '24 ساعة', 3: '3 أيام', 7: 'أسبوع' } as Record<number, string>,
    pin: 'تثبيت',
    unpin: 'إلغاء التثبيت',
    exclude: 'استبعاد',
    include: 'إرجاع',
    pinnedTag: 'مثبّت',
    until: 'حتى',
    empty: 'لا توجد أخبار في هذه القائمة.',
    hiddenNote: 'آخر 30 يوماً فقط.',
    loadErr: 'تعذّر التحميل. أعد المحاولة.',
    denied: 'هذه الصفحة تتطلب صلاحية « الموافقة على نشر الأخبار في الواجهة العامة ».',
    prev: 'السابق',
    next: 'التالي',
    page: (p: number, n: number) => `${p} / ${n}`,
    count: (n: number) => `${n} خبر`,
    why: 'السبب',
    reasons: {
      pinned: 'مثبّت',
      approved: 'معتمد يدوياً',
      published: 'منشور بعد المراجعة',
      rules: 'مقترح (يطابق القواعد)',
      excluded: 'مستبعد يدوياً',
      disabled: 'النشر متوقف',
      notAuto: 'النشر التلقائي غير مفعّل',
      type: 'النوع غير مختار',
      lang: 'اللغة غير مختارة',
      category: 'الموضوع غير مختار',
      source: 'المصدر غير مسموح',
      keyword: 'لا يتضمن الكلمات المطلوبة',
      excludeKeyword: 'يتضمن كلمة ممنوعة',
      importance: 'أهمية أقل من المطلوب',
      tone: 'النبرة غير مختارة',
      age: 'أقدم من المدة المحددة',
      summary: 'بدون ملخص',
      image: 'بدون صورة',
      cap: 'تجاوز حد المصدر اليومي',
    } as Record<string, string>,
    hiddenBy: 'أسباب عدم الاقتراح (30 يوماً)',
    byType: 'التوزيع حسب النوع',
    bySource: 'أكثر المصادر حضوراً',
    history: 'سجل التغييرات',
    hist: { config: 'تعديل القواعد', reset: 'إرجاع الإعدادات الافتراضية', pin: 'تثبيت', unpin: 'إلغاء تثبيت', exclude: 'استبعاد', include: 'إرجاع' } as Record<string, string>,
    read: 'المصدر ↗',
    lang: { ar: 'العربية', en: 'الإنجليزية', fr: 'الفرنسية', it: 'الإيطالية', tr: 'التركية', es: 'الإسبانية', de: 'الألمانية', ru: 'الروسية' } as Record<string, string>,
  },
  en: {
    title: 'Public portal management',
    intro: 'Publishing on the public portal is manual only: the rules below suggest news, and nothing is published until someone has reviewed it, rewritten its title and summary and attached the source link. Every publication and withdrawal is recorded in the publication log.',
    manualOnly: 'Manual publishing only — nothing is published automatically',
    manualHint: 'The rules only select suggested news. Open « Suggested », then « Rewrite and publish ».',
    kSuggested: 'Suggested (30 days)',
    publishBtn: 'Rewrite and publish',
    editBtn: 'Edit published text',
    unpublish: 'Withdraw from portal',
    unpublishAsk: 'Withdraw this story from the public portal?',
    edTitle: 'Published title (your own wording)',
    edSummary: 'Published summary (your own wording, 40 to 600 characters)',
    edUrl: 'Link to the original source',
    edOriginal: 'Original text (reference only, not published)',
    edConfirm: 'I reviewed this story, checked its source and rewrote the title and summary.',
    edNote: 'Videos, X posts and social media are never republished in full: only the rewritten summary and the link.',
    edSave: 'Publish on the portal',
    edUpdate: 'Save changes',
    edCancel: 'Cancel',
    pubBy: (by: string, at: string) => `Published by ${by || '—'} on ${at}`,
    errs: {
      NOT_CONFIRMED: 'Please confirm the review before publishing.',
      TITLE_LENGTH: 'Title must be 10 to 200 characters.',
      SUMMARY_LENGTH: 'Summary must be 40 to 600 characters.',
      NO_URL: 'A source link (http…) is required.',
      TITLE_COPY: 'The title copies the source: please rewrite it.',
      SUMMARY_COPY: 'The summary copies the source: please rewrite it.',
      NOT_PUBLISHED: 'Only published stories can be pinned.',
      TYPE: 'Comments are never published.',
    } as Record<string, string>,
    log: 'Publication log',
    logCsv: 'Download log (CSV)',
    logEmpty: 'Nothing published yet.',
    acts: { publish: 'Published', update: 'Edited', unpublish: 'Withdrawn', pin: 'Pinned', unpin: 'Unpinned', exclude: 'Excluded', include: 'Restored', manual_only: 'Manual-only publishing enabled' } as Record<string, string>,
    open: 'Open the portal ↗',
    on: 'Publishing on',
    off: 'Publishing paused',
    offNote: 'The portal shows no news right now.',
    auto: 'Automatic, by rules',
    manual: 'Manual only (pinned and approved)',
    mode: 'Publishing mode',
    kShown: 'Shown now',
    k24: 'Last 24 h',
    kPinned: 'Pinned',
    kExcluded: 'Excluded',
    last: (by: string, at: string) => `Last change: ${at}${by ? ` — ${by}` : ''}`,
    types: 'Content types',
    typesHint: 'Only what you pick here is published.',
    type: { article: 'Articles', tv: 'TV', radio: 'Radio', youtube: 'YouTube', podcast: 'Podcasts', blog: 'Blogs', social: 'Social media', forum: 'Forums' } as Record<FeedType, string>,
    langs: 'Languages',
    cats: 'Topics',
    all: 'All',
    allHint: 'Nothing picked = all',
    sources: 'Sources',
    srcAll: 'All sources',
    srcInclude: 'Only these sources',
    srcExclude: 'All sources except',
    srcSearch: 'Find a source',
    srcPicked: (n: number) => `${n} selected`,
    srcClear: 'Clear selection',
    keywords: 'Words the news must contain',
    keywordsHint: 'One word is enough. No words = no condition.',
    banned: 'Words that block publication',
    bannedHint: 'Any news containing one of these words is never published.',
    addWord: 'Type a word, then Enter',
    quality: 'Quality and freshness',
    importance: 'Minimum importance',
    imp: ['All news', 'Medium and above', 'High only'],
    tones: 'Tone',
    tone: { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' } as Record<string, string>,
    age: 'News age',
    ages: { 1: 'Last 24 hours', 3: 'Last 3 days', 7: 'Last week', 14: 'Last 2 weeks', 30: 'Last 30 days', 90: 'Last 3 months', 365: 'Last year', 0: 'No limit' } as Record<number, string>,
    reqSummary: 'Summary required',
    reqImage: 'Image required',
    cap: 'Maximum per source per day',
    capNone: 'No limit',
    approved: '',
    site: 'Portal header',
    siteTitle: 'Portal title',
    siteIntro: 'Short introduction',
    siteHint: 'Shown at the top of the portal. Leave empty for the default text.',
    save: 'Save suggestion rules',
    saving: 'Saving…',
    saved: 'Saved. The portal updates within a minute.',
    discard: 'Discard changes',
    reset: 'Default rules',
    resetAsk: 'Reset all rules to the defaults? Pins and exclusions stay.',
    dirty: 'Unsaved changes — the preview shows the result after saving',
    preview: 'Preview',
    tabs: { suggested: 'Suggested', shown: 'Published', hidden: 'Not suggested', pinned: 'Pinned', excluded: 'Excluded' } as Record<Tab, string>,
    search: 'Search titles',
    allTypes: 'All types',
    pinFor: 'Pin for',
    pinFors: { 0: 'Always', 1: '24 hours', 3: '3 days', 7: '1 week' } as Record<number, string>,
    pin: 'Pin',
    unpin: 'Unpin',
    exclude: 'Exclude',
    include: 'Restore',
    pinnedTag: 'Pinned',
    until: 'until',
    empty: 'No news in this list.',
    hiddenNote: 'Last 30 days only.',
    loadErr: 'Loading failed. Try again.',
    denied: 'This page requires the « approve news for the public portal » permission.',
    prev: 'Previous',
    next: 'Next',
    page: (p: number, n: number) => `${p} / ${n}`,
    count: (n: number) => `${n} news`,
    why: 'Reason',
    reasons: {
      pinned: 'Pinned',
      approved: 'Approved manually',
      published: 'Published after review',
      rules: 'Suggested (matches the rules)',
      excluded: 'Excluded manually',
      disabled: 'Publishing paused',
      notAuto: 'Automatic publishing off',
      type: 'Type not selected',
      lang: 'Language not selected',
      category: 'Topic not selected',
      source: 'Source not allowed',
      keyword: 'Missing required words',
      excludeKeyword: 'Contains a blocked word',
      importance: 'Below minimum importance',
      tone: 'Tone not selected',
      age: 'Older than the limit',
      summary: 'No summary',
      image: 'No image',
      cap: 'Over the daily source limit',
    } as Record<string, string>,
    hiddenBy: 'Why news is not suggested (30 days)',
    byType: 'By type',
    bySource: 'Top sources',
    history: 'Change log',
    hist: { config: 'Rules changed', reset: 'Defaults restored', pin: 'Pinned', unpin: 'Unpinned', exclude: 'Excluded', include: 'Restored' } as Record<string, string>,
    read: 'Source ↗',
    lang: { ar: 'Arabic', en: 'English', fr: 'French', it: 'Italian', tr: 'Turkish', es: 'Spanish', de: 'German', ru: 'Russian' } as Record<string, string>,
  },
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
const tripoliDay = (days: number) => new Date(Date.now() + days * 86_400_000 + 2 * 3_600_000).toISOString().slice(0, 10)

function Words({ label, hint, words, onChange, placeholder, tone }: { label: string; hint: string; words: string[]; onChange: (w: string[]) => void; placeholder: string; tone?: 'bad' }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const parts = draft
      .split(/[,،\n]/)
      .map((w) => w.trim())
      .filter(Boolean)
    if (parts.length) onChange([...new Set([...words, ...parts])].slice(0, 100))
    setDraft('')
  }
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add()
    } else if (e.key === 'Backspace' && !draft && words.length) onChange(words.slice(0, -1))
  }
  return (
    <div className="pf-field">
      {label && <span className="pf-label">{label}</span>}
      <div className={tone === 'bad' ? 'pf-words pf-words--bad' : 'pf-words'}>
        {words.map((w) => (
          <button key={w} type="button" className="pf-word" onClick={() => onChange(words.filter((x) => x !== w))} aria-label={`✕ ${w}`}>
            <span dir="auto">{w}</span> ✕
          </button>
        ))}
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={key} onBlur={add} placeholder={placeholder} dir="auto" />
      </div>
      <small className="pf-hint">{hint}</small>
    </div>
  )
}

function Chips<T extends string>({ values, picked, onChange, label, allLabel }: { values: { name: T; count?: number }[]; picked: T[]; onChange: (v: T[]) => void; label: (v: T) => string; allLabel?: string }) {
  return (
    <div className="pf-chips">
      {allLabel !== undefined && (
        <button type="button" className={picked.length === 0 ? 'pf-chip is-on' : 'pf-chip'} aria-pressed={picked.length === 0} onClick={() => onChange([])}>
          {allLabel}
        </button>
      )}
      {values.map((v) => (
        <button key={v.name} type="button" className={picked.includes(v.name) ? 'pf-chip is-on' : 'pf-chip'} aria-pressed={picked.includes(v.name)} onClick={() => onChange(toggle(picked, v.name))}>
          {label(v.name)}
          {v.count !== undefined && <small>{v.count}</small>}
        </button>
      ))}
    </div>
  )
}

export function PortalFeed() {
  const i = useI18n()
  const t = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const [st, setSt] = useState<FeedState | null>(null)
  const [err, setErr] = useState('')
  const [cfg, setCfg] = useState<Config | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState<Tab>('suggested')
  const [editing, setEditing] = useState<string>('')
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const [pinDays, setPinDays] = useState(0)
  const [pv, setPv] = useState<Preview | null>(null)
  const [pvBump, setPvBump] = useState(0)
  const [srcQ, setSrcQ] = useState('')
  const seq = useRef(0)

  const load = useCallback(async () => {
    const r = await fetch('/api/portal-feed')
    if (r.status === 403) return setErr(t.denied)
    if (!r.ok) return setErr(t.loadErr)
    const s = (await r.json()) as FeedState
    setSt(s)
    setCfg((c) => c ?? s.config)
    setErr('')
  }, [t.denied, t.loadErr])
  useEffect(() => {
    load()
  }, [load])

  // Aperçu sur les règles en cours de modification, recalculé 350 ms après le dernier changement
  useEffect(() => {
    if (!cfg) return
    const n = ++seq.current
    const id = window.setTimeout(async () => {
      const r = await fetch('/api/portal-feed/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: cfg, status: tab, q, type, page, size: 20 }) })
      if (n !== seq.current) return
      if (r.ok) setPv((await r.json()) as Preview)
    }, 350)
    return () => window.clearTimeout(id)
  }, [cfg, tab, q, type, page, pvBump])

  const dirty = Boolean(st && cfg && !same(st.config, cfg))
  const set = (patch: Partial<Config>) => {
    setMsg('')
    setPage(1)
    setCfg((c) => (c ? { ...c, ...patch } : c))
  }
  async function save() {
    if (!cfg) return
    setBusy(true)
    setMsg('')
    const r = await fetch('/api/portal-feed/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: cfg }) })
    setBusy(false)
    if (!r.ok) return setMsg(t.loadErr)
    const { config } = (await r.json()) as { config: Config }
    setCfg(config)
    setSt((s) => (s ? { ...s, config } : s))
    setMsg(t.saved)
    load()
  }
  async function reset() {
    if (!window.confirm(t.resetAsk)) return
    const r = await fetch('/api/portal-feed/reset', { method: 'POST' })
    if (!r.ok) return setMsg(t.loadErr)
    const { config } = (await r.json()) as { config: Config }
    setCfg(config)
    setSt((s) => (s ? { ...s, config } : s))
    load()
  }
  async function mark(id: string, action: 'pin' | 'unpin' | 'exclude' | 'include') {
    const r = await fetch(`/api/portal-feed/items/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, until: action === 'pin' && pinDays ? tripoliDay(pinDays) : '' }),
    })
    if (!r.ok) {
      const e = (await r.json().catch(() => ({}))) as { error?: string }
      return setMsg(t.errs[e.error ?? ''] ?? t.loadErr)
    }
    setPvBump((n) => n + 1)
    load()
  }
  async function unpublish(id: string) {
    if (!window.confirm(t.unpublishAsk)) return
    const r = await fetch(`/api/portal-feed/unpublish/${encodeURIComponent(id)}`, { method: 'POST' })
    if (!r.ok) return setMsg(t.loadErr)
    setPvBump((n) => n + 1)
    load()
  }
  const published = () => {
    setEditing('')
    setPvBump((n) => n + 1)
    load()
  }

  const opts = st?.options
  const srcList = useMemo(() => {
    if (!opts || !cfg) return []
    const needle = srcQ.trim().toLowerCase()
    const picked = new Set(cfg.sources)
    const all = [...opts.sources]
    // Une source choisie qui n'a plus de fiche reste visible pour pouvoir la retirer
    for (const s of cfg.sources) if (!all.some((x) => x.name === s)) all.push({ name: s, count: 0 })
    return all.filter((s) => !needle || s.name.toLowerCase().includes(needle)).sort((a, b) => Number(picked.has(b.name)) - Number(picked.has(a.name)) || b.count - a.count).slice(0, 80)
  }, [opts, cfg, srcQ])

  if (err) return <p className="mms-note">{err}</p>
  if (!st || !cfg || !opts) return <p className="news-status">…</p>

  const typeCount = new Map(opts.types.map((x) => [x.name, x.count]))
  const s = pv?.stats
  const maxType = Math.max(1, ...Object.values(s?.byType ?? {}))
  const histLabel = (w: string) => {
    const [k, ...rest] = w.split(' ')
    return `${t.hist[k] ?? k}${rest.length ? ` · ${rest.join(' ')}` : ''}`
  }

  return (
    <div className="pf" dir={i.dir}>
      <div className="pf-top">
        <PageHead title={t.title} intro={t.intro} />
        <a className="news-btn news-btn--ghost pf-open" href="/portal" target="_blank" rel="noopener">
          {t.open}
        </a>
      </div>

      <section className="pf-status">
        <button type="button" className={cfg.enabled ? 'pf-switch is-on' : 'pf-switch'} role="switch" aria-checked={cfg.enabled} onClick={() => set({ enabled: !cfg.enabled })}>
          <span className="pf-switch__knob" aria-hidden />
          {cfg.enabled ? t.on : t.off}
        </button>
        <p className="pf-manual" title={t.manualHint}>
          ✋ <b>{t.manualOnly}</b>
          <small>{t.manualHint}</small>
        </p>
        <div className="pf-kpis">
          <span>
            <b>{s?.shown ?? '—'}</b> {t.kShown}
          </span>
          <span>
            <b>{s?.suggested ?? '—'}</b> {t.kSuggested}
          </span>
          <span>
            <b>{s?.pinned ?? '—'}</b> {t.kPinned}
          </span>
          <span>
            <b>{s?.excluded ?? '—'}</b> {t.kExcluded}
          </span>
        </div>
        {st.updatedAt && <small className="pf-hint pf-last">{t.last(st.updatedBy, i.dateTime(st.updatedAt))}</small>}
        {!cfg.enabled && <p className="mms-note pf-offnote">{t.offNote}</p>}
      </section>

      <div className="pf-grid">
        <div className="pf-rules">
          <fieldset className="pf-card">
            <legend>{t.types}</legend>
            <Chips
              values={TYPES.map((x) => ({ name: x, label: t.type[x], count: typeCount.get(x) ?? 0 }))}
              picked={cfg.types}
              onChange={(v) => set({ types: v })}
              label={(x) => `${ICON[x]} ${t.type[x]}`}
            />
            <small className="pf-hint">{t.typesHint}</small>
          </fieldset>

          <fieldset className="pf-card">
            <legend>{t.langs}</legend>
            <Chips values={opts.langs.map((x) => ({ ...x }))} picked={cfg.langs} onChange={(v) => set({ langs: v })} label={(x) => t.lang[x] ?? x} allLabel={t.all} />
            <legend className="pf-sub">{t.cats}</legend>
            <Chips values={opts.categories.map((x) => ({ ...x }))} picked={cfg.categories} onChange={(v) => set({ categories: v })} label={(x) => i.category(x)} allLabel={t.all} />
            <small className="pf-hint">{t.allHint}</small>
          </fieldset>

          <fieldset className="pf-card">
            <legend>{t.sources}</legend>
            <div className="pf-seg pf-seg--small" role="radiogroup" aria-label={t.sources}>
              {(['all', 'include', 'exclude'] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={cfg.sourceMode === m} className={cfg.sourceMode === m ? 'is-on' : ''} onClick={() => set({ sourceMode: m })}>
                  {m === 'all' ? t.srcAll : m === 'include' ? t.srcInclude : t.srcExclude}
                </button>
              ))}
            </div>
            {cfg.sourceMode !== 'all' && (
              <>
                <div className="pf-srcbar">
                  <input type="search" value={srcQ} onChange={(e) => setSrcQ(e.target.value)} placeholder={t.srcSearch} dir="auto" />
                  <span>{t.srcPicked(cfg.sources.length)}</span>
                  {cfg.sources.length > 0 && (
                    <button type="button" className="pf-link" onClick={() => set({ sources: [] })}>
                      {t.srcClear}
                    </button>
                  )}
                </div>
                <ul className={cfg.sourceMode === 'exclude' ? 'pf-srclist pf-srclist--bad' : 'pf-srclist'}>
                  {srcList.map((x) => (
                    <li key={x.name}>
                      <label>
                        <input type="checkbox" checked={cfg.sources.includes(x.name)} onChange={() => set({ sources: toggle(cfg.sources, x.name) })} />
                        <span dir="auto">{x.name}</span>
                        <small>{x.count}</small>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </fieldset>

          <fieldset className="pf-card">
            <legend>{t.keywords}</legend>
            <Words label="" hint={t.keywordsHint} words={cfg.keywords} onChange={(w) => set({ keywords: w })} placeholder={t.addWord} />
            <legend className="pf-sub">{t.banned}</legend>
            <Words label="" hint={t.bannedHint} words={cfg.excludeKeywords} onChange={(w) => set({ excludeKeywords: w })} placeholder={t.addWord} tone="bad" />
          </fieldset>

          <fieldset className="pf-card">
            <legend>{t.quality}</legend>
            <div className="pf-row">
              <label className="pf-field">
                <span className="pf-label">{t.age}</span>
                <select value={cfg.maxAgeDays} onChange={(e) => set({ maxAgeDays: Number(e.target.value) })}>
                  {[1, 3, 7, 14, 30, 90, 365, 0].map((d) => (
                    <option key={d} value={d}>
                      {t.ages[d]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pf-field">
                <span className="pf-label">{t.importance}</span>
                <select value={cfg.minImportance} onChange={(e) => set({ minImportance: Number(e.target.value) })}>
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {t.imp[n - 1]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pf-field">
                <span className="pf-label">{t.cap}</span>
                <select value={cfg.perSourceDaily} onChange={(e) => set({ perSourceDaily: Number(e.target.value) })}>
                  {[0, 3, 5, 10, 20, 50].map((n) => (
                    <option key={n} value={n}>
                      {n ? n : t.capNone}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <span className="pf-label">{t.tones}</span>
            <Chips values={(['positive', 'neutral', 'negative'] as const).map((x) => ({ name: x, label: t.tone[x] }))} picked={cfg.tones as ('positive' | 'neutral' | 'negative')[]} onChange={(v) => set({ tones: v })} label={(x) => t.tone[x]} allLabel={t.all} />
            <div className="pf-checks">
              <label>
                <input type="checkbox" checked={cfg.requireSummary} onChange={(e) => set({ requireSummary: e.target.checked })} /> {t.reqSummary}
              </label>
              <label>
                <input type="checkbox" checked={cfg.requireImage} onChange={(e) => set({ requireImage: e.target.checked })} /> {t.reqImage}
              </label>
            </div>
          </fieldset>

          <fieldset className="pf-card">
            <legend>{t.site}</legend>

            <label className="pf-field">
              <span className="pf-label">{t.siteTitle}</span>
              <input value={cfg.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} dir="auto" />
            </label>
            <label className="pf-field">
              <span className="pf-label">{t.siteIntro}</span>
              <input value={cfg.intro} maxLength={240} onChange={(e) => set({ intro: e.target.value })} dir="auto" />
            </label>
            <small className="pf-hint">{t.siteHint}</small>
          </fieldset>

          <section className="pf-card pf-log">
            <h3>
              {t.log}
              <a className="pf-link" href="/api/portal-feed/log.csv" download>
                {t.logCsv}
              </a>
            </h3>
            {st.log.length === 0 ? (
              <p className="pf-hint">{t.logEmpty}</p>
            ) : (
              <ul>
                {st.log.slice(0, 30).map((h, k) => (
                  <li key={k}>
                    <span>{i.dateTime(h.at)}</span> · <b dir="auto">{h.by || '—'}</b> · {t.acts[h.action] ?? h.action}
                    {h.title && (
                      <>
                        {' '}
                        · <span dir="auto">{h.title}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {st.history.length > 0 && (
            <details className="pf-card pf-history">
              <summary>{t.history}</summary>
              <ul>
                {st.history.map((h, k) => (
                  <li key={k}>
                    <span>{i.dateTime(h.at)}</span> · <b dir="auto">{h.by || '—'}</b> · {histLabel(h.what)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <section className="pf-preview" aria-label={t.preview}>
          <div className="pf-card pf-pvcard">
            <h3>{t.preview}</h3>
            {s && (
              <div className="pf-dist">
                <div>
                  <span className="pf-label">{t.byType}</span>
                  {TYPES.filter((x) => s.byType[x]).map((x) => (
                    <div key={x} className="pf-bar">
                      <span>
                        {ICON[x]} {t.type[x]}
                      </span>
                      <i style={{ inlineSize: `${(s.byType[x] / maxType) * 100}%` }} />
                      <b>{s.byType[x]}</b>
                    </div>
                  ))}
                </div>
                <div>
                  <span className="pf-label">{t.bySource}</span>
                  <p className="pf-tops">
                    {s.bySource.slice(0, 8).map((x) => (
                      <span key={x.name}>
                        <span dir="auto">{x.name}</span> <b>{x.count}</b>
                      </span>
                    ))}
                  </p>
                  {Object.keys(s.hiddenBy).length > 0 && (
                    <>
                      <span className="pf-label">{t.hiddenBy}</span>
                      <p className="pf-tops pf-tops--muted">
                        {Object.entries(s.hiddenBy)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 6)
                          .map(([k, n]) => (
                            <span key={k}>
                              {t.reasons[k] ?? k} <b>{n}</b>
                            </span>
                          ))}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="pf-tabs" role="tablist">
              {(['suggested', 'shown', 'pinned', 'excluded', 'hidden'] as Tab[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  className={tab === k ? 'is-on' : ''}
                  onClick={() => {
                    setTab(k)
                    setPage(1)
                  }}
                >
                  {t.tabs[k]}
                  {s && <small>{k === 'suggested' ? s.suggested : k === 'shown' ? s.shown : k === 'pinned' ? s.pinned : k === 'excluded' ? s.excluded : ''}</small>}
                </button>
              ))}
            </div>
            <div className="pf-pvbar">
              <input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setPage(1)
                }}
                placeholder={t.search}
                dir="auto"
              />
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value)
                  setPage(1)
                }}
                aria-label={t.types}
              >
                <option value="">{t.allTypes}</option>
                {TYPES.map((x) => (
                  <option key={x} value={x}>
                    {t.type[x]}
                  </option>
                ))}
              </select>
              <label className="pf-pinfor">
                {t.pinFor}
                <select value={pinDays} onChange={(e) => setPinDays(Number(e.target.value))}>
                  {[0, 1, 3, 7].map((d) => (
                    <option key={d} value={d}>
                      {t.pinFors[d]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {tab === 'hidden' && <small className="pf-hint">{t.hiddenNote}</small>}
            {pv && (
              <p className="pf-hint">
                {t.count(pv.total)}
                {dirty && ` · ${t.dirty}`}
              </p>
            )}
            {pv && pv.items.length === 0 && <p className="news-status">{t.empty}</p>}
            <ul className="pf-list">
              {pv?.items.map((x) => {
                const pin = st.pins.find((p) => p.id === x.id)
                return (
                  <li key={x.id} className={`pf-item pf-item--${x.status}`}>
                    {x.image ? <img src={x.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="pf-item__ph" aria-hidden>{ICON[x.type] ?? '📰'}</span>}
                    <div className="pf-item__body">
                      <p className="pf-item__meta">
                        <span className="pf-badge">
                          {ICON[x.type]} {t.type[x.type] ?? x.type}
                        </span>
                        <b dir="auto">{x.source}</b> · {i.dateTime(x.date)} · {i.category(x.category)} {x.lang && `· ${x.lang.toUpperCase()}`}
                      </p>
                      <h4 dir="auto">{x.published?.title ?? x.title}</h4>
                      {(x.published?.summary ?? x.summary) && <p dir="auto">{x.published?.summary ?? x.summary}</p>}
                      {x.published && <small className="pf-hint">{t.pubBy(x.published.updatedBy || x.published.by, i.dateTime(x.published.updatedAt || x.published.at))}</small>}
                      {editing === x.id && <PublishEditor row={x} t={t} onDone={published} onCancel={() => setEditing('')} />}
                      <p className="pf-item__why">
                        <span className={`pf-reason pf-reason--${x.status}`}>{t.reasons[x.reason] ?? x.reason}</span>
                        {x.status === 'pinned' && pin?.until && (
                          <small>
                            {t.until} {i.dateTime(pin.until)}
                          </small>
                        )}
                        {x.url && (
                          <a href={x.url} target="_blank" rel="noopener noreferrer nofollow">
                            {t.read}
                          </a>
                        )}
                      </p>
                    </div>
                    <div className="pf-item__acts">
                      {x.status !== 'excluded' && editing !== x.id && (
                        <button type="button" className="pf-pub" onClick={() => setEditing(x.id)}>
                          ✍ {x.published ? t.editBtn : t.publishBtn}
                        </button>
                      )}
                      {x.published && (
                        <button type="button" onClick={() => unpublish(x.id)}>
                          ⤺ {t.unpublish}
                        </button>
                      )}
                      {x.status === 'pinned' ? (
                        <button type="button" onClick={() => mark(x.id, 'unpin')}>
                          📌 {t.unpin}
                        </button>
                      ) : (
                        x.published && (
                          <button type="button" onClick={() => mark(x.id, 'pin')}>
                            📌 {t.pin}
                          </button>
                        )
                      )}
                      {x.status === 'excluded' ? (
                        <button type="button" onClick={() => mark(x.id, 'include')}>
                          ↩ {t.include}
                        </button>
                      ) : (
                        <button type="button" className="pf-bad" onClick={() => mark(x.id, 'exclude')}>
                          🚫 {t.exclude}
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
            {pv && pv.pages > 1 && (
              <div className="pf-pager">
                <button type="button" disabled={pv.page <= 1} onClick={() => setPage(pv.page - 1)}>
                  {t.prev}
                </button>
                <span>{t.page(pv.page, pv.pages)}</span>
                <button type="button" disabled={pv.page >= pv.pages} onClick={() => setPage(pv.page + 1)}>
                  {t.next}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className={dirty || msg ? 'pf-savebar is-on' : 'pf-savebar'}>
        <span>{msg || (dirty ? t.dirty : '')}</span>
        <button type="button" className="news-btn news-btn--ghost" onClick={reset}>
          {t.reset}
        </button>
        <button type="button" className="news-btn news-btn--ghost" disabled={!dirty || busy} onClick={() => (setCfg(st.config), setMsg(''))}>
          {t.discard}
        </button>
        <button type="button" className="news-btn" disabled={!dirty || busy} onClick={save}>
          {busy ? t.saving : t.save}
        </button>
      </div>
    </div>
  )
}

type T = (typeof TEXT)['ar'] | (typeof TEXT)['en']

/** Éditeur de publication : texte réécrit, lien, validation humaine ; le serveur refuse une copie de la source */
function PublishEditor({ row, t, onDone, onCancel }: { row: Row; t: T; onDone: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState(row.published?.title ?? '')
  const [summary, setSummary] = useState(row.published?.summary ?? '')
  const [url, setUrl] = useState(row.published?.url ?? row.url)
  const [confirm, setConfirm] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function send() {
    setBusy(true)
    setErr('')
    const r = await fetch(`/api/portal-feed/publish/${encodeURIComponent(row.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, summary, url, confirm }),
    })
    setBusy(false)
    if (r.ok) return onDone()
    const e = (await r.json().catch(() => ({}))) as { error?: string }
    setErr(t.errs[e.error ?? ''] ?? t.loadErr)
  }
  return (
    <div className="pf-editor">
      <details>
        <summary>{t.edOriginal}</summary>
        <p dir="auto">
          <b>{row.title}</b>
        </p>
        {row.summary && <p dir="auto">{row.summary}</p>}
      </details>
      <label className="pf-field">
        <span className="pf-label">{t.edTitle}</span>
        <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} dir="auto" />
      </label>
      <label className="pf-field">
        <span className="pf-label">
          {t.edSummary} <small>{summary.trim().length}/600</small>
        </span>
        <textarea value={summary} maxLength={600} rows={4} onChange={(e) => setSummary(e.target.value)} dir="auto" />
      </label>
      <label className="pf-field">
        <span className="pf-label">{t.edUrl}</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" inputMode="url" />
      </label>
      <small className="pf-hint">{t.edNote}</small>
      <label className="pf-checks">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> {t.edConfirm}
      </label>
      {err && (
        <p className="mms-note" role="alert">
          {err}
        </p>
      )}
      <div className="pf-editor__acts">
        <button type="button" className="news-btn" disabled={busy || !confirm} onClick={send}>
          {row.published ? t.edUpdate : t.edSave}
        </button>
        <button type="button" className="news-btn news-btn--ghost" onClick={onCancel}>
          {t.edCancel}
        </button>
      </div>
    </div>
  )
}

export default PortalFeed
