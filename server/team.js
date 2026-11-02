import crypto from 'node:crypto'
import express from 'express'
import { closeSessions, displayName, hashPassword, readUsers, ROLES, userSessions, writeUsers } from './auth.js'
import { listProfiles, mountPermissionsAdmin, permsOf, profileExists } from './permissions.js'
import { all, isOnline, lastSeenOf } from './monitor.js'
import { isSharedAccount, recordAudit } from './auditTrail.js'
import { emailTaken } from './tenancy.js'

/**
 * إدارة الفريق : gestion des comptes de l'organisation par son administrateur (Client Admin), dans l'application.
 *
 * - Rôles : admin = مسؤول الحساب (Client Admin), analyst = مدير (Manager), viewer = مستخدم (User).
 *   Le Super Admin Around Expressions reste dans sa console (/superadmin), hors de ces comptes.
 * - Création avec lien d'activation (la personne choisit son mot de passe) ou mot de passe provisoire.
 * - Modification du rôle, du profil de permissions, désactivation, fermeture des sessions, suppression.
 * - Profils de permissions (modules et boutons) de l'organisation : mêmes règles que dans la console Super Admin.
 * - Activité des comptes de l'organisation (connexions, recherches, exports, envois…), en lecture.
 * Chaque processus ne lit que les comptes de sa propre organisation (data/ ou data/orgs/<id>/).
 */

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const ACTIVATION_MS = 7 * 86_400_000
const lc = (s) => String(s || '').trim().toLowerCase()
const roleOf = (u) => (ROLES.includes(u.role) ? u.role : 'admin')
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex')
const fail = (res, status, error) => res.status(status).json({ error })

function row(u) {
  const seen = lastSeenOf(u.email)
  const perms = permsOf({ role: roleOf(u), profile: u.profile })
  return {
    email: u.email,
    name: displayName(u),
    role: roleOf(u),
    profile: u.profile || '',
    profileName: perms.profileName,
    disabled: Boolean(u.disabled),
    pending: Boolean(u.pendingActivation),
    mfa: Boolean(u.totp?.secret),
    createdAt: u.createdAt || null,
    lastSeen: seen ? new Date(seen.t).toISOString() : null,
    online: isOnline(u.email),
    sessions: userSessions(u.email).length,
  }
}

/**
 * seats() : nombre maximal de comptes de l'organisation (0 = sans limite) ; link(token) : adresse du lien d'activation.
 */
export function mountTeam(app, { seats = () => 0, link = (t) => `/login?activate=${t}`, org = () => ({}) } = {}) {
  const team = express.Router()
  team.use(express.json({ limit: '20kb' }))
  // Administrateurs de l'organisation seulement, sur un profil de permissions complet (un administrateur limité par
  // un profil personnalisé ne gère pas l'équipe) ; un compte partagé ne gère pas l'équipe
  team.use((req, res, next) => (req.user?.role === 'admin' && permsOf(req.user).profile === 'admin' && !isSharedAccount(req.user.email) ? next() : fail(res, 403, 'FORBIDDEN')))
  const audit = (req, action, target, detail = '') => recordAudit({ actor: req.user.email, role: req.user.role, ip: req.ip, category: 'users', action, target, detail })

  team.get('/', (_req, res) => {
    const users = readUsers()
    res.json({
      org: org(),
      seats: seats(),
      users: users.map(row).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)),
      profiles: listProfiles().map((p) => ({ id: p.id, name: p.name, builtin: p.builtin })),
      roles: ROLES,
    })
  })

  function activation(u, by) {
    const token = crypto.randomBytes(32).toString('base64url')
    u.activation = { hash: sha(token), exp: Date.now() + ACTIVATION_MS, by }
    return { token, url: link(token), exp: new Date(Date.now() + ACTIVATION_MS).toISOString() }
  }

  team.post('/users', (req, res) => {
    const email = lc(req.body?.email)
    if (!EMAIL_RE.test(email)) return fail(res, 400, 'BAD_EMAIL')
    const users = readUsers()
    const max = seats()
    if (max && users.length >= max) return fail(res, 409, 'SEATS')
    // Une adresse n'appartient qu'à une seule organisation de la plateforme
    if (users.some((u) => lc(u.email) === email) || emailTaken(email)) return fail(res, 409, 'EXISTS')
    const role = ROLES.includes(req.body?.role) ? req.body.role : 'viewer'
    const profile = String(req.body?.profile || '')
    if (profile && (!profileExists(profile) || ROLES.includes(profile))) return fail(res, 400, 'BAD_PROFILE')
    const password = String(req.body?.password || '')
    if (password && password.length < 10) return fail(res, 400, 'SHORT_PASSWORD')
    const u = {
      email,
      username: email,
      name: String(req.body?.name || '').trim().slice(0, 80) || email,
      role,
      ...(profile ? { profile } : {}),
      createdAt: new Date().toISOString(),
      createdBy: req.user.email,
      // Sans mot de passe : inutilisable jusqu'à l'activation par la personne elle-même
      ...hashPassword(password || crypto.randomBytes(24).toString('hex')),
      ...(password ? {} : { pendingActivation: true }),
    }
    const act = password ? null : activation(u, req.user.email)
    writeUsers([...users, u])
    audit(req, 'team_user_create', email, `role=${role}${profile ? ` profile=${profile}` : ''}${act ? ' · lien d’activation' : ''}`)
    res.status(201).json({ user: row(u), activation: act && { url: act.url, exp: act.exp } })
  })

  team.patch('/users/:email', (req, res) => {
    const email = lc(req.params.email)
    const users = readUsers()
    const u = users.find((x) => lc(x.email) === email)
    if (!u) return fail(res, 404, 'NOT_FOUND')
    const self = email === lc(req.user.email)
    const changes = []
    if (req.body?.name !== undefined) {
      u.name = String(req.body.name || '').trim().slice(0, 80) || u.email
      changes.push('nom')
    }
    if (req.body?.role !== undefined) {
      if (!ROLES.includes(req.body.role)) return fail(res, 400, 'BAD_ROLE')
      if (self && req.body.role !== 'admin') return fail(res, 400, 'SELF')
      changes.push(`rôle ${roleOf(u)} → ${req.body.role}`)
      u.role = req.body.role
    }
    if (req.body?.profile !== undefined) {
      if (self) return fail(res, 400, 'SELF')
      const id = String(req.body.profile || '')
      if (id && (!profileExists(id) || ROLES.includes(id))) return fail(res, 400, 'BAD_PROFILE')
      if (id) u.profile = id
      else delete u.profile
      changes.push(`profil ${id || 'du rôle'}`)
    }
    if (req.body?.disabled !== undefined) {
      if (self) return fail(res, 400, 'SELF')
      u.disabled = req.body.disabled === true
      changes.push(u.disabled ? 'désactivé' : 'réactivé')
    }
    // Toujours au moins un administrateur actif dans l'organisation
    if (!users.some((x) => roleOf(x) === 'admin' && !x.disabled)) return fail(res, 400, 'LAST_ADMIN')
    writeUsers(users)
    if (u.disabled) closeSessions(u.email)
    audit(req, 'team_user_update', u.email, changes.join(' · '))
    res.json({ user: row(u) })
  })

  // Nouveau lien : activation pas faite, ou mot de passe oublié (le lien remplace le mot de passe à son usage)
  team.post('/users/:email/activation', (req, res) => {
    const users = readUsers()
    const u = users.find((x) => lc(x.email) === lc(req.params.email))
    if (!u) return fail(res, 404, 'NOT_FOUND')
    const act = activation(u, req.user.email)
    writeUsers(users)
    audit(req, 'team_activation_link', u.email)
    res.json({ activation: { url: act.url, exp: act.exp } })
  })

  team.post('/users/:email/logout', (req, res) => {
    const u = readUsers().find((x) => lc(x.email) === lc(req.params.email))
    if (!u) return fail(res, 404, 'NOT_FOUND')
    const n = closeSessions(u.email)
    audit(req, 'team_sessions_closed', u.email, String(n))
    res.json({ closed: n })
  })

  team.delete('/users/:email', (req, res) => {
    const email = lc(req.params.email)
    if (email === lc(req.user.email)) return fail(res, 400, 'SELF')
    const users = readUsers()
    if (!users.some((u) => lc(u.email) === email)) return fail(res, 404, 'NOT_FOUND')
    const others = users.filter((u) => lc(u.email) !== email)
    if (!others.some((u) => roleOf(u) === 'admin' && !u.disabled)) return fail(res, 400, 'LAST_ADMIN')
    writeUsers(others)
    closeSessions(email)
    audit(req, 'team_user_delete', email)
    res.json({ ok: true })
  })

  // Activité des comptes de l'organisation (journal de ce processus : l'organisation seulement)
  const TYPES = new Set(['login', 'logout', 'search', 'filter', 'export', 'report', 'ai', 'send', 'share', 'delete', 'alert', 'open', 'print', 'view'])
  team.get('/activity', (req, res) => {
    const mine = new Set(readUsers().map((u) => lc(u.email)))
    const who = lc(req.query.email)
    const type = String(req.query.type || '')
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30)
    const from = Date.now() - days * 86_400_000
    const rows = []
    const list = all('activity')
    for (let k = list.length - 1; k >= 0 && rows.length < 500; k--) {
      const a = list[k]
      if (a.t < from) break
      const u = lc(a.u)
      if (!mine.has(u) || (who && u !== who) || (type && a.type !== type) || !TYPES.has(a.type)) continue
      rows.push({ t: new Date(a.t).toISOString(), user: a.u, type: a.type, detail: String(a.detail || '').slice(0, 200), ip: a.ip || '' })
    }
    res.json({ rows })
  })

  // Profils de permissions de l'organisation (modules et boutons), réglés par son administrateur
  mountPermissionsAdmin(team, {
    audit: (req, action, target, detail) => audit(req, `team_${action}`, target, detail),
    usersOf: (id) => readUsers().filter((u) => (u.profile || roleOf(u)) === id),
    detach: (id) => {
      const users = readUsers()
      const mine = users.filter((u) => u.profile === id)
      for (const u of mine) delete u.profile
      if (mine.length) writeUsers(users)
      return mine.length
    },
  })

  app.use('/api/team', team)
}
