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

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')
  return { salt, hash }
}

function readUsers() {
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

const publicUser = (u) => ({ email: u.email, name: u.name || u.username || u.email })

/** Session en cours, ou null */
export function currentUser(req) {
  const token = readCookie(req)
  const s = token && sessions.get(token)
  if (!s || s.expires < Date.now()) return null
  const user = findUser(s.email)
  return user ? publicUser(user) : null
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
  if (f && f.count >= MAX_FAILS && Date.now() - f.at < LOCK_MS) return res.status(429).json({ error: 'LOCKED' })
  const user = findUser(login)
  // Même temps de calcul que le compte existe ou non
  const ok = user ? checkPassword(user, password) : (hashPassword(password || ''), false)
  if (!ok) {
    fails.set(key, { count: (f && Date.now() - f.at < LOCK_MS ? f.count : 0) + 1, at: Date.now() })
    return res.status(401).json({ error: 'BAD_CREDENTIALS' })
  }
  fails.delete(key)
  const token = crypto.randomBytes(32).toString('base64url')
  const ttl = remember ? LONG_MS : SHORT_MS
  sessions.set(token, { email: user.email, expires: Date.now() + ttl })
  saveSessions()
  setCookie(res, token, ttl, req.secure)
  res.json({ user: publicUser(user) })
}

export function logoutRoute(req, res) {
  const token = readCookie(req)
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
