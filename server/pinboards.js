import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { clipOf, excerptOf } from './broadcast.js'
import { compileQuery, searchText } from './query.js'

/**
 * لوحات التثبيت (tableaux d'épingles) : collections d'articles épinglés, communes à l'équipe (comme les étiquettes).
 * Chaque tableau a un nom, une description, une couleur, un groupe facultatif et un épinglage automatique facultatif
 * (requête booléenne + date limite : les nouvelles fiches qui correspondent sont épinglées toutes les 5 minutes).
 * Épinglage en masse de la sélection, export CSV, filtre « tableau d'épingles » dans la liste des actualités.
 * Lecture pour tous les profils qui ont les actualités ; création, épinglage et suppression pour ceux qui ont
 * l'action « tags » (analystes et administrateurs par défaut). Stockage : data/pinboards.json.
 */

const MAX_BOARDS = 100
const MAX_ITEMS = 500
let file = ''
let boards = []

export function initPinboards(dataDir) {
  file = path.join(dataDir, 'pinboards.json')
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).boards
    boards = Array.isArray(saved) ? saved : []
  } catch {
    boards = []
  }
}

function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ boards }))
  fs.renameSync(tmp, file)
}

const fail = (code, status = 400) => Object.assign(new Error(code), { code, status })
const COLOR_RE = /^#[0-9a-f]{6}$/i
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const summary = (b) => ({
  id: b.id,
  name: b.name,
  description: b.description || '',
  color: b.color || '',
  group: b.group || '',
  rule: b.rule || null,
  createdBy: b.createdBy,
  createdAt: b.createdAt,
  count: b.items.length,
  updatedAt: b.updatedAt,
  lastPinnedAt: b.items[0]?.addedAt || null,
})

/** Réglages modifiables d'un tableau, vérifiés (la requête d'épinglage automatique doit être valide) */
function cleanSettings(body, current = {}) {
  const out = {}
  if (body.name !== undefined) {
    const n = String(body.name || '').trim().slice(0, 80)
    if (!n) throw fail('NO_NAME')
    out.name = n
  }
  if (body.description !== undefined) out.description = String(body.description || '').trim().slice(0, 400)
  if (body.color !== undefined) out.color = COLOR_RE.test(String(body.color || '')) ? String(body.color) : ''
  if (body.group !== undefined) out.group = String(body.group || '').trim().slice(0, 60)
  if (body.rule !== undefined) {
    const query = String(body.rule?.query || '').trim().slice(0, 500)
    if (!query) out.rule = null
    else {
      if (!compileQuery(query)) throw fail('BAD_QUERY')
      const until = DAY_RE.test(String(body.rule?.until || '')) ? String(body.rule.until) : ''
      // Point de départ : les fiches publiées après l'activation (ou la modification) de la règle
      out.rule = { query, until, since: current.rule?.query === query && current.rule?.since ? current.rule.since : new Date().toISOString() }
    }
  }
  return out
}

export const listPinboards = () => boards.map(summary)
export const pinboard = (id) => boards.find((b) => b.id === id) || null

export function createPinboard(name, by, settings = {}) {
  const n = String(name || '').trim().slice(0, 80)
  if (!n) throw fail('NO_NAME')
  if (boards.length >= MAX_BOARDS) throw fail('TOO_MANY')
  const extra = cleanSettings({ ...settings, name: n })
  const b = { id: crypto.randomBytes(5).toString('hex'), ...extra, name: n, createdBy: String(by || '').slice(0, 120), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), items: [] }
  boards.push(b)
  save()
  return summary(b)
}

export function updatePinboard(id, body) {
  const b = pinboard(id)
  if (!b) throw fail('NOT_FOUND', 404)
  Object.assign(b, cleanSettings(body || {}, b))
  b.updatedAt = new Date().toISOString()
  save()
  return summary(b)
}

/** Copie des champs utiles d'une fiche pour l'épingler */
const pinnedCopy = (it, by) => ({ key: it.url || it.id, id: it.id, title: it.title, summary: String(it.summary || '').slice(0, 400), url: it.url, origin: it.origin, channel: it.channel, date: it.date, tone: it.tone || '', addedBy: String(by || '').slice(0, 120), addedAt: new Date().toISOString() })

/** Épinglage en masse (sélection de la liste) : renvoie le nombre d'articles ajoutés */
export function pinMany(id, items, by) {
  const b = pinboard(id)
  if (!b) throw fail('NOT_FOUND', 404)
  const have = new Set(b.items.map((x) => x.key))
  let added = 0
  for (const it of items) {
    if (!it || have.has(it.url || it.id)) continue
    if (b.items.length >= MAX_ITEMS) break
    b.items.unshift(pinnedCopy(it, by))
    have.add(it.url || it.id)
    added++
  }
  if (added) {
    b.updatedAt = new Date().toISOString()
    save()
  }
  return { board: summary(b), added, full: b.items.length >= MAX_ITEMS }
}

/** Épinglage automatique : fiches publiées depuis l'activation de la règle, jusqu'à sa date limite (heure de Tripoli) */
export function autoPin(items, now = Date.now()) {
  const today = new Date(now + 2 * 3_600_000).toISOString().slice(0, 10)
  let total = 0
  for (const b of boards) {
    if (!b.rule?.query || (b.rule.until && b.rule.until < today) || b.items.length >= MAX_ITEMS) continue
    const match = compileQuery(b.rule.query)
    if (!match) continue
    const since = Date.parse(b.rule.since || b.createdAt)
    const found = items.filter((it) => Date.parse(it.date) >= since && match(searchText(it)))
    const have = new Set(b.items.map((x) => x.key))
    const fresh = found.filter((it) => !have.has(it.url || it.id)).sort((x, y) => x.date.localeCompare(y.date))
    for (const it of fresh) {
      if (b.items.length >= MAX_ITEMS) break
      b.items.unshift(pinnedCopy(it, 'auto'))
      total++
    }
    if (fresh.length) b.updatedAt = new Date(now).toISOString()
  }
  if (total) save()
  return total
}

/** Clés des articles d'un tableau, pour le filtre de la liste des actualités */
export const pinnedKeys = (id) => new Set((pinboard(id)?.items || []).map((x) => x.key))

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`
export function pinboardCsv(id) {
  const b = pinboard(id)
  if (!b) throw fail('NOT_FOUND', 404)
  const head = ['title', 'source', 'channel', 'date', 'url', 'tone', 'summary', 'added_by', 'added_at']
  const rows = b.items.map((x) => [x.title, x.origin, x.channel, x.date, x.url, x.tone, x.summary, x.addedBy, x.addedAt].map(csvCell).join(','))
  return { name: b.name, csv: `\uFEFF${head.join(',')}\n${rows.join('\n')}\n` }
}

export function deletePinboard(id) {
  const before = boards.length
  boards = boards.filter((b) => b.id !== id)
  if (boards.length === before) return false
  save()
  return true
}

/** Épingle une fiche (copie de ses champs utiles : elle reste lisible même si la fiche sort de la base) */
export function pinItem(id, it, by) {
  const b = pinboard(id)
  if (!b) throw fail('NOT_FOUND', 404)
  if (!it) throw fail('NO_ITEM', 404)
  const key = it.url || it.id
  if (!b.items.some((x) => x.key === key)) {
    if (b.items.length >= MAX_ITEMS) throw fail('FULL')
    b.items.unshift({ key, id: it.id, title: it.title, summary: String(it.summary || '').slice(0, 400), url: it.url, origin: it.origin, channel: it.channel, date: it.date, tone: it.tone || '', addedBy: String(by || '').slice(0, 120), addedAt: new Date().toISOString() })
    b.updatedAt = new Date().toISOString()
    save()
  }
  return summary(b)
}

/** Épingle un extrait choisi (début / fin) d'une tranche de diffusion : texte des passages, lien vers l'extrait */
export function pinClip(id, it, start, end, by) {
  const b = pinboard(id)
  if (!b) throw fail('NOT_FOUND', 404)
  if (!it || it.media !== 'broadcast') throw fail('NO_ITEM', 404)
  const ex = excerptOf(clipOf(it), start, end)
  if (!ex) throw fail('EMPTY_RANGE')
  const key = `clip:${it.id}:${ex.start}-${ex.end}`
  if (!b.items.some((x) => x.key === key)) {
    if (b.items.length >= MAX_ITEMS) throw fail('FULL')
    b.items.unshift({
      key,
      id: it.id,
      kind: 'clip',
      title: String(it.title || '').slice(0, 300),
      summary: ex.text.slice(0, 1500),
      url: `/?clip=${encodeURIComponent(it.id)}&t=${ex.start}&e=${ex.end}`,
      origin: it.origin,
      channel: it.channel,
      date: ex.from,
      to: ex.to,
      seconds: ex.seconds,
      tone: it.tone || '',
      addedBy: String(by || '').slice(0, 120),
      addedAt: new Date().toISOString(),
    })
    b.updatedAt = new Date().toISOString()
    save()
  }
  return summary(b)
}

export function unpinItem(id, key) {
  const b = pinboard(id)
  if (!b) throw fail('NOT_FOUND', 404)
  b.items = b.items.filter((x) => x.key !== key)
  b.updatedAt = new Date().toISOString()
  save()
  return summary(b)
}

export function mountPinboards(app, { getItems }) {
  const wrap = (fn) => (req, res) => {
    try {
      res.json(fn(req))
    } catch (err) {
      res.status(err.status || 500).json({ error: err.code || 'FAILED' })
    }
  }
  app.get('/api/pinboards', (_req, res) => res.json({ boards: listPinboards() }))
  app.get('/api/pinboards/:id', (req, res) => {
    const b = pinboard(String(req.params.id))
    if (!b) return res.status(404).json({ error: 'NOT_FOUND' })
    res.json({ board: { ...summary(b), items: b.items } })
  })
  app.post('/api/pinboards', express.json({ limit: '4kb' }), wrap((req) => ({ board: createPinboard(req.body?.name, req.user.email, req.body || {}) })))
  app.put('/api/pinboards/:id', express.json({ limit: '4kb' }), wrap((req) => ({ board: updatePinboard(String(req.params.id), req.body) })))
  app.post('/api/pinboards/:id/items/bulk', express.json({ limit: '64kb' }), wrap((req) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).slice(0, MAX_ITEMS).map(String)
    const byId = getItems().byId
    return pinMany(String(req.params.id), ids.map((x) => byId.get(x)).filter(Boolean), req.user.email)
  }))
  app.get('/api/pinboards/:id/export.csv', (req, res) => {
    try {
      const { name, csv } = pinboardCsv(String(req.params.id))
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="pinboard.csv"; filename*=UTF-8''${encodeURIComponent(name)}.csv`)
      res.send(csv)
    } catch (err) {
      res.status(err.status || 500).json({ error: err.code || 'FAILED' })
    }
  })
  // Épinglage automatique : toutes les 5 minutes (première passe une minute après le démarrage)
  const tick = () => {
    try {
      autoPin(getItems().items)
    } catch (err) {
      console.error(`لوحات التثبيت : ${err.message}`)
    }
  }
  setTimeout(tick, 60_000).unref?.()
  setInterval(tick, 5 * 60_000).unref?.()
  app.delete('/api/pinboards/:id', wrap((req) => {
    if (!deletePinboard(String(req.params.id))) throw fail('NOT_FOUND', 404)
    return { ok: true }
  }))
  app.post('/api/pinboards/:id/items', express.json({ limit: '2kb' }), wrap((req) => ({ board: pinItem(String(req.params.id), getItems().byId.get(String(req.body?.id || '')), req.user.email) })))
  app.post('/api/pinboards/:id/clips', express.json({ limit: '2kb' }), wrap((req) => ({ board: pinClip(String(req.params.id), getItems().byId.get(String(req.body?.id || '')), req.body?.start, req.body?.end, req.user.email) })))
  app.delete('/api/pinboards/:id/items', express.json({ limit: '2kb' }), wrap((req) => ({ board: unpinItem(String(req.params.id), String(req.body?.key || req.query.key || '')) })))
}
