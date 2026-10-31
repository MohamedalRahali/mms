import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { closeSessions, hashPassword, readUsers, writeUsers } from './auth.js'
import { isSharedAccount, recordAudit } from './auditTrail.js'

/**
 * Comptes partagés (audit produit v4, constat 2) : l'adresse commune du prestataire (aroundexpressions@gmail.com)
 * lançait des enregistrements et modifiait le portail sans qu'on sache qui agissait. Chaque personne a désormais
 * son compte nominatif (créé dans la console Super Admin) et le compte partagé est DÉSACTIVÉ — jamais supprimé :
 * le Super Admin peut le réactiver d'un clic, son historique reste.
 *
 * Garde-fou contre le verrouillage : la désactivation n'a lieu que si au moins UN compte administrateur nominatif
 * (n'importe lequel, hors comptes partagés ; MMS_NOMINATIVE_ADMIN peut restreindre à une liste) existe, est actif, a
 * le rôle admin et a sa double authentification ACTIVÉE (code validé) : preuve qu'une personne s'y connecte vraiment.
 * Un enrôlement commencé mais non validé (totpPending) ne compte pas.
 * Sinon rien ne change et la raison est inscrite au journal d'audit ; nouvel essai toutes les heures.
 * Une fois faite, la désactivation n'est plus jamais refaite (data/superadmin/migrations.json) : une réactivation par
 * le Super Admin est respectée. MMS_KEEP_SHARED=1 suspend la règle.
 */

const list = (v, d) =>
  String(v ?? d)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
const roleOf = (u) => (['viewer', 'analyst', 'admin'].includes(u.role) ? u.role : 'admin')
const KEY = 'shared-accounts-v4'

let migFile = ''
const readMig = () => {
  try {
    return JSON.parse(fs.readFileSync(migFile, 'utf8')) || {}
  } catch {
    return {}
  }
}

/** Un compte administrateur nominatif utilisable existe-t-il ? { ok, reason, email } */
export function nominativeAdmin(users = readUsers()) {
  const shared = list(process.env.MMS_SHARED_ACCOUNTS, 'aroundexpressions@gmail.com')
  const only = list(process.env.MMS_NOMINATIVE_ADMIN, '')
  const candidates = users.filter(
    (x) =>
      !shared.includes(String(x.email).toLowerCase()) &&
      (!only.length || only.includes(String(x.email).toLowerCase()) || only.includes(String(x.username || '').toLowerCase())),
  )
  if (!candidates.length) return { ok: false, reason: 'NOMINATIVE_MISSING' }
  const admins = candidates.filter((x) => !x.disabled && roleOf(x) === 'admin')
  if (!admins.length) return { ok: false, reason: 'NOMINATIVE_NOT_ADMIN' }
  const ready = admins.find((x) => Boolean(x.totp?.secret))
  if (!ready) return { ok: false, reason: 'NOMINATIVE_NO_2FA', email: admins[0].email }
  return { ok: true, reason: '', email: ready.email }
}

/** Désactive les comptes partagés si le garde-fou le permet ; renvoie ce qui a été fait */
export function applySharedAccountPolicy(now = new Date()) {
  if (process.env.MMS_KEEP_SHARED === '1') return { done: false, reason: 'KEEP_SHARED' }
  const mig = readMig()
  if (mig[KEY]?.done) return { done: true, already: true }
  const shared = list(process.env.MMS_SHARED_ACCOUNTS, 'aroundexpressions@gmail.com')
  const users = readUsers()
  const targets = users.filter((u) => shared.includes(String(u.email).toLowerCase()))
  if (!targets.length) return finish(mig, [], 'NO_SHARED_ACCOUNT')
  const admin = nominativeAdmin(users)
  if (!admin.ok) {
    // Une seule ligne d'audit par raison, pas une par heure
    if (mig[KEY]?.reason !== admin.reason) {
      recordAudit({ actor: 'system', category: 'users', action: 'shared_account_kept', target: targets.map((u) => u.email).join(','), detail: admin.reason })
      mig[KEY] = { done: false, reason: admin.reason, at: now.toISOString() }
      writeMig(mig)
    }
    return { done: false, reason: admin.reason }
  }
  const disabled = []
  for (const u of targets) {
    if (u.disabled) continue
    u.disabled = true
    u.disabledAt = now.toISOString()
    u.disabledReason = 'Compte partagé désactivé (audit v4) : utiliser un compte nominatif. Réactivable par le Super Admin.'
    disabled.push(u.email)
  }
  if (disabled.length) {
    writeUsers(users)
    for (const e of disabled) {
      closeSessions(e)
      recordAudit({ actor: 'system', category: 'users', action: 'shared_account_disabled', target: e, detail: `compte nominatif actif : ${admin.email}` })
    }
  }
  return finish(mig, disabled, '')
}

function finish(mig, disabled, reason) {
  mig[KEY] = { done: true, at: new Date().toISOString(), disabled, ...(reason ? { reason } : {}) }
  writeMig(mig)
  return { done: true, disabled, reason }
}

function writeMig(mig) {
  try {
    fs.mkdirSync(path.dirname(migFile), { recursive: true })
    fs.writeFileSync(migFile, JSON.stringify(mig, null, 1))
  } catch (err) {
    console.error('Migrations :', err.message)
  }
}

export function startAccountPolicy(superDir) {
  migFile = path.join(superDir, 'migrations.json')
  const run = () => {
    try {
      const seeded = seedNominativeAdmin()
      if (seeded.created) console.log(`Compte administrateur nominatif créé (activation à faire) : ${seeded.created}`)
      const r = applySharedAccountPolicy()
      if (r.disabled?.length) console.log(`Comptes partagés désactivés : ${r.disabled.join(', ')}`)
      else if (!r.done && r.reason) console.warn(`Compte partagé gardé actif : ${r.reason}`)
    } catch (err) {
      console.error('Comptes partagés :', err.message)
    }
  }
  // Après le chargement des journaux (initMonitor) : 30 s après le démarrage, puis toutes les heures
  setTimeout(run, 30_000).unref()
  setInterval(run, 3600_000).unref()
}

export const migrationsFileFor = (superDir) => path.join(superDir, 'migrations.json')
export const _setMigFile = (f) => (migFile = f)

/* ---------------------------------------------------------------- audit produit v5, constat 2 */

/**
 * Compte partagé en LECTURE SEULE dès qu'un autre compte administrateur (nominatif, non désactivé) existe : il ne peut
 * plus lancer d'enregistrement, modifier le portail, les veilles, les droits… (toute écriture refusée, SHARED_READONLY).
 * Personne n'est verrouillé dehors : la lecture reste permise, les utilisateurs du client (w.farhat@npdc.gov.ly…) ne
 * sont pas concernés, et la console Super Admin garde tous les droits. MMS_KEEP_SHARED=1 suspend la règle.
 * Chaque usage du compte partagé est inscrit au journal d'audit (au plus une ligne de lecture par 10 minutes),
 * signalé en rouge dans le journal et la console Super Admin.
 */
const WRITE_OK = [/^\/auth\//, /^\/support\b/, /^\/feedback$/, /^\/platform\/activity$/, /^\/face\/(probe|verify)$/]
export function otherActiveAdmin(users = readUsers()) {
  return users.find((u) => !isSharedAccount(u.email) && !u.disabled && roleOf(u) === 'admin') || null
}
export const sharedReadOnly = (email, users = readUsers()) => process.env.MMS_KEEP_SHARED !== '1' && isSharedAccount(email) && Boolean(otherActiveAdmin(users))

const lastSeen = new Map()
export function sharedGate(req, res, next) {
  const email = req.user?.email
  if (!isSharedAccount(email)) return next()
  const now = Date.now()
  const write = req.method !== 'GET' && req.method !== 'HEAD'
  if (!write && now - (lastSeen.get(email) || 0) > 10 * 60_000) {
    lastSeen.set(email, now)
    recordAudit({ actor: email, role: req.user.role, ip: req.ip, category: 'login', action: 'shared_account_used', target: req.path.slice(0, 120) })
  }
  if (write && !WRITE_OK.some((re) => re.test(req.path)) && sharedReadOnly(email)) {
    req.auditAction = 'shared_account_blocked'
    return res.status(403).json({ error: 'SHARED_READONLY' })
  }
  next()
}

/**
 * Compte administrateur nominatif créé par migration (réversible : le Super Admin peut le désactiver) — sans mot de
 * passe en clair : empreinte aléatoire inutilisable jusqu'à l'activation, par un lien à usage unique (7 jours) que le
 * Super Admin génère dans sa console. Sauvegarde de users.json avant l'ajout.
 */
const SEED_KEY = 'nominative-admin-v5'
export const SEED_ADMIN = () => ({
  email: String(process.env.MMS_SEED_ADMIN_EMAIL || 'belgacem.ounissi@aroundexpressions.com').trim().toLowerCase(),
  name: process.env.MMS_SEED_ADMIN_NAME || 'Belgacem Ounissi',
})
export function seedNominativeAdmin(now = new Date()) {
  if (process.env.MMS_SEED_ADMIN === '0') return { done: false, reason: 'DISABLED' }
  const mig = readMig()
  if (mig[SEED_KEY]?.done) return { done: true, already: true }
  const { email, name } = SEED_ADMIN()
  const users = readUsers()
  if (users.some((u) => String(u.email).toLowerCase() === email)) {
    mig[SEED_KEY] = { done: true, at: now.toISOString(), existed: true }
    writeMig(mig)
    return { done: true, existed: true }
  }
  try {
    if (migFile) {
      fs.mkdirSync(path.dirname(migFile), { recursive: true })
      fs.writeFileSync(path.join(path.dirname(migFile), `users-avant-${SEED_KEY}.json`), JSON.stringify({ users }, null, 2), { mode: 0o600 })
    }
  } catch (err) {
    console.error('Sauvegarde users.json :', err.message)
    return { done: false, reason: 'BACKUP_FAILED' }
  }
  users.push({
    email,
    username: email.split('@')[0],
    name,
    role: 'admin',
    ...hashPassword(crypto.randomBytes(32).toString('hex')),
    pendingActivation: true,
    createdAt: now.toISOString(),
    createdBy: `migration ${SEED_KEY}`,
  })
  writeUsers(users)
  recordAudit({ actor: 'system', category: 'users', action: 'nominative_admin_created', target: email, detail: 'activation par lien à usage unique (console Super Admin)' })
  mig[SEED_KEY] = { done: true, at: now.toISOString(), email }
  writeMig(mig)
  return { done: true, created: email }
}

const ACTIVATION_MS = 7 * 86_400_000
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex')

/** Nouveau lien d'activation (ou de mot de passe à définir) : seule l'empreinte du jeton est gardée */
export function issueActivation(email, by = '', now = Date.now()) {
  const users = readUsers()
  const u = users.find((x) => String(x.email).toLowerCase() === String(email).toLowerCase())
  if (!u) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND', status: 404 })
  const token = crypto.randomBytes(32).toString('base64url')
  u.activation = { hash: sha(token), exp: now + ACTIVATION_MS, by: String(by).slice(0, 120) }
  writeUsers(users)
  recordAudit({ actor: by ? `superadmin:${by}` : 'system', category: 'users', action: 'activation_link_issued', target: u.email })
  return { token, exp: new Date(now + ACTIVATION_MS).toISOString() }
}

/** Activation : mot de passe choisi par la personne (10 caractères au moins), lien consommé */
export function activateAccount(token, password, now = Date.now()) {
  const fail = (code, status = 400) => Object.assign(new Error(code), { code, status })
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw fail('BAD_TOKEN')
  if (typeof password !== 'string' || password.length < 10 || password.length > 1000) throw fail('TOO_SHORT')
  const users = readUsers()
  const h = Buffer.from(sha(token))
  const u = users.find((x) => typeof x.activation?.hash === 'string' && x.activation.hash.length === 64 && crypto.timingSafeEqual(Buffer.from(x.activation.hash), h))
  if (!u) throw fail('BAD_TOKEN', 404)
  if (u.activation.exp < now) throw fail('EXPIRED', 410)
  if (password.toLowerCase() === String(u.email).toLowerCase() || password.toLowerCase() === String(u.username || '').toLowerCase()) throw fail('WEAK')
  Object.assign(u, hashPassword(password), { passwordChangedAt: new Date(now).toISOString(), activatedAt: new Date(now).toISOString() })
  delete u.activation
  delete u.pendingActivation
  writeUsers(users)
  closeSessions(u.email)
  recordAudit({ actor: u.email, role: u.role, category: 'users', action: 'account_activated', target: u.email })
  return { email: u.email }
}

/** État pour la console Super Admin */
export function sharedPolicyState(users = readUsers()) {
  const shared = users.filter((u) => isSharedAccount(u.email)).map((u) => ({ email: u.email, disabled: Boolean(u.disabled), readOnly: sharedReadOnly(u.email, users) }))
  const seed = users.find((u) => String(u.email).toLowerCase() === SEED_ADMIN().email)
  return {
    shared,
    otherAdmin: otherActiveAdmin(users)?.email || '',
    seed: seed ? { email: seed.email, pending: Boolean(seed.pendingActivation), linkActive: Boolean(seed.activation && seed.activation.exp > Date.now()), mfa: Boolean(seed.totp?.secret) } : null,
  }
}
