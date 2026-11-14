/**
 * Page « Visite guidée » (/product-tour) : parcours pas à pas dans les sections de Mearsaad.
 * Chaque étape met en lumière une zone de l'écran (sélecteur CSS dans le schéma animé) et l'explique.
 */
import type { LandingLang, TourKey } from './copy'

export type TourStep = { k: TourKey; target: string; title: string; text: string }
export type TourCopy = {
  eyebrow: string
  title: string
  lead: string
  /** noms des sections dans la visite (liste de gauche et barre de l'application) */
  names: Record<TourKey, string>
  pricing: string
  start: string
  startText: string
  minutes: string
  prev: string
  next: string
  finish: string
  restart: string
  step: (n: number, total: number) => string
  stepsCount: (n: number) => string
  chapters: string
  done: string
  endTitle: string
  endText: string
  endCta: string
  steps: TourStep[]
  value: { title: string; text: string; items: [string, string, string][] }
  faq: { title: string; items: { q: string; a: string }[] }
  band: { title: string; text: string; cta: string; second: string }
}

const en: TourCopy = {
  eyebrow: 'Guided tour',
  title: 'Mearsaad guided tour',
  lead: 'Walk through the platform section by section: monitoring, TV and radio, dashboards, the Around assistant, alerts and reports.',
  names: { monitor: 'Media monitoring', broadcast: 'TV & radio', intel: 'Dashboards', ai: 'Around assistant', alerts: 'Radar & alerts', reports: 'Reports' },
  pricing: 'See pricing',
  start: 'Start the tour',
  startText: 'Twelve short steps through the sections your team uses every day.',
  minutes: 'About 2 minutes',
  prev: 'Back',
  next: 'Next',
  finish: 'Finish',
  restart: 'Restart the tour',
  step: (n, t) => `Step ${n} of ${t}`,
  stepsCount: (n) => `${n} steps`,
  chapters: 'Sections',
  done: 'completed',
  endTitle: 'You have seen the essentials',
  endText: 'Now see Mearsaad on your own topics: we prepare a live demonstration with your subjects and markets.',
  endCta: 'Request a demo',
  steps: [
    { k: 'monitor', target: '.tv-search', title: 'Search everything in one place', text: 'Type a Boolean query (AND, OR, NOT, exact phrases) and search press, social networks, YouTube, TV and radio at once.' },
    { k: 'monitor', target: '.tv-feed .lp-row', title: 'One deduplicated feed', text: 'Each result shows its source and tone. Duplicates are grouped into a single story so your team reads less and sees more.' },
    { k: 'broadcast', target: '.tv-wall', title: 'The live wall', text: 'Follow several TV and radio channels on one screen and turn on the sound of the one that matters.' },
    { k: 'broadcast', target: '.tv-transcript', title: 'Search inside speech', text: 'Programmes are transcribed automatically. Find the exact minute a name was said and share the clip.' },
    { k: 'intel', target: '.tv-bars', title: 'Volume over time', text: 'See how coverage evolves hour by hour and compare this week with the last.' },
    { k: 'intel', target: '.tv-intel-side', title: 'Tone, share of voice and people', text: 'Dashboards show sentiment, your share of voice against competitors and the personalities driving the story.' },
    { k: 'ai', target: '.tv-bubble--q', title: 'Ask Around a question', text: 'Write in Arabic, French or English, as you would to an analyst: what changed, why, and what to watch.' },
    { k: 'ai', target: '.tv-cites', title: 'Answers with their sources', text: 'Every answer links to the articles and transcripts it relies on, so you can check before you share.' },
    { k: 'alerts', target: '.lp-radar', title: 'The smart radar', text: 'Mearsaad compares each hour with its usual rhythm and brings up emerging topics before they make the headlines.' },
    { k: 'alerts', target: '.tv-alerts', title: 'Alerts that reach you', text: 'Set thresholds on any watch and get notified by email or Telegram when coverage spikes.' },
    { k: 'reports', target: '.tv-pages', title: 'Reports in your colours', text: 'Pick the articles that matter, add your analysis and produce a report with your logo, assisted by AI summaries.' },
    { k: 'reports', target: '.tv-exports', title: 'Export and schedule', text: 'Export to PDF, Word, PowerPoint or CSV, or schedule the report for your recipients every day, week or month.' },
  ],
  value: {
    title: 'Explore at your own pace, then talk to us',
    text: 'The tour shows the main sections. A live demonstration shows them on your own topics.',
    items: [
      ['search', 'Explore', 'Go through each section of the platform in a few minutes.'],
      ['users', 'Talk to an expert', 'Tell us what your team needs to follow.'],
      ['spark', 'See it on your topics', 'We prepare a live session with your subjects and markets.'],
    ],
  },
  faq: {
    title: 'Frequently asked questions',
    items: [
      { q: 'Is this the real interface?', a: 'The tour uses simplified screens that follow the real sections of Mearsaad. During a demonstration you see the platform itself, with your own topics.' },
      { q: 'Can I see a section in more detail?', a: 'Yes. The Product menu presents the main features in detail, and our team can focus the demonstration on the sections that matter to you.' },
      { q: 'In which languages does Mearsaad work?', a: 'Arabic, French and English, for both the analysis and the interface, right-to-left included.' },
    ],
  },
  band: { title: 'Ready to see Mearsaad on your topics?', text: 'We answer quickly and prepare a demonstration adapted to your team.', cta: 'Request a demo', second: 'See pricing' },
}

const fr: TourCopy = {
  eyebrow: 'Visite guidée',
  title: 'Visite guidée de Mearsaad',
  lead: 'Parcourez la plateforme section par section : veille, TV et radio, tableaux de bord, assistant Around, alertes et rapports.',
  names: { monitor: 'Veille médias', broadcast: 'TV & radio', intel: 'Tableaux de bord', ai: 'Assistant Around', alerts: 'Radar & alertes', reports: 'Rapports' },
  pricing: 'Voir les tarifs',
  start: 'Commencer la visite',
  startText: 'Douze étapes courtes dans les sections que votre équipe utilise chaque jour.',
  minutes: 'Environ 2 minutes',
  prev: 'Précédent',
  next: 'Suivant',
  finish: 'Terminer',
  restart: 'Recommencer la visite',
  step: (n, t) => `Étape ${n} sur ${t}`,
  stepsCount: (n) => `${n} étapes`,
  chapters: 'Sections',
  done: 'terminé',
  endTitle: 'Vous avez vu l’essentiel',
  endText: 'Découvrez maintenant Mearsaad sur vos propres sujets : nous préparons une démonstration en direct avec vos thèmes et vos marchés.',
  endCta: 'Demander une démo',
  steps: [
    { k: 'monitor', target: '.tv-search', title: 'Tout chercher au même endroit', text: 'Tapez une requête booléenne (AND, OR, NOT, expressions exactes) et interrogez en une fois presse, réseaux sociaux, YouTube, TV et radio.' },
    { k: 'monitor', target: '.tv-feed .lp-row', title: 'Un flux unique, sans doublons', text: 'Chaque résultat affiche sa source et sa tonalité. Les doublons sont regroupés en une seule histoire : votre équipe lit moins et voit plus.' },
    { k: 'broadcast', target: '.tv-wall', title: 'Le mur du direct', text: 'Suivez plusieurs chaînes TV et radio sur un seul écran et activez le son de celle qui compte.' },
    { k: 'broadcast', target: '.tv-transcript', title: 'Chercher dans la parole', text: 'Les émissions sont transcrites automatiquement. Retrouvez la minute exacte où un nom a été prononcé et partagez l’extrait.' },
    { k: 'intel', target: '.tv-bars', title: 'Le volume dans le temps', text: 'Voyez la couverture évoluer heure par heure et comparez cette semaine à la précédente.' },
    { k: 'intel', target: '.tv-intel-side', title: 'Tonalité, part de voix et personnalités', text: 'Les tableaux de bord montrent la tonalité, votre part de voix face aux concurrents et les personnalités qui portent le sujet.' },
    { k: 'ai', target: '.tv-bubble--q', title: 'Posez une question à Around', text: 'Écrivez en arabe, en français ou en anglais, comme à un analyste : ce qui a changé, pourquoi, et ce qu’il faut surveiller.' },
    { k: 'ai', target: '.tv-cites', title: 'Des réponses avec leurs sources', text: 'Chaque réponse renvoie aux articles et transcriptions sur lesquels elle s’appuie : vous vérifiez avant de partager.' },
    { k: 'alerts', target: '.lp-radar', title: 'Le radar intelligent', text: 'Mearsaad compare chaque heure à son rythme habituel et fait remonter les sujets émergents avant qu’ils fassent la une.' },
    { k: 'alerts', target: '.tv-alerts', title: 'Des alertes qui vous trouvent', text: 'Fixez des seuils sur n’importe quelle veille et soyez prévenu par e-mail ou Telegram dès que la couverture s’emballe.' },
    { k: 'reports', target: '.tv-pages', title: 'Des rapports à vos couleurs', text: 'Choisissez les articles qui comptent, ajoutez votre analyse et produisez un rapport à votre logo, aidé par les synthèses IA.' },
    { k: 'reports', target: '.tv-exports', title: 'Exporter et programmer', text: 'Exportez en PDF, Word, PowerPoint ou CSV, ou programmez l’envoi à vos destinataires chaque jour, semaine ou mois.' },
  ],
  value: {
    title: 'Explorez à votre rythme, puis parlons-en',
    text: 'La visite montre les sections principales. Une démonstration en direct les montre sur vos propres sujets.',
    items: [
      ['search', 'Explorer', 'Parcourez chaque section de la plateforme en quelques minutes.'],
      ['users', 'Parler à un expert', 'Dites-nous ce que votre équipe doit suivre.'],
      ['spark', 'Voir sur vos sujets', 'Nous préparons une session en direct avec vos thèmes et vos marchés.'],
    ],
  },
  faq: {
    title: 'Questions fréquentes',
    items: [
      { q: 'Est-ce la vraie interface ?', a: 'La visite utilise des écrans simplifiés qui suivent les vraies sections de Mearsaad. Pendant une démonstration, vous voyez la plateforme elle-même, sur vos sujets.' },
      { q: 'Puis-je voir une section plus en détail ?', a: 'Oui. Le menu Produit présente les principales fonctionnalités en détail, et notre équipe peut centrer la démonstration sur les sections qui comptent pour vous.' },
      { q: 'Dans quelles langues fonctionne Mearsaad ?', a: 'Arabe, français et anglais, pour l’analyse comme pour l’interface, de droite à gauche comprise.' },
    ],
  },
  band: { title: 'Prêt à découvrir Mearsaad sur vos sujets ?', text: 'Nous répondons vite et préparons une démonstration adaptée à votre équipe.', cta: 'Demander une démo', second: 'Voir les tarifs' },
}

const ar: TourCopy = {
  eyebrow: 'جولة إرشادية',
  title: 'جولة إرشادية في مرصاد',
  lead: 'تصفّح المنصة قسمًا بعد قسم: الرصد، التلفزيون والإذاعة، لوحات القيادة، المساعد Around، التنبيهات والتقارير.',
  names: { monitor: 'الرصد الإعلامي', broadcast: 'التلفزيون والإذاعة', intel: 'لوحات القيادة', ai: 'المساعد Around', alerts: 'الرادار والتنبيهات', reports: 'التقارير' },
  pricing: 'اطّلع على الأسعار',
  start: 'ابدأ الجولة',
  startText: 'اثنتا عشرة خطوة قصيرة في الأقسام التي يستخدمها فريقك يوميًا.',
  minutes: 'حوالي دقيقتين',
  prev: 'السابق',
  next: 'التالي',
  finish: 'إنهاء',
  restart: 'إعادة الجولة',
  step: (n, t) => `الخطوة ${n} من ${t}`,
  stepsCount: (n) => (n === 2 ? 'خطوتان' : `${n} خطوات`),
  chapters: 'الأقسام',
  done: 'مكتمل',
  endTitle: 'لقد اطّلعت على الأساسيات',
  endText: 'شاهد الآن مرصاد على مواضيعك: نعدّ لك عرضًا مباشرًا بمواضيعك وأسواقك.',
  endCta: 'اطلب عرضًا توضيحيًا',
  steps: [
    { k: 'monitor', target: '.tv-search', title: 'ابحث في كل شيء من مكان واحد', text: 'اكتب استعلامًا منطقيًا (AND وOR وNOT وعبارات مطابقة) وابحث دفعة واحدة في الصحافة وشبكات التواصل ويوتيوب والتلفزيون والإذاعة.' },
    { k: 'monitor', target: '.tv-feed .lp-row', title: 'تدفق واحد بلا تكرار', text: 'تظهر مع كل نتيجة مصدرها ونبرتها. وتُجمع الأخبار المكررة في قصة واحدة: يقرأ فريقك أقل ويرى أكثر.' },
    { k: 'broadcast', target: '.tv-wall', title: 'جدار البث المباشر', text: 'تابع عدة قنوات تلفزيونية وإذاعية على شاشة واحدة وشغّل صوت القناة المهمة.' },
    { k: 'broadcast', target: '.tv-transcript', title: 'ابحث داخل الكلام', text: 'تُفرَّغ البرامج نصيًا تلقائيًا. اعثر على الدقيقة التي ذُكر فيها اسم ما وشارك المقطع.' },
    { k: 'intel', target: '.tv-bars', title: 'الحجم عبر الزمن', text: 'شاهد تطور التغطية ساعة بساعة وقارن هذا الأسبوع بالأسبوع الماضي.' },
    { k: 'intel', target: '.tv-intel-side', title: 'النبرة وحصة الحضور والشخصيات', text: 'تعرض اللوحات النبرة وحصة حضورك مقارنة بالمنافسين والشخصيات التي تقود الموضوع.' },
    { k: 'ai', target: '.tv-bubble--q', title: 'اطرح سؤالًا على Around', text: 'اكتب بالعربية أو الفرنسية أو الإنجليزية كما تكتب لمحلل: ما الذي تغيّر، ولماذا، وما الذي يجب متابعته.' },
    { k: 'ai', target: '.tv-cites', title: 'إجابات مع مصادرها', text: 'كل إجابة تحيل إلى المقالات والتفريغات التي تستند إليها، فتتحقق قبل المشاركة.' },
    { k: 'alerts', target: '.lp-radar', title: 'الرادار الذكي', text: 'يقارن مرصاد كل ساعة بإيقاعها المعتاد ويُبرز المواضيع الناشئة قبل أن تتصدر العناوين.' },
    { k: 'alerts', target: '.tv-alerts', title: 'تنبيهات تصلك', text: 'حدّد عتبات لأي متابعة وتلقَّ إشعارًا بالبريد أو تيليغرام عند ارتفاع التغطية.' },
    { k: 'reports', target: '.tv-pages', title: 'تقارير بهويتك', text: 'اختر المقالات المهمة وأضف تحليلك وأنتج تقريرًا بشعارك بمساعدة الملخصات الذكية.' },
    { k: 'reports', target: '.tv-exports', title: 'التصدير والجدولة', text: 'صدّر بصيغة PDF أو Word أو PowerPoint أو CSV، أو برمج إرسال التقرير إلى المعنيين يوميًا أو أسبوعيًا أو شهريًا.' },
  ],
  value: {
    title: 'استكشف على راحتك، ثم تحدّث إلينا',
    text: 'تعرض الجولة الأقسام الرئيسية، ويعرضها العرض المباشر على مواضيعك.',
    items: [
      ['search', 'استكشف', 'تصفّح كل قسم من المنصة في دقائق.'],
      ['users', 'تحدّث إلى خبير', 'أخبرنا بما يحتاج فريقك إلى متابعته.'],
      ['spark', 'شاهده على مواضيعك', 'نعدّ لك جلسة مباشرة بمواضيعك وأسواقك.'],
    ],
  },
  faq: {
    title: 'الأسئلة الشائعة',
    items: [
      { q: 'هل هذه الواجهة الحقيقية؟', a: 'تستخدم الجولة شاشات مبسطة تتبع الأقسام الحقيقية لمرصاد. وفي العرض التوضيحي ترى المنصة نفسها على مواضيعك.' },
      { q: 'هل يمكنني رؤية قسم بتفصيل أكبر؟', a: 'نعم. تعرض قائمة المنتج أهم الوظائف بالتفصيل، ويمكن لفريقنا تركيز العرض على الأقسام التي تهمك.' },
      { q: 'بأي لغات يعمل مرصاد؟', a: 'العربية والفرنسية والإنجليزية، في التحليل والواجهة، من اليمين إلى اليسار.' },
    ],
  },
  band: { title: 'مستعد لرؤية مرصاد على مواضيعك؟', text: 'نجيبك بسرعة ونعدّ عرضًا مناسبًا لفريقك.', cta: 'اطلب عرضًا توضيحيًا', second: 'اطّلع على الأسعار' },
}

export const TOUR_PAGE: Record<LandingLang, TourCopy> = { en, fr, ar }
