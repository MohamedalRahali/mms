import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Connexion à MMS : comptes dans data/users.json (mots de passe hachés avec scrypt, jamais en clair),
 * sessions par cookie HttpOnly gardées dans data/sessions.json pour survivre aux redémarrages.
 */

const COOKIE = 'mms_session'
const SHORT_MS = 12 * 3600_000
const LONG_MS = 30 * 86_400_000
const MAX_FAILS = 5
const LOCK_MS = 15 * 60_000

let usersFile = ''
let sessionsFile = ''
let sessions = new Map()
const fails = new Map()

// Console Super Admin : reçoit les connexions réussies ou non (journal de sécurité)
let onAuthEvent = () => {}
export const setAuthListener = (fn) => (onAuthEvent = fn)

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')
  return { salt, hash }
}

export function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(usersFile, 'utf8')).users || []
  } catch {
    return []
  }
}

export function writeUsers(users) {
  fs.mkdirSync(path.dirname(usersFile), { recursive: true })
  fs.writeFileSync(usersFile, JSON.stringify({ users }, null, 2))
}

function saveSessions() {
  const now = Date.now()
  for (const [k, s] of sessions) if (s.expires < now) sessions.delete(k)
  fs.mkdirSync(path.dirname(sessionsFile), { recursive: true })
  fs.writeFileSync(sessionsFile, JSON.stringify([...sessions.entries()]))
}

export function initAuth(dataDir) {
  usersFile = path.join(dataDir, 'users.json')
  sessionsFile = path.join(dataDir, 'sessions.json')
  try {
    sessions = new Map(JSON.parse(fs.readFileSync(sessionsFile, 'utf8')))
  } catch {
    sessions = new Map()
  }
  if (!readUsers().length) console.warn('Aucun compte dans data/users.json : ajoutez-en avec « node server/users.js add <email> »')
}

function findUser(login) {
  const key = String(login || '')
    .trim()
    .toLowerCase()
  if (!key) return null
  return readUsers().find((u) => u.email.toLowerCase() === key || (u.username || '').toLowerCase() === key) || null
}

function checkPassword(user, password) {
  const { hash } = hashPassword(password, user.salt)
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(user.hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function readCookie(req) {
  const raw = req.headers.cookie || ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE) return decodeURIComponent(v.join('='))
  }
  return ''
}

// Rôles d'équipe : admin (tout, y compris les comptes), analyst (crée veilles, tableaux, étiquettes), viewer (lecture seule).
// Les comptes créés avant les rôles restent administrateurs.
export const ROLES = ['viewer', 'analyst', 'admin']
const roleOf = (u) => (ROLES.includes(u.role) ? u.role : 'admin')
const publicUser = (u) => ({ email: u.email, name: u.name || u.username || u.email, role: roleOf(u) })

/** Session en cours, ou null */
export function currentUser(req) {
  const token = readCookie(req)
  const s = token && sessions.get(token)
  if (!s || s.expires < Date.now()) return null
  const user = findUser(s.email)
  return user && !user.disabled ? publicUser(user) : null
}

function setCookie(res, token, maxAgeMs, secure) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`]
  if (secure) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

export function loginRoute(req, res) {
  const { login, password, remember } = req.body || {}
  const ip = req.ip || ''
  const key = `${ip}|${String(login || '').toLowerCase()}`
  const f = fails.get(key)
  const ua = String(req.headers['user-agent'] || '').slice(0, 200)
  if (f && f.count >= MAX_FAILS && Date.now() - f.at < LOCK_MS) {
    onAuthEvent('locked', { ip, ua, login })
    return res.status(429).json({ error: 'LOCKED' })
  }
  const user = findUser(login)
  // Même temps de calcul que le compte existe ou non
  const ok = user ? checkPassword(user, password) : (hashPassword(password || ''), false)
  if (!ok) {
    fails.set(key, { count: (f && Date.now() - f.at < LOCK_MS ? f.count : 0) + 1, at: Date.now() })
    onAuthEvent('login_fail', { ip, ua, login })
    return res.status(401).json({ error: 'BAD_CREDENTIALS' })
  }
  // Compte désactivé par le Super Admin
  if (user.disabled) {
    onAuthEvent('login_disabled', { ip, ua, login: user.email })
    return res.status(403).json({ error: 'DISABLED' })
  }
  fails.delete(key)
  const token = crypto.randomBytes(32).toString('base64url')
  const ttl = remember ? LONG_MS : SHORT_MS
  sessions.set(token, { email: user.email, expires: Date.now() + ttl, at: Date.now(), ip, ua })
  saveSessions()
  onAuthEvent('login_ok', { ip, ua, login: user.email })
  setCookie(res, token, ttl, req.secure)
  res.json({ user: publicUser(user) })
}

export function logoutRoute(req, res) {
  const token = readCookie(req)
  const s = token && sessions.get(token)
  if (s) onAuthEvent('logout', { ip: req.ip || '', ua: String(req.headers['user-agent'] || '').slice(0, 200), login: s.email })
  if (token && sessions.delete(token)) saveSessions()
  setCookie(res, '', 0, req.secure)
  res.json({ ok: true })
}

/** Toute l'API demande une session, sauf la connexion elle-même */
export function requireAuth(req, res, next) {
  if (req.path.startsWith('/auth/')) return next()
  const user = currentUser(req)
  if (!user) return res.status(401).json({ error: 'AUTH' })
  req.user = user
  next()
}

/** Le rôle de la session atteint-il « min » ? */
export const hasRole = (user, min) => ROLES.indexOf(user?.role) >= ROLES.indexOf(min)

export function requireRole(min) {
  return (req, res, next) => (hasRole(req.user, min) ? next() : res.status(403).json({ error: 'FORBIDDEN' }))
}

/* ---------------------------------------------------------------- gestion de l'équipe (administrateurs) */

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const fail = (code, status = 400) => Object.assign(new Error(code), { code, status })

export const listUsers = () => readUsers().map((u) => ({ ...publicUser(u), createdAt: u.createdAt || null }))

/** Crée ou modifie un compte ; le mot de passe n'est jamais renvoyé ni gardé en clair */
export function saveUser(body, isNew) {
  const email = String(body?.email || '')
    .trim()
    .toLowerCase()
  if (!EMAIL_RE.test(email)) throw fail('BAD_EMAIL')
  const users = readUsers()
  const existing = users.find((u) => u.email.toLowerCase() === email)
  if (isNew && existing) throw fail('EXISTS', 409)
  if (!isNew && !existing) throw fail('NOT_FOUND', 404)
  const role = body?.role === undefined && existing ? roleOf(existing) : ROLES.includes(body?.role) ? body.role : 'viewer'
  const password = body?.password ? String(body.password) : ''
  if (isNew && password.length < 8) throw fail('SHORT_PASSWORD')
  if (password && password.length < 8) throw fail('SHORT_PASSWORD')
  const next = {
    ...(existing || { email, username: email, createdAt: new Date().toISOString() }),
    name: String(body?.name ?? existing?.name ?? email).slice(0, 80) || email,
    role,
    ...(password ? hashPassword(password) : {}),
  }
  const others = users.filter((u) => u.email.toLowerCase() !== email)
  if (!hasRole({ role: next.role }, 'admin') && !others.some((u) => roleOf(u) === 'admin')) throw fail('LAST_ADMIN')
  writeUsers([...others, next])
  // Mot de passe changé : les autres sessions de ce compte sont fermées
  if (password && existing) {
    for (const [k, s] of sessions) if (s.email.toLowerCase() === email) sessions.delete(k)
    saveSessions()
  }
  return publicUser(next)
}

export function deleteUser(email, self) {
  const key = String(email || '').toLowerCase()
  if (key === String(self || '').toLowerCase()) throw fail('SELF')
  const users = readUsers()
  if (!users.some((u) => u.email.toLowerCase() === key)) throw fail('NOT_FOUND', 404)
  const others = users.filter((u) => u.email.toLowerCase() !== key)
  if (!others.some((u) => roleOf(u) === 'admin')) throw fail('LAST_ADMIN')
  writeUsers(others)
  for (const [k, s] of sessions) if (s.email.toLowerCase() === key) sessions.delete(k)
  saveSessions()
}

/* ---------------------------------------------------------------- console Super Admin */

/** Sessions ouvertes d'un compte (sans le jeton) */
export function userSessions(email) {
  const key = String(email || '').toLowerCase()
  const now = Date.now()
  return [...sessions.values()].filter((s) => s.email.toLowerCase() === key && s.expires > now).map(({ at, expires, ip, ua }) => ({ at, expires, ip: ip || '', ua: ua || '' }))
}

/** Ferme toutes les sessions d'un compte (tous ses appareils) ; renvoie leur nombre */
export function closeSessions(email) {
  const key = String(email || '').toLowerCase()
  let n = 0
  for (const [k, s] of sessions) if (s.email.toLowerCase() === key && sessions.delete(k)) n++
  if (n) saveSessions()
  return n
}
