import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { canSend, cleanTicket, initSupport, scrub, setSupportConf, supportConf, supportEmail } from '../server/support.js'

test('le support ne transmet ni mot de passe ni jeton', () => {
  const s = scrub('ça bloque. password: Secret123 et token=abc.def cookie: sid=1', 500)
  assert.ok(!/Secret123|abc\.def|sid=1/.test(s))
  assert.match(s, /ça bloque/)
})

test('demande : message obligatoire, conversation bornée, réponse vers l’utilisateur', () => {
  assert.throws(() => cleanTicket({ message: '  ' }, { email: 'a@x.test' }), /EMPTY/)
  const conversation = Array.from({ length: 40 }, (_, k) => ({ from: k % 2 ? 'bot' : 'user', text: `m${k}` }))
  const t = cleanTicket({ message: 'export <script>vide', conversation, page: '/?view=news' }, { name: 'A', email: 'a@x.test', role: 'viewer' })
  assert.equal(t.conversation.length, 20)
  assert.equal(t.status, 'new')
  const mail = supportEmail(t)
  assert.match(mail.subject, /دعم فني/)
  assert.equal(mail.replyTo, 'a@x.test')
  assert.ok(!mail.html.includes('<script'))
})

test('adresse du support : par défaut celle du client, modifiable seulement en adresse valide', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sup-'))
  initSupport(dir)
  assert.equal(supportConf().email, 'mohamed.rahali@aroundexpressions.com')
  assert.throws(() => setSupportConf({ email: 'pas une adresse' }), /BAD_EMAIL/)
  assert.equal(setSupportConf({ email: 'Support@Exemple.test' }).email, 'support@exemple.test')
})

test('limite : un compte neuf peut envoyer', () => {
  assert.equal(canSend('rate@x.test'), true)
})

test('seul l’envoi du support contourne la liste des domaines', () => {
  const src = fs.readFileSync(new URL('../server/watches.js', import.meta.url), 'utf8')
  assert.match(src, /sendSupportMail = \(address, mail\) => sendMail\(\[address\], mail, \{ support: true \}\)/)
  assert.equal((src.match(/support: true/g) || []).length, 1)
})
