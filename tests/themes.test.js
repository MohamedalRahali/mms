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
