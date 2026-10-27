import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { foldStories, groupNews, net, overview, sortNews } from '../server/newsView.js'
import { countryFromUrl, countryOf, defaultReach, initSourceMeta, reachOf, setSourceMeta } from '../server/sourceMeta.js'
import { initProcessed, isProcessed, setProcessed } from '../server/processed.js'
import { createShare, initShares, publicShareQuery, revokeShare, shareFor, statusOf } from '../server/shares.js'
import { apiKeyFor, createApiKey, initApiKeys, keyFromRequest, revokeApiKey, takeCall } from '../server/apiKeys.js'
import { denialOf, initPermissions, listProfiles } from '../server/permissions.js'
import { cleanSettings, measure, summarize } from '../server/geo.js'
import { storyIndex } from '../server/radar.js'

/** Liste d'actualités enrichie, partage, API des clients, présence IA : node --test tests/*.test.js */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-nrx-'))
initSourceMeta(dir)
const NOW = Date.parse('2026-10-26T12:00:00Z')
const item = (id, h, extra = {}) => ({ id, title: `titre ${id}`, summary: '', origin: 'Alwasat', channel: 'site', url: `https://alwasat.ly/${id}`, date: new Date(NOW - h * 3_600_000).toISOString(), ...extra })

test('pays : réglage du Super Admin, sinon domaine du site', () => {
  assert.equal(countryFromUrl('https://www.alwasat.ly/news/1'), 'LY')
  assert.equal(countryFromUrl('https://www.bbc.co.uk/arabic'), 'GB')
  assert.equal(countryFromUrl('https://www.aljazeera.net/x'), 'QA')
  assert.equal(countryFromUrl('https://example.com/x'), '')
  assert.equal(countryFromUrl('pas une adresse'), '')
  assert.equal(countryOf({ origin: 'Inconnu', url: 'https://site.tn/a' }), 'TN')
  setSourceMeta('Inconnu', { country: 'eg', reach: '' })
  assert.equal(countryOf({ origin: 'Inconnu', url: 'https://site.tn/a' }), 'EG')
  setSourceMeta('Inconnu', { country: 'pirate', reach: null })
  assert.equal(countryOf({ origin: 'Inconnu', url: 'https://site.tn/a' }), 'TN')
})

test('portée : chiffre saisi, sinon estimation par canal ; valeurs bornées', () => {
  assert.equal(defaultReach({ channel: 'tv' }), 250_000)
  assert.equal(defaultReach({ channel: 'inconnu' }), 10_000)
  setSourceMeta('Chaîne', { reach: 1234.6 })
  assert.equal(reachOf({ origin: 'Chaîne', channel: 'tv' }), 1235)
  setSourceMeta('Chaîne', { reach: -5 })
  assert.equal(reachOf({ origin: 'Chaîne', channel: 'tv' }), 0)
  // Relu depuis le disque
  initSourceMeta(dir)
  assert.equal(reachOf({ origin: 'Chaîne', channel: 'tv' }), 0)
})

test('tri dans les deux sens : date, portée, source', () => {
  const list = [item('a', 3, { origin: 'ب' }), item('b', 1, { origin: 'أ', channel: 'tv' }), item('c', 2, { origin: 'ت', channel: 'facebook' })]
  assert.deepEqual(sortNews([...list], '', '').map((x) => x.id), ['b', 'c', 'a'])
  assert.deepEqual(sortNews([...list], '', 'asc').map((x) => x.id), ['a', 'c', 'b'])
  assert.deepEqual(sortNews([...list], 'reach', 'desc').map((x) => x.id), ['b', 'c', 'a'])
  assert.deepEqual(sortNews([...list], 'source', '').map((x) => x.origin), ['أ', 'ب', 'ت'])
  assert.deepEqual(sortNews([...list], 'source', 'desc').map((x) => x.origin), ['ت', 'ب', 'أ'])
})

test('regroupement : Buzz, portée cumulée et tonalité par groupe, fiches contiguës', () => {
  const list = [
    item('1', 1, { category: 'politique', tone: 'negative' }),
    item('2', 2, { category: 'sport', tone: 'positive' }),
    item('3', 3, { category: 'politique', tone: 'negative', similar: [item('3b', 3, { tone: 'neutral' })] }),
  ]
  const { list: out, groups } = groupNews(list, 'category')
  assert.deepEqual(out.map((x) => x.group), ['politique', 'politique', 'sport'])
  assert.equal(groups[0].key, 'politique')
  assert.equal(groups[0].count, 3) // la fiche similaire repliée compte dans le Buzz
  assert.equal(groups[0].reach, 3 * 15_000)
  assert.deepEqual(groups[0].tone, { positive: 0, neutral: 1, negative: 2 })
  assert.equal(groups[0].sentiment, net({ positive: 0, neutral: 1, negative: 2 }))
  assert.deepEqual(groupNews(list, 'pirate').groups, [])
  // Jours : du plus récent au plus ancien
  const days = groupNews([item('x', 50), item('y', 1)], 'day').groups.map((g) => g.key)
  assert.ok(days[0] > days[1])
})

test('histoires similaires repliées sous la première fiche du tri', () => {
  const pool = [
    item('s1', 5, { title: 'انفجار في ميناء طرابلس يخلف أضرارا' }),
    item('s2', 4, { title: 'انفجار ميناء طرابلس يخلف أضرارا كبيرة', origin: 'B' }),
    item('s3', 3, { title: 'انفجار في ميناء طرابلس وأضرار', origin: 'C' }),
    item('z', 2, { title: 'مباراة كرة القدم في بنغازي اليوم' }),
  ]
  const index = storyIndex(pool, { now: NOW })
  assert.equal(index.get('s1'), index.get('s2'))
  const folded = foldStories(sortNews([...pool], '', ''), index)
  const lead = folded.find((x) => x.similar)
  assert.equal(lead.id, 's3')
  assert.deepEqual(lead.similar.map((x) => x.id).sort(), ['s1', 's2'])
  assert.equal(folded.length, 2)
  assert.equal(foldStories(pool, new Map()).length, 4)
})

test('onglets : sources classées, auteurs sinon personnalités citées', () => {
  const o = overview([item('1', 1, { people: ['الدبيبة'] }), item('2', 1, { origin: 'X', people: ['الدبيبة', 'حفتر'] })])
  assert.equal(o.sourcesCount, 2)
  assert.equal(o.peopleKind, 'entities')
  assert.deepEqual(o.people[0], { name: 'الدبيبة', count: 2 })
  const withAuthors = overview(['a', 'b', 'c', 'a'].map((a, k) => item(String(k), 1, { author: `@${a}`, channel: 'x' })))
  assert.equal(withAuthors.peopleKind, 'authors')
  assert.deepEqual(withAuthors.people[0], { name: '@a', count: 2 })
})

test('statut « تمت المعالجة » : partagé, persistant, réversible', () => {
  initProcessed(dir)
  setProcessed('https://x/1', true, 'Farhat')
  initProcessed(dir)
  assert.ok(isProcessed('https://x/1'))
  setProcessed('https://x/1', false)
  assert.ok(!isProcessed('https://x/1'))
  assert.equal(setProcessed('', true), null)
})

test('partage : jeton long et aléatoire, empreinte seule gardée, expiration et révocation', () => {
  initShares(dir)
  const { share, token } = createShare({ boardId: 'main', boardName: 'لوحة', days: 7, by: 'a@b.c' })
  assert.match(token, /^[A-Za-z0-9_-]{43}$/)
  const saved = fs.readFileSync(path.join(dir, 'shares.json'), 'utf8')
  assert.ok(!saved.includes(token), 'le jeton ne doit pas être écrit sur le disque')
  assert.equal(shareFor(token).id, share.id)
  assert.equal(shareFor(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')), null)
  assert.equal(shareFor('../../etc/passwd'), null)
  assert.equal(statusOf({ expiresAt: new Date(Date.now() - 1000).toISOString() }), 'expired')
  revokeShare(share.id, 'a@b.c')
  assert.equal(shareFor(token), null)
  assert.throws(() => createShare({ boardId: '' }), /NO_BOARD/)
})

test('partage : seuls les appels des widgets du tableau, avec leurs paramètres', () => {
  const widgets = [
    { type: 'pie', days: 7, flux: '' },
    { type: 'news', days: 30, flux: '', category: 'politique' },
    { type: 'mood', days: 14, flux: '' },
  ]
  assert.deepEqual(publicShareQuery(widgets, 'news/stats', { days: '7', q: 'secret', source: 'x' }), { days: '7' })
  assert.equal(publicShareQuery(widgets, 'news/stats', { days: '365' }), null)
  assert.deepEqual(publicShareQuery(widgets, 'news', { days: '30', category: 'politique', size: '100', q: 'x' }), { days: '30', size: '40', category: 'politique' })
  assert.equal(publicShareQuery(widgets, 'news', { days: '30' }), null)
  assert.deepEqual(publicShareQuery(widgets, 'radar/sentiment', { days: '14' }), { days: '14' })
  assert.equal(publicShareQuery(widgets, 'radar/stories', { hours: '48' }), null)
  assert.equal(publicShareQuery(widgets, 'watches', {}), null)
})

test('API des clients : clé en en-tête seulement, empreinte gardée, limite par minute, révocation', () => {
  initApiKeys(dir)
  const { key, row } = createApiKey({ name: 'Client A', rate: 2 })
  assert.match(key, /^mms_[A-Za-z0-9_-]{43}$/)
  assert.ok(!fs.readFileSync(path.join(dir, 'apikeys.json'), 'utf8').includes(key))
  assert.equal(keyFromRequest({ headers: { authorization: `Bearer ${key}` } }), key)
  assert.equal(keyFromRequest({ headers: { 'x-api-key': key } }), key)
  const k = apiKeyFor(key)
  assert.equal(k.id, row.id)
  const t = Date.now()
  assert.equal(takeCall(k, t), '')
  assert.equal(takeCall(k, t + 1), '')
  assert.equal(takeCall(k, t + 2), 'RATE_MINUTE')
  assert.equal(takeCall(k, t + 61_000), '')
  revokeApiKey(row.id)
  assert.equal(apiKeyFor(key), null)
  assert.equal(apiKeyFor('mms_court'), null)
  assert.throws(() => createApiKey({ name: '' }), /NO_NAME/)
})

test('droits : nouvelles actions accordées aux profils de base déjà enregistrés, jamais au قارئ', () => {
  const pdir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-perm-'))
  fs.writeFileSync(
    path.join(pdir, 'permissions.json'),
    JSON.stringify({ profiles: [{ id: 'analyst', modules: ['news'], actions: ['export'], known: ['news'] }, { id: 'p_custom12', name: 'x', modules: ['news'], actions: [] }] }),
  )
  initPermissions(pdir)
  const get = (id) => listProfiles().find((p) => p.id === id)
  assert.ok(get('analyst').actions.includes('mark_processed') && get('analyst').actions.includes('share_dashboards'))
  assert.ok(!get('viewer').actions.includes('mark_processed'))
  assert.deepEqual(get('p_custom12').actions, [])
  const viewer = { modules: ['news', 'dashboard'], actions: ['export'] }
  assert.equal(denialOf(viewer, 'PUT', '/news/processed'), 'action:mark_processed')
  assert.equal(denialOf(viewer, 'GET', '/shares'), 'action:share_dashboards')
  assert.equal(denialOf({ ...viewer, actions: ['share_dashboards'] }, 'POST', '/shares'), '')
  assert.equal(denialOf(viewer, 'POST', '/ai/brief'), 'action:ai_ask')
  assert.equal(denialOf(viewer, 'GET', '/geo'), 'module:geo')
  assert.equal(denialOf(viewer, 'GET', '/news/overview'), '')
})

test('présence IA : mentions, tonalité, réglages bornés', () => {
  const m = measure('الدبيبة أعلن نجاح الاتفاق. وقالت قناة الوسط إن الدبيبة واجه انتقادات', ['بوابة الوسط'], ['الدبيبة', 'الوسط', 'حفتر'])
  assert.equal(m[0].count, 2)
  assert.ok(m[0].cited)
  assert.ok(m[1].inSources)
  assert.equal(m[2].cited, false)
  const s = cleanSettings({ questions: [{ text: ' سؤال ' }, { text: '' }], entities: ['أ', 'أ', ''], dailyLimit: 999, schedule: 'hourly' })
  assert.equal(s.questions.length, 1)
  assert.deepEqual(s.entities, ['أ'])
  assert.equal(s.dailyLimit, 100)
  assert.equal(s.schedule, 'off')
  const sum = summarize([{ at: '2026-10-26T10:00:00Z', mentions: m }, { at: '2026-10-26T11:00:00Z', mentions: [] }], ['الدبيبة'])
  assert.equal(sum[0].rate, 50)
})
