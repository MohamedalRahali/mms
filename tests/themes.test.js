import test from 'node:test'
import assert from 'node:assert/strict'
import { intlRegion } from '../server/themes.js'

/** Sous-thèmes de « دولي » : zone d'après les lieux, puis les mots entiers du texte */

test('sous-thèmes de « دولي »', () => {
  const c = (title, places = []) => intlRegion({ category: 'international', title, places })
  assert.equal(c('انقلاب في مالي'), 'africa')
  // « مالي » dans « المالية » n'est pas le Mali
  assert.equal(c('الأزمة المالية العالمية'), '')
  assert.equal(c('وزير الخارجية يلتقي نظيره في روما'), 'europe')
  assert.equal(c('وفد يزور وتونس'), 'maghreb')
  assert.equal(c('تصريح', ['فرنسا']), 'europe')
  // Organisations internationales en priorité
  assert.equal(c('مجلس الأمن يناقش الوضع في السودان'), 'orgs')
  assert.equal(c('زيارة وفد أوروبي لبحث ملف الهجرة'), 'europe')
  assert.equal(c('الخارجية التونسية تستدعي السفير'), 'maghreb')
  assert.equal(c('البعثة الأممية تدعو إلى الحوار'), 'orgs')
  assert.equal(intlRegion({ category: 'politique', title: 'زيارة إلى تونس' }), '')
})

test('liste des actualités : période personnalisée et tonalités multiples', async () => {
  const { createWatch, itemsForWatch, startWatches } = await import('../server/watches.js')
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  startWatches(fs.mkdtempSync(path.join(os.tmpdir(), 'mms-tone-')))
  const w = createWatch({ name: 'نبرة', filters: { tone: 'negative,neutral' } })
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli' }).format(new Date())
  const items = ['positive', 'neutral', 'negative'].map((tone, i) => ({ id: String(i), title: 't' + i, summary: '', origin: 'o', date: new Date().toISOString(), tone, flux: 'libye' }))
  assert.deepEqual(itemsForWatch(w.id, items).map((it) => it.tone).sort(), ['negative', 'neutral'])
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/)
})
