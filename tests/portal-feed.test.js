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

test('publication manuelle seulement : les règles proposent, rien ne passe sans publication validée', () => {
  const items = [it('a'), it('b', { public: true, media: 'social' }), it('c', { media: 'social' }), it('d')]
  const full = (marks) => {
    const d = feed.evaluate(items, { ...feed.DEFAULT_CONFIG, auto: true, includeApproved: true }, { pins: {}, excluded: {}, published: {}, ...marks }, NOW)
    return items.map((x) => [d(x).show, d(x).status, d(x).reason])
  }
  // Même avec d'anciens réglages « auto » : rien n'est affiché, les fiches qui passent les règles sont « suggested »
  assert.deepEqual(full({}), [
    [false, 'suggested', 'rules'],
    [false, 'hidden', 'type'],
    [false, 'hidden', 'type'],
    [false, 'suggested', 'rules'],
  ])
  const pub = { a: { title: 't' }, c: { title: 't' } }
  assert.deepEqual(full({ published: pub, pins: { c: { at: '', by: '' } }, excluded: { d: { at: '', by: '' } } }), [
    [true, 'shown', 'published'],
    [false, 'hidden', 'type'],
    [true, 'pinned', 'pinned'],
    [false, 'excluded', 'excluded'],
  ])
  // Pause : les fiches publiées ne s'affichent plus
  const paused = feed.evaluate(items, { ...feed.DEFAULT_CONFIG, enabled: false }, { pins: {}, excluded: {}, published: pub }, NOW)
  assert.equal(paused(items[0]).show, false)
  assert.equal(feed.cleanConfig({ auto: true }).auto, false)
})

test('réécriture obligatoire : titre et résumé reformulés, lien, validation humaine', () => {
  const src = it('r', { title: 'وزير الخارجية يلتقي السفير الإيطالي في طرابلس لبحث التعاون', summary: 'التقى وزير الخارجية اليوم السفير الإيطالي في طرابلس وبحثا سبل التعاون الثنائي في مجالات الطاقة والهجرة' })
  const ok = { title: 'مباحثات ليبية إيطالية حول الطاقة والهجرة', summary: 'بحث رئيس الدبلوماسية الليبية مع ممثل روما ملفات الشراكة، وعلى رأسها إمدادات الغاز وتنظيم تدفقات المهاجرين.', confirm: true }
  assert.equal(feed.checkRewrite(src, ok), '')
  assert.equal(feed.checkRewrite(src, { ...ok, confirm: false }), 'NOT_CONFIRMED')
  assert.equal(feed.checkRewrite(src, { ...ok, title: src.title }), 'TITLE_COPY')
  assert.equal(feed.checkRewrite(src, { ...ok, summary: src.summary }), 'SUMMARY_COPY')
  assert.equal(feed.checkRewrite(src, { ...ok, summary: 'قصير' }), 'SUMMARY_LENGTH')
  assert.equal(feed.checkRewrite({ ...src, url: '' }, ok), 'NO_URL')
  assert.equal(feed.checkRewrite({ ...src, url: '' }, { ...ok, url: 'https://source.test/a' }), '')
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
  const items = [it('a', { date: '2026-10-29T20:00:00Z', image: 'https://img.test/a.jpg' }), it('b', { date: '2026-10-28T09:00:00Z', media: 'social', channel: 'x', image: 'https://img.test/b.jpg' }), it('c', { media: 'comment' })]
  // Rien n'est publié tant qu'une personne ne l'a pas fait ; on n'épingle pas une fiche non publiée
  assert.equal(feed.portalSelection(items).list.length, 0)
  assert.throws(() => feed.markItem('b', 'pin', 'a@b', { known: () => true }), /NOT_PUBLISHED/)
  assert.throws(() => feed.publishItem(items[0], { title: items[0].title, summary: 'ملخص معاد صياغته بالكامل بكلمات أخرى ومختلفة عن النص', confirm: true }, 'a@b'), /TITLE_LENGTH/)
  const rew = (n) => ({ title: `صياغة جديدة رقم ${n} للخبر`, summary: `نص ملخص كتبه المحرر بنفسه للنشر العام، رقم ${n}، دون نسخ المصدر الأصلي.`, confirm: true })
  feed.publishItem(items[0], rew(1), 'a@b')
  feed.publishItem(items[1], rew(2), 'c@d')
  feed.markItem('b', 'pin', 'a@b', { known: (id) => items.some((x) => x.id === id) })
  assert.throws(() => feed.markItem('zz', 'exclude', 'a@b', { known: () => false }), /NOT_FOUND/)
  const sel = feed.portalSelection(items)
  const page = portalNews(items, {}, sel)
  assert.deepEqual(page.items.map((x) => [x.id, x.pinned]), [['b', true], ['a', false]])
  // Texte publié (réécrit), lien vers la source ; pas de vignette d'un message X
  assert.equal(page.items[1].title, 'صياغة جديدة رقم 1 للخبر')
  assert.equal(page.items[1].url, 'https://x.test/a')
  assert.equal(page.items[1].image, 'https://img.test/a.jpg')
  assert.equal(page.items[0].image, '')
  assert.equal(page.items[0].transcription, undefined)
  assert.equal(portalNews(items, { type: 'tv' }, sel).total, 0)
  assert.equal(portalNews(items, { q: 'صياغة جديدة رقم 2' }, sel).total, 1)
  assert.equal(feed.portalSite().title, 'أخبار المركز')

  feed.markItem('a', 'exclude', 'a@b')
  assert.deepEqual(feed.portalSelection(items).list.map((x) => x.id), ['b'])
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'portal-feed.json'), 'utf8'))
  assert.ok(saved.excluded.a && saved.pins.b && saved.published.b && !saved.published.a)
  assert.equal(saved.history[0].what, 'exclude a')
  feed.unpublishItem('b', 'a@b')
  assert.equal(feed.portalSelection(items).list.length, 0)
  // Journal des publications : chaque geste, le plus récent d'abord, aussi dans le fichier
  const log = feed.publicationLog()
  assert.deepEqual(log.slice(0, 5).map((r) => r.action), ['unpublish', 'exclude', 'pin', 'publish', 'publish'])
  assert.equal(log[3].by, 'c@d')
  assert.ok(fs.readFileSync(path.join(dir, 'portal-publications.jsonl'), 'utf8').includes('"unpublish"'))

  const pv = feed.preview(items, { status: 'excluded' })
  assert.deepEqual(pv.items.map((x) => x.id), ['a'])
  assert.equal(pv.stats.shown, 0)
  feed.resetConfig('a@b')
  assert.equal(feed.portalSite().title, '')
})
