import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'

/**
 * لوحات التثبيت (tableaux d'épingles) : collections d'articles épinglés, communes à l'équipe (comme les étiquettes).
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
const summary = (b) => ({ id: b.id, name: b.name, createdBy: b.createdBy, createdAt: b.createdAt, count: b.items.length, updatedAt: b.updatedAt })

export const listPinboards = () => boards.map(summary)
export const pinboard = (id) => boards.find((b) => b.id === id) || null

export function createPinboard(name, by) {
  const n = String(name || '').trim().slice(0, 80)
  if (!n) throw fail('NO_NAME')
  if (boards.length >= MAX_BOARDS) throw fail('TOO_MANY')
  const b = { id: crypto.randomBytes(5).toString('hex'), name: n, createdBy: String(by || '').slice(0, 120), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), items: [] }
  boards.push(b)
  save()
  return summary(b)
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
  app.post('/api/pinboards', express.json({ limit: '2kb' }), wrap((req) => ({ board: createPinboard(req.body?.name, req.user.email) })))
  app.delete('/api/pinboards/:id', wrap((req) => {
    if (!deletePinboard(String(req.params.id))) throw fail('NOT_FOUND', 404)
    return { ok: true }
  }))
  app.post('/api/pinboards/:id/items', express.json({ limit: '2kb' }), wrap((req) => ({ board: pinItem(String(req.params.id), getItems().byId.get(String(req.body?.id || '')), req.user.email) })))
  app.delete('/api/pinboards/:id/items', express.json({ limit: '2kb' }), wrap((req) => ({ board: unpinItem(String(req.params.id), String(req.body?.key || req.query.key || '')) })))
}
