import fs from 'node:fs'
import path from 'node:path'
import express from 'express'

/**
 * Diffusion sur la vitrine publique (/portal) : les actualités y passent automatiquement, selon les règles réglées
 * par l'équipe NPDC dans MMS (page « إدارة البوابة العامة »), au lieu d'une approbation fiche par fiche.
 *
 * Une fiche est affichée si la diffusion est active, qu'elle n'est pas exclue, et :
 *   - qu'elle est épinglée (en tête de la vitrine, jusqu'à une date au choix) ;
 *   - ou approuvée une à une (✎ « الواجهة العامة », server/itemEdits.js), quand cette option est gardée ;
 *   - ou, en mode automatique, qu'elle passe toutes les règles : types de contenu, langues, thèmes, sources
 *     (toutes, seulement celles-ci, toutes sauf celles-ci), mots-clés à inclure et à écarter, importance, tonalité,
 *     ancienneté, résumé ou image exigés, plafond par source et par jour.
 * Les commentaires et les sources coupées dans Super Admin n'y sont jamais (store.js les retire avant).
 *
 *   data/portal-feed.json  { config, pins: { <id>: { by, at, until } }, excluded: { <id>: { by, at } },
 *                            updatedBy, updatedAt, history: [ { by, at, what } ] }
 */

export const TYPES = ['article', 'tv', 'radio', 'youtube', 'podcast', 'blog', 'social', 'forum']
const TONES = ['positive', 'neutral', 'negative']
const MAX_LIST = 300
const MAX_MARKS = 3000
const MAX_HISTORY = 30

export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  auto: true,
  includeApproved: true,
  types: ['article', 'tv', 'radio', 'youtube'],
  langs: [],
  categories: [],
  sourceMode: 'all',
  sources: [],
  keywords: [],
  excludeKeywords: [],
  minImportance: 1,
  tones: [],
  maxAgeDays: 30,
  requireSummary: true,
  requireImage: false,
  perSourceDaily: 0,
  title: '',
  intro: '',
})

let file = ''
let state = { config: { ...DEFAULT_CONFIG }, pins: {}, excluded: {}, updatedBy: '', updatedAt: '', history: [] }
let version = 0

const fail = (code, status = 400) => Object.assign(new Error(code), { code, status })
const text = (v, n) =>
  String(v ?? '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n)
const list = (v, n, len = 80) => [...new Set((Array.isArray(v) ? v : []).map((x) => text(x, len)).filter(Boolean))].slice(0, n)
const int = (v, min, max, fb) => (Number.isFinite(Number(v)) ? Math.min(Math.max(Math.round(Number(v)), min), max) : fb)

export const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')

/** Type de contenu affiché sur la vitrine : article, tv, radio, youtube, podcast, blog, social, forum (ou comment) */
export function typeOf(it) {
  const m = it.media || 'article'
  if (m === 'broadcast') {
    const s = it.subType || it.channel
    return s === 'radio' || s === 'youtube' ? s : 'tv'
  }
  if (m === 'article' && (it.channel === 'radio' || it.channel === 'tv' || it.channel === 'youtube')) return it.channel
  return m
}

/** Réglages reçus de l'interface, nettoyés et bornés (tout champ inconnu est ignoré) */
export function cleanConfig(c = {}) {
  const d = DEFAULT_CONFIG
  return {
    enabled: c.enabled !== undefined ? c.enabled !== false : d.enabled,
    auto: c.auto !== undefined ? c.auto !== false : d.auto,
    includeApproved: c.includeApproved !== undefined ? c.includeApproved !== false : d.includeApproved,
    types: Array.isArray(c.types) ? list(c.types, TYPES.length).filter((t) => TYPES.includes(t)) : [...d.types],
    langs: list(c.langs, 20, 8),
    categories: list(c.categories, 60, 40),
    sourceMode: ['all', 'include', 'exclude'].includes(c.sourceMode) ? c.sourceMode : 'all',
    sources: list(c.sources, MAX_LIST, 120),
    keywords: list(c.keywords, 100, 60),
    excludeKeywords: list(c.excludeKeywords, 100, 60),
    minImportance: int(c.minImportance, 1, 3, 1),
    tones: list(c.tones, 3).filter((t) => TONES.includes(t)),
    maxAgeDays: int(c.maxAgeDays, 0, 365, d.maxAgeDays),
    requireSummary: c.requireSummary !== undefined ? c.requireSummary === true : d.requireSummary,
    requireImage: c.requireImage === true,
    perSourceDaily: int(c.perSourceDaily, 0, 100, 0),
    title: text(c.title, 80),
    intro: text(c.intro, 240),
  }
}

const read = () => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
const save = () => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1))
  fs.renameSync(tmp, file)
  version++
}

export function initPortalFeed(dataDir) {
  file = path.join(dataDir, 'portal-feed.json')
  const s = read() || {}
  state = {
    config: cleanConfig(s.config || {}),
    pins: s.pins && typeof s.pins === 'object' ? s.pins : {},
    excluded: s.excluded && typeof s.excluded === 'object' ? s.excluded : {},
    updatedBy: String(s.updatedBy || ''),
    updatedAt: String(s.updatedAt || ''),
    history: Array.isArray(s.history) ? s.history.slice(0, MAX_HISTORY) : [],
  }
  version++
}

const pinActive = (p, now) => p && (!p.until || Date.parse(p.until) > now)

/**
 * Décision pour chaque fiche, avec la raison : { show, status, reason }
 *   status : pinned | shown | hidden | excluded ; reason : code de la règle qui a décidé.
 * Le plafond par source et par jour se calcule sur l'ensemble : evaluate() renvoie une fonction de décision.
 */
export function evaluate(items, config, marks = state, now = Date.now()) {
  const c = cleanConfig(config)
  const words = c.keywords.map(norm)
  const banned = c.excludeKeywords.map(norm)
  const sources = new Set(c.sources)
  const langs = new Set(c.langs)
  const cats = new Set(c.categories)
  const types = new Set(c.types)
  const tones = new Set(c.tones)
  const since = c.maxAgeDays ? now - c.maxAgeDays * 86_400_000 : -Infinity
  const textOf = (it) => norm(`${it.title} ${it.summary}`)

  const rule = (it) => {
    if (!c.auto) return 'notAuto'
    const type = typeOf(it)
    if (type === 'comment' || !types.has(type)) return 'type'
    if (langs.size && !langs.has(it.lang)) return 'lang'
    if (cats.size && !cats.has(it.category)) return 'category'
    if (c.sourceMode === 'include' && !sources.has(it.origin)) return 'source'
    if (c.sourceMode === 'exclude' && sources.has(it.origin)) return 'source'
    const d = Date.parse(it.date)
    if (!(d >= since) || d > now + 3_600_000) return 'age'
    if (c.requireSummary && String(it.summary || '').trim().length < 20) return 'summary'
    if (c.requireImage && !/^https?:\/\//i.test(String(it.image || ''))) return 'image'
    if ((Number(it.importance) || 1) < c.minImportance) return 'importance'
    if (tones.size && !tones.has(it.tone || 'neutral')) return 'tone'
    const body = words.length || banned.length ? textOf(it) : ''
    if (banned.some((w) => w && body.includes(w))) return 'excludeKeyword'
    if (words.length && !words.some((w) => w && body.includes(w))) return 'keyword'
    return ''
  }

  // Plafond par source et par jour (heure de Tripoli) : les plus importantes puis les plus récentes passent
  let capped = null
  if (c.auto && c.perSourceDaily > 0) {
    const groups = new Map()
    for (const it of items) {
      if (rule(it)) continue
      const day = new Date(Date.parse(it.date) + 2 * 3_600_000).toISOString().slice(0, 10)
      const k = `${it.origin}|${day}`
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(it)
    }
    capped = new Set()
    for (const g of groups.values()) {
      if (g.length <= c.perSourceDaily) continue
      g.sort((a, b) => (Number(b.importance) || 1) - (Number(a.importance) || 1) || String(b.date).localeCompare(String(a.date)))
      for (const it of g.slice(c.perSourceDaily)) capped.add(it.id)
    }
  }

  return (it) => {
    if (typeOf(it) === 'comment') return { show: false, status: 'hidden', reason: 'type' }
    if (marks.excluded[it.id]) return { show: false, status: 'excluded', reason: 'excluded' }
    if (!c.enabled) return { show: false, status: 'hidden', reason: 'disabled' }
    if (pinActive(marks.pins[it.id], now)) return { show: true, status: 'pinned', reason: 'pinned' }
    if (c.includeApproved && it.public === true) return { show: true, status: 'shown', reason: 'approved' }
    const r = rule(it)
    if (r) return { show: false, status: 'hidden', reason: r }
    if (capped?.has(it.id)) return { show: false, status: 'hidden', reason: 'cap' }
    return { show: true, status: 'shown', reason: 'rules' }
  }
}

/** Fiches de la vitrine, épinglées d'abord puis les plus récentes ; recalculé quand les fiches ou les règles changent */
let memo = { items: null, version: -1, at: 0, list: [], ids: new Set(), pinned: new Set() }
export function portalSelection(items, now = Date.now()) {
  if (memo.items === items && memo.version === version && now - memo.at < 60_000) return memo
  const decide = evaluate(items, state.config, state, now)
  const pinned = new Set()
  const shown = []
  for (const it of items) {
    const d = decide(it)
    if (!d.show) continue
    if (d.status === 'pinned') pinned.add(it.id)
    shown.push(it)
  }
  shown.sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)) || String(b.date).localeCompare(String(a.date)))
  memo = { items, version, at: now, list: shown, ids: new Set(shown.map((it) => it.id)), pinned }
  return memo
}

export const portalSite = () => ({ title: state.config.title, intro: state.config.intro })

const stamp = (by, what) => {
  state.updatedBy = String(by || '').slice(0, 120)
  state.updatedAt = new Date().toISOString()
  state.history.unshift({ by: state.updatedBy, at: state.updatedAt, what: String(what).slice(0, 200) })
  state.history = state.history.slice(0, MAX_HISTORY)
}

export function setConfig(body, by) {
  state.config = cleanConfig(body || {})
  stamp(by, 'config')
  save()
  return state.config
}

export function resetConfig(by) {
  state.config = { ...DEFAULT_CONFIG, types: [...DEFAULT_CONFIG.types] }
  stamp(by, 'reset')
  save()
  return state.config
}

/** Épingler, désépingler, exclure, rétablir une fiche */
export function markItem(id, action, by, { until, known } = {}) {
  if (known && (action === 'pin' || action === 'exclude') && !known(id)) throw fail('NOT_FOUND', 404)
  const who = String(by || '').slice(0, 120)
  const at = new Date().toISOString()
  if (action === 'pin') {
    if (Object.keys(state.pins).length >= MAX_MARKS) throw fail('FULL')
    const u = until && /^\d{4}-\d{2}-\d{2}$/.test(until) ? new Date(`${until}T23:59:59+02:00`).toISOString() : ''
    state.pins[id] = { by: who, at, until: u }
    delete state.excluded[id]
  } else if (action === 'unpin') delete state.pins[id]
  else if (action === 'exclude') {
    if (Object.keys(state.excluded).length >= MAX_MARKS) throw fail('FULL')
    state.excluded[id] = { by: who, at }
    delete state.pins[id]
  } else if (action === 'include') delete state.excluded[id]
  else throw fail('BAD_ACTION')
  stamp(by, `${action} ${id}`)
  save()
  return { pinned: Boolean(state.pins[id]), excluded: Boolean(state.excluded[id]) }
}

const brief = (it, d) => ({
  id: it.id,
  title: String(it.title || '').slice(0, 300),
  summary: String(it.summary || '').slice(0, 260),
  source: it.origin,
  date: it.date,
  type: typeOf(it),
  lang: it.lang || '',
  category: it.category || '',
  image: /^https?:\/\//i.test(String(it.image || '')) ? it.image : '',
  url: /^https?:\/\//i.test(String(it.url || '')) ? it.url : '',
  importance: Number(it.importance) || 1,
  tone: it.tone || '',
  status: d.status,
  reason: d.reason,
})

/** Aperçu des règles (enregistrées ou en cours de modification) : chiffres, répartition et liste paginée */
export function preview(items, body = {}, now = Date.now()) {
  const config = body.config ? cleanConfig(body.config) : state.config
  const decide = evaluate(items, config, state, now)
  const needle = norm(String(body.q || '').trim().slice(0, 200))
  const want = ['all', 'shown', 'hidden', 'pinned', 'excluded'].includes(body.status) ? body.status : 'shown'
  const type = TYPES.includes(body.type) ? body.type : ''
  // Les fiches non affichées sont nombreuses : seulement les 30 derniers jours dans la liste des « masquées »
  const recent = now - 30 * 86_400_000
  const stats = { shown: 0, pinned: 0, approved: 0, excluded: 0, last24h: 0, byType: {}, byLang: {}, bySource: {}, hiddenBy: {} }
  const rows = []
  for (const it of items) {
    const d = decide(it)
    if (d.show) {
      stats.shown++
      if (d.status === 'pinned') stats.pinned++
      if (d.reason === 'approved') stats.approved++
      if (Date.parse(it.date) > now - 86_400_000) stats.last24h++
      const t = typeOf(it)
      stats.byType[t] = (stats.byType[t] || 0) + 1
      stats.byLang[it.lang || '?'] = (stats.byLang[it.lang || '?'] || 0) + 1
      stats.bySource[it.origin] = (stats.bySource[it.origin] || 0) + 1
    } else if (d.status === 'excluded') stats.excluded++
    else if (Date.parse(it.date) > recent) stats.hiddenBy[d.reason] = (stats.hiddenBy[d.reason] || 0) + 1
    const match =
      want === 'all' ? d.show || d.status === 'excluded' || Date.parse(it.date) > recent : want === 'shown' ? d.show : want === 'hidden' ? d.status === 'hidden' && Date.parse(it.date) > recent : d.status === want
    if (!match) continue
    if (type && typeOf(it) !== type) continue
    if (needle && !norm(`${it.title} ${it.summary} ${it.origin}`).includes(needle)) continue
    rows.push([it, d])
  }
  rows.sort((a, b) => Number(b[1].status === 'pinned') - Number(a[1].status === 'pinned') || String(b[0].date).localeCompare(String(a[0].date)))
  const size = int(body.size, 5, 50, 20)
  const pages = Math.max(Math.ceil(rows.length / size), 1)
  const page = int(body.page, 1, pages, 1)
  stats.bySource = Object.entries(stats.bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }))
  return { stats, total: rows.length, page, pages, items: rows.slice((page - 1) * size, page * size).map(([it, d]) => brief(it, d)) }
}

/** Valeurs proposées dans l'interface (sources, langues, thèmes, types), avec leur nombre de fiches */
export function options(items) {
  const count = (key) => {
    const m = new Map()
    for (const it of items) {
      const v = key(it)
      if (v && v !== 'comment') m.set(v, (m.get(v) || 0) + 1)
    }
    return [...m.entries()].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count)
  }
  return { types: count(typeOf), langs: count((it) => it.lang), categories: count((it) => it.category), sources: count((it) => it.origin).slice(0, 600) }
}

export function feedState(items) {
  const byId = new Map(items.map((it) => [it.id, it]))
  const marks = (m) =>
    Object.entries(m)
      .map(([id, v]) => {
        const it = byId.get(id)
        return { id, ...v, title: it ? String(it.title).slice(0, 200) : '', source: it?.origin || '', date: it?.date || '', missing: !it }
      })
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
  return { config: state.config, defaults: DEFAULT_CONFIG, pins: marks(state.pins), excluded: marks(state.excluded), updatedBy: state.updatedBy, updatedAt: state.updatedAt, history: state.history.slice(0, 15), options: options(items) }
}

export function mountPortalFeed(app, { getItems }) {
  const wrap = (fn) => (req, res) => {
    try {
      res.json(fn(req))
    } catch (err) {
      res.status(err.status || 500).json({ error: err.code || 'FAILED' })
    }
  }
  const items = () => getItems().items
  app.get('/api/portal-feed', wrap(() => feedState(items())))
  app.put('/api/portal-feed/config', express.json({ limit: '64kb' }), wrap((req) => ({ config: setConfig(req.body?.config, req.user?.email) })))
  app.post('/api/portal-feed/reset', wrap((req) => ({ config: resetConfig(req.user?.email) })))
  app.post('/api/portal-feed/preview', express.json({ limit: '64kb' }), wrap((req) => preview(items(), req.body || {})))
  app.post(
    '/api/portal-feed/items/:id',
    express.json({ limit: '1kb' }),
    wrap((req) => markItem(String(req.params.id).slice(0, 200), req.body?.action, req.user?.email, { until: req.body?.until, known: (id) => getItems().byId.has(id) })),
  )
}
