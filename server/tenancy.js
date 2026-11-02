import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import stream from 'node:stream'
import path from 'node:path'
import { fork } from 'node:child_process'
import express from 'express'
import { hashPassword } from './auth.js'

/**
 * Espaces clients (multi-tenant) : chaque organisation cliente a son propre environnement MMS.
 *
 * - Le client historique (« main ») reste dans data/ tel quel : rien n'est migré.
 * - Chaque autre organisation a son dossier data/orgs/<id>/ (comptes, sessions, tableaux, veilles, étiquettes,
 *   rapports, réglages, journaux…) et son propre processus MMS (même code, MMS_DATA_DIR = son dossier),
 *   lancé et surveillé par le processus principal, joignable seulement sur 127.0.0.1.
 *   L'isolation ne dépend donc d'aucun filtre : un processus n'ouvre que les fichiers de son organisation.
 * - Partagé entre organisations (lecture) : le flux d'actualités collecté (data/libye, Mosaïque) et les réglages
 *   de la plateforme (blocages, maintenance, politique des sources, référentiel des entités, clés d'IA).
 * - Registre : data/superadmin/organizations.json. Une adresse e-mail n'appartient qu'à une seule organisation :
 *   à la connexion, le processus principal trouve l'organisation du compte et lui transmet la requête ;
 *   un cookie mms_org (simple aiguillage, la session reste vérifiée par le processus de l'organisation) oriente ensuite
 *   les appels /api vers le bon processus.
 */

export const ORG_COOKIE = 'mms_org'
export const ORG_RE = /^org_[a-z0-9]{6,20}$/
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const fail = (code, status = 400) => Object.assign(new Error(code), { code, status })
const lc = (s) => String(s || '').trim().toLowerCase()

let mainData = ''
let regFile = ''

/** Dossiers : data/ du client historique et registre des organisations (processus principal et processus des organisations) */
export function initTenancy(mainDataDir) {
  mainData = mainDataDir
  regFile = path.join(mainDataDir, 'superadmin', 'organizations.json')
}

export const orgDir = (id) => path.join(mainData, 'orgs', id)

export function listOrgs() {
  try {
    const rows = JSON.parse(fs.readFileSync(regFile, 'utf8')).orgs
    return Array.isArray(rows) ? rows.filter((o) => ORG_RE.test(o?.id || '')) : []
  } catch {
    return []
  }
}
export const orgById = (id) => listOrgs().find((o) => o.id === id) || null

function writeOrgs(orgs) {
  fs.mkdirSync(path.dirname(regFile), { recursive: true })
  const tmp = `${regFile}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ savedAt: new Date().toISOString(), orgs }, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, regFile)
}

/* ---------------------------------------------------------------- comptes de toutes les organisations */

// Fichiers relus seulement quand ils changent (connexion : un appel par tentative)
const usersCache = new Map() // fichier → { mtime, users }
function usersIn(file) {
  try {
    const mtime = fs.statSync(file).mtimeMs
    const c = usersCache.get(file)
    if (c && c.mtime === mtime) return c.users
    const users = JSON.parse(fs.readFileSync(file, 'utf8')).users || []
    usersCache.set(file, { mtime, users })
    return users
  } catch {
    return []
  }
}
const usersFileOf = (id) => (id === 'main' ? path.join(mainData, 'users.json') : path.join(orgDir(id), 'users.json'))
export const orgUsers = (id) => usersIn(usersFileOf(id))

const matches = (u, key) => lc(u.email) === key || lc(u.username) === key

/** Organisation d'un identifiant de connexion : 'main', l'id d'une organisation, ou '' (inconnu) */
export function orgOfLogin(login) {
  const key = lc(login)
  if (!key) return ''
  if (orgUsers('main').some((u) => matches(u, key))) return 'main'
  for (const o of listOrgs()) if (orgUsers(o.id).some((u) => matches(u, key))) return o.id
  return ''
}

/** Adresse déjà prise dans une organisation (une adresse = une seule organisation, pour l'aiguillage à la connexion) */
export const emailTaken = (email) => Boolean(orgOfLogin(email))

/* ---------------------------------------------------------------- création d'une organisation (console Super Admin) */

const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex')
const ACTIVATION_MS = 7 * 86_400_000

function slugOf(name) {
  return lc(name)
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function freePort(orgs) {
  const base = Number(process.env.MMS_TENANT_PORT_BASE) || 8801
  const used = new Set(orgs.map((o) => o.port))
  let p = base
  while (used.has(p)) p++
  return p
}

/**
 * Nouvel espace client : dossier, identité (nom affiché dans l'interface), premier administrateur du client
 * avec un lien d'activation (il choisit son mot de passe), processus démarré par le superviseur.
 */
export function createOrg({ name, adminEmail, adminName, seats, contact, plan }, by = '') {
  const clean = String(name || '').trim().slice(0, 120)
  if (clean.length < 2) throw fail('NO_NAME')
  const email = lc(adminEmail)
  if (!EMAIL_RE.test(email)) throw fail('BAD_EMAIL')
  if (emailTaken(email)) throw fail('EMAIL_TAKEN', 409)
  const orgs = listOrgs()
  if (orgs.some((o) => lc(o.name) === lc(clean))) throw fail('EXISTS', 409)
  const id = `org_${crypto.randomBytes(5).toString('hex')}`
  const slug = slugOf(clean) || id
  const org = {
    id,
    name: clean,
    slug: orgs.some((o) => o.slug === slug) ? `${slug}-${id.slice(4, 8)}` : slug,
    status: 'active',
    plan: ['essential', 'professional', 'enterprise'].includes(plan) ? plan : 'professional',
    seats: Math.min(Math.max(Number(seats) || 10, 1), 1000),
    contact: String(contact || email).trim().slice(0, 200),
    port: freePort(orgs),
    createdAt: new Date().toISOString(),
    createdBy: String(by).slice(0, 120),
  }
  const dir = orgDir(id)
  fs.mkdirSync(path.join(dir, 'superadmin'), { recursive: true, mode: 0o700 })
  // Identité de l'espace : nom de l'entreprise cliente en tête de l'interface et des livrables
  fs.writeFileSync(path.join(dir, 'superadmin', 'brand.json'), JSON.stringify({ name: clean, logo: '', assistant: '', accent: '', whiteLabel: false, updatedAt: new Date().toISOString() }))
  const token = crypto.randomBytes(32).toString('base64url')
  const admin = {
    email,
    username: email,
    name: String(adminName || '').trim().slice(0, 80) || email,
    role: 'admin',
    createdAt: new Date().toISOString(),
    // Mot de passe inutilisable tant que la personne n'a pas activé son compte
    ...hashPassword(crypto.randomBytes(24).toString('hex')),
    pendingActivation: true,
    activation: { hash: sha(token), exp: Date.now() + ACTIVATION_MS, by: `superadmin:${by}` },
  }
  fs.writeFileSync(path.join(dir, 'users.json'), JSON.stringify({ users: [admin] }, null, 2), { mode: 0o600 })
  writeOrgs([...orgs, org])
  return { org, activation: { token, exp: new Date(Date.now() + ACTIVATION_MS).toISOString(), email } }
}

export function updateOrg(id, patch) {
  const orgs = listOrgs()
  const o = orgs.find((x) => x.id === id)
  if (!o) throw fail('NOT_FOUND', 404)
  if (patch.name !== undefined) {
    const n = String(patch.name || '').trim().slice(0, 120)
    if (n.length < 2) throw fail('NO_NAME')
    if (orgs.some((x) => x.id !== id && lc(x.name) === lc(n))) throw fail('EXISTS', 409)
    o.name = n
  }
  if (patch.status !== undefined) {
    if (!['active', 'suspended'].includes(patch.status)) throw fail('BAD_STATUS')
    o.status = patch.status
  }
  if (patch.seats !== undefined) o.seats = Math.min(Math.max(Number(patch.seats) || 1, 1), 1000)
  if (patch.plan !== undefined && ['essential', 'professional', 'enterprise'].includes(patch.plan)) o.plan = patch.plan
  if (patch.contact !== undefined) o.contact = String(patch.contact || '').trim().slice(0, 200)
  o.updatedAt = new Date().toISOString()
  writeOrgs(orgs)
  return o
}

/** Nouveau lien d'activation pour un compte d'une organisation (premier administrateur qui a perdu le sien…) */
export function issueOrgActivation(id, email, by = '') {
  const file = usersFileOf(id)
  const data = (() => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return { users: [] }
    }
  })()
  const u = (data.users || []).find((x) => lc(x.email) === lc(email))
  if (!u) throw fail('NOT_FOUND', 404)
  const token = crypto.randomBytes(32).toString('base64url')
  u.activation = { hash: sha(token), exp: Date.now() + ACTIVATION_MS, by: `superadmin:${by}` }
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
  return { token, exp: new Date(Date.now() + ACTIVATION_MS).toISOString(), email: u.email }
}

/* ---------------------------------------------------------------- superviseur des processus */

const procs = new Map() // id → { child, port, startedAt, restarts, lastExit, wanted, timer, restarting }
let rootDir = ''
// Un processus resté en marche 10 minutes est jugé stable : le délai de redémarrage repart de 5 s
const STABLE_MS = 10 * 60_000

// Réglages du client historique jamais transmis à un espace client : son groupe Telegram, les destinataires des
// alertes du radar et du rapport exécutif. Vides (et non absents) : dotenv ne remplace jamais une variable déjà
// définie, même vide, et le .env du serveur ne les réintroduit donc pas dans le processus de l'organisation.
const MAIN_ONLY_ENV = { TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '', MMS_RADAR_ALERTS: '0', MMS_RADAR_ALERTS_TO: '', MMS_BRIEFING_TO: '' }

export function tenantEnv(org) {
  return {
    ...process.env,
    ...MAIN_ONLY_ENV,
    MMS_TENANT: org.id,
    MMS_TENANT_NAME: org.name,
    MMS_DATA_DIR: orgDir(org.id),
    MMS_PLATFORM_DIR: path.join(mainData, 'superadmin'),
    MMS_SHARED_DATA: mainData,
    MMS_PORT: String(org.port),
    MMS_HOST: '127.0.0.1',
    LIBYE_DATA_DIR: process.env.LIBYE_DATA_DIR,
    MOSAIQUE_DATA_DIR: process.env.MOSAIQUE_DATA_DIR,
    // Pas de compte d'administration Around créé d'office dans l'espace d'un client
    MMS_SEED_ADMIN: '0',
  }
}

function launch(org) {
  const state = procs.get(org.id) || { restarts: 0, lastExit: null }
  // Un seul processus par organisation, quoi qu'il arrive (relance, synchronisation, redémarrage demandé)
  if (state.child && state.child.exitCode === null && !state.child.killed) return
  clearTimeout(state.timer)
  state.timer = null
  state.wanted = true
  state.restarting = false
  state.port = org.port
  const child = fork(path.join(rootDir, 'server', 'index.js'), [], { cwd: rootDir, env: tenantEnv(org), stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  const prefix = (stream, out) => stream.on('data', (b) => out.write(String(b).replace(/^(?=.)/gm, `[${org.id}] `)))
  prefix(child.stdout, process.stdout)
  prefix(child.stderr, process.stderr)
  state.child = child
  state.startedAt = Date.now()
  procs.set(org.id, state)
  child.on('exit', (code, signal) => {
    if (state.child === child) state.child = null
    state.lastExit = { at: new Date().toISOString(), code, signal }
    if (Date.now() - state.startedAt >= STABLE_MS) state.restarts = 0
    if (state.restarting) {
      const fresh = orgById(org.id)
      if (fresh && fresh.status === 'active') launch(fresh)
      else state.restarting = false
      return
    }
    if (!state.wanted) return
    // Redémarrage automatique, de plus en plus espacé si le processus tombe en boucle (5 s → 2 min)
    state.restarts++
    const wait = Math.min(5000 * 2 ** Math.min(state.restarts - 1, 5), 120_000)
    state.timer = setTimeout(() => {
      state.timer = null
      const fresh = orgById(org.id)
      if (fresh && fresh.status === 'active' && procs.get(org.id)?.wanted) launch(fresh)
    }, wait)
    state.timer.unref()
  })
}

function stopProc(id) {
  const s = procs.get(id)
  if (!s) return
  s.wanted = false
  s.restarting = false
  clearTimeout(s.timer)
  s.timer = null
  if (s.child) s.child.kill('SIGTERM')
}

/** Démarre un processus par organisation active ; aligne l'état sur le registre (création, suspension) */
export function syncTenants() {
  if (!rootDir) return
  const orgs = listOrgs()
  for (const o of orgs) {
    const s = procs.get(o.id)
    // Déjà voulu (en marche, relance programmée) ou redémarrage en cours : rien à faire
    if (o.status === 'active' && !s?.wanted && !s?.restarting) launch(o)
    if (o.status !== 'active' && (s?.wanted || s?.restarting)) stopProc(o.id)
  }
  for (const id of procs.keys()) if (!orgs.some((o) => o.id === id)) stopProc(id)
}

/** Redémarrage demandé (console, changement de nom) : arrêt puis relance unique à la sortie du processus */
export function restartTenant(id) {
  const o = orgById(id)
  if (!o) throw fail('NOT_FOUND', 404)
  if (!rootDir) return
  const s = procs.get(id)
  if (s?.child && s.child.exitCode === null) {
    s.wanted = false
    s.restarting = true
    clearTimeout(s.timer)
    s.child.kill('SIGTERM')
  } else if (o.status === 'active') launch(o)
}

export function tenantState(id) {
  const s = procs.get(id)
  if (!s) return { running: false }
  return { running: Boolean(s.child && s.child.exitCode === null), pid: s.child?.pid || null, port: s.port, startedAt: s.startedAt ? new Date(s.startedAt).toISOString() : null, restarts: s.restarts, lastExit: s.lastExit }
}

export function startTenants(root) {
  rootDir = root
  syncTenants()
  // Arrêt du service : les processus des organisations s'arrêtent avec lui (ils s'arrêtent aussi d'eux-mêmes si le
  // canal avec le processus principal se ferme). Pas de process.exit ici : l'arrêt normal du serveur reste inchangé.
  const stopAll = () => {
    for (const id of procs.keys()) stopProc(id)
  }
  process.once('exit', stopAll)
  for (const sig of ['SIGTERM', 'SIGINT'])
    process.once(sig, () => {
      stopAll()
      // Comportement par défaut du signal rétabli après l'arrêt des processus des organisations
      process.kill(process.pid, sig)
    })
}

/* ---------------------------------------------------------------- aiguillage des requêtes (processus principal) */

function readOrgCookie(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === ORG_COOKIE) {
      try {
        return decodeURIComponent(v.join('='))
      } catch {
        return ''
      }
    }
  }
  return ''
}

function orgCookie(req, value) {
  const parts = [`${ORG_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${value ? 30 * 86_400 : 0}`]
  if (req.secure) parts.push('Secure')
  return parts.join('; ')
}

/** Ajoute un cookie sans effacer ceux déjà posés (y compris par une route qui les pose après) */
export function addCookie(res, cookie) {
  const prev = res.getHeader('Set-Cookie')
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [String(prev)] : []), cookie])
}

const HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'host', 'content-length'])

/**
 * Transmet la requête au processus de l'organisation. body : corps déjà lu (JSON), sinon le flux est transmis tel quel.
 * after(status, res) peut ajouter des cookies avant l'envoi de la réponse.
 */
function forward(req, res, org, { body, after } = {}) {
  const headers = {}
  for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && !k.startsWith('x-forwarded-')) headers[k] = v
  // Le processus de l'organisation fait confiance à un seul relais : adresse réelle du visiteur et HTTPS d'origine
  headers['x-forwarded-for'] = String(req.ip || '').replace(/^::ffff:/, '')
  headers['x-forwarded-proto'] = req.secure ? 'https' : 'http'
  headers['x-forwarded-host'] = req.headers.host || ''
  headers.host = `127.0.0.1:${org.port}`
  let payload = null
  if (body !== undefined) {
    payload = Buffer.from(JSON.stringify(body))
    headers['content-type'] = 'application/json'
    headers['content-length'] = String(payload.length)
  } else if (req.headers['content-length']) headers['content-length'] = req.headers['content-length']
  else if (req.headers['transfer-encoding']) headers['transfer-encoding'] = req.headers['transfer-encoding']
  req.tenantProxied = org.id
  const up = http.request({ host: '127.0.0.1', port: org.port, method: req.method, path: req.originalUrl, headers }, (r) => {
    const out = { ...r.headers }
    delete out.connection
    delete out['keep-alive']
    delete out['transfer-encoding']
    res.status(r.statusCode || 502)
    for (const [k, v] of Object.entries(out)) if (v !== undefined) res.setHeader(k, v)
    if (after) after(r.statusCode || 502, res)
    // Processus de l'organisation arrêté au milieu de la réponse : la connexion est coupée, jamais terminée
    // proprement (un fichier tronqué ne doit pas passer pour complet)
    stream.pipeline(r, res, (err) => err && res.destroy(err))
  })
  up.setTimeout(10 * 60_000, () => up.destroy(new Error('timeout')))
  up.on('error', () => {
    if (!res.headersSent) res.status(503).json({ error: 'TENANT_DOWN' })
    else res.destroy()
  })
  // Visiteur parti avant la fin : la requête vers le processus de l'organisation est abandonnée
  res.on('close', () => !res.writableFinished && up.destroy())
  if (payload) up.end(payload)
  else req.pipe(up)
}

// Routes du processus principal jamais transmises : console Super Admin, état de la plateforme, accès publics
const LOCAL = [/^\/api\/superadmin(\/|$)/i, /^\/api\/platform\/status\/?$/i, /^\/api\/public\//i, /^\/api\/v1\//i, /^\/api\/landing\//i]

/* -------- liens de partage d'un tableau d'une organisation : propriétaire trouvé d'après l'empreinte du jeton */

const sharesCache = new Map() // fichier → { mtime, hashes }
function orgOfShare(token) {
  const h = sha(token)
  for (const o of listOrgs()) {
    if (o.status !== 'active') continue
    const file = path.join(orgDir(o.id), 'shares.json')
    let hashes
    try {
      const mtime = fs.statSync(file).mtimeMs
      const c = sharesCache.get(file)
      if (c && c.mtime === mtime) hashes = c.hashes
      else {
        hashes = new Set((JSON.parse(fs.readFileSync(file, 'utf8')).shares || []).map((x) => x.hash))
        sharesCache.set(file, { mtime, hashes })
      }
    } catch {
      continue
    }
    if (hashes.has(h)) return o
  }
  return null
}

/* -------- connexions aux espaces clients : limite commune par adresse IP et journal de la console Super Admin */

const LOCK_MS = 15 * 60_000
const MAX_IP_FAILS = 20
const ipFails = new Map() // ip → { count, at }
setInterval(() => {
  const now = Date.now()
  for (const [k, f] of ipFails) if (now - f.at >= LOCK_MS) ipFails.delete(k)
}, 5 * 60_000).unref()
const ipLocked = (ip) => {
  const f = ipFails.get(ip)
  return Boolean(f && f.count >= MAX_IP_FAILS && Date.now() - f.at < LOCK_MS)
}
function countFail(ip) {
  const f = ipFails.get(ip)
  ipFails.set(ip, { count: (f && Date.now() - f.at < LOCK_MS ? f.count : 0) + 1, at: Date.now() })
}

/** Mot de passe d'un compte d'une organisation, vérifié sur son fichier (espace suspendu : pas de processus) */
function checkOrgPassword(id, login, password) {
  const key = lc(login)
  const u = orgUsers(id).find((x) => matches(x, key))
  if (!u?.salt || !u?.hash) return (hashPassword(password), false)
  const a = Buffer.from(hashPassword(password, u.salt).hash, 'hex')
  const b = Buffer.from(u.hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * Aiguillage monté par le processus principal, après les blocages et la maintenance de la plateforme
 * et avant ses propres routes de connexion. limit : limite des accès publics (liens de partage).
 */
export function mountGateway(app, { log = () => {}, shareOf = () => null, limit = (_req, _res, next) => next() } = {}) {
  const smallJson = express.json({ limit: '4kb' })
  const ipOf = (req) => String(req.ip || '').replace(/^::ffff:/, '')
  const uaOf = (req) => String(req.headers['user-agent'] || '').slice(0, 200)
  // Requête traitée par le processus principal lui-même (client historique) : jamais transmise ensuite
  const stayHere = (req, res, next) => {
    req.gatewayLocal = true
    if (readOrgCookie(req)) addCookie(res, orgCookie(req, ''))
    next()
  }

  // Connexion : l'organisation est trouvée d'après l'identifiant ; le client historique garde sa propre route
  app.post('/api/auth/login', smallJson, (req, res, next) => {
    const login = req.body?.login
    const password = req.body?.password
    if (typeof login !== 'string' || typeof password !== 'string' || login.length > 200 || password.length > 1000) return stayHere(req, res, next)
    const id = orgOfLogin(login)
    const org = id && id !== 'main' ? orgById(id) : null
    if (!org) return stayHere(req, res, next)
    const ip = ipOf(req)
    if (ipLocked(ip)) {
      log('locked', { ip, ua: uaOf(req), login })
      return res.status(429).json({ error: 'LOCKED' })
    }
    if (org.status !== 'active') {
      // Espace suspendu : signalé seulement à qui connaît le mot de passe (sinon même réponse qu'un compte inconnu)
      if (!checkOrgPassword(org.id, login, password)) {
        countFail(ip)
        log('login_fail', { ip, ua: uaOf(req), login, detail: org.id })
        return res.status(401).json({ error: 'BAD_CREDENTIALS' })
      }
      log('org_suspended_login', { ip, ua: uaOf(req), login, detail: org.id })
      return res.status(403).json({ error: 'SUSPENDED' })
    }
    forward(req, res, org, {
      body: req.body,
      after: (status, r) => {
        if (status < 300) {
          addCookie(r, orgCookie(req, org.id))
          ipFails.delete(ip)
        } else if (status === 401 || status === 429) {
          countFail(ip)
          log(status === 429 ? 'locked' : 'login_fail', { ip, ua: uaOf(req), login, detail: org.id })
        }
      },
    })
  })

  // Activation d'un compte d'une organisation : le lien porte l'organisation (?o=…) ; sans elle, client historique
  app.post('/api/auth/activate', smallJson, (req, res, next) => {
    const id = String(req.body?.org || '')
    if (!ORG_RE.test(id)) return stayHere(req, res, next)
    const org = orgById(id)
    if (!org || org.status !== 'active') return res.status(404).json({ error: 'BAD_TOKEN' })
    const { org: _drop, ...body } = req.body
    forward(req, res, org, { body })
  })

  // Lien de partage d'un tableau d'une organisation : même limite que les autres accès publics, aucun appel en rafale
  app.get(/^\/api\/public\/share\/([A-Za-z0-9_-]{43})(\/.*)?$/, limit, (req, res, next) => {
    if (shareOf(req.params[0])) return next()
    const org = orgOfShare(req.params[0])
    if (!org) return next()
    forward(req, res, org)
  })

  app.use('/api', (req, res, next) => {
    if (req.gatewayLocal) return next()
    const id = readOrgCookie(req)
    if (!id) return next()
    if (LOCAL.some((re) => re.test(req.originalUrl.split('?')[0]))) return next()
    const org = ORG_RE.test(id) ? orgById(id) : null
    // Organisation inconnue ou suspendue : aiguillage effacé, la personne revient à la page de connexion
    if (!org || org.status !== 'active') {
      addCookie(res, orgCookie(req, ''))
      if (req.path === '/auth/logout') return res.json({ ok: true })
      return res.status(401).json({ error: org ? 'SUSPENDED' : 'AUTH' })
    }
    const isLogout = req.method === 'POST' && req.path === '/auth/logout'
    const isMe = req.method === 'GET' && req.path === '/auth/me'
    forward(req, res, org, {
      after: (status, r) => {
        // Déconnexion, ou session absente/expirée : retour au contexte de la plateforme
        if (isLogout || (isMe && status === 401)) addCookie(r, orgCookie(req, ''))
      },
    })
  })
}

/* ---------------------------------------------------------------- organisation du processus courant */

/** Organisation servie par ce processus : '' pour le client historique */
export const currentTenant = () => process.env.MMS_TENANT || ''

/** Fiche affichée à l'interface : identité, limites et fonctions disponibles dans l'espace */
export function tenantInfo(brand = {}) {
  const id = currentTenant()
  if (!id) return { id: 'main', name: brand.name || '', main: true, seats: 0, features: { pipeline: true, portal: true } }
  const o = orgById(id)
  return {
    id,
    name: brand.name || o?.name || process.env.MMS_TENANT_NAME || '',
    main: false,
    plan: o?.plan || '',
    seats: o?.seats || 0,
    // Collecte à la demande (enregistrements, sources de diffusion, رصد) et vitrine publique : propres au client historique
    features: { pipeline: false, portal: false },
  }
}

/* ---------------------------------------------------------------- demandes de démonstration (page d'accueil) */

let demoFile = ''
export function initDemoRequests(dir) {
  demoFile = path.join(dir, 'demo-requests.json')
}
export function listDemoRequests() {
  try {
    return JSON.parse(fs.readFileSync(demoFile, 'utf8')).requests || []
  } catch {
    return []
  }
}
function writeDemo(rows) {
  fs.mkdirSync(path.dirname(demoFile), { recursive: true })
  const tmp = `${demoFile}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ requests: rows }, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, demoFile)
}

const demoHits = new Map() // ip → [dates]
/** Demande enregistrée (et transmise au support par e-mail) ; 5 par heure et par adresse IP */
export function addDemoRequest(body, ip) {
  const now = Date.now()
  const hits = (demoHits.get(ip) || []).filter((t) => now - t < 3600_000)
  if (hits.length >= 5) throw fail('RATE', 429)
  // Champ piège invisible : un robot qui le remplit est ignoré sans le lui dire
  if (body?.website) return { ignored: true }
  const field = (k, max) => String(body?.[k] ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)
  const row = {
    id: `d_${crypto.randomBytes(6).toString('hex')}`,
    at: new Date(now).toISOString(),
    name: field('name', 120),
    email: lc(field('email', 200)),
    company: field('company', 160),
    role: field('role', 120),
    country: field('country', 80),
    phone: field('phone', 40),
    interest: field('interest', 80),
    message: field('message', 2000),
    lang: ['ar', 'en', 'fr'].includes(body?.lang) ? body.lang : 'en',
    ip,
    status: 'new',
  }
  if (row.name.length < 2) throw fail('NO_NAME')
  if (!EMAIL_RE.test(row.email)) throw fail('BAD_EMAIL')
  if (row.company.length < 2) throw fail('NO_COMPANY')
  hits.push(now)
  demoHits.set(ip, hits)
  const rows = listDemoRequests()
  rows.push(row)
  writeDemo(rows.slice(-2000))
  return row
}
export function setDemoStatus(id, status) {
  if (!['new', 'contacted', 'converted', 'closed'].includes(status)) throw fail('BAD_STATUS')
  const rows = listDemoRequests()
  const r = rows.find((x) => x.id === id)
  if (!r) throw fail('NOT_FOUND', 404)
  r.status = status
  r.updatedAt = new Date().toISOString()
  writeDemo(rows)
  return r
}
