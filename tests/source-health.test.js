import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { healthOf, sourceHealth } from '../server/sourceHealth.js'

/** Santé des sources : statut selon le dernier passage, le dernier succès, l'erreur et le rythme de la source */

const NOW = Date.parse('2026-10-29T09:00:00Z')
const iso = (h) => new Date(NOW - h * 3_600_000).toISOString()

test('statut de santé d’une source', () => {
  assert.equal(healthOf({ actif: false }, NOW), 'off')
  assert.equal(healthOf({ actif: true }, NOW), 'never')
  assert.equal(healthOf({ actif: true, dernier_passage: iso(0.1), dernier_succes: iso(0.2) }, NOW), 'ok')
  // Erreur au dernier passage, après le dernier succès
  assert.equal(healthOf({ actif: true, dernier_passage: iso(0.1), dernier_succes: iso(2), erreur: 'HTTP 403' }, NOW), 'error')
  // Rythme de 10 min : sans succès depuis 7 h → en retard ; chaîne TV quotidienne : 20 h sans succès reste normal
  assert.equal(healthOf({ actif: true, intervalle_min: 10, dernier_passage: iso(0.1), dernier_succes: iso(7) }, NOW), 'stale')
  assert.equal(healthOf({ actif: true, section: 'diffusion', dernier_passage: iso(0.1), dernier_succes: iso(20) }, NOW), 'ok')
  assert.equal(healthOf({ actif: true, section: 'diffusion', dernier_passage: iso(0.1), dernier_succes: iso(30) }, NOW), 'stale')
})

test('tableau de santé : tri (erreurs d’abord), compteurs, chaînes TV complétées', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-health-'))
  assert.equal(sourceHealth(dir, NOW).available, false)
  fs.writeFileSync(
    path.join(dir, 'libye-sources-etat.json'),
    JSON.stringify({
      maj: iso(0),
      sources: [
        { id: 'alwasat', nom: 'الوسط', section: 'sites', actif: true, dernier_passage: iso(0.1), dernier_succes: iso(0.1), nb_dernier: 3, nb_total: 90 },
        { id: '218-tv', nom: 'قناة 218', section: 'diffusion', actif: true, dernier_passage: iso(13), dernier_succes: iso(36), erreur: 'capture : not currently live' },
        { id: 'radio-tripoli', nom: 'إذاعة طرابلس', section: 'diffusion', actif: false },
      ],
      budgets: { transcription: { jour: 1, plafond_jour: 1, mois: 5, plafond_mois: 30, atteint: true } },
    }),
  )
  fs.writeFileSync(path.join(dir, 'libye-diffusion-etat.json'), JSON.stringify({ chaines: [{ id: '218-tv', creneaux: ['20:00-20:45'], dernier_enregistrement: null }] }))
  const h = sourceHealth(dir, NOW)
  assert.deepEqual(h.rows.map((r) => r.id), ['218-tv', 'alwasat', 'radio-tripoli'])
  assert.deepEqual(h.counts, { ok: 1, error: 1, stale: 0, never: 0, off: 1 })
  assert.deepEqual(h.rows[0].slots, ['20:00-20:45'])
  assert.equal(h.budgets.transcription.atteint, true)
})
