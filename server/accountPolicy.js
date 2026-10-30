import fs from 'node:fs'
import path from 'node:path'
import { closeSessions, readUsers, writeUsers } from './auth.js'
import { recordAudit } from './auditTrail.js'

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
