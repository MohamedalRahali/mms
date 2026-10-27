import fs from 'node:fs'
import path from 'node:path'

/**
 * Journaux de la console Super Admin, dans data/superadmin/ :
 *   access/AAAA-MM-JJ.jsonl    chaque requête (date, IP, utilisateur, page, statut, volume)
 *   activity/AAAA-MM-JJ.jsonl  ce que font les utilisateurs (connexion, recherche, filtres, articles…)
 *   security.jsonl             connexions réussies ou non, blocages
 *   audit.jsonl                actions du Super Admin (jamais visibles dans la plateforme)
 * Les 30 derniers jours restent en mémoire ; les fichiers de plus de 90 jours sont effacés.
 * Pays des adresses IP : ipwho.is, une seule fois par adresse (cache dans geo.json). MMS_GEO=0 le coupe.
 */

const KEEP_DAYS = 30
const PURGE_DAYS = 90
const MAX_ACCESS = 400_000
const ONLINE_MS = 5 * 60_000

let dir = ''
const mem = { access: [], activity: [], security: [], audit: [] }
const pending = { access: [], activity: [], security: [], audit: [] }
const lastSeen = new Map() // email → { t, ip }
let geo = {}
let geoDirty = false
const geoQueue = []
const geoQueued = new Set()

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli', year: 'numeric', month: '2-digit', day: '2-digit' })
export const tunisDay = (t) => dayKey.format(new Date(t))
const hourKey = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Tripoli', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
/** { wd: 0-6 (dimanche = 0), h: 0-23 } à l'heure de Tunis */
export function tunisHour(t) {
  const parts = hourKey.formatToParts(new Date(t))
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((p) => p.type === 'weekday')?.value)
  return { wd, h: Number(parts.find((p) => p.type === 'hour')?.value) || 0 }
}

function readLines(file) {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

function loadDaily(kind) {
  const d = path.join(dir, kind)
  fs.mkdirSync(d, { recursive: true })
  const files = fs.readdirSync(d).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort()
  const purgeBefore = tunisDay(Date.now() - PURGE_DAYS * 86_400_000)
  const keepFrom = Date.now() - KEEP_DAYS * 86_400_000
  const rows = []
  for (const f of files) {
    if (f.slice(0, 10) < purgeBefore) {
      fs.rmSync(path.join(d, f), { force: true })
      continue
    }
    for (const r of readLines(path.join(d, f))) if (r.t >= keepFrom) rows.push(r)
  }
  return rows
}

export function initMonitor(dataDir) {
  dir = path.join(dataDir, 'superadmin')
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  mem.access = loadDaily('access').slice(-MAX_ACCESS)
  mem.activity = loadDaily('activity')
  mem.security = readLines(path.join(dir, 'security.jsonl')).slice(-50_000)
  mem.audit = readLines(path.join(dir, 'audit.jsonl')).slice(-50_000)
  for (const r of mem.access) if (r.u) lastSeen.set(r.u, { t: r.t, ip: r.ip })
  try {
    geo = JSON.parse(fs.readFileSync(path.join(dir, 'geo.json'), 'utf8'))
  } catch {
    geo = {}
  }
  setInterval(flush, 2000).unref()
  setInterval(trim, 3600_000).unref()
  setInterval(geoTick, 1500).unref()
}

function flush() {
  for (const kind of Object.keys(pending)) {
    const rows = pending[kind]
    if (!rows.length) continue
    pending[kind] = []
    const byFile = new Map()
    for (const r of rows) {
      const file = kind === 'security' || kind === 'audit' ? path.join(dir, `${kind}.jsonl`) : path.join(dir, kind, `${tunisDay(r.t)}.jsonl`)
      byFile.set(file, (byFile.get(file) || '') + JSON.stringify(r) + '\n')
    }
    for (const [file, text] of byFile) fs.appendFile(file, text, () => {})
  }
  if (geoDirty) {
    geoDirty = false
    fs.writeFile(path.join(dir, 'geo.json'), JSON.stringify(geo), () => {})
  }
}

function trim() {
  const from = Date.now() - KEEP_DAYS * 86_400_000
  mem.access = mem.access.filter((r) => r.t >= from).slice(-MAX_ACCESS)
  mem.activity = mem.activity.filter((r) => r.t >= from)
}

function push(kind, row) {
  mem[kind].push(row)
  pending[kind].push(row)
  if (kind === 'access' && mem.access.length > MAX_ACCESS * 1.1) mem.access = mem.access.slice(-MAX_ACCESS)
}

export const all = (kind) => mem[kind]

export function logAccess(row) {
  push('access', row)
  if (row.u) lastSeen.set(row.u, { t: row.t, ip: row.ip })
  queueGeo(row.ip)
}

// Une même action répétée dans la minute (pages suivantes, rafraîchissements) n'est notée qu'une fois
const recent = new Map()
export function logActivity(u, ip, type, detail = '') {
  const d = String(detail).slice(0, 300)
  const sig = `${u}|${type}|${d}`
  const now = Date.now()
  if (now - (recent.get(sig) || 0) < 60_000) return
  recent.set(sig, now)
  if (recent.size > 5000) for (const [k, t] of recent) if (now - t > 60_000) recent.delete(k)
  push('activity', { t: now, u, ip, type, detail: d })
}

export function logSecurity(type, { ip = '', ua = '', login = '', detail = '' } = {}) {
  push('security', { t: Date.now(), type, ip, ua: String(ua).slice(0, 200), login: String(login).slice(0, 120), detail: String(detail).slice(0, 300) })
  queueGeo(ip)
}

export function logAudit(actor, ip, action, target = '', detail = '') {
  push('audit', { t: Date.now(), actor, ip, action, target: String(target).slice(0, 200), detail: String(detail).slice(0, 500) })
}

export const isOnline = (email) => Date.now() - (lastSeen.get(email)?.t || 0) < ONLINE_MS
export const lastSeenOf = (email) => lastSeen.get(email) || null
export function onlineUsers() {
  const now = Date.now()
  return [...lastSeen.entries()].filter(([, s]) => now - s.t < ONLINE_MS).map(([email, s]) => ({ email, ...s }))
}

/** Efface l'historique d'un compte (suppression « avec son historique ») */
export function purgeUser(email) {
  const keep = (r) => r.u !== email
  mem.access = mem.access.filter(keep)
  mem.activity = mem.activity.filter(keep)
  lastSeen.delete(email)
  for (const kind of ['access', 'activity']) {
    const d = path.join(dir, kind)
    for (const f of fs.readdirSync(d).filter((f) => f.endsWith('.jsonl'))) {
      const file = path.join(d, f)
      const rows = readLines(file)
      const kept = rows.filter(keep)
      if (kept.length !== rows.length) fs.writeFileSync(file, kept.map((r) => JSON.stringify(r)).join('\n') + (kept.length ? '\n' : ''))
    }
  }
}

/** Temps passé par jour (Tunis) : les écarts de moins de 5 minutes entre deux requêtes comptent, une requête isolée vaut 30 s */
export function timeByDay(email, days = 30) {
  const from = Date.now() - days * 86_400_000
  const ts = mem.access.filter((r) => r.u === email && r.t >= from).map((r) => r.t)
  const out = new Map()
  for (let i = 0; i < ts.length; i++) {
    const gap = i ? ts[i] - ts[i - 1] : Infinity
    const add = gap <= ONLINE_MS ? gap : 30_000
    const d = tunisDay(ts[i])
    out.set(d, (out.get(d) || 0) + add)
  }
  return out
}

/** Temps passé par compte depuis « from » */
export function timeByUser(from) {
  const last = new Map()
  const total = new Map()
  for (const r of mem.access) {
    if (!r.u || r.t < from) continue
    const prev = last.get(r.u)
    const gap = prev ? r.t - prev : Infinity
    total.set(r.u, (total.get(r.u) || 0) + (gap <= ONLINE_MS ? gap : 30_000))
    last.set(r.u, r.t)
  }
  return total
}

/* ---------------------------------------------------------------- pays des adresses IP */

const PRIVATE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc|fd|fe80)/i
const cleanIp = (ip) => String(ip || '').replace(/^::ffff:/, '')

export function geoOf(ip) {
  const a = cleanIp(ip)
  if (!a) return null
  if (PRIVATE.test(a)) return { cc: 'LAN', country: 'Réseau local' }
  return geo[a] || null
}
export const countryOf = (ip) => geoOf(ip)?.cc || ''

function queueGeo(ip) {
  const a = cleanIp(ip)
  if (!a || PRIVATE.test(a) || geo[a] || geoQueued.has(a) || process.env.MMS_GEO === '0') return
  if (geoQueue.length > 500) return
  geoQueued.add(a)
  geoQueue.push(a)
}

async function lookup(ip = '') {
  const res = await fetch(`https://ipwho.is/${ip}`, { signal: AbortSignal.timeout(8000) })
  const j = await res.json()
  if (!j.success) throw new Error(j.message || 'geo')
  return { ip: j.ip, cc: j.country_code || '', country: j.country || '', city: j.city || '', isp: j.connection?.isp || j.connection?.org || '', at: Date.now() }
}

let geoBusy = false
async function geoTick() {
  if (geoBusy || !geoQueue.length) return
  geoBusy = true
  const ip = geoQueue.shift()
  try {
    geo[ip] = await lookup(ip)
    geoDirty = true
  } catch {
    // Nouvel essai à la prochaine requête de cette adresse
  } finally {
    geoQueued.delete(ip)
    geoBusy = false
  }
}

let self = null
/** Hébergement du serveur (adresse publique, pays, fournisseur), relu toutes les 6 heures */
export async function serverGeo() {
  if (self && Date.now() - self.at < 6 * 3600_000) return self
  if (process.env.MMS_GEO === '0') return null
  try {
    self = await lookup()
  } catch {
    /* pas de réseau sortant : on réessaiera */
  }
  return self
}
