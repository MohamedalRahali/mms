import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { brandOf, cleanBrand, initBrand, saveBrand } from '../server/brand.js'
import { buildDoc, reportStats } from '../server/reports.js'
import { buildAlertEmail } from '../server/watches.js'

/** هوية المخرجات : par défaut rien ne change ; nom, couleur et marque blanche appliqués aux livrables */

const posts = [{ id: 'a', title: 'خبر', summary: 'ملخص', date: '2026-10-28T10:00:00Z', origin: 'الوسط', channel: 'site', media: 'article', lang: 'ar', category: 'politique', tone: 'neutral', url: '', people: [], orgs: [], places: [] }]

test('identité des livrables : défauts, validation, application', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-brand-'))
  initBrand(dir)
  assert.deepEqual({ ...brandOf(), updatedAt: null }, { name: '', logo: '', assistant: '', accent: '', whiteLabel: false, updatedAt: null })
  // Par défaut : couleurs et nom d'origine dans les livrables
  const plain = JSON.stringify(buildDoc({ lang: 'ar', title: 'T', org: '', author: 'Me', logo: '', posts, stats: reportStats(posts), ai: null, generatedAt: '2026-10-29T00:00:00Z' }))
  assert.match(plain, /#0d3b66/)
  const watch = { id: 'w', name: 'رصد', rules: [] }
  const found = [{ it: { ...posts[0], flux: 'libye' }, hits: ['x'] }]
  assert.match(buildAlertEmail(watch, found).html, /#06281d[^]*منصة MMS/)
  // Valeurs refusées : couleur invalide, logo qui n'est pas une image
  assert.equal(cleanBrand({ accent: 'red', logo: 'javascript:alert(1)' }).accent, '')
  assert.equal(cleanBrand({ logo: 'data:image/svg+xml;base64,PHN2Zz4=' }).logo, '')
  saveBrand({ name: 'المركز الوطني لدعم القرار', accent: '#7A1F2B', whiteLabel: true })
  assert.equal(brandOf().accent, '#7a1f2b')
  assert.equal(brandOf().whiteLabel, true)
  const branded = JSON.stringify(buildDoc({ lang: 'ar', title: 'T', org: '', author: 'Me', logo: '', posts, stats: reportStats(posts), ai: null, generatedAt: '2026-10-29T00:00:00Z' }))
  assert.match(branded, /#7a1f2b/)
  const mail = buildAlertEmail(watch, found).html
  assert.match(mail, /#7a1f2b/)
  assert.match(mail, /المركز الوطني لدعم القرار/)
  // Relu depuis le disque
  initBrand(dir)
  assert.equal(brandOf().name, 'المركز الوطني لدعم القرار')
  saveBrand({})
})

test('rapport exécutif : tous les jours (7) et période d’un jour acceptés', async () => {
  const { setBriefingConf, startBriefing } = await import('../server/briefing.js')
  startBriefing(fs.mkdtempSync(path.join(os.tmpdir(), 'mms-brief-')))
  const conf = setBriefingConf({ enabled: false, weekday: 7, hour: 7, days: 1, recipients: '' })
  assert.equal(conf.weekday, 7)
  assert.equal(conf.days, 1)
  assert.equal(setBriefingConf({ weekday: 9, days: 3 }).weekday, 7)
  assert.equal(setBriefingConf({ weekday: 2, days: 3 }).days, 7)
})
