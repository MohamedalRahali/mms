import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
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

const procs = new Map() // id → { child, port, startedAt, restarts, lastExit, wanted, timer }
let rootDir = ''

function launch(org) {
  const state = procs.get(org.id) || { restarts: 0, lastExit: null }
  state.wanted = true
  state.port = org.port
  const child = fork(path.join(rootDir, 'server', 'index.js'), [], {
    cwd: rootDir,
    env: {
      ...process.env,
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
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  const prefix = (stream, out) => stream.on('data', (b) => out.write(String(b).replace(/^(?=.)/gm, `[${org.id}] `)))
  prefix(child.stdout, process.stdout)
  prefix(child.stderr, process.stderr)
  state.child = child
  state.startedAt = Date.now()
  procs.set(org.id, state)
  child.on('exit', (code, signal) => {
    state.child = null
    state.lastExit = { at: new Date().toISOString(), code, signal }
    if (!state.wanted) return
    // Redémarrage automatique, de plus en plus espacé si le processus tombe en boucle (5 s → 2 min)
    state.restarts++
    const wait = Math.min(5000 * 2 ** Math.min(state.restarts - 1, 5), 120_000)
    state.timer = setTimeout(() => {
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
  clearTimeout(s.timer)
  if (s.child) s.child.kill('SIGTERM')
}

/** Démarre un processus par organisation active ; aligne l'état sur le registre (création, suspension) */
export function syncTenants() {
  if (!rootDir) return
  const orgs = listOrgs()
  for (const o of orgs) {
    const s = procs.get(o.id)
    // Déjà voulu : en marche, ou redémarrage programmé après un arrêt inattendu
    if (o.status === 'active' && !s?.wanted) launch(o)
    if (o.status !== 'active' && s?.wanted) stopProc(o.id)
  }
  for (const id of procs.keys()) if (!orgs.some((o) => o.id === id)) stopProc(id)
}

export function restartTenant(id) {
  const o = orgById(id)
  if (!o) throw fail('NOT_FOUND', 404)
  stopProc(id)
  const s = procs.get(id)
  if (s?.child) s.child.once('exit', () => o.status === 'active' && launch(orgById(id) || o))
  else if (o.status === 'active') launch(o)
}

export function tenantState(id) {
  const s = procs.get(id)
  if (!s) return { running: false }
  return { running: Boolean(s.child && s.child.exitCode === null), pid: s.child?.pid || null, port: s.port, startedAt: s.startedAt ? new Date(s.startedAt).toISOString() : null, restarts: s.restarts, lastExit: s.lastExit }
}

export function startTenants(root) {
  rootDir = root
  syncTenants()
  // Arrêt du service : les processus des organisations s'arrêtent avec lui
  const stopAll = () => {
    for (const id of procs.keys()) stopProc(id)
  }
  process.once('exit', stopAll)
  for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => (stopAll(), process.exit(0)))
}

/* ---------------------------------------------------------------- aiguillage des requêtes (processus principal) */

function readOrgCookie(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === ORG_COOKIE) return decodeURIComponent(v.join('='))
  }
  return ''
}

function orgCookie(req, value) {
  const parts = [`${ORG_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${value ? 30 * 86_400 : 0}`]
  if (req.secure) parts.push('Secure')
  return parts.join('; ')
}

function addCookie(res, cookie) {
  const prev = res.getHeader('Set-Cookie')
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [String(prev)] : []), cookie])
}

const HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'host', 'content-length'])

/**
 * Transmet la requête au processus de l'organisation. body : corps déjà lu (JSON), sinon le flux est transmis tel quel.
 * after(status, headers) peut ajouter des cookies avant l'envoi de la réponse.
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
    r.pipe(res)
  })
  up.setTimeout(10 * 60_000, () => up.destroy(new Error('timeout')))
  up.on('error', () => {
    if (!res.headersSent) res.status(503).json({ error: 'TENANT_DOWN' })
    else res.end()
  })
  req.on('aborted', () => up.destroy())
  if (payload) up.end(payload)
  else req.pipe(up)
}

// Routes du processus principal jamais transmises : console Super Admin, état de la plateforme, accès publics
const LOCAL = [/^\/api\/superadmin(\/|$)/, /^\/api\/platform\/status$/, /^\/api\/public\//, /^\/api\/v1\//, /^\/api\/landing\//]

/**
 * Aiguillage monté par le processus principal, après les blocages et la maintenance de la plateforme
 * et avant ses propres routes de connexion.
 */
export function mountGateway(app, { log = () => {}, shareOf = () => null } = {}) {
  const smallJson = express.json({ limit: '4kb' })

  // Connexion : l'organisation est trouvée d'après l'identifiant ; le client historique garde sa propre route
  app.post('/api/auth/login', smallJson, (req, res, next) => {
    const login = req.body?.login
    if (typeof login !== 'string' || typeof req.body?.password !== 'string') return next()
    const id = orgOfLogin(login)
    if (!id || id === 'main') {
      if (readOrgCookie(req)) addCookie(res, orgCookie(req, ''))
      return next()
    }
    const org = orgById(id)
    if (!org) return next()
    if (org.status !== 'active') {
      log('org_suspended_login', { ip: String(req.ip || ''), login, detail: org.id })
      return res.status(403).json({ error: 'SUSPENDED' })
    }
    forward(req, res, org, { body: req.body, after: (status, r) => status < 300 && addCookie(r, orgCookie(req, org.id)) })
  })

  // Activation d'un compte d'une organisation : le lien porte l'organisation (?o=…)
  app.post('/api/auth/activate', smallJson, (req, res, next) => {
    const id = String(req.body?.org || '')
    if (!ORG_RE.test(id)) return next()
    const org = orgById(id)
    if (!org || org.status !== 'active') return res.status(404).json({ error: 'BAD_TOKEN' })
    const { org: _drop, ...body } = req.body
    forward(req, res, org, { body })
  })

  // Lien de partage d'un tableau d'une organisation : cherché dans chaque espace si le client historique ne le connaît pas
  app.get(/^\/api\/public\/share\/([A-Za-z0-9_-]{43})(\/.*)?$/, async (req, res, next) => {
    if (shareOf(req.params[0])) return next()
    for (const org of listOrgs().filter((o) => o.status === 'active')) {
      const found = await new Promise((resolve) => {
        const r = http.get({ host: '127.0.0.1', port: org.port, path: `/api/public/share/${req.params[0]}`, timeout: 3000 }, (x) => {
          x.resume()
          resolve(x.statusCode === 200)
        })
        r.on('error', () => resolve(false))
        r.on('timeout', () => (r.destroy(), resolve(false)))
      })
      if (found) return forward(req, res, org)
    }
    next()
  })

  app.use('/api', (req, res, next) => {
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
