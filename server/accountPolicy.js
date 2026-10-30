import fs from 'node:fs'
import path from 'node:path'
import { closeSessions, readUsers, writeUsers } from './auth.js'
import { all } from './monitor.js'
import { recordAudit } from './auditTrail.js'

/**
 * Comptes partagés (audit produit v4, constat 2) : l'adresse commune du prestataire (aroundexpressions@gmail.com)
 * lançait des enregistrements et modifiait le portail sans qu'on sache qui agissait. Chaque personne a désormais
 * son compte nominatif (créé dans la console Super Admin) et le compte partagé est DÉSACTIVÉ — jamais supprimé :
 * le Super Admin peut le réactiver d'un clic, son historique reste.
 *
 * Garde-fou contre le verrouillage : la désactivation n'a lieu que si un compte administrateur nominatif
 * (MMS_NOMINATIVE_ADMIN, par défaut belgacem.ounissi@aroundexpressions.com ou l'identifiant « belgacem ») existe, est
 * actif, a le rôle admin et s'est déjà connecté avec succès (journal de sécurité ou double authentification active).
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

/** Le compte nominatif peut-il administrer ? { ok, reason, email } */
export function nominativeAdmin(users = readUsers(), security = all('security') || []) {
  const wanted = list(process.env.MMS_NOMINATIVE_ADMIN, 'belgacem.ounissi@aroundexpressions.com,belgacem')
  const u = users.find((x) => wanted.includes(String(x.email).toLowerCase()) || wanted.includes(String(x.username || '').toLowerCase()))
  if (!u) return { ok: false, reason: 'NOMINATIVE_MISSING' }
  if (u.disabled) return { ok: false, reason: 'NOMINATIVE_DISABLED', email: u.email }
  if (roleOf(u) !== 'admin') return { ok: false, reason: 'NOMINATIVE_NOT_ADMIN', email: u.email }
  const email = String(u.email).toLowerCase()
  const loggedIn = Boolean(u.totp?.secret) || security.some((r) => r.type === 'login_ok' && String(r.login || '').toLowerCase() === email)
  if (!loggedIn) return { ok: false, reason: 'NOMINATIVE_NEVER_LOGGED_IN', email: u.email }
  return { ok: true, reason: '', email: u.email }
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
