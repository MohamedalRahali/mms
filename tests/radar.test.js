import test from 'node:test'
import assert from 'node:assert/strict'
import { emergingTopics, smartAlerts, stem, storyClusters, toneOf, sentimentBarometer, barometerWindow } from '../server/radar.js'
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

// Baromètre : la période choisie change vraiment le résultat (signalé « ne change pas avec la date »)
const moodPool = () => {
  const items = []
  // 10 derniers jours : négatif ; 20 jours avant : positif
  for (let d = 0; d < 10; d++) items.push(item(24 * d + 1, 'a', { tone: 'negative', people: ['الدبيبة'], origin: 'srcA' }), item(24 * d + 2, 'b', { tone: 'negative', people: ['الدبيبة'], origin: 'srcB' }))
  for (let d = 10; d < 30; d++) items.push(item(24 * d + 1, 'c', { tone: 'positive', people: ['حفتر'], origin: 'srcC' }), item(24 * d + 2, 'd', { tone: 'positive', people: ['حفتر'], origin: 'srcC' }))
  return items
}

test('baromètre : 7, 14 et 30 jours donnent des chiffres différents', () => {
  const items = moodPool()
  const b7 = sentimentBarometer(items, { days: 7, now: NOW })
  const b14 = sentimentBarometer(items, { days: 14, now: NOW })
  const b30 = sentimentBarometer(items, { days: 30, now: NOW })
  assert.equal(b7.sentiment, -100)
  assert.ok(b14.sentiment > b7.sentiment && b30.sentiment > b14.sentiment, `${b7.sentiment} ${b14.sentiment} ${b30.sentiment}`)
  assert.deepEqual([b7.perDay.length, b14.perDay.length, b30.perDay.length], [7, 14, 30])
  assert.equal(b7.perDay.at(-1).date, '2026-10-24')
  // Totaux = somme des barres par jour : rien hors de la fenêtre affichée
  for (const b of [b7, b14, b30]) assert.equal(b.total, b.perDay.reduce((n, d) => n + d.positive + d.neutral + d.negative, 0))
  assert.deepEqual(b7.actors.map((a) => a.name), ['الدبيبة'])
  assert.ok(b30.actors.some((a) => a.name === 'حفتر'))
  assert.ok(!b7.sources.some((s) => s.name === 'srcC') && b30.sources.some((s) => s.name === 'srcC'))
})

test('baromètre : une date de fin passée ou une plage du … au … déplace la fenêtre', () => {
  const items = moodPool()
  const past = sentimentBarometer(items, { days: 7, to: '2026-10-10', now: NOW })
  assert.equal(past.to, '2026-10-10')
  assert.equal(past.from, '2026-10-04')
  assert.equal(past.perDay.at(-1).date, '2026-10-10')
  assert.equal(past.sentiment, 100)
  assert.deepEqual(past.actors.map((a) => a.name), ['حفتر'])
  const range = sentimentBarometer(items, { from: '2026-10-12', to: '2026-10-17', now: NOW })
  assert.equal(range.days, 6)
  assert.deepEqual([range.perDay[0].date, range.perDay.at(-1).date], ['2026-10-12', '2026-10-17'])
  assert.ok(range.positive > 0 && range.negative > 0)
  assert.notEqual(range.sentiment, past.sentiment)
})

test('baromètre : dates invalides ou hors bornes ramenées dans les limites', () => {
  assert.equal(barometerWindow({ to: '2099-01-01', days: 7, now: NOW }).to, '2026-10-24')
  assert.equal(barometerWindow({ to: 'pas une date', days: 7, now: NOW }).to, '2026-10-24')
  assert.equal(barometerWindow({ to: '2026-02-31', days: 7, now: NOW }).to, '2026-10-24')
  assert.equal(barometerWindow({ from: '2020-01-01', to: '2026-10-24', now: NOW }).days, 90)
  // Début après la fin : au moins 2 jours
  const w = barometerWindow({ from: '2026-10-20', to: '2026-10-18', now: NOW })
  assert.deepEqual([w.from, w.to, w.days], ['2026-10-17', '2026-10-18', 2])
  assert.equal(barometerWindow({ days: 500, now: NOW }).days, 90)
  assert.equal(barometerWindow({ days: -3, now: NOW }).days, 2)
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
