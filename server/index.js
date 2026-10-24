import 'dotenv/config'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { getItems, reactionsOf } from './store.js'
import { aiEnabled, aiProvider, aiUsage, analyse, aroundRun, cached, explainSpike, initUsage, loadKey, writeQuery } from './ai.js'
import { allTags, countList, entitiesOf, findSpikes, initTags, itemKey, setTags, spikeItems, tagsOf, toCsv } from './intel.js'
import { keyStatus } from './keys.js'
import { currentUser, deleteUser, hasRole, initAuth, listUsers, loginRoute, logoutRoute, requireAuth, saveUser } from './auth.js'
import { compileQuery, queryError, searchText } from './query.js'
import { buildBriefing, comparePeriods, engagementTotals, interactions, retrieve, shareOfVoice, topEngaged } from './insights.js'
import { briefingConf, briefingKey, briefingWithSummary, sendBriefing, setBriefingConf, startBriefing } from './briefing.js'
import { imageRoute, initImages, withImages } from './images.js'
import { mountSuperAdmin } from './superadmin.js'
import { AGENTS, ASK_SPEC, agentFacts, agentItems, agentStats, askPrompt, itemLines, sourceCard, specFor } from './around.js'
import { createWatch, deleteWatch, enabledWatches, itemsForWatch, listWatches, setEnabled, startWatches, telegramReady } from './watches.js'

/** Serveur MMS : API de lecture des actualités + site compilé (dist/) en production */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.env.MOSAIQUE_DATA_DIR = path.resolve(root, process.env.MOSAIQUE_DATA_DIR || '../mosaique-radio/data')
process.env.LIBYE_DATA_DIR = path.resolve(root, process.env.LIBYE_DATA_DIR || './data/libye')
const PORT = Number(process.env.MMS_PORT) || 8788
loadKey(root)

// Jour calendaire de diffusion, à l'heure de Tunis
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit' })
const toDay = (iso) => dayKey.format(new Date(iso))

function counts(items, key) {
  const map = new Map()
  for (const it of items) map.set(it[key], (map.get(it[key]) || 0) + 1)
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

function applyFilters(items, q) {
  // Recherche booléenne (AND / OR / NOT, parenthèses, "expressions exactes")
  const match = compileQuery(String(q.q || '').trim())
  // Mots à exclure, séparés par des virgules : la fiche est écartée si elle en contient un
  const exclude = String(q.exclude || '')
    .split(/[,،]/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
  const days = Number(q.days) || 0
  const since = days ? Date.now() - days * 86_400_000 : 0
  const haystack = (it) => `${it.title} ${it.summary} ${it.origin}`.toLowerCase()
  return items.filter(
    (it) =>
      (!q.flux || it.flux === q.flux) &&
      (!q.category || it.category === q.category) &&
      (!q.channel || it.channel === q.channel) &&
      (!q.media || it.media === q.media) &&
      (!q.sub || it.subType === q.sub) &&
      (!q.lang || it.lang === q.lang) &&
      (!q.source || it.origin === q.source) &&
      (!q.tone || it.tone === q.tone) &&
      (!q.entity || entitiesOf(it).includes(q.entity)) &&
      (!q.tag || tagsOf(it).includes(q.tag)) &&
      (!q.important || (it.importance || 1) >= 2) &&
      (!since || Date.parse(it.date) >= since) &&
      (!match || match(searchText(it))) &&
      (!exclude.length || !exclude.some((w) => haystack(it).includes(w))),
  )
}

const withTags = (items) => items.map((it) => ({ ...it, key: itemKey(it), tags: tagsOf(it) }))

// Les commentaires ne sont listés que si on les demande (média « commentaires ») ; ailleurs ils sont
// rattachés à leur publication
const poolOf = (cache, q) => (q.media === 'comment' ? cache.comments : cache.items)

/** Commentaires d'une publication, ou fil de son sujet de forum, joints aux fiches de la page */
const withReactions = (items) =>
  items.map((it) => (it.media !== 'comment' && (it.comments || it.replies || it.parentId) ? { ...it, reactions: reactionsOf(it).slice(0, 80), parentId: undefined } : it))

/** Publications éditoriales et réactions (commentaires, réponses de forum) d'une sélection */
function reactionTotals(found, comments) {
  const replies = found.filter((it) => it.media === 'forum' && it.parent).length
  return { editorial: found.length - replies, comments: comments.length, replies }
}

const app = express()
// Derrière nginx (VPS), pour que le cookie de session passe en « Secure » en HTTPS
app.set('trust proxy', 1)

// Console Super Admin (/superadmin) : blocages IP et pays, maintenance et journaux passent avant tout le reste
mountSuperAdmin(app, root)

// Connexion : seules ces routes sont ouvertes, tout le reste de l'API demande une session
initAuth(path.join(root, 'data'))
initTags(path.join(root, 'data'))
app.post('/api/auth/login', express.json({ limit: '4kb' }), loginRoute)
app.post('/api/auth/logout', logoutRoute)
app.get('/api/auth/me', (req, res) => {
  const user = currentUser(req)
  if (!user) return res.status(401).json({ error: 'AUTH' })
  res.json({ user })
})
app.use('/api', requireAuth)

// Droits par rôle : lecture pour tous ; création et modification pour les analystes ; équipe et envois programmés pour les administrateurs
function minRole(req) {
  const p = req.path
  if (p.startsWith('/users') || p.startsWith('/briefing/schedule') || p === '/briefing/send') return req.method === 'GET' && !p.startsWith('/users') ? 'viewer' : 'admin'
  if (req.method === 'GET') return 'viewer'
  if (p.startsWith('/watches') || p.startsWith('/dashboards') || p.startsWith('/tags') || p === '/ai/analysis' || p === '/briefing/summary') return 'analyst'
  return 'viewer'
}
app.use('/api', (req, res, next) => (hasRole(req.user, minRole(req)) ? next() : res.status(403).json({ error: 'FORBIDDEN' })))

initImages(path.join(root, 'data'))
initUsage(path.join(root, 'data'))
app.get('/api/img/:key', imageRoute)

app.get('/api/health', (_req, res) => {
  const { items, lastUpdate, demo } = getItems()
  const real = items.filter((it) => !it.demo)
  res.json({
    ok: true,
    lastUpdate,
    demo,
    ai: aiEnabled(),
    aiProvider: aiProvider(),
    keys: keyStatus(root),
    aiUsage: aiUsage(),
    sources: [
      process.env.MMS_MOSAIQUE === '1' && {
        flux: 'mosaique',
        dir: process.env.MOSAIQUE_DATA_DIR,
        found: fs.existsSync(process.env.MOSAIQUE_DATA_DIR),
        count: real.filter((it) => it.flux === 'mosaique').length,
      },
      {
        flux: 'libye',
        dir: process.env.LIBYE_DATA_DIR,
        found: fs.existsSync(process.env.LIBYE_DATA_DIR),
        count: real.filter((it) => it.flux === 'libye').length,
      },
    ].filter(Boolean),
  })
})

app.get('/api/news', async (req, res) => {
  const cache = getItems()
  const { lastUpdate, demo } = cache
  const items = poolOf(cache, req.query)
  // Filtre « الرصد » : mêmes règles et même période que la veille
  const watched = req.query.watch ? itemsForWatch(String(req.query.watch), items) : items
  if (!watched) return res.status(404).json({ error: 'NO_WATCH' })
  const found = applyFilters(watched, req.query)
  // Tri : le plus récent (par défaut), le plus important, ou le plus d'interactions
  if (req.query.sort === 'engagement') found.sort((a, b) => interactions(b) - interactions(a) || (b.engagement?.views || 0) - (a.engagement?.views || 0))
  else if (req.query.sort === 'importance') found.sort((a, b) => (b.importance || 1) - (a.importance || 1) || b.date.localeCompare(a.date))
  const size = Math.min(Math.max(Number(req.query.size) || 20, 1), 100)
  const pages = Math.max(Math.ceil(found.length / size), 1)
  const page = Math.min(Math.max(Number(req.query.page) || 1, 1), pages)
  res.json({
    total: found.length,
    page,
    pages,
    items: withReactions(withTags(await withImages(found.slice((page - 1) * size, page * size)))),
    queryError: req.query.q ? queryError(String(req.query.q)) : '',
    lastUpdate,
    demo,
  })
})

app.get('/api/news/latest', async (_req, res) => {
  const { items, lastUpdate, demo } = getItems()
  res.json({ items: await withImages(items.slice(0, 12)), lastUpdate, demo })
})

app.get('/api/news/facets', (_req, res) => {
  const { items, comments } = getItems()
  res.json({
    flux: counts(items, 'flux'),
    media: [...counts(items, 'media'), ...(comments.length ? [{ name: 'comment', count: comments.length }] : [])],
    subTypes: counts(
      items.filter((it) => it.media === 'broadcast' && it.subType),
      'subType',
    ),
    categories: counts(items, 'category'),
    channels: counts(items, 'channel'),
    languages: counts(items, 'lang'),
    sources: counts(items, 'origin').slice(0, 80),
    tags: allTags(),
  })
})

// Export CSV des fiches filtrées (5 000 au plus), avec les mêmes filtres que la liste
app.get('/api/news/export.csv', (req, res) => {
  const items = poolOf(getItems(), req.query)
  const watched = req.query.watch ? itemsForWatch(String(req.query.watch), items) : items
  const found = applyFilters(watched || [], req.query).slice(0, 5000)
  res.setHeader('content-type', 'text/csv; charset=utf-8')
  res.setHeader('content-disposition', `attachment; filename="mms-${new Date().toISOString().slice(0, 10)}.csv"`)
  res.send(toCsv(found))
})

// Détection des pics : dernières 24 h comparées aux 7 jours d'avant
app.get('/api/news/spikes', (req, res) => {
  const { items } = getItems()
  res.json({ spikes: findSpikes(applyFilters(items, { flux: req.query.flux })) })
})

// Étiquettes d'équipe, communes à tous les postes : data/tags.json
app.get('/api/tags', (_req, res) => res.json({ tags: allTags() }))
app.put('/api/tags', express.json({ limit: '4kb' }), (req, res) => {
  const key = String(req.body?.key || '').slice(0, 600)
  if (!key) return res.status(400).json({ error: 'NO_KEY' })
  res.json({ tags: setTags(key, req.body?.tags) })
})

/** Tonalité jour par jour, sur les mêmes jours que la courbe */
function toneDays(items, perDay) {
  const rows = perDay.map((d) => ({ date: d.date, positive: 0, neutral: 0, negative: 0 }))
  const index = new Map(rows.map((d, i) => [d.date, i]))
  for (const it of items) {
    const i = index.get(toDay(it.date))
    if (i != null && it.tone) rows[i][it.tone]++
  }
  return rows
}

app.get('/api/news/stats', (req, res) => {
  const cache = getItems()
  const { lastUpdate, demo } = cache
  const items = poolOf(cache, req.query)
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365)
  const found = applyFilters(items, { ...req.query, days })
  const foundComments = req.query.media === 'comment' ? found : applyFilters(cache.comments, { ...req.query, media: '', days })
  const perDay = []
  for (let i = days - 1; i >= 0; i--) perDay.push({ date: toDay(new Date(Date.now() - i * 86_400_000).toISOString()), count: 0 })
  const index = new Map(perDay.map((d, i) => [d.date, i]))
  for (const it of found) {
    const i = index.get(toDay(it.date))
    if (i != null) perDay[i].count++
  }
  res.json({
    days,
    total: found.length,
    sourcesCount: new Set(found.map((it) => it.origin)).size,
    broadcasts: found.reduce((n, it) => n + it.broadcasts, 0),
    perDay,
    flux: counts(found, 'flux'),
    categories: counts(found, 'category'),
    sources: counts(found, 'origin').slice(0, 10),
    channels: counts(found, 'channel'),
    media: counts(found, 'media'),
    reactions: reactionTotals(found, foundComments),
    tones: counts(
      found.filter((it) => it.tone),
      'tone',
    ),
    toneDays: toneDays(found, perDay),
    people: countList(found, 'people'),
    orgs: countList(found, 'orgs'),
    places: countList(found, 'places'),
    engagement: engagementTotals(found),
    topEngaged: withTags(topEngaged(found, 8)),
    lastUpdate,
    demo,
  })
})

app.get('/api/report', (req, res) => {
  const { items, demo } = getItems()
  const scoped = applyFilters(items, { flux: req.query.flux })
  const available = [...new Set(scoped.map((it) => toDay(it.date)))].sort().reverse()
  const day = available.includes(String(req.query.day)) ? String(req.query.day) : available[0] || null
  const dayItems = scoped.filter((it) => toDay(it.date) === day).sort((a, b) => a.date.localeCompare(b.date))
  res.json({ day, available, items: dayItems, demo })
})

// Analyse intelligente : GET lit le résultat en mémoire, POST le génère avec Claude
const FLUX_LABEL = { mosaique: 'Mosaïque FM', libye: 'Veille Libye' }
function aiScope(q) {
  const { items, lastUpdate } = getItems()
  const days = [1, 7, 30].includes(Number(q.days)) ? Number(q.days) : 7
  const found = applyFilters(items, { flux: q.flux, days })
  return { items: found, days, key: `${q.flux || 'all'}|${days}|${lastUpdate}|${found.length}`, fluxLabel: FLUX_LABEL[q.flux] || 'Mosaïque FM et Libye' }
}
let aiRunning = false
app.get('/api/ai/analysis', (req, res) => {
  const scope = aiScope(req.query)
  res.json({ enabled: aiEnabled(), count: scope.items.length, running: aiRunning, result: cached(scope.key) })
})
app.post('/api/ai/analysis', async (req, res) => {
  if (!aiEnabled()) return res.status(400).json({ error: 'NO_KEY' })
  const scope = aiScope(req.query)
  if (scope.items.length === 0) return res.status(400).json({ error: 'NO_ITEMS' })
  if (aiRunning) return res.status(429).json({ error: 'BUSY' })
  aiRunning = true
  try {
    res.json({ result: await analyse(scope) })
  } catch (err) {
    console.error('Analyse intelligente :', err.message)
    res.status(500).json({ error: err.code || 'FAILED', message: err.message })
  } finally {
    aiRunning = false
  }
})

// Explication d'un pic par l'IA, gardée en mémoire tant que le pic ne bouge pas
let spikeRunning = false
app.post('/api/ai/spike', express.json({ limit: '2kb' }), async (req, res) => {
  if (!aiEnabled()) return res.status(400).json({ error: 'NO_KEY' })
  const { items } = getItems()
  const scoped = applyFilters(items, { flux: req.body?.flux })
  const spike = findSpikes(scoped).find((s) => s.dim === req.body?.dim && s.name === req.body?.name)
  if (!spike) return res.status(404).json({ error: 'NO_SPIKE' })
  if (spikeRunning) return res.status(429).json({ error: 'BUSY' })
  spikeRunning = true
  try {
    const found = spikeItems(scoped, spike.dim, spike.name)
    res.json({
      result: await explainSpike({
        key: `spike|${spike.dim}|${spike.name}|${spike.count}`,
        label: spike.name,
        count: spike.count,
        avg: spike.avg,
        items: found,
      }),
    })
  } catch (err) {
    console.error('Explication du pic :', err.message)
    res.status(500).json({ error: err.code || 'FAILED', message: err.message })
  } finally {
    spikeRunning = false
  }
})

/* ---------------------------------------------------------------- niveau Meltwater */

// Assistant de requête : une phrase → requête booléenne
let queryRunning = false
app.post('/api/ai/query', express.json({ limit: '4kb' }), async (req, res) => {
  if (!aiEnabled()) return res.status(400).json({ error: 'NO_KEY' })
  const text = String(req.body?.text || '').trim().slice(0, 500)
  if (!text) return res.status(400).json({ error: 'EMPTY' })
  if (queryRunning) return res.status(429).json({ error: 'BUSY' })
  queryRunning = true
  try {
    const r = await writeQuery(text)
    res.json({ query: r.requete, explanation: r.explication, error: queryError(r.requete) })
  } catch (err) {
    console.error('Assistant de requête :', err.message)
    res.status(500).json({ error: 'FAILED' })
  } finally {
    queryRunning = false
  }
})

// Around, l'assistant IA : réponse structurée et sourcée, cartes d'articles et relances
let askRunning = 0
const AROUND_DAYS = [1, 7, 30, 90, 180, 365]

/** Périmètre d'Around : veille choisie (sinon tout MMS) et période */
function aroundScope(body) {
  const { items, lastUpdate } = getItems()
  const days = AROUND_DAYS.includes(Number(body?.days)) ? Number(body.days) : 30
  const watchId = String(body?.watch || '')
  const watch = watchId ? enabledWatches().find((w) => w.id === watchId) : null
  const pool = watch ? itemsForWatch(watch.id, items) || [] : items
  return { pool: applyFilters(pool, { flux: body?.flux }), days, lastUpdate, watch, label: `${watch ? `veille « ${watch.name} »` : 'toute la base MMS'}, ${days} derniers jours` }
}

app.post('/api/ai/ask', express.json({ limit: '40kb' }), async (req, res) => {
  if (!aiEnabled()) return res.status(400).json({ error: 'NO_KEY' })
  const question = String(req.body?.question || '').trim().slice(0, 800)
  if (!question) return res.status(400).json({ error: 'EMPTY' })
  if (askRunning >= 3) return res.status(429).json({ error: 'BUSY' })
  const history = (Array.isArray(req.body?.history) ? req.body.history : [])
    .slice(-4)
    .map((h) => ({ q: String(h?.q || '').slice(0, 800), a: String(h?.a || '').slice(0, 3000) }))
  const { pool, days, lastUpdate, watch, label } = aroundScope(req.body)
  const scoped = applyFilters(pool, { days })
  const picked = retrieve(scoped, question, 60)
  askRunning++
  try {
    const key = `around|${req.body?.regen ? Date.now() : ''}|${days}|${watch?.id || ''}|${req.body?.flux || ''}|${lastUpdate}|${JSON.stringify(history)}|${question}`
    const r = await aroundRun(key, askPrompt({ question, items: picked, history, scope: label }), ASK_SPEC)
    const used = [...new Set(r.sources)].filter((n) => n >= 1 && n <= picked.length)
    const cards = await withImages(used.map((n) => picked[n - 1]))
    res.json({
      title: r.titre || '',
      answer: r.reponse,
      sources: used.map((n, k) => sourceCard(cards[k] || picked[n - 1], n)),
      followups: (r.suivis || []).slice(0, 5),
      considered: picked.length,
    })
  } catch (err) {
    console.error('Around :', err.message)
    res.status(500).json({ error: 'FAILED' })
  } finally {
    askRunning--
  }
})

// Agents d'Around : chiffres calculés par MMS, puis rapport rédigé par l'IA
app.post('/api/ai/agent', express.json({ limit: '8kb' }), async (req, res) => {
  if (!aiEnabled()) return res.status(400).json({ error: 'NO_KEY' })
  const agent = AGENTS.includes(req.body?.agent) ? req.body.agent : 'coverage'
  const subject = String(req.body?.subject || '').trim().slice(0, 300)
  const lang = req.body?.lang === 'en' ? 'en' : 'ar'
  if (askRunning >= 3) return res.status(429).json({ error: 'BUSY' })
  const { pool, days, lastUpdate, watch, label } = aroundScope(req.body)
  const stats = agentStats(pool, subject, days)
  const { items: found, ...numbers } = stats
  if (!found.length) return res.json({ empty: true, stats: numbers, sources: [] })
  const picked = agentItems(stats, subject)
  askRunning++
  try {
    const key = `agent|${req.body?.regen ? Date.now() : ''}|${agent}|${lang}|${days}|${watch?.id || ''}|${req.body?.flux || ''}|${lastUpdate}|${subject}`
    const prompt = `${agentFacts(stats, subject, label, lang)}\n\nActualités :\n${itemLines(picked)}`
    const r = await aroundRun(key, prompt, specFor(agent))
    const used = [...new Set(r.sources)].filter((n) => n >= 1 && n <= picked.length)
    const cards = await withImages(used.map((n) => picked[n - 1]))
    res.json({
      title: r.titre || subject,
      summary: r.resume,
      sections: r.sections || [],
      recommendations: r.recommandations || [],
      followups: (r.suivis || []).slice(0, 5),
      sources: used.map((n, k) => sourceCard(cards[k] || picked[n - 1], n)),
      stats: numbers,
      considered: found.length,
    })
  } catch (err) {
    console.error('Around (agent) :', err.message)
    res.status(500).json({ error: 'FAILED' })
  } finally {
    askRunning--
  }
})

// Part de voix : jusqu'à 6 acteurs (noms ou requêtes booléennes)
app.get('/api/news/sov', (req, res) => {
  const { items } = getItems()
  const actors = String(req.query.actors || '')
    .split('|')
    .map((a) => a.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 6)
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365)
  res.json(shareOfVoice(applyFilters(items, { flux: req.query.flux }), actors, days))
})

// Comparaison de périodes : les N derniers jours contre les N d'avant
app.get('/api/news/compare', (req, res) => {
  const { items } = getItems()
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 180)
  res.json(comparePeriods(applyFilters(items, { flux: req.query.flux }), days))
})

// Rapport exécutif : chiffres, synthèse IA (si déjà rédigée), envoi programmé
function briefingScope(q) {
  const { items, lastUpdate } = getItems()
  const days = [7, 14, 30].includes(Number(q.days)) ? Number(q.days) : 7
  return { items: applyFilters(items, { flux: q.flux }), days, lastUpdate }
}
app.get('/api/briefing', (req, res) => {
  const { items, days, lastUpdate } = briefingScope(req.query)
  const { items: all, ...data } = buildBriefing(items, days)
  res.json({ ...data, top: withTags(data.top), engaged: withTags(data.engaged), summary: cached(briefingKey(days, lastUpdate, all.length)), ai: aiEnabled() })
})
let briefRunning = false
app.post('/api/briefing/summary', async (req, res) => {
  if (!aiEnabled()) return res.status(400).json({ error: 'NO_KEY' })
  if (briefRunning) return res.status(429).json({ error: 'BUSY' })
  briefRunning = true
  try {
    const { items, days, lastUpdate } = briefingScope(req.query)
    const { summary } = await briefingWithSummary(items, days, lastUpdate)
    res.json({ summary })
  } catch (err) {
    console.error('Rapport exécutif :', err.message)
    res.status(500).json({ error: 'FAILED' })
  } finally {
    briefRunning = false
  }
})
app.get('/api/briefing/schedule', (_req, res) => res.json(briefingConf()))
app.put('/api/briefing/schedule', express.json({ limit: '8kb' }), (req, res) => res.json(setBriefingConf(req.body)))
app.post('/api/briefing/send', async (_req, res) => {
  try {
    res.json({ sent: await sendBriefing() })
  } catch (err) {
    console.error('Rapport exécutif :', err.message)
    res.status(err.code === 'NO_CHANNEL' ? 400 : 500).json({ error: err.code || 'FAILED' })
  }
})

// Équipe : comptes et rôles (administrateurs)
app.get('/api/users', (_req, res) => res.json({ users: listUsers() }))
app.post('/api/users', express.json({ limit: '4kb' }), (req, res) => {
  try {
    res.status(201).json({ user: saveUser(req.body, true) })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.code || 'FAILED' })
  }
})
app.patch('/api/users/:email', express.json({ limit: '4kb' }), (req, res) => {
  try {
    res.json({ user: saveUser({ ...req.body, email: req.params.email }, false) })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.code || 'FAILED' })
  }
})
app.delete('/api/users/:email', (req, res) => {
  try {
    deleteUser(req.params.email, req.user.email)
    res.json({ ok: true })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.code || 'FAILED' })
  }
})

// Veille programmée (الرصد المبرمج)
app.get('/api/news/watches', (_req, res) => res.json({ watches: enabledWatches() }))
app.get('/api/watches', (_req, res) =>
  res.json({ watches: listWatches(), smtp: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS), telegram: telegramReady() }),
)
app.post('/api/watches', express.json({ limit: '100kb' }), (req, res) => {
  try {
    res.status(201).json({ watch: createWatch(req.body || {}) })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.code || 'FAILED' })
  }
})
app.patch('/api/watches/:id', express.json({ limit: '2kb' }), (req, res) => {
  const watch = setEnabled(req.params.id, req.body?.enabled)
  if (!watch) return res.status(404).json({ error: 'NO_WATCH' })
  res.json({ watch })
})
app.delete('/api/watches/:id', (req, res) => {
  if (!deleteWatch(req.params.id)) return res.status(404).json({ error: 'NO_WATCH' })
  res.json({ ok: true })
})

// Avis des utilisateurs (onglet « استطلاع »), ajoutés à data/feedback.jsonl
app.post('/api/feedback', express.json({ limit: '20kb' }), (req, res) => {
  const rating = Math.min(Math.max(Number(req.body?.rating) || 0, 0), 5)
  const comment = String(req.body?.comment || '').slice(0, 2000)
  if (!rating && !comment.trim()) return res.status(400).json({ error: 'EMPTY' })
  fs.mkdirSync(path.join(root, 'data'), { recursive: true })
  fs.appendFileSync(path.join(root, 'data', 'feedback.jsonl'), JSON.stringify({ at: new Date().toISOString(), rating, comment }) + '\n')
  res.json({ ok: true })
})

// Tableaux de bord composés par les clients, communs à tous les postes : data/dashboards.json
const BOARDS_FILE = path.join(root, 'data', 'dashboards.json')
const TYPES = new Set(['news', 'bars', 'columns', 'pie', 'line', 'kpi', 'table', 'cloud', 'tone'])
const DIMS = ['channels', 'categories', 'sources', 'flux', 'tones', 'people', 'orgs', 'places']
const int = (v, min, max) => Math.min(Math.max(Math.round(Number(v) || 0), min), max)
const str = (v, max) => String(v ?? '').slice(0, max)

function cleanBoards(input) {
  if (!Array.isArray(input)) return null
  return input.slice(0, 30).map((b) => ({
    id: str(b?.id, 40) || Math.random().toString(36).slice(2, 10),
    name: str(b?.name, 80),
    widgets: (Array.isArray(b?.widgets) ? b.widgets : [])
      .filter((w) => TYPES.has(w?.type))
      .slice(0, 60)
      // Mosaïque FM n'est plus suivie : sa liste de nouvelles devient le classement des sources
      .map((w) => (w.flux === 'mosaique' && w.type === 'news' ? { ...w, type: 'bars', dim: 'sources' } : w))
      .map((w) => ({
        id: str(w.id, 40),
        type: w.type,
        title: str(w.title, 120),
        flux: w.flux === 'libye' ? 'libye' : '',
        days: int(w.days, 1, 365),
        dim: DIMS.includes(w.dim) ? w.dim : 'channels',
        metric: ['total', 'broadcasts', 'sources', 'average'].includes(w.metric) ? w.metric : 'total',
        category: str(w.category, 60),
        x: int(w.x, 0, 11),
        y: int(w.y, 0, 1000),
        w: int(w.w, 2, 12),
        h: int(w.h, 3, 40),
      })),
  }))
}

// Tableau « التحليل الإعلامي » (tonalité, personnalités, organisations, lieux), proposé une fois aux tableaux déjà enregistrés
const INTEL_BOARD = {
  id: 'intel',
  name: '',
  widgets: [
    { id: 'i1', type: 'pie', dim: 'tones', days: 7, x: 0, y: 0, w: 4, h: 8 },
    { id: 'i2', type: 'tone', dim: 'tones', days: 30, x: 4, y: 0, w: 8, h: 8 },
    { id: 'i3', type: 'bars', dim: 'people', days: 7, x: 0, y: 8, w: 6, h: 9 },
    { id: 'i4', type: 'bars', dim: 'orgs', days: 7, x: 6, y: 8, w: 6, h: 9 },
    { id: 'i5', type: 'cloud', dim: 'places', days: 7, x: 0, y: 17, w: 6, h: 6 },
    { id: 'i6', type: 'columns', dim: 'sources', days: 7, x: 6, y: 17, w: 6, h: 6 },
  ],
}

app.get('/api/dashboards', (_req, res) => {
  try {
    const file = JSON.parse(fs.readFileSync(BOARDS_FILE, 'utf8'))
    const boards = file.boards
    if (!file.intel && Array.isArray(boards) && !boards.some((b) => b?.id === 'intel')) boards.push(INTEL_BOARD)
    res.json({ boards: cleanBoards(boards) })
  } catch {
    res.json({ boards: null })
  }
})

app.put('/api/dashboards', express.json({ limit: '300kb' }), (req, res) => {
  const boards = cleanBoards(req.body?.boards)
  if (!boards) return res.status(400).json({ error: 'INVALID' })
  fs.mkdirSync(path.dirname(BOARDS_FILE), { recursive: true })
  fs.writeFileSync(BOARDS_FILE, JSON.stringify({ savedAt: new Date().toISOString(), intel: true, boards }, null, 2))
  res.json({ boards })
})

const dist = path.join(root, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

startWatches(path.join(root, 'data'))
startBriefing(path.join(root, 'data'))

// Sur le VPS, MMS_HOST=127.0.0.1 : seul nginx (HTTPS) parle au serveur
const HOST = process.env.MMS_HOST || undefined
app.listen(PORT, HOST, () => {
  console.log(`MMS en écoute sur http://${HOST || 'localhost'}:${PORT}`)
  console.log(`  Mosaïque FM : ${process.env.MOSAIQUE_DATA_DIR}`)
  console.log(`  Libye       : ${process.env.LIBYE_DATA_DIR}`)
})
