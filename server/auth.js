import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { permsOf } from './permissions.js'
import { mfaRequired, newSecret, otpauthUri, recoveryCodes, useRecovery, verifyTotp } from './mfa.js'

/**
 * Connexion à MMS : comptes dans data/users.json (mots de passe hachés avec scrypt, jamais en clair),
 * sessions par cookie HttpOnly gardées dans data/sessions.json pour survivre aux redémarrages.
 */

const COOKIE = 'mms_session'
const SHORT_MS = 12 * 3600_000
const LONG_MS = 30 * 86_400_000
const MAX_FAILS = 5
const LOCK_MS = 15 * 60_000
// Tous identifiants confondus : au-delà de 20 échecs en 15 min, l'adresse IP est bloquée (essais en rafale)
const MAX_IP_FAILS = 20

let usersFile = ''
let sessionsFile = ''
let sessions = new Map()
const fails = new Map()
const ipFails = new Map() // ip → { count, at }

// Les compteurs d'échecs expirés sont oubliés : la mémoire ne grossit pas avec les essais
setInterval(() => {
  const now = Date.now()
  for (const m of [fails, ipFails]) for (const [k, f] of m) if (now - f.at >= LOCK_MS) m.delete(k)
}, 5 * 60_000).unref()

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

/** Écriture atomique (fichier temporaire puis renommage) : un arrêt brutal ne laisse jamais un fichier à moitié écrit */
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function writeUsers(users) {
  writeAtomic(usersFile, JSON.stringify({ users }, null, 2))
}

function saveSessions() {
  const now = Date.now()
  for (const [k, s] of sessions) if (s.expires < now) sessions.delete(k)
  writeAtomic(sessionsFile, JSON.stringify([...sessions.entries()]))
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
// Nom affiché : celui du compte, sinon tiré de l'adresse (w.farhat@npdc.gov.ly → W. Farhat), jamais l'adresse entière
export function displayName(u) {
  const name = String(u.name || '').trim()
  if (name && !name.includes('@')) return name
  const local = String(u.username && !u.username.includes('@') ? u.username : u.email || '').split('@')[0]
  const parts = local.split(/[._\-\s]+/).filter(Boolean)
  if (!parts.length) return local
  // Le nom seulement : « w.farhat » donne « Farhat » (les initiales seules sont laissées de côté)
  const words = parts.some((w) => w.length > 1) ? parts.filter((w) => w.length > 1) : parts
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}
// profile : profil de permissions attribué par le Super Admin ('' = celui du rôle)
const publicUser = (u) => ({ email: u.email, name: displayName(u), role: roleOf(u), profile: u.profile || '' })

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

// Connexions en attente du code de double authentification : jeton → compte (5 minutes, 5 essais)
const tickets = new Map()
const TICKET_MS = 5 * 60_000

/** Ouvre la session (cookie) après mot de passe, et code si la double authentification est active */
function openSession(req, res, user, remember, ip, ua, detail = '') {
  const token = crypto.randomBytes(32).toString('base64url')
  const ttl = remember ? LONG_MS : SHORT_MS
  sessions.set(token, { email: user.email, expires: Date.now() + ttl, at: Date.now(), ip, ua })
  saveSessions()
  onAuthEvent('login_ok', { ip, ua, login: user.email, detail })
  setCookie(res, token, ttl, req.secure)
  const pub = publicUser(user)
  res.json({ user: { ...pub, perms: permsOf(pub), mfa: mfaStateOf(user) } })
}

/** État de la double authentification d'un compte, pour l'interface */
export function mfaStateOf(user) {
  const enabled = Boolean(user?.totp?.secret)
  const required = mfaRequired(user)
  return { enabled, required, setup: required && !enabled, recoveryLeft: enabled ? (user.totp.recovery || []).length : 0 }
}

export function loginRoute(req, res) {
  const { login, password, remember } = req.body || {}
  // Identifiant et mot de passe : du texte seulement (pas de tableau ni d'objet JSON)
  if (typeof login !== 'string' || typeof password !== 'string' || login.length > 200 || password.length > 1000) return res.status(400).json({ error: 'BAD_REQUEST' })
  const ip = req.ip || ''
  const key = `${ip}|${login.toLowerCase()}`
  const f = fails.get(key)
  const fi = ipFails.get(ip)
  const ua = String(req.headers['user-agent'] || '').slice(0, 200)
  if ((f && f.count >= MAX_FAILS && Date.now() - f.at < LOCK_MS) || (fi && fi.count >= MAX_IP_FAILS && Date.now() - fi.at < LOCK_MS)) {
    onAuthEvent('locked', { ip, ua, login })
    return res.status(429).json({ error: 'LOCKED' })
  }
  const user = findUser(login)
  // Même temps de calcul que le compte existe ou non
  const ok = user ? checkPassword(user, password) : (hashPassword(password || ''), false)
  if (!ok) {
    fails.set(key, { count: (f && Date.now() - f.at < LOCK_MS ? f.count : 0) + 1, at: Date.now() })
    ipFails.set(ip, { count: (fi && Date.now() - fi.at < LOCK_MS ? fi.count : 0) + 1, at: Date.now() })
    onAuthEvent('login_fail', { ip, ua, login })
    return res.status(401).json({ error: 'BAD_CREDENTIALS' })
  }
  // Compte désactivé par le Super Admin
  if (user.disabled) {
    onAuthEvent('login_disabled', { ip, ua, login: user.email })
    return res.status(403).json({ error: 'DISABLED' })
  }
  fails.delete(key)
  // Double authentification active : la session ne s'ouvre qu'avec le code (ou un code de secours)
  if (user.totp?.secret) {
    for (const [t, v] of tickets) if (Date.now() - v.at > TICKET_MS) tickets.delete(t)
    const ticket = crypto.randomBytes(24).toString('base64url')
    tickets.set(ticket, { email: user.email, remember: Boolean(remember), ip, ua, at: Date.now(), tries: 0 })
    onAuthEvent('mfa_asked', { ip, ua, login: user.email })
    return res.json({ mfa: 'code', ticket })
  }
  openSession(req, res, user, remember, ip, ua)
}

/** Deuxième étape de la connexion : code à 6 chiffres ou code de secours */
export function mfaLoginRoute(req, res) {
  const { ticket, code } = req.body || {}
  const t = typeof ticket === 'string' && tickets.get(ticket)
  const ip = req.ip || ''
  const ua = String(req.headers['user-agent'] || '').slice(0, 200)
  if (!t || Date.now() - t.at > TICKET_MS || t.ip !== ip) return res.status(401).json({ error: 'EXPIRED' })
  if (typeof code !== 'string' || code.length > 40) return res.status(400).json({ error: 'BAD_REQUEST' })
  const users = readUsers()
  const user = users.find((u) => u.email === t.email)
  if (!user?.totp?.secret || user.disabled) {
    tickets.delete(ticket)
    return res.status(401).json({ error: 'EXPIRED' })
  }
  const step = verifyTotp(user.totp.secret, code, { lastStep: user.totp.lastStep ?? -1 })
  let detail = 'mfa'
  if (step >= 0) user.totp.lastStep = step
  else {
    const left = useRecovery(user.totp.recovery, code)
    if (!left) {
      t.tries++
      onAuthEvent('mfa_fail', { ip, ua, login: user.email })
      if (t.tries >= 5) tickets.delete(ticket)
      return res.status(401).json({ error: 'BAD_CODE', left: Math.max(5 - t.tries, 0) })
    }
    user.totp.recovery = left
    detail = 'mfa_recovery'
  }
  writeUsers(users)
  tickets.delete(ticket)
  openSession(req, res, user, t.remember, ip, ua, detail)
}

/** Compte de la session (objet complet de users.json), ou null */
function sessionUser(req) {
  const token = readCookie(req)
  const s = token && sessions.get(token)
  if (!s || s.expires < Date.now()) return null
  const users = readUsers()
  const user = users.find((u) => u.email === s.email && !u.disabled)
  return user ? { users, user } : null
}

/** Activation, étape 1 : nouvelle clé (pas encore active) et adresse otpauth:// */
export function mfaSetupRoute(req, res) {
  const found = sessionUser(req)
  if (!found) return res.status(401).json({ error: 'AUTH' })
  const { users, user } = found
  user.totpPending = { secret: newSecret(), at: new Date().toISOString() }
  writeUsers(users)
  res.json({ secret: user.totpPending.secret, uri: otpauthUri(user.totpPending.secret, user.email) })
}

/** Activation, étape 2 : le premier code valide active la clé ; 10 codes de secours renvoyés une seule fois */
export function mfaEnableRoute(req, res) {
  const found = sessionUser(req)
  if (!found) return res.status(401).json({ error: 'AUTH' })
  const { users, user } = found
  const pending = user.totpPending
  const step = pending ? verifyTotp(pending.secret, req.body?.code) : -1
  if (step < 0) return res.status(400).json({ error: 'BAD_CODE' })
  const { codes, hashes } = recoveryCodes()
  user.totp = { secret: pending.secret, enabledAt: new Date().toISOString(), lastStep: step, recovery: hashes }
  delete user.totpPending
  writeUsers(users)
  onAuthEvent('mfa_enabled', { ip: req.ip || '', ua: String(req.headers['user-agent'] || '').slice(0, 200), login: user.email })
  res.json({ ok: true, recovery: codes, mfa: mfaStateOf(user) })
}

/** Désactivation par le titulaire (avec un code valide), seulement si la règle ne l'impose pas à son compte */
export function mfaDisableRoute(req, res) {
  const found = sessionUser(req)
  if (!found) return res.status(401).json({ error: 'AUTH' })
  const { users, user } = found
  if (mfaRequired(user)) return res.status(403).json({ error: 'REQUIRED' })
  if (!user.totp?.secret || verifyTotp(user.totp.secret, req.body?.code, { lastStep: user.totp.lastStep ?? -1 }) < 0) return res.status(400).json({ error: 'BAD_CODE' })
  delete user.totp
  writeUsers(users)
  onAuthEvent('mfa_disabled', { ip: req.ip || '', ua: String(req.headers['user-agent'] || '').slice(0, 200), login: user.email })
  res.json({ ok: true, mfa: mfaStateOf(user) })
}

/** Réinitialisation par le Super Admin (appareil perdu, plus de code de secours) */
export function resetMfa(email) {
  const users = readUsers()
  const user = users.find((u) => u.email.toLowerCase() === String(email).toLowerCase())
  if (!user) return false
  delete user.totp
  delete user.totpPending
  writeUsers(users)
  return true
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
  // Double authentification exigée mais pas encore activée : seule l'activation est permise (personne n'est bloqué dehors)
  const raw = findUser(user.email)
  if (raw && mfaRequired(raw) && !raw.totp?.secret) return res.status(403).json({ error: 'MFA_SETUP' })
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
