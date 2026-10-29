import test from 'node:test'
import assert from 'node:assert/strict'
import { AGENTS, ANALYSES, specFor } from '../server/around.js'

/** Types d'analyse de l'assistant : 16 types, chacun avec sa consigne et une sortie structurée et sourcée */

test('types d’analyse : consignes propres, sections et sources exigées', () => {
  assert.equal(ANALYSES.length, 16)
  for (const id of ANALYSES) {
    assert.ok(AGENTS.includes(id), id)
    const spec = specFor(id)
    assert.equal(spec.name, `agent_${id}`)
    // Consigne propre au type, citations obligatoires, rien d'inventé
    assert.ok(spec.system.length > 600, id)
    assert.match(spec.system, /Sections|Section/, id)
    assert.match(spec.system, /N'invente aucun fait/, id)
    assert.deepEqual(spec.schema.required, ['titre', 'resume', 'sections', 'recommandations', 'sources', 'suivis'])
  }
  // Les consignes sont différentes d'un type à l'autre
  assert.equal(new Set(ANALYSES.map((id) => specFor(id).system)).size, ANALYSES.length)
})

test('enregistrements : chaîne YouTube refusée par YouTube indisponible, flux direct disponible', async () => {
  const { availability } = await import('../server/recordings.js')
  const bot = 'capture : DownloadError: ERROR: [youtube] x: Sign in to confirm you’re not a bot'
  assert.deepEqual(availability({ youtube: 'https://www.youtube.com/@AlHadath/live', erreur: bot }), { available: false, why: 'YOUTUBE_BLOCKED' })
  // Un flux direct (HLS) reste disponible même si sa copie YouTube est refusée
  assert.deepEqual(availability({ flux: 'https://x/live.m3u8', youtube: 'https://y', erreur: bot }), { available: true, why: '' })
  assert.deepEqual(availability({ youtube: 'https://y', erreur: 'The channel is not currently live' }), { available: true, why: '' })
  // YouTube refuse le serveur pour une chaîne : toutes les chaînes lues seulement par YouTube sont indisponibles
  assert.deepEqual(availability({ youtube: 'https://y', erreur: 'The channel is not currently live' }, true), { available: false, why: 'YOUTUBE_BLOCKED' })
  assert.deepEqual(availability({ flux: 'https://x/live.m3u8', youtube: 'https://y' }, true), { available: true, why: '' })
})
