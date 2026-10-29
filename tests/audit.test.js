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
  // Depuis le 29/10/2026 : obligatoire pour tous par défaut
  assert.equal(mfaRequired({ role: 'viewer' }), true)
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
  // Fiche du matin du 25 : avant la fenêtre glissante de 72 h, mais dans le premier jour affiché, donc comptée
  const early = timeline([mk(80)], { days: 3, step: 'day', now: NOW2 })
  assert.deepEqual(early.series[0].values, [1, 0, 0, 0])
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

test('mur du direct : extrait choisi (début / fin) et chiffres par chaîne', async () => {
  const { excerptOf, liveStats, clipOf } = await import('../server/broadcast.js')
  const NOW3 = Date.parse('2026-10-28T20:30:00Z')
  const words = (n, w) => Array.from({ length: n }, () => w).join(' ')
  const transcription = `${words(50, 'أ')}. ${words(50, 'ب')}. ${words(50, 'ج')}.`
  const it = { id: 'b1', media: 'broadcast', origin: 'قناة الوسط', channel: 'tv', subType: 'tv', title: 't', summary: '', date: new Date(NOW3 - 600_000).toISOString(), transcription }
  const clip = clipOf(it)
  assert.equal(clip.passages.length, 3)
  const ex = excerptOf(clip, clip.passages[1].offset, clip.passages[2].offset)
  assert.ok(ex.text.startsWith('ب') && ex.text.includes('ج') && !ex.text.includes('أ'))
  assert.ok(ex.seconds > 0 && ex.to > ex.from)
  assert.equal(excerptOf(clip, 9999, 10000), null, 'aucun passage dans la plage')
  const other = { ...it, id: 'b2', title: 't2' }
  const old = { ...it, id: 'b3', origin: 'قناة 218', date: new Date(NOW3 - 3 * 86_400_000).toISOString() }
  const stats = liveStats([it, other, old], NOW3)
  assert.equal(stats.length, 1, 'seulement les 24 dernières heures')
  assert.deepEqual([stats[0].name, stats[0].news, stats[0].segments], ['قناة الوسط', 2, 1])
  assert.ok(stats[0].minutes > 0 && stats[0].reach > 0)
})

test('enregistrements à la demande : période passée, durée, chevauchement fusionné, simultanés, budget, SRT', async () => {
  const { addRecording, stopRecording, toSrt, LIMITS } = await import('../server/recordings.js')
  const NOW = Date.parse('2026-10-28T10:00:00Z')
  const M = 60_000
  const iso = (t) => new Date(t).toISOString()
  const channels = [
    { id: 'wasat', nom: 'الوسط', canal: 'tv', slots: ['21:00-22:00'], recordable: true, inVeille: true, stream: { flux: '', youtube: '' } },
    { id: 'tanasuh', nom: 'التناصح', canal: 'tv', slots: [], recordable: true, inVeille: false, stream: { flux: 'https://x.test/a.m3u8', youtube: '' } },
    { id: 'nostream', nom: 'بدون', canal: 'radio', slots: [], recordable: false, inVeille: true, stream: { flux: '', youtube: '' } },
    ...['a', 'b', 'c'].map((id) => ({ id, nom: id, canal: 'tv', slots: [], recordable: true, inVeille: true, stream: { flux: '', youtube: '' } })),
  ]
  const ctx = (list = [], st = { budget: { jour: 0, plafond_jour: 1.1, mois: 0, plafond_mois: 34 }, enregistrements: {} }, part = null) => ({ now: NOW, channels, list, st, part })
  const err = (fn) => {
    try {
      fn()
    } catch (e) {
      return [e.code, e.extra]
    }
    return null
  }
  // Passé : refusé, avec le créneau du soir qui le couvre
  const past = err(() => addRecording({ chaine: 'wasat', debut: '2026-10-27T19:10:00Z', fin: '2026-10-27T19:40:00Z' }, 'a@x', ctx()))
  assert.equal(past[0], 'PAST')
  assert.deepEqual(past[1].slots, ['21:00-22:00'])
  assert.equal(err(() => addRecording({ chaine: 'nostream', debut: iso(NOW), fin: iso(NOW + 10 * M) }, '', ctx()))[0], 'NOT_RECORDABLE')
  assert.equal(err(() => addRecording({ chaine: 'wasat', debut: iso(NOW), fin: iso(NOW + M) }, '', ctx()))[0], 'TOO_SHORT')
  assert.equal(err(() => addRecording({ chaine: 'wasat', debut: iso(NOW), fin: iso(NOW + (LIMITS.maxMinutes + 1) * M) }, '', ctx()))[0], 'TOO_LONG')
  // Valide ; flux transmis seulement pour une chaîne hors veille
  const one = addRecording({ chaine: 'tanasuh', debut: iso(NOW + 10 * M), fin: iso(NOW + 40 * M) }, 'a@x', ctx())
  assert.equal(one.item.flux, 'https://x.test/a.m3u8')
  assert.equal(addRecording({ chaine: 'wasat', debut: iso(NOW), fin: iso(NOW + 10 * M) }, '', ctx()).item.flux, undefined, 'pas d’adresse vide')
  assert.equal(one.estimate, 0.09)
  // Chevauchement sur la même chaîne : une seule demande, sur l'union
  const two = addRecording({ chaine: 'tanasuh', debut: iso(NOW + 30 * M), fin: iso(NOW + 60 * M) }, 'b@x', ctx(one.list))
  assert.equal(two.merged, true)
  assert.equal(two.list.length, 1)
  assert.deepEqual([two.item.debut, two.item.fin, two.item.id], [iso(NOW + 10 * M), iso(NOW + 60 * M), one.item.id])
  // Simultanés : au plus maxParallel
  let list = two.list
  for (const id of ['a', 'b']) list = addRecording({ chaine: id, debut: iso(NOW + 20 * M), fin: iso(NOW + 50 * M) }, '', ctx(list)).list
  assert.equal(err(() => addRecording({ chaine: 'c', debut: iso(NOW + 25 * M), fin: iso(NOW + 35 * M) }, '', ctx(list)))[0], 'PARALLEL')
  // Budget du jour : part des demandes presque consommée aujourd'hui ; demain, la part entière est disponible
  const poor = { budget: { jour: 1.05, plafond_jour: 1.1, mois: 3, plafond_mois: 34 }, enregistrements: {} }
  const b = err(() => addRecording({ chaine: 'c', debut: iso(NOW + 100 * M), fin: iso(NOW + 160 * M) }, '', ctx([], poor)))
  assert.equal(b[0], 'BUDGET')
  assert.equal(b[1].estimate, 0.18)
  assert.ok(addRecording({ chaine: 'c', debut: iso(NOW + 24 * 60 * M), fin: iso(NOW + 25 * 60 * M) }, '', ctx([], poor)).item)
  // Part réglée dans MMS : prioritaire sur celle de la veille
  assert.equal(err(() => addRecording({ chaine: 'c', debut: iso(NOW + 10 * M), fin: iso(NOW + 30 * M) }, '', ctx([], undefined, 0.01)))[0], 'BUDGET')
  // Créneaux fixes : 5 chaînes de la veille enregistrent à 21:00 (Tripoli, 4 + الوسط), une seule demande de plus passe
  const busy = [1, 2, 3, 4].map((k) => ({ id: `f${k}`, nom: `f${k}`, canal: 'tv', slots: ['21:00-21:45'], recordable: true, inVeille: true, stream: { flux: '', youtube: '' } }))
  const at21 = Date.parse('2026-10-28T19:00:00Z')
  const c2 = { now: NOW, channels: [...channels, ...busy], list: [], st: null, part: 5 }
  const l1 = addRecording({ chaine: 'a', debut: iso(at21), fin: iso(at21 + 30 * M) }, '', c2).list
  assert.equal(err(() => addRecording({ chaine: 'b', debut: iso(at21 + 10 * M), fin: iso(at21 + 20 * M) }, '', { ...c2, list: l1 }))[0], 'CAPTURES')
  // Arrêt : avant le début = annulation ; pendant = fin avancée
  assert.equal(stopRecording(one.item.id, { now: NOW, list: [{ ...one.item }], st: null }).item.annule, true)
  const during = stopRecording(one.item.id, { now: NOW + 20 * M, list: [{ ...one.item }], st: { enregistrements: { [one.item.id]: { etat: 'en_cours' } } } }).item
  // Sans réponse de la veille 3 minutes après le début : échec expliqué, plus d'arrêt possible
  assert.equal(err(() => stopRecording(one.item.id, { now: NOW + 20 * M, list: [{ ...one.item }], st: null }))[0], 'FINISHED')
  assert.equal(during.fin, iso(NOW + 20 * M))
  // SRT : blocs numérotés et heures relatives au début
  const srt = toSrt({ debut: iso(NOW), fin: iso(NOW + 10 * M), segments: [{ debut: iso(NOW), texte: 'جملة أولى. جملة ثانية.' }] })
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:\d\d,\d{3}\nجملة أولى/)
})

test('الرصد المبرمج : veille vérifiée, plages, coût, création des enregistrements, recherche arabe tolérante', async () => {
  const { cleanWatch, costCheck, upcomingSlots, materialize, matchTerms, termKey, smartSearch, hitsOf, searchTerms } = await import('../server/rasd.js')
  const NOW = Date.parse('2026-10-29T10:00:00Z') // jeudi, 12:00 à Tripoli
  const channels = [
    { id: 'wasat', nom: 'الوسط', canal: 'tv', slots: ['21:00-21:45'], recordable: true, inVeille: true, stream: { flux: '', youtube: '' } },
    { id: 'tanasuh', nom: 'التناصح', canal: 'tv', slots: [], recordable: true, inVeille: false, stream: { flux: 'https://x.test/a.m3u8', youtube: '' } },
    { id: 'off', nom: 'بدون', canal: 'radio', slots: [], recordable: false, inVeille: true, stream: { flux: '', youtube: '' } },
  ]
  const err = (fn) => {
    try {
      fn()
    } catch (e) {
      return e.code
    }
    return null
  }
  const base = { name: 'النفط', keywords: 'النفط, المؤسسة الوطنية للنفط', synonyms: ['oil', 'الحقول النفطية'], channels: ['tanasuh'], days: [0, 1, 2, 3, 4, 5, 6], windows: ['14:00-14:30'] }
  const w = cleanWatch(base, channels, { now: NOW })
  assert.deepEqual([w.keywords.length, w.synonyms.length, w.from], [2, 2, '2026-10-29'])
  assert.equal(err(() => cleanWatch({ ...base, keywords: '' }, channels, { now: NOW })), 'NO_KEYWORDS')
  assert.equal(err(() => cleanWatch({ ...base, channels: ['off'] }, channels, { now: NOW })), 'NOT_RECORDABLE')
  assert.equal(err(() => cleanWatch({ ...base, windows: ['14:00-14:30', '14:15-15:00'] }, channels, { now: NOW })), 'OVERLAP')
  assert.equal(err(() => cleanWatch({ ...base, windows: ['10:00-15:00'] }, channels, { now: NOW })), 'TOO_LONG')
  assert.equal(err(() => cleanWatch({ ...base, to: '2026-10-01' }, channels, { now: NOW })), 'PAST')
  // Coût : 30 min par jour = 0,09 $ ; avec une autre veille de 6 h par jour, la part de 1,10 $ est dépassée
  assert.equal(costCheck(w, []).costPerDay, 0.09)
  const big = { ...w, id: 'big', windows: ['06:00-10:00', '15:00-17:00'] }
  assert.equal(costCheck(w, [big], 1.1).level, 'over')
  assert.equal(costCheck(w, [{ ...big, paused: true }], 1.1).level, 'ok')
  // Plages des prochaines 26 h : aujourd'hui 14:00 et demain 14:00 (heure de Tripoli)
  const slots = upcomingSlots(w, NOW)
  assert.deepEqual(slots.map((s) => new Date(s.start).toISOString()), ['2026-10-29T12:00:00.000Z', '2026-10-30T12:00:00.000Z'])
  // Création : deux enregistrements marqués de la veille ; une seconde passe n'en recrée pas
  const data = { watches: [w], log: [] }
  const st = { budget: { jour: 0, plafond_jour: 1.1, mois: 0, plafond_mois: 34 }, enregistrements: {} }
  const one = materialize({ now: NOW, channels, data, list: [], st, part: 1.1 })
  assert.equal(one.created, 2)
  assert.ok(one.list.every((r) => r.rasd.includes(w.id)))
  assert.equal(materialize({ now: NOW, channels, data, list: one.list, st, part: 1.1 }).created, 0)
  // Budget épuisé : plage notée dans le journal avec sa raison, sans enregistrement
  const poor = materialize({ now: NOW, channels, data: { watches: [w], log: [] }, list: [], st: { ...st, budget: { ...st.budget, jour: 1.09 } }, part: 1.1 })
  assert.equal(poor.data.log[0].error, 'BUDGET')
  // Comparaison arabe tolérante : préfixes, ta marbuta, alif, expressions de plusieurs mots
  const terms = [{ w: 'النفط', key: termKey('النفط') }, { w: 'المؤسسة الوطنية للنفط', key: termKey('المؤسسة الوطنية للنفط') }]
  assert.deepEqual(matchTerms('أعلنت المؤسسه الوطنيه للنفط استئناف الإنتاج', terms).map((t) => t.w), ['النفط', 'المؤسسة الوطنية للنفط'])
  assert.deepEqual(matchTerms('وبالنفط تتحسن الإيرادات', terms).map((t) => t.w), ['النفط'])
  assert.equal(matchTerms('الكهرباء في طرابلس', terms).length, 0)
  // Recherche : synonymes de la veille ajoutés, passages des créneaux fixes inclus sans veille choisie
  assert.deepEqual(searchTerms('الحقل', w).expanded.map((t) => t.w), ['النفط', 'المؤسسة الوطنية للنفط', 'oil', 'الحقول النفطية'])
  const items = [{ id: 'b1', media: 'broadcast', origin: 'الوسط', date: '2026-10-28T19:05:00Z', transcription: 'تحدث الوزير عن النفط والغاز. ثم انتقلنا إلى الرياضة.' }]
  const res = smartSearch({ q: 'نفط' }, { list: [], st, now: NOW, data, broadcastItems: items, channels })
  assert.equal(res.total, 1)
  assert.equal(res.hits[0].kind, 'fixed')
  assert.equal(smartSearch({ q: 'نفط', channel: 'tanasuh' }, { list: [], st, now: NOW, data, broadcastItems: items, channels }).total, 0)
  // Plus aucune plage à venir : aujourd'hui 07:02 est passé (12:00 à Tripoli) et la période s'arrête aujourd'hui
  const { nextSlot } = await import('../server/rasd.js')
  assert.equal(nextSlot({ ...w, windows: ['07:02-07:04'], to: '2026-10-29' }, NOW), null)
  assert.equal(nextSlot({ ...w, windows: ['07:02-07:10'], to: '' }, NOW).start, '2026-10-30T05:02:00.000Z')
  // Passages repérés dans une transcription
  const doc = { debut: '2026-10-29T12:00:00Z', fin: '2026-10-29T12:30:00Z', segments: [{ debut: '2026-10-29T12:00:00Z', texte: 'نشرة الأخبار. أعلنت المؤسسة الوطنية للنفط عن زيادة الإنتاج. وفي الرياضة فاز الأهلي.' }] }
  assert.equal(hitsOf(doc, w).length, 1)
})

test('tableaux d’épingles : réglages, épinglage automatique, épinglage en masse, export CSV, filtre', async () => {
  const pb = await import('../server/pinboards.js')
  pb.initPinboards(fs.mkdtempSync(path.join(os.tmpdir(), 'mms-pin2-')))
  const NOW = Date.parse('2026-10-29T10:00:00Z')
  const b = pb.createPinboard('النفط', 'a@x', { description: 'متابعة', color: '#2fcb81', group: 'اقتصاد', rule: { query: 'النفط OR oil', until: '2026-11-30' } })
  assert.deepEqual([b.color, b.group, b.rule.query], ['#2fcb81', 'اقتصاد', 'النفط OR oil'])
  assert.equal(pb.createPinboard('بدون قاعدة', 'a@x', { rule: { query: '  ' }, color: 'red' }).rule, null, 'requête vide = pas d’épinglage automatique')
  const it = (id, title, date) => ({ id, title, summary: '', origin: 'وال', channel: 'site', date, url: `https://x.test/${id}`, tone: '' })
  const since = Date.parse(pb.pinboard(b.id).rule.since)
  const items = [it('a', 'ارتفاع إنتاج النفط', new Date(since + 1000).toISOString()), it('b', 'مباراة كرة', new Date(since + 2000).toISOString()), it('c', 'oil price', new Date(since - 86_400_000).toISOString())]
  assert.equal(pb.autoPin(items, NOW), 1, 'seulement la fiche publiée après la règle et qui correspond')
  assert.equal(pb.autoPin(items, NOW), 0, 'pas de doublon')
  // Date limite passée : plus d'épinglage
  pb.updatePinboard(b.id, { rule: { query: 'مباراة', until: '2026-10-01' } })
  assert.equal(pb.autoPin([it('d', 'مباراة', new Date(NOW).toISOString())], NOW), 0)
  const bulk = pb.pinMany(b.id, [items[1], items[2], items[0]], 'a@x')
  assert.equal(bulk.added, 2)
  assert.equal(pb.pinnedKeys(b.id).size, 3)
  const { csv } = pb.pinboardCsv(b.id)
  assert.match(csv, /^﻿title,source/)
  pb.pinMany(b.id, [it('e', '=HYPERLINK("x")', new Date(NOW).toISOString())], 'a@x')
  assert.match(pb.pinboardCsv(b.id).csv, /"'=HYPERLINK/, 'cellule neutralisée contre les formules')
})

test('variations en % justes avec un historique partiel (audit v3) : jours couverts égaux, « جديد » si base trop petite', async () => {
  const { coverageOf, fairChange } = await import('../server/insights.js')
  const DAY = 86_400_000
  const NOW = Date.parse('2026-10-29T10:00:00Z')
  // n jours de collecte à plein régime (100 fiches par jour), plus des articles anciens isolés (dates de 2012, 2021)
  const days = (n, per = 100) => Array.from({ length: n * per }, (_, k) => ({ date: new Date(NOW - Math.floor(k / per) * DAY - 3_600_000).toISOString() }))
  const stray = [{ date: '2012-11-23T10:00:00Z' }, { date: '2021-07-26T10:00:00Z' }]
  // Collecte à plein régime depuis 12 jours : période précédente couverte 5 jours sur 7 ; les articles anciens ne comptent pas
  const cov = coverageOf([...days(12), ...stray], 7, NOW)
  assert.equal(cov.current, 7)
  assert.ok(cov.previous >= 4.5 && cov.previous <= 5.5, String(cov.previous))
  assert.equal(cov.partial, true)
  // 700 cette semaine, 500 sur les 5 jours couverts avant : 100/jour contre 100/jour = 0 %, pas +40 %
  assert.equal(fairChange(700, 500, { ...cov, previous: 5 }), 0)
  assert.equal(fairChange(1050, 500, { ...cov, previous: 5 }), 50)
  // Période précédente couverte à moins de moitié (montée en charge de la collecte) : moyenne par jour couvert ; mode « hide » : « جديد »
  const young = coverageOf([...days(9), ...stray], 7, NOW)
  assert.ok(young.previous >= 1.5 && young.previous <= 2.5, String(young.previous))
  assert.equal(fairChange(700, 200, { ...young, previous: 2 }), 0)
  process.env.MMS_PCT_PARTIAL = 'hide'
  assert.equal(fairChange(700, 200, { ...young, previous: 2 }), 'new')
  delete process.env.MMS_PCT_PARTIAL
  // Base trop petite ou absente : « جديد » au lieu de +23 122 %
  assert.equal(fairChange(7431, 1, { ...cov, previous: 5 }), 'new')
  assert.equal(fairChange(10, 0, { days: 7, current: 7, previous: 0, partial: true }), 'new')
  assert.equal(fairChange(0, 0, { ...cov, previous: 5 }), null)
  // Historique complet : calcul habituel
  const full = coverageOf(days(30), 7, NOW)
  assert.equal(full.partial, false)
  assert.equal(fairChange(120, 100, full), 20)
})

test('début de la collecte : jours de montée en charge et articles anciens ignorés', async () => {
  const { collectionStartDay } = await import('../server/history.js')
  const at = (d, n) => Array.from({ length: n }, () => ({ date: `${d}T10:00:00Z` }))
  // Données réelles du 29/10 : 18 à 43 fiches par jour avant le 20/10, puis 442, puis plus de 1 000 par jour
  const items = [...at('2012-11-23', 1), ...at('2026-10-15', 43), ...at('2026-10-20', 138), ...at('2026-10-21', 442), ...at('2026-10-22', 1998), ...at('2026-10-23', 1098), ...at('2026-10-24', 969), ...at('2026-10-25', 1348), ...at('2026-10-26', 1611), ...at('2026-10-27', 1117), ...at('2026-10-28', 1071)]
  assert.equal(collectionStartDay(items), '2026-10-21')
})

test('aucun composant ne calcule sa propre variation en % (règle commune lib/fair.ts)', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const files = []
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name)
      if (f.isDirectory()) walk(p)
      else if (/\.(tsx?|js)$/.test(f.name)) files.push(p)
    }
  }
  walk(path.join(import.meta.dirname, '..', 'src'))
  const own = /\(\(\s*(cur|current|now|value)\w*\s*-\s*(prev|previous|base|ref|before)\w*\s*\)\s*\/\s*(prev|previous|base|ref|before)\w*\s*\)\s*\*\s*100/
  const offenders = files.filter((f) => !f.endsWith(path.join('lib', 'fair.ts')) && own.test(fs.readFileSync(f, 'utf8')))
  assert.deepEqual(offenders, [])
})

test('audit v3 : bots et comptes personnels écartés, noms Reddit unifiés, prénoms seuls et alias', async () => {
  const sp = await import('../server/sourcePolicy.js')
  sp.initSourcePolicy(fs.mkdtempSync(path.join(os.tmpdir(), 'mms-sp-')))
  assert.equal(sp.canonicalOrigin('r/u/Ahmed_Ly'), 'u/Ahmed_Ly')
  assert.equal(sp.canonicalOrigin('r/u_Ahmed_Ly'), 'u/Ahmed_Ly')
  const r = (origin, extra = {}) => ({ origin, channel: 'reddit', media: 'forum', ...extra })
  for (const o of ['r/AutoNewspaper', 'r/ALJAZEERAauto', 'r/MapPorn', 'r/MilitaryPorn', 'r/WhitePeopleTwitter', 'r/u_someone']) assert.equal(sp.excludedBySource(r(o)), true, o)
  assert.equal(sp.excludedBySource(r('r/libya')), false)
  assert.equal(sp.excludedBySource({ origin: 'وال', channel: 'site', media: 'article' }), false)
  // YouTube : chaînes de récitation, de chants ou de divertissement écartées, chaînes d'actualité gardées
  const yt = (origin, title = '') => ({ origin, title, channel: 'youtube', media: 'broadcast' })
  for (const [o, t] of [['قناة القرآن الكريم', ''], ['Quran Recitation HD', ''], ['تلاوات خاشعة', ''], ['Kids Cartoon', ''], ['قناة الأغاني', 'أغنية ليبية']]) assert.equal(sp.excludedBySource(yt(o, t)), true, o)
  for (const [o, t] of [['قناة ليبيا الأحرار', 'نشرة الأخبار'], ['الوسط', 'حوار حول الميزانية'], ['ليبيا الأحرار', 'مسابقة القرآن الكريم في طرابلس']]) assert.equal(sp.excludedBySource(yt(o, t)), false, o)
  // Liste blanche des forums : seuls les forums listés restent
  sp.setSourcePolicy({ blocked: ['r/SomeSpam'], forumAllow: ['r/libya'] })
  assert.equal(sp.excludedBySource(r('r/worldnews')), true)
  assert.equal(sp.excludedBySource(r('r/libya')), false)
  assert.equal(sp.excludedBySource({ origin: 'r/SomeSpam', channel: 'reddit', media: 'social' }), true)
  const { resolveEntities } = await import('../server/entities.js')
  const out = resolveEntities({ people: ['محمد', 'ترامب', 'محمد المنفي'], orgs: ['وزارة المواصلات'] })
  assert.ok(!out.people.includes('محمد'), 'prénom seul écarté')
  assert.ok(out.people.includes('دونالد ترامب'))
  assert.ok(out.orgs.includes('وزارة المواصلات الليبية'))
})

test('double authentification : obligatoire pour tous par défaut, ancienne règle migrée', async () => {
  const { initMfaPolicy, mfaPolicy, mfaRequired, setMfaPolicy } = await import('../server/mfa.js')
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-mfa2-'))
  initMfaPolicy(d)
  assert.equal(mfaRequired({ role: 'viewer' }), true)
  fs.writeFileSync(path.join(d, 'mfa.json'), JSON.stringify({ requireAdmins: true, requireAll: false }))
  initMfaPolicy(d)
  assert.equal(mfaPolicy().requireAll, true, 'règle de la version 1 : passe à « tous »')
  setMfaPolicy({ requireAdmins: true, requireAll: false })
  initMfaPolicy(d)
  assert.equal(mfaPolicy().requireAll, false, 'choix explicite du Super Admin respecté')
})

test('photo de profil : seuls PNG, JPEG et WebP réels sont acceptés (SVG, HTML et exécutables refusés)', async () => {
  const { detectImage, avatarKey } = await import('../server/profile.js')
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])
  assert.equal(detectImage(png).type, 'image/png')
  assert.equal(detectImage(jpg).type, 'image/jpeg')
  assert.equal(detectImage(webp).type, 'image/webp')
  assert.equal(detectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null)
  assert.equal(detectImage(Buffer.from('MZ\x90\x00 exécutable renommé en .png')), null)
  assert.equal(detectImage(Buffer.from('<html><body>')), null)
  assert.match(avatarKey('A@X.test'), /^[a-f0-9]{24}$/)
  assert.equal(avatarKey('A@X.test'), avatarKey('a@x.test'), 'même clé quelle que soit la casse')
})

test('corrections et ajouts : tonalité et thème corrigés, article manuel validé, approbation publique', async () => {
  const ie = await import('../server/itemEdits.js')
  let changed = 0
  ie.initItemEdits(fs.mkdtempSync(path.join(os.tmpdir(), 'mms-edits-')), { changed: () => changed++ })
  const known = (id) => id === 'a'
  const NOW = Date.parse('2026-10-29T10:00:00Z')
  ie.editItem('a', { tone: 'negative', category: 'énergie' }, 'x@y', known)
  assert.throws(() => ie.editItem('a', { tone: 'furieux' }, 'x@y', known), /BAD_TONE/)
  assert.throws(() => ie.editItem('zz', { tone: 'negative' }, 'x@y', known), /NOT_FOUND/)
  assert.throws(() => ie.addManual({ title: '', origin: 'جريدة', date: new Date(NOW).toISOString() }, 'x@y', NOW), /NO_TITLE/)
  assert.throws(() => ie.addManual({ title: 'خبر', origin: 'جريدة', date: '2040-01-01' }, 'x@y', NOW), /BAD_DATE/)
  assert.throws(() => ie.addManual({ title: 'خبر', origin: 'جريدة', date: new Date(NOW).toISOString(), url: 'javascript:alert(1)' }, 'x@y', NOW), /BAD_URL/)
  const m = ie.addManual({ title: 'خبر <b>مضاف</b>', origin: 'صحيفة الوسط الورقية', date: new Date(NOW).toISOString(), url: 'https://x.test/a', tone: 'positive', media: 'article' }, 'x@y', NOW)
  assert.equal(m.title, 'خبر bمضاف/b', 'balises retirées')
  ie.setPublic('a', true, 'admin@y', known)
  const items = [{ id: 'a', tone: 'neutral', category: 'politique' }]
  ie.applyItemEdits(items)
  assert.deepEqual([items[0].tone, items[0].category, items[0].public], ['negative', 'énergie', true])
  assert.equal(items.length, 2, 'article manuel ajouté à la liste')
  assert.equal(items[1].manual, true)
  assert.throws(() => ie.deleteManual(m.id, 'autre@y', false), /FORBIDDEN/)
  assert.equal(ie.deleteManual(m.id, 'x@y', false), true)
  assert.ok(changed >= 4, 'la liste est relue après chaque modification')
})

test('vitrine publique : seulement les fiches approuvées, seulement les champs publics', async () => {
  const { portalNews, portalItem } = await import('../server/portal.js')
  const it = (id, pub, extra = {}) => ({ id, public: pub, title: `خبر ${id}`, summary: 'ملخص', origin: 'وال', date: '2026-10-29T08:00:00Z', url: 'https://x.test/' + id, image: 'javascript:alert(1)', category: 'politique', lang: 'ar', tone: 'negative', people: ['س'], transcription: 'سري', createdBy: 'a@b', ...extra })
  const items = [it('a', true), it('b', false), it('c', true, { category: 'sport', date: '2026-10-20T08:00:00Z' }), it('d', undefined)]
  const all = portalNews(items, {})
  assert.deepEqual(all.items.map((x) => x.id), ['a', 'c'])
  assert.deepEqual(Object.keys(all.items[0]).sort(), ['category', 'date', 'id', 'image', 'lang', 'source', 'summary', 'title', 'url'])
  assert.equal(all.items[0].image, '', 'adresse d’image non http écartée')
  assert.equal(portalNews(items, { category: 'sport' }).total, 1)
  assert.equal(portalNews(items, { from: '2026-10-25' }).total, 1)
  assert.equal(portalNews(items, { q: 'خبر c' }).total, 1)
  assert.deepEqual(all.facets.categories.map((c) => c.name).sort(), ['politique', 'sport'])
  assert.equal(portalItem(it('e', true, { summary: 'س'.repeat(900) })).summary.length, 600)
})
