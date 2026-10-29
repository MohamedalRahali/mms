import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initMailPolicy } from '../server/mailPolicy.js'
import { createMailingList, deleteMailingList, initMailingLists, listMailingLists, updateMailingList } from '../server/mailingLists.js'

/** Listes de diffusion : adresses vérifiées, domaines autorisés seulement, noms uniques */

test('listes de diffusion : création, modification, suppression', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-ml-'))
  initMailPolicy(path.join(dir, 'superadmin'))
  initMailingLists(dir)
  const l = createMailingList({ name: 'الإدارة', emails: 'A@npdc.gov.ly, b@media.npdc.gov.ly; a@npdc.gov.ly' }, 'chef@npdc.gov.ly')
  // Minuscules, doublons retirés, sous-domaine accepté
  assert.deepEqual(l.emails, ['a@npdc.gov.ly', 'b@media.npdc.gov.ly'])
  assert.throws(() => createMailingList({ name: 'x', emails: 'x@gmail.com' }), /DOMAIN_BLOCKED/)
  assert.throws(() => createMailingList({ name: 'y', emails: 'pas-une-adresse' }), /BAD_EMAIL/)
  assert.throws(() => createMailingList({ name: 'الإدارة', emails: 'c@npdc.gov.ly' }), /NAME_TAKEN/)
  assert.throws(() => createMailingList({ name: '', emails: 'c@npdc.gov.ly' }), /NO_NAME/)
  const u = updateMailingList(l.id, { name: 'الإدارة العامة', emails: ['c@npdc.gov.ly'] }, 'chef@npdc.gov.ly')
  assert.equal(u.name, 'الإدارة العامة')
  assert.deepEqual(u.emails, ['c@npdc.gov.ly'])
  // Relu depuis le disque
  initMailingLists(dir)
  assert.equal(listMailingLists()[0].name, 'الإدارة العامة')
  deleteMailingList(l.id)
  assert.equal(listMailingLists().length, 0)
  assert.throws(() => deleteMailingList(l.id), /NOT_FOUND/)
})
