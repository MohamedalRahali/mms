/** Veille programmée (الرصد المبرمج) : zone surveillée, thèmes à cocher et conversion en règles ET/OU */

export type WatchStatus = 'upcoming' | 'active' | 'finished'
export type WatchOption = { id: string; name: string; status: WatchStatus }
export type WatchMatch = { id: string; title: string; flux: string; origin: string; date: string; url: string; hits: string[] }
export type WatchAlert = { channels: ('email' | 'telegram')[]; threshold: number; severity: 'info' | 'high' | 'critical'; assignee: string; dueHours: number }
export type Watch = {
  id: string
  name: string
  rules: string[]
  themes: string[]
  scope: string[]
  flux: '' | 'mosaique' | 'libye'
  from: string
  to: string | null
  recipients: string[]
  enabled: boolean
  status: WatchStatus
  lastRun: string | null
  lastError: string | null
  matchCount: number
  matches: WatchMatch[]
  notifiedCount: number
  // Veille créée depuis « حفظ البحث » : requête booléenne et filtres de la recherche
  query?: string
  filters?: Record<string, string>
  createdBy?: string
  blockedRecipients?: string[]
  // Réglages d'alerte (canaux, seuil, gravité, suivi) ; absents sur les veilles créées avant
  alert?: WatchAlert
  pending?: number
  // Fusion de veilles presque identiques : la veille d'origine (désactivée) pointe vers la nouvelle
  mergedInto?: string
  mergedFrom?: { id: string; name: string }[]
}

/** Zones prêtes à l'emploi : MMS suit la Tunisie (Mosaïque FM) et la Libye */
export const ZONES: Record<'libye' | 'tunisie', string[]> = {
  libye: ['ليبيا', 'ليبي', 'Libya', 'Libye', 'طرابلس', 'بنغازي', 'مصراتة', 'سبها'],
  tunisie: ['تونس', 'تونسي', 'Tunisie', 'Tunisia', 'صفاقس', 'سوسة', 'القيروان', 'بنزرت'],
}

export type Theme = { key: string; ar: string; en: string; words: string[] }

export const THEMES: Theme[] = [
  {
    key: 'politique',
    ar: 'السياسة',
    en: 'Politics',
    words: [
      'الحكومة',
      'مجلس النواب',
      'المجلس الرئاسي',
      'الانتخابات',
      'البرلمان',
      'رئيس الحكومة',
      'وزير',
      'الدستور',
      'حزب',
      'المجلس الأعلى للدولة',
      'رئاسة الجمهورية',
    ],
  },
  {
    key: 'securite',
    ar: 'الأمن',
    en: 'Security',
    words: ['اشتباكات', 'هجوم', 'إرهاب', 'ميليشيات', 'اغتيال', 'مسلحين', 'تفجير', 'اختطاف', 'الجيش', 'قوات', 'حدود', 'تهريب'],
  },
  {
    key: 'economie',
    ar: 'الاقتصاد',
    en: 'Economy',
    words: [
      'مصرف ليبيا المركزي',
      'البنك المركزي',
      'الدينار',
      'النفط',
      'المؤسسة الوطنية للنفط',
      'الميزانية',
      'الأسعار',
      'التضخم',
      'الاستثمار',
      'الصادرات',
      'الغاز',
      'البطالة',
      'قانون المالية',
    ],
  },
  {
    key: 'opinion',
    ar: 'الرأي العام والاحتجاجات',
    en: 'Public opinion and protests',
    words: ['احتجاج', 'مظاهرة', 'اعتصام', 'غضب شعبي', 'إضراب', 'وقفة احتجاجية', 'عريضة', 'مسيرة', 'استياء'],
  },
  {
    key: 'desinformation',
    ar: 'التضليل الإعلامي',
    en: 'Disinformation',
    words: [
      'إشاعة',
      'شائعة',
      'أخبار كاذبة',
      'أخبار زائفة',
      'حملة تضليل',
      'حسابات وهمية',
      'تضليل',
      'مفبرك',
      'فبركة',
      'معلومات مغلوطة',
      'نفي',
      'تكذيب',
      'صفحات مشبوهة',
      'خبر غير صحيح',
    ],
  },
  {
    key: 'cyber',
    ar: 'الأمن السيبراني',
    en: 'Cybersecurity',
    words: ['سيبراني', 'اختراق', 'قرصنة', 'قراصنة', 'تسريب', 'هجوم إلكتروني', 'ابتزاز إلكتروني', 'برمجيات خبيثة', 'فيروس', 'تصيد'],
  },
  { key: 'autres', ar: 'كلمات أخرى', en: 'Other words', words: [] },
]

const group = (words: string[]) =>
  `(${words
    .map((w) => w.trim())
    .filter(Boolean)
    .join(' OR ')})`

/** Chaque thème coché devient « (zone) AND (mots du thème) » ; sans zone, le thème est surveillé partout */
export function themesToRules(scope: string[], picked: { key: string; words: string[] }[]): string[] {
  return picked.filter((t) => t.words.some((w) => w.trim())).map((t) => (scope.length ? `${group(scope)} AND ${group(t.words)}` : group(t.words)))
}

export const WATCH_TEXT = {
  ar: {
    menu: 'الرصد',
    none: 'الكل',
    title: 'الرصد المبرمج',
    intro:
      'برمج رصداً على الأخبار التي تصل إلى MMS (الرصد الليبي). بعد كل تحديث للبيانات تُفحص الأخبار الجديدة، وتُرسل المطابقة منها بالبريد الإلكتروني مرة واحدة.',
    newWatch: 'رصد جديد',
    name: 'اسم الرصد (اختياري)',
    zone: 'المنطقة المرصودة',
    zoneHint: 'إذا تُركت فارغة يُرصد الموضوع في كل مكان.',
    zoneLibye: 'ليبيا',
    zoneTunisie: 'تونس',
    zoneClear: 'إفراغ',
    themes: 'المواضيع',
    addWord: 'أضف كلمة ثم Enter',
    source: 'المصدر',
    from: 'من',
    to: 'إلى',
    tomorrow: 'غداً',
    permanent: 'رصد دائم',
    recipients: 'المرسَل إليهم (عناوين بريد مفصولة بفواصل)',
    submit: 'برمجة الرصد',
    rulesPreview: 'القواعد التي ستُطبَّق',
    created: 'تمت برمجة الرصد.',
    list: 'عمليات الرصد',
    empty: 'لا يوجد رصد مبرمج بعد.',
    status: { upcoming: 'مبرمج', active: 'قيد الرصد', finished: 'منتهٍ' },
    enabled: 'مفعّل',
    disabled: 'معطّل',
    enable: 'تفعيل',
    disable: 'تعطيل',
    remove: 'حذف',
    confirmRemove: 'حذف هذا الرصد نهائياً؟',
    showNews: 'عرض الأخبار',
    period: (from: string, to: string | null) => (to ? `من ${from} إلى ${to}` : `من ${from} · رصد دائم`),
    owner: 'أنشأه',
    duplicate: (name: string, by: string) => `يوجد رصد نشط مطابق: «${name}»${by ? ` (أنشأه ${by})` : ''}. هل تريد إنشاء نسخة ثانية رغم ذلك؟`,
    results: (n: number) => `${n} نتيجة مرسلة`,
    lastSent: 'آخر ما أُرسل',
    noRecipients: 'بدون بريد: النتائج تظهر في قسم الأخبار فقط',
    smtpMissing: 'إرسال البريد غير مُعدّ: أضف SMTP_USER و SMTP_PASS إلى ملف ‎.env. النتائج تبقى ظاهرة في قسم الأخبار.',
    smtpError: 'تعذّر إرسال البريد، ستُعاد المحاولة في التحديث القادم.',
    errors: {
      NO_RULES: 'اختر موضوعاً واحداً على الأقل وفيه كلمات.',
      RULES_TOO_LONG: 'عدد القواعد أو طولها يتجاوز الحد.',
      BAD_DATES: 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية.',
      END_PASSED: 'تاريخ النهاية قد مضى.',
      TOO_MANY_RECIPIENTS: 'عشرة عناوين بريد على الأكثر.',
      BAD_EMAIL: 'أحد عناوين البريد غير صحيح.',
      TOO_MANY: 'تم بلوغ الحد الأقصى لعدد عمليات الرصد (100).',
      BAD_QUERY: 'صيغة البحث غير صحيحة.',
      DUPLICATE: 'يوجد رصد نشط مطابق.',
      DOMAIN_BLOCKED: 'عناوين البريد خارج النطاقات المسموح بها (مثل npdc.gov.ly) غير مقبولة.',
      FAILED: 'تعذّرت العملية. أعد المحاولة.',
    } as Record<string, string>,
  },
  en: {
    menu: 'Watch',
    none: 'all',
    title: 'Scheduled watch',
    intro: 'Schedule a watch on the news MMS receives (the Libya watch). After each data update, new items are checked and matching ones are emailed once.',
    newWatch: 'New watch',
    name: 'Watch name (optional)',
    zone: 'Monitored area',
    zoneHint: 'Left empty, the topic is watched everywhere.',
    zoneLibye: 'Libya',
    zoneTunisie: 'Tunisia',
    zoneClear: 'Clear',
    themes: 'Topics',
    addWord: 'Add a word, then Enter',
    source: 'Source',
    from: 'From',
    to: 'To',
    tomorrow: 'Tomorrow',
    permanent: 'Permanent watch',
    recipients: 'Recipients (email addresses separated by commas)',
    submit: 'Schedule the watch',
    rulesPreview: 'Rules applied',
    created: 'Watch scheduled.',
    list: 'Watches',
    empty: 'No scheduled watch yet.',
    status: { upcoming: 'Scheduled', active: 'Active', finished: 'Finished' },
    enabled: 'Enabled',
    disabled: 'Disabled',
    enable: 'Enable',
    disable: 'Disable',
    remove: 'Delete',
    confirmRemove: 'Delete this watch permanently?',
    showNews: 'Show news',
    period: (from: string, to: string | null) => (to ? `from ${from} to ${to}` : `since ${from} · permanent`),
    owner: 'Created by',
    duplicate: (name: string, by: string) => `An identical active watch already exists: “${name}”${by ? ` (created by ${by})` : ''}. Create a second one anyway?`,
    results: (n: number) => `${n} results sent`,
    lastSent: 'Last sent',
    noRecipients: 'No email: results only appear in the news',
    smtpMissing: 'Email sending is not set up: add SMTP_USER and SMTP_PASS to .env. Results stay visible in the news.',
    smtpError: 'Email sending failed, it will be retried at the next update.',
    errors: {
      NO_RULES: 'Tick at least one topic that contains words.',
      RULES_TOO_LONG: 'Too many rules, or rules too long.',
      BAD_DATES: 'The end date must come after the start date.',
      END_PASSED: 'The end date has already passed.',
      TOO_MANY_RECIPIENTS: 'Ten email addresses at most.',
      BAD_EMAIL: 'One of the email addresses is not valid.',
      TOO_MANY: 'Maximum number of watches reached (100).',
      BAD_QUERY: 'The search syntax is not valid.',
      DUPLICATE: 'An identical active watch already exists.',
      DOMAIN_BLOCKED: 'Email addresses outside the allowed domains (such as npdc.gov.ly) are not accepted.',
      FAILED: 'The operation failed. Please try again.',
    } as Record<string, string>,
  },
}
