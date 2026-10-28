import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { base32Decode, base32Encode, recoveryCodes, totpAt, useRecovery, verifyTotp, initMfaPolicy, mfaRequired, setMfaPolicy } from '../server/mfa.js'
import { allowedRecipient, initMailPolicy, setMailPolicy, splitRecipients } from '../server/mailPolicy.js'
import { libyaRelevant, lookup, regionOf, resolveEntities } from '../server/entities.js'
import { historyOf, smartAlerts } from '../server/radar.js'
import { createWatch, duplicateOf, watchSignature } from '../server/watches.js'

/** Corrections de l'audit produit (P0) : double authentification, liste blanche, entités, historique, alertes, doublons */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-audit-'))
const NOW = Date.parse('2026-10-27T12:00:00Z')
const H = 3_600_000

test('TOTP : vecteur de la RFC 6238 et tolérance d’un pas', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'))
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  assert.deepEqual(base32Decode(secret), Buffer.from('12345678901234567890'))
  // T = 59 s → pas 1 → 94287082 sur 8 chiffres, donc 287082 sur 6
  assert.equal(totpAt(secret, 1), '287082')
  assert.equal(verifyTotp(secret, '287082', { now: 59_000 }), 1)
  assert.equal(verifyTotp(secret, '287082', { now: 89_000 }), 1, 'pas précédent toléré')
  assert.equal(verifyTotp(secret, '287082', { now: 59_000, lastStep: 1 }), -1, 'un code ne sert qu’une fois')
  assert.equal(verifyTotp(secret, '000000', { now: 59_000 }), -1)
  assert.equal(verifyTotp(secret, 'abc', { now: 59_000 }), -1)
})

test('codes de secours : usage unique, empreintes seulement', () => {
  const { codes, hashes } = recoveryCodes()
  assert.equal(codes.length, 10)
  assert.ok(hashes.every((h) => /^[0-9a-f]{64}$/.test(h) && !codes.includes(h)))
  const left = useRecovery(hashes, codes[3].toLowerCase())
  assert.equal(left.length, 9)
  assert.equal(useRecovery(left, codes[3]), null)
})

test('règle de double authentification : administrateurs par défaut, tous en option', () => {
  initMfaPolicy(dir)
  assert.equal(mfaRequired({ role: 'admin' }), true)
  assert.equal(mfaRequired({}), true, 'compte sans rôle = administrateur')
  assert.equal(mfaRequired({ role: 'viewer' }), false)
  setMfaPolicy({ requireAdmins: true, requireAll: true })
  assert.equal(mfaRequired({ role: 'viewer' }), true)
  setMfaPolicy({ requireAdmins: false, requireAll: false })
  assert.equal(mfaRequired({ role: 'admin' }), false)
})

test('liste blanche des destinataires : npdc.gov.ly par défaut, sous-domaines compris', () => {
  initMailPolicy(dir)
  assert.ok(allowedRecipient('w.farhat@npdc.gov.ly'))
  assert.ok(allowedRecipient('x@mail.npdc.gov.ly'))
  assert.ok(!allowedRecipient('someone@gmail.com'))
  assert.ok(!allowedRecipient('x@npdc.gov.ly.evil.com'))
  assert.deepEqual(splitRecipients(['a@npdc.gov.ly', 'b@aroundexpressions.com']), { ok: ['a@npdc.gov.ly'], blocked: ['b@aroundexpressions.com'] })
  setMailPolicy({ domains: 'npdc.gov.ly, pm.gov.ly' })
  assert.ok(allowedRecipient('c@pm.gov.ly'))
  assert.throws(() => setMailPolicy({ domains: '' }), /NO_DOMAIN/)
  setMailPolicy({ domains: ['npdc.gov.ly'] })
})

test('référentiel : variantes fusionnées, média retiré des acteurs, lieu rangé et région', () => {
  assert.equal(lookup('ترمب').name, 'دونالد ترامب')
  assert.equal(lookup('Dbeibah').name, 'عبد الحميد الدبيبة')
  const r = resolveEntities({ people: ['ترامب', 'ترمب', 'Libyan News Wire', 'بنغازي'], orgs: ['البنك المركزي الليبي'], places: ['Tripoli'] }, new Set())
  assert.deepEqual(r.people, ['دونالد ترامب'])
  assert.deepEqual(r.orgs, ['مصرف ليبيا المركزي'])
  assert.deepEqual(r.places, ['بنغازي', 'طرابلس'])
  // Une source suivie n'est jamais un acteur
  assert.deepEqual(resolveEntities({ people: ['صحيفة ما'] }, new Set(['صحيفه ما'])).people, [])
  assert.equal(regionOf({ places: ['سبها', 'مرزق', 'طرابلس'] }), 'south')
  assert.equal(regionOf({ places: [] }), '')
})

test('pertinence Libye : mot « ليبيا », acteur ou lieu libyen', () => {
  assert.ok(libyaRelevant({ title: 'الدبيبة يستقبل وفداً', summary: '' }))
  assert.ok(libyaRelevant({ title: 'Oil output in Libya rises', summary: '' }))
  assert.ok(!libyaRelevant({ title: 'Election crisis in Haiti', summary: '', people: ['دونالد ترامب'] }))
})

test('historique : date de début de la collecte et comparaisons après 14 jours', () => {
  const items = []
  for (let d = 0; d < 8; d++) for (let k = 0; k < 50; k++) items.push({ date: new Date(NOW - d * 24 * H).toISOString() })
  items.push({ date: new Date(NOW - 40 * 24 * H).toISOString() }) // fiche isolée ancienne : ignorée
  const h = historyOf(items, NOW)
  assert.equal(h.since, '2026-10-20')
  assert.equal(h.enough, false)
  assert.ok(h.days >= 8 && h.days <= 9)
})

test('alertes : un sujet étranger n’alerte pas, une histoire libyenne reprise par 10 sources est critique', () => {
  const items = []
  for (let k = 0; k < 12; k++) items.push({ id: `h${k}`, title: 'أزمة سياسية في هايتي بعد الانتخابات', summary: '', origin: `s${k}`, channel: 'site', date: new Date(NOW - (k + 1) * H).toISOString() })
  for (let k = 0; k < 11; k++) items.push({ id: `l${k}`, title: 'إغلاق حقل الشرارة النفطي في ليبيا', summary: '', origin: `t${k}`, channel: 'site', date: new Date(NOW - (k + 1) * H).toISOString() })
  const alerts = smartAlerts(items, { now: NOW })
  assert.ok(alerts.every((a) => !a.label.includes('هايتي')), 'sujet hors Libye écarté')
  const story = alerts.find((a) => a.kind === 'story')
  assert.equal(story.level, 3)
  assert.ok([1, 2, 3].includes(story.level))
  // Historique court : aucune alerte fondée sur une comparaison
  assert.ok(alerts.every((a) => a.kind === 'story'))
  // Moins de 4 sources : rien
  assert.equal(smartAlerts(items.filter((it) => it.id.startsWith('l')).slice(0, 3), { now: NOW }).length, 0)
})

test('veilles : doublon d’une veille active détecté, propriétaire gardé', async () => {
  const { startWatches } = await import('../server/watches.js')
  startWatches(fs.mkdtempSync(path.join(os.tmpdir(), 'mms-watch-')))
  const w = createWatch({ name: 'ليبيا', rules: ['(ليبيا OR Libya) AND (النفط)'] }, 'a@npdc.gov.ly')
  assert.equal(w.createdBy, 'a@npdc.gov.ly')
  assert.equal(watchSignature({ rules: ['(Libya OR ليبيا) AND (النفط)'] }), watchSignature({ rules: ['(ليبيا OR Libya) AND (النفط)'] }))
  assert.equal(duplicateOf({ rules: ['(Libya OR ليبيا) AND النفط'] }).id, w.id)
  assert.throws(() => createWatch({ rules: ['(Libya OR ليبيا) AND النفط'] }, 'b@npdc.gov.ly'), /DUPLICATE/)
  assert.ok(createWatch({ rules: ['(Libya OR ليبيا) AND النفط'], force: true }, 'b@npdc.gov.ly').id)
  assert.throws(() => createWatch({ rules: ['تونس'], recipients: 'x@gmail.com' }), /DOMAIN_BLOCKED/)
})

test('répartition par région : ouest, est, sud et municipalités', async () => {
  const { regionStats } = await import('../server/entities.js')
  const r = regionStats([{ places: ['طرابلس', 'مصراتة'] }, { places: ['بنغازي'] }, { places: ['سبها'] }, { places: ['Paris'] }, { places: ['Tripoli'] }])
  assert.deepEqual(r.regions, { west: 2, east: 1, south: 1 })
  assert.equal(r.located, 4)
  assert.equal(r.places[0].name, 'طرابلس')
  assert.equal(r.places[0].count, 2)
})

test('لوحات التثبيت : création, épinglage sans doublon, retrait, suppression', async () => {
  const { initPinboards, createPinboard, pinItem, unpinItem, pinboard, deletePinboard, listPinboards } = await import('../server/pinboards.js')
  initPinboards(fs.mkdtempSync(path.join(os.tmpdir(), 'mms-pin-')))
  const b = createPinboard(' ملف النفط ', 'a@npdc.gov.ly')
  assert.equal(b.name, 'ملف النفط')
  const it = { id: 'x1', title: 't', url: 'https://alwasat.ly/1', origin: 'الوسط', date: '2026-10-27T10:00:00Z' }
  pinItem(b.id, it, 'a@npdc.gov.ly')
  assert.equal(pinItem(b.id, it, 'b@npdc.gov.ly').count, 1, 'pas de doublon')
  assert.equal(pinboard(b.id).items[0].addedBy, 'a@npdc.gov.ly')
  assert.equal(unpinItem(b.id, 'https://alwasat.ly/1').count, 0)
  assert.throws(() => createPinboard(''), /NO_NAME/)
  assert.throws(() => pinItem('inconnu', it), /NOT_FOUND/)
  assert.ok(deletePinboard(b.id))
  assert.equal(listPinboards().length, 0)
})

test('سجل الإرسال : lignes horodatées, sans adresses, plus récentes d’abord', async () => {
  const { initDispatchLog, logDispatch, dispatchHistory } = await import('../server/dispatchLog.js')
  initDispatchLog(fs.mkdtempSync(path.join(os.tmpdir(), 'mms-log-')))
  logDispatch({ kind: 'watch', name: 'ليبيا', count: 3, channels: ['email', 'email', 'telegram'], recipients: 2 })
  logDispatch({ kind: 'radar', name: 'x', count: 1, status: 'blocked', error: 'DOMAIN_BLOCKED' })
  const rows = dispatchHistory()
  assert.equal(rows[0].kind, 'radar')
  assert.deepEqual(rows[1].channels, ['email', 'telegram'])
  assert.ok(!JSON.stringify(rows).includes('@'))
})

test('courbe : pas de temps, découpage, buckets vides, comparaison de recherches', async () => {
  const { timeline, bucketOf } = await import('../server/timeline.js')
  const NOW2 = Date.parse('2026-10-28T12:00:00Z')
  const H2 = 3_600_000
  const mk = (h, extra = {}) => ({ date: new Date(NOW2 - h * H2).toISOString(), channel: 'site', title: 'x', summary: '', ...extra })
  const items = [mk(1), mk(2, { channel: 'tv' }), mk(30), mk(30, { channel: 'tv' }), mk(30, { channel: 'tv' })]
  const t = timeline(items, { days: 3, step: 'day', split: 'channel', now: NOW2 })
  assert.equal(t.buckets.length, 4) // 25, 26, 27 et 28 octobre
  const tv = t.series.find((s) => s.key === 'tv')
  assert.deepEqual(tv.values, [0, 0, 2, 1])
  assert.equal(bucketOf(Date.parse('2026-10-28T12:00:00Z'), 'week'), '2026-10-26')
  assert.equal(bucketOf(Date.parse('2026-10-28T12:00:00Z'), 'quarter'), '2026-T4')
  const h = timeline(items, { days: 30, step: 'hour', now: NOW2 })
  assert.equal(h.days, 7, 'pas horaire limité à 7 jours')
  const c = timeline([], { days: 3, groups: [{ name: 'A', items: items.slice(0, 2) }, { name: 'B', items: [] }], now: NOW2 })
  assert.deepEqual(c.series.map((s) => [s.key, s.total]), [['A', 2], ['B', 0]])
})

test('lien public : un widget désigné par son id ne prend ses paramètres que du tableau', async () => {
  const { publicShareQuery } = await import('../server/shares.js')
  const widgets = [{ id: 'w1', type: 'timeline', days: 30, flux: '', q: 'النفط', watch: '', category: '', step: 'week', split: 'channel', compare: [] }, { id: 'w2', type: 'feed', days: 7, flux: '', q: '', watch: 'abc', category: '', channel: 'tv' }]
  assert.deepEqual(publicShareQuery(widgets, 'news/timeline', { w: 'w1', q: 'سرّي', days: '365' }), { days: '30', q: 'النفط', step: 'week', split: 'channel' })
  assert.deepEqual(publicShareQuery(widgets, 'news', { w: 'w2', size: '100' }), { days: '7', watch: 'abc', size: '20', channel: 'tv' })
  assert.equal(publicShareQuery(widgets, 'news/stats', { w: 'w1' }), null, 'route incompatible avec le type')
  assert.equal(publicShareQuery(widgets, 'news', { w: 'inconnu' }), null)
})
