import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { closeSessions, currentUser, hashPassword, readUsers, ROLES, setAuthListener, userSessions, writeUsers } from './auth.js'
import { getItems, setHidden } from './store.js'
import { keyStatus } from './keys.js'
import { aiUsage } from './ai.js'
import { mountPermissionsAdmin, permsOf, profileExists } from './permissions.js'
import { initBrand, mountClientAdmin } from './clientAdmin.js'
import { countryOf as sourceCountry, initSourceMeta, reachIsSet, reachOf, reliabilityIsSet, reliabilityOf } from './sourceMeta.js'
import {
  all,
  countryOf,
  geoOf,
  initMonitor,
  isOnline,
  lastSeenOf,
  logAccess,
  logActivity,
  logAudit,
  logSecurity,
  onlineUsers,
  purgeUser,
  serverGeo,
  timeByDay,
  timeByUser,
  tunisDay,
  tunisHour,
} from './monitor.js'

/**
 * Console Super Admin (/superadmin) : niveau d'accès au-dessus des administrateurs de la plateforme.
 *
 * - Un seul compte, hors de data/users.json : SUPERADMIN_USER et SUPERADMIN_PASSWORD_HASH (scrypt) dans .env,
 *   écrits par « node server/superadmin-setup.js » ; rien ne se change depuis l'interface.
 * - Jeton signé (HMAC-SHA256) avec SUPERADMIN_TOKEN_KEY, une clé distincte des sessions de la plateforme,
 *   valable 12 heures, dans un cookie HttpOnly limité à /api/superadmin.
 * - 5 essais ratés en 15 minutes depuis une même IP : connexion bloquée. Chaque essai est journalisé.
 * - Blocages d'IP et de pays, mode maintenance : appliqués à toute la plateforme sauf à la console.
 */

const COOKIE = 'mms_sa'
const TTL_MS = 12 * 3600_000
const MAX_FAILS = 5
const LOCK_MS = 15 * 60_000

let dir = ''
let settings = { announcement: { on: false, text: '', level: 'info' }, maintenance: { on: false, message: '' } }
let blocks = { ips: [], countries: [] }
let muted = { origins: [], channels: [] }
let notes = {}
const revoked = new Map() // sid → expiration
const saFails = new Map() // ip → [dates]

const readJson = (name, fallback) => {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) }
  } catch {
    return fallback
  }
}
const writeJson = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2))

const ipOf = (req) => String(req.ip || '').replace(/^::ffff:/, '')
const uaOf = (req) => String(req.headers['user-agent'] || '').slice(0, 200)
const fail = (res, status, error) => res.status(status).json({ error })

function applyMuted() {
  const o = new Set(muted.origins)
  const c = new Set(muted.channels)
  setHidden(o.size || c.size ? (it) => o.has(it.origin) || c.has(it.channel) : null)
}

/* ---------------------------------------------------------------- jeton Super Admin */

const configured = () => Boolean(process.env.SUPERADMIN_USER && process.env.SUPERADMIN_PASSWORD_HASH && (process.env.SUPERADMIN_TOKEN_KEY || '').length >= 32)
const b64 = (s) => Buffer.from(s).toString('base64url')
const sign = (body) => crypto.createHmac('sha256', process.env.SUPERADMIN_TOKEN_KEY).update(body).digest('base64url')

function makeToken() {
  const now = Date.now()
  const body = b64(JSON.stringify({ u: process.env.SUPERADMIN_USER, sid: crypto.randomBytes(12).toString('hex'), iat: now, exp: now + TTL_MS }))
  return `${body}.${sign(body)}`
}

function readToken(req) {
  if (!configured()) return null
  const raw = (req.headers.cookie || '').split(';').map((p) => p.trim()).find((p) => p.startsWith(`${COOKIE}=`))
  const token = raw ? decodeURIComponent(raw.slice(COOKIE.length + 1)) : ''
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const a = Buffer.from(sig)
  const b = Buffer.from(sign(body))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (p.exp < Date.now() || p.u !== process.env.SUPERADMIN_USER || revoked.has(p.sid)) return null
    return p
  } catch {
    return null
  }
}

function setCookie(res, value, maxAgeMs, secure) {
  const parts = [`${COOKIE}=${value}`, 'Path=/api/superadmin', 'HttpOnly', 'SameSite=Strict', `Max-Age=${Math.floor(maxAgeMs / 1000)}`]
  if (secure) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest()
  const y = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(x, y)
}

function checkSuperPassword(password) {
  const [salt, hash] = String(process.env.SUPERADMIN_PASSWORD_HASH || '').split(':')
  if (!salt || !hash) return false
  const a = Buffer.from(hashPassword(String(password || ''), salt).hash, 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function recentFails(ip) {
  const list = (saFails.get(ip) || []).filter((t) => Date.now() - t < LOCK_MS)
  saFails.set(ip, list)
  return list
}

/* ---------------------------------------------------------------- outils */

function deviceOf(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|python|wget|bot|spider/i.test(ua) ? 'Robot' : 'Autre'
  const system = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Autre'
  const mobile = /Mobi|Android|iPhone|iPad/.test(ua)
  return `${browser} · ${system}${mobile ? ' · mobile' : ''}`
}

function csv(rows, cols) {
  const cell = (v) => {
    // Pas de formule Excel dans les exports (= + - @ en tête)
    const s = String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&")
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [cols.map((c) => c[0]).join(','), ...rows.map((r) => cols.map((c) => cell(c[1](r))).join(','))].join('\n')
}

const iso = (t) => new Date(t).toISOString()
const pageOf = (list, q, max = 200) => {
  const size = Math.min(Math.max(Number(q.size) || 50, 1), max)
  const pages = Math.max(Math.ceil(list.length / size), 1)
  const page = Math.min(Math.max(Number(q.page) || 1, 1), pages)
  return { total: list.length, page, pages, rows: list.slice((page - 1) * size, page * size) }
}
const lc = (s) => String(s || '').toLowerCase()
const isNpdc = (email) => lc(email).endsWith('@npdc.gov.ly')
const roleOf = (u) => (ROLES.includes(u.role) ? u.role : 'admin')

/** Échecs de connexion par identifiant et par IP sur une période */
function failsSince(from) {
  const byLogin = new Map()
  const byIp = new Map()
  for (const e of all('security')) {
    if (e.t < from || e.type !== 'login_fail') continue
    byLogin.set(lc(e.login), (byLogin.get(lc(e.login)) || 0) + 1)
    byIp.set(e.ip, (byIp.get(e.ip) || 0) + 1)
  }
  return { byLogin, byIp }
}

function userRow(u, fails) {
  const seen = lastSeenOf(u.email)
  return {
    email: u.email,
    name: u.name || u.email,
    role: roleOf(u),
    profile: u.profile || '',
    profileName: permsOf({ role: roleOf(u), profile: u.profile }).profileName,
    disabled: Boolean(u.disabled),
    mfa: Boolean(u.totp?.secret),
    createdAt: u.createdAt || null,
    online: isOnline(u.email),
    lastSeen: seen ? iso(seen.t) : null,
    lastIp: seen?.ip || '',
    country: seen ? countryOf(seen.ip) : '',
    sessions: userSessions(u.email).length,
    fails: fails.get(lc(u.email)) || 0,
    note: notes[lc(u.email)]?.text || '',
  }
}

/** Activité déduite des appels à l'API : recherche, filtres, rapports, analyses IA, exports */
const FILTER_KEYS = ['flux', 'category', 'channel', 'lang', 'source', 'tone', 'entity', 'tag', 'watch', 'days', 'important']
function deriveActivity(req, user, ip) {
  // Même normalisation qu'Express (casse, barre finale) : /api/AI/ask/ est bien journalisé
  const p = req.path.toLowerCase().replace(/\/+$/, '') || '/'
  const q = req.query || {}
  if (req.method === 'GET' && p === '/api/news') {
    if (Number(q.page || 1) > 1) return
    if (q.q) logActivity(user, ip, 'search', String(q.q))
    const f = FILTER_KEYS.filter((k) => q[k]).map((k) => `${k}=${q[k]}`)
    if (f.length) logActivity(user, ip, 'filter', f.join(' · '))
  } else if (req.method === 'GET' && p === '/api/news/export.csv') logActivity(user, ip, 'export', 'CSV')
  else if (req.method === 'GET' && (p === '/api/report' || p === '/api/briefing')) logActivity(user, ip, 'report', p === '/api/report' ? `يومي ${q.day || ''}` : `تنفيذي ${q.days || 7}`)
  else if (req.method === 'POST' && p.startsWith('/api/ai/')) logActivity(user, ip, 'ai', p.slice(8) + (req.body?.question ? ` : ${req.body.question}` : req.body?.text ? ` : ${req.body.text}` : ''))
  else if (req.method === 'POST' && p === '/api/briefing/summary') logActivity(user, ip, 'ai', 'briefing')
  // Journal d'audit (audit produit) : envois, partages, suppressions, statut des alertes
  else if (req.method === 'POST' && (/^\/api\/reports\/[^/]+\/email$/.test(p) || p === '/api/briefing/send')) logActivity(user, ip, 'send', p.startsWith('/api/briefing') ? 'التقرير التنفيذي' : `تقرير ${p.split('/')[3]}`)
  else if (req.method === 'POST' && p === '/api/shares') logActivity(user, ip, 'share', String(req.body?.boardId || ''))
  else if (req.method === 'DELETE') logActivity(user, ip, 'delete', p.slice(4))
  else if (req.method === 'POST' && p.startsWith('/api/radar/alerts/')) logActivity(user, ip, 'alert', `${p.split('/')[4] || ''} ${req.body?.status || ''}`)
}

/* ---------------------------------------------------------------- montage */

export function mountSuperAdmin(app, root) {
  dir = path.join(root, 'data', 'superadmin')
  initMonitor(path.join(root, 'data'))
  settings = readJson('settings.json', settings)
  blocks = readJson('blocks.json', blocks)
  muted = readJson('sources.json', muted)
  notes = readJson('notes.json', {})
  applyMuted()
  // Pays et portée des sources, logo du client
  initSourceMeta(dir)
  initBrand(dir)
  if (!configured()) console.warn('Console Super Admin désactivée : lancez « node server/superadmin-setup.js » pour créer le compte')

  // Connexions à la plateforme → journal de sécurité et d'activité
  setAuthListener((type, info) => {
    logSecurity(type, info)
    if (type === 'login_ok') logActivity(info.login, info.ip, 'login', info.detail || '')
    if (type === 'logout') logActivity(info.login, info.ip, 'logout')
  })

  /* -------- portail : blocages, maintenance et journal d'accès, avant tout le reste */
  const blockedSeen = new Map()
  app.use((req, res, next) => {
    const p = req.path
    const isConsole = p.startsWith('/api/superadmin') || p === '/superadmin' || p.startsWith('/superadmin/')
    const isAsset = p.startsWith('/assets/') || /\.(js|css|png|jpe?g|svg|ico|webmanifest|woff2?|map|txt)$/.test(p)
    const ip = ipOf(req)
    if (!isConsole && !isAsset) {
      const cc = countryOf(ip)
      const byIp = blocks.ips.some((b) => b.ip === ip)
      const byCountry = cc && blocks.countries.some((b) => b.cc === cc)
      if (byIp || byCountry) {
        const k = `${ip}|${byIp ? 'ip' : 'country'}`
        if (Date.now() - (blockedSeen.get(k) || 0) > 10 * 60_000) {
          blockedSeen.set(k, Date.now())
          logSecurity(byIp ? 'blocked_ip' : 'blocked_country', { ip, ua: uaOf(req), detail: `${cc} ${p}` })
        }
        if (p.startsWith('/api/')) return fail(res, 403, 'BLOCKED')
        return res.status(403).type('html').send('<!doctype html><meta charset="utf-8"><title>403</title><body style="font-family:Tahoma,sans-serif;text-align:center;padding:4rem;direction:rtl">تم حظر الوصول من هذا العنوان.<br><span dir="ltr">Access blocked.</span></body>')
      }
      if (settings.maintenance.on && p.startsWith('/api/') && !p.startsWith('/api/platform/')) return res.status(503).json({ error: 'MAINTENANCE', message: settings.maintenance.message })
    }
    if (isConsole || isAsset) return next()
    const t = Date.now()
    let bytes = 0
    const write = res.write.bind(res)
    const end = res.end.bind(res)
    const count = (chunk, enc) => {
      if (chunk) bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, typeof enc === 'string' ? enc : 'utf8')
    }
    res.write = (chunk, ...rest) => (count(chunk, rest[0]), write(chunk, ...rest))
    res.end = (chunk, ...rest) => (typeof chunk !== 'function' && count(chunk, rest[0]), end(chunk, ...rest))
    res.on('finish', () => {
      const user = req.user?.email || currentUser(req)?.email || ''
      logAccess({ t, ip, u: user, m: req.method, p: req.originalUrl.slice(0, 300), s: res.statusCode, b: bytes, d: Date.now() - t, ua: uaOf(req) })
      if (user && res.statusCode < 400) deriveActivity(req, user, ip)
    })
    next()
  })

  /* -------- routes publiques de la plateforme : bandeau, maintenance, activité côté navigateur */
  app.get('/api/platform/status', (_req, res) =>
    res.json({ announcement: settings.announcement.on ? { text: settings.announcement.text, level: settings.announcement.level } : null, maintenance: settings.maintenance.on ? { message: settings.maintenance.message } : null }),
  )
  const CLIENT_TYPES = new Set(['open', 'print', 'lang', 'view'])
  app.post('/api/platform/activity', express.json({ limit: '2kb' }), (req, res) => {
    const user = currentUser(req)
    if (!user) return fail(res, 401, 'AUTH')
    if (!CLIENT_TYPES.has(req.body?.type)) return fail(res, 400, 'TYPE')
    logActivity(user.email, ipOf(req), req.body.type, String(req.body.detail || ''))
    res.json({ ok: true })
  })

  /* -------- console */
  const sa = express.Router()
  // Corps limités à 20 Ko, sauf le logo du client (image en data:, 400 Ko au plus)
  const smallJson = express.json({ limit: '20kb' })
  const logoJson = express.json({ limit: '420kb' })
  sa.use((req, res, next) => (req.path === '/brand' ? logoJson : smallJson)(req, res, next))
  sa.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  sa.post('/login', (req, res) => {
    const ip = ipOf(req)
    const ua = uaOf(req)
    const login = String(req.body?.login || '').slice(0, 120)
    if (!configured()) return fail(res, 503, 'NOT_CONFIGURED')
    if (recentFails(ip).length >= MAX_FAILS) {
      logSecurity('sa_locked', { ip, ua, login })
      return fail(res, 429, 'LOCKED')
    }
    const userOk = safeEqual(lc(login), lc(process.env.SUPERADMIN_USER))
    const passOk = checkSuperPassword(req.body?.password)
    if (!userOk || !passOk) {
      recentFails(ip).push(Date.now())
      logSecurity('sa_login_fail', { ip, ua, login })
      return fail(res, 401, 'BAD_CREDENTIALS')
    }
    saFails.delete(ip)
    setCookie(res, makeToken(), TTL_MS, req.secure)
    logSecurity('sa_login_ok', { ip, ua, login })
    logAudit(process.env.SUPERADMIN_USER, ip, 'login', '', deviceOf(ua))
    res.json({ user: process.env.SUPERADMIN_USER, expires: iso(Date.now() + TTL_MS) })
  })

  // Toute autre route exige le jeton ; les modifications exigent aussi l'en-tête x-superadmin (contre les envois d'un autre site)
  sa.use((req, res, next) => {
    if (!configured()) return fail(res, 503, 'NOT_CONFIGURED')
    const tok = readToken(req)
    if (!tok) return fail(res, 401, 'AUTH')
    if (req.method !== 'GET' && req.headers['x-superadmin'] !== '1') return fail(res, 403, 'CSRF')
    req.sa = tok
    next()
  })
  const audit = (req, action, target, detail) => logAudit(req.sa.u, ipOf(req), action, target, detail)

  /* ---- الصلاحيات التفصيلية : profils de modules et de boutons */
  mountPermissionsAdmin(sa, {
    audit,
    usersOf: (id) => readUsers().filter((u) => (u.profile || roleOf(u)) === id),
    detach: (id) => {
      const users = readUsers()
      const mine = users.filter((u) => u.profile === id)
      for (const u of mine) delete u.profile
      if (mine.length) writeUsers(users)
      return mine.length
    },
  })

  /* ---- pays et portée des sources, logo du client, clés d'API, liens de partage */
  mountClientAdmin(sa, { audit })

  sa.get('/me', (req, res) => res.json({ user: req.sa.u, expires: iso(req.sa.exp), ip: ipOf(req), country: countryOf(ipOf(req)) }))
  sa.post('/logout', (req, res) => {
    revoked.set(req.sa.sid, req.sa.exp)
    for (const [k, exp] of revoked) if (exp < Date.now()) revoked.delete(k)
    audit(req, 'logout')
    setCookie(res, '', 0, req.secure)
    res.json({ ok: true })
  })

  /* ---- لوحة المراقبة */
  sa.get('/dashboard', async (_req, res) => {
    const now = Date.now()
    const users = readUsers()
    const names = new Map(users.map((u) => [lc(u.email), u.name || u.email]))
    const access = all('access')
    const hours = []
    for (let i = 23; i >= 0; i--) hours.push({ t: now - i * 3600_000, hits: 0, users: new Set() })
    const countries = new Map()
    for (const r of access) {
      if (r.t >= now - 24 * 3600_000) {
        const h = hours[23 - Math.floor((now - r.t) / 3600_000)]
        if (h) {
          h.hits++
          if (r.u) h.users.add(r.u)
        }
      }
      if (r.t >= now - 7 * 86_400_000) {
        const cc = countryOf(r.ip) || '?'
        const c = countries.get(cc) || { cc, country: geoOf(r.ip)?.country || '', hits: 0, ips: new Set() }
        c.hits++
        c.ips.add(r.ip)
        countries.set(cc, c)
      }
    }
    const week = timeByUser(now - 7 * 86_400_000)
    const sec24 = all('security').filter((e) => e.t >= now - 24 * 3600_000)
    const { byIp } = failsSince(now - 24 * 3600_000)
    const { items, lastUpdate } = getItems()
    const sources = [process.env.LIBYE_DATA_DIR, process.env.MMS_MOSAIQUE === '1' && process.env.MOSAIQUE_DATA_DIR].filter(Boolean)
    let disk = null
    try {
      const s = fs.statfsSync(root)
      disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize }
    } catch {
      /* statfs indisponible */
    }
    res.json({
      online: onlineUsers().map((o) => ({ ...o, t: iso(o.t), name: names.get(lc(o.email)) || o.email, country: countryOf(o.ip) })),
      counts: { users: users.length, admins: users.filter((u) => roleOf(u) === 'admin').length, disabled: users.filter((u) => u.disabled).length, hits24: hours.reduce((n, h) => n + h.hits, 0) },
      activity24: hours.map((h) => ({ t: iso(h.t), hits: h.hits, users: h.users.size })),
      topUsers: [...week.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([email, ms]) => ({ email, name: names.get(lc(email)) || email, minutes: Math.round(ms / 60_000) })),
      alerts: {
        fails24: sec24.filter((e) => e.type === 'login_fail').length,
        saFails24: sec24.filter((e) => e.type === 'sa_login_fail' || e.type === 'sa_locked').length,
        suspicious: [...byIp.entries()].filter(([, n]) => n >= MAX_FAILS).length,
        blocked24: sec24.filter((e) => e.type.startsWith('blocked')).length,
        denied24: sec24.filter((e) => e.type === 'perm_denied').length,
        recent: sec24.filter((e) => e.type !== 'login_ok' && e.type !== 'logout').slice(-8).reverse().map((e) => ({ ...e, t: iso(e.t), country: countryOf(e.ip) })),
      },
      countries: [...countries.values()].sort((a, b) => b.hits - a.hits).slice(0, 12).map((c) => ({ cc: c.cc, country: c.country, hits: c.hits, ips: c.ips.size })),
      server: {
        hostname: os.hostname(),
        os: `${os.type()} ${os.release()}`,
        node: process.version,
        uptime: os.uptime(),
        appUptime: Math.round(process.uptime()),
        load: os.loadavg(),
        cpus: os.cpus().length,
        mem: { total: os.totalmem(), free: os.freemem(), rss: process.memoryUsage().rss },
        disk,
        geo: await serverGeo(),
      },
      sync: {
        lastUpdate,
        minutesAgo: lastUpdate ? Math.round((now - Date.parse(lastUpdate)) / 60_000) : null,
        total: items.length,
        last24: items.filter((it) => Date.parse(it.date) >= now - 24 * 3600_000).length,
        dirs: sources.map((d) => ({ dir: d, found: fs.existsSync(d) })),
      },
      // Clés présentes ou absentes (jamais leur valeur) et dépense estimée de l'analyse intelligente
      keys: keyStatus(root),
      aiUsage: aiUsage(),
    })
  })

  /* ---- المستخدمون */
  sa.get('/users', (req, res) => {
    const { byLogin } = failsSince(Date.now() - 30 * 86_400_000)
    const q = lc(req.query.q)
    const f = String(req.query.filter || 'all')
    const rows = readUsers()
      .map((u) => userRow(u, byLogin))
      .filter((u) => !q || lc(u.email).includes(q) || lc(u.name).includes(q))
      .filter(
        (u) =>
          f === 'all' ||
          (f === 'online' && u.online) ||
          (f === 'npdc' && isNpdc(u.email)) ||
          (f === 'gmail' && /@gmail\.com$/i.test(u.email)) ||
          (f === 'other' && !isNpdc(u.email) && !/@gmail\.com$/i.test(u.email)) ||
          (f === 'admins' && u.role === 'admin') ||
          (f === 'disabled' && u.disabled) ||
          (f === 'failed' && u.fails > 0),
      )
      .sort((a, b) => Number(b.online) - Number(a.online) || String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')))
    res.json({ users: rows })
  })

  sa.get('/users/:email', (req, res) => {
    const email = lc(req.params.email)
    const u = readUsers().find((x) => lc(x.email) === email)
    if (!u) return fail(res, 404, 'NOT_FOUND')
    const from = Date.now() - 30 * 86_400_000
    const mine = all('access').filter((r) => lc(r.u) === email && r.t >= from)
    const ips = new Map()
    const devices = new Map()
    for (const r of mine) {
      const i = ips.get(r.ip) || { ip: r.ip, hits: 0, first: r.t, last: r.t }
      i.hits++
      i.last = r.t
      ips.set(r.ip, i)
      const dv = deviceOf(r.ua)
      const d = devices.get(dv) || { device: dv, hits: 0, last: r.t }
      d.hits++
      d.last = r.t
      devices.set(dv, d)
    }
    const spent = timeByDay(u.email, 30)
    const days = []
    for (let i = 29; i >= 0; i--) {
      const d = tunisDay(Date.now() - i * 86_400_000)
      days.push({ day: d, minutes: Math.round((spent.get(d) || 0) / 60_000) })
    }
    const { byLogin } = failsSince(from)
    res.json({
      user: userRow(u, byLogin),
      perms: permsOf({ role: roleOf(u), profile: u.profile }),
      noteAt: notes[email]?.at || null,
      sessions: userSessions(u.email).map((s) => ({ ...s, at: s.at ? iso(s.at) : null, expires: iso(s.expires), country: countryOf(s.ip), device: deviceOf(s.ua) })),
      ips: [...ips.values()].sort((a, b) => b.last - a.last).map((i) => ({ ...i, first: iso(i.first), last: iso(i.last), country: countryOf(i.ip), place: geoOf(i.ip)?.country || '' })),
      devices: [...devices.values()].sort((a, b) => b.hits - a.hits).map((d) => ({ ...d, last: iso(d.last) })),
      days,
      activity: all('activity').filter((a) => lc(a.u) === email).slice(-150).reverse().map((a) => ({ ...a, t: iso(a.t) })),
      security: all('security').filter((e) => lc(e.login) === email).slice(-50).reverse().map((e) => ({ ...e, t: iso(e.t), country: countryOf(e.ip) })),
    })
  })

  const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
  sa.post('/users', (req, res) => {
    const email = lc(String(req.body?.email || '').trim())
    const password = String(req.body?.password || '')
    const role = ROLES.includes(req.body?.role) ? req.body.role : 'viewer'
    if (!EMAIL_RE.test(email)) return fail(res, 400, 'BAD_EMAIL')
    if (password.length < 8) return fail(res, 400, 'SHORT_PASSWORD')
    const users = readUsers()
    if (users.some((u) => lc(u.email) === email)) return fail(res, 409, 'EXISTS')
    const name = String(req.body?.name || '').trim().slice(0, 80) || email
    const profile = req.body?.profile && profileExists(req.body.profile) && !ROLES.includes(req.body.profile) ? req.body.profile : ''
    writeUsers([...users, { email, username: email, name, role, ...(profile ? { profile } : {}), createdAt: new Date().toISOString(), ...hashPassword(password) }])
    audit(req, 'user_create', email, `role=${role}${profile ? ` profile=${profile}` : ''}`)
    res.status(201).json({ ok: true })
  })

  sa.patch('/users/:email', (req, res) => {
    const email = lc(req.params.email)
    const users = readUsers()
    const u = users.find((x) => lc(x.email) === email)
    if (!u) return fail(res, 404, 'NOT_FOUND')
    const changes = []
    if (req.body?.role !== undefined) {
      // Seuls les rôles de la plateforme : un second Super Admin ne peut pas être créé d'ici
      if (!ROLES.includes(req.body.role)) return fail(res, 400, 'BAD_ROLE')
      changes.push(`role ${roleOf(u)} → ${req.body.role}`)
      u.role = req.body.role
    }
    if (req.body?.profile !== undefined) {
      // '' ou le rôle lui-même : le compte suit le profil de son rôle
      const id = String(req.body.profile || '')
      if (id && !profileExists(id)) return fail(res, 400, 'BAD_PROFILE')
      if (!id || ROLES.includes(id)) delete u.profile
      else u.profile = id
      changes.push(`profile → ${id || 'role'}`)
    }
    if (req.body?.name !== undefined) {
      u.name = String(req.body.name).trim().slice(0, 80) || u.email
      changes.push('name')
    }
    if (req.body?.password) {
      if (String(req.body.password).length < 8) return fail(res, 400, 'SHORT_PASSWORD')
      Object.assign(u, hashPassword(String(req.body.password)))
      changes.push('password')
    }
    if (req.body?.disabled !== undefined) {
      u.disabled = Boolean(req.body.disabled)
      changes.push(u.disabled ? 'disabled' : 'enabled')
    }
    // Double authentification réinitialisée (appareil perdu) : le compte la réactivera à sa prochaine connexion
    if (req.body?.resetMfa) {
      delete u.totp
      delete u.totpPending
      changes.push('mfa reset')
    }
    writeUsers(users)
    // Désactivé ou mot de passe changé : toutes ses sessions sont fermées
    if (u.disabled || req.body?.password || req.body?.resetMfa) closeSessions(u.email)
    audit(req, 'user_update', u.email, changes.join(', '))
    res.json({ ok: true })
  })

  sa.post('/users/:email/logout', (req, res) => {
    const n = closeSessions(req.params.email)
    audit(req, 'user_sessions_closed', lc(req.params.email), `${n}`)
    res.json({ closed: n })
  })

  sa.put('/users/:email/note', (req, res) => {
    const email = lc(req.params.email)
    const text = String(req.body?.text || '').slice(0, 2000)
    if (text) notes[email] = { text, at: new Date().toISOString() }
    else delete notes[email]
    writeJson('notes.json', notes)
    audit(req, 'user_note', email)
    res.json({ ok: true })
  })

  sa.delete('/users/:email', (req, res) => {
    const email = lc(req.params.email)
    const users = readUsers()
    if (!users.some((u) => lc(u.email) === email)) return fail(res, 404, 'NOT_FOUND')
    writeUsers(users.filter((u) => lc(u.email) !== email))
    closeSessions(email)
    const withHistory = req.query.history === '1'
    if (withHistory) purgeUser(email)
    delete notes[email]
    writeJson('notes.json', notes)
    audit(req, 'user_delete', email, withHistory ? 'avec historique' : 'historique conservé')
    res.json({ ok: true })
  })

  /* ---- سجل الوصول */
  function accessRows(q) {
    const from = q.from ? Date.parse(q.from) : 0
    const to = q.to ? Date.parse(q.to) + 86_400_000 : Infinity
    const ip = String(q.ip || '').trim()
    const user = lc(q.user)
    const cc = String(q.country || '').toUpperCase()
    const pth = lc(q.path)
    const st = String(q.status || '')
    const out = []
    const rows = all('access')
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i]
      if (r.t < from || r.t >= to) continue
      if (ip && !r.ip.includes(ip)) continue
      if (user && !lc(r.u).includes(user)) continue
      if (pth && !lc(r.p).includes(pth)) continue
      if (st && !String(r.s).startsWith(st)) continue
      const c = countryOf(r.ip)
      if (cc && c !== cc) continue
      out.push({ t: iso(r.t), ip: r.ip, country: c, user: r.u, method: r.m, path: r.p, status: r.s, bytes: r.b, ms: r.d, device: deviceOf(r.ua) })
    }
    return out
  }
  sa.get('/access', (req, res) => res.json(pageOf(accessRows(req.query), req.query)))
  sa.get('/access.csv', (req, res) => {
    const rows = accessRows(req.query).slice(0, 100_000)
    audit(req, 'export_csv', 'access', `${rows.length} lignes`)
    res.setHeader('content-type', 'text/csv; charset=utf-8')
    res.setHeader('content-disposition', `attachment; filename="mms-acces-${tunisDay(Date.now())}.csv"`)
    res.send(csv(rows, [['date', (r) => r.t], ['ip', (r) => r.ip], ['pays', (r) => r.country], ['utilisateur', (r) => r.user], ['methode', (r) => r.method], ['page', (r) => r.path], ['statut', (r) => r.status], ['octets', (r) => r.bytes], ['ms', (r) => r.ms], ['appareil', (r) => r.device]]))
  })

  /* ---- التحليلات والدول */
  sa.get('/analytics', async (_req, res) => {
    const from = Date.now() - 30 * 86_400_000
    const ips = new Map()
    const countries = new Map()
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0))
    const perDay = new Map()
    for (const r of all('access')) {
      if (r.t < from) continue
      const i = ips.get(r.ip) || { ip: r.ip, hits: 0, bytes: 0, users: new Set(), last: 0 }
      i.hits++
      i.bytes += r.b || 0
      if (r.u) i.users.add(r.u)
      i.last = r.t
      ips.set(r.ip, i)
      const cc = countryOf(r.ip) || '?'
      const c = countries.get(cc) || { cc, country: geoOf(r.ip)?.country || '', hits: 0, bytes: 0, ips: new Set(), users: new Set() }
      c.hits++
      c.bytes += r.b || 0
      c.ips.add(r.ip)
      if (r.u) c.users.add(r.u)
      countries.set(cc, c)
      const { wd, h } = tunisHour(r.t)
      if (wd >= 0) heat[wd][h]++
      const d = tunisDay(r.t)
      perDay.set(d, (perDay.get(d) || 0) + 1)
    }
    const ipList = [...ips.values()].map((i) => ({ ip: i.ip, hits: i.hits, bytes: i.bytes, users: [...i.users], last: iso(i.last), country: countryOf(i.ip), place: geoOf(i.ip)?.country || '', isp: geoOf(i.ip)?.isp || '' }))
    const days = []
    for (let i = 29; i >= 0; i--) {
      const d = tunisDay(Date.now() - i * 86_400_000)
      days.push({ day: d, hits: perDay.get(d) || 0 })
    }
    res.json({
      byHits: [...ipList].sort((a, b) => b.hits - a.hits).slice(0, 15),
      byBytes: [...ipList].sort((a, b) => b.bytes - a.bytes).slice(0, 15),
      countries: [...countries.values()].sort((a, b) => b.hits - a.hits).map((c) => ({ cc: c.cc, country: c.country, hits: c.hits, bytes: c.bytes, ips: c.ips.size, users: c.users.size })),
      heat,
      days,
      // Position du serveur, cible des arcs du globe animé
      server: await serverGeo().catch(() => null),
    })
  })

  /* ---- سجل النشاط */
  function activityRows(q) {
    const user = lc(q.user)
    const type = String(q.type || '')
    const text = lc(q.q)
    return all('activity')
      .filter((a) => (!user || lc(a.u).includes(user)) && (!type || a.type === type) && (!text || lc(a.detail).includes(text)))
      .slice()
      .reverse()
      .map((a) => ({ ...a, t: iso(a.t), country: countryOf(a.ip) }))
  }
  sa.get('/activity', (req, res) => res.json(pageOf(activityRows(req.query), req.query)))
  sa.get('/activity.csv', (req, res) => {
    const rows = activityRows(req.query)
    audit(req, 'export_csv', 'activity', `${rows.length} lignes`)
    res.setHeader('content-type', 'text/csv; charset=utf-8')
    res.setHeader('content-disposition', `attachment; filename="mms-activite-${tunisDay(Date.now())}.csv"`)
    res.send(csv(rows, [['date', (r) => r.t], ['utilisateur', (r) => r.u], ['ip', (r) => r.ip], ['pays', (r) => r.country], ['type', (r) => r.type], ['detail', (r) => r.detail]]))
  })

  /* ---- الأمان */
  sa.get('/security', (req, res) => {
    const now = Date.now()
    const week = all('security').filter((e) => e.t >= now - 7 * 86_400_000)
    const sus = new Map()
    for (const e of week) {
      if (e.type !== 'login_fail' && e.type !== 'sa_login_fail') continue
      const s = sus.get(e.ip) || { ip: e.ip, fails: 0, logins: new Set(), last: 0 }
      s.fails++
      s.logins.add(e.login)
      s.last = e.t
      sus.set(e.ip, s)
    }
    const multi = new Map()
    for (const r of all('access')) {
      if (!r.u || r.t < now - 24 * 3600_000) continue
      const m = multi.get(r.u) || new Set()
      m.add(r.ip)
      multi.set(r.u, m)
    }
    const type = String(req.query.type || '')
    res.json({
      suspicious: [...sus.values()].filter((s) => s.fails >= MAX_FAILS).sort((a, b) => b.fails - a.fails).map((s) => ({ ip: s.ip, fails: s.fails, logins: [...s.logins].slice(0, 6), last: iso(s.last), country: countryOf(s.ip), blocked: blocks.ips.some((b) => b.ip === s.ip) })),
      multiIp: [...multi.entries()].filter(([, s]) => s.size > 1).map(([email, s]) => ({ email, ips: [...s].map((ip) => ({ ip, country: countryOf(ip) })) })),
      events: all('security').filter((e) => !type || e.type === type).slice(-500).reverse().map((e) => ({ ...e, t: iso(e.t), country: countryOf(e.ip) })),
      blocks,
      me: { ip: ipOf(req), country: countryOf(ipOf(req)) },
    })
  })

  sa.post('/blocks/ip', (req, res) => {
    const ip = String(req.body?.ip || '').trim()
    if (!/^[0-9a-f.:]{3,45}$/i.test(ip)) return fail(res, 400, 'BAD_IP')
    if (ip === ipOf(req)) return fail(res, 400, 'SELF_IP')
    if (!blocks.ips.some((b) => b.ip === ip)) blocks.ips.push({ ip, at: new Date().toISOString(), reason: String(req.body?.reason || '').slice(0, 200) })
    writeJson('blocks.json', blocks)
    audit(req, 'block_ip', ip, req.body?.reason || '')
    res.json({ blocks })
  })
  sa.delete('/blocks/ip/:ip', (req, res) => {
    blocks.ips = blocks.ips.filter((b) => b.ip !== req.params.ip)
    writeJson('blocks.json', blocks)
    audit(req, 'unblock_ip', req.params.ip)
    res.json({ blocks })
  })
  sa.post('/blocks/country', (req, res) => {
    const cc = String(req.body?.cc || '').trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(cc)) return fail(res, 400, 'BAD_COUNTRY')
    const mine = countryOf(ipOf(req))
    if (cc === mine) return fail(res, 400, 'SELF_COUNTRY')
    if (!blocks.countries.some((b) => b.cc === cc)) blocks.countries.push({ cc, at: new Date().toISOString() })
    writeJson('blocks.json', blocks)
    audit(req, 'block_country', cc)
    res.json({ blocks })
  })
  sa.delete('/blocks/country/:cc', (req, res) => {
    blocks.countries = blocks.countries.filter((b) => b.cc !== req.params.cc.toUpperCase())
    writeJson('blocks.json', blocks)
    audit(req, 'unblock_country', req.params.cc.toUpperCase())
    res.json({ blocks })
  })

  /* ---- مصادر التغذية */
  sa.get('/sources', (_req, res) => {
    const { all: items = [], lastUpdate } = getItems()
    const now = Date.now()
    const origins = new Map()
    const channels = new Map()
    for (const it of items) {
      const o = origins.get(it.origin) || { name: it.origin, flux: it.flux, total: 0, week: 0, last: '', channels: new Set(), langs: new Map(), cats: new Map(), url: '' }
      o.total++
      if (Date.parse(it.date) >= now - 7 * 86_400_000) o.week++
      if (it.date > o.last) o.last = it.date
      o.channels.add(it.channel)
      o.langs.set(it.lang, (o.langs.get(it.lang) || 0) + 1)
      o.cats.set(it.category, (o.cats.get(it.category) || 0) + 1)
      if (!o.url && it.url) {
        try {
          o.url = new URL(it.url).origin
        } catch {
          /* adresse invalide */
        }
      }
      origins.set(it.origin, o)
      const c = channels.get(it.channel) || { name: it.channel, total: 0, week: 0, origins: new Set() }
      c.total++
      if (Date.parse(it.date) >= now - 7 * 86_400_000) c.week++
      c.origins.add(it.origin)
      channels.set(it.channel, c)
    }
    const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
    const catalog = readCatalog()
    for (const s of catalog) if (!origins.has(s.name)) origins.set(s.name, { name: s.name, flux: 'libye', total: 0, week: 0, last: '', channels: new Set([s.kind]), langs: new Map(), cats: new Map(), url: s.url })
    const inCatalog = new Map(catalog.map((s) => [s.name, s]))
    // Pays et portée : réglage du Super Admin, sinon valeur déduite (catalogue, domaine, canal)
    const originMeta = (o) => {
      const probe = { origin: o.name, url: o.url || inCatalog.get(o.name)?.url || '', channel: [...o.channels][0] || 'site' }
      return { country: sourceCountry(probe), reach: reachOf(probe), reachSet: reachIsSet(o.name), reliability: reliabilityOf(probe), reliabilitySet: reliabilityIsSet(o.name) }
    }
    res.json({
      lastUpdate,
      origins: [...origins.values()]
        .sort((a, b) => b.week - a.week || b.total - a.total)
        .map((o) => ({ name: o.name, flux: o.flux, url: o.url || inCatalog.get(o.name)?.url || '', total: o.total, week: o.week, last: o.last || null, channels: [...o.channels], langs: top(o.langs, 3), topics: top(o.cats, 3), collector: inCatalog.has(o.name) ? (inCatalog.get(o.name).active ? 'active' : 'off') : '', enabled: !muted.origins.includes(o.name), ...originMeta(o) })),
      channels: [...channels.values()].sort((a, b) => b.total - a.total).map((c) => ({ name: c.name, total: c.total, week: c.week, origins: c.origins.size, enabled: !muted.channels.includes(c.name) })),
    })
  })
  sa.put('/sources', (req, res) => {
    const kind = req.body?.kind === 'channel' ? 'channels' : 'origins'
    const name = String(req.body?.name || '').slice(0, 200)
    if (!name) return fail(res, 400, 'NO_NAME')
    const on = Boolean(req.body?.enabled)
    muted[kind] = muted[kind].filter((n) => n !== name)
    if (!on) muted[kind].push(name)
    writeJson('sources.json', muted)
    applyMuted()
    audit(req, on ? 'source_on' : 'source_off', `${kind === 'channels' ? 'canal' : 'source'} ${name}`)
    res.json({ ok: true })
  })

  /* ---- الإعدادات */
  sa.get('/settings', (_req, res) => res.json({ settings, audit: all('audit').slice(-300).reverse().map((a) => ({ ...a, t: iso(a.t), country: countryOf(a.ip) })) }))
  sa.put('/settings', (req, res) => {
    const a = req.body?.announcement
    const m = req.body?.maintenance
    const before = { a: JSON.stringify(settings.announcement), m: JSON.stringify(settings.maintenance) }
    if (a) settings.announcement = { on: Boolean(a.on), text: String(a.text || '').slice(0, 500), level: ['info', 'warning', 'danger'].includes(a.level) ? a.level : 'info' }
    if (m) settings.maintenance = { on: Boolean(m.on), message: String(m.message || '').slice(0, 500) }
    writeJson('settings.json', settings)
    if (JSON.stringify(settings.announcement) !== before.a) audit(req, 'announcement', settings.announcement.on ? 'on' : 'off', settings.announcement.text)
    if (JSON.stringify(settings.maintenance) !== before.m) audit(req, 'maintenance', settings.maintenance.on ? 'on' : 'off', settings.maintenance.message)
    res.json({ settings })
  })

  app.use('/api/superadmin', sa)
}

/** Catalogue du collecteur Libye (sources.yaml) : nom, adresse, actif ou non */
function readCatalog() {
  const candidates = [process.env.LIBYE_SOURCES_FILE, '/opt/veille-libye/sources.yaml', path.resolve(dir, '../../../veille-libye/veille-libye/sources.yaml')].filter(Boolean)
  const file = candidates.find((f) => fs.existsSync(f))
  if (!file) return []
  const out = []
  let section = ''
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const sec = /^([a-z_]+):/.exec(line)
    if (sec) section = sec[1]
    const m = /^\s*-\s*\{(.*)\}\s*$/.exec(line)
    if (!m || !['sites', 'officiels'].includes(section)) continue
    const field = (k) => new RegExp(`(?:^|,)\\s*${k}:\\s*(?:"([^"]*)"|([^,}]*))`).exec(m[1])
    const val = (k) => {
      const f = field(k)
      return f ? (f[1] ?? f[2] ?? '').trim() : ''
    }
    const name = val('nom')
    if (name) out.push({ name, url: val('url'), active: val('actif') !== 'false', kind: 'site' })
  }
  return out
}
