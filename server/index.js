import 'dotenv/config'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { getItems, reactionsOf } from './store.js'
import { aiEnabled, aiProvider, aiUsage, analyse, aroundRun, cached, explainSpike, initUsage, loadKey, writeQuery } from './ai.js'
import { allTags, countList, entitiesOf, findSpikes, initTags, itemKey, setTags, spikeItems, tagsOf, toCsv } from './intel.js'
import { keyStatus } from './keys.js'
import { currentUser, initAuth, loginRoute, logoutRoute, mfaDisableRoute, mfaEnableRoute, mfaLoginRoute, mfaSetupRoute, mfaStateOf, readUsers, requireAuth } from './auth.js'
import { initMfaPolicy } from './mfa.js'
import { initMailPolicy } from './mailPolicy.js'
import { initPermissions, permissionGate, permsOf } from './permissions.js'
import { logAudit, logSecurity } from './monitor.js'
import { compileQuery, queryError, searchText } from './query.js'
import { buildBriefing, comparePeriods, engagementTotals, interactions, retrieve, shareOfVoice, topEngaged } from './insights.js'
import { briefingConf, briefingKey, briefingWithSummary, sendBriefing, setBriefingConf, startBriefing } from './briefing.js'
import { imageRoute, initImages, withImages } from './images.js'
import { mountSuperAdmin } from './superadmin.js'
import { mountDiffusion } from './diffusion.js'
import { mountMedia } from './media.js'
import { mountReports } from './reports.js'
import { AGENTS, ASK_SPEC, agentFacts, agentItems, agentStats, askPrompt, itemLines, sourceCard, specFor } from './around.js'
import { emergingTopics, historyOf, sentimentBarometer, smartAlerts, startRadarAlerts, storyClusters, storyIndex } from './radar.js'
import { startRadarWorker } from './radarWorker.js'
import { createWatch, deleteWatch, enabledWatches, guardWatch, itemsForWatch, mergeWatches, sendMail, setWatchAccess, similarWatches, watchesFor, watchIdsFor, sendTelegram, setEnabled, setMailBlockedListener, setWatchAlert, setWatchAlertListener, setWatchTools, startWatches, telegramReady } from './watches.js'
import { countryOf } from './sourceMeta.js'
import { initProcessed, isProcessed, processedOf, setProcessed } from './processed.js'
import { GROUPS, decorate, foldStories, groupNews, overview, sortNews } from './newsView.js'
import { countView, createShare, initShares, listShares, publicShareQuery, revokeShare, shareFor } from './shares.js'
import { apiItem, apiKeyFor, initApiKeys, keyFromRequest, takeCall } from './apiKeys.js'
import { brandOf } from './clientAdmin.js'
import { cachedBrief, initBrief, itemBrief } from './brief.js'
import { mountGeo } from './geo.js'
import { mountCatalog } from './catalog.js'
import { canSendAlert, initAlertFlow, mountAlertFlow, openWatchAlert, withFlow } from './alertFlow.js'
import { intlRegion } from './themes.js'
import { initEntities, libyaRelevant, norm as normName, onEntitiesChange, regionOf, regionStats, resolveEntities } from './entities.js'
import { initPinboards, mountPinboards, pinnedKeys } from './pinboards.js'
import { initMailingLists, mountMailingLists } from './mailingLists.js'
import { mountRasd } from './rasd.js'
import { avatarUrl, initProfile, mountProfile } from './profile.js'
import { initItemEdits, mountItemEdits } from './itemEdits.js'
import { mountPortal } from './portal.js'
import { refreshSourcePolicy } from './store.js'
import { initSourcePolicy } from './sourcePolicy.js'
import { dispatchHistory, initDispatchLog, logDispatch } from './dispatchLog.js'
import { SPLITS, STEPS, timeline } from './timeline.js'
import { setEntityResolver } from './store.js'

/** Serveur MMS : API de lecture des actualités + site compilé (dist/) en production */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.env.MOSAIQUE_DATA_DIR = path.resolve(root, process.env.MOSAIQUE_DATA_DIR || '../mosaique-radio/data')
process.env.LIBYE_DATA_DIR = path.resolve(root, process.env.LIBYE_DATA_DIR || './data/libye')
const PORT = Number(process.env.MMS_PORT) || 8788
loadKey(root)

// Jour calendaire de diffusion, à l'heure de Tripoli (clients libyens, UTC+2)
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli', year: 'numeric', month: '2-digit', day: '2-digit' })
// Le formatage Intl est coûteux (la moitié du temps des statistiques sur 20 000 fiches) : jour gardé par date
const dayMemo = new Map()
function toDay(iso) {
  let d = dayMemo.get(iso)
  if (d === undefined) {
    if (dayMemo.size > 200_000) dayMemo.clear()
    d = dayKey.format(new Date(iso))
    dayMemo.set(iso, d)
  }
  return d
}

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
  // Période personnalisée (jours de Tripoli, bornes comprises) et tonalités multiples (« negative,neutral »)
  const DAY = /^\d{4}-\d{2}-\d{2}$/
  const from = DAY.test(q.from || '') ? Date.parse(`${q.from}T00:00:00+02:00`) : 0
  const to = DAY.test(q.to || '') ? Date.parse(`${q.to}T23:59:59.999+02:00`) : Infinity
  const tones = q.tone ? new Set(String(q.tone).split(',').filter(Boolean)) : null
  const haystack = (it) => `${it.title} ${it.summary} ${it.origin}`.toLowerCase()
  const pinned = q.pinboard ? pinnedKeys(String(q.pinboard)) : null
  return items.filter(
    (it) =>
      (!q.flux || it.flux === q.flux) &&
      (!q.category || it.category === q.category) &&
      (!q.intl || it.intl === q.intl) &&
      (!q.channel || it.channel === q.channel) &&
      (!q.media || it.media === q.media) &&
      (!q.sub || it.subType === q.sub) &&
      (!q.lang || it.lang === q.lang) &&
      (!q.source || it.origin === q.source) &&
      (!tones || tones.has(it.tone)) &&
      (!q.entity || entitiesOf(it).includes(q.entity)) &&
      (!q.tag || tagsOf(it).includes(q.tag)) &&
      (!q.important || (it.importance || 1) >= 2) &&
      (!q.country || countryOf(it) === q.country) &&
      (!q.region || regionOf(it) === q.region) &&
      (!pinned || pinned.has(it.url || it.id)) &&
      (!q.processed || (q.processed === 'yes') === isProcessed(itemKey(it))) &&
      (!since || Date.parse(it.date) >= since) &&
      (!from || Date.parse(it.date) >= from) &&
      (to === Infinity || Date.parse(it.date) <= to) &&
      (!match || match(searchText(it))) &&
      (!exclude.length || !exclude.some((w) => haystack(it).includes(w))),
  )
}

const withTags = (items) => items.map((it) => ({ ...it, key: itemKey(it), tags: tagsOf(it) }))
/** Fiches de la liste des actualités : étiquettes, pays, portée, statut « تمت المعالجة » et histoires repliées */
const forList = (items) => items.map((it) => decorate(it, { key: itemKey(it), tags: tagsOf(it), processed: processedOf(itemKey(it)), brief: cachedBrief(it)?.text }))

// Veilles créées depuis une recherche : même moteur de requête et même pays que la liste
setWatchTools({ compile: compileQuery, text: searchText, country: countryOf, valid: (q) => !queryError(q) })

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
app.disable('x-powered-by')

// En-têtes de sécurité, envoyés par MMS lui-même (nginx n'en ajoute qu'une partie).
// La politique stricte des scripts est d'abord en observation (Report-Only) : le rapport d'Around
// imprimé depuis une page blob: utilise un script en ligne.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Content-Security-Policy', "object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'")
  res.setHeader(
    'Content-Security-Policy-Report-Only',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https:; frame-src https:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
  )
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000')
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store')
  next()
})

// Permissions détaillées par profil (modules et boutons), réglées dans la console Super Admin
initPermissions(path.join(root, 'data', 'superadmin'))
initDispatchLog(path.join(root, 'data'))
// Console Super Admin (/superadmin) : blocages IP et pays, maintenance et journaux passent avant tout le reste
mountSuperAdmin(app, root)

// Connexion : seules ces routes sont ouvertes, tout le reste de l'API demande une session
initAuth(path.join(root, 'data'))
initTags(path.join(root, 'data'))
app.post('/api/auth/login', express.json({ limit: '4kb' }), loginRoute)
app.post('/api/auth/logout', logoutRoute)
// Double authentification : 2e étape de la connexion, activation, désactivation (règle dans la console Super Admin)
initMfaPolicy(path.join(root, 'data', 'superadmin'))
// Liste blanche des domaines destinataires (veilles, rapports, briefing, alertes) ; refus journalisés
initMailPolicy(path.join(root, 'data', 'superadmin'))
setMailBlockedListener((blocked, subject) => logSecurity('mail_blocked', { ip: '', ua: '', login: '', detail: `${blocked.join(', ')} · ${String(subject).slice(0, 80)}` }))
app.post('/api/auth/mfa', express.json({ limit: '2kb' }), mfaLoginRoute)
app.post('/api/auth/mfa/setup', mfaSetupRoute)
app.post('/api/auth/mfa/enable', express.json({ limit: '2kb' }), mfaEnableRoute)
app.post('/api/auth/mfa/disable', express.json({ limit: '2kb' }), mfaDisableRoute)
app.get('/api/auth/me', (req, res) => {
  const user = currentUser(req)
  if (!user) return res.status(401).json({ error: 'AUTH' })
  const raw = readUsers().find((u) => u.email === user.email)
  res.json({ user: { ...user, avatar: avatarUrl(user.email), perms: permsOf(user), mfa: mfaStateOf(raw) } })
})

// Référentiel des entités : variantes d'un même acteur fusionnées, médias jamais comptés comme acteurs
initEntities(path.join(root, 'data', 'superadmin'))
// Politique des sources sociales et des forums (audit v3) : bots, comptes personnels, liste blanche des forums
initSourcePolicy(path.join(root, 'data', 'superadmin'))
const applyEntities = () =>
  setEntityResolver((items) => {
    const media = new Set(items.map((it) => normName(it.origin || '')).filter(Boolean))
    for (const it of items) {
      // Entités telles que lues (gardées à part, hors JSON) : un changement du référentiel repart de la source
      if (!it._raw) Object.defineProperty(it, '_raw', { value: { people: it.people, orgs: it.orgs, places: it.places }, enumerable: false, configurable: true, writable: true })
      const raw = it._raw
      const r = resolveEntities(raw, media)
      it.people = r.people
      it.orgs = r.orgs
      it.places = r.places
      // Pertinence Libye, calculée une fois (alertes du radar, y compris dans le thread de calcul) ; hors JSON
      Object.defineProperty(it, 'ly', { value: libyaRelevant(it), enumerable: false, configurable: true, writable: true })
      // Sous-thème de « دولي » (zone concernée), d'après les lieux reconnus et le texte
      const zone = intlRegion(it)
      if (zone) it.intl = zone
      else delete it.intl
    }
  })
applyEntities()
onEntitiesChange(applyEntities)

/* -------- accès sans session : lien de partage d'un tableau de bord, API des clients, logo du client */
initProcessed(path.join(root, 'data'))
initShares(path.join(root, 'data'))
initApiKeys(path.join(root, 'data', 'superadmin'))
initBrief(path.join(root, 'data'))

// Logo et nom du client (réglés dans la console Super Admin) : en tête des tableaux de bord, partagés compris
app.get('/api/platform/brand', (_req, res) => res.json(brandOf()))

// Limite par adresse IP pour les accès publics (liens partagés, API) : 300 appels par 5 minutes
const publicHits = new Map()
function publicLimit(req, res, next) {
  const ip = String(req.ip || '')
  const now = Date.now()
  const list = (publicHits.get(ip) || []).filter((t) => now - t < 300_000)
  if (list.length >= 300) return res.status(429).json({ error: 'RATE' })
  list.push(now)
  publicHits.set(ip, list)
  if (publicHits.size > 5000) for (const [k, v] of publicHits) if (!v.some((t) => now - t < 300_000)) publicHits.delete(k)
  next()
}

/** Tableaux enregistrés (data/dashboards.json), ou null */
function readBoards() {
  try {
    const file = JSON.parse(fs.readFileSync(BOARDS_FILE, 'utf8'))
    const boards = file.boards
    if (!file.intel && Array.isArray(boards) && !boards.some((b) => b?.id === 'intel')) boards.push(INTEL_BOARD)
    return cleanBoards(boards)
  } catch {
    return null
  }
}

// Page publique d'un tableau partagé : jamais indexée, aucune adresse transmise aux sites ouverts depuis la page
app.use('/share/', (_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  res.setHeader('Referrer-Policy', 'no-referrer')
  next()
})
app.get('/api/public/share/:token', publicLimit, (req, res) => {
  const share = shareFor(req.params.token)
  const board = share && (readBoards() || []).find((b) => b.id === share.boardId)
  if (!share || !board) return res.status(404).json({ error: 'NOT_FOUND' })
  countView(share)
  res.setHeader('X-Robots-Tag', 'noindex')
  res.json({ board: { id: board.id, name: board.name || share.boardName, widgets: board.widgets }, expiresAt: share.expiresAt, brand: brandOf(), options: share.options || {} })
})
// Vitrine publique d'actualités (/portal) : fiches approuvées pour le public seulement, champs publics seulement
app.use('/portal', (_req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})
mountPortal(app, { getItems, publicLimit })
// Données des widgets du tableau partagé : seulement les appels qu'un de ses widgets ferait, avec ses paramètres
app.get(/^\/api\/public\/share\/([A-Za-z0-9_-]{43})\/(news\/stats|news\/timeline|news|radar\/(?:emerging|stories|sentiment|alerts))$/, publicLimit, async (req, res) => {
  const [token, route] = [req.params[0], req.params[1]]
  const share = shareFor(token)
  const board = share && (readBoards() || []).find((b) => b.id === share.boardId)
  const query = board && publicShareQuery(board.widgets, route, req.query)
  if (!query) return res.status(404).json({ error: 'NOT_FOUND' })
  res.setHeader('X-Robots-Tag', 'noindex')
  if (route === 'news/stats') return res.json(statsData(query))
  if (route === 'news/timeline') return res.json(timelineData(query))
  if (route === 'news') {
    const data = await newsData(query)
    // Pas de commentaires ni d'étiquettes ou de statut d'équipe dans un lien public
    return res.json({ ...data, items: data.items.map(({ reactions, tags, processed, key, ...it }) => it) })
  }
  res.json(radarData(`/${route.slice('radar/'.length)}`, query))
})

// API de lecture des clients : clé dans l'en-tête, limite de débit par clé (console Super Admin → مفاتيح API)
app.get('/api/v1/news', publicLimit, (req, res) => {
  const k = apiKeyFor(keyFromRequest(req))
  if (!k) return res.status(401).json({ error: 'BAD_KEY' })
  const limited = takeCall(k)
  if (limited) return res.status(429).json({ error: limited })
  const q = {}
  for (const f of ['q', 'days', 'category', 'channel', 'media', 'lang', 'source', 'tone', 'country', 'exclude', 'important']) if (req.query[f]) q[f] = String(req.query[f]).slice(0, 500)
  const { items, lastUpdate } = getItems()
  const found = applyFilters(items, q)
  sortNews(found, req.query.sort === 'reach' ? 'reach' : '', req.query.dir === 'asc' ? 'asc' : 'desc')
  const size = Math.min(Math.max(Number(req.query.size) || 50, 1), 100)
  const pages = Math.max(Math.ceil(found.length / size), 1)
  const page = Math.min(Math.max(Number(req.query.page) || 1, 1), pages)
  res.json({
    total: found.length,
    page,
    pages,
    items: found.slice((page - 1) * size, page * size).map((it) => ({ ...apiItem(it), country: countryOf(it), reach: decorate(it).reach })),
    queryError: q.q ? queryError(q.q) : '',
    lastUpdate,
  })
})

app.use('/api', requireAuth)

// Droits par profil : modules (pages) et actions (boutons) permis, réglés dans la console Super Admin.
// Les profils de base reproduisent les anciens droits par rôle (lecture pour tous, création pour les analystes,
// envois programmés et sources de diffusion pour les administrateurs). Chaque refus est journalisé.
app.use(
  '/api',
  permissionGate((req, why) =>
    logSecurity('perm_denied', { ip: String(req.ip || '').replace(/^::ffff:/, ''), ua: String(req.headers['user-agent'] || ''), login: req.user.email, detail: `${req.method} ${req.path} ${why}` }),
  ),
)

// Quota d'appels à l'IA par compte (60 par heure) : un compte, même compromis, ne peut pas faire exploser la facture
const AI_QUOTA = 60
const aiCalls = new Map() // email → [dates]
app.use('/api/ai', (req, res, next) => {
  if (req.method !== 'POST') return next()
  const now = Date.now()
  const list = (aiCalls.get(req.user.email) || []).filter((t) => now - t < 3600_000)
  if (list.length >= AI_QUOTA) return res.status(429).json({ error: 'BUSY', quota: AI_QUOTA })
  list.push(now)
  aiCalls.set(req.user.email, list)
  next()
})

initImages(path.join(root, 'data'))
mountDiffusion(app, path.join(root, 'data'))
mountMedia(app)
// Générateur de rapports (التقارير) : publications cochées seulement, rapports propres à chaque compte
mountReports(app, path.join(root, 'data'), { getItems, aiEnabled, aiRun: aroundRun, sendMail, logDispatch })
initUsage(path.join(root, 'data'))
app.get('/api/img/:key', imageRoute)

// État pour la barre d'outils ; chemins, clés et dépenses sont dans la console Super Admin (/api/superadmin/dashboard)
app.get('/api/health', (_req, res) => {
  const { items, lastUpdate, demo } = getItems()
  const real = items.filter((it) => !it.demo)
  res.json({
    ok: true,
    // Profondeur des données : « données depuis le JJ/MM » et comparaisons masquées avant 14 jours
    history: historyMemo(items),
    lastUpdate,
    demo,
    ai: aiEnabled(),
    aiProvider: aiProvider(),
    sources: [
      process.env.MMS_MOSAIQUE === '1' && {
        flux: 'mosaique',
        found: fs.existsSync(process.env.MOSAIQUE_DATA_DIR),
        count: real.filter((it) => it.flux === 'mosaique').length,
      },
      {
        flux: 'libye',
        found: fs.existsSync(process.env.LIBYE_DATA_DIR),
        count: real.filter((it) => it.flux === 'libye').length,
      },
    ].filter(Boolean),
  })
})

// Histoires reprises par plusieurs fiches (radar), recalculées à chaque nouvelle version des données
let storyMemo = { items: null, index: null }
function storiesOf(items) {
  if (storyMemo.items !== items) storyMemo = { items, index: storyIndex(items) }
  return storyMemo.index
}

/**
 * Liste des actualités : filtres, tri (date, portée, source, interactions, importance ; sens ↑/↓), histoires
 * similaires repliées (fold=1), regroupement (group=category|source|channel|country|day) avec chiffres par groupe
 */
async function newsData(q) {
  const cache = getItems()
  const { lastUpdate, demo } = cache
  const items = poolOf(cache, q)
  // Filtre « الرصد » : mêmes règles et même période que la veille
  const watched = q.watch ? itemsForWatch(String(q.watch), items) : items
  if (!watched) return null
  const found = applyFilters(watched, q)
  sortNews(found, String(q.sort || ''), q.dir === 'asc' || q.dir === 'desc' ? q.dir : '')
  const folded = q.fold === '1' && q.media !== 'comment' ? foldStories(found, storiesOf(cache.items)) : found
  const group = GROUPS.includes(q.group) ? q.group : ''
  const { list, groups } = group ? groupNews(folded, group) : { list: folded, groups: [] }
  const size = Math.min(Math.max(Number(q.size) || 20, 1), 100)
  const pages = Math.max(Math.ceil(list.length / size), 1)
  const page = Math.min(Math.max(Number(q.page) || 1, 1), pages)
  return {
    total: list.length,
    found: found.length,
    page,
    pages,
    groups,
    items: withReactions(forList(await withImages(list.slice((page - 1) * size, page * size)))),
    queryError: q.q ? queryError(String(q.q)) : '',
    lastUpdate,
    demo,
  }
}

app.get('/api/news', async (req, res) => {
  const data = await newsData(req.query)
  if (!data) return res.status(404).json({ error: 'NO_WATCH' })
  res.json(data)
})

// Courbe dans le temps des tableaux de bord : pas (heure → année), découpage, comparaison de recherches enregistrées
function timelineData(q) {
  const { items } = getItems()
  const watches = enabledWatches()
  const base = { ...q, days: '' }
  const compare = String(q.compare || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)
  if (q.split === 'compare' && compare.length) {
    const groups = compare.map((id) => ({ name: watches.find((w) => w.id === id)?.name || id, items: applyFilters(itemsForWatch(id, items) || [], { ...base, watch: '' }) }))
    return timeline([], { days: q.days, step: q.step, groups })
  }
  const pool = q.watch ? itemsForWatch(String(q.watch), items) || [] : items
  return timeline(applyFilters(pool, { ...base, watch: '' }), { days: q.days, step: q.step, split: q.split === 'compare' ? '' : q.split })
}
app.get('/api/news/timeline', (req, res) => res.json(timelineData(req.query)))

// Répartition par région de la Libye (ouest, est, sud) et par municipalité, mêmes filtres que la liste
app.get('/api/news/regions', (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 365)
  res.json({ days, ...regionStats(applyFilters(getItems().items, { ...req.query, days })) })
})

// Onglets au-dessus des résultats : sources classées, personnalités ou comptes, pays (mêmes filtres que la liste)
app.get('/api/news/overview', (req, res) => {
  const items = poolOf(getItems(), req.query)
  const watched = req.query.watch ? itemsForWatch(String(req.query.watch), items) : items
  if (!watched) return res.status(404).json({ error: 'NO_WATCH' })
  res.json(overview(applyFilters(watched, req.query)))
})

// Statut « تمت المعالجة », commun à l'équipe ; refusé au profil qui n'a pas l'action mark_processed
app.put('/api/news/processed', express.json({ limit: '4kb' }), (req, res) => {
  const key = String(req.body?.key || '').slice(0, 600)
  if (!key) return res.status(400).json({ error: 'NO_KEY' })
  res.json({ processed: setProcessed(key, Boolean(req.body?.done), req.user.name || req.user.email) })
})

// Résumé en deux lignes, en arabe, d'une actualité en langue étrangère (à la demande, gardé en cache)
app.post('/api/ai/brief', express.json({ limit: '2kb' }), async (req, res) => {
  if (!aiEnabled()) return res.status(400).json({ error: 'NO_KEY' })
  const it = getItems().byId.get(String(req.body?.id || ''))
  if (!it) return res.status(404).json({ error: 'NOT_FOUND' })
  try {
    res.json({ brief: await itemBrief(it) })
  } catch (err) {
    console.error('Résumé IA :', err.message)
    res.status(err.status || 500).json({ error: err.code || 'FAILED' })
  }
})

// Liens de partage des tableaux de bord (lecture seule, expiration, révocation)
app.get('/api/shares', (_req, res) => res.json({ shares: listShares() }))
app.post('/api/shares', express.json({ limit: '2kb' }), (req, res) => {
  const board = (readBoards() || []).find((b) => b.id === String(req.body?.boardId || ''))
  if (!board) return res.status(404).json({ error: 'NO_BOARD' })
  try {
    const { share, token } = createShare({ boardId: board.id, boardName: board.name || String(req.body?.boardName || ''), days: req.body?.days, by: req.user.email, options: req.body?.options })
    logSecurity('share_create', { ip: String(req.ip || '').replace(/^::ffff:/, ''), ua: String(req.headers['user-agent'] || ''), login: req.user.email, detail: `${board.id} ${share.expiresAt}` })
    res.status(201).json({ share, token })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.code || 'FAILED' })
  }
})
app.delete('/api/shares/:id', (req, res) => {
  const share = revokeShare(String(req.params.id), req.user.email)
  if (!share) return res.status(404).json({ error: 'NOT_FOUND' })
  res.json({ share })
})

app.get('/api/news/latest', async (_req, res) => {
  const { items, lastUpdate, demo } = getItems()
  res.json({ items: await withImages(items.slice(0, 12)), lastUpdate, demo })
})

// Facettes recalculées seulement quand les données changent (20 000 fiches : ~14 ms par appel sinon)
let facetsMemo = { items: null, comments: null, tagsAt: null, body: null }
app.get('/api/news/facets', (_req, res) => {
  const { items, comments } = getItems()
  const tags = allTags()
  // Pays réglés dans la console Super Admin : facettes recalculées au plus toutes les 100 s même sans nouvelles données
  const tagsAt = JSON.stringify(tags) + Math.floor(Date.now() / 100_000)
  if (facetsMemo.items === items && facetsMemo.comments === comments && facetsMemo.tagsAt === tagsAt) return res.json(facetsMemo.body)
  const body = {
    flux: counts(items, 'flux'),
    media: [...counts(items, 'media'), ...(comments.length ? [{ name: 'comment', count: comments.length }] : [])],
    subTypes: counts(
      items.filter((it) => it.media === 'broadcast' && it.subType),
      'subType',
    ),
    categories: counts(items, 'category'),
    intl: counts(
      items.filter((it) => it.intl),
      'intl',
    ),
    channels: counts(items, 'channel'),
    languages: counts(items, 'lang'),
    sources: counts(items, 'origin').slice(0, 80),
    countries: counts(
      items.map((it) => ({ cc: countryOf(it) })).filter((x) => x.cc),
      'cc',
    ),
    tags,
  }
  facetsMemo = { items, comments, tagsAt, body }
  res.json(body)
})

// Export CSV des fiches filtrées (5 000 au plus), avec les mêmes filtres que la liste
app.get('/api/news/export.csv', (req, res) => {
  const items = poolOf(getItems(), req.query)
  const watched = req.query.watch ? itemsForWatch(String(req.query.watch), items) : items
  // Exports limités par rôle (lecture 500 lignes, analyste 2 000, administrateur 5 000), avec filigrane nom + date
  const limit = { viewer: 500, analyst: 2000 }[req.user.role] || 5000
  const all = applyFilters(watched || [], req.query)
  const found = all.slice(0, limit)
  const mark = `# MMS Radar · ${req.user.name || req.user.email} <${req.user.email}> · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${found.length}/${all.length} · وثيقة داخلية — لا تُنشر`
  res.setHeader('content-type', 'text/csv; charset=utf-8')
  res.setHeader('content-disposition', `attachment; filename="mms-${new Date().toISOString().slice(0, 10)}.csv"`)
  const bom = String.fromCharCode(0xfeff)
  const csv = toCsv(found).replace(bom, '')
  // Filigrane en première ligne, après le BOM UTF-8 (Excel lit alors l'arabe correctement)
  res.send(`${bom}${mark}\r\n${csv}`)
})

// Détection des pics : dernières 24 h comparées aux 7 jours d'avant
// Historique de la collecte, recalculé à chaque nouvelle version des données
let historyCache = { items: null, value: null }
function historyMemo(items) {
  if (historyCache.items !== items) historyCache = { items, value: historyOf(items) }
  return historyCache.value
}

// Hausses soudaines : seulement avec 14 jours d'historique (sinon la montée en charge de la collecte passerait pour un pic)
app.get('/api/news/spikes', (req, res) => {
  const { items } = getItems()
  const history = historyMemo(items)
  res.json({ history, spikes: history.enough ? findSpikes(applyFilters(items, { flux: req.query.flux })) : [] })
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

app.get('/api/news/stats', (req, res) => res.json(statsData(req.query)))

function statsData(q) {
  const cache = getItems()
  const { lastUpdate, demo } = cache
  // Widget fondé sur une recherche enregistrée : mêmes règles que la veille
  const items = q.watch ? itemsForWatch(String(q.watch), poolOf(cache, q)) || [] : poolOf(cache, q)
  const days = Math.min(Math.max(Number(q.days) || 30, 1), 365)
  const found = applyFilters(items, { ...q, days })
  const foundComments = q.media === 'comment' ? found : applyFilters(cache.comments, { ...q, media: '', days })
  const perDay = []
  for (let i = days - 1; i >= 0; i--) perDay.push({ date: toDay(new Date(Date.now() - i * 86_400_000).toISOString()), count: 0 })
  const index = new Map(perDay.map((d, i) => [d.date, i]))
  for (const it of found) {
    const i = index.get(toDay(it.date))
    if (i != null) perDay[i].count++
  }
  return {
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
    languages: counts(found.filter((it) => it.lang), 'lang'),
    regions: Object.entries(regionStats(found).regions).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    people: countList(found, 'people'),
    orgs: countList(found, 'orgs'),
    places: countList(found, 'places'),
    engagement: engagementTotals(found),
    topEngaged: withTags(topEngaged(found, 8)),
    countries: counts(
      found.map((it) => ({ cc: countryOf(it) })).filter((x) => x.cc),
      'cc',
    ),
    lastUpdate,
    demo,
  }
}

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
  const history = historyMemo(items)
  // Période de référence plus ancienne que la collecte : comparaison signalée comme non fiable
  // Période de référence en partie avant la collecte : variations calculées à jours couverts égaux (coverage)
  const cmp = comparePeriods(applyFilters(items, { flux: req.query.flux }), days)
  res.json({ ...cmp, history, insufficient: cmp.coverage.partial })
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

// Comptes et rôles : console Super Admin seulement (/api/superadmin/users), plus de routes ici

// Veille programmée (الرصد المبرمج)
app.get('/api/news/watches', (req, res) => res.json({ watches: enabledWatches(req.user) }))
app.get('/api/watches', (req, res) =>
  res.json({ watches: watchesFor(req.user), smtp: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS), telegram: telegramReady() }),
)
app.post('/api/watches', express.json({ limit: '100kb' }), (req, res) => {
  try {
    res.status(201).json({ watch: createWatch(req.body || {}, req.user.email) })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.code || 'FAILED', ...(err.existing ? { existing: err.existing } : {}) })
  }
})
// Veilles presque identiques : proposition de fusion, puis fusion confirmée (originaux désactivés, jamais supprimés)
app.get('/api/watches/similar', (req, res) => res.json({ groups: similarWatches(0.5, req.user) }))
app.post('/api/watches/merge', express.json({ limit: '4kb' }), (req, res) => {
  try {
    for (const id of Array.isArray(req.body?.ids) ? req.body.ids : []) guardWatch(String(id), req.user)
    res.status(201).json({ watch: mergeWatches(req.body?.ids, req.user.email, req.body?.name) })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.code || 'FAILED' })
  }
})
app.patch('/api/watches/:id', express.json({ limit: '2kb' }), (req, res) => {
  // Droits de la veille (créateur et administrateurs), réglages d'alerte, ou activation ; droits vérifiés avant tout
  try {
    guardWatch(req.params.id, req.user, { share: Boolean(req.body?.access) })
  } catch (err) {
    return res.status(err.status).json({ error: err.code })
  }
  const watch = req.body?.access
    ? setWatchAccess(req.params.id, req.body.access)
    : req.body?.alert
      ? setWatchAlert(req.params.id, req.body.alert)
      : setEnabled(req.params.id, req.body?.enabled)
  if (!watch) return res.status(404).json({ error: 'NO_WATCH' })
  res.json({ watch })
})
app.delete('/api/watches/:id', (req, res) => {
  try {
    guardWatch(req.params.id, req.user)
  } catch (err) {
    return res.status(err.status).json({ error: err.code })
  }
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

// Radar intelligent : sujets émergents, histoires reprises, baromètre du sentiment, alertes classées.
// Calculs en mémoire, gardés 60 s par combinaison de paramètres pour rester instantanés à plusieurs postes.
const radarCache = new Map()
// Vues courantes du radar préparées en arrière-plan à chaque nouvelle version des données (server/radarWorker.js)
const radarReady = startRadarWorker(getItems)
const RADAR_VIEWS = {
  '/emerging': (items, { hours }) => ({ topics: emergingTopics(items, { hours: hours || 24 }) }),
  '/stories': (items, { hours }) => ({ stories: storyClusters(items, { hours: hours || 48 }) }),
  '/sentiment': (items, { days }) => sentimentBarometer(items, { days: days || 14 }),
  '/alerts': (items) => ({ alerts: smartAlerts(items) }),
}
/** Vue du radar (view : '/emerging', '/stories', '/sentiment', '/alerts'), servie aussi aux tableaux partagés */
function radarData(view, q) {
  const cache = getItems()
  const flux = q.flux === 'libye' || q.flux === 'mosaique' ? q.flux : ''
  const hours = Math.min(Math.max(Number(q.hours) || 0, 0), 336)
  const days = Math.min(Math.max(Number(q.days) || 0, 0), 90)
  const key = `${view}|${flux}|${hours}|${days}|${cache.lastUpdate}`
  const hit = radarCache.get(key)
  if (hit && Date.now() - hit.at < 60_000) return hit.data
  const ready = flux ? null : radarReady(view, hours, days, cache.lastUpdate)
  const items = flux && !ready ? cache.items.filter((it) => it.flux === flux) : cache.items
  const data = { ...(ready || RADAR_VIEWS[view](items, { hours, days })), lastUpdate: cache.lastUpdate, demo: cache.demo }
  if (radarCache.size > 200) radarCache.clear()
  radarCache.set(key, { at: Date.now(), data })
  return data
}
for (const view of Object.keys(RADAR_VIEWS))
  app.get(`/api/radar${view}`, (req, res) => {
    const data = radarData(view, req.query)
    // Alertes : état de traitement de chaque alerte (accusé, attribution, validation, clôture)
    res.json(view === '/alerts' ? { ...data, alerts: withFlow(data.alerts || []) } : data)
  })
// Traitement des alertes : étapes et historique (action « تحديد الأخبار كمُعالَجة » du profil)
initAlertFlow(path.join(root, 'data'))
setWatchAlertListener(openWatchAlert)
mountAlertFlow(app, { visibleWatches: watchIdsFor })
// لوحات التثبيت : collections d'articles épinglés, communes à l'équipe
initPinboards(path.join(root, 'data'))
mountPinboards(app, { getItems })
initMailingLists(path.join(root, 'data'))
mountMailingLists(app, {
  // Journal d'audit de la console Super Admin : qui a créé, modifié ou supprimé une liste
  audit: (req, action, target, detail) => logAudit(req.user.email, String(req.ip || '').replace(/^::ffff:/, ''), action, target, detail),
})
mountRasd(app, { getItems, telegramReady, sendTelegram, logDispatch })
// الإعدادات الشخصية : photo de profil, nom, préférences, mot de passe
initProfile(path.join(root, 'data'))
mountProfile(app)
// Corrections d'articles, articles ajoutés à la main, approbation pour la vitrine publique
initItemEdits(path.join(root, 'data'), { changed: refreshSourcePolicy })
mountItemEdits(app, { getItems, isAdmin: (u) => (u?.role || 'admin') === 'admin' })
// سجل الإرسال : envois des veilles, alertes du radar, briefing et rapports
app.get('/api/watches/history', (_req, res) => res.json({ rows: dispatchHistory() }))

// Résumé par l'IA d'une histoire ou d'un sujet émergent du radar (même moteur et même cache que les pics)
let radarAiRunning = false
app.post('/api/radar/explain', express.json({ limit: '2kb' }), async (req, res) => {
  if (!aiEnabled()) return res.status(400).json({ error: 'NO_KEY' })
  const cache = getItems()
  const flux = req.body?.flux === 'libye' || req.body?.flux === 'mosaique' ? req.body.flux : ''
  const items = flux ? cache.items.filter((it) => it.flux === flux) : cache.items
  const hours = Math.min(Math.max(Number(req.body?.hours) || 48, 1), 336)
  const key = String(req.body?.key || '').slice(0, 300)
  let target = null
  if (req.body?.kind === 'story') {
    const story = storyClusters(items, { hours, limit: 40 }).find((s) => s.id === key)
    if (story) target = { key: `radar|story|${story.id}|${story.size}`, label: story.title, count: story.size, avg: 0, ids: story.items.map((it) => it.id) }
  } else if (req.body?.kind === 'topic') {
    const topic = emergingTopics(items, { hours: Math.min(hours, 72), limit: 30 }).find((t) => t.key === key)
    if (topic) target = { key: `radar|topic|${topic.key}|${topic.recent}`, label: topic.label, count: topic.recent, avg: topic.baseline, ids: topic.sample.map((it) => it.id) }
  }
  if (!target) return res.status(404).json({ error: 'NOT_FOUND' })
  if (radarAiRunning) return res.status(429).json({ error: 'BUSY' })
  radarAiRunning = true
  try {
    const found = target.ids.map((id) => cache.byId.get(id)).filter(Boolean)
    res.json({ result: await explainSpike({ key: target.key, label: target.label, count: target.count, avg: target.avg, items: found }) })
  } catch (err) {
    console.error('Radar, résumé IA :', err.message)
    res.status(500).json({ error: err.code || 'FAILED', message: err.message })
  } finally {
    radarAiRunning = false
  }
})

// Tableaux de bord composés par les clients, communs à tous les postes : data/dashboards.json
const BOARDS_FILE = path.join(root, 'data', 'dashboards.json')
const TYPES = new Set(['news', 'bars', 'columns', 'pie', 'line', 'kpi', 'table', 'cloud', 'tone', 'emerging', 'stories', 'alerts', 'mood', 'timeline', 'treemap', 'feed', 'text'])
const DIMS = ['channels', 'categories', 'sources', 'flux', 'tones', 'people', 'orgs', 'places', 'languages', 'media', 'countries', 'regions']
const STYLES = ['area', 'stacked', 'line', 'bars']
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
        // Source de données : recherche enregistrée (veille) et/ou mots-clés ; comparaison de veilles (courbe)
        q: str(w.q, 300),
        watch: str(w.watch, 40),
        compare: (Array.isArray(w.compare) ? w.compare : []).map((x) => str(x, 40)).filter(Boolean).slice(0, 4),
        channel: str(w.channel, 60),
        step: STEPS.includes(w.step) ? w.step : 'day',
        split: SPLITS.includes(w.split) ? w.split : '',
        style: STYLES.includes(w.style) ? w.style : 'area',
        text: str(w.text, 1000),
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

app.get('/api/dashboards', (_req, res) => res.json({ boards: readBoards() }))

app.put('/api/dashboards', express.json({ limit: '300kb' }), (req, res) => {
  const boards = cleanBoards(req.body?.boards)
  if (!boards) return res.status(400).json({ error: 'INVALID' })
  fs.mkdirSync(path.dirname(BOARDS_FILE), { recursive: true })
  fs.writeFileSync(BOARDS_FILE, JSON.stringify({ savedAt: new Date().toISOString(), intel: true, boards }, null, 2))
  res.json({ boards })
})

// الحضور في إجابات الذكاء الاصطناعي : questions du client posées à l'IA configurée, réponses et mesures gardées
mountGeo(app, path.join(root, 'data'), { aiEnabled, aiRun: aroundRun, getItems })
// مجمع البحث : catalogue des sources reçues (lecture)
mountCatalog(app)

const dist = path.join(root, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

// Route d'API inconnue : réponse JSON (pas de page d'erreur HTML d'Express)
app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }))

// Erreurs (JSON malformé, corps trop gros…) : réponse JSON courte, jamais de trace de pile
app.use((err, req, res, _next) => {
  const status = Number(err.status || err.statusCode) || 500
  if (status >= 500) console.error(`${req.method} ${req.path} :`, err.message)
  if (res.headersSent) return res.end()
  res.status(status).json({ error: status === 413 ? 'TOO_LARGE' : status < 500 ? 'BAD_REQUEST' : 'FAILED' })
})

startWatches(path.join(root, 'data'))
startBriefing(path.join(root, 'data'))
startRadarAlerts(path.join(root, 'data'), getItems, { sendTelegram, telegramReady, sendMail, canSend: canSendAlert, onSent: (r) => logDispatch({ kind: 'radar', name: r.names.slice(0, 3).join(' · '), count: r.count, channels: r.channels, recipients: r.recipients }) })

// Sur le VPS, MMS_HOST=127.0.0.1 : seul nginx (HTTPS) parle au serveur
const HOST = process.env.MMS_HOST || undefined
app.listen(PORT, HOST, () => {
  console.log(`MMS en écoute sur http://${HOST || 'localhost'}:${PORT}`)
  console.log(`  Mosaïque FM : ${process.env.MOSAIQUE_DATA_DIR}`)
  console.log(`  Libye       : ${process.env.LIBYE_DATA_DIR}`)
})
