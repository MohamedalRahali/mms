import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initSourceMeta, reachOf, reliabilityIsSet, reliabilityOf, setSourceMeta, sourceMetaOf } from '../server/sourceMeta.js'
import { snapshot } from '../server/reports.js'

/** Fiabilité des sources : valeur déduite, réglage du Super Admin, et présence dans la copie figée des rapports */

test('fiabilité : déduite, puis réglée sans effacer le pays ni la portée', () => {
  initSourceMeta(fs.mkdtempSync(path.join(os.tmpdir(), 'mms-rel-')))
  assert.equal(reliabilityOf({ origin: 'الحكومة', url: 'https://www.gov.ly/news/1', channel: 'site' }), 'high')
  assert.equal(reliabilityOf({ origin: 'وزارة', url: 'https://health.gov.ly/x', channel: 'site' }), 'high')
  // Audit v5 : compte social identifié = niveau « social » (sous les médias, au-dessus des comptes anonymes)
  assert.equal(reliabilityOf({ origin: 'صفحة', url: 'https://facebook.com/p', channel: 'facebook', media: 'social' }), 'social')
  assert.equal(reliabilityOf({ origin: 'r/libya', channel: 'reddit', media: 'forum' }), 'low')
  // Audit v5 : média établi (connu) = élevée ; média en ligne inconnu = moyenne
  assert.equal(reliabilityOf({ origin: 'الوسط', url: 'https://alwasat.ly/news', channel: 'site' }), 'high')
  assert.equal(reliabilityOf({ origin: 'NewsFire.gr', url: 'https://newsfire.gr/a', channel: 'site' }), 'medium')
  setSourceMeta('الوسط', { country: 'LY', reach: 50000 })
  setSourceMeta('الوسط', { reliability: 'high' })
  assert.deepEqual(sourceMetaOf('الوسط'), { country: 'LY', reach: 50000, reliability: 'high' })
  assert.equal(reliabilityOf({ origin: 'الوسط', channel: 'site' }), 'high')
  assert.equal(reliabilityIsSet('الوسط'), true)
  // Pays et portée modifiés : la fiabilité reste ; '' revient à la valeur déduite
  setSourceMeta('الوسط', { country: 'LY', reach: null })
  assert.equal(sourceMetaOf('الوسط').reliability, 'high')
  assert.equal(reachOf({ origin: 'الوسط', channel: 'site' }) > 0, true)
  setSourceMeta('الوسط', { reliability: '' })
  assert.equal(reliabilityIsSet('الوسط'), false)
  assert.equal(snapshot({ id: '1', title: 't', origin: 'r/x', channel: 'reddit', media: 'forum', date: '2026-10-29T08:00:00Z' }).reliability, 'low')
})
