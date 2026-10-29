import fs from 'node:fs'
import path from 'node:path'
import { normalize } from './watches.js'
import { findSpikes, spikeItems } from './intel.js'
import { libyaRelevant, lookup } from './entities.js'

/**
 * « Radar intelligent » de MMS : ce que la veille fait remonter sans qu'on ait à le chercher.
 *
 * - sujets émergents : mots et expressions dont la fréquence explose sur la dernière fenêtre
 *   (6, 24 ou 72 h) par rapport à la moyenne des 7 jours d'avant, cités par au moins 2 sources ;
 * - histoires : regroupement des fiches qui racontent le même événement (titres proches), pour voir
 *   combien de médias reprennent une information et qui l'a publiée en premier ;
 * - baromètre du sentiment : indice net (positif − négatif) par jour, par acteur et par source, avec une
 *   tonalité déduite d'un lexique arabe / français / anglais quand la veille n'en fournit pas ;
 * - alertes intelligentes : pics, sujets nouveaux, montée du négatif autour d'un acteur, histoire reprise
 *   par beaucoup de sources, classées par gravité.
 *
 * Tout est calculé en mémoire sur les fiches déjà chargées, sans appel à une IA : c'est instantané et gratuit.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR

/* ---------------------------------------------------------------- mots */

// Mots vides, déjà normalisés (ة → ه, ى → ي, alef sans hamza)
const STOP = new Set(
  (
    // arabe
    'في من على الي الى عن مع او ان انه انها ما لا لم لن قد كان كانت يكون تكون هذا هذه ذلك تلك هو هي هم هن نحن ' +
    'التي الذي الذين اللذين بين بعد قبل خلال حول عند منذ حتي ثم كل بعض غير اي ايضا كما وقد فقد وان وفي ومن وعلي ' +
    'الا اذا اذ لدي لقد اما ام بل حيث عبر ضد دون فيه فيها منه منها عليه عليها اليه لها له لهم به بها وهو وهي ' +
    'يوم اليوم امس غدا الان سنه العام عام شهر الشهر الماضي المقبل الجاري جديد جديده اول الاول ' +
    'قال قالت اكد اكدت اعلن اعلنت افاد افادت اضاف اضافت وفق حسب بحسب نحو اكثر اقل عده عدد ' +
    'تم يتم تمت سيتم وذلك وهذا وهذه وكان وكانت لكن ولكن وفيما فيما بينما وسط اطار ضمن جانب ' +
    // français
    'le la les un une des du de d l et ou en au aux a à ce cet cette ces se sa son ses sur dans par pour avec ' +
    'sans sous qui que quoi dont est sont été être a ont avait plus moins pas ne il elle ils elles on nous vous ' +
    'leur leurs lors après avant selon entre comme mais aussi tout tous très deux trois jour hier aujourd ' +
    // anglais
    'the a an of to in on at for by with from and or is are was were be been has have had it its this that ' +
    'these those as not but after before over under about into than new says said will would can could'
  ).split(/\s+/),
)

// Préfixes et suffixes arabes retirés pour rapprocher « النفط », « والنفط », « بالنفط »
const PREFIXES = ['وال', 'بال', 'كال', 'فال', 'لل', 'ال']
const SUFFIXES = ['ات', 'ون', 'ين', 'ان', 'ها', 'هم', 'يه']

/** Racine légère d'un mot déjà normalisé : arabe dépouillé de l'article et des pluriels, latin tel quel */
export function stem(word) {
  let w = word
  if (/[؀-ۿ]/.test(w)) {
    for (const p of PREFIXES)
      if (w.startsWith(p) && w.length - p.length >= 3) {
        w = w.slice(p.length)
        break
      }
    if (w.length >= 5 && (w[0] === 'و' || w[0] === 'ف' || w[0] === 'ب') && !PREFIXES.some((p) => word.startsWith(p))) {
      // « وطرابلس » → « طرابلس », mais seulement si le reste est assez long pour ne pas abîmer le mot
      w = w.slice(1)
    }
    for (const s of SUFFIXES)
      if (w.endsWith(s) && w.length - s.length >= 3) {
        w = w.slice(0, -s.length)
        break
      }
    if (w.length >= 4 && w.endsWith('ه')) w = w.slice(0, -1)
  } else if (w.length > 4 && w.endsWith('s')) w = w.slice(0, -1)
  return w
}

/** Mots utiles d'un texte : [{ s: racine, w: forme lisible (sans diacritiques) }] */
export function words(text) {
  const out = []
  for (const raw of String(text || '').split(/[^\p{L}\p{M}\p{N}]+/u)) {
    const w = normalize(raw)
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue
    const s = stem(w)
    if (s.length < 3 || STOP.has(s)) continue
    out.push({ s, w: raw.replace(/[\u064b-\u065f\u0670\u0640]/g, '').toLowerCase() })
  }
  return out
}

/* ---------------------------------------------------------------- tonalité */

// Lexique court mais ciblé sur l'actualité libyenne (sécurité, économie, services publics)
const NEG = (
  'اشتباك اشتباكات قتل قتلي مقتل اغتيال هجوم تفجير انفجار قصف اختطاف خطف اعتقال احتجاز ازمه ازمات انقطاع ' +
  'نقص ارتفاع غلاء تضخم انهيار فساد احتجاج احتجاجات مظاهرات اغلاق اغلاقات توقف تعطل حريق فيضان كارثه ' +
  'ضحايا جرحي اصابات وفاه وفيات مخاوف تهديد تحذير ادانه يدين ادان رفض فشل خساره عجز طوابير شكاوي معاناه ' +
  'تهريب مهاجرين غرق عنف تصعيد توتر انسداد عرقله ' +
  'attaque attentat explosion affrontements morts tués crise pénurie coupure hausse inflation corruption ' +
  'manifestation grève fermeture blocage incendie inondation victimes blessés menace condamne échec ' +
  'attack clashes killed crisis shortage outage protest strike closure blockade fire flood victims threat ' +
  'corruption smuggling violence escalation tension'
).split(/\s+/)
const POS = (
  'اتفاق اتفاقيه توقيع افتتاح تدشين نجاح استئناف انفراج تحسن ارتفاع_الانتاج نمو دعم مساعدات تعاون شراكه ' +
  'مصالحه تهدئه وقف_اطلاق انتخابات استقرار تطوير اعمار اعاده_اعمار استثمار استثمارات انجاز تكريم فوز ' +
  'ترحيب يرحب رحب تبرع وصول_شحنه تخفيض انخفاض_الاسعار توفير صرف_المرتبات ' +
  'accord signature inauguration succès reprise amélioration croissance soutien aide coopération partenariat ' +
  'réconciliation stabilité investissement victoire salue ' +
  'agreement signed inauguration success resumed resumption improvement growth support aid cooperation ' +
  'partnership reconciliation stability investment victory welcomes'
)
  .split(/\s+/)
  .map((w) => w.replace(/_/g, ' '))

const NEG_STEMS = new Set(NEG.map((w) => stem(normalize(w))))
const POS_ONE = new Set(POS.filter((w) => !w.includes(' ')).map((w) => stem(normalize(w))))
const POS_MULTI = POS.filter((w) => w.includes(' ')).map((w) => normalize(w))

const toneCache = new WeakMap()
/** Tonalité de la fiche : celle de la veille si elle existe, sinon déduite du lexique ; inferred = déduite */
export function toneOf(it) {
  if (it.tone) return { tone: it.tone, inferred: false }
  let r = toneCache.get(it)
  if (!r) {
    const text = `${it.title} ${it.summary}`
    const ws = words(text)
    let neg = 0
    let pos = 0
    for (const { s } of ws) {
      if (NEG_STEMS.has(s)) neg++
      else if (POS_ONE.has(s)) pos++
    }
    const flat = normalize(text)
    for (const p of POS_MULTI) if (flat.includes(p)) pos++
    r = { tone: neg > pos ? 'negative' : pos > neg ? 'positive' : 'neutral', inferred: true }
    toneCache.set(it, r)
  }
  return r
}

const emptyTone = () => ({ positive: 0, neutral: 0, negative: 0 })
/** Indice net de −100 (tout négatif) à +100 (tout positif) */
const net = (t) => {
  const n = t.positive + t.neutral + t.negative
  return n ? Math.round(((t.positive - t.negative) / n) * 100) : 0
}

/* ---------------------------------------------------------------- sujets émergents */

const termsCache = new WeakMap()
/** Racines et expressions de deux mots d'une fiche, chacune une seule fois, avec leur forme lisible */
function termsOf(it) {
  let t = termsCache.get(it)
  if (!t) {
    const ws = words(`${it.title} ${it.title} ${it.summary}`)
    t = new Map()
    for (let k = 0; k < ws.length; k++) {
      if (!t.has(ws[k].s)) t.set(ws[k].s, ws[k].w)
      if (k + 1 < ws.length && ws[k].s !== ws[k + 1].s) {
        const key = `${ws[k].s} ${ws[k + 1].s}`
        if (!t.has(key)) t.set(key, `${ws[k].w} ${ws[k + 1].w}`)
      }
    }
    // Les entités repérées par la veille comptent comme des expressions entières
    for (const e of [...(it.people || []), ...(it.orgs || []), ...(it.places || [])]) {
      const key = `@${normalize(e)}`
      if (!t.has(key)) t.set(key, e)
    }
    termsCache.set(it, t)
  }
  return t
}

/**
 * Sujets dont la fréquence explose : documents de la fenêtre récente comparés à la moyenne par fenêtre
 * équivalente des 7 jours précédents. Un sujet doit apparaître dans au moins 3 fiches et 2 sources.
 */
export function emergingTopics(items, { hours = 24, now = Date.now(), limit = 15 } = {}) {
  const win = Math.min(Math.max(hours, 1), 168) * HOUR
  const baseSpan = 7 * DAY
  const slots = baseSpan / win
  const stats = new Map()
  for (const it of items) {
    const t = Date.parse(it.date)
    if (!(t <= now) || t < now - win - baseSpan) continue
    const recent = t >= now - win
    const day = Math.floor((now - t) / DAY)
    for (const [key, label] of termsOf(it)) {
      let s = stats.get(key)
      // Les termes vus seulement dans la période de référence (la grande majorité) restent de simples compteurs
      if (!s) stats.set(key, (s = { key, labels: null, recent: 0, base: 0, sources: null, docs: null, items: null, tone: null, hist: new Array(8).fill(0) }))
      if (day < 8) s.hist[7 - day]++
      if (recent) {
        if (!s.labels) Object.assign(s, { labels: new Map(), sources: new Set(), docs: new Set(), items: [], tone: emptyTone() })
        s.recent++
        s.sources.add(it.origin)
        s.docs.add(it)
        s.labels.set(label, (s.labels.get(label) || 0) + 1)
        s.tone[toneOf(it).tone]++
        if (s.items.length < 5) s.items.push(it)
      } else s.base++
    }
  }
  let found = []
  for (const s of stats.values()) {
    if (s.recent < 3 || s.sources.size < 2) continue
    const avg = s.base / slots
    const growth = (s.recent + 1) / (avg + 1)
    if (growth < 2) continue
    const entity = s.key.startsWith('@')
    const bigram = !entity && s.key.includes(' ')
    found.push({
      key: s.key,
      label: [...s.labels.entries()].sort((a, b) => b[1] - a[1])[0][0],
      kind: entity ? 'entity' : bigram ? 'phrase' : 'word',
      recent: s.recent,
      baseline: Math.round(avg * 10) / 10,
      growth: Math.round(growth * 10) / 10,
      isNew: s.base === 0,
      sources: s.sources.size,
      tone: s.tone,
      sentiment: net(s.tone),
      perDay: s.hist,
      score: s.recent * Math.log2(growth + 1) * (bigram || entity ? 1.4 : 1) * Math.min(s.sources.size, 6) ** 0.5,
      docs: s.docs,
      sample: s.items.map((it) => ({ id: it.id, title: it.title, origin: it.origin, date: it.date, url: it.url })),
    })
  }
  found.sort((a, b) => b.score - a.score)
  // Un mot ou une expression dont les fiches sont presque toutes déjà couvertes par un sujet retenu
  // (« الشرارة النفطي », « حالة القوة » sous « حقل الشرارة ») est un doublon ; les entités restent
  const kept = []
  for (const f of found) {
    const dup =
      f.kind !== 'entity' &&
      kept.some((k) => {
        if (k.kind === 'entity') return false
        let inter = 0
        for (const d of f.docs) if (k.docs.has(d)) inter++
        return inter >= f.docs.size * 0.7
      })
    if (!dup) kept.push(f)
    if (kept.length >= limit) break
  }
  return kept.map(({ score, docs, ...f }) => ({ ...f, score: Math.round(score * 10) / 10 }))
}

/* ---------------------------------------------------------------- histoires */

const titleCache = new WeakMap()
function titleSet(it) {
  let s = titleCache.get(it)
  if (!s) {
    s = new Set(words(`${it.title} ${String(it.summary || '').split(/[.!؟?]/)[0]}`).map((w) => w.s))
    titleCache.set(it, s)
  }
  return s
}

function similarity(a, b) {
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (Math.min(a.size, b.size) || 1) // recouvrement : les titres courts restent comparables
}

/** Fiches de la fenêtre (hors commentaires), de la plus ancienne à la plus récente */
function windowPool(items, hours, now, cap) {
  return items
    .filter((it) => {
      const t = Date.parse(it.date)
      return t <= now && t >= now - Math.min(Math.max(hours, 1), 336) * HOUR && it.media !== 'comment'
    })
    .slice(0, cap)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Regroupement des fiches (triées de la plus ancienne à la plus récente) qui parlent du même événement */
function clusterPool(pool) {
  const clusters = []
  const byWord = new Map() // racine → histoires dont le cœur ou la première fiche la contient
  const index = (c, words) => {
    for (const w of words) {
      let list = byWord.get(w)
      if (!list) byWord.set(w, (list = new Set()))
      list.add(c)
    }
  }
  for (const it of pool) {
    const set = titleSet(it)
    if (set.size < 2) continue
    let best = null
    let bestSim = 0
    const candidates = new Set()
    for (const w of set) for (const c of byWord.get(w) ?? []) candidates.add(c)
    for (const c of [...candidates].sort((a, b) => a.n - b.n)) {
      const sim = Math.max(similarity(set, c.core), similarity(set, c.seed))
      if (sim > bestSim) {
        bestSim = sim
        best = c
      }
    }
    if (best && bestSim >= 0.5) {
      best.items.push(it)
      for (const s of set) best.freq.set(s, (best.freq.get(s) || 0) + 1)
      // Le cœur de l'histoire : les mots présents dans au moins la moitié de ses fiches
      const half = best.items.length / 2
      const core = new Set([...best.freq.entries()].filter(([, n]) => n >= half).map(([s]) => s))
      if (core.size >= 2) {
        best.core = core
        index(best, core)
      }
    } else {
      const c = { n: clusters.length, items: [it], core: set, seed: set, freq: new Map([...set].map((s) => [s, 1])) }
      clusters.push(c)
      index(c, set)
    }
  }
  return clusters
}

/**
 * Index des histoires pour la liste des actualités (« +N منشورات أخرى ») : identifiant de fiche → identifiant de
 * l'histoire (première fiche), pour les histoires reprises par au moins 2 fiches de la fenêtre.
 */
export function storyIndex(items, { hours = 168, now = Date.now() } = {}) {
  const index = new Map()
  for (const c of clusterPool(windowPool(items, hours, now, 6000))) {
    if (c.items.length < 2) continue
    for (const it of c.items) index.set(it.id, c.items[0].id)
  }
  return index
}

/**
 * Regroupe les fiches de la fenêtre qui parlent du même événement : recouvrement des mots du titre et de la
 * première phrase. Renvoie les histoires reprises par au moins 2 fiches, les plus reprises d'abord.
 */
export function storyClusters(items, { hours = 48, now = Date.now(), limit = 20 } = {}) {
  return clusterPool(windowPool(items, hours, now, 4000))
    .filter((c) => c.items.length >= 2)
    .map((c) => {
      const first = c.items[0]
      const last = c.items[c.items.length - 1]
      const tone = emptyTone()
      for (const it of c.items) tone[toneOf(it).tone]++
      const sources = [...new Set(c.items.map((it) => it.origin))]
      const lead = [...c.items].sort((a, b) => (b.importance || 1) - (a.importance || 1) || b.summary.length - a.summary.length)[0]
      const spanH = Math.max((Date.parse(last.date) - Date.parse(first.date)) / HOUR, 1)
      return {
        id: first.id,
        title: lead.title,
        summary: lead.summary,
        size: c.items.length,
        sources,
        channels: [...new Set(c.items.map((it) => it.channel))],
        first: { origin: first.origin, date: first.date, url: first.url },
        lastDate: last.date,
        perHour: Math.round((c.items.length / spanH) * 10) / 10,
        tone,
        sentiment: net(tone),
        query: [...c.core].slice(0, 3),
        items: [...c.items]
          .reverse()
          .slice(0, 12)
          .map((it) => ({ id: it.id, title: it.title, origin: it.origin, channel: it.channel, date: it.date, url: it.url, tone: toneOf(it).tone })),
      }
    })
    .sort((a, b) => b.sources.length - a.sources.length || b.size - a.size || b.lastDate.localeCompare(a.lastDate))
    .slice(0, limit)
}

/* ---------------------------------------------------------------- baromètre */

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Sentiment par jour, par acteur et par source, sur `days` jours */
export function sentimentBarometer(items, { days = 14, now = Date.now() } = {}) {
  const span = Math.min(Math.max(days, 2), 90)
  const perDay = []
  for (let i = span - 1; i >= 0; i--) perDay.push({ date: dayKey.format(new Date(now - i * DAY)), ...emptyTone() })
  const index = new Map(perDay.map((d, i) => [d.date, i]))
  const total = emptyTone()
  let inferred = 0
  const actors = new Map()
  const sources = new Map()
  const add = (map, name, tone) => {
    let t = map.get(name)
    if (!t) map.set(name, (t = emptyTone()))
    t[tone]++
  }
  for (const it of items) {
    const t = Date.parse(it.date)
    if (t > now || t < now - span * DAY) continue
    const r = toneOf(it)
    if (r.inferred) inferred++
    total[r.tone]++
    const i = index.get(dayKey.format(new Date(t)))
    if (i != null) perDay[i][r.tone]++
    for (const e of [...(it.people || []), ...(it.orgs || [])]) add(actors, e, r.tone)
    add(sources, it.origin, r.tone)
  }
  const rank = (map, limit) =>
    [...map.entries()]
      .map(([name, t]) => ({ name, ...t, count: t.positive + t.neutral + t.negative, sentiment: net(t) }))
      .filter((r) => r.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  const n = total.positive + total.neutral + total.negative
  return {
    days: span,
    total: n,
    ...total,
    sentiment: net(total),
    inferredShare: n ? Math.round((inferred / n) * 100) : 0,
    perDay: perDay.map((d) => ({ ...d, sentiment: net(d) })),
    actors: rank(actors, 12),
    // Acteurs libyens (référentiel des entités) : vue par défaut de l'écran quand il y en a
    actorsLy: rank(new Map([...actors].filter(([name]) => lookup(name)?.libyan)), 12),
    sources: rank(sources, 10),
  }
}

/* ---------------------------------------------------------------- alertes */

/**
 * Profondeur de l'historique : premier jour où la collecte tourne vraiment (au moins 5 fiches et 5 % du jour le plus
 * chargé), et nombre de jours depuis. Les comparaisons (« hausse soudaine », moyennes, sujets « nouveaux ») ne sont
 * calculées qu'à partir de MIN_HISTORY_DAYS jours : avant, la montée en charge de la collecte passerait pour un événement.
 */
export const MIN_HISTORY_DAYS = 14
export function historyOf(items, now = Date.now()) {
  const perDay = new Map()
  for (const it of items) {
    const d = dayKey.format(new Date(it.date))
    perDay.set(d, (perDay.get(d) || 0) + 1)
  }
  const max = Math.max(0, ...perDay.values())
  const floor = Math.max(5, max * 0.05)
  const since = [...perDay.entries()]
    .filter(([, n]) => n >= floor)
    .map(([d]) => d)
    .sort()[0]
  const days = since ? Math.max(Math.round((now - Date.parse(`${since}T12:00:00Z`)) / DAY), 0) + 1 : 0
  return { since: since || null, days, enough: days >= MIN_HISTORY_DAYS, min: MIN_HISTORY_DAYS }
}

// Seuils minimaux : en dessous, un pourcentage ou un écart n'est qu'un effet statistique
export const ALERT_MIN = { spike: { count: 10, sources: 3 }, negative: { count: 10, sources: 3 }, emerging: { count: 5, sources: 3 }, story: { sources: 4 } }
// Part des fiches d'une alerte qui doivent concerner la Libye (mot « ليبيا », acteur ou lieu libyen)
const LIBYA_SHARE = 0.5

const libyaShare = (list) => (list.length ? list.filter((it) => (it.ly !== undefined ? it.ly : libyaRelevant(it))).length / list.length : 0)
const sourcesOf = (list) => new Set(list.map((it) => it.origin)).size

/**
 * Alertes à 3 niveaux (3 = حرج / critique, 2 = مرتفع / élevé, 1 = معلومة / information) :
 * pics d'activité, sujets nouveaux, montée du négatif autour d'un acteur, histoire largement reprise.
 * - chaque alerte doit atteindre un volume et un nombre de sources minimaux (ALERT_MIN) ;
 * - un sujet n'entre que si la moitié au moins de ses fiches concerne la Libye (score de pertinence « libya ») ;
 * - les alertes fondées sur une comparaison (pic, sujet nouveau, montée du négatif) attendent 14 jours d'historique ;
 * - un pourcentage négatif ne déclenche rien sous le volume minimal.
 * `filter` est le filtre de la liste d'actualités qui ouvre l'alerte.
 */
export function smartAlerts(items, { now = Date.now(), history = historyOf(items, now) } = {}) {
  const alerts = []
  const recentItems = items.filter((it) => {
    const t = Date.parse(it.date)
    return t <= now && t >= now - DAY
  })
  if (history.enough) {
    for (const s of findSpikes(items, now)) {
      const found = spikeItems(recentItems, s.dim, s.name, now)
      const sources = sourcesOf(found)
      const libya = libyaShare(found)
      if (s.count < ALERT_MIN.spike.count || sources < ALERT_MIN.spike.sources || libya < LIBYA_SHARE) continue
      const ratio = s.count / (s.avg + 1)
      alerts.push({
        id: `spike:${s.dim}:${s.name}`,
        kind: 'spike',
        level: ratio >= 5 && s.count >= 25 && sources >= 6 ? 3 : ratio >= 3 ? 2 : 1,
        label: s.name,
        detail: { recent: s.count, avg: s.avg, dim: s.dim, sources, libya: Math.round(libya * 100) },
        filter: { [s.filter]: s.name },
      })
    }
    // Sujets nouveaux : expressions ou entités seulement, et pas déjà signalées par un pic
    const spiked = new Set(alerts.map((a) => normalize(a.label)))
    for (const t of emergingTopics(items, { hours: 24, now, limit: 15 })) {
      if (!t.isNew || t.kind === 'word' || spiked.has(normalize(t.label))) continue
      if (t.recent < ALERT_MIN.emerging.count || t.sources < ALERT_MIN.emerging.sources) continue
      const libya = libyaShare(t.sample || [])
      if (libya < LIBYA_SHARE) continue
      alerts.push({ id: `new:${t.key}`, kind: 'emerging', level: t.sources >= 8 && t.recent >= 15 ? 3 : t.sources >= 5 ? 2 : 1, label: t.label, detail: { recent: t.recent, sources: t.sources, libya: Math.round(libya * 100) }, filter: { q: `"${t.label}"` } })
    }

    // Montée du négatif : part négative des dernières 24 h nettement au-dessus de celle des 7 jours d'avant
    const recent = new Map()
    const before = new Map()
    for (const it of items) {
      const t = Date.parse(it.date)
      if (t > now || t < now - 8 * DAY) continue
      const map = t >= now - DAY ? recent : before
      const tone = toneOf(it).tone
      for (const e of [...(it.people || []), ...(it.orgs || []), ...(it.places || [])]) {
        let r = map.get(e)
        if (!r) map.set(e, (r = { n: 0, neg: 0, items: [] }))
        r.n++
        if (tone === 'negative') r.neg++
        if (map === recent) r.items.push(it)
      }
    }
    for (const [name, r] of recent) {
      if (r.n < ALERT_MIN.negative.count) continue
      const sources = sourcesOf(r.items)
      if (sources < ALERT_MIN.negative.sources) continue
      const libya = libyaShare(r.items)
      if (libya < LIBYA_SHARE) continue
      const b = before.get(name) || { n: 0, neg: 0 }
      const share = r.neg / r.n
      const baseShare = b.n ? b.neg / b.n : 0
      if (!(share >= 0.5 && share - baseShare >= 0.25)) continue
      // Déjà signalé par un pic : on y ajoute la part négative plutôt que de doubler l'alerte
      const spike = alerts.find((a) => a.kind === 'spike' && normalize(a.label) === normalize(name))
      if (spike) spike.detail.negative = Math.round(share * 100)
      else
        alerts.push({
          id: `neg:${name}`,
          kind: 'negative',
          level: share >= 0.75 && r.n >= 25 && sources >= 6 ? 3 : share >= 0.6 ? 2 : 1,
          label: name,
          detail: { share: Math.round(share * 100), before: Math.round(baseShare * 100), recent: r.n, sources, libya: Math.round(libya * 100) },
          filter: { entity: name, tone: 'negative' },
        })
    }
  }
  // Histoire reprise par beaucoup de sources : pas de comparaison, utilisable dès le début de la collecte
  for (const c of storyClusters(items, { hours: 24, now, limit: 8 })) {
    if (c.sources.length < ALERT_MIN.story.sources) continue
    const libya = libyaShare(c.items.map((x) => ({ title: x.title, summary: '', people: [], orgs: [], places: [] })))
    const leadLibya = libyaRelevant({ title: c.title, summary: c.summary, people: [], orgs: [], places: [] })
    if (Math.max(libya, leadLibya ? 1 : 0) < LIBYA_SHARE) continue
    alerts.push({
      id: `story:${c.id}`,
      kind: 'story',
      level: c.sources.length >= 10 ? 3 : c.sources.length >= 6 ? 2 : 1,
      label: c.title,
      detail: { sources: c.sources.length, size: c.size, libya: Math.round(Math.max(libya, leadLibya ? 1 : 0) * 100) },
      filter: { q: c.query.join(' ') },
    })
  }
  return alerts.sort((a, b) => b.level - a.level || (b.detail.sources || 0) - (a.detail.sources || 0)).slice(0, 14)
}

/* ---------------------------------------------------------------- envoi des alertes critiques */

/**
 * Envoi automatique des alertes critiques (niveau 3) par Telegram et/ou e-mail, une seule fois chacune
 * (data/radar-sent.json garde 3 jours d'historique). Activé seulement avec MMS_RADAR_ALERTS=1 ;
 * destinataires e-mail : MMS_RADAR_ALERTS_TO (adresses séparées par des virgules). Les actualités
 * d'exemple (MMS_DEMO) ne déclenchent jamais d'envoi.
 */
const KIND_AR = { spike: 'ارتفاع مفاجئ', emerging: 'موضوع جديد', negative: 'تصاعد السلبية', story: 'خبر واسع الانتشار' }
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function startRadarAlerts(dataDir, getItems, { sendTelegram, telegramReady, sendMail, canSend = () => true, onSent = () => {} }) {
  if (process.env.MMS_RADAR_ALERTS !== '1') return
  const file = path.join(dataDir, 'radar-sent.json')
  let sent = {}
  try {
    sent = JSON.parse(fs.readFileSync(file, 'utf8')) || {}
  } catch {
    sent = {}
  }
  const to = String(process.env.MMS_RADAR_ALERTS_TO || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
  let running = false
  async function run() {
    if (running) return
    running = true
    try {
      const now = Date.now()
      for (const [id, at] of Object.entries(sent)) if (now - at > 3 * DAY) delete sent[id]
      const items = getItems().items.filter((it) => !it.demo)
      // Option « validation par un analyste » : une alerte critique ne part qu'une fois validée
      const fresh = smartAlerts(items, { now }).filter((a) => a.level === 3 && !sent[a.id] && canSend(a))
      if (!fresh.length) return
      const base = (process.env.PUBLIC_URL || 'http://localhost:5174').replace(/\/$/, '')
      const lines = fresh.map((a) => `• <b>${escHtml(KIND_AR[a.kind])}</b> : ${escHtml(a.label)}`)
      const text = [`🚨 <b>MMS · الرادار الذكي</b>`, `${fresh.length} تنبيه حرج`, '', ...lines, '', `<a href="${escHtml(base)}/?view=radar">فتح الرادار</a>`].join('\n')
      if (telegramReady()) await sendTelegram(text.slice(0, 4000))
      if (to.length)
        await sendMail(to, {
          subject: `MMS · الرادار الذكي : ${fresh.length} تنبيه حرج`,
          html: `<div dir="rtl" style="font-family:Arial,sans-serif">${text.replace(/\n/g, '<br>')}</div>`,
        })
      for (const a of fresh) sent[a.id] = now
      onSent({ count: fresh.length, channels: [...(telegramReady() ? ['telegram'] : []), ...(to.length ? ['email'] : [])], recipients: to.length, names: fresh.map((a) => a.label) })
      fs.mkdirSync(dataDir, { recursive: true })
      fs.writeFileSync(file, JSON.stringify(sent))
    } catch (err) {
      console.error(`Radar : envoi des alertes impossible (${err.message})`)
    } finally {
      running = false
    }
  }
  setTimeout(run, 60_000).unref?.()
  setInterval(run, 10 * 60_000).unref?.()
  return run
}
