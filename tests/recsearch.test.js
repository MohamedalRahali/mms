import { test } from 'node:test'
import assert from 'node:assert/strict'
import { smartSearch } from '../server/rasd.js'

/** البحث الذكي : plage horaire (heure de Tripoli) et consultation d'une période sans mot-clé */

const channels = [{ id: 'hadath', nom: 'قناة ليبيا الحدث', recordable: true, slots: ['20:00-20:45'] }]
const st = { budget: {}, enregistrements: {} }
const data = { watches: [], log: [] }
// Créneau du soir à 20:00 heure de Tripoli (18:00 UTC), puis un autre bulletin à 14:00
const items = [
  { id: 'e1', media: 'broadcast', origin: 'قناة ليبيا الحدث', date: '2026-10-29T18:00:00Z', transcription: 'افتتح الوزير محطة الكهرباء الجديدة. ثم تحدث عن الميزانية.' },
  { id: 'm1', media: 'broadcast', origin: 'قناة ليبيا الحدث', date: '2026-10-29T12:00:00Z', transcription: 'نشرة الظهيرة عن الكهرباء.' },
]
const run = (q) => smartSearch(q, { list: [], st, now: Date.parse('2026-10-29T19:15:00Z'), data, broadcastItems: items, channels })

test('plage horaire : seuls les passages entre 20:00 et 20:45 (Tripoli)', () => {
  assert.equal(run({ q: 'الكهرباء' }).total, 2)
  const r = run({ q: 'الكهرباء', hfrom: '20:00', hto: '20:45' })
  assert.equal(r.total, 1)
  assert.equal(r.hits[0].id, 'e1')
  assert.ok(r.hits[0].terms.length)
})

test('consultation sans mot-clé : chaîne + jour + plage → tout le texte de la période, dans l’ordre', () => {
  const r = run({ channel: 'hadath', from: '2026-10-29', to: '2026-10-29', hfrom: '20:00', hto: '20:45', source: 'fixed' })
  assert.ok(r.total >= 1)
  assert.ok(r.hits.every((h) => h.id === 'e1'))
  assert.deepEqual([...r.hits.map((h) => h.at)].sort(), r.hits.map((h) => h.at))
  // Sans chaîne ni jour, et sans mot-clé : rien (pas de liste de tout le corpus)
  assert.equal(run({}).total, 0)
  assert.equal(run({ hfrom: '20:00' }).total, 0)
})
