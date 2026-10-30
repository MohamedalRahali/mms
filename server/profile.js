import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { changePassword, readUsers, writeUsers } from './auth.js'
import { logSecurity } from './monitor.js'

/**
 * الإعدادات الشخصية : photo de profil, nom affiché, préférences, changement de mot de passe.
 *
 * Photo : PNG, JPEG ou WebP, 2 Mo au plus, vérifiée par ses premiers octets (pas seulement l'extension ni le type
 * annoncé) ; SVG et tout autre format refusés (risque de script). Fichier rangé sous un nom tiré de l'e-mail
 * (empreinte), jamais du nom envoyé, et servi seulement aux utilisateurs connectés, avec nosniff.
 */

const MAX_BYTES = 2 * 1024 * 1024
const TYPES = [
  { type: 'image/png', ext: 'png', test: (b) => b.length > 8 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG' },
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/webp', ext: 'webp', test: (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
]
const PREF_KEYS = { fold: 'boolean', images: 'boolean', summaries: 'boolean', notifications: 'boolean', lang: ['ar', 'en'], palette: ['cnsd', 'mms', 'marine', 'bordeaux'] }
let dir = ''
const uploads = new Map() // email → [dates] : 10 envois par heure au plus
const pwTries = new Map() // email → [dates] : 5 essais par 15 minutes au plus

export const avatarKey = (email) => crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 24)
const fileOf = (key) => {
  for (const t of TYPES) {
    const f = path.join(dir, `${key}.${t.ext}`)
    if (fs.existsSync(f)) return { file: f, type: t.type }
  }
  return null
}
/** Adresse de la photo d'un utilisateur (avec sa date, pour le cache), ou '' */
export function avatarUrl(email) {
  if (!dir) return ''
  const key = avatarKey(email)
  const f = fileOf(key)
  return f ? `/api/profile/avatar/${key}?v=${Math.floor(fs.statSync(f.file).mtimeMs)}` : ''
}

export function detectImage(buf) {
  return TYPES.find((t) => t.test(buf)) || null
}

const limited = (map, key, max, windowMs) => {
  const now = Date.now()
  const list = (map.get(key) || []).filter((t) => now - t < windowMs)
  if (list.length >= max) return true
  list.push(now)
  map.set(key, list)
  return false
}

const cleanPrefs = (p) => {
  const out = {}
  for (const [k, kind] of Object.entries(PREF_KEYS)) {
    const v = p?.[k]
    if (Array.isArray(kind) ? kind.includes(v) : typeof v === kind) out[k] = v
  }
  return out
}

export function initProfile(dataDir) {
  dir = path.join(dataDir, 'avatars')
  fs.mkdirSync(dir, { recursive: true })
}

export function mountProfile(app) {
  const who = (req) => readUsers().find((u) => u.email === req.user.email)
  const ip = (req) => String(req.ip || '').replace(/^::ffff:/, '')
  const ua = (req) => String(req.headers['user-agent'] || '').slice(0, 200)

  app.get('/api/profile', (req, res) => {
    const u = who(req)
    if (!u) return res.status(404).json({ error: 'NOT_FOUND' })
    res.json({ email: u.email, name: u.name || '', role: u.role || 'admin', avatar: avatarUrl(u.email), prefs: u.prefs || {}, passwordChangedAt: u.passwordChangedAt || null })
  })

  app.put('/api/profile', express.json({ limit: '4kb' }), (req, res) => {
    const users = readUsers()
    const u = users.find((x) => x.email === req.user.email)
    if (!u) return res.status(404).json({ error: 'NOT_FOUND' })
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').replace(/[<>]/g, '').trim().slice(0, 80)
      if (!name) return res.status(400).json({ error: 'NO_NAME' })
      u.name = name
    }
    if (req.body?.prefs !== undefined) u.prefs = { ...(u.prefs || {}), ...cleanPrefs(req.body.prefs) }
    writeUsers(users)
    res.json({ name: u.name, prefs: u.prefs || {} })
  })

  // Photo : corps brut (image), vérifiée par ses premiers octets
  app.post('/api/profile/avatar', express.raw({ type: () => true, limit: MAX_BYTES + 1 }), (req, res) => {
    const email = req.user.email
    if (limited(uploads, email, 10, 3_600_000)) return res.status(429).json({ error: 'TOO_MANY' })
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
    if (!buf.length) return res.status(400).json({ error: 'EMPTY' })
    if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'TOO_BIG' })
    const t = detectImage(buf)
    if (!t) return res.status(415).json({ error: 'BAD_TYPE' })
    const key = avatarKey(email)
    for (const x of TYPES) fs.rmSync(path.join(dir, `${key}.${x.ext}`), { force: true })
    fs.writeFileSync(path.join(dir, `${key}.${t.ext}`), buf)
    logSecurity('avatar_set', { ip: ip(req), ua: ua(req), login: email, detail: `${t.type} ${buf.length} o` })
    res.json({ avatar: avatarUrl(email) })
  })
  app.delete('/api/profile/avatar', (req, res) => {
    const key = avatarKey(req.user.email)
    for (const x of TYPES) fs.rmSync(path.join(dir, `${key}.${x.ext}`), { force: true })
    res.json({ avatar: '' })
  })
  app.get('/api/profile/avatar/:key', (req, res) => {
    const key = String(req.params.key)
    if (!/^[a-f0-9]{24}$/.test(key)) return res.status(404).end()
    const f = fileOf(key)
    if (!f) return res.status(404).end()
    res.setHeader('Content-Type', f.type)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'private, max-age=86400')
    res.setHeader('Content-Security-Policy', "default-src 'none'")
    fs.createReadStream(f.file).pipe(res)
  })

  // Mot de passe : l'actuel est demandé ; 10 caractères au moins ; les autres sessions du compte sont fermées
  app.post('/api/profile/password', express.json({ limit: '2kb' }), (req, res) => {
    const email = req.user.email
    const { current, next } = req.body || {}
    if (typeof current !== 'string' || typeof next !== 'string' || next.length > 200) return res.status(400).json({ error: 'BAD_REQUEST' })
    if (limited(pwTries, email, 5, 15 * 60_000)) return res.status(429).json({ error: 'TOO_MANY' })
    try {
      const closed = changePassword(req, email, current, next)
      logSecurity('password_changed', { ip: ip(req), ua: ua(req), login: email, detail: `${closed} autre(s) session(s) fermée(s)` })
      res.json({ ok: true, closed })
    } catch (err) {
      if (err.code === 'BAD_PASSWORD') logSecurity('password_change_fail', { ip: ip(req), ua: ua(req), login: email })
      res.status(err.status || 400).json({ error: err.code || 'FAILED' })
    }
  })
}
