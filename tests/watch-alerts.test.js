import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cleanAlert, createWatch, setWatchAlert, startWatches } from '../server/watches.js'
import { initAlertFlow, openWatchAlert, updateFlow, watchAlerts } from '../server/alertFlow.js'

/** Alertes par mots-clés des veilles : réglages (canaux, seuil, gravité, suivi) et suivi des alertes envoyées */

test('réglages d’alerte : valeurs bornées et défauts', () => {
  assert.deepEqual(cleanAlert(), { channels: ['email', 'telegram'], threshold: 1, severity: 'info', assignee: '', dueHours: 0 })
  const a = cleanAlert({ channels: ['telegram', 'sms', 'telegram'], threshold: 999, severity: 'critical', assignee: '  فريق الرصد ', dueHours: -4 })
  assert.deepEqual(a, { channels: ['telegram'], threshold: 50, severity: 'critical', assignee: 'فريق الرصد', dueHours: 0 })
  // Aucun canal valide : les deux par défaut, pour ne jamais rendre une alerte muette par erreur
  assert.deepEqual(cleanAlert({ channels: [] }).channels, ['email', 'telegram'])
  assert.equal(cleanAlert({ severity: 'urgent' }).severity, 'info')
})

test('veille : réglages gardés à la création et modifiables ensuite', () => {
  startWatches(fs.mkdtempSync(path.join(os.tmpdir(), 'mms-walert-')))
  const w = createWatch({ name: 'نفط', rules: ['النفط AND ليبيا'], alert: { threshold: 3, severity: 'high', channels: ['email'] } }, 'a@npdc.gov.ly')
  assert.equal(w.alert.threshold, 3)
  assert.equal(w.alert.severity, 'high')
  assert.deepEqual(w.alert.channels, ['email'])
  const up = setWatchAlert(w.id, { assignee: 'محلل', dueHours: 6 })
  // Modification partielle : le reste des réglages est gardé
  assert.equal(up.alert.threshold, 3)
  assert.equal(up.alert.assignee, 'محلل')
  assert.equal(up.alert.dueHours, 6)
  assert.equal(setWatchAlert('nope', {}), null)
})

test('suivi des alertes : ouverture, retard, clôture', () => {
  initAlertFlow(fs.mkdtempSync(path.join(os.tmpdir(), 'mms-aflow-')))
  const t0 = new Date('2026-10-29T06:00:00Z')
  const late = openWatchAlert({ watch: { id: 'w1', name: 'نفط' }, count: 4, titles: ['خبر'], severity: 'high', assignee: 'محلل', dueHours: 2 }, t0)
  const crit = openWatchAlert({ watch: { id: 'w2', name: 'أمن' }, count: 1, severity: 'critical' }, new Date('2026-10-29T07:00:00Z'))
  const info = openWatchAlert({ watch: { id: 'w3', name: 'عام' }, count: 2 }, new Date('2026-10-29T07:30:00Z'))
  const now = Date.parse('2026-10-29T09:00:00Z')
  let { open, closed } = watchAlerts(now)
  // En retard d'abord, puis par gravité
  assert.deepEqual(open.map((r) => r.id), [late, crit, info])
  assert.equal(open[0].overdue, true)
  assert.equal(open[0].status, 'assigned')
  assert.equal(open[1].status, 'new')
  assert.equal(open[1].overdue, false)
  updateFlow(late, { status: 'closed', comment: 'تمت المعالجة' }, 'محلل')
  ;({ open, closed } = watchAlerts(now))
  assert.equal(open.length, 2)
  assert.equal(closed[0].id, late)
  assert.equal(closed[0].overdue, false)
})

test('veilles presque identiques : proposées à la fusion, originaux désactivés et gardés', async () => {
  const { similarWatches, mergeWatches, listWatches } = await import('../server/watches.js')
  startWatches(fs.mkdtempSync(path.join(os.tmpdir(), 'mms-merge-')))
  const a = createWatch({ name: 'نفط 1', rules: ['(ليبيا OR طرابلس) AND (النفط OR الغاز OR المؤسسة الوطنية للنفط)'], recipients: 'a@npdc.gov.ly' })
  const b = createWatch({ name: 'نفط 2', rules: ['(ليبيا OR طرابلس) AND (النفط OR الغاز OR الصادرات)'], recipients: 'b@npdc.gov.ly' })
  const c = createWatch({ name: 'أمن', rules: ['(ليبيا) AND (اشتباكات OR هجوم)'] })
  const groups = similarWatches()
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].ids.sort(), [a.id, b.id].sort())
  const m = mergeWatches([a.id, b.id], 'chef@npdc.gov.ly')
  assert.equal(m.rules.length, 2)
  assert.deepEqual(m.recipients.sort(), ['a@npdc.gov.ly', 'b@npdc.gov.ly'])
  assert.deepEqual(m.mergedFrom.map((x) => x.id), [a.id, b.id])
  const all = listWatches()
  // Rien n'est supprimé : 3 veilles d'origine + la fusion ; les deux fusionnées sont désactivées
  assert.equal(all.length, 4)
  for (const id of [a.id, b.id]) {
    const w = all.find((x) => x.id === id)
    assert.equal(w.enabled, false)
    assert.equal(w.mergedInto, m.id)
  }
  assert.equal(all.find((x) => x.id === c.id).enabled, true)
  assert.equal(similarWatches().length, 0)
  assert.throws(() => mergeWatches([c.id]), /BAD_MERGE/)
})
