import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Clés d'API des clients (واجهة برمجية للقراءة), créées et révoquées dans la console Super Admin.
 *
 * - Clé « mms_ » + 256 bits aléatoires, montrée une seule fois ; seule son empreinte SHA-256 est gardée
 *   (data/superadmin/apikeys.json).
 * - Lecture seule : GET /api/v1/news (actualités filtrées en JSON). La clé passe dans l'en-tête
 *   « Authorization: Bearer … » ou « X-API-Key », jamais dans l'adresse (elle finirait dans les journaux).
 * - Limite de débit par clé : N appels par minute (60 par défaut) et 2 000 par jour.
 */

const MAX_KEYS = 50
const DAY_LIMIT = 2000
let file = ''
let keys = []
const hits = new Map() // id → { minute: [dates], day, dayKey }

export function initApiKeys(dir) {
  file = path.join(dir, 'apikeys.json')
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).keys
    keys = Array.isArray(saved) ? saved.filter((k) => k && typeof k.hash === 'string') : []
  } catch {
    keys = []
  }
}

function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ keys }, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

const sha = (k) => crypto.createHash('sha256').update(String(k)).digest('hex')
const publicKey = (k) => ({ id: k.id, name: k.name, prefix: k.prefix, rate: k.rate, createdAt: k.createdAt, revokedAt: k.revokedAt || null, lastUsedAt: k.lastUsedAt || null, calls: k.calls || 0 })

export const listApiKeys = () => keys.map(publicKey).reverse()

export function createApiKey({ name, rate }) {
  if (keys.filter((k) => !k.revokedAt).length >= MAX_KEYS) throw Object.assign(new Error('TOO_MANY'), { code: 'TOO_MANY', status: 400 })
  const label = String(name || '').trim().slice(0, 80)
  if (!label) throw Object.assign(new Error('NO_NAME'), { code: 'NO_NAME', status: 400 })
  const key = `mms_${crypto.randomBytes(32).toString('base64url')}`
  const row = {
    id: crypto.randomBytes(6).toString('hex'),
    name: label,
    hash: sha(key),
    prefix: key.slice(0, 10),
    rate: Math.min(Math.max(Math.round(Number(rate) || 60), 1), 600),
    createdAt: new Date().toISOString(),
    revokedAt: null,
    calls: 0,
  }
  keys.push(row)
  save()
  return { key, row: publicKey(row) }
}

export function revokeApiKey(id) {
  const k = keys.find((x) => x.id === id)
  if (!k) return null
  if (!k.revokedAt) {
    k.revokedAt = new Date().toISOString()
    save()
  }
  return publicKey(k)
}

/** Clé lue dans les en-têtes de la requête */
export function keyFromRequest(req) {
  const auth = String(req.headers.authorization || '')
  const m = /^Bearer\s+(\S+)$/i.exec(auth)
  return m ? m[1] : String(req.headers['x-api-key'] || '')
}

/** Clé active correspondante, ou null */
export function apiKeyFor(key) {
  if (!/^mms_[A-Za-z0-9_-]{43}$/.test(String(key || ''))) return null
  const h = Buffer.from(sha(key), 'hex')
  const k = keys.find((x) => crypto.timingSafeEqual(Buffer.from(x.hash, 'hex'), h))
  return k && !k.revokedAt ? k : null
}

let lastSave = 0
/** Compte l'appel ; renvoie '' s'il est permis, sinon 'RATE_MINUTE' ou 'RATE_DAY' */
export function takeCall(k, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10)
  let h = hits.get(k.id)
  if (!h || h.dayKey !== day) hits.set(k.id, (h = { minute: h?.minute || [], day: 0, dayKey: day }))
  h.minute = h.minute.filter((t) => now - t < 60_000)
  if (h.minute.length >= k.rate) return 'RATE_MINUTE'
  if (h.day >= DAY_LIMIT) return 'RATE_DAY'
  h.minute.push(now)
  h.day++
  k.calls = (k.calls || 0) + 1
  k.lastUsedAt = new Date(now).toISOString()
  if (now - lastSave > 60_000) {
    lastSave = now
    save()
  }
  return ''
}

/** Champs d'une fiche exposés par l'API */
export const apiItem = (it, extra) => ({
  id: it.id,
  title: it.title,
  summary: it.summary,
  url: it.url,
  date: it.date,
  source: it.origin,
  channel: it.channel,
  media: it.media || 'article',
  lang: it.lang,
  category: it.category,
  tone: it.tone || '',
  ...extra,
})
