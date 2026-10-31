import { toneOf } from './radar.js'
import { interactions } from './insights.js'
import { countryOf, reachOf, reliabilityOf, sourceTier } from './sourceMeta.js'

/**
 * Présentation de la liste des actualités, dans l'esprit des plateformes de veille professionnelles :
 * tri (date, portée, source, interactions, importance) dans les deux sens, regroupement (thème, source, canal,
 * pays, jour) avec Buzz, portée cumulée et tonalité de chaque groupe, et histoires similaires repliées sous une fiche.
 */

export const GROUPS = ['category', 'source', 'channel', 'country', 'day']
export const SORTS = ['', 'reach', 'source', 'engagement', 'importance']

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli', year: 'numeric', month: '2-digit', day: '2-digit' })
const dayMemo = new Map()
function dayOf(iso) {
  let d = dayMemo.get(iso)
  if (d === undefined) {
    if (dayMemo.size > 200_000) dayMemo.clear()
    d = dayKey.format(new Date(iso))
    dayMemo.set(iso, d)
  }
  return d
}

/** Clé de groupe d'une fiche */
export function groupKey(it, group) {
  if (group === 'category') return it.category || 'autre'
  if (group === 'source') return it.origin || ''
  if (group === 'channel') return it.channel || ''
  if (group === 'country') return countryOf(it) || ''
  if (group === 'day') return dayOf(it.date)
  return ''
}

const emptyTone = () => ({ positive: 0, neutral: 0, negative: 0 })
/** Indice net de −100 (tout négatif) à +100 (tout positif), comme le baromètre du radar */
export const net = (t) => {
  const n = t.positive + t.neutral + t.negative
  return n ? Math.round(((t.positive - t.negative) / n) * 100) : 0
}

/** Tri en place ; dir 'asc' ou 'desc' (par défaut : décroissant, sauf la source, alphabétique) */
export function sortNews(list, sort, dir) {
  const s = SORTS.includes(sort) ? sort : ''
  const asc = dir ? dir === 'asc' : s === 'source'
  const sign = asc ? 1 : -1
  const byDate = (a, b) => a.date.localeCompare(b.date)
  let cmp
  if (s === 'reach') cmp = (a, b) => reachOf(a) - reachOf(b) || byDate(a, b)
  else if (s === 'source') cmp = (a, b) => String(a.origin).localeCompare(String(b.origin), 'ar') || -byDate(a, b) * sign
  else if (s === 'engagement') cmp = (a, b) => interactions(a) - interactions(b) || (a.engagement?.views || 0) - (b.engagement?.views || 0)
  else if (s === 'importance') cmp = (a, b) => (a.importance || 1) - (b.importance || 1) || byDate(a, b)
  else cmp = byDate
  return list.sort((a, b) => sign * cmp(a, b))
}

/**
 * Replie les fiches d'une même histoire : la première rencontrée (dans l'ordre du tri) reste, les autres passent
 * dans sa liste « similar ». index : identifiant de fiche → identifiant d'histoire (storyIndex du radar).
 */
export function foldStories(list, index) {
  if (!index?.size) return list
  const leads = new Map()
  const out = []
  for (const it of list) {
    const story = index.get(it.id)
    if (!story) {
      out.push(it)
      continue
    }
    const lead = leads.get(story)
    if (!lead) {
      const copy = { ...it, story, similar: [] }
      leads.set(story, copy)
      out.push(copy)
    } else if (lead.similar.length < 50) lead.similar.push(it)
    else lead.similarMore = (lead.similarMore || 0) + 1
  }
  // Tête de l'histoire : la fiche la plus représentative (article de presse important et complet), pas un message
  // de réseau social de quelques mots arrivé en premier (audit v4) ; elle garde la place de la première dans la liste
  const rank = (x) => (SOCIAL.has(x.channel) || x.media === 'social' ? 0 : 10) + (Number(x.importance) || 1) * 2 + Math.min(String(x.summary || '').length / 200, 2)
  return out.map((row) => {
    if (!row.story || !row.similar?.length) return row
    const { story, similar, similarMore, ...base } = row
    const best = similar.reduce((b, x) => (rank(x) > rank(b) ? x : b), base)
    if (best === base) return row
    return { ...best, story, similar: [base, ...similar.filter((x) => x !== best)], ...(similarMore ? { similarMore } : {}) }
  })
}
const SOCIAL = new Set(['x', 'twitter', 'bluesky', 'facebook', 'instagram', 'telegram', 'tiktok', 'reddit', 'mastodon', 'youtube', 'linkedin', 'threads'])

/** Nombre de fiches représentées par une ligne (elle-même et ses similaires) */
const weight = (it) => 1 + (it.similar?.length || 0) + (it.similarMore || 0)
const members = (it) => [it, ...(it.similar || [])]

/**
 * Regroupe la liste : ordre des groupes (Buzz décroissant, jours du plus récent au plus ancien), fiches dans l'ordre
 * du tri à l'intérieur de chaque groupe, et chiffres de chaque groupe.
 */
export function groupNews(list, group) {
  if (!GROUPS.includes(group)) return { list, groups: [] }
  const map = new Map()
  for (const it of list) {
    const key = groupKey(it, group)
    let g = map.get(key)
    if (!g) map.set(key, (g = { key, rows: [], count: 0, reach: 0, tone: emptyTone() }))
    g.rows.push(it)
    g.count += weight(it)
    for (const m of members(it)) {
      g.reach += reachOf(m)
      g.tone[toneOf(m).tone]++
    }
  }
  const groups = [...map.values()].sort(group === 'day' ? (a, b) => b.key.localeCompare(a.key) : (a, b) => b.count - a.count || a.key.localeCompare(b.key))
  return {
    list: groups.flatMap((g) => g.rows.map((it) => ({ ...it, group: g.key }))),
    groups: groups.slice(0, 300).map(({ rows, ...g }) => ({ ...g, rows: rows.length, sentiment: net(g.tone) })),
  }
}

/** Fiche enrichie pour l'interface : pays, portée, histoire repliée (fiches similaires réduites) */
export function decorate(it, extra = {}) {
  const out = { ...it, country: countryOf(it), reach: reachOf(it), reliability: reliabilityOf(it), sourceTier: sourceTier(it), ...extra }
  if (it.similar) out.similar = it.similar.map((s) => ({ id: s.id, title: s.title, origin: s.origin, date: s.date, url: s.url, country: countryOf(s), channel: s.channel }))
  return out
}

/** Onglets au-dessus des résultats : sources classées, personnalités (auteurs, sinon entités), pays */
export function overview(found) {
  const sources = new Map()
  const authors = new Map()
  const people = new Map()
  const countries = new Map()
  for (const it of found) {
    let s = sources.get(it.origin)
    if (!s) sources.set(it.origin, (s = { name: it.origin, count: 0, reach: reachOf(it), country: countryOf(it), tone: emptyTone(), channel: it.channel, last: '' }))
    s.count++
    s.tone[toneOf(it).tone]++
    if (it.date > s.last) s.last = it.date
    const author = String(it.author || '').trim()
    if (author && author !== it.origin) authors.set(author, (authors.get(author) || 0) + 1)
    for (const p of it.people || []) people.set(p, (people.get(p) || 0) + 1)
    const cc = countryOf(it)
    if (cc) countries.set(cc, (countries.get(cc) || 0) + 1)
  }
  const rank = (m) =>
    [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 100)
  const src = [...sources.values()].map((s) => ({ ...s, sentiment: net(s.tone) })).sort((a, b) => b.count - a.count || b.reach - a.reach)
  // Les auteurs (comptes, signatures) quand la source les donne, sinon les personnalités citées extraites par la veille
  const useAuthors = authors.size >= 3
  return {
    total: found.length,
    sourcesCount: src.length,
    sources: src.slice(0, 100),
    peopleKind: useAuthors ? 'authors' : 'entities',
    peopleCount: useAuthors ? authors.size : people.size,
    people: rank(useAuthors ? authors : people),
    countries: rank(countries),
  }
}
