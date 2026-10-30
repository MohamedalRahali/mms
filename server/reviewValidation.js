import fs from 'node:fs'
import path from 'node:path'
import express from 'express'

/**
 * Revue de presse validée par un analyste (audit produit v4, recommandation P2 « modèle pressrelations ») :
 * un analyste relit la revue du jour J et la valide ; l'engagement est une heure limite de livraison le lendemain
 * (08:00 heure de Tripoli par défaut, réglée par l'administrateur). Statut affiché : validée à temps, validée en
 * retard, en retard (pas encore validée), à valider. Chaque validation est aussi dans le journal d'audit (middleware).
 *
 *   data/review-validation.json  { deadline: "HH:MM", days: { "AAAA-MM-JJ": { by, at, note, count } } }
 */

let file = ''
let state = { deadline: '08:00', days: {} }
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

export function initReviewValidation(dataDir) {
  file = path.join(dataDir, 'review-validation.json')
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'))
    state = { deadline: HHMM.test(s.deadline) ? s.deadline : '08:00', days: s.days && typeof s.days === 'object' ? s.days : {} }
  } catch {
    state = { deadline: '08:00', days: {} }
  }
}

function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1))
  fs.renameSync(tmp, file)
}

/** Heure limite de la revue du jour `day` : le lendemain à l'heure d'engagement (Tripoli, UTC+2 toute l'année) */
export function dueAt(day, deadline = state.deadline) {
  const next = new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  return new Date(`${next}T${deadline}:00+02:00`).toISOString()
}

/** Statut de la revue d'un jour : validated_on_time | validated_late | overdue | pending */
export function reviewStatus(day, now = Date.now(), s = state) {
  const due = dueAt(day, s.deadline)
  const v = s.days[day]
  const status = v ? (Date.parse(v.at) <= Date.parse(due) ? 'validated_on_time' : 'validated_late') : now > Date.parse(due) ? 'overdue' : 'pending'
  return { day, due, deadline: s.deadline, status, validation: v || null }
}

export function validateReview(day, by, { note = '', count = 0 } = {}, now = new Date()) {
  if (!DAY.test(String(day))) throw Object.assign(new Error('BAD_DAY'), { status: 400 })
  state.days[day] = { by: String(by || '').slice(0, 120), at: now.toISOString(), note: String(note || '').slice(0, 500), count: Number(count) || 0 }
  // 400 jours gardés
  const keys = Object.keys(state.days).sort()
  for (const k of keys.slice(0, Math.max(keys.length - 400, 0))) delete state.days[k]
  save()
  return reviewStatus(day, now.getTime())
}

export function setDeadline(value) {
  if (!HHMM.test(String(value))) throw Object.assign(new Error('BAD_DEADLINE'), { status: 400 })
  state.deadline = value
  save()
  return state.deadline
}

/** Taux de livraison à l'heure sur les `days` derniers jours validés ou dus */
export function onTimeRate(days = 30, now = Date.now()) {
  let due = 0
  let ok = 0
  // Seulement depuis la première validation : les jours d'avant la mise en place ne comptent pas
  const first = Object.keys(state.days).sort()[0]
  if (!first) return { due: 0, onTime: 0, rate: null }
  for (let k = 1; k <= days; k++) {
    const day = new Date(now - k * 86_400_000 + 2 * 3_600_000).toISOString().slice(0, 10)
    const st = reviewStatus(day, now)
    if (st.status === 'pending') continue
    if (day < first) continue
    due++
    if (st.status === 'validated_on_time') ok++
  }
  return { due, onTime: ok, rate: due ? Math.round((ok / due) * 100) : null }
}

export function mountReviewValidation(app) {
  const fail = (res, err) => res.status(err.status || 500).json({ error: err.message || 'FAILED' })
  app.get('/api/report/validation', (req, res) => {
    const day = DAY.test(String(req.query.day)) ? String(req.query.day) : new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10)
    res.json({ ...reviewStatus(day), rate: onTimeRate() })
  })
  // Validation : analystes et administrateurs (pas les lecteurs)
  app.post('/api/report/validation', express.json({ limit: '4kb' }), (req, res) => {
    if (!['analyst', 'admin'].includes(req.user?.role)) return res.status(403).json({ error: 'FORBIDDEN' })
    try {
      res.json(validateReview(req.body?.day, req.user.email, { note: req.body?.note, count: req.body?.count }))
    } catch (err) {
      fail(res, err)
    }
  })
  app.put('/api/report/validation/deadline', express.json({ limit: '1kb' }), (req, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' })
    try {
      res.json({ deadline: setDeadline(req.body?.deadline) })
    } catch (err) {
      fail(res, err)
    }
  })
}
