import test from 'node:test'
import assert from 'node:assert/strict'
import { airtime, broadcastPool, bySegment, clipOf, highlightTerms, matchPassages, passagesOf, segmentStart } from '../server/broadcast.js'

/** Broadcasts — البث : passages horodatés, recherche, temps d'antenne. node --test tests/*.test.js */

const NOW = Date.parse('2026-10-27T20:00:00Z')
const sentence = (w, n) => `${Array.from({ length: n }, () => w).join(' ')}.`
const TEXT = [sentence('أخبار', 30), sentence('الحكومة', 30), 'أعلن رئيس الحكومة الدبيبة عن خطة جديدة للكهرباء.', sentence('طقس', 60)].join(' ')

const item = (id, extra = {}) => ({
  id,
  title: `t${id}`,
  summary: '',
  origin: 'ليبيا الأحرار',
  channel: 'tv',
  subType: 'tv',
  media: 'broadcast',
  category: 'politique',
  date: '2026-10-27T18:23:00Z',
  transcription: TEXT,
  people: ['الدبيبة'],
  ...extra,
})

test('début de tranche : arrondi aux 10 minutes', () => {
  assert.equal(segmentStart('2026-10-27T18:23:41Z'), '2026-10-27T18:20:00.000Z')
})

test('passages : regroupés, décalage estimé à 130 mots par minute, heure croissante', () => {
  const p = passagesOf(TEXT, '2026-10-27T18:20:00.000Z')
  assert.equal(p.length, 2) // 62 mots puis 69 mots : deux passages
  assert.equal(p[0].offset, 0)
  assert.ok(p.every((x, k) => k === 0 || x.offset > p[k - 1].offset))
  assert.equal(p[1].at, new Date(Date.parse('2026-10-27T18:20:00Z') + p[1].offset * 1000).toISOString())
  assert.deepEqual(passagesOf('', '2026-10-27T18:20:00Z'), [])
})

test('termes à surligner : expressions, mots, sans opérateurs ni exclusions', () => {
  assert.deepEqual(highlightTerms('"خطة جديدة" AND (الدبيبة OR Dbeibah) NOT طقس'), ['خطة جديدة', 'الدبيبة', 'Dbeibah'])
  assert.deepEqual(highlightTerms(''), [])
})

test('passages trouvés : comparaison sans hamza ni diacritiques', () => {
  const p = passagesOf(TEXT, '2026-10-27T18:20:00Z')
  const hits = matchPassages(p, ['اعلن'])
  assert.equal(hits.length, 1)
  assert.match(hits[0].text, /أعلن/)
  const clip = clipOf(item('a'), ['الدبيبة'])
  assert.equal(clip.hits, 1)
  assert.equal(clip.start, '2026-10-27T18:20:00.000Z')
  assert.equal(clip.passages.filter((x) => x.hit).length, 1)
})

test('filtres : diffusion seulement, période, chaîne, type, requête dans la transcription', () => {
  const items = [item('a'), item('b', { media: 'article' }), item('c', { date: '2026-10-01T10:00:00Z' }), item('d', { origin: 'الوطنية', subType: 'radio' })]
  assert.deepEqual(broadcastPool(items, { days: '7' }, NOW).map((x) => x.id), ['a', 'd'])
  assert.deepEqual(broadcastPool(items, { days: '7', sub: 'radio' }, NOW).map((x) => x.id), ['d'])
  assert.deepEqual(broadcastPool(items, { days: '7', channel: 'ليبيا الأحرار' }, NOW).map((x) => x.id), ['a'])
  assert.deepEqual(broadcastPool(items, { days: '7', q: 'الكهرباء' }, NOW).length, 2)
  assert.deepEqual(broadcastPool(items, { days: '7', q: 'غير موجود' }, NOW).length, 0)
})

test('extraits : une carte par tranche, avec ses actualités', () => {
  const items = [item('a'), item('b', { date: '2026-10-27T18:21:00Z' }), item('x', { transcription: 'نص آخر' })]
  const groups = bySegment(items)
  assert.equal(groups.length, 2)
  const clip = clipOf(groups[0][0], [], groups[0])
  assert.deepEqual(clip.news.map((n) => n.id), ['b', 'a'])
  assert.equal(clip.start, '2026-10-27T18:20:00.000Z')
})

test("temps d'antenne : une tranche comptée une fois et partagée entre ses actualités", () => {
  const items = [item('a'), item('b', { category: 'économie', people: [] }), item('x', { origin: 'الوطنية', transcription: 'قصير جدا' })]
  const r = airtime(items)
  assert.equal(r.segments, 2)
  const words = TEXT.split(/\s+/).length
  const seg = Math.min(10, words / 130)
  const ch = r.channels.find((c) => c.name === 'ليبيا الأحرار')
  assert.ok(Math.abs(ch.minutes - Math.round(seg * 10) / 10) < 0.11)
  assert.equal(ch.count, 2)
  const pol = r.topics.find((t) => t.name === 'politique')
  assert.ok(Math.abs(pol.minutes - Math.round((seg / 2) * 10) / 10) < 0.11)
  assert.equal(r.people[0].name, 'الدبيبة')
})
