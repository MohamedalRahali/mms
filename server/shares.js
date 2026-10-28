import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Partage d'un tableau de bord par lien, en lecture seule (رابط مشاركة).
 *
 * - Jeton aléatoire de 256 bits (43 caractères base64url) ; seule son empreinte SHA-256 est gardée dans data/shares.json :
 *   le lien complet n'est montré qu'une fois, à sa création.
 * - Chaque lien a une date d'expiration (1 à 90 jours) et peut être révoqué à tout moment ; un lien expiré ou révoqué
 *   répond comme un lien inconnu.
 * - Le lien ne donne accès qu'aux données des widgets de ce tableau (voir publicShareQuery) : ni la liste complète des
 *   actualités, ni la recherche, ni aucune autre page.
 */

const MAX_SHARES = 200
const DAYS = [1, 7, 30, 90]
let file = ''
let shares = []

export function initShares(dir) {
  file = path.join(dir, 'shares.json')
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).shares
    shares = Array.isArray(saved) ? saved.filter((s) => s && typeof s.hash === 'string' && typeof s.id === 'string') : []
  } catch {
    shares = []
  }
}

function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ shares }, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

const sha = (token) => crypto.createHash('sha256').update(String(token)).digest('hex')
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export const statusOf = (s, now = Date.now()) => (s.revokedAt ? 'revoked' : Date.parse(s.expiresAt) <= now ? 'expired' : 'active')
const publicRow = (s) => ({ id: s.id, boardId: s.boardId, boardName: s.boardName, createdBy: s.createdBy, createdAt: s.createdAt, expiresAt: s.expiresAt, revokedAt: s.revokedAt || null, views: s.views || 0, lastViewAt: s.lastViewAt || null, status: statusOf(s) })

export const listShares = () => shares.map(publicRow).reverse()

function fail(code, status = 400) {
  return Object.assign(new Error(code), { code, status })
}

/** Nouveau lien ; renvoie la ligne publique et le jeton (montré une seule fois) */
/** Options d'affichage du lien public : titre, thème, langue, défilement automatique des fils, pied de page */
export function cleanShareOptions(o) {
  return {
    title: String(o?.title || '').trim().slice(0, 120),
    theme: o?.theme === 'light' ? 'light' : o?.theme === 'dark' ? 'dark' : '',
    lang: o?.lang === 'en' ? 'en' : 'ar',
    autoscroll: o?.autoscroll === true,
    hideFooter: o?.hideFooter === true,
  }
}

export function createShare({ boardId, boardName, days, by, options }) {
  const id = String(boardId || '').slice(0, 40)
  if (!id) throw fail('NO_BOARD')
  // Les liens expirés ou révoqués depuis plus de 30 jours sont oubliés
  const now = Date.now()
  shares = shares.filter((s) => statusOf(s, now) === 'active' || now - Date.parse(s.revokedAt || s.expiresAt) < 30 * 86_400_000)
  if (shares.filter((s) => statusOf(s, now) === 'active').length >= MAX_SHARES) throw fail('TOO_MANY')
  const d = DAYS.includes(Number(days)) ? Number(days) : 7
  const token = crypto.randomBytes(32).toString('base64url')
  const row = {
    id: crypto.randomBytes(6).toString('hex'),
    hash: sha(token),
    boardId: id,
    boardName: String(boardName || '').slice(0, 80),
    createdBy: String(by || '').slice(0, 120),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + d * 86_400_000).toISOString(),
    revokedAt: null,
    views: 0,
    options: cleanShareOptions(options),
  }
  shares.push(row)
  save()
  return { share: publicRow(row), token }
}

export function revokeShare(id, by) {
  const s = shares.find((x) => x.id === id)
  if (!s) return null
  if (!s.revokedAt) {
    s.revokedAt = new Date().toISOString()
    s.revokedBy = String(by || '').slice(0, 120)
    save()
  }
  return publicRow(s)
}

/** Lien actif correspondant au jeton, ou null (inconnu, expiré ou révoqué : même réponse) */
export function shareFor(token) {
  if (!TOKEN_RE.test(String(token || ''))) return null
  const h = sha(token)
  const s = shares.find((x) => crypto.timingSafeEqual(Buffer.from(x.hash, 'hex'), Buffer.from(h, 'hex')))
  return s && statusOf(s) === 'active' ? s : null
}

let lastSave = 0
export function countView(s) {
  s.views = (s.views || 0) + 1
  s.lastViewAt = new Date().toISOString()
  // Compteur écrit au plus une fois par minute
  if (Date.now() - lastSave > 60_000) {
    lastSave = Date.now()
    save()
  }
}

const RADAR_TYPES = { emerging: 'emerging', stories: 'stories', alerts: 'alerts', mood: 'sentiment' }

/** Paramètres d'un appel de données, construits seulement à partir du widget (rien n'est repris de la requête, sauf la page radar) */
function queryOfWidget(w, route, q) {
  const common = { days: String(w.days), ...(w.flux ? { flux: w.flux } : {}), ...(w.q ? { q: w.q } : {}), ...(w.watch ? { watch: w.watch } : {}), ...(w.category ? { category: w.category } : {}) }
  if (route === 'news/stats' && STATS_TYPES.has(w.type) && w.type !== 'timeline') return common
  if (route === 'news/stats' && w.type === 'treemap') return common
  if (route === 'news/timeline' && w.type === 'timeline') return { ...common, step: w.step || 'day', split: w.split || '', ...(w.compare?.length ? { compare: w.compare.join(',') } : {}) }
  if (route === 'news' && (w.type === 'news' || w.type === 'feed')) return { ...common, size: w.type === 'feed' ? '20' : '40', ...(w.channel ? { channel: w.channel } : {}) }
  const m = /^radar\/(emerging|stories|sentiment|alerts)$/.exec(route)
  if (m && RADAR_TYPES[w.type] === m[1]) {
    const out = w.flux ? { flux: w.flux } : {}
    if (q.hours) out.hours = String(Math.min(Math.max(Number(q.hours) || 24, 1), 336))
    if (q.days) out.days = String(Math.min(Math.max(Number(q.days) || 14, 1), 90))
    return out
  }
  return null
}
const STATS_TYPES = new Set(['bars', 'columns', 'pie', 'line', 'kpi', 'table', 'cloud', 'tone', 'treemap'])

/**
 * Appel de données permis par un tableau partagé, ou null. route : 'news/stats', 'news', 'radar/<vue>'.
 * Seuls les paramètres d'un widget du tableau sont gardés (période, veille, thème) ; tout le reste est ignoré.
 */
export function publicShareQuery(widgets, route, q) {
  const list0 = Array.isArray(widgets) ? widgets : []
  const byId = q.w ? list0.find((x) => x.id === String(q.w)) : null
  if (byId) return queryOfWidget(byId, route, q)
  const flux = q.flux === 'libye' ? 'libye' : ''
  const days = Number(q.days) || 0
  const list = Array.isArray(widgets) ? widgets : []
  if (route === 'news/stats') {
    const w = list.find((x) => STATS_TYPES.has(x.type) && x.days === days && (x.flux || '') === flux)
    return w ? { days: String(w.days), ...(flux ? { flux } : {}) } : null
  }
  if (route === 'news') {
    const category = String(q.category || '')
    const w = list.find((x) => x.type === 'news' && x.days === days && (x.flux || '') === flux && (x.category || '') === category)
    return w ? { days: String(w.days), size: '40', ...(flux ? { flux } : {}), ...(category ? { category } : {}) } : null
  }
  const m = /^radar\/(emerging|stories|sentiment|alerts)$/.exec(route)
  if (m) {
    const w = list.find((x) => RADAR_TYPES[x.type] === m[1] && (x.flux || '') === flux)
    if (!w) return null
    const out = flux ? { flux } : {}
    if (q.hours) out.hours = String(Math.min(Math.max(Number(q.hours) || 24, 1), 336))
    if (q.days) out.days = String(Math.min(Math.max(Number(q.days) || 14, 1), 90))
    return out
  }
  return null
}
