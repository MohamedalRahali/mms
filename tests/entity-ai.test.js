import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initEntities, resolveEntities } from '../server/entities.js'
import { candidates, entityAIState, initEntityAI, runEntityAI, setDecision } from '../server/entityAI.js'

/** Correction des acteurs par l'IA : fusion des variantes, rejets, priorité au référentiel et au Super Admin */

test('correction IA des acteurs : variantes fusionnées, faux acteurs écartés, décisions corrigeables', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-entai-'))
  initEntities(dir)
  initEntityAI(dir)
  const now = new Date().toISOString()
  const mk = (people, title) => ({ date: now, title, people, orgs: [], places: [] })
  const items = [
    mk(['فوزي مصباح أبوخزام', 'الوزير'], 'أبوخزام يتفقد'),
    mk(['فوزي مصباح أبوخزام'], 'وزير الداخلية'),
    mk(['فوزي بوخزام', 'الوزير'], 'زيارة'),
    mk(['فوزي بوخزام'], 'تصريح'),
    mk(['الدبيبة'], 'الدبيبة يستقبل'),
    mk(['الدبيبة'], 'الدبيبة يجتمع'),
  ]
  // Les noms déjà connus du référentiel (الدبيبة) ne sont pas envoyés au modèle
  const sent = candidates(items).map((c) => c.name)
  assert.deepEqual(sent.sort(), ['الوزير', 'فوزي بوخزام', 'فوزي مصباح أبوخزام'].sort())
  const fake = async (prompt) => {
    assert.match(prompt, /فوزي بوخزام/)
    return {
      entites: [
        { name: 'فوزي مصباح أبوخزام', canonical: 'فوزي أبوخزام', type: 'person', libyan: true, role: 'وزير', reject: false, reason: 'variante' },
        { name: 'فوزي بوخزام', canonical: 'فوزي أبوخزام', type: 'person', libyan: true, role: 'وزير', reject: false, reason: 'variante' },
        { name: 'الوزير', canonical: '', type: 'other', libyan: false, role: '', reject: true, reason: 'titre générique' },
        { name: 'اسم غير مطلوب', canonical: 'x', type: 'person', libyan: true, role: '', reject: false, reason: '' },
      ],
    }
  }
  const run = await runEntityAI(items, fake, { manual: true })
  assert.equal(run.applied, 3)
  assert.deepEqual(resolveEntities({ people: ['فوزي بوخزام', 'فوزي مصباح أبوخزام', 'الوزير', 'الدبيبة'] }).people, ['فوزي أبوخزام', 'عبد الحميد الدبيبة'])
  // Correction du Super Admin : prioritaire, et un nouveau passage de l'IA ne l'écrase pas
  setDecision('الوزير', { reject: false, canonical: 'الوزير', type: 'person' })
  assert.deepEqual(resolveEntities({ people: ['الوزير'] }).people, ['الوزير'])
  assert.equal(entityAIState().decisions.find((d) => d.raw === 'الوزير').source, 'admin')
  // Plafond quotidien (2 passages par défaut) ; rien de nouveau à envoyer
  assert.equal((await runEntityAI(items, fake)).skipped, 'NOTHING_NEW')
  setDecision('الوزير', { remove: true })
  assert.equal(entityAIState().decisions.some((d) => d.raw === 'الوزير'), false)
})
