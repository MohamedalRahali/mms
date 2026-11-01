import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

/**
 * « التحليل الذكي » : une analyse plus longue que la relecture des données (10 min) restait introuvable — la clé du cache
 * contient la version des données. La dernière analyse de la période est maintenant rendue, et le suivi épuisé le dit.
 */

test('dernière analyse retrouvée pour la même période malgré une nouvelle version des données', async () => {
  const { rememberAnalysis, latestForPeriod, cached } = await import('../server/ai.js')
  const result = { resume: 'خلاصة', days: 7, flux: '', count: 6148 }
  rememberAnalysis({ key: 'all|7|2026-11-01T14:50|6148', days: 7, flux: '' }, result)
  const later = { key: 'all|7|2026-11-01T15:00|6161', days: 7, flux: '' }
  assert.equal(cached(later.key), null)
  assert.deepEqual(latestForPeriod(later), result)
  assert.equal(latestForPeriod({ key: 'all|30|x|1', days: 30, flux: '' }), null)
})

test('serveur et écran : résultat de la période, échecs par période, délai épuisé signalé', () => {
  const index = fs.readFileSync(new URL('../server/index.js', import.meta.url), 'utf8')
  assert.match(index, /cached\(scope\.key\) \|\| \(aiRunning \? null : latestForPeriod\(scope\)\)/)
  assert.doesNotMatch(index, /aiFailures\.(get|set|delete)\(scope\.key/)
  const screen = fs.readFileSync(new URL('../src/components/Extras.tsx', import.meta.url), 'utf8')
  assert.match(screen, /fail\('FAILED', 'TIMEOUT'\)/)
})
