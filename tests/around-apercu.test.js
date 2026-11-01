import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

/** Around : le mot français « Aperçu : » n'apparaît plus dans les réponses (consigne et affichage) */

test('consigne d’Around : plus d’étiquette « Aperçu : » à recopier', () => {
  const src = fs.readFileSync(new URL('../server/around.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /« - Aperçu : … »/)
})

test('affichage : « Aperçu : » retiré en tête d’un point de liste (réponses déjà enregistrées)', async () => {
  const { parseMd } = await import('../src/lib/aroundMd.ts')
  const blocks = parseMd('1. **قفزة الدولار**\n   - Aperçu : ارتفع الدولار في السوق الموازية [1]\n2. **احتياطيات الذهب**\n   - **Aperçu** : تراجع الذهب [2]')
  const list = blocks[0]
  assert.equal(list.t, 'list')
  assert.equal(list.items[0].children[0], 'ارتفع الدولار في السوق الموازية [1]')
  assert.equal(list.items[1].children[0], 'تراجع الذهب [2]')
  // Le mot ailleurs dans la phrase n'est pas touché
  assert.equal(parseMd('- نص يذكر Aperçu في وسطه')[0].items[0].text, 'نص يذكر Aperçu في وسطه')
})
