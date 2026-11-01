import { aiStatus } from './ai.js'

/**
 * Fournisseurs d'IA réellement utilisés (audit produit v5, constat 1) : nom du fournisseur, offre, clause de
 * non-réutilisation avec lien vers les conditions officielles, conservation des requêtes chez le fournisseur,
 * région de traitement. Le moteur principal et le moteur des tâches de fond viennent de la configuration (aiStatus) ;
 * la veille (collecte, tri, transcription) a ses propres moteurs, décrits ici aussi.
 * Uniquement ce que disent les conditions publiques des fournisseurs : aucune certification n'est affirmée.
 * Liens et durées vérifiés le 31/10/2026.
 */

export const PROVIDERS = {
  claude: {
    vendor: 'Anthropic PBC',
    product: { ar: 'Claude — واجهة Anthropic البرمجية (API)', en: 'Claude — Anthropic API' },
    offer: { ar: 'عرض تجاري مدفوع (الشروط التجارية لـ Anthropic)', en: 'Paid commercial offer (Anthropic Commercial Terms)' },
    noReuse: {
      ar: 'لا تستخدم Anthropic مدخلات ومخرجات الواجهة البرمجية لتدريب نماذجها (الشروط التجارية).',
      en: 'Anthropic does not train its models on API inputs and outputs (Commercial Terms).',
    },
    retention: {
      ar: 'تُحذف الطلبات والردود تلقائياً خلال 30 يوماً على الأكثر، ما لم تُرصد مخالفة لسياسة الاستخدام.',
      en: 'Prompts and outputs are deleted automatically within 30 days at most, unless flagged for a usage-policy violation.',
    },
    region: {
      ar: 'بنية Anthropic (الولايات المتحدة أساساً)؛ لا إقامة بيانات أوروبية أو خليجية مضبوطة.',
      en: 'Anthropic infrastructure (mainly United States); no EU or Gulf data residency configured.',
    },
    terms: [
      ['Commercial Terms', 'https://www.anthropic.com/legal/commercial-terms'],
      ['Data retention', 'https://privacy.anthropic.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data'],
    ],
  },
  gemini: {
    vendor: 'Google LLC',
    product: { ar: 'Gemini — واجهة Gemini البرمجية (Google AI Studio)', en: 'Gemini — Gemini API (Google AI Studio)' },
    offer: { ar: 'خدمة مدفوعة (فوترة مفعّلة، المستوى 1)', en: 'Paid service (billing enabled, Tier 1)' },
    offerFree: { ar: 'عرض مجاني: البيانات قد تُستخدم من Google — غير مسموح', en: 'Free tier: data may be used by Google — not allowed' },
    noReuse: {
      ar: 'في الخدمات المدفوعة لا تستخدم Google الطلبات والردود لتحسين منتجاتها (الشروط الإضافية لواجهة Gemini).',
      en: 'For paid services Google does not use prompts and responses to improve its products (Gemini API Additional Terms).',
    },
    retention: {
      ar: 'تحتفظ Google بالطلبات والردود مدة محدودة (55 يوماً) لكشف إساءة الاستخدام فقط.',
      en: 'Google keeps prompts and responses for a limited period (55 days), only to detect abuse.',
    },
    region: { ar: 'غير مضمونة (بنية Google العالمية).', en: 'Not guaranteed (Google global infrastructure).' },
    terms: [
      ['Gemini API Additional Terms', 'https://ai.google.dev/gemini-api/terms'],
      ['Abuse monitoring & logs', 'https://ai.google.dev/gemini-api/docs/logs-policy'],
    ],
  },
  vertex: {
    vendor: 'Google Cloud',
    product: { ar: 'Gemini عبر Google Cloud Vertex AI', en: 'Gemini on Google Cloud Vertex AI' },
    offer: { ar: 'Google Cloud مدفوع (شروط الخدمات الخاصة بـ Google Cloud)', en: 'Paid Google Cloud (Google Cloud Service Specific Terms)' },
    noReuse: {
      ar: 'لا تستخدم Google بيانات العملاء لتدريب النماذج دون إذن مسبق (حوكمة البيانات في Vertex AI).',
      en: 'Google does not use customer data to train models without prior permission (Vertex AI data governance).',
    },
    retention: {
      ar: 'تخزين مؤقت في الذاكرة حتى 24 ساعة، ويمكن طلب عدم الاحتفاظ إطلاقاً.',
      en: 'In-memory caching for up to 24 hours; zero data retention can be requested.',
    },
    region: null, // la région configurée (MMS_VERTEX_LOCATION)
    terms: [
      ['Service Specific Terms', 'https://cloud.google.com/terms/service-terms'],
      ['Vertex AI data governance', 'https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance'],
      ['Locations', 'https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations'],
    ],
  },
  openai: {
    vendor: 'OpenAI',
    product: { ar: 'واجهة OpenAI البرمجية', en: 'OpenAI API' },
    offer: { ar: 'واجهة برمجية مدفوعة (اتفاقية خدمات OpenAI)', en: 'Paid API (OpenAI Services Agreement)' },
    noReuse: {
      ar: 'لا تستخدم OpenAI بيانات الواجهة البرمجية للتدريب افتراضياً.',
      en: 'OpenAI does not train on API data by default.',
    },
    retention: {
      ar: 'تُحفظ الطلبات 30 يوماً على الأكثر لمراقبة إساءة الاستخدام ثم تُحذف.',
      en: 'Requests are kept for up to 30 days for abuse monitoring, then deleted.',
    },
    region: { ar: 'الولايات المتحدة افتراضياً.', en: 'United States by default.' },
    terms: [
      ['Services Agreement', 'https://openai.com/policies/services-agreement/'],
      ['Your data (API)', 'https://platform.openai.com/docs/guides/your-data'],
    ],
  },
  local: {
    vendor: { ar: 'نموذج مستضاف', en: 'Self-hosted model' },
    product: { ar: 'نموذج مستضاف (متوافق مع OpenAI)', en: 'Self-hosted model (OpenAI-compatible)' },
    offer: { ar: 'استضافة خاصة', en: 'Private hosting' },
    noReuse: { ar: 'لا تخرج البيانات إلى مزوّد خارجي.', en: 'Data does not leave to an outside provider.' },
    retention: { ar: 'حسب الخادم المضيف.', en: 'Depends on the host server.' },
    region: { ar: 'حيث يُستضاف النموذج.', en: 'Where the model is hosted.' },
    terms: [],
  },
}

const USE_LABEL = {
  main: { ar: 'المحرك الرئيسي (المساعد، التحليل الذكي، التقارير)', en: 'Main engine (assistant, AI analysis, reports)' },
  economy: { ar: 'مهام الخلفية (تصحيح الجهات، التحليلات السريعة)', en: 'Background tasks (entity cleanup, quick analyses)' },
  veilleSort: { ar: 'جمع الأخبار: الفرز والتلخيص', en: 'News collection: sorting and summaries' },
  veilleAudio: { ar: 'تفريغ الإذاعة والتلفزيون (صوت ← نص)', en: 'Radio and TV transcription (audio → text)' },
}

const VERTEX_REGION = {
  'europe-west8': { ar: 'ميلانو، إيطاليا (europe-west8)', en: 'Milan, Italy (europe-west8)' },
  'me-central2': { ar: 'الدمام، السعودية (me-central2)', en: 'Dammam, Saudi Arabia (me-central2)' },
  'me-central1': { ar: 'الدوحة، قطر (me-central1)', en: 'Doha, Qatar (me-central1)' },
  global: { ar: 'عالمية (global): دون ضمان منطقة', en: 'Global endpoint: no region guarantee' },
}

/** Région Vertex AI configurée, en clair */
export function vertexRegion(loc = process.env.MMS_VERTEX_LOCATION || 'global') {
  return VERTEX_REGION[loc] || { ar: `منطقة Google Cloud ‏${loc}`, en: `Google Cloud region ${loc}` }
}

function describe(id, lang, status) {
  const p = PROVIDERS[id]
  if (!p) return null
  const pick = (v) => (v && typeof v === 'object' ? v[lang] : v) || ''
  const geminiFree = id === 'gemini' && status && status.engines?.find((e) => e.id === 'gemini')?.noReuse === false
  return {
    id,
    vendor: pick(p.vendor),
    product: pick(p.product),
    offer: pick(geminiFree ? p.offerFree : p.offer),
    noReuse: geminiFree ? '' : pick(p.noReuse),
    retention: pick(p.retention),
    region: id === 'vertex' ? pick(vertexRegion()) : pick(p.region),
    terms: p.terms.map(([label, url]) => ({ label, url })),
    warning: geminiFree,
  }
}

/**
 * Fiche « IA » pour l'écran IA, la FAQ et la note de sécurité : moteurs utilisés et ce qui est envoyé.
 * veille : moteurs de la veille Libye (Claude pour le tri et les résumés, OpenAI pour la transcription).
 */
export function aiDisclosure(lang = 'ar', status = aiStatus()) {
  const l = lang === 'en' ? 'en' : 'ar'
  const rows = []
  const add = (use, id) => {
    const d = describe(id, l, status)
    if (d) rows.push({ use, useLabel: USE_LABEL[use][l], ...d })
  }
  if (status.main) add('main', status.main)
  if (status.economy && status.economy !== status.main) add('economy', status.economy)
  add('veilleSort', 'claude')
  add('veilleAudio', 'openai')
  return {
    lang: l,
    main: status.main ? describe(status.main, l, status) : null,
    rows,
    sent:
      l === 'ar'
        ? 'يُرسل نص الأخبار المرصودة (العنوان، الملخص، المصدر، التاريخ) وسؤال المستخدم، وصوت الإذاعات والقنوات العامة للتفريغ؛ لا تُرسل أبداً كلمات مرور أو بيانات حسابات.'
        : 'We send the monitored news text (title, summary, source, date) and the user question, and public radio/TV audio for transcription; never passwords or account data.',
    noCert:
      l === 'ar'
        ? 'هذه المعلومات منقولة من الشروط المنشورة لكل مزوّد؛ لا ندّعي أي شهادة لم نتحقق منها.'
        : 'This information comes from each provider’s published terms; we claim no certification we have not verified.',
    checked: '2026-10-31',
  }
}

/** Libellé court pour l'écran IA : « Claude — Anthropic API · عرض تجاري مدفوع » */
export function aiBadge(lang = 'ar', status = aiStatus()) {
  const d = status.main ? describe(status.main, lang === 'en' ? 'en' : 'ar', status) : null
  return d ? { id: d.id, product: d.product, offer: d.offer, region: d.region, warning: d.warning } : null
}

/** Texte Markdown de la section IA (note de sécurité téléchargeable) */
export function aiDisclosureMarkdown(lang = 'ar', status = aiStatus()) {
  const d = aiDisclosure(lang, status)
  const en = d.lang === 'en'
  const lines = [en ? '## Artificial intelligence — providers' : '## الذكاء الاصطناعي — المزوّدون', '']
  for (const r of d.rows) {
    lines.push(`### ${r.useLabel}`)
    lines.push(`- ${en ? 'Provider' : 'المزوّد'}: ${r.vendor} — ${r.product}`)
    lines.push(`- ${en ? 'Offer' : 'العرض'}: ${r.offer}`)
    if (r.noReuse) lines.push(`- ${en ? 'No reuse' : 'عدم إعادة الاستخدام'}: ${r.noReuse}`)
    lines.push(`- ${en ? 'Retention at the provider' : 'مدة الاحتفاظ لدى المزوّد'}: ${r.retention}`)
    lines.push(`- ${en ? 'Processing region' : 'منطقة المعالجة'}: ${r.region}`)
    if (r.terms.length) lines.push(`- ${en ? 'Official terms' : 'الشروط الرسمية'}: ${r.terms.map((t) => `[${t.label}](${t.url})`).join(' · ')}`)
    lines.push('')
  }
  lines.push(d.sent, '', `_${d.noCert}_`)
  return lines.join('\n')
}

/* ---------------------------------------------------------------- audit produit v6, constat 3 */

/**
 * Fiche IA pour l'application client (écran IA, FAQ, note de sécurité). Deux modes, réglés dans la console Super Admin
 * (settings.json, `aiDisclosure`) :
 * - « neutral » (décision d'Around du 31/10, par défaut) : sans nom de fournisseur, mais avec les faits vérifiables
 *   que l'audit v6 demande : nature de l'offre, clause de non-entraînement, durée de conservation chez le fournisseur,
 *   région de traitement. Le nom et les liens vers les conditions officielles sont dans la note remise au client.
 * - « named » : la fiche complète (fournisseur, produit, liens officiels), comme dans la console Super Admin.
 * Aucune certification n'est affirmée dans les deux cas.
 */
const NEUTRAL = {
  claude: {
    offer: { ar: 'واجهة برمجية مدفوعة بعقد تجاري مع مزوّد نماذج لغوية كبرى', en: 'Paid API under a commercial contract with a major language-model provider' },
    noReuse: { ar: 'تنصّ الشروط التجارية للمزوّد على عدم استخدام الطلبات والردود لتدريب نماذجه.', en: 'The provider’s commercial terms state that prompts and outputs are not used to train its models.' },
    retention: PROVIDERS.claude.retention,
    region: { ar: 'الولايات المتحدة أساساً (بنية المزوّد)؛ لا إقامة بيانات أوروبية أو خليجية مضبوطة.', en: 'Mainly United States (provider infrastructure); no EU or Gulf data residency configured.' },
  },
  gemini: {
    offer: { ar: 'خدمة سحابية مدفوعة (فوترة مفعّلة)', en: 'Paid cloud service (billing enabled)' },
    noReuse: { ar: 'في الخدمة المدفوعة لا تُستخدم الطلبات والردود لتحسين منتجات المزوّد.', en: 'On the paid service, prompts and responses are not used to improve the provider’s products.' },
    retention: { ar: 'يحتفظ المزوّد بالطلبات والردود 55 يوماً لكشف إساءة الاستخدام فقط.', en: 'The provider keeps prompts and responses for 55 days, only to detect abuse.' },
    region: { ar: 'غير مضمونة (بنية المزوّد العالمية).', en: 'Not guaranteed (provider global infrastructure).' },
  },
  vertex: {
    offer: { ar: 'خدمة سحابية مؤسسية مدفوعة', en: 'Paid enterprise cloud service' },
    noReuse: { ar: 'لا تُستخدم بيانات العميل لتدريب النماذج دون إذن مسبق.', en: 'Customer data is not used to train models without prior permission.' },
    retention: { ar: 'تخزين مؤقت في الذاكرة حتى 24 ساعة، ويمكن طلب عدم الاحتفاظ إطلاقاً.', en: 'In-memory caching for up to 24 hours; zero data retention can be requested.' },
    region: null,
  },
  openai: {
    offer: { ar: 'واجهة برمجية مدفوعة لتفريغ الصوت', en: 'Paid speech-to-text API' },
    noReuse: { ar: 'لا تُستخدم بيانات الواجهة البرمجية للتدريب افتراضياً.', en: 'API data is not used for training by default.' },
    retention: { ar: 'تُحفظ الطلبات 30 يوماً على الأكثر لمراقبة إساءة الاستخدام ثم تُحذف.', en: 'Requests are kept for up to 30 days for abuse monitoring, then deleted.' },
    region: { ar: 'الولايات المتحدة افتراضياً.', en: 'United States by default.' },
  },
  local: { offer: PROVIDERS.local.offer, noReuse: PROVIDERS.local.noReuse, retention: PROVIDERS.local.retention, region: PROVIDERS.local.region },
}

export const AI_DISCLOSURE_MODES = ['neutral', 'named']

export function aiClientDisclosure(lang = 'ar', mode = 'neutral', status = aiStatus()) {
  const full = aiDisclosure(lang, status)
  const l = full.lang
  const en = l === 'en'
  if (mode === 'named') return { ...full, mode: 'named' }
  const pick = (v) => (v && typeof v === 'object' ? v[l] : v) || ''
  const rows = full.rows.map((r) => {
    const n = NEUTRAL[r.id] || NEUTRAL.local
    return {
      use: r.use,
      useLabel: r.useLabel,
      id: '',
      vendor: en ? 'Mearsaad AI engine' : 'محرك مرصاد للذكاء الاصطناعي',
      product: '',
      offer: r.warning ? pick(PROVIDERS.gemini.offerFree).replace(/Google/g, en ? 'the provider' : 'المزوّد') : pick(n.offer),
      noReuse: r.warning ? '' : pick(n.noReuse),
      retention: pick(n.retention),
      region: r.id === 'vertex' ? pick(vertexRegion()) : pick(n.region),
      terms: [],
      warning: Boolean(r.warning),
    }
  })
  return {
    lang: l,
    mode: 'neutral',
    rows,
    sent: full.sent,
    noCert: full.noCert,
    named: en
      ? '« Mearsaad AI engine » is our product name, not a provider. The providers’ names and the links to their official terms are listed in the security note handed to the client (tender files), on request.'
      : '« محرك مرصاد » اسم منتجنا وليس مزوّداً. أسماء المزوّدين وروابط شروطهم الرسمية مذكورة في ملاحظة الأمان المسلّمة للعميل (ملفات طلبات العروض) عند الطلب.',
    checked: full.checked,
  }
}

/** Ce qui manque pour traiter en Europe (Milan) ou dans le Golfe (Dammam) avec Vertex AI — console Super Admin */
export function vertexReadiness(env = process.env, exists = () => false) {
  const missing = []
  if (!env.MMS_VERTEX_PROJECT) missing.push('MMS_VERTEX_PROJECT')
  if (!env.MMS_VERTEX_LOCATION || env.MMS_VERTEX_LOCATION === 'global') missing.push('MMS_VERTEX_LOCATION (europe-west8 | me-central2)')
  const cred = env.GOOGLE_APPLICATION_CREDENTIALS
  if (!cred) missing.push('GOOGLE_APPLICATION_CREDENTIALS')
  else if (!exists(cred)) missing.push(`fichier du compte de service absent : ${cred}`)
  return { ready: missing.length === 0, missing, location: env.MMS_VERTEX_LOCATION || '', main: env.MMS_AI_PROVIDER === 'vertex' }
}
