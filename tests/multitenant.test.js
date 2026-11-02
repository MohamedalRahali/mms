import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { hashPassword } from '../server/auth.js'
import { initTenancy, tenantEnv } from '../server/tenancy.js'

/**
 * Espaces clients de bout en bout, sur un vrai serveur (processus principal + un processus par organisation) :
 * Client A (10 comptes), Client B (plusieurs comptes), isolation des données, rôles, sessions, suspension,
 * aiguillage à la connexion, demande de démonstration. Données dans un dossier temporaire.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-saas-'))
const data = path.join(tmp, 'data')
const PORT = 8790 + Math.floor(Math.random() * 8)
const BASE = `http://127.0.0.1:${PORT}`
const SA = { user: 'sa@around.test', password: 'Sa-Password-1234' }
const MAIN_ADMIN = { email: 'admin@main.test', password: 'Main-Admin-12345' }
let server

fs.mkdirSync(path.join(data, 'superadmin'), { recursive: true })
fs.mkdirSync(path.join(data, 'libye'), { recursive: true })
fs.writeFileSync(path.join(data, 'superadmin', 'mfa.json'), JSON.stringify({ requireAdmins: false, requireAll: false, version: 2 }))
fs.writeFileSync(path.join(data, 'users.json'), JSON.stringify({ users: [{ email: MAIN_ADMIN.email, username: MAIN_ADMIN.email, name: 'Main Admin', role: 'admin', createdAt: new Date().toISOString(), ...hashPassword(MAIN_ADMIN.password) }] }))

/** Navigateur minimal : cookies gardés par client */
function client() {
  const jar = new Map()
  async function call(method, url, body, headers = {}) {
    const res = await fetch(BASE + url, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    })
    for (const c of res.headers.getSetCookie()) {
      const [kv, ...attrs] = c.split(';')
      const [k, ...v] = kv.split('=')
      if (attrs.some((a) => /max-age=0/i.test(a.trim())) || !v.join('=')) jar.delete(k.trim())
      else jar.set(k.trim(), v.join('='))
    }
    const json = await res.json().catch(() => ({}))
    return { status: res.status, json }
  }
  return {
    jar,
    get: (u) => call('GET', u),
    post: (u, b, h) => call('POST', u, b || {}, h),
    put: (u, b, h) => call('PUT', u, b, h),
    patch: (u, b, h) => call('PATCH', u, b, h),
    del: (u, h) => call('DELETE', u, undefined, h),
  }
}

const sa = client()
const saH = { 'x-superadmin': '1' }
const orgs = {}

async function waitFor(fn, ms = 60_000) {
  const end = Date.now() + ms
  for (;;) {
    try {
      if (await fn()) return
    } catch {}
    if (Date.now() > end) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 300))
  }
}

async function login(email, password) {
  const c = client()
  const r = await c.post('/api/auth/login', { login: email, password })
  return { c, r }
}

/** Active le premier administrateur d'un espace grâce au lien donné par la console */
async function activate(link, password) {
  const u = new URL(link, BASE)
  const r = await client().post('/api/auth/activate', { token: u.searchParams.get('activate'), password, org: u.searchParams.get('o') })
  assert.equal(r.status, 200, JSON.stringify(r.json))
}

before(async () => {
  const salt = crypto.randomBytes(16).toString('hex')
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      MMS_PORT: String(PORT),
      MMS_HOST: '127.0.0.1',
      MMS_DATA_DIR: data,
      MMS_SHARED_DATA: data,
      LIBYE_DATA_DIR: path.join(data, 'libye'),
      MOSAIQUE_DATA_DIR: path.join(data, 'mosaique'),
      MMS_TENANT_PORT_BASE: String(PORT + 100),
      MMS_SEED_ADMIN: '0',
      MMS_DEMO: '0',
      MMS_GEO: '0',
      SUPERADMIN_USER: SA.user,
      SUPERADMIN_PASSWORD_HASH: `${salt}:${hashPassword(SA.password, salt).hash}`,
      SUPERADMIN_TOKEN_KEY: crypto.randomBytes(32).toString('hex'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  server.stdout.on('data', (b) => (log += b))
  server.stderr.on('data', (b) => (log += b))
  server.on('exit', (code) => code && console.error(log.slice(-4000)))
  await waitFor(async () => (await fetch(`${BASE}/api/platform/status`)).ok)
  assert.equal((await sa.post('/api/superadmin/login', { login: SA.user, password: SA.password })).status, 200)
})

after(() => {
  server?.kill('SIGTERM')
  // Laisse aux processus des organisations le temps de s'arrêter avant d'effacer leurs dossiers
  setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true }), 1500).unref()
})

test('le Super Admin crée deux espaces clients, démarrés automatiquement', async () => {
  for (const [key, name, seats] of [
    ['A', 'Client A Media Group', 20],
    ['B', 'Client B Telecom', 4],
  ]) {
    const r = await sa.post('/api/superadmin/orgs', { name, adminEmail: `admin@client-${key.toLowerCase()}.test`, adminName: `Admin ${key}`, seats }, saH)
    assert.equal(r.status, 201, JSON.stringify(r.json))
    assert.match(r.json.activation.path, /^\/login\?activate=.+&o=org_[a-z0-9]+$/)
    orgs[key] = { id: r.json.org.id, link: r.json.activation.path, admin: `admin@client-${key.toLowerCase()}.test` }
  }
  // Même nom refusé, adresse déjà prise refusée
  assert.equal((await sa.post('/api/superadmin/orgs', { name: 'Client A Media Group', adminEmail: 'x@y.test' }, saH)).status, 409)
  assert.equal((await sa.post('/api/superadmin/orgs', { name: 'Autre', adminEmail: MAIN_ADMIN.email }, saH)).status, 409)
  await waitFor(async () => {
    const r = await sa.get('/api/superadmin/orgs')
    return r.json.orgs.filter((o) => !o.main).every((o) => o.state.running)
  })
  // Le processus répond (activation possible)
  await waitFor(async () => (await client().post('/api/auth/activate', { token: 'x'.repeat(30), password: 'y'.repeat(12), org: orgs.A.id })).status === 404)
  await waitFor(async () => (await client().post('/api/auth/activate', { token: 'x'.repeat(30), password: 'y'.repeat(12), org: orgs.B.id })).status === 404)
})

test('Client A : administrateur activé, 9 comptes créés (10 au total), chacun arrive dans l’espace A', async () => {
  await activate(orgs.A.link, 'Admin-A-Password!')
  const { c: admin, r } = await login(orgs.A.admin, 'Admin-A-Password!')
  assert.equal(r.status, 200, JSON.stringify(r.json))
  assert.ok(admin.jar.get('mms_org'), 'cookie d’aiguillage posé')
  const me = await admin.get('/api/auth/me')
  assert.equal(me.json.user.org.id, orgs.A.id)
  assert.equal(me.json.user.org.name, 'Client A Media Group')
  assert.equal(me.json.user.org.main, false)
  assert.equal(me.json.user.role, 'admin')
  orgs.A.adminClient = admin
  orgs.A.users = []
  for (let i = 1; i <= 9; i++) {
    const role = i <= 2 ? 'analyst' : 'viewer'
    const email = `user${i}@client-a.test`
    const created = await admin.post('/api/team/users', { email, name: `A User ${i}`, role, password: `A-user-pass-${i}!` })
    assert.equal(created.status, 201, JSON.stringify(created.json))
    orgs.A.users.push({ email, role, password: `A-user-pass-${i}!` })
  }
  const team = await admin.get('/api/team')
  assert.equal(team.json.users.length, 10)
  assert.equal(team.json.org.name, 'Client A Media Group')
  for (const u of orgs.A.users) {
    const { c, r } = await login(u.email, u.password)
    assert.equal(r.status, 200, u.email)
    const m = await c.get('/api/auth/me')
    assert.equal(m.json.user.org.id, orgs.A.id, u.email)
    assert.equal(m.json.user.role, u.role)
    u.client = c
  }
})

test('Client B : administrateur et comptes à part, limite de comptes appliquée', async () => {
  await activate(orgs.B.link, 'Admin-B-Password!')
  const { c: admin, r } = await login(orgs.B.admin, 'Admin-B-Password!')
  assert.equal(r.status, 200)
  orgs.B.adminClient = admin
  orgs.B.users = []
  for (let i = 1; i <= 3; i++) {
    const email = `user${i}@client-b.test`
    const res = await admin.post('/api/team/users', { email, name: `B User ${i}`, role: i === 1 ? 'analyst' : 'viewer', password: `B-user-pass-${i}!` })
    assert.equal(res.status, 201)
    orgs.B.users.push({ email, password: `B-user-pass-${i}!` })
  }
  // 4 comptes au plus pour B
  assert.equal((await admin.post('/api/team/users', { email: 'user4@client-b.test', password: 'B-user-pass-4!' })).json.error, 'SEATS')
  // Une adresse de A ne peut pas être reprise dans B
  const b = await login(orgs.B.users[0].email, orgs.B.users[0].password)
  assert.equal((await b.c.get('/api/auth/me')).json.user.org.id, orgs.B.id)
  orgs.B.users[0].client = b.c
  // Lien d'activation : compte sans mot de passe en attente
  const team = (await admin.get('/api/team')).json.users
  assert.equal(team.length, 4)
  assert.ok(team.every((u) => u.email.endsWith('@client-b.test')))
})

test('adresse unique sur toute la plateforme', async () => {
  const r = await orgs.A.adminClient.post('/api/team/users', { email: orgs.B.admin, password: 'Whatever-123456' })
  assert.equal(r.status, 409)
  const r2 = await orgs.A.adminClient.post('/api/team/users', { email: MAIN_ADMIN.email, password: 'Whatever-123456' })
  assert.equal(r2.status, 409)
})

test('isolation des données : tableaux, équipe, identité, journal', async () => {
  const a = orgs.A.adminClient
  const b = orgs.B.adminClient
  const board = { id: 'a-board', name: 'Tableau confidentiel A', widgets: [] }
  const put = await a.put('/api/dashboards', { boards: [board] })
  assert.equal(put.status, 200, JSON.stringify(put.json))
  const aBoards = (await a.get('/api/dashboards')).json.boards.map((x) => x.name)
  assert.ok(aBoards.includes('Tableau confidentiel A'))
  const bBoards = ((await b.get('/api/dashboards')).json.boards || []).map((x) => x.name)
  assert.ok(!bBoards.includes('Tableau confidentiel A'), 'B ne voit pas le tableau de A')
  // Équipe : chacun ne voit que ses comptes ; B ne peut pas modifier un compte de A
  const aTeam = (await a.get('/api/team')).json.users.map((u) => u.email)
  assert.ok(aTeam.every((e) => e.endsWith('@client-a.test')))
  assert.equal((await b.patch(`/api/team/users/${encodeURIComponent('user3@client-a.test')}`, { disabled: true })).status, 404)
  // Identité de l'interface
  assert.equal((await a.get('/api/platform/brand')).json.name, 'Client A Media Group')
  assert.equal((await b.get('/api/platform/brand')).json.name, 'Client B Telecom')
  // Journal d'audit de A : aucune ligne de B
  const trail = (await a.get('/api/audit-trail')).json.rows || []
  assert.ok(trail.length > 0)
  assert.ok(trail.every((row) => !String(row.actor).includes('client-b')), 'journal de A sans B')
  // Activité de l'équipe A : comptes de A seulement
  const act = (await a.get('/api/team/activity?days=1')).json.rows
  assert.ok(act.some((row) => row.type === 'login'))
  assert.ok(act.every((row) => row.user.endsWith('@client-a.test')))
})

test('cookie d’aiguillage falsifié : la session d’un espace ne vaut rien dans un autre', async () => {
  const b = orgs.B.adminClient
  const forged = client()
  forged.jar.set('mms_session', b.jar.get('mms_session'))
  forged.jar.set('mms_org', orgs.A.id)
  assert.equal((await forged.get('/api/auth/me')).status, 401)
  assert.equal((await forged.get('/api/dashboards')).status, 401)
  // Sans aiguillage, le client historique ne connaît pas non plus cette session
  const noOrg = client()
  noOrg.jar.set('mms_session', b.jar.get('mms_session'))
  assert.equal((await noOrg.get('/api/auth/me')).status, 401)
})

test('rôles : Client Admin, Manager et User', async () => {
  const manager = orgs.A.users.find((u) => u.role === 'analyst').client
  const user = orgs.A.users.find((u) => u.role === 'viewer').client
  assert.equal((await manager.get('/api/team')).status, 403, 'un Manager ne gère pas l’équipe')
  assert.equal((await user.get('/api/team')).status, 403, 'un User ne gère pas l’équipe')
  assert.equal((await user.put('/api/dashboards', { boards: [] })).status, 403, 'un User ne modifie pas les tableaux')
  const boards = (await manager.get('/api/dashboards')).json.boards
  assert.equal((await manager.put('/api/dashboards', { boards })).status, 200, 'un Manager modifie les tableaux')
  // Le Client Admin change un rôle : User → Manager
  const target = orgs.A.users.find((u) => u.role === 'viewer')
  const r = await orgs.A.adminClient.patch(`/api/team/users/${encodeURIComponent(target.email)}`, { role: 'analyst' })
  assert.equal(r.json.user.role, 'analyst')
  assert.equal((await target.client.get('/api/auth/me')).json.user.role, 'analyst')
  // Profil de permissions propre à l'organisation : créé par son administrateur, attribué à un compte
  const p = await orgs.A.adminClient.post('/api/team/permissions', { name: 'Lecture analyse', copyOf: 'viewer' })
  assert.equal(p.status, 201)
  await orgs.A.adminClient.put(`/api/team/permissions/${p.json.profile.id}`, { modules: ['stats'], actions: [] })
  await orgs.A.adminClient.patch(`/api/team/users/${encodeURIComponent(target.email)}`, { profile: p.json.profile.id })
  assert.deepEqual((await target.client.get('/api/auth/me')).json.user.perms.modules, ['stats'])
  assert.equal((await target.client.get('/api/dashboards')).status, 403)
  // B ne voit pas ce profil
  assert.ok(!(await orgs.B.adminClient.get('/api/team')).json.profiles.some((x) => x.name === 'Lecture analyse'))
  // Le dernier administrateur ne peut pas se retirer
  assert.equal((await orgs.A.adminClient.patch(`/api/team/users/${encodeURIComponent(orgs.A.admin)}`, { role: 'viewer' })).status, 400)
})

test('sessions : déconnexion, désactivation par le Client Admin, fermeture des sessions', async () => {
  const u = orgs.A.users[5]
  assert.equal((await u.client.post('/api/auth/logout')).status, 200)
  assert.equal(u.client.jar.has('mms_org'), false, 'aiguillage effacé à la déconnexion')
  assert.equal((await u.client.get('/api/auth/me')).status, 401)
  const again = await login(u.email, u.password)
  assert.equal(again.r.status, 200)
  // Désactivé : session coupée, connexion refusée
  await orgs.A.adminClient.patch(`/api/team/users/${encodeURIComponent(u.email)}`, { disabled: true })
  assert.equal((await again.c.get('/api/auth/me')).status, 401)
  assert.equal((await login(u.email, u.password)).r.json.error, 'DISABLED')
  await orgs.A.adminClient.patch(`/api/team/users/${encodeURIComponent(u.email)}`, { disabled: false })
  const back = await login(u.email, u.password)
  assert.equal(back.r.status, 200)
  // Fermeture de toutes ses sessions
  assert.equal((await orgs.A.adminClient.post(`/api/team/users/${encodeURIComponent(u.email)}/logout`)).json.closed, 1)
  assert.equal((await back.c.get('/api/auth/me')).status, 401)
  // Mauvais mot de passe d'un compte d'un espace : refus normal
  assert.equal((await login(u.email, 'wrong-password')).r.status, 401)
})

test('client historique : inchangé, ne voit que ses comptes', async () => {
  const { c, r } = await login(MAIN_ADMIN.email, MAIN_ADMIN.password)
  assert.equal(r.status, 200)
  assert.equal(c.jar.has('mms_org'), false)
  const me = await c.get('/api/auth/me')
  assert.equal(me.json.user.org.main, true)
  // Comptes du client historique : gérés par le Super Admin seulement, comme avant (pas de gestion d'équipe ici)
  assert.equal((await c.get('/api/team')).status, 404)
  const boards = ((await c.get('/api/dashboards')).json.boards || []).map((x) => x.name)
  assert.ok(!boards.includes('Tableau confidentiel A'))
})

test('fonctions du client historique fermées dans un espace client', async () => {
  const a = orgs.A.adminClient
  assert.equal((await a.get('/api/rasd')).json.error, 'NOT_IN_PLAN')
  assert.equal((await a.get('/api/recordings')).json.error, 'NOT_IN_PLAN')
  assert.equal((await a.get('/api/auth/me')).json.user.org.features.pipeline, false)
})

test('suspension d’un espace par le Super Admin, puis réactivation', async () => {
  const r = await sa.patch(`/api/superadmin/orgs/${orgs.B.id}`, { status: 'suspended' }, saH)
  assert.equal(r.status, 200)
  assert.equal((await orgs.B.users[0].client.get('/api/auth/me')).status, 401)
  assert.equal((await login(orgs.B.admin, 'Admin-B-Password!')).r.json.error, 'SUSPENDED')
  await sa.patch(`/api/superadmin/orgs/${orgs.B.id}`, { status: 'active' }, saH)
  await waitFor(async () => (await login(orgs.B.admin, 'Admin-B-Password!')).r.status === 200)
  // Données conservées pendant la suspension
  assert.equal((await sa.get(`/api/superadmin/orgs/${orgs.B.id}/users`)).json.users.length, 4)
})

test('demande de démonstration depuis la page d’accueil, visible dans la console', async () => {
  const visitor = client()
  assert.equal((await visitor.post('/api/landing/demo', { name: 'Sara', email: 'bad' })).json.error, 'BAD_EMAIL')
  const r = await visitor.post('/api/landing/demo', { name: 'Sara Ben Ali', email: 'sara@agency.test', company: 'Agency Test', interest: 'monitoring', message: 'Hello', lang: 'fr' })
  assert.equal(r.status, 201)
  const list = (await sa.get('/api/superadmin/demo-requests')).json.requests
  assert.equal(list[0].company, 'Agency Test')
  const upd = await sa.patch(`/api/superadmin/demo-requests/${list[0].id}`, { status: 'contacted' }, saH)
  assert.equal(upd.json.request.status, 'contacted')
})

test('le Super Admin voit chaque espace et peut relancer son processus', async () => {
  const r = await sa.get('/api/superadmin/orgs')
  const a = r.json.orgs.find((o) => o.id === orgs.A.id)
  assert.equal(a.users, 10)
  assert.equal(a.admins, 1)
  assert.ok(a.state.running)
  assert.equal((await sa.post(`/api/superadmin/orgs/${orgs.A.id}/restart`, {}, saH)).status, 200)
  // Sessions gardées sur disque : toujours connecté après le redémarrage
  await waitFor(async () => (await orgs.A.adminClient.get('/api/auth/me')).status === 200)
})

test('un espace client ne reçoit ni le Telegram ni les destinataires d’alertes du client historique', () => {
  const saved = { ...process.env }
  Object.assign(process.env, { TELEGRAM_BOT_TOKEN: 'main-bot', TELEGRAM_CHAT_ID: '-100main', MMS_RADAR_ALERTS: '1', MMS_RADAR_ALERTS_TO: 'cell@main.test', MMS_BRIEFING_TO: 'dg@main.test' })
  initTenancy(data)
  const env = tenantEnv({ id: 'org_test01', name: 'T', port: 9999 })
  // Vides et non absentes : dotenv ne les réintroduit pas depuis le .env du serveur
  for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'MMS_RADAR_ALERTS_TO', 'MMS_BRIEFING_TO']) assert.equal(env[k], '', k)
  assert.equal(env.MMS_RADAR_ALERTS, '0')
  process.env = saved
})

test('aiguillage périmé : une connexion du client historique reste chez lui et efface l’aiguillage', async () => {
  const c = client()
  c.jar.set('mms_org', orgs.A.id)
  const r = await c.post('/api/auth/login', { login: MAIN_ADMIN.email, password: MAIN_ADMIN.password })
  assert.equal(r.status, 200, JSON.stringify(r.json))
  assert.equal(c.jar.has('mms_org'), false, 'aiguillage effacé malgré le cookie de session posé ensuite')
  assert.equal((await c.get('/api/auth/me')).json.user.org.main, true)
  // Activation sans organisation : jamais transmise à l'espace du cookie
  const act = await c.post('/api/auth/activate', { token: 'x'.repeat(40), password: 'y'.repeat(12) })
  assert.equal(act.status, 404)
})

test('administrateur limité par un profil : pas de gestion d’équipe, pas de changement de son propre profil', async () => {
  const a = orgs.A.adminClient
  const email = 'limited-admin@client-a.test'
  assert.equal((await a.post('/api/team/users', { email, role: 'admin', password: 'Limited-admin-1!' })).status, 201)
  const prof = (await a.get('/api/team/permissions')).json.profiles.find((x) => x.name === 'Lecture analyse')
  assert.ok(prof)
  assert.equal((await a.patch(`/api/team/users/${encodeURIComponent(email)}`, { profile: prof.id })).status, 200)
  const { c } = await login(email, 'Limited-admin-1!')
  assert.equal((await c.get('/api/team')).status, 403)
  assert.equal((await c.patch(`/api/team/users/${encodeURIComponent(email)}`, { profile: '' })).status, 403)
  assert.equal((await c.put(`/api/team/permissions/${prof.id}`, { modules: ['dashboard'], actions: ['export'] })).status, 403)
  // Un administrateur complet ne change pas non plus son propre profil
  assert.equal((await a.patch(`/api/team/users/${encodeURIComponent(orgs.A.admin)}`, { profile: prof.id })).json.error, 'SELF')
  await a.del(`/api/team/users/${encodeURIComponent(email)}`)
})

test('lien de partage d’un tableau d’un espace client : trouvé sans session, jeton inconnu refusé', async () => {
  const a = orgs.A.adminClient
  const sh = await a.post('/api/shares', { boardId: 'a-board', days: 7 })
  assert.equal(sh.status, 201, JSON.stringify(sh.json))
  const pub = await client().get(`/api/public/share/${sh.json.token}`)
  assert.equal(pub.status, 200)
  assert.equal(pub.json.board.name, 'Tableau confidentiel A')
  assert.equal((await client().get(`/api/public/share/${'z'.repeat(43)}`)).status, 404)
})

test('le Super Admin ne peut pas créer chez le client historique une adresse déjà prise dans un espace', async () => {
  const r = await sa.post('/api/superadmin/users', { email: orgs.A.admin, password: 'Whatever-123456', role: 'viewer' }, saH)
  assert.equal(r.status, 409)
})

test('espace suspendu : mauvais mot de passe = réponse ordinaire, rien n’indique que le compte existe', async () => {
  await sa.patch(`/api/superadmin/orgs/${orgs.B.id}`, { status: 'suspended' }, saH)
  assert.equal((await login(orgs.B.admin, 'not-the-password')).r.json.error, 'BAD_CREDENTIALS')
  assert.equal((await login(orgs.B.admin, 'Admin-B-Password!')).r.json.error, 'SUSPENDED')
  await sa.patch(`/api/superadmin/orgs/${orgs.B.id}`, { status: 'active' }, saH)
  await waitFor(async () => (await login(orgs.B.admin, 'Admin-B-Password!')).r.status === 200)
})

test('renommer un espace : un seul processus relancé, toujours joignable', async () => {
  const before = (await sa.get('/api/superadmin/orgs')).json.orgs.find((o) => o.id === orgs.B.id).state.pid
  assert.equal((await sa.patch(`/api/superadmin/orgs/${orgs.B.id}`, { name: 'Client B Telecom Group' }, saH)).status, 200)
  await waitFor(async () => {
    const st = (await sa.get('/api/superadmin/orgs')).json.orgs.find((o) => o.id === orgs.B.id).state
    return st.running && st.pid !== before
  })
  await waitFor(async () => (await orgs.B.adminClient.get('/api/platform/brand')).json.name === 'Client B Telecom Group')
})

// En dernier : bloque les connexions aux espaces depuis cette adresse pour 15 minutes
test('force brute sur les espaces clients : limite commune par adresse IP, visible dans la console', async () => {
  let last
  for (let i = 0; i < 22; i++) last = await login(i % 2 ? orgs.A.admin : orgs.B.admin, `wrong-${i}`)
  assert.equal(last.r.status, 429)
  assert.equal(last.r.json.error, 'LOCKED')
  const sec = (await sa.get('/api/superadmin/security')).json
  assert.ok(JSON.stringify(sec).includes(orgs.A.admin), 'échecs inscrits dans le journal de sécurité de la console')
})
