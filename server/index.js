import 'dotenv/config'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { getItems } from './store.js'
import { aiEnabled, aiProvider, aiUsage, analyse, cached, initUsage, loadKey } from './ai.js'
import { keyStatus } from './keys.js'
import { currentUser, initAuth, loginRoute, logoutRoute, requireAuth } from './auth.js'
import { imageRoute, initImages, withImages } from './images.js'
import { createWatch, deleteWatch, enabledWatches, itemsForWatch, listWatches, setEnabled, startWatches } from './watches.js'

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
  const text = String(q.q || '')
    .trim()
    .toLowerCase()
  const days = Number(q.days) || 0
  const since = days ? Date.now() - days * 86_400_000 : 0
  return items.filter(
    (it) =>
      (!q.flux || it.flux === q.flux) &&
      (!q.category || it.category === q.category) &&
      (!q.channel || it.channel === q.channel) &&
      (!q.lang || it.lang === q.lang) &&
      (!since || Date.parse(it.date) >= since) &&
      (!text || `${it.title} ${it.summary} ${it.origin}`.toLowerCase().includes(text)),
  )
}

const app = express()
// Derrière nginx (VPS), pour que le cookie de session passe en « Secure » en HTTPS
app.set('trust proxy', 1)

// Connexion : seules ces routes sont ouvertes, tout le reste de l'API demande une session
initAuth(path.join(root, 'data'))
app.post('/api/auth/login', express.json({ limit: '4kb' }), loginRoute)
app.post('/api/auth/logout', logoutRoute)
app.get('/api/auth/me', (req, res) => {
  const user = currentUser(req)
  if (!user) return res.status(401).json({ error: 'AUTH' })
  res.json({ user })
})
app.use('/api', requireAuth)

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
  const { items, lastUpdate, demo } = getItems()
  // Filtre « الرصد » : mêmes règles et même période que la veille
  const watched = req.query.watch ? itemsForWatch(String(req.query.watch), items) : items
  if (!watched) return res.status(404).json({ error: 'NO_WATCH' })
  const found = applyFilters(watched, req.query)
  const size = Math.min(Math.max(Number(req.query.size) || 20, 1), 100)
  const pages = Math.max(Math.ceil(found.length / size), 1)
  const page = Math.min(Math.max(Number(req.query.page) || 1, 1), pages)
  res.json({ total: found.length, page, pages, items: await withImages(found.slice((page - 1) * size, page * size)), lastUpdate, demo })
})

app.get('/api/news/latest', async (_req, res) => {
  const { items, lastUpdate, demo } = getItems()
  res.json({ items: await withImages(items.slice(0, 12)), lastUpdate, demo })
})

app.get('/api/news/facets', (_req, res) => {
  const { items } = getItems()
  res.json({
    flux: counts(items, 'flux'),
    categories: counts(items, 'category'),
    channels: counts(items, 'channel'),
    languages: counts(items, 'lang'),
  })
})

app.get('/api/news/stats', (req, res) => {
  const { items, lastUpdate, demo } = getItems()
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365)
  const found = applyFilters(items, { ...req.query, days })
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

// Veille programmée (الرصد المبرمج)
app.get('/api/news/watches', (_req, res) => res.json({ watches: enabledWatches() }))
app.get('/api/watches', (_req, res) => res.json({ watches: listWatches(), smtp: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS) }))
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
const TYPES = new Set(['news', 'bars', 'columns', 'pie', 'line', 'kpi', 'table', 'cloud'])
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
        dim: ['channels', 'categories', 'sources', 'flux'].includes(w.dim) ? w.dim : 'channels',
        metric: ['total', 'broadcasts', 'sources', 'average'].includes(w.metric) ? w.metric : 'total',
        category: str(w.category, 60),
        x: int(w.x, 0, 11),
        y: int(w.y, 0, 1000),
        w: int(w.w, 2, 12),
        h: int(w.h, 3, 40),
      })),
  }))
}

app.get('/api/dashboards', (_req, res) => {
  try {
    res.json({ boards: cleanBoards(JSON.parse(fs.readFileSync(BOARDS_FILE, 'utf8')).boards) })
  } catch {
    res.json({ boards: null })
  }
})

app.put('/api/dashboards', express.json({ limit: '300kb' }), (req, res) => {
  const boards = cleanBoards(req.body?.boards)
  if (!boards) return res.status(400).json({ error: 'INVALID' })
  fs.mkdirSync(path.dirname(BOARDS_FILE), { recursive: true })
  fs.writeFileSync(BOARDS_FILE, JSON.stringify({ savedAt: new Date().toISOString(), boards }, null, 2))
  res.json({ boards })
})

const dist = path.join(root, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

startWatches(path.join(root, 'data'))

// Sur le VPS, MMS_HOST=127.0.0.1 : seul nginx (HTTPS) parle au serveur
const HOST = process.env.MMS_HOST || undefined
app.listen(PORT, HOST, () => {
  console.log(`MMS en écoute sur http://${HOST || 'localhost'}:${PORT}`)
  console.log(`  Mosaïque FM : ${process.env.MOSAIQUE_DATA_DIR}`)
  console.log(`  Libye       : ${process.env.LIBYE_DATA_DIR}`)
})
