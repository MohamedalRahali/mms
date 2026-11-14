/**
 * Page « Tarifs » de la vitrine : quatre formules sans prix affiché (tarif sur devis), comparatif et questions fréquentes.
 * Les fonctions citées sont celles de MMS ; la répartition entre formules est une proposition commerciale à valider.
 */
import type { LandingLang } from './copy'
import type { Target } from './megaContent'

export type Cell = boolean | string
export type Plan = { key: string; name: string; tagline: string; caps: string[]; best: string[]; features: string[] }
export type PricingCopy = {
  eyebrow: string
  title: string
  lead: string
  note: string
  contactTeam: string
  quote: string
  capsTitle: string
  bestTitle: string
  featTitle: string
  plans: Plan[]
  compare: { eyebrow: string; title: string; feature: string; groups: { title: string; rows: { label: string; cells: Cell[] }[] }[]; yes: string; no: string }
  included: { title: string; items: [string, string, string][] }
  faq: { eyebrow: string; title: string; items: { q: string; a: string; to?: Target; link?: string }[] }
  band: { title: string; text: string; cta: string; second: string }
}

const en: PricingCopy = {
  eyebrow: 'Pricing',
  title: 'Mearsaad pricing',
  lead: 'From focused monitoring for a small team to media intelligence for a whole institution: choose the plan that fits, and we adjust it to your sources, languages and users.',
  note: 'Prices on quote, based on your sources, number of users and services.',
  contactTeam: 'Contact our team',
  quote: 'Request a quote',
  capsTitle: 'Capabilities',
  bestTitle: 'Best for',
  featTitle: 'Key features',
  plans: [
    {
      key: 'essential',
      name: 'Essential',
      tagline: 'Start focused media monitoring, quickly.',
      caps: ['Online and print press', 'Social listening', 'Alerts'],
      best: ['Small communication teams', 'Associations and start-ups', 'A first monitoring project'],
      features: ['Around AI assistant (standard)', 'Ready-made dashboards', 'Email and Telegram alerts', 'PDF, Word and CSV exports'],
    },
    {
      key: 'pro',
      name: 'Professional',
      tagline: 'Every channel, analysed for teams that decide on data.',
      caps: ['Online and print press', 'Social listening', 'Transcribed TV and radio', 'Smart radar'],
      best: ['Communication and PR departments', 'Regional teams', 'Data-driven teams'],
      features: ['Around AI assistant (advanced)', 'Morning AI briefings', 'Custom dashboards and share of voice', 'Branded, scheduled reports'],
    },
    {
      key: 'enterprise',
      name: 'Enterprise & institutions',
      tagline: 'Media intelligence for large organisations and public bodies.',
      caps: ['Every Professional capability', 'Private watches', 'AI visibility', 'API and integrations'],
      best: ['Groups and multi-team organisations', 'Ministries and administrations', 'Sensitive files'],
      features: ['Roles and rights for each team', 'Audit log and anti-copy protection', 'Two-factor and face verification', 'Analyst services on demand'],
    },
    {
      key: 'agencies',
      name: 'Agencies',
      tagline: 'Follow several clients and deliver reports in their colours.',
      caps: ['Every Professional capability', 'One space per client', 'AI visibility', 'API and integrations'],
      best: ['Communication and PR agencies', 'Consultancies', 'Media services companies'],
      features: ['Dashboards and watches per client', 'Reports with each client’s logo', 'Campaign measurement', 'AI summaries your team refines'],
    },
  ],
  compare: {
    eyebrow: 'Plan comparison',
    title: 'Choose the plan that fits your team',
    feature: 'Feature',
    yes: 'Included',
    no: 'Not included',
    groups: [
      {
        title: 'Monitoring',
        rows: [
          { label: 'Online and print press', cells: [true, true, true, true] },
          { label: 'Social networks and YouTube', cells: [true, true, true, true] },
          { label: 'Transcribed TV and radio', cells: [false, true, true, true] },
          { label: 'Smart radar (emerging topics)', cells: [false, true, true, true] },
          { label: 'Private watches', cells: [false, false, true, true] },
          { label: 'AI visibility', cells: [false, false, true, true] },
        ],
      },
      {
        title: 'Analysis and reporting',
        rows: [
          { label: 'Around AI assistant', cells: ['Standard', 'Advanced', 'Advanced', 'Advanced'] },
          { label: 'Dashboards', cells: ['Ready-made', 'Custom', 'Custom', 'Per client'] },
          { label: 'Morning AI briefings', cells: [false, true, true, true] },
          { label: 'Reports and exports', cells: ['Standard', 'Branded', 'Branded', 'Client branding'] },
          { label: 'Alerts by email and Telegram', cells: [true, true, true, true] },
        ],
      },
      {
        title: 'Organisation and security',
        rows: [
          { label: 'Isolated workspace', cells: [true, true, true, true] },
          { label: 'Roles and rights per team', cells: [false, true, true, true] },
          { label: 'Audit log and anti-copy protection', cells: [false, false, true, true] },
          { label: 'API and integrations', cells: [false, false, true, true] },
          { label: 'Support', cells: ['Guided set-up', 'Set-up and training', 'Priority, analyst services', 'Training for your teams'] },
        ],
      },
    ],
  },
  included: {
    title: 'Included in every plan',
    items: [
      ['language', 'Arabic, French and English', 'Native analysis and a full right-to-left interface.'],
      ['lock', 'Your own space', 'Data, users and settings separated from other clients.'],
      ['headset', 'A team at your side', 'Topics, sources and alerts configured with you.'],
    ],
  },
  faq: {
    eyebrow: 'Questions',
    title: 'Frequently asked questions',
    items: [
      { q: 'How is the price set?', a: 'Each offer is built on quote, based on the sources you follow (press, social networks, TV and radio), the number of users and the services you need. We send you a clear proposal after a first conversation.' },
      { q: 'Can I try Mearsaad before committing?', a: 'Yes. We prepare a live demonstration on your own topics and markets, so you see real results before choosing.', to: 'contact', link: 'Request a demo' },
      { q: 'Can my plan change over time?', a: 'Your needs evolve: talk to our team at any time and we will propose the right adjustment, for example more users, more sources or an extra module.' },
      { q: 'Can you add the media we need?', a: 'Yes. Ask us to add the channels, radios, sites and pages that matter to you, including local sources.', to: 'coverage', link: 'Regional coverage' },
      { q: 'What support is included?', a: 'Every plan includes a guided set-up of your topics, sources and alerts. Depending on the plan we add user training, priority support and custom analyst reports.', to: 'support', link: 'Our support' },
      { q: 'How are my data protected?', a: 'Each organisation has its own isolated space, with named accesses, two-factor authentication, an audit log and anti-copy protection on sensitive content.', to: 'security', link: 'Security' },
    ],
  },
  band: {
    title: 'Let’s build the right offer for you',
    text: 'Tell us what you need to follow. We answer quickly with a demonstration and a proposal adapted to your team.',
    cta: 'Request a quote',
    second: 'Contact us',
  },
}

const fr: PricingCopy = {
  eyebrow: 'Tarifs',
  title: 'Tarifs Mearsaad',
  lead: 'De la veille ciblée d’une petite équipe à l’intelligence médias de toute une institution : choisissez la formule qui vous convient, nous l’ajustons à vos sources, vos langues et vos utilisateurs.',
  note: 'Tarifs sur devis, selon vos sources, le nombre d’utilisateurs et les services souhaités.',
  contactTeam: 'Contacter notre équipe',
  quote: 'Demander un devis',
  capsTitle: 'Capacités',
  bestTitle: 'Idéal pour',
  featTitle: 'Fonctions clés',
  plans: [
    {
      key: 'essential',
      name: 'Essentiel',
      tagline: 'Démarrez rapidement une veille médias ciblée.',
      caps: ['Presse en ligne et écrite', 'Écoute des réseaux sociaux', 'Alertes'],
      best: ['Petites équipes de communication', 'Associations et start-up', 'Un premier projet de veille'],
      features: ['Assistant IA Around (standard)', 'Tableaux de bord prêts à l’emploi', 'Alertes par e-mail et Telegram', 'Exports PDF, Word et CSV'],
    },
    {
      key: 'pro',
      name: 'Professionnel',
      tagline: 'Tous les canaux, analysés, pour les équipes qui décident sur des données.',
      caps: ['Presse en ligne et écrite', 'Écoute des réseaux sociaux', 'TV et radio transcrites', 'Radar intelligent'],
      best: ['Directions communication et RP', 'Équipes régionales', 'Équipes pilotées par la donnée'],
      features: ['Assistant IA Around (avancé)', 'Notes de synthèse IA du matin', 'Tableaux personnalisés et part de voix', 'Rapports à vos couleurs, programmés'],
    },
    {
      key: 'enterprise',
      name: 'Entreprises & institutions',
      tagline: 'L’intelligence médias des grandes organisations et des administrations.',
      caps: ['Toutes les capacités Professionnel', 'Veilles privées', 'Visibilité dans les IA', 'API et intégrations'],
      best: ['Groupes et organisations multi-équipes', 'Ministères et administrations', 'Dossiers sensibles'],
      features: ['Rôles et droits par équipe', 'Journal d’audit et protection anti-copie', 'Double authentification et vérification faciale', 'Services d’analyse à la demande'],
    },
    {
      key: 'agencies',
      name: 'Agences',
      tagline: 'Suivez plusieurs clients et livrez des rapports à leurs couleurs.',
      caps: ['Toutes les capacités Professionnel', 'Un espace par client', 'Visibilité dans les IA', 'API et intégrations'],
      best: ['Agences de communication et RP', 'Cabinets de conseil', 'Sociétés de services médias'],
      features: ['Tableaux et veilles par client', 'Rapports au logo de chaque client', 'Mesure des campagnes', 'Synthèses IA affinées par l’équipe'],
    },
  ],
  compare: {
    eyebrow: 'Comparaison des formules',
    title: 'Choisissez la formule adaptée à votre équipe',
    feature: 'Fonction',
    yes: 'Inclus',
    no: 'Non inclus',
    groups: [
      {
        title: 'Veille',
        rows: [
          { label: 'Presse en ligne et écrite', cells: [true, true, true, true] },
          { label: 'Réseaux sociaux et YouTube', cells: [true, true, true, true] },
          { label: 'TV et radio transcrites', cells: [false, true, true, true] },
          { label: 'Radar intelligent (sujets émergents)', cells: [false, true, true, true] },
          { label: 'Veilles privées', cells: [false, false, true, true] },
          { label: 'Visibilité dans les IA', cells: [false, false, true, true] },
        ],
      },
      {
        title: 'Analyse et rapports',
        rows: [
          { label: 'Assistant IA Around', cells: ['Standard', 'Avancé', 'Avancé', 'Avancé'] },
          { label: 'Tableaux de bord', cells: ['Prêts à l’emploi', 'Personnalisés', 'Personnalisés', 'Par client'] },
          { label: 'Notes de synthèse IA du matin', cells: [false, true, true, true] },
          { label: 'Rapports et exports', cells: ['Standard', 'À vos couleurs', 'À vos couleurs', 'Aux couleurs du client'] },
          { label: 'Alertes par e-mail et Telegram', cells: [true, true, true, true] },
        ],
      },
      {
        title: 'Organisation et sécurité',
        rows: [
          { label: 'Espace isolé', cells: [true, true, true, true] },
          { label: 'Rôles et droits par équipe', cells: [false, true, true, true] },
          { label: 'Journal d’audit et protection anti-copie', cells: [false, false, true, true] },
          { label: 'API et intégrations', cells: [false, false, true, true] },
          { label: 'Accompagnement', cells: ['Mise en place guidée', 'Mise en place et formation', 'Prioritaire, services d’analyse', 'Formation de vos équipes'] },
        ],
      },
    ],
  },
  included: {
    title: 'Inclus dans toutes les formules',
    items: [
      ['language', 'Arabe, français et anglais', 'Analyse native et interface complète de droite à gauche.'],
      ['lock', 'Votre propre espace', 'Données, utilisateurs et réglages séparés des autres clients.'],
      ['headset', 'Une équipe à vos côtés', 'Sujets, sources et alertes configurés avec vous.'],
    ],
  },
  faq: {
    eyebrow: 'Questions',
    title: 'Questions fréquentes',
    items: [
      { q: 'Comment le tarif est-il fixé ?', a: 'Chaque offre est établie sur devis, selon les sources suivies (presse, réseaux sociaux, TV et radio), le nombre d’utilisateurs et les services souhaités. Nous vous envoyons une proposition claire après un premier échange.' },
      { q: 'Puis-je essayer Mearsaad avant de m’engager ?', a: 'Oui. Nous préparons une démonstration en direct sur vos propres sujets et marchés, pour que vous voyiez de vrais résultats avant de choisir.', to: 'contact', link: 'Demander une démo' },
      { q: 'Ma formule peut-elle évoluer ?', a: 'Vos besoins changent : parlez-en à notre équipe à tout moment, elle vous proposera l’ajustement adapté, par exemple plus d’utilisateurs, plus de sources ou un module supplémentaire.' },
      { q: 'Pouvez-vous ajouter les médias dont nous avons besoin ?', a: 'Oui. Demandez-nous d’ajouter les chaînes, radios, sites et pages qui comptent pour vous, sources locales comprises.', to: 'coverage', link: 'Couverture régionale' },
      { q: 'Quel accompagnement est inclus ?', a: 'Chaque formule comprend la mise en place guidée de vos sujets, sources et alertes. Selon la formule, nous ajoutons la formation des utilisateurs, une assistance prioritaire et des rapports d’analyse sur mesure.', to: 'support', link: 'Notre accompagnement' },
      { q: 'Comment mes données sont-elles protégées ?', a: 'Chaque organisation dispose de son propre espace isolé, avec des accès nominatifs, la double authentification, un journal d’audit et une protection anti-copie des contenus sensibles.', to: 'security', link: 'Sécurité' },
    ],
  },
  band: {
    title: 'Construisons l’offre qui vous correspond',
    text: 'Dites-nous ce que vous devez suivre. Nous répondons vite, avec une démonstration et une proposition adaptée à votre équipe.',
    cta: 'Demander un devis',
    second: 'Nous contacter',
  },
}

const ar: PricingCopy = {
  eyebrow: 'الأسعار',
  title: 'أسعار مرصاد',
  lead: 'من رصد مركّز لفريق صغير إلى ذكاء إعلامي لمؤسسة كاملة: اختر الباقة المناسبة، ونعدّلها حسب مصادرك ولغاتك وعدد مستخدميك.',
  note: 'الأسعار حسب الطلب، وفق المصادر وعدد المستخدمين والخدمات المطلوبة.',
  contactTeam: 'تواصل مع فريقنا',
  quote: 'اطلب عرض سعر',
  capsTitle: 'القدرات',
  bestTitle: 'مناسبة لـ',
  featTitle: 'الوظائف الأساسية',
  plans: [
    {
      key: 'essential',
      name: 'الأساسية',
      tagline: 'ابدأ رصدًا إعلاميًا مركّزًا بسرعة.',
      caps: ['الصحافة الإلكترونية والمطبوعة', 'رصد شبكات التواصل', 'التنبيهات'],
      best: ['فرق الاتصال الصغيرة', 'الجمعيات والشركات الناشئة', 'أول مشروع رصد'],
      features: ['المساعد الذكي Around (قياسي)', 'لوحات معلومات جاهزة', 'تنبيهات بالبريد وتيليغرام', 'تصدير PDF وWord وCSV'],
    },
    {
      key: 'pro',
      name: 'الاحترافية',
      tagline: 'كل القنوات محلّلة، للفرق التي تقرر بناءً على البيانات.',
      caps: ['الصحافة الإلكترونية والمطبوعة', 'رصد شبكات التواصل', 'التلفزيون والإذاعة مع التفريغ النصي', 'الرادار الذكي'],
      best: ['إدارات الاتصال والعلاقات العامة', 'الفرق الإقليمية', 'الفرق المعتمدة على البيانات'],
      features: ['المساعد الذكي Around (متقدم)', 'موجزات صباحية بالذكاء الاصطناعي', 'لوحات مخصصة وحصة الحضور', 'تقارير بهويتك تُرسل تلقائيًا'],
    },
    {
      key: 'enterprise',
      name: 'الشركات والمؤسسات',
      tagline: 'الذكاء الإعلامي للمنظمات الكبرى والإدارات العامة.',
      caps: ['كل قدرات الباقة الاحترافية', 'متابعات خاصة', 'الظهور في الذكاء الاصطناعي', 'واجهة برمجية وتكاملات'],
      best: ['المجموعات والمنظمات متعددة الفرق', 'الوزارات والإدارات', 'الملفات الحساسة'],
      features: ['أدوار وصلاحيات لكل فريق', 'سجل تدقيق وحماية من النسخ', 'مصادقة ثنائية وتحقق بالوجه', 'خدمات تحليل عند الطلب'],
    },
    {
      key: 'agencies',
      name: 'الوكالات',
      tagline: 'تابع عدة عملاء وسلّم تقارير بهوية كل منهم.',
      caps: ['كل قدرات الباقة الاحترافية', 'مساحة لكل عميل', 'الظهور في الذكاء الاصطناعي', 'واجهة برمجية وتكاملات'],
      best: ['وكالات الاتصال والعلاقات العامة', 'مكاتب الاستشارات', 'شركات الخدمات الإعلامية'],
      features: ['لوحات ومتابعات لكل عميل', 'تقارير بشعار كل عميل', 'قياس الحملات', 'ملخصات ذكية يصقلها فريقك'],
    },
  ],
  compare: {
    eyebrow: 'مقارنة الباقات',
    title: 'اختر الباقة المناسبة لفريقك',
    feature: 'الوظيفة',
    yes: 'متوفر',
    no: 'غير متوفر',
    groups: [
      {
        title: 'الرصد',
        rows: [
          { label: 'الصحافة الإلكترونية والمطبوعة', cells: [true, true, true, true] },
          { label: 'شبكات التواصل ويوتيوب', cells: [true, true, true, true] },
          { label: 'التلفزيون والإذاعة مع التفريغ النصي', cells: [false, true, true, true] },
          { label: 'الرادار الذكي (المواضيع الناشئة)', cells: [false, true, true, true] },
          { label: 'متابعات خاصة', cells: [false, false, true, true] },
          { label: 'الظهور في الذكاء الاصطناعي', cells: [false, false, true, true] },
        ],
      },
      {
        title: 'التحليل والتقارير',
        rows: [
          { label: 'المساعد الذكي Around', cells: ['قياسي', 'متقدم', 'متقدم', 'متقدم'] },
          { label: 'لوحات القيادة', cells: ['جاهزة', 'مخصصة', 'مخصصة', 'لكل عميل'] },
          { label: 'موجزات صباحية بالذكاء الاصطناعي', cells: [false, true, true, true] },
          { label: 'التقارير والتصدير', cells: ['قياسي', 'بهويتك', 'بهويتك', 'بهوية العميل'] },
          { label: 'تنبيهات بالبريد وتيليغرام', cells: [true, true, true, true] },
        ],
      },
      {
        title: 'التنظيم والأمان',
        rows: [
          { label: 'مساحة معزولة', cells: [true, true, true, true] },
          { label: 'أدوار وصلاحيات لكل فريق', cells: [false, true, true, true] },
          { label: 'سجل تدقيق وحماية من النسخ', cells: [false, false, true, true] },
          { label: 'واجهة برمجية وتكاملات', cells: [false, false, true, true] },
          { label: 'المرافقة', cells: ['إعداد موجّه', 'إعداد وتدريب', 'أولوية وخدمات تحليل', 'تدريب فرقك'] },
        ],
      },
    ],
  },
  included: {
    title: 'متوفر في كل الباقات',
    items: [
      ['language', 'العربية والفرنسية والإنجليزية', 'تحليل أصيل وواجهة كاملة من اليمين إلى اليسار.'],
      ['lock', 'مساحتك الخاصة', 'بيانات ومستخدمون وإعدادات منفصلة عن بقية العملاء.'],
      ['headset', 'فريق إلى جانبك', 'نضبط معك المواضيع والمصادر والتنبيهات.'],
    ],
  },
  faq: {
    eyebrow: 'أسئلة',
    title: 'الأسئلة الشائعة',
    items: [
      { q: 'كيف يُحدَّد السعر؟', a: 'يُعدّ كل عرض حسب الطلب، وفق المصادر المتابَعة (صحافة، شبكات تواصل، تلفزيون وإذاعة) وعدد المستخدمين والخدمات المطلوبة. نرسل إليك عرضًا واضحًا بعد أول نقاش.' },
      { q: 'هل يمكنني تجربة مرصاد قبل الالتزام؟', a: 'نعم. نعدّ لك عرضًا مباشرًا على مواضيعك وأسواقك، لترى نتائج حقيقية قبل أن تختار.', to: 'contact', link: 'اطلب عرضًا توضيحيًا' },
      { q: 'هل يمكن أن تتطور باقتي؟', a: 'احتياجاتك تتغير: تحدّث مع فريقنا في أي وقت وسيقترح عليك التعديل المناسب، مثل مستخدمين أو مصادر إضافية أو وحدة جديدة.' },
      { q: 'هل يمكنكم إضافة الوسائل الإعلامية التي نحتاجها؟', a: 'نعم. اطلب منا إضافة القنوات والإذاعات والمواقع والصفحات المهمة لك، بما فيها المصادر المحلية.', to: 'coverage', link: 'التغطية الإقليمية' },
      { q: 'ما المرافقة المتوفرة؟', a: 'تشمل كل باقة إعدادًا موجّهًا لمواضيعك ومصادرك وتنبيهاتك. وحسب الباقة نضيف تدريب المستخدمين ودعمًا ذا أولوية وتقارير تحليلية مخصصة.', to: 'support', link: 'مرافقتنا' },
      { q: 'كيف تُحمى بياناتي؟', a: 'لكل منظمة مساحتها المعزولة، مع حسابات اسمية ومصادقة ثنائية وسجل تدقيق وحماية من النسخ للمحتوى الحساس.', to: 'security', link: 'الأمان' },
    ],
  },
  band: {
    title: 'لنبنِ العرض المناسب لك',
    text: 'أخبرنا بما تحتاج إلى متابعته. نجيبك بسرعة بعرض توضيحي ومقترح مناسب لفريقك.',
    cta: 'اطلب عرض سعر',
    second: 'اتصل بنا',
  },
}

export const PRICING: Record<LandingLang, PricingCopy> = { en, fr, ar }
