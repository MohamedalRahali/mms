import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import express from 'express'
import { words } from './radar.js'

/**
 * Générateur de rapports médias (التقارير) : l'utilisateur coche des publications, MMS calcule les chiffres
 * sur ces seules publications, l'IA rédige les parties d'interprétation (signalées comme telles), et le rapport
 * s'ouvre dans l'éditeur. Chaque compte ne voit que ses rapports.
 *
 *   data/reports/<compte>.json        rapports du compte (document TipTap, réglages, historique des envois)
 *   data/reports/logos/<compte>.<ext> logo de l'organisation (png, jpg ou webp, 1 Mo au plus)
 */

export const MAX_POSTS = 300 // publications par rapport
const AI_POSTS = 120 // publications lues par l'IA (les chiffres portent toujours sur toute la sélection)
const MAX_REPORTS = 200 // rapports gardés par compte
const MAX_DOC = 3_000_000 // taille du document enregistré (caractères JSON)
const LOGO_MAX = 1_048_576
const ATTACH_MAX = 12 * 1_048_576
const GEN_QUOTA = 20 // générations par heure et par compte
const MAIL_QUOTA = 30 // envois d'e-mail par heure et par compte
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const ID_RE = /^r_[a-z0-9]{16}$/

/* ---------------------------------------------------------------- libellés */

const L = {
  ar: {
    cat: { politique: 'سياسي', économie: 'اقتصادي', société: 'اجتماعي', international: 'دولي', sport: 'رياضة', culture: 'ثقافة', météo: 'طقس', 'faits divers': 'حوادث', santé: 'صحة', sécurité: 'أمني', énergie: 'طاقة', autre: 'أخرى' },
    media: { article: 'مقالات ومواقع إخبارية', broadcast: 'بث تلفزي وإذاعي', podcast: 'بودكاست', blog: 'مدونات', comment: 'تعليقات', forum: 'منتديات', social: 'شبكات التواصل' },
    channel: { radio: 'إذاعة', tv: 'تلفزيون', site: 'أونلاين', presse: 'صحافة مطبوعة', x: 'إكس', facebook: 'فيسبوك', instagram: 'إنستغرام', linkedin: 'لينكدإن', youtube: 'يوتيوب', tiktok: 'تيك توك', telegram: 'تيليغرام', bluesky: 'بلوسكاي', reddit: 'ريديت', mastodon: 'ماستودون', podcast: 'بودكاست', forum: 'منتديات', blog: 'مدونات' },
    lang: { ar: 'العربية', fr: 'الفرنسية', en: 'الإنجليزية', mixte: 'عربي وفرنسي' },
    tone: { positive: 'إيجابي', neutral: 'محايد', negative: 'سلبي', unknown: 'غير مصنّف' },
    title: 'تقرير التحليل الإعلامي',
    org: 'المركز الوطني لدعم القرار',
    period: 'الفترة المشمولة',
    generated: 'تاريخ الإعداد',
    author: 'إعداد',
    postsCount: (n) => `عدد المنشورات المحللة: ${n}`,
    scope: (n) => `أُعدّ هذا التقرير حصريًا من ${n} منشورًا حدّدها المستخدم. كل الأرقام محسوبة من هذه المنشورات وحدها.`,
    measured: 'أرقام محسوبة من المنشورات المحددة',
    aiLabel: 'تفسير مولّد بالذكاء الاصطناعي، يُرجى مراجعته قبل النشر',
    aiOff: 'لم يتوفر التحليل الذكي عند إعداد هذا التقرير. يمكنكم كتابة هذا القسم مباشرة في المحرر.',
    h: {
      summary: 'الملخص التنفيذي',
      stats: 'الإحصاءات الرئيسية',
      sentiment: 'تحليل المشاعر',
      topics: 'أبرز المواضيع والكلمات المفتاحية',
      sources: 'تحليل المصادر الإعلامية',
      posts: 'التحليل التفصيلي للمنشورات',
      findings: 'النتائج الرئيسية والتوصيات',
      findingsSub: 'النتائج الرئيسية',
      recoSub: 'التوصيات',
      conclusion: 'الخاتمة',
      refs: 'المصادر والمراجع',
    },
    col: { name: 'البيان', count: 'العدد', share: 'النسبة', day: 'اليوم', source: 'المصدر', media: 'نوع الوسيلة', channel: 'القناة', language: 'اللغة', topic: 'الموضوع', keyword: 'الكلمة', person: 'الشخصيات', org: 'المؤسسات', place: 'الأماكن', metric: 'المؤشر', value: 'القيمة' },
    kpi: { total: 'إجمالي المنشورات', sources: 'عدد المصادر', days: 'عدد الأيام', from: 'من', to: 'إلى', views: 'المشاهدات', reactions: 'التفاعلات', shares: 'المشاركات', comments: 'التعليقات' },
    bySource: 'التوزيع حسب المصدر',
    byDay: 'التوزيع حسب تاريخ النشر',
    byLang: 'التوزيع حسب اللغة',
    byMedia: 'التوزيع حسب نوع الوسيلة',
    byChannel: 'التوزيع حسب القناة',
    byTopic: 'التوزيع حسب الموضوع',
    keywords: 'الكلمات الأكثر تكرارًا',
    entities: 'الجهات والأماكن الأكثر ذكرًا',
    engagement: 'مؤشرات التفاعل (عند توفرها في المصدر)',
    toneNote: (n) => `التصنيف مأخوذ من تحليل الرصد لكل منشور؛ ${n} منشورًا بلا تصنيف ولم تُحتسب في النسب.`,
    analysis: 'التحليل',
    noSummary: 'لا يوجد ملخص لهذا المنشور.',
    open: 'رابط المنشور',
    more: (n) => `و${n} منشورًا آخر (حدّ العرض).`,
    footer: 'MMS — منصة الرصد الإعلامي',
    header: 'تقرير التحليل الإعلامي',
  },
  en: {
    cat: { politique: 'Politics', économie: 'Economy', société: 'Society', international: 'International', sport: 'Sport', culture: 'Culture', météo: 'Weather', 'faits divers': 'Incidents', santé: 'Health', sécurité: 'Security', énergie: 'Energy', autre: 'Other' },
    media: { article: 'News websites', broadcast: 'TV and radio', podcast: 'Podcasts', blog: 'Blogs', comment: 'Comments', forum: 'Forums', social: 'Social media' },
    channel: { radio: 'Radio', tv: 'Television', site: 'Websites', presse: 'Print press', x: 'X', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', youtube: 'YouTube', tiktok: 'TikTok', telegram: 'Telegram', bluesky: 'Bluesky', reddit: 'Reddit', mastodon: 'Mastodon', podcast: 'Podcast', forum: 'Forums', blog: 'Blogs' },
    lang: { ar: 'Arabic', fr: 'French', en: 'English', mixte: 'Arabic and French' },
    tone: { positive: 'Positive', neutral: 'Neutral', negative: 'Negative', unknown: 'Unclassified' },
    title: 'Media Analysis Report',
    org: 'National Decision Support Centre',
    period: 'Reporting period',
    generated: 'Generated on',
    author: 'Prepared by',
    postsCount: (n) => `Posts analysed: ${n}`,
    scope: (n) => `This report is based exclusively on the ${n} posts selected by the user. Every figure is calculated from these posts only.`,
    measured: 'Figures calculated from the selected posts',
    aiLabel: 'AI-generated interpretation, please review before distribution',
    aiOff: 'AI analysis was not available when this report was generated. You can write this section directly in the editor.',
    h: {
      summary: 'Executive summary',
      stats: 'Key statistics',
      sentiment: 'Sentiment analysis',
      topics: 'Top topics and keywords',
      sources: 'Media source analysis',
      posts: 'Detailed post analysis',
      findings: 'Key findings and recommendations',
      findingsSub: 'Key findings',
      recoSub: 'Recommendations',
      conclusion: 'Conclusion',
      refs: 'Sources and references',
    },
    col: { name: 'Item', count: 'Count', share: 'Share', day: 'Day', source: 'Source', media: 'Media type', channel: 'Channel', language: 'Language', topic: 'Topic', keyword: 'Keyword', person: 'People', org: 'Organisations', place: 'Places', metric: 'Indicator', value: 'Value' },
    kpi: { total: 'Total posts', sources: 'Sources', days: 'Days covered', from: 'From', to: 'To', views: 'Views', reactions: 'Reactions', shares: 'Shares', comments: 'Comments' },
    bySource: 'Breakdown by source',
    byDay: 'Breakdown by publication date',
    byLang: 'Breakdown by language',
    byMedia: 'Breakdown by media type',
    byChannel: 'Breakdown by channel',
    byTopic: 'Breakdown by topic',
    keywords: 'Most frequent keywords',
    entities: 'Most mentioned actors and places',
    engagement: 'Engagement indicators (when provided by the source)',
    toneNote: (n) => `Sentiment comes from the monitoring classification of each post; ${n} posts are unclassified and excluded from the percentages.`,
    analysis: 'Analysis',
    noSummary: 'No summary available for this post.',
    open: 'Open post',
    more: (n) => `And ${n} more posts (display limit).`,
    footer: 'MMS — Media Monitoring Platform',
    header: 'Media Analysis Report',
  },
}
const labels = (lang) => L[lang === 'en' ? 'en' : 'ar']

/* ---------------------------------------------------------------- statistiques (sélection seule) */

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli', year: 'numeric', month: '2-digit', day: '2-digit' })
const dayOf = (iso) => DAY.format(new Date(iso))

function tally(list) {
  const map = new Map()
  for (const v of list) if (v) map.set(v, (map.get(v) || 0) + 1)
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)))
}

/** Chiffres du rapport, calculés uniquement sur les publications données */
export function reportStats(items) {
  const dates = items.map((it) => it.date).filter(Boolean).sort()
  const days = tally(items.map((it) => it.date && dayOf(it.date))).sort((a, b) => a.name.localeCompare(b.name))
  const tones = { positive: 0, neutral: 0, negative: 0, unknown: 0 }
  for (const it of items) tones[['positive', 'neutral', 'negative'].includes(it.tone) ? it.tone : 'unknown']++
  // Mots-clés : racine commune, affichée sous sa forme la plus fréquente ; un mot compte une fois par publication
  const stems = new Map()
  for (const it of items) {
    const seen = new Set()
    for (const { s, w } of words(`${it.title} ${it.summary}`)) {
      if (seen.has(s)) continue
      seen.add(s)
      const row = stems.get(s) || { count: 0, forms: new Map() }
      row.count++
      row.forms.set(w, (row.forms.get(w) || 0) + 1)
      stems.set(s, row)
    }
  }
  const keywords = [...stems.values()]
    .filter((r) => r.count >= 2 || items.length < 5)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((r) => ({ name: [...r.forms.entries()].sort((a, b) => b[1] - a[1])[0][0], count: r.count }))
  const engagement = { posts: 0, views: 0, reactions: 0, shares: 0, comments: 0 }
  for (const it of items) {
    const e = it.engagement
    if (!e) continue
    engagement.posts++
    for (const k of ['views', 'reactions', 'shares', 'comments']) engagement[k] += Number(e[k]) || 0
  }
  return {
    total: items.length,
    from: dates[0] || null,
    to: dates[dates.length - 1] || null,
    days,
    sources: tally(items.map((it) => it.origin)),
    media: tally(items.map((it) => it.media || 'article')),
    channels: tally(items.map((it) => it.channel)),
    languages: tally(items.map((it) => it.lang)),
    topics: tally(items.map((it) => it.category)),
    tones,
    keywords,
    people: tally(items.flatMap((it) => it.people || [])).slice(0, 10),
    orgs: tally(items.flatMap((it) => it.orgs || [])).slice(0, 10),
    places: tally(items.flatMap((it) => it.places || [])).slice(0, 10),
    engagement,
  }
}

/**
 * Publications sélectionnées, retrouvées dans les données visibles de MMS (masquées et inconnues écartées),
 * dans l'ordre de la sélection et sans doublon
 */
export function pickSelected(ids, byId) {
  const items = []
  const missing = []
  const seen = new Set()
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw)
    if (seen.has(id)) continue
    seen.add(id)
    const it = byId.get(id)
    if (it) items.push(it)
    else missing.push(id)
  }
  return { items, missing }
}

/** Copie figée d'une publication : le rapport reste exact même si la base change ensuite */
export function snapshot(it) {
  return {
    id: it.id,
    title: String(it.title || '').slice(0, 500),
    summary: String(it.summary || '').slice(0, 2000),
    date: it.date,
    origin: it.origin || '',
    channel: it.channel || '',
    media: it.media || 'article',
    lang: it.lang || '',
    category: it.category || '',
    tone: it.tone || '',
    url: /^https?:\/\//i.test(it.url || '') ? it.url : '',
    people: it.people || [],
    orgs: it.orgs || [],
    places: it.places || [],
    engagement: it.engagement,
  }
}

/* ---------------------------------------------------------------- IA (interprétation) */

export const REPORT_SPEC = {
  system: `You write the narrative parts of a professional media analysis report for the MMS platform (Libyan media monitoring), for institutional clients.
You receive figures calculated by MMS from the posts the user selected, and the list of those posts with their identifiers.
Rules:
- Write in the requested language (Arabic: Modern Standard Arabic; English: formal English), neutral and factual tone.
- Use only the posts and figures provided. Never invent facts, figures, sources or dates. Do not claim to have analysed anything not provided.
- Do not restate tables; interpret them. Quote figures only if they appear in the data.
- executive_summary: 4 to 6 sentences.
- sentiment_commentary, topics_commentary, sources_commentary: 2 to 4 sentences each.
- post_analyses: for up to 40 of the most significant posts, one or two sentences on why the post matters, using the post id exactly as given.
- findings: 3 to 6 key findings; recommendations: 2 to 5 actionable recommendations, supported by the selected content.
- conclusion: 2 to 4 sentences.`,
  schema: {
    type: 'object',
    properties: {
      executive_summary: { type: 'string' },
      sentiment_commentary: { type: 'string' },
      topics_commentary: { type: 'string' },
      sources_commentary: { type: 'string' },
      post_analyses: {
        type: 'array',
        items: { type: 'object', properties: { id: { type: 'string' }, analysis: { type: 'string' } }, required: ['id', 'analysis'], additionalProperties: false },
      },
      findings: { type: 'array', items: { type: 'string' } },
      recommendations: { type: 'array', items: { type: 'string' } },
      conclusion: { type: 'string' },
    },
    required: ['executive_summary', 'sentiment_commentary', 'topics_commentary', 'sources_commentary', 'post_analyses', 'findings', 'recommendations', 'conclusion'],
    additionalProperties: false,
  },
  format:
    'Reply only with a JSON object {"executive_summary": "...", "sentiment_commentary": "...", "topics_commentary": "...", "sources_commentary": "...", "post_analyses": [{"id": "...", "analysis": "..."}], "findings": ["..."], "recommendations": ["..."], "conclusion": "..."}',
  valid: (d) => typeof d?.executive_summary === 'string' && Array.isArray(d.findings) && Array.isArray(d.recommendations),
  name: 'media_report',
}

export function reportPrompt(posts, stats, lang) {
  const top = (list, n = 10) => list.slice(0, n).map((r) => `${r.name} (${r.count})`).join(', ') || '-'
  const facts = [
    `Language of the report: ${lang === 'en' ? 'English' : 'Arabic'}`,
    `Selected posts: ${stats.total}${posts.length > AI_POSTS ? ` (the ${AI_POSTS} most recent are listed below)` : ''}`,
    `Period: ${stats.from?.slice(0, 10) || '-'} to ${stats.to?.slice(0, 10) || '-'}`,
    `Sources: ${top(stats.sources)}`,
    `Media types: ${top(stats.media)}`,
    `Languages: ${top(stats.languages)}`,
    `Topics: ${top(stats.topics)}`,
    `Sentiment (from monitoring classification): positive ${stats.tones.positive}, neutral ${stats.tones.neutral}, negative ${stats.tones.negative}, unclassified ${stats.tones.unknown}`,
    `Keywords: ${top(stats.keywords, 15)}`,
    `People: ${top(stats.people)} | Organisations: ${top(stats.orgs)} | Places: ${top(stats.places)}`,
  ].join('\n')
  const lines = [...posts]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, AI_POSTS)
    .map((p) => `- id=${p.id} [${String(p.date).slice(0, 10)}] (${p.origin}; ${p.media}; ${p.category || '-'}; tone=${p.tone || '-'}) ${p.title} — ${p.summary.slice(0, 400)}`)
    .join('\n')
  return `${facts}\n\nSelected posts:\n${lines}`
}

/** Garde seulement ce que l'IA a le droit de dire : chaînes bornées, analyses rattachées à une publication sélectionnée */
export function cleanAi(data, posts) {
  if (!data || typeof data !== 'object') return null
  const s = (v, n = 3000) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
  const list = (v) => (Array.isArray(v) ? v.map((x) => s(x, 800)).filter(Boolean).slice(0, 8) : [])
  const ids = new Set(posts.map((p) => p.id))
  const byPost = {}
  for (const row of Array.isArray(data.post_analyses) ? data.post_analyses : []) if (ids.has(String(row?.id)) && s(row.analysis)) byPost[String(row.id)] = s(row.analysis, 800)
  return {
    summary: s(data.executive_summary),
    sentiment: s(data.sentiment_commentary),
    topics: s(data.topics_commentary),
    sources: s(data.sources_commentary),
    posts: byPost,
    findings: list(data.findings),
    recommendations: list(data.recommendations),
    conclusion: s(data.conclusion),
  }
}

/* ---------------------------------------------------------------- document (format TipTap / ProseMirror) */

const text = (value, marks) => (value ? [{ type: 'text', text: String(value), ...(marks ? { marks } : {}) }] : [])
const para = (value, attrs, marks) => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content: text(value, marks) })
const heading = (level, value, attrs) => ({ type: 'heading', attrs: { level, ...(attrs || {}) }, content: text(value) })
const bullets = (list) => ({ type: 'bulletList', content: list.map((v) => ({ type: 'listItem', content: [para(v)] })) })
const cell = (value, header) => ({ type: header ? 'tableHeader' : 'tableCell', content: [para(value)] })
const table = (head, rows) => ({ type: 'table', content: [{ type: 'tableRow', content: head.map((h) => cell(h, true)) }, ...rows.map((r) => ({ type: 'tableRow', content: r.map((v) => cell(v)) }))] })
const note = (value) => para(value, null, [{ type: 'italic' }, { type: 'textStyle', attrs: { color: '#6b7a90' } }])
const pct = (n, total) => (total ? `${Math.round((n / total) * 1000) / 10}%` : '0%')

/** Interprétation de l'IA, encadrée et étiquetée pour ne pas la confondre avec les chiffres mesurés */
function aiBlock(t, value) {
  return {
    type: 'blockquote',
    content: [para(`✦ ${t.aiLabel}`, null, [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#7c3aed' } }]), para(value || t.aiOff)],
  }
}

function countTable(t, title, rows, label, total, nameOf = (n) => n) {
  if (!rows.length) return []
  return [heading(3, title), table([label, t.col.count, t.col.share], rows.map((r) => [nameOf(r.name), String(r.count), pct(r.count, total)]))]
}

const fmtDate = (iso, lang) =>
  iso ? new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ar-LY-u-nu-latn', { timeZone: 'Africa/Tripoli', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : '—'
const fmtDateTime = (iso, lang) =>
  iso
    ? new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ar-LY-u-nu-latn', { timeZone: 'Africa/Tripoli', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : '—'

export const DOC_POSTS = 300 // publications détaillées dans le corps du rapport

/** Document complet du rapport ; toutes les valeurs viennent de « posts », « stats » et « ai » */
export function buildDoc({ lang, title, org, author, logo, posts, stats, ai, generatedAt }) {
  const t = labels(lang)
  const center = { textAlign: 'center' }
  const name = {
    cat: (c) => t.cat[c] || c || '—',
    media: (m) => t.media[m] || m,
    channel: (c) => t.channel[c] || c,
    lang: (l) => t.lang[l] || l,
  }
  const content = []
  // Page de garde
  if (logo) content.push({ type: 'image', attrs: { src: logo, alt: org || t.org, title: null, width: 220 } })
  content.push(
    para(org || t.org, center, [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#0d3b66', fontSize: '18px' } }]),
    heading(1, title || t.title, center),
    para(`${t.period}: ${fmtDate(stats.from, lang)} — ${fmtDate(stats.to, lang)}`, center),
    para(`${t.generated}: ${fmtDate(generatedAt, lang)}`, center),
    para(`${t.author}: ${author}`, center),
    para(t.postsCount(stats.total), center, [{ type: 'bold' }]),
    { type: 'pageBreak' },
  )
  // 1. Résumé
  content.push(heading(2, t.h.summary), note(t.scope(stats.total)), aiBlock(t, ai?.summary))
  // 2. Chiffres clés
  content.push(
    heading(2, t.h.stats),
    note(t.measured),
    table(
      [t.col.metric, t.col.value],
      [
        [t.kpi.total, String(stats.total)],
        [t.kpi.sources, String(stats.sources.length)],
        [t.kpi.days, String(stats.days.length)],
        [t.kpi.from, fmtDate(stats.from, lang)],
        [t.kpi.to, fmtDate(stats.to, lang)],
      ],
    ),
    ...countTable(t, t.bySource, stats.sources.slice(0, 15), t.col.source, stats.total),
    ...countTable(t, t.byDay, stats.days, t.col.day, stats.total),
    ...countTable(t, t.byLang, stats.languages, t.col.language, stats.total, name.lang),
  )
  if (stats.engagement.posts)
    content.push(
      heading(3, t.engagement),
      table(
        [t.col.metric, t.col.value],
        ['views', 'reactions', 'shares', 'comments'].map((k) => [t.kpi[k], stats.engagement[k].toLocaleString('en-US')]),
      ),
    )
  // 3. Tonalité
  const classified = stats.total - stats.tones.unknown
  content.push(
    heading(2, t.h.sentiment),
    note(t.measured),
    table(
      [t.col.name, t.col.count, t.col.share],
      ['positive', 'neutral', 'negative'].map((k) => [t.tone[k], String(stats.tones[k]), pct(stats.tones[k], classified)]).concat([[t.tone.unknown, String(stats.tones.unknown), '—']]),
    ),
    note(t.toneNote(stats.tones.unknown)),
    aiBlock(t, ai?.sentiment),
  )
  // 4. Thèmes et mots-clés
  content.push(heading(2, t.h.topics), note(t.measured), ...countTable(t, t.byTopic, stats.topics, t.col.topic, stats.total, name.cat))
  if (stats.keywords.length) content.push(heading(3, t.keywords), table([t.col.keyword, t.col.count], stats.keywords.map((k) => [k.name, String(k.count)])))
  const ent = [
    [t.col.person, stats.people],
    [t.col.org, stats.orgs],
    [t.col.place, stats.places],
  ].filter(([, rows]) => rows.length)
  if (ent.length)
    content.push(
      heading(3, t.entities),
      table(
        ent.map(([h]) => h),
        Array.from({ length: Math.max(...ent.map(([, r]) => r.length)) }, (_, i) => ent.map(([, r]) => (r[i] ? `${r[i].name} (${r[i].count})` : ''))),
      ),
    )
  content.push(aiBlock(t, ai?.topics))
  // 5. Sources
  content.push(
    heading(2, t.h.sources),
    note(t.measured),
    ...countTable(t, t.byMedia, stats.media, t.col.media, stats.total, name.media),
    ...countTable(t, t.byChannel, stats.channels, t.col.channel, stats.total, name.channel),
    aiBlock(t, ai?.sources),
  )
  // 6. Publications
  content.push({ type: 'pageBreak' }, heading(2, t.h.posts))
  posts.slice(0, DOC_POSTS).forEach((p, idx) => {
    const titleNode = p.url ? text(p.title, [{ type: 'link', attrs: { href: p.url, target: '_blank', rel: 'noopener noreferrer nofollow' } }]) : text(p.title)
    content.push(
      { type: 'heading', attrs: { level: 3 }, content: [...text(`${idx + 1}. `), ...titleNode] },
      para([p.origin, fmtDateTime(p.date, lang), name.media(p.media), name.lang(p.lang), p.category && name.cat(p.category), p.tone && t.tone[p.tone]].filter(Boolean).join(' · '), null, [
        { type: 'textStyle', attrs: { color: '#6b7a90', fontSize: '13px' } },
      ]),
      para(p.summary || t.noSummary),
    )
    if (ai?.posts?.[p.id]) content.push(para(`${t.analysis} (✦ AI): ${ai.posts[p.id]}`, null, [{ type: 'italic' }, { type: 'textStyle', attrs: { color: '#7c3aed' } }]))
  })
  if (posts.length > DOC_POSTS) content.push(note(t.more(posts.length - DOC_POSTS)))
  // 7. Constats et recommandations
  content.push(heading(2, t.h.findings))
  if (ai && (ai.findings.length || ai.recommendations.length)) {
    content.push(para(`✦ ${t.aiLabel}`, null, [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#7c3aed' } }]))
    if (ai.findings.length) content.push(heading(3, t.h.findingsSub), bullets(ai.findings))
    if (ai.recommendations.length) content.push(heading(3, t.h.recoSub), bullets(ai.recommendations))
  } else content.push(aiBlock(t, ''))
  // 8. Conclusion
  content.push(heading(2, t.h.conclusion), aiBlock(t, ai?.conclusion))
  // 9. Références
  const refs = posts.filter((p) => p.url)
  if (refs.length)
    content.push(heading(2, t.h.refs), {
      type: 'orderedList',
      attrs: { start: 1 },
      content: refs.map((p) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [...text(`${p.origin} — `), ...text(p.title || p.url, [{ type: 'link', attrs: { href: p.url, target: '_blank', rel: 'noopener noreferrer nofollow' } }])] }],
      })),
    })
  return { type: 'doc', content }
}

/* ---------------------------------------------------------------- nettoyage du document enregistré */

const NODES = new Set(['doc', 'paragraph', 'heading', 'text', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'horizontalRule', 'hardBreak', 'image', 'table', 'tableRow', 'tableHeader', 'tableCell', 'pageBreak', 'codeBlock'])
const MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'link', 'textStyle', 'code', 'highlight'])
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i
const SIZE_RE = /^\d{1,3}(\.\d+)?(px|pt|em|rem)$/
const ALIGN = new Set(['left', 'right', 'center', 'justify'])

/** Adresse d'image permise : logo du compte, logo de MMS, ou image intégrée png/jpeg/webp/gif */
export function safeImageSrc(src) {
  const s = String(src || '')
  if (/^\/api\/reports\/logo(\?v=\d{1,15})?$/.test(s) || s === '/logo-npdc.png') return s
  if (/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(s) && s.length < 1_500_000) return s
  return null
}
export function safeHref(href) {
  const s = String(href || '').trim()
  return /^(https?:\/\/|mailto:)[^\s"'<>]+$/i.test(s) && s.length < 2000 ? s : null
}

/**
 * Document TipTap venu du navigateur : types de nœuds et de marques connus, attributs vérifiés un par un
 * (liens http/https/mailto seulement, images du compte ou intégrées, couleurs et tailles de police valides).
 * Tout le reste est retiré ; null si le document n'en est pas un.
 */
export function sanitizeDoc(doc) {
  let budget = 200_000 // nœuds
  function attrsOf(type, a = {}) {
    const out = {}
    if ((type === 'paragraph' || type === 'heading') && ALIGN.has(a.textAlign)) out.textAlign = a.textAlign
    if (type === 'heading') out.level = Math.min(Math.max(Number(a.level) || 2, 1), 4)
    if (type === 'orderedList') out.start = Math.min(Math.max(Number(a.start) || 1, 1), 100000)
    if (type === 'image') {
      out.src = safeImageSrc(a.src)
      if (!out.src) return null
      out.alt = String(a.alt || '').slice(0, 200)
      out.title = a.title ? String(a.title).slice(0, 200) : null
      if (Number(a.width) > 0) out.width = Math.min(Math.round(Number(a.width)), 2000)
      if (Number(a.height) > 0) out.height = Math.min(Math.round(Number(a.height)), 3000)
    }
    if (type === 'tableCell' || type === 'tableHeader') {
      if (a.colspan !== undefined) out.colspan = Math.min(Math.max(Number(a.colspan) || 1, 1), 50)
      if (a.rowspan !== undefined) out.rowspan = Math.min(Math.max(Number(a.rowspan) || 1, 1), 500)
      if (Array.isArray(a.colwidth)) out.colwidth = a.colwidth.slice(0, 50).map((w) => Math.min(Math.max(Number(w) || 0, 0), 3000))
    }
    return out
  }
  function markOf(m) {
    if (!m || !MARKS.has(m.type)) return null
    if (m.type === 'link') {
      const href = safeHref(m.attrs?.href)
      return href ? { type: 'link', attrs: { href, target: '_blank', rel: 'noopener noreferrer nofollow' } } : null
    }
    if (m.type === 'textStyle') {
      const attrs = {}
      if (COLOR_RE.test(String(m.attrs?.color || ''))) attrs.color = m.attrs.color
      if (SIZE_RE.test(String(m.attrs?.fontSize || ''))) attrs.fontSize = m.attrs.fontSize
      return Object.keys(attrs).length ? { type: 'textStyle', attrs } : null
    }
    if (m.type === 'highlight') return COLOR_RE.test(String(m.attrs?.color || '')) ? { type: 'highlight', attrs: { color: m.attrs.color } } : { type: 'highlight' }
    return { type: m.type }
  }
  function walk(node, depth) {
    if (!node || typeof node !== 'object' || !NODES.has(node.type) || depth > 40 || --budget < 0) return null
    if (node.type === 'text') {
      const value = typeof node.text === 'string' ? node.text.slice(0, 20000) : ''
      if (!value) return null
      const marks = (Array.isArray(node.marks) ? node.marks : []).map(markOf).filter(Boolean)
      return { type: 'text', text: value, ...(marks.length ? { marks } : {}) }
    }
    const attrs = attrsOf(node.type, node.attrs && typeof node.attrs === 'object' ? node.attrs : {})
    if (!attrs) return null
    const out = { type: node.type }
    if (Object.keys(attrs).length) out.attrs = attrs
    if (Array.isArray(node.content)) {
      const content = node.content.map((c) => walk(c, depth + 1)).filter(Boolean)
      if (content.length) out.content = content
    }
    return out
  }
  if (!doc || doc.type !== 'doc') return null
  return walk(doc, 0) || { type: 'doc', content: [] }
}

const META_KEYS = ['org', 'author', 'header', 'footer', 'subject', 'keywords']
export function cleanMeta(meta = {}) {
  const out = {}
  for (const k of META_KEYS) out[k] = String(meta?.[k] ?? '').slice(0, 300)
  out.pageNumbers = meta?.pageNumbers !== false
  out.orientation = meta?.orientation === 'landscape' ? 'landscape' : 'portrait'
  out.margin = ['narrow', 'normal', 'wide'].includes(meta?.margin) ? meta.margin : 'normal'
  out.lang = meta?.lang === 'en' ? 'en' : 'ar'
  out.logo = safeImageSrc(meta?.logo) || ''
  return out
}

/* ---------------------------------------------------------------- stockage par compte */

let dir = ''
const owner = (email) => crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 32)
const fileOf = (email) => path.join(dir, `${owner(email)}.json`)

function readAll(email) {
  try {
    const data = JSON.parse(fs.readFileSync(fileOf(email), 'utf8'))
    return Array.isArray(data.reports) ? data.reports : []
  } catch {
    return []
  }
}
function writeAll(email, reports) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const file = fileOf(email)
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ owner: String(email).toLowerCase(), reports }), { mode: 0o600 })
  fs.renameSync(tmp, file)
}
const summaryOf = (r) => ({ id: r.id, title: r.title, createdAt: r.createdAt, updatedAt: r.updatedAt, posts: r.postIds.length, lang: r.meta.lang, sent: r.history.filter((h) => h.status === 'sent').length })

function logoFile(email) {
  for (const ext of ['png', 'jpg', 'webp']) {
    const f = path.join(dir, 'logos', `${owner(email)}.${ext}`)
    if (fs.existsSync(f)) return { file: f, ext }
  }
  return null
}

/** Type réel d'une image d'après ses premiers octets (le nom ou le type annoncé ne suffisent pas) */
export function imageKind(buf) {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp'
  return ''
}

/** Pièce jointe produite par le navigateur : vrai PDF ou vrai DOCX (archive ZIP), sinon '' */
export function attachmentKind(buf, format) {
  if (format === 'pdf') return buf.subarray(0, 5).toString() === '%PDF-' ? 'pdf' : ''
  if (format === 'docx') return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04 ? 'docx' : ''
  return ''
}

export function parseRecipients(value) {
  const list = (Array.isArray(value) ? value : String(value || '').split(/[,;\s]+/)).map((s) => String(s).trim()).filter(Boolean)
  const uniq = [...new Set(list.map((s) => s.toLowerCase()))]
  if (!uniq.length || uniq.length > 20 || uniq.some((s) => !EMAIL_RE.test(s) || s.length > 200)) return null
  return uniq
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/* ---------------------------------------------------------------- routes */

export function mountReports(app, dataDir, { getItems, aiEnabled, aiRun, sendMail, displayName, logDispatch: logDispatchFn = () => {} }) {
  dir = path.join(dataDir, 'reports')
  const gens = new Map() // compte → dates des générations
  const mails = new Map() // compte → dates des envois
  const json = (limit) => express.json({ limit })

  app.get('/api/reports', (req, res) => res.json({ reports: readAll(req.user.email).map(summaryOf), mail: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS), ai: aiEnabled() }))

  /* Logo de l'organisation, propre au compte */
  app.get('/api/reports/logo', (req, res) => {
    const found = logoFile(req.user.email)
    if (!found) return res.status(404).json({ error: 'NO_LOGO' })
    res.setHeader('Content-Type', { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[found.ext])
    res.setHeader('Cache-Control', 'private, max-age=60')
    res.sendFile(found.file)
  })
  app.put('/api/reports/logo', json('1500kb'), (req, res) => {
    const m = /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=]+)$/i.exec(String(req.body?.data || ''))
    if (!m) return res.status(400).json({ error: 'LOGO_TYPE' })
    const buf = Buffer.from(m[2], 'base64')
    if (buf.length > LOGO_MAX) return res.status(413).json({ error: 'LOGO_SIZE' })
    const kind = imageKind(buf)
    if (!kind) return res.status(400).json({ error: 'LOGO_TYPE' })
    fs.mkdirSync(path.join(dir, 'logos'), { recursive: true, mode: 0o700 })
    for (const ext of ['png', 'jpg', 'webp']) fs.rmSync(path.join(dir, 'logos', `${owner(req.user.email)}.${ext}`), { force: true })
    fs.writeFileSync(path.join(dir, 'logos', `${owner(req.user.email)}.${kind}`), buf, { mode: 0o600 })
    res.json({ logo: `/api/reports/logo?v=${Date.now()}` })
  })
  app.delete('/api/reports/logo', (req, res) => {
    for (const ext of ['png', 'jpg', 'webp']) fs.rmSync(path.join(dir, 'logos', `${owner(req.user.email)}.${ext}`), { force: true })
    res.json({ ok: true })
  })

  /* Génération : publications sélectionnées seulement */
  app.post('/api/reports/generate', json('64kb'), async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, MAX_POSTS + 1) : []
    if (!ids.length) return res.status(400).json({ error: 'NO_SELECTION' })
    if (ids.length > MAX_POSTS) return res.status(400).json({ error: 'TOO_MANY', max: MAX_POSTS })
    const now = Date.now()
    const recent = (gens.get(req.user.email) || []).filter((t) => now - t < 3600_000)
    if (recent.length >= GEN_QUOTA) return res.status(429).json({ error: 'BUSY', quota: GEN_QUOTA })
    recent.push(now)
    gens.set(req.user.email, recent)

    const cache = getItems()
    // Publications et commentaires visibles de MMS : une fiche masquée ou inconnue n'entre jamais dans le rapport
    const byId = new Map(cache.byId)
    for (const c of cache.comments || []) byId.set(c.id, c)
    const { items, missing } = pickSelected(ids, byId)
    if (!items.length) return res.status(404).json({ error: 'NOT_FOUND', missing: missing.length })
    const posts = items.map(snapshot)
    const stats = reportStats(posts)
    const lang = req.body?.lang === 'en' ? 'en' : 'ar'
    const t = labels(lang)
    let ai = null
    let aiError = ''
    if (aiEnabled()) {
      try {
        const key = `report|${lang}|${posts.map((p) => p.id).join(',')}|${cache.lastUpdate}|${req.body?.regen ? now : ''}`
        ai = cleanAi(await aiRun(key, reportPrompt(posts, stats, lang), REPORT_SPEC), posts)
      } catch (err) {
        console.error('Rapport, IA :', err.message)
        aiError = 'AI_FAILED'
      }
    } else aiError = 'AI_OFF'
    const logo = logoFile(req.user.email) ? `/api/reports/logo?v=${now}` : '/logo-npdc.png'
    const title = String(req.body?.title || '').trim().slice(0, 200) || `${t.title} — ${fmtDate(new Date(now).toISOString(), lang)}`
    const meta = cleanMeta({
      org: String(req.body?.org || '').trim() || t.org,
      author: displayName ? displayName(req.user) : req.user.name || req.user.email,
      header: t.header,
      footer: t.footer,
      pageNumbers: true,
      lang,
      logo,
    })
    const doc = buildDoc({ lang, title, org: meta.org, author: meta.author, logo, posts, stats, ai, generatedAt: new Date(now).toISOString() })
    const report = {
      id: `r_${crypto.randomBytes(8).toString('hex')}`,
      title,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      postIds: posts.map((p) => p.id),
      posts,
      stats,
      ai: Boolean(ai),
      meta,
      doc,
      history: [{ at: new Date(now).toISOString(), status: 'generated', posts: posts.length }],
    }
    const all = [report, ...readAll(req.user.email)].slice(0, MAX_REPORTS)
    writeAll(req.user.email, all)
    res.status(201).json({ report, missing: missing.length, aiError })
  })

  const find = (req, res) => {
    if (!ID_RE.test(req.params.id)) {
      res.status(404).json({ error: 'NOT_FOUND' })
      return null
    }
    const all = readAll(req.user.email)
    const report = all.find((r) => r.id === req.params.id)
    if (!report) res.status(404).json({ error: 'NOT_FOUND' })
    return report ? { all, report } : null
  }

  app.get('/api/reports/:id', (req, res) => {
    const found = find(req, res)
    if (found) res.json({ report: found.report })
  })

  /* Enregistrement depuis l'éditeur (titre, document, réglages de page) */
  app.put('/api/reports/:id', json('4mb'), (req, res) => {
    const found = find(req, res)
    if (!found) return
    const { all, report } = found
    if (req.body?.title !== undefined) report.title = String(req.body.title).trim().slice(0, 200) || report.title
    if (req.body?.doc !== undefined) {
      const doc = sanitizeDoc(req.body.doc)
      if (!doc) return res.status(400).json({ error: 'INVALID' })
      if (JSON.stringify(doc).length > MAX_DOC) return res.status(413).json({ error: 'TOO_LARGE' })
      report.doc = doc
    }
    if (req.body?.meta !== undefined) report.meta = cleanMeta({ ...report.meta, ...req.body.meta })
    report.updatedAt = new Date().toISOString()
    writeAll(req.user.email, all)
    res.json({ report: summaryOf(report), updatedAt: report.updatedAt })
  })

  app.post('/api/reports/:id/duplicate', (req, res) => {
    const found = find(req, res)
    if (!found) return
    const copy = structuredClone(found.report)
    copy.id = `r_${crypto.randomBytes(8).toString('hex')}`
    copy.title = `${found.report.title} (2)`.slice(0, 200)
    copy.createdAt = copy.updatedAt = new Date().toISOString()
    copy.history = [{ at: copy.createdAt, status: 'duplicated', from: found.report.id }]
    writeAll(req.user.email, [copy, ...found.all].slice(0, MAX_REPORTS))
    res.status(201).json({ report: summaryOf(copy) })
  })

  app.delete('/api/reports/:id', (req, res) => {
    const found = find(req, res)
    if (!found) return
    writeAll(
      req.user.email,
      found.all.filter((r) => r.id !== found.report.id),
    )
    res.json({ ok: true })
  })

  /* Envoi par e-mail : la pièce jointe (PDF ou DOCX produit dans le navigateur) part par le SMTP de MMS */
  app.post('/api/reports/:id/email', json('18mb'), async (req, res) => {
    const found = find(req, res)
    if (!found) return
    const { all, report } = found
    const to = parseRecipients(req.body?.to)
    if (!to) return res.status(400).json({ error: 'RECIPIENTS' })
    const now = Date.now()
    const sent = (mails.get(req.user.email) || []).filter((t) => now - t < 3600_000)
    if (sent.length >= MAIL_QUOTA) return res.status(429).json({ error: 'BUSY', quota: MAIL_QUOTA })
    sent.push(now)
    mails.set(req.user.email, sent)
    const format = req.body?.format === 'docx' ? 'docx' : 'pdf'
    const buf = Buffer.from(String(req.body?.file || ''), 'base64')
    if (!buf.length || buf.length > ATTACH_MAX) return res.status(413).json({ error: 'ATTACHMENT_SIZE' })
    if (!attachmentKind(buf, format)) return res.status(400).json({ error: 'ATTACHMENT_TYPE' })
    const base = String(req.body?.filename || 'MMS_Media_Analysis_Report')
      .replace(/\.(pdf|docx)$/i, '')
      .replace(/[^\w.-]+/g, '_')
      .slice(0, 100)
    const subject = String(req.body?.subject || report.title)
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 250)
    const message = String(req.body?.message || '').slice(0, 5000)
    const rtl = report.meta.lang !== 'en'
    const entry = { at: new Date().toISOString(), status: 'failed', to, format, by: req.user.email }
    try {
      const info = await sendMail(to, {
        subject,
        text: message,
        html: `<div dir="${rtl ? 'rtl' : 'ltr'}" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7;white-space:pre-wrap">${esc(message)}</div>`,
        attachments: [
          {
            filename: `${base}.${format}`,
            content: buf,
            contentType: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
        ],
      })
      // Succès seulement si le serveur SMTP a accepté au moins un destinataire
      const accepted = (info?.accepted || []).map(String)
      const rejected = (info?.rejected || []).map(String)
      if (!accepted.length) throw Object.assign(new Error('rejected'), { code: 'REJECTED' })
      entry.status = 'sent'
      entry.accepted = accepted
      entry.rejected = rejected
      entry.messageId = String(info.messageId || '').slice(0, 200)
      logDispatchFn({ kind: 'report', name: report.title || report.id, channels: ['email'], recipients: accepted.length, by: req.user.email })
      report.history = [entry, ...report.history].slice(0, 100)
      writeAll(req.user.email, all)
      res.json({ ok: true, accepted, rejected, history: report.history })
    } catch (err) {
      entry.error = err.code === 'smtp_missing' ? 'SMTP_MISSING' : err.code === 'REJECTED' ? 'REJECTED' : err.code === 'DOMAIN_BLOCKED' ? 'DOMAIN_BLOCKED' : 'SMTP_ERROR'
      console.error(`Rapport ${report.id}, envoi : ${err.message}`)
      report.history = [entry, ...report.history].slice(0, 100)
      writeAll(req.user.email, all)
      res.status(502).json({ error: entry.error, history: report.history })
    }
  })
}
