import { compileQuery, searchText } from './query.js'
import { sourceSplit, uniqueItems } from './dedupe.js'
import { collectionStart } from './history.js'
import { normalize } from './watches.js'
import { countList, findSpikes } from './intel.js'

/**
 * Analyses de niveau Meltwater : part de voix entre acteurs, comparaison de deux périodes,
 * données du rapport exécutif, choix des actualités pour l'assistant, engagement des posts.
 */

const DAY_MS = 86_400_000
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli', year: 'numeric', month: '2-digit', day: '2-digit' })
export const toDay = (iso) => dayKey.format(new Date(iso))

function counts(items, key, limit = 50) {
  const map = new Map()
  for (const it of items) if (it[key]) map.set(it[key], (map.get(it[key]) || 0) + 1)
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

const tonesOf = (items) => {
  const t = { positive: 0, neutral: 0, negative: 0 }
  for (const it of items) if (it.tone) t[it.tone]++
  return t
}

/* ---------------------------------------------------------------- engagement */

/** Interactions d'un post : réactions + partages + commentaires (les vues comptent à part) */
export const interactions = (it) => (it.engagement ? (it.engagement.reactions || 0) + (it.engagement.shares || 0) + (it.engagement.comments || 0) : 0)

export function engagementTotals(items) {
  const t = { posts: 0, views: 0, reactions: 0, shares: 0, comments: 0 }
  for (const it of items) {
    if (!it.engagement) continue
    t.posts++
    for (const k of ['views', 'reactions', 'shares', 'comments']) t[k] += it.engagement[k] || 0
  }
  return t
}

export const topEngaged = (items, limit = 10) =>
  items
    .filter((it) => it.engagement)
    .sort((a, b) => interactions(b) - interactions(a) || (b.engagement.views || 0) - (a.engagement.views || 0))
    .slice(0, limit)

/* ---------------------------------------------------------------- part de voix */

/**
 * Chaque acteur est un nom ou une requête booléenne (« الدبيبة OR Dbeibah ») ;
 * une fiche compte pour l'acteur si elle le cite (entités) ou si son texte correspond.
 */
export function shareOfVoice(items, actors, days) {
  const since = Date.now() - days * DAY_MS
  // Part de voix sur les actualités sans doublons : une même dépêche reprise dix fois ne compte qu'une fois
  const scoped = uniqueItems(items.filter((it) => Date.parse(it.date) >= since))
  const perDayKeys = []
  for (let i = days - 1; i >= 0; i--) perDayKeys.push(toDay(new Date(Date.now() - i * DAY_MS).toISOString()))
  const dayIndex = new Map(perDayKeys.map((d, i) => [d, i]))
  const rows = actors.map((name) => {
    const match = compileQuery(name)
    const plain = normalize(name)
    const found = scoped.filter(
      (it) => (match && match(searchText(it))) || [...(it.people || []), ...(it.orgs || []), ...(it.places || [])].some((e) => normalize(e) === plain),
    )
    const perDay = perDayKeys.map(() => 0)
    for (const it of found) {
      const i = dayIndex.get(toDay(it.date))
      if (i != null) perDay[i]++
    }
    return {
      name,
      count: found.length,
      tones: tonesOf(found),
      perDay,
      sources: counts(found, 'origin', 5),
      engagement: engagementTotals(found),
    }
  })
  return { days, dates: perDayKeys, total: scoped.length, actors: rows }
}

/* ---------------------------------------------------------------- comparaison de périodes */

// Chiffres non gonflés (audit des statistiques, 29/10) : actualités sans doublons (même adresse ou même titre),
// sources médias séparées des comptes de réseaux sociaux ; « publications » garde le nombre brut
function profile(items) {
  const uniq = uniqueItems(items)
  const split = sourceSplit(items)
  return {
    total: uniq.length,
    publications: items.length,
    sources: split.media,
    accounts: split.accounts,
    important: uniq.filter((it) => (it.importance || 1) >= 2).length,
    tones: tonesOf(uniq),
    engagement: engagementTotals(items),
  }
}

/** Fusionne deux classements en lignes { name, current, previous } */
function pair(cur, prev, limit = 12) {
  const map = new Map()
  for (const r of cur) map.set(r.name, { name: r.name, current: r.count, previous: 0 })
  for (const r of prev) (map.get(r.name) || map.set(r.name, { name: r.name, current: 0, previous: 0 }).get(r.name)).previous = r.count
  return [...map.values()].sort((a, b) => b.current + b.previous - (a.current + a.previous)).slice(0, limit)
}

/**
 * Jours de chaque période couverts par la collecte (début des données = fiche la plus ancienne). Quand la période
 * précédente n'est couverte qu'en partie, la comparaison se fait à jours égaux : moyenne par jour couvert.
 */
export function coverageOf(items, days, now = Date.now()) {
  // Début de la collecte à plein régime (server/history.js), pas l'article le plus ancien
  const start = collectionStart(items) ?? now
  const span = (a, b) => Math.max(0, Math.min(b - Math.max(a, start), b - a)) / DAY_MS
  const current = Math.round(span(now - days * DAY_MS, now) * 10) / 10
  const previous = Math.round(span(now - 2 * days * DAY_MS, now - days * DAY_MS) * 10) / 10
  return { days, current, previous, partial: previous < days - 0.5 }
}

/**
 * Variation en % juste : la valeur précédente ramenée aux mêmes jours couverts que la période en cours.
 * null : pas de comparaison possible ; 'new' : base trop petite (moins de 5 ou moins d'un jour couvert).
 */
export function fairChange(cur, prev, cov) {
  // Période précédente couverte à moins de moitié : par défaut, % calculé sur la moyenne par jour des jours couverts
  // (depuis le début de la collecte à plein régime, base indiquée à l'écran) ; MMS_PCT_PARTIAL=hide : « جديد » à la place
  if (!cov || cov.previous < 1 || cov.current <= 0) return cur ? 'new' : null
  if (process.env.MMS_PCT_PARTIAL === 'hide' && cov.previous < cov.days / 2) return cur ? 'new' : null
  const base = prev * (cov.current / cov.previous)
  if (base < 5) return cur ? 'new' : null
  return Math.round(((cur - base) / base) * 100)
}

/** Période en cours (days derniers jours) contre la même durée juste avant */
export function comparePeriods(items, days) {
  const now = Date.now()
  const cur = items.filter((it) => Date.parse(it.date) >= now - days * DAY_MS)
  const prev = items.filter((it) => {
    const t = Date.parse(it.date)
    return t >= now - 2 * days * DAY_MS && t < now - days * DAY_MS
  })
  // Classements par thème et par acteur sur les actualités sans doublons ; par source : publications de chaque source
  const uCur = uniqueItems(cur)
  const uPrev = uniqueItems(prev)
  return {
    days,
    coverage: coverageOf(items, days, now),
    current: profile(cur),
    previous: profile(prev),
    categories: pair(counts(uCur, 'category'), counts(uPrev, 'category')),
    sources: pair(counts(cur, 'origin'), counts(prev, 'origin')),
    channels: pair(counts(cur, 'channel'), counts(prev, 'channel')),
    people: pair(countList(uCur, 'people', 30), countList(uPrev, 'people', 30)),
    orgs: pair(countList(uCur, 'orgs', 30), countList(uPrev, 'orgs', 30)),
    places: pair(countList(uCur, 'places', 30), countList(uPrev, 'places', 30)),
  }
}

/* ---------------------------------------------------------------- rapport exécutif */

export function buildBriefing(items, days) {
  const cmp = comparePeriods(items, days)
  const now = Date.now()
  const cur = uniqueItems(items.filter((it) => Date.parse(it.date) >= now - days * DAY_MS))
  // Les plus marquantes : importance, puis reprises et interactions
  const top = [...cur]
    .sort((a, b) => (b.importance || 1) - (a.importance || 1) || interactions(b) - interactions(a) || b.date.localeCompare(a.date))
    .slice(0, 12)
  return {
    days,
    from: new Date(now - days * DAY_MS).toISOString(),
    to: new Date(now).toISOString(),
    current: cmp.current,
    previous: cmp.previous,
    coverage: cmp.coverage,
    change: fairChange(cmp.current.total, cmp.previous.total, cmp.coverage),
    categories: cmp.categories.slice(0, 6),
    people: cmp.people.slice(0, 6),
    orgs: cmp.orgs.slice(0, 6),
    places: cmp.places.slice(0, 6),
    sources: cmp.sources.slice(0, 6),
    spikes: findSpikes(items).slice(0, 4),
    top,
    engaged: topEngaged(cur, 5),
    items: cur,
  }
}

/** Chiffres du rapport, en texte, pour l'IA */
export function briefingFacts(b) {
  const row = (r) => `${r.name} : ${r.current} (avant : ${r.previous})`
  const t = b.current.tones
  const tp = b.previous.tones
  return [
    `Période : ${b.days} derniers jours. ${b.current.total} actualités (période précédente : ${b.previous.total}), ${b.current.sources} sources.`,
    `Tonalité : positif ${t.positive}, neutre ${t.neutral}, négatif ${t.negative} (avant : ${tp.positive} / ${tp.neutral} / ${tp.negative}).`,
    `Thèmes : ${b.categories.map(row).join(' ; ')}.`,
    `Personnalités : ${b.people.map(row).join(' ; ')}.`,
    `Organisations : ${b.orgs.map(row).join(' ; ')}.`,
    `Lieux : ${b.places.map(row).join(' ; ')}.`,
    b.spikes.length ? `Pics des dernières 24 h : ${b.spikes.map((s) => `${s.name} (${s.count} contre ${s.avg}/jour)`).join(' ; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/* ---------------------------------------------------------------- assistant */

const STOP = new Set(
  'the and for with what who how why when are was were did does from that this about من في على عن الى إلى ما ماذا هل كيف لماذا متى التي الذي هذا هذه ذلك تلك مع او أو ثم قد كل بين بعد قبل ان أن le la les des du de et en un une sur pour par avec que qui quoi est sont dans au aux ce cette'.split(
    ' ',
  ),
)

/** Actualités les plus proches de la question (mots en commun, puis importance et fraîcheur) */
export function retrieve(items, question, limit = 60) {
  const words = [...new Set(normalize(question).split(/[^\p{L}\p{N}]+/u))].filter((w) => w.length > 2 && !STOP.has(w))
  // Préfixes arabes courants (ال، و، ب…) : on cherche aussi le mot sans eux
  const stems = words.map((w) => w.replace(/^(وال|بال|كال|فال|لل|ال|و|ب|ل|ف)(?=\p{L}{3})/u, ''))
  const now = Date.now()
  const scored = items.map((it) => {
    const text = searchText(it)
    let hits = 0
    stems.forEach((s, k) => {
      if (text.includes(s) || text.includes(words[k])) hits++
    })
    const age = (now - Date.parse(it.date)) / DAY_MS
    return { it, hits, score: hits * 10 + (it.importance || 1) * 2 - Math.min(age, 30) * 0.3 }
  })
  const matched = scored.filter((s) => s.hits > 0).sort((a, b) => b.score - a.score)
  const picked = matched.slice(0, limit).map((s) => s.it)
  // Question générale (« ما أبرز أخبار اليوم؟ ») : on complète avec les plus récentes et les plus importantes
  if (picked.length < 15) {
    const seen = new Set(picked)
    const recent = scored
      .filter((s) => !seen.has(s.it))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit - picked.length)
      .map((s) => s.it)
    picked.push(...recent)
  }
  return picked
}
