import fs from 'node:fs'
import path from 'node:path'
import express from 'express'

/**
 * Traitement des alertes du radar (معالجة التنبيهات) : accusé de réception, attribution, commentaire, escalade,
 * validation par un analyste, clôture, avec l'historique de chaque étape (qui, quand, quoi).
 * Option (console Super Admin) : les alertes critiques ne partent par e-mail / Telegram qu'après validation.
 * Stockage : data/alert-flow.json (états, 2 000 alertes au plus) et data/superadmin/alert-review.json (option).
 */

export const STATUSES = ['new', 'ack', 'assigned', 'escalated', 'validated', 'closed']
const MAX = 2000
let file = ''
let optFile = ''
let flows = {}
let review = { critical: false }

export function initAlertFlow(dataDir) {
  file = path.join(dataDir, 'alert-flow.json')
  optFile = path.join(dataDir, 'superadmin', 'alert-review.json')
  try {
    flows = JSON.parse(fs.readFileSync(file, 'utf8')).flows || {}
  } catch {
    flows = {}
  }
  try {
    review = { critical: JSON.parse(fs.readFileSync(optFile, 'utf8')).critical === true }
  } catch {
    review = { critical: false }
  }
}

function save() {
  const keys = Object.keys(flows)
  if (keys.length > MAX) {
    keys.sort((a, b) => (flows[a].updatedAt || '').localeCompare(flows[b].updatedAt || ''))
    for (const k of keys.slice(0, keys.length - MAX)) delete flows[k]
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ flows }))
  fs.renameSync(tmp, file)
}

export const reviewOption = () => ({ ...review })
export function setReviewOption(v) {
  review = { critical: v?.critical === true }
  fs.mkdirSync(path.dirname(optFile), { recursive: true })
  fs.writeFileSync(optFile, JSON.stringify({ ...review, savedAt: new Date().toISOString() }))
  return reviewOption()
}

export const flowOf = (id) => flows[id] || null

/** Ajoute l'état de traitement à chaque alerte */
export const withFlow = (alerts) => alerts.map((a) => ({ ...a, flow: flows[a.id] || { status: 'new', history: [] } }))

/** Nouvelle étape : statut, personne assignée, commentaire */
export function updateFlow(id, { status, assignee, comment }, by) {
  const key = String(id || '').slice(0, 300)
  if (!key) throw Object.assign(new Error('NO_ID'), { code: 'NO_ID', status: 400 })
  const st = STATUSES.includes(status) ? status : null
  const f = flows[key] || { status: 'new', assignee: '', history: [] }
  if (st) f.status = st
  if (assignee !== undefined) f.assignee = String(assignee || '').slice(0, 120)
  const note = String(comment || '').trim().slice(0, 1000)
  f.history = [...(f.history || []), { at: new Date().toISOString(), by: String(by || '').slice(0, 120), status: f.status, ...(assignee !== undefined ? { assignee: f.assignee } : {}), ...(note ? { comment: note } : {}) }].slice(-50)
  f.updatedAt = new Date().toISOString()
  flows[key] = f
  save()
  return f
}

/** Une alerte critique peut-elle partir automatiquement ? (validation exigée ou non) */
export const canSendAlert = (a) => !review.critical || flows[a.id]?.status === 'validated'

export function mountAlertFlow(app) {
  app.post('/api/radar/alerts/:id', express.json({ limit: '4kb' }), (req, res) => {
    try {
      res.json({ flow: updateFlow(req.params.id, req.body || {}, req.user.name || req.user.email) })
    } catch (err) {
      res.status(err.status || 500).json({ error: err.code || 'FAILED' })
    }
  })
}
