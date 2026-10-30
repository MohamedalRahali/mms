import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Diffusion automatique sur la vitrine /portal : règles, épingles, exclusions, champs publics */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-pf-'))
const feed = await import('../server/portalFeed.js')
const { portalNews } = await import('../server/portal.js')
feed.initPortalFeed(dir)

const NOW = Date.parse('2026-10-30T10:00:00Z')
const it = (id, extra = {}) => ({
  id,
  title: `خبر ${id}`,
  summary: 'ملخص كافٍ لهذا الخبر حتى يمر شرط الطول',
  origin: 'وال',
  date: '2026-10-30T08:00:00Z',
  url: 'https://x.test/' + id,
  image: '',
  category: 'politique',
  lang: 'ar',
  media: 'article',
  channel: 'site',
  tone: 'neutral',
  importance: 1,
  transcription: 'سري',
  ...extra,
})
const decide = (items, config, marks = { pins: {}, excluded: {} }) => {
  const d = feed.evaluate(items, { ...feed.DEFAULT_CONFIG, ...config }, marks, NOW)
  return items.map((x) => d(x).reason)
}

test('types de contenu : TV, radio, YouTube, réseaux, commentaires', () => {
  assert.equal(feed.typeOf({ media: 'broadcast', subType: 'radio' }), 'radio')
  assert.equal(feed.typeOf({ media: 'broadcast', channel: 'youtube' }), 'youtube')
  assert.equal(feed.typeOf({ media: 'broadcast', channel: 'tv' }), 'tv')
  assert.equal(feed.typeOf({ media: 'social', channel: 'facebook' }), 'social')
  assert.equal(feed.typeOf({}), 'article')
  const items = [it('a'), it('b', { media: 'social' }), it('c', { media: 'broadcast', channel: 'tv' }), it('d', { media: 'comment' })]
  // Par défaut : articles, TV, radio, YouTube ; jamais les commentaires
  assert.deepEqual(decide(items, {}), ['rules', 'type', 'rules', 'type'])
  assert.deepEqual(decide(items, { types: ['social'] }), ['type', 'rules', 'type', 'type'])
})

test('langues, thèmes, sources (seulement / sauf), mots-clés avec variantes arabes', () => {
  const items = [it('a'), it('b', { lang: 'en', origin: 'Reuters' }), it('c', { category: 'sport', title: 'مباراة الأهلي', origin: 'قناة' })]
  assert.deepEqual(decide(items, { langs: ['ar'] }), ['rules', 'lang', 'rules'])
  assert.deepEqual(decide(items, { categories: ['sport'] }), ['category', 'category', 'rules'])
  assert.deepEqual(decide(items, { sourceMode: 'include', sources: ['وال'] }), ['rules', 'source', 'source'])
  assert.deepEqual(decide(items, { sourceMode: 'exclude', sources: ['وال'] }), ['source', 'rules', 'rules'])
  // « الاهلي » sans hamza retrouve « الأهلي »
  assert.deepEqual(decide(items, { keywords: ['الاهلي'] }), ['keyword', 'keyword', 'rules'])
  assert.deepEqual(decide(items, { excludeKeywords: ['مباراة'] }), ['rules', 'rules', 'excludeKeyword'])
})

test('qualité, ancienneté, plafond par source et par jour', () => {
  const items = [
    it('old', { date: '2026-09-01T08:00:00Z' }),
    it('nosum', { summary: '' }),
    it('low', { importance: 1 }),
    it('neg', { tone: 'negative', importance: 3 }),
  ]
  assert.deepEqual(decide(items, {}), ['age', 'summary', 'rules', 'rules'])
  assert.deepEqual(decide(items, { maxAgeDays: 0, requireSummary: false, minImportance: 3 }), ['importance', 'importance', 'importance', 'rules'])
  assert.deepEqual(decide(items, { maxAgeDays: 0, requireSummary: false, tones: ['negative'] }), ['tone', 'tone', 'tone', 'rules'])
  assert.deepEqual(decide([it('img')], { requireImage: true }), ['image'])
  const many = [1, 2, 3, 4].map((n) => it(`m${n}`, { importance: n === 4 ? 3 : 1, date: `2026-10-30T0${n}:00:00Z` }))
  // 2 par jour : la plus importante, puis la plus récente
  assert.deepEqual(decide(many, { perSourceDaily: 2 }), ['cap', 'cap', 'rules', 'rules'])
})

test('épingles, exclusions, approbations, pause, mode manuel', () => {
  const items = [it('a'), it('b', { public: true, media: 'social' }), it('c', { media: 'social' })]
  const marks = { pins: { c: { at: '', by: '' } }, excluded: { a: { at: '', by: '' } } }
  assert.deepEqual(decide(items, {}, marks), ['excluded', 'approved', 'pinned'])
  assert.deepEqual(decide(items, { includeApproved: false }, marks), ['excluded', 'type', 'pinned'])
  assert.deepEqual(decide(items, { auto: false }, { pins: {}, excluded: {} }), ['notAuto', 'approved', 'notAuto'])
  assert.deepEqual(decide(items, { enabled: false }, marks), ['excluded', 'disabled', 'disabled'])
  // Épingle expirée : la fiche repasse par les règles
  const expired = { pins: { a: { until: '2026-10-29T00:00:00Z' } }, excluded: {} }
  assert.deepEqual(decide([it('a', { media: 'social' })], {}, expired), ['type'])
})

test('réglages nettoyés et enregistrés ; vitrine : épinglées en tête, seulement les champs publics', () => {
  const c = feed.cleanConfig({ types: ['tv', 'hack'], minImportance: 9, maxAgeDays: -3, title: '<b>بوابة</b>', sources: Array(900).fill('x'), evil: 1 })
  assert.deepEqual(c.types, ['tv'])
  assert.equal(c.minImportance, 3)
  assert.equal(c.maxAgeDays, 0)
  assert.equal(c.title, 'bبوابة/b')
  assert.equal(c.sources.length, 1)
  assert.equal('evil' in c, false)

  feed.setConfig({ ...feed.DEFAULT_CONFIG, maxAgeDays: 0, title: 'أخبار المركز' }, 'a@b')
  const items = [it('a', { date: '2026-10-29T20:00:00Z' }), it('b', { date: '2026-10-28T09:00:00Z' }), it('c', { media: 'comment' })]
  feed.markItem('b', 'pin', 'a@b', { known: (id) => items.some((x) => x.id === id) })
  assert.throws(() => feed.markItem('zz', 'exclude', 'a@b', { known: () => false }), /NOT_FOUND/)
  const sel = feed.portalSelection(items)
  const page = portalNews(items, {}, sel)
  assert.deepEqual(page.items.map((x) => [x.id, x.pinned]), [['b', true], ['a', false]])
  assert.equal(page.items[0].transcription, undefined)
  assert.deepEqual(page.facets.types, [{ name: 'article', count: 2 }])
  assert.equal(portalNews(items, { type: 'tv' }, sel).total, 0)
  assert.equal(feed.portalSite().title, 'أخبار المركز')

  feed.markItem('a', 'exclude', 'a@b')
  assert.deepEqual(feed.portalSelection(items).list.map((x) => x.id), ['b'])
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'portal-feed.json'), 'utf8'))
  assert.ok(saved.excluded.a && saved.pins.b)
  assert.equal(saved.history[0].what, 'exclude a')

  const pv = feed.preview(items, { status: 'excluded' })
  assert.deepEqual(pv.items.map((x) => x.id), ['a'])
  assert.equal(pv.stats.shown, 1)
  feed.resetConfig('a@b')
  assert.equal(feed.portalSite().title, '')
})
