import test from 'node:test'
import assert from 'node:assert/strict'
import { emergingTopics, smartAlerts, stem, storyClusters, toneOf, sentimentBarometer } from '../server/radar.js'
import { compileQuery, queryError } from '../server/query.js'
import { normalize } from '../server/watches.js'

/** Tests du radar intelligent et de la recherche multilingue : node --test tests/*.test.js */

const NOW = Date.parse('2026-10-24T12:00:00Z')
const H = 3_600_000
let n = 0
const item = (hoursAgo, title, extra = {}) => ({
  id: `t${++n}`,
  title,
  summary: '',
  origin: `src${n % 7}`,
  channel: 'site',
  date: new Date(NOW - hoursAgo * H).toISOString(),
  ...extra,
})

test('racine légère : article, préfixes et pluriels arabes', () => {
  assert.equal(stem(normalize('والنفط')), 'نفط')
  assert.equal(stem(normalize('بالمصرف')), 'مصرف')
  assert.equal(stem(normalize('الاحتجاجات')), 'احتجاج')
  assert.equal(stem('oil'), 'oil')
})

test('tonalité : celle de la veille prime, sinon lexique', () => {
  assert.deepEqual(toneOf({ title: 'x', summary: '', tone: 'positive' }), { tone: 'positive', inferred: false })
  assert.equal(toneOf({ title: 'اشتباكات مسلحة في طرابلس', summary: '' }).tone, 'negative')
  assert.equal(toneOf({ title: 'توقيع اتفاق تعاون', summary: '' }).tone, 'positive')
  assert.equal(toneOf({ title: 'Sharara oil field shut down amid protests', summary: '' }).tone, 'negative')
  assert.equal(toneOf({ title: 'اجتماع المجلس البلدي', summary: '' }).tone, 'neutral')
})

const pool = () => {
  const items = []
  for (let d = 1; d < 8; d++) for (let k = 0; k < 4; k++) items.push(item(24 * d + k, 'المجلس البلدي يناقش ميزانية الطرق'))
  for (let k = 0; k < 6; k++) items.push(item(k + 1, 'إغلاق حقل الشرارة النفطي بعد احتجاجات', { places: ['أوباري'] }))
  return items
}

test('sujets émergents : la rafale ressort, le bruit de fond non', () => {
  const topics = emergingTopics(pool(), { now: NOW })
  assert.ok(topics.length > 0)
  assert.match(topics[0].label, /الشرارة|أوباري|إغلاق|حقل/)
  assert.ok(topics.some((t) => t.isNew))
  assert.ok(!topics.some((t) => /ميزانية|البلدي/.test(t.label)), 'le sujet régulier ne doit pas être émergent')
  // Pas de doublons : une seule entrée pour la même rafale hors entités
  assert.ok(topics.filter((t) => t.kind !== 'entity').length <= 2)
})

test('sujets émergents : une seule source ne suffit pas', () => {
  const items = [0, 1, 2, 3].map((k) => item(k + 1, 'خبر حصري عن ميناء مصراتة', { origin: 'unique' }))
  assert.equal(emergingTopics(items, { now: NOW }).length, 0)
})

test('histoires : les titres proches sont regroupés, les autres non', () => {
  const items = [
    item(2, 'إغلاق حقل الشرارة النفطي بعد احتجاجات'),
    item(3, 'حقل الشرارة: إغلاق بعد احتجاجات محلية'),
    item(4, 'استمرار إغلاق حقل الشرارة'),
    item(5, 'افتتاح معرض الكتاب في بنغازي'),
  ]
  const stories = storyClusters(items, { now: NOW })
  assert.equal(stories.length, 1)
  assert.equal(stories[0].size, 3)
  assert.equal(stories[0].first.origin, items[2].origin)
})

test('alertes : sujet nouveau et histoire reprise, classées par gravité', () => {
  const items = pool()
  for (let k = 0; k < 4; k++) items.push(item(k + 2, 'اشتباكات في الزاوية', { people: ['فلان'], origin: `s${k}` }))
  const alerts = smartAlerts(items, { now: NOW })
  assert.ok(alerts.length > 0)
  for (let k = 1; k < alerts.length; k++) assert.ok(alerts[k - 1].level >= alerts[k].level)
  assert.ok(alerts.every((a) => a.filter && Object.keys(a.filter).length))
})

test('baromètre : indice net et part estimée', () => {
  const b = sentimentBarometer([item(2, 'x', { tone: 'positive' }), item(3, 'y', { tone: 'negative' }), item(4, 'اشتباكات')], { now: NOW })
  assert.equal(b.total, 3)
  assert.equal(b.negative, 2)
  assert.equal(b.sentiment, -33)
  assert.equal(b.inferredShare, 33)
})

const match = (q, text) => compileQuery(q)(normalize(text))

test('recherche : équivalents arabes / anglais / français', () => {
  assert.ok(match('Tripoli', 'انقطاع الكهرباء في طرابلس'))
  assert.ok(match('طرابلس', 'Clashes in Tripoli'))
  assert.ok(match('NOC', 'المؤسسة الوطنية للنفط تعلن'))
  assert.ok(match('الدبيبة', 'Dbeibah meets delegation'))
  assert.ok(match('Benghazi', 'بلدية بنغازي'))
})

test('recherche : préfixes arabes et sigles en mots entiers', () => {
  assert.ok(match('طرابلس', 'وطرابلس تشهد'))
  assert.ok(match('احتجاج', 'الاحتجاجات مستمرة'))
  assert.ok(!match('noc', 'an innocent man'))
})

test('recherche booléenne inchangée (non-régression)', () => {
  assert.ok(match('ليبيا AND (نفط OR oil)', 'ليبيا تصدر oil'))
  assert.ok(!match('ليبيا AND NOT نفط', 'ليبيا والنفط'))
  assert.ok(match('"حقل الشرارة"', 'إغلاق حقل الشرارة'))
  assert.ok(!match('"حقل الشرارة"', 'حقل الفيل والشرارة'))
  assert.ok(match('-sport libya', 'libya oil'))
  assert.equal(queryError('(ليبيا'), 'parenthesis')
  assert.equal(compileQuery(''), null)
})

test('envoi des alertes critiques : une seule fois, jamais pour les exemples', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { startRadarAlerts } = await import('../server/radar.js')
  process.env.MMS_RADAR_ALERTS = '1'
  process.env.MMS_RADAR_ALERTS_TO = 'veille@exemple.ly, pas-une-adresse'
  const now = Date.now()
  const items = []
  for (let k = 0; k < 12; k++)
    items.push({ id: `a${k}`, title: 'إغلاق حقل الشرارة النفطي بعد احتجاجات', summary: '', origin: `s${k}`, channel: 'site', date: new Date(now - (k + 1) * 3_600_000).toISOString() })
  const telegrams = []
  const mails = []
  const deps = { telegramReady: () => true, sendTelegram: async (t) => telegrams.push(t), sendMail: async (to, m) => mails.push({ to, m }) }
  const run = startRadarAlerts(mkdtempSync(join(tmpdir(), 'radar-')), () => ({ items }), deps)
  await run()
  assert.equal(telegrams.length, 1)
  assert.match(telegrams[0], /الرادار الذكي/)
  assert.deepEqual(mails[0].to, ['veille@exemple.ly'])
  await run()
  assert.equal(telegrams.length, 1, 'une alerte déjà envoyée ne repart pas')
  const demoRun = startRadarAlerts(mkdtempSync(join(tmpdir(), 'radar-')), () => ({ items: items.map((it) => ({ ...it, demo: true })) }), deps)
  await demoRun()
  assert.equal(telegrams.length, 1, 'les exemples ne déclenchent rien')
  delete process.env.MMS_RADAR_ALERTS
})
