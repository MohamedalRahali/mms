import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/**
 * سجل التدقيق (journal d'audit, audit produit v4 constat 2) : qui a fait quoi sur la plateforme, consultable par
 * l'administrateur du client (rôle admin) dans MMS et par le Super Admin.
 *
 * Inscrit à la fin de chaque requête : connexions (réussies, refusées, compte désactivé), et toute modification
 * (POST, PUT, PATCH, DELETE) — enregistrements TV/radio, portail public, veilles et الرصد المبرمج, exports et rapports,
 * comptes et droits (console Super Admin), chaînes, réglages — ainsi que les téléchargements d'exports (GET *.csv, *.json…).
 * Jamais de mot de passe, de code ni de contenu : la méthode, le chemin, le code de réponse, le compte, l'adresse IP.
 *
 * data/audit-trail.jsonl : une ligne par action, chaînée (chaque ligne porte l'empreinte SHA-256 de la précédente) ;
 * une ligne modifiée ou retirée casse la chaîne, ce que verify() signale. 20 000 dernières lignes en mémoire.
 */

const KEEP = 20_000
let file = ''
let rows = []
let lastHash = ''

// Requêtes trop fréquentes ou sans effet, jamais inscrites
const SKIP = [/^\/api\/platform\/activity$/, /^\/api\/face\/probe$/, /^\/api\/feedback$/, /^\/api\/news\/processed$/, /^\/api\/exports\/check$/, /^\/api\/portal-feed\/preview$/, /^\/api\/ai\//, /^\/api\/support\/ticket$/, /^\/api\/superadmin\/me$/]

/** Catégorie d'une requête, ou '' si elle ne s'inscrit pas */
export function categoryOf(method, p) {
  const write = method !== 'GET' && method !== 'HEAD'
  if (/^\/api\/auth\/(login|mfa|logout)$/.test(p) || p === '/api/superadmin/login' || p === '/api/superadmin/logout') return 'login'
  if (!write) {
    // Lectures inscrites : exports et téléchargements seulement
    if (/\/export\.(csv|json)$|\.csv$|\/transcript$|\/reports\/[^/]+\/(pdf|docx|pptx)$|\/download/.test(p)) return 'export'
    return ''
  }
  if (SKIP.some((re) => re.test(p))) return ''
  if (/^\/api\/recordings/.test(p)) return 'recording'
  if (/^\/api\/portal-feed|^\/api\/items\/[^/]+\/public$/.test(p)) return 'portal'
  if (/^\/api\/(watches|rasd)/.test(p)) return 'watch'
  if (/^\/api\/(reports|briefing|shares|mailing-lists|report\/validation)/.test(p)) return 'export'
  if (/^\/api\/superadmin\/(users|permissions|face)|^\/api\/profile\/password$|^\/api\/auth\/mfa\//.test(p)) return 'users'
  if (/^\/api\/diffusion/.test(p)) return 'sources'
  if (/^\/api\/superadmin\//.test(p)) return 'settings'
  return 'other'
}

const hashOf = (prev, row) => crypto.createHash('sha256').update(prev + JSON.stringify(row)).digest('hex').slice(0, 32)

export function initAuditTrail(dataDir) {
  file = path.join(dataDir, 'audit-trail.jsonl')
  try {
    rows = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-KEEP)
      .map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } catch {
    rows = []
  }
  lastHash = rows.length ? rows[rows.length - 1].h || '' : ''
}

/** Ajoute une ligne (aussi utilisé directement pour les actions du serveur : migration, désactivation…) */
export function recordAudit({ actor = '', role = '', ip = '', category, action, target = '', status = 200, detail = '' }) {
  const row = {
    t: new Date().toISOString(),
    actor: String(actor).slice(0, 160),
    role: String(role).slice(0, 20),
    ip: String(ip).replace(/^::ffff:/, '').slice(0, 60),
    category,
    action: String(action).slice(0, 120),
    target: String(target).slice(0, 200),
    status: Number(status) || 0,
    ...(detail ? { detail: String(detail).slice(0, 300) } : {}),
  }
  row.h = hashOf(lastHash, row)
  lastHash = row.h
  rows.push(row)
  if (rows.length > KEEP) rows = rows.slice(-KEEP)
  if (!file) return row
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, JSON.stringify(row) + '\n', { mode: 0o600 })
  } catch (err) {
    console.error("Journal d'audit :", err.message)
  }
  return row
}

/** Middleware : inscrit la requête quand la réponse est partie (le compte est alors connu) */
export function auditMiddleware(req, res, next) {
  const p = String(req.path || '').toLowerCase().replace(/\/+$/, '')
  const category = p.startsWith('/api/') ? categoryOf(req.method, p) : ''
  if (!category) return next()
  // Identifiant tapé à la connexion (jamais le mot de passe)
  const typed = typeof req.body?.login === 'string' ? req.body.login : ''
  res.on('finish', () => {
    const actor = req.user?.email || (req.sa ? `superadmin:${req.sa.u}` : '') || (category === 'login' && typeof req.body?.login === 'string' ? req.body.login : typed) || ''
    const action =
      category === 'login'
        ? p.endsWith('logout')
          ? 'logout'
          : res.statusCode < 300
            ? 'login_ok'
            : res.statusCode === 403
              ? 'login_disabled'
              : 'login_failed'
        : `${req.method} ${p.replace(/^\/api\//, '')}`
    recordAudit({ actor, role: req.user?.role || (req.sa ? 'superadmin' : ''), ip: req.ip, category, action, target: req.params?.id || '', status: res.statusCode })
  })
  next()
}

/** Lignes filtrées, les plus récentes d'abord */
export function auditQuery({ category = '', actor = '', q = '', from = '', to = '', limit = 500 } = {}) {
  const f = /^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00` : ''
  const t = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999` : ''
  const needle = String(q).toLowerCase().slice(0, 100)
  const a = String(actor).toLowerCase()
  const out = []
  for (let k = rows.length - 1; k >= 0 && out.length < Math.min(Number(limit) || 500, 5000); k--) {
    const r = rows[k]
    if (category && r.category !== category) continue
    if (a && !r.actor.toLowerCase().includes(a)) continue
    if (f && r.t < f) continue
    if (t && r.t > t) continue
    if (needle && !`${r.action} ${r.target} ${r.actor} ${r.detail || ''}`.toLowerCase().includes(needle)) continue
    out.push(r)
  }
  return out
}

/** Vérifie la chaîne des empreintes ; renvoie la première ligne cassée ou -1 */
export function verifyAudit() {
  let prev = rows.length ? null : ''
  for (let k = 0; k < rows.length; k++) {
    const { h, ...row } = rows[k]
    if (prev === null) {
      prev = h // première ligne gardée en mémoire : son prédécesseur est hors fenêtre
      continue
    }
    if (hashOf(prev, row) !== h) return k
    prev = h
  }
  return -1
}

export function auditSummary() {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const byCat = {}
  const actors = new Set()
  for (const r of rows) {
    if (r.t < since) continue
    byCat[r.category] = (byCat[r.category] || 0) + 1
    if (r.actor) actors.add(r.actor)
  }
  return { total: rows.length, last7: byCat, actors: [...actors].slice(0, 200), intact: verifyAudit() === -1 }
}

export function mountAuditTrail(app) {
  // Administrateurs du client seulement (rôle admin), lecture et export
  const adminOnly = (req, res, next) => (req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'FORBIDDEN' }))
  app.get('/api/audit-trail', adminOnly, (req, res) => {
    res.json({ rows: auditQuery(req.query), summary: auditSummary() })
  })
  app.get('/api/audit-trail.csv', adminOnly, (req, res) => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = auditQuery({ ...req.query, limit: 5000 }).map((r) => [r.t, r.actor, r.role, r.ip, r.category, r.action, r.target, r.status, r.detail, r.h].map(esc).join(','))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="journal-audit-mms.csv"')
    res.send('﻿' + ['date,compte,role,ip,categorie,action,cible,statut,detail,empreinte', ...lines].join('\n'))
  })
}
