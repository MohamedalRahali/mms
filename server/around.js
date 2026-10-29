import { compileQuery, searchText } from './query.js'
import { normalize } from './watches.js'
import { countList } from './intel.js'
import { engagementTotals, interactions, retrieve, toDay } from './insights.js'

/**
 * Around, l'assistant IA de MMS (sur le modèle de Meltwater Mira Studio) :
 * réponses structurées et sourcées, suggestions de relance, et agents multi-étapes
 * (rapport de couverture, brief média, impact d'un communiqué, revue sectorielle).
 * Les chiffres sont calculés ici ; l'IA ne rédige que le texte, à partir de ces chiffres et des actualités numérotées.
 */

const DAY_MS = 86_400_000

/* ---------------------------------------------------------------- réponse libre */

export const ASK_SPEC = {
  system: `Tu es Around, l'assistant IA de la plateforme MMS (veille des médias et réseaux sociaux libyens).
On te donne une question et des actualités numérotées [1], [2]… tirées de la base de MMS.
Réponds dans la langue de la question (arabe standard si la question est en arabe), de façon claire, structurée et factuelle.
- titre : un titre court (3 à 8 mots) pour la conversation ;
- reponse : la réponse en Markdown simple. Pour un aperçu ou une liste d'actualités, fais une liste numérotée de sujets :
  « 1. **Titre du sujet** » puis une ligne « - Aperçu : … ». Sinon, des paragraphes courts, des listes « - »,
  des intertitres « ## » si la réponse est longue, et un tableau Markdown seulement pour comparer des chiffres.
  Appuie chaque fait sur les actualités en citant leur numéro entre crochets à la fin de la phrase, par exemple [3] ou [2, 5] ;
- sources : les numéros des actualités citées ;
- suivis : 3 à 5 questions de relance utiles, courtes et précises, dans la langue de la question.
Si les actualités ne permettent pas de répondre, dis-le simplement. N'invente rien.`,
  schema: {
    type: 'object',
    properties: {
      titre: { type: 'string' },
      reponse: { type: 'string' },
      sources: { type: 'array', items: { type: 'integer' } },
      suivis: { type: 'array', items: { type: 'string' } },
    },
    required: ['titre', 'reponse', 'sources', 'suivis'],
    additionalProperties: false,
  },
  format: 'Réponds uniquement par un objet JSON de la forme {"titre": "...", "reponse": "...", "sources": [1, 2], "suivis": ["...", "..."]}',
  valid: (d) => typeof d.reponse === 'string' && Array.isArray(d.sources),
  name: 'around',
}

export function askPrompt({ question, items, history, scope }) {
  const lines = items.map((it, k) => `[${k + 1}] ${it.date.slice(0, 16)} · ${it.origin} · ${it.title} — ${it.summary}`).join('\n')
  const past = history
    .slice(-4)
    .map((h) => `Question : ${h.q}\nRéponse : ${h.a}`)
    .join('\n\n')
  return `${past ? `Échanges précédents :\n${past}\n\n` : ''}Date du jour : ${new Date().toISOString().slice(0, 10)}\nPérimètre : ${scope}\nQuestion : ${question}\n\nActualités :\n${lines}`
}

/* ---------------------------------------------------------------- agents */

const AGENT_TASKS = {
  coverage: `Agent « rapport de couverture ». Rédige un rapport de couverture médiatique complet, prêt à présenter :
sections attendues (dans cet ordre) : « Vue d'ensemble », « Thèmes et récits clés » (une section par grand récit, 2 à 4),
« Analyse des sources et des réseaux », « Pics détectés » (explique chaque pic signalé dans les chiffres, s'il y en a),
« Tonalité ». Termine par des recommandations de communication.`,
  brief: `Agent « brief média ». Prépare un dirigeant à une interview ou une prise de parole sur le sujet :
sections attendues : « Contexte », « Ce que disent les médias », « Journalistes et médias les plus actifs »,
« Messages clés à porter », « Questions probables des journalistes », « Points sensibles ». Les recommandations sont des conseils de prise de parole.`,
  release: `Agent « impact d'un communiqué ». Mesure la reprise d'un communiqué ou d'une annonce dans les médias et les réseaux :
sections attendues : « Reprise du communiqué » (qui a repris, quand, à quel rythme), « Messages repris ou déformés »,
« Médias et réseaux », « Tonalité et réactions ». Les recommandations portent sur la suite à donner.`,
  roundup: `Agent « revue sectorielle ». Fais la revue de l'actualité d'un secteur ou d'un thème :
sections attendues : « À retenir », « Principales actualités », « Acteurs en vue », « Tendances et signaux faibles ».
Les recommandations sont les sujets à suivre.`,
}

// Types d'analyse (demande du client, 29/10) : chacun sa logique et ses sections, toujours appuyés sur les actualités
// fournies (citées par numéro), les chiffres de MMS (actualités sans doublons) et rien d'autre
const ANALYSIS_TASKS = {
  overview: `Analyse « نظرة عامة » (vue d'ensemble). Sections : « الصورة العامة » (volume, rythme, sources, tonalité), « أبرز المواضيع », « الفاعلون الرئيسيون », « ما تغيّر مقارنة بالفترة السابقة ». Recommandations : recommandations stratégiques pour la communication du client.`,
  crisis: `Analyse « أزمة » (détection de crise). Sections : « مؤشرات الأزمة » (signaux : hausse soudaine, tonalité négative, reprise par de nombreuses sources, mots alarmants), « درجة الخطورة » (faible / moyenne / élevée, justifiée par les chiffres), « مصادر الاشتعال » (actualités et sources qui déclenchent), « المسار المتوقع ». S'il n'y a pas de signe de crise, dis-le clairement avec les chiffres. Recommandations : actions immédiates de gestion de crise.`,
  media: `Analyse « الوسائل الإعلامية » (rôle et visibilité de chaque média). Sections : « أكثر الوسائل نشاطاً » (avec nombres), « نبرة كل وسيلة », « ما تركّز عليه كل وسيلة », « الوسائل المؤثرة والانتشار ». Recommandations : médias à cibler ou à suivre.`,
  topics: `Analyse « المواضيع ». Sections : une section par grand sujet (3 à 6), avec son poids (nombre d'actualités), sa tonalité et les sources qui le portent ; puis « مواضيع صاعدة ». Recommandations : sujets à suivre ou à investir.`,
  narratives: `Analyse « السرديات والمشاعر » (récits et émotions). Sections : « السرديات الرئيسية » (comment les médias racontent le sujet, 2 à 4 récits), « المشاعر الغالبة » (colère, inquiétude, espoir, satisfaction… appuyées sur les actualités), « السرديات المتعارضة ». Recommandations : récits à porter ou à corriger.`,
  audiences: `Analyse « الفئات المستهدفة ». Sections : « الفئات المعنية » (citoyens, institutions, secteurs, régions… cités dans les actualités), « ما يهم كل فئة », « القنوات التي تصل إليها ». Recommandations : messages par catégorie de public.`,
  swot: `Analyse « SWOT » de l'image médiatique du sujet. Sections exactement : « نقاط القوة », « نقاط الضعف », « الفرص », « التهديدات », chacune appuyée sur des actualités citées. Recommandations : actions qui exploitent les forces et réduisent les menaces.`,
  esg: `Analyse « ESG » (البيئة والمجتمع والحوكمة). Sections : « البيئة », « المجتمع », « الحوكمة », chacune avec les actualités qui s'y rapportent ; si une dimension n'apparaît pas dans les données, dis-le. Recommandations : points de vigilance ESG.`,
  reputation: `Analyse « السمعة ». Sections : « صورة الجهة في الإعلام » (tonalité, volume), « عوامل تحسين السمعة », « عوامل الإضرار بالسمعة », « من يؤثر في السمعة » (médias et acteurs). Recommandations : actions pour protéger ou améliorer la réputation.`,
  benchmark: `Analyse « مقارنة » (benchmark). Compare les principaux acteurs ou institutions cités (ou les deux périodes si un seul acteur domine). Sections : « حجم الحضور » (chiffres par acteur), « النبرة لكل طرف », « المواضيع المرتبطة بكل طرف », « الخلاصة ». Recommandations : positionnement par rapport aux autres.`,
  touchpoints: `Analyse « نقاط التواصل » (points de contact médiatiques). Sections : « القنوات » (sites, télévision, radio, réseaux sociaux : part et rôle), « التوقيت » (jours et moments de forte présence), « الوسائط الأكثر تفاعلاً ». Recommandations : où et quand communiquer.`,
  bias: `Analyse « التحيّز السياسي » (biais par source). Sections : « اتجاهات المصادر » (pour chaque source importante : orientation perçue d'après sa tonalité et ses choix de sujets, prudemment), « التوازن في التغطية », « المصادر الأكثر انحيازاً ». Reste factuel, sans jugement personnel ; appuie-toi sur la tonalité et les sujets observés. Recommandations : comment équilibrer la veille.`,
  framing: `Analyse « التأطير » (framing). Sections : « الأطر المستعملة » (sécurité, économie, légitimité, humanitaire, conflit…), « كيف يُؤطَّر الفاعلون », « اختلاف التأطير بين المصادر ». Recommandations : cadrage à privilégier dans la communication.`,
  summary: `Analyse « ملخص ». Un résumé clair et court de l'actualité du périmètre. Sections : « أهم الأخبار » (5 à 8 points), « في سطور ». Recommandations : 3 points à retenir.`,
  executive: `Analyse « ملخص تنفيذي » pour un décideur pressé. Sections : « الخلاصة في دقيقة », « الأرقام الأساسية », « ما يجب معرفته », « القرارات المطلوبة ». Phrases très courtes. Recommandations : décisions proposées.`,
  management: `Analyse « ملخص للإدارة » (rapport de gestion). Sections : « الوضع الحالي », « المخاطر », « الفرص », « الأولويات للأسبوع القادم ». Recommandations : priorités opérationnelles avec responsable suggéré (fonction, pas de nom inventé).`,
}
export const ANALYSES = Object.keys(ANALYSIS_TASKS)
Object.assign(AGENT_TASKS, ANALYSIS_TASKS)

export const AGENTS = Object.keys(AGENT_TASKS)

const agentSpec = (agent) => ({
  system: `Tu es Around, l'assistant IA de la plateforme MMS (veille des médias et réseaux sociaux libyens).
${AGENT_TASKS[agent]}
On te donne le sujet, des chiffres calculés par MMS et des actualités numérotées [1], [2]…
Rédige dans la langue demandée, ton neutre et factuel. Cite les actualités par leur numéro entre crochets à la fin des phrases, par exemple [4] ou [1, 7].
- titre : titre du rapport (sujet et période) ;
- resume : résumé exécutif de 3 à 5 phrases, chiffres à l'appui ;
- sections : les sections attendues, chacune avec un titre et 2 à 5 paragraphes ou points ;
- recommandations : 3 à 5 recommandations concrètes ;
- sources : numéros des actualités citées ;
- suivis : 3 à 5 questions de relance.
N'invente aucun fait ni aucun chiffre absent des données fournies.`,
  schema: {
    type: 'object',
    properties: {
      titre: { type: 'string' },
      resume: { type: 'string' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: { titre: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } },
          required: ['titre', 'points'],
          additionalProperties: false,
        },
      },
      recommandations: { type: 'array', items: { type: 'string' } },
      sources: { type: 'array', items: { type: 'integer' } },
      suivis: { type: 'array', items: { type: 'string' } },
    },
    required: ['titre', 'resume', 'sections', 'recommandations', 'sources', 'suivis'],
    additionalProperties: false,
  },
  format:
    'Réponds uniquement par un objet JSON de la forme {"titre": "...", "resume": "...", "sections": [{"titre": "...", "points": ["..."]}], "recommandations": ["..."], "sources": [1], "suivis": ["..."]}',
  valid: (d) => typeof d.resume === 'string' && Array.isArray(d.sections),
  name: `agent_${agent}`,
})

export const specFor = (agent) => agentSpec(AGENTS.includes(agent) ? agent : 'coverage')

const tonesOf = (items) => {
  const t = { positive: 0, neutral: 0, negative: 0 }
  for (const it of items) if (it.tone) t[it.tone]++
  return t
}

function counts(items, key, limit) {
  const map = new Map()
  for (const it of items) if (it[key]) map.set(it[key], (map.get(it[key]) || 0) + 1)
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

/** Fiches qui parlent du sujet : requête booléenne si elle compile, sinon recherche par mots */
function matchSubject(items, subject) {
  if (!subject) return items
  let match = null
  try {
    match = compileQuery(subject)
  } catch {
    match = null
  }
  const found = match ? items.filter((it) => match(searchText(it))) : []
  if (found.length) return found
  // Repli (phrase libre) : les fiches qui contiennent au moins la moitié des mots significatifs du sujet
  const words = [...new Set(normalize(subject).split(/[^\p{L}\p{N}]+/u))].filter((w) => w.length > 2 && !STOP.has(w))
  if (!words.length) return items
  const need = Math.max(1, Math.ceil(words.length / 2))
  return items.filter((it) => {
    const text = searchText(it)
    return words.filter((w) => text.includes(w)).length >= need
  })
}

const STOP = new Set(
  'the and for with what who how why when are was were from that this about over last report coverage give news من في على عن الى إلى ما ماذا هل كيف التي الذي هذا هذه ذلك مع او أو كل بين بعد قبل أن ان تقرير تغطية اخبار أخبار le la les des du de et en un une sur pour par avec que qui dans au aux'.split(' '),
)

/** Chiffres de l'agent : période en cours contre la précédente, courbe par jour, pics, sources, lieux */
export function agentStats(pool, subject, days, now = Date.now()) {
  const all = matchSubject(pool, subject)
  const from = now - days * DAY_MS
  const cur = all.filter((it) => Date.parse(it.date) >= from)
  const prev = all.filter((it) => {
    const t = Date.parse(it.date)
    return t >= from - days * DAY_MS && t < from
  })
  const dates = []
  for (let i = days - 1; i >= 0; i--) dates.push(toDay(new Date(now - i * DAY_MS).toISOString()))
  const index = new Map(dates.map((d, i) => [d, i]))
  const perDay = dates.map(() => 0)
  for (const it of cur) {
    const i = index.get(toDay(it.date))
    if (i != null) perDay[i]++
  }
  // Pics : jours au-dessus de la moyenne + 2 écarts-types (et au moins 3 fiches)
  const mean = perDay.reduce((a, b) => a + b, 0) / (perDay.length || 1)
  const sd = Math.sqrt(perDay.reduce((a, b) => a + (b - mean) ** 2, 0) / (perDay.length || 1))
  const spikes = perDay
    .map((count, i) => ({ day: dates[i], count }))
    .filter((d) => d.count >= 3 && d.count > mean + 2 * sd)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((d) => {
      const items = cur.filter((it) => toDay(it.date) === d.day)
      return { ...d, sources: counts(items, 'origin', 3), top: items.sort((a, b) => interactions(b) - interactions(a))[0]?.title || '' }
    })
  // Sentiment géographique : tonalité par lieu cité
  const places = countList(cur, 'places', 8).map((p) => ({ ...p, tones: tonesOf(cur.filter((it) => (it.places || []).includes(p.name))) }))
  const side = (items) => ({
    total: items.length,
    perDay: Math.round((items.length / days) * 10) / 10,
    sources: new Set(items.map((it) => it.origin)).size,
    tones: tonesOf(items),
    engagement: engagementTotals(items),
  })
  return {
    days,
    from: new Date(from).toISOString(),
    to: new Date(now).toISOString(),
    prevFrom: new Date(from - days * DAY_MS).toISOString(),
    current: side(cur),
    previous: side(prev),
    dates,
    perDay,
    spikes,
    sources: counts(cur, 'origin', 8),
    channels: counts(cur, 'channel', 6),
    people: countList(cur, 'people', 8),
    orgs: countList(cur, 'orgs', 8),
    places,
    items: cur,
  }
}

/** Les chiffres, en texte, pour l'IA */
export function agentFacts(s, subject, scope, lang) {
  const row = (r) => `${r.name} (${r.count})`
  const t = s.current.tones
  const tp = s.previous.tones
  return [
    `Sujet : ${subject || 'toute l\'actualité du périmètre'}. Périmètre : ${scope}. Langue de rédaction : ${lang === 'en' ? 'anglais' : 'arabe standard'}.`,
    `Période : ${s.from.slice(0, 10)} au ${s.to.slice(0, 10)} (${s.days} jours). Période précédente : ${s.prevFrom.slice(0, 10)} au ${s.from.slice(0, 10)}.`,
    `Volume : ${s.current.total} actualités (période précédente : ${s.previous.total}), ${s.current.perDay} par jour, ${s.current.sources} sources.`,
    `Tonalité : positif ${t.positive}, neutre ${t.neutral}, négatif ${t.negative} (avant : ${tp.positive} / ${tp.neutral} / ${tp.negative}).`,
    `Engagement des posts : ${s.current.engagement.reactions} réactions, ${s.current.engagement.shares} partages, ${s.current.engagement.comments} commentaires, ${s.current.engagement.views} vues.`,
    s.sources.length ? `Sources principales : ${s.sources.map(row).join(' ; ')}.` : '',
    s.channels.length ? `Canaux : ${s.channels.map(row).join(' ; ')}.` : '',
    s.people.length ? `Personnalités : ${s.people.map(row).join(' ; ')}.` : '',
    s.orgs.length ? `Organisations : ${s.orgs.map(row).join(' ; ')}.` : '',
    s.places.length ? `Lieux (tonalité +/=/-) : ${s.places.map((p) => `${p.name} (${p.count} : ${p.tones.positive}/${p.tones.neutral}/${p.tones.negative})`).join(' ; ')}.` : '',
    s.spikes.length
      ? `Pics détectés : ${s.spikes.map((p) => `${p.day} : ${p.count} actualités (sources : ${p.sources.map((x) => x.name).join(', ')} ; principale : ${p.top})`).join(' | ')}.`
      : 'Aucun pic marqué sur la période.',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Actualités envoyées à l'IA : les plus marquantes, puis celles des jours de pic */
export function agentItems(s, subject, limit = 70) {
  const ranked = (subject ? retrieve(s.items, subject, limit) : [...s.items]).sort(
    (a, b) => (b.importance || 1) - (a.importance || 1) || interactions(b) - interactions(a) || b.date.localeCompare(a.date),
  )
  const picked = ranked.slice(0, limit)
  const seen = new Set(picked)
  for (const sp of s.spikes)
    for (const it of s.items.filter((x) => toDay(x.date) === sp.day).slice(0, 5))
      if (!seen.has(it) && picked.length < limit + 10) {
        seen.add(it)
        picked.push(it)
      }
  return picked
}

export const itemLines = (items) => items.map((it, k) => `[${k + 1}] ${it.date.slice(0, 16)} · ${it.origin} · ${it.title} — ${it.summary}`).join('\n')

/** Fiche source renvoyée au navigateur (carte d'article) */
export const sourceCard = (it, n) => ({
  n,
  id: it.id,
  title: it.title,
  summary: String(it.summary || '').slice(0, 280),
  origin: it.origin,
  date: it.date,
  url: it.url,
  image: it.image || '',
  tone: it.tone || '',
  channel: it.channel,
})
