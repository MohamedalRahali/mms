import fs from 'node:fs'
import path from 'node:path'
import { readUsers } from './auth.js'
import { brandOf } from './brand.js'
import {
  createOrg,
  issueOrgActivation,
  listDemoRequests,
  listOrgs,
  orgById,
  orgDir,
  orgUsers,
  restartTenant,
  setDemoStatus,
  syncTenants,
  tenantState,
  updateOrg,
} from './tenancy.js'

/**
 * Console Super Admin › العملاء : espaces clients (création automatique, suspension, sièges, redémarrage),
 * comptes de chaque espace (lecture, lien d'activation) et demandes de démonstration reçues par la page d'accueil.
 */

const roleOf = (u) => (['viewer', 'analyst', 'admin'].includes(u.role) ? u.role : 'admin')
const fail = (res, err) => res.status(err.status || 500).json({ error: err.code || 'FAILED' })
// Lien relatif : la console le complète avec l'adresse du site
const activationPath = (orgId, token) => `/login?activate=${encodeURIComponent(token)}${orgId === 'main' ? '' : `&o=${orgId}`}`

function summary(users) {
  return {
    users: users.length,
    admins: users.filter((u) => roleOf(u) === 'admin').length,
    managers: users.filter((u) => roleOf(u) === 'analyst').length,
    viewers: users.filter((u) => roleOf(u) === 'viewer').length,
    disabled: users.filter((u) => u.disabled).length,
    pending: users.filter((u) => u.pendingActivation).length,
  }
}

function brandName(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(orgDir(id), 'superadmin', 'brand.json'), 'utf8')).name || ''
  } catch {
    return ''
  }
}

export function mountOrgsAdmin(sa, { audit }) {
  sa.get('/orgs', (_req, res) => {
    const main = readUsers()
    res.json({
      orgs: [
        { id: 'main', main: true, name: brandOf().name || 'العميل الرئيسي', status: 'active', plan: 'enterprise', seats: 0, createdAt: null, ...summary(main), state: { running: true, pid: process.pid } },
        ...listOrgs().map((o) => ({ ...o, displayName: brandName(o.id) || o.name, ...summary(orgUsers(o.id)), state: tenantState(o.id) })),
      ],
      demo: { total: listDemoRequests().length, fresh: listDemoRequests().filter((d) => d.status === 'new').length },
    })
  })

  sa.post('/orgs', (req, res) => {
    try {
      const { org, activation } = createOrg(req.body || {}, req.sa.u)
      syncTenants()
      audit(req, 'org_create', org.name, `${org.id} · admin ${activation.email} · ${org.seats} comptes`)
      res.status(201).json({ org, activation: { email: activation.email, exp: activation.exp, path: activationPath(org.id, activation.token) } })
    } catch (err) {
      fail(res, err)
    }
  })

  sa.patch('/orgs/:id', (req, res) => {
    try {
      const before = orgById(req.params.id)
      const org = updateOrg(req.params.id, req.body || {})
      // Nouveau nom : identité de l'espace mise à jour, relue au redémarrage de son processus
      if (before && before.name !== org.name) {
        const file = path.join(orgDir(org.id), 'superadmin', 'brand.json')
        let brand = {}
        try {
          brand = JSON.parse(fs.readFileSync(file, 'utf8'))
        } catch {}
        fs.writeFileSync(file, JSON.stringify({ ...brand, name: org.name, updatedAt: new Date().toISOString() }))
        if (org.status === 'active') restartTenant(org.id)
      }
      syncTenants()
      const detail = Object.keys(req.body || {})
        .map((k) => `${k}=${String(req.body[k]).slice(0, 40)}`)
        .join(' · ')
      audit(req, req.body?.status === 'suspended' ? 'org_suspend' : req.body?.status === 'active' ? 'org_activate' : 'org_update', org.name, detail)
      res.json({ org: { ...org, state: tenantState(org.id) } })
    } catch (err) {
      fail(res, err)
    }
  })

  sa.post('/orgs/:id/restart', (req, res) => {
    try {
      restartTenant(req.params.id)
      audit(req, 'org_restart', req.params.id)
      res.json({ ok: true })
    } catch (err) {
      fail(res, err)
    }
  })

  sa.get('/orgs/:id/users', (req, res) => {
    const id = req.params.id
    if (id !== 'main' && !orgById(id)) return res.status(404).json({ error: 'NOT_FOUND' })
    const users = id === 'main' ? readUsers() : orgUsers(id)
    res.json({
      users: users
        .map((u) => ({ email: u.email, name: u.name || u.email, role: roleOf(u), disabled: Boolean(u.disabled), pending: Boolean(u.pendingActivation), mfa: Boolean(u.totp?.secret), createdAt: u.createdAt || null }))
        .sort((a, b) => a.email.localeCompare(b.email)),
    })
  })

  // Lien d'activation pour un compte d'un espace client (premier administrateur, mot de passe perdu)
  sa.post('/orgs/:id/activation', (req, res) => {
    try {
      if (!orgById(req.params.id)) return res.status(404).json({ error: 'NOT_FOUND' })
      const a = issueOrgActivation(req.params.id, req.body?.email, req.sa.u)
      audit(req, 'org_activation_link', a.email, req.params.id)
      res.json({ activation: { email: a.email, exp: a.exp, path: activationPath(req.params.id, a.token) } })
    } catch (err) {
      fail(res, err)
    }
  })

  sa.get('/demo-requests', (_req, res) => res.json({ requests: listDemoRequests().slice().reverse() }))
  sa.patch('/demo-requests/:id', (req, res) => {
    try {
      const r = setDemoStatus(req.params.id, req.body?.status)
      audit(req, 'demo_status', r.company, `${r.email} → ${r.status}`)
      res.json({ request: r })
    } catch (err) {
      fail(res, err)
    }
  })
}
