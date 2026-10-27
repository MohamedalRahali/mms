import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { denialOf, initPermissions, listProfiles, permissionGate, permsOf } from '../server/permissions.js'

/** Permissions par profil : profils de base = anciens droits par rôle, et refus des appels hors profil */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-perms-'))
initPermissions(dir)

test('profils de base : mêmes droits qu’avant (minRole)', () => {
  const viewer = permsOf({ role: 'viewer' })
  const analyst = permsOf({ role: 'analyst' })
  const admin = permsOf({ role: 'admin' })
  // Lecture pour tous
  for (const p of ['/news', '/news/stats', '/radar/alerts', '/watches', '/briefing', '/briefing/schedule', '/reports', '/report', '/dashboards'])
    assert.equal(denialOf(viewer, 'GET', p), '', p)
  // Créations : analystes et administrateurs
  for (const [m, p] of [['POST', '/watches'], ['PUT', '/dashboards'], ['PUT', '/tags'], ['POST', '/ai/analysis'], ['POST', '/briefing/summary']]) {
    assert.notEqual(denialOf(viewer, m, p), '', `${m} ${p} viewer`)
    assert.equal(denialOf(analyst, m, p), '', `${m} ${p} analyst`)
  }
  // Questions à l'IA et envoi des rapports : tous
  for (const p of ['/ai/ask', '/ai/agent', '/ai/query', '/radar/explain', '/reports/abc/email']) assert.equal(denialOf(viewer, 'POST', p), '', p)
  // Envois programmés et sources de diffusion : administrateurs
  for (const [m, p] of [['PUT', '/briefing/schedule'], ['POST', '/briefing/send'], ['POST', '/diffusion'], ['PATCH', '/diffusion/x'], ['POST', '/diffusion/test']]) {
    assert.notEqual(denialOf(analyst, m, p), '', `${m} ${p} analyst`)
    assert.equal(denialOf(admin, m, p), '', `${m} ${p} admin`)
  }
})

test('un compte sans rôle connu suit le profil administrateur', () => {
  assert.equal(permsOf({}).profile, 'admin')
  assert.equal(permsOf({ role: 'viewer', profile: 'p_inexistant' }).profile, 'viewer')
})

test('profil limité à « التحليل » : les autres modules sont refusés par le serveur', () => {
  const only = { profile: 'p_test', profileName: 'تحليل فقط', modules: ['stats'], actions: [] }
  assert.equal(denialOf(only, 'GET', '/news/stats'), '')
  assert.equal(denialOf(only, 'GET', '/news'), '')
  assert.equal(denialOf(only, 'GET', '/radar/alerts'), 'module:radar')
  assert.equal(denialOf(only, 'GET', '/watches'), 'module:watch')
  assert.equal(denialOf(only, 'GET', '/reports'), 'module:reports')
  assert.equal(denialOf(only, 'GET', '/report'), 'module:report')
  assert.equal(denialOf(only, 'GET', '/briefing'), 'module:briefing')
  assert.equal(denialOf(only, 'GET', '/media/broadcast/overview'), 'module:media')
  assert.equal(denialOf(only, 'POST', '/ai/ask'), 'module:assistant')
  assert.equal(denialOf(only, 'GET', '/news/export.csv'), 'module:news')
  // Pics : ouverts par « التحليل », mais l'explication par l'IA demande l'action ai_ask
  assert.equal(denialOf(only, 'GET', '/news/spikes'), '')
  assert.equal(denialOf(only, 'POST', '/ai/spike'), 'action:ai_ask')
})

test('casse et barre finale ignorées par Express : le contrôle les ignore aussi (V-12)', () => {
  const gate = permissionGate()
  const run = (method, p) => {
    let status = 200
    const res = { status: (s) => ((status = s), { json: () => {} }) }
    gate({ method, path: p, user: { role: 'viewer' } }, res, () => {})
    return status
  }
  for (const [m, p] of [['POST', '/Watches'], ['POST', '/ai/analysis/'], ['POST', '/Briefing/send'], ['PUT', '/TAGS/'], ['PUT', '/briefing/schedule//']]) assert.equal(run(m, p), 403, `${m} ${p}`)
  assert.equal(run('GET', '/News/'), 200)
})

test('/report et /reports ne se confondent pas', () => {
  const p = { modules: ['reports'], actions: [] }
  assert.equal(denialOf(p, 'GET', '/reports'), '')
  assert.equal(denialOf(p, 'GET', '/report'), 'module:report')
})

test('réglages relus depuis le disque ; profils inconnus ou mal formés ignorés', () => {
  fs.writeFileSync(
    path.join(dir, 'permissions.json'),
    JSON.stringify({
      profiles: [
        { id: 'viewer', name: 'x', modules: ['news'], actions: ['export', 'inconnu'], known: ['news'] },
        { id: 'p_abc1234', name: 'تحليل فقط', modules: ['stats', 'pirate'], actions: [] },
        { id: '../../etc', name: 'mauvais', modules: [] },
      ],
    }),
  )
  initPermissions(dir)
  const ids = listProfiles().map((p) => p.id)
  assert.deepEqual(ids, ['admin', 'analyst', 'viewer', 'p_abc1234'])
  const viewer = listProfiles().find((p) => p.id === 'viewer')
  // Nom des profils de base fixe ; module apparu après l'enregistrement (absent de known) : ouvert
  assert.equal(viewer.name, 'قارئ')
  assert.ok(viewer.modules.includes('news') && viewer.modules.includes('radar'))
  assert.deepEqual(viewer.actions, ['export'])
  assert.deepEqual(listProfiles().find((p) => p.id === 'p_abc1234').modules, ['stats'])
})
