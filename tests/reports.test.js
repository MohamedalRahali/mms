import test from 'node:test'
import assert from 'node:assert/strict'
import { attachmentKind, buildDoc, cleanAi, cleanMeta, imageKind, parseRecipients, pickSelected, reportStats, safeHref, sanitizeDoc, snapshot } from '../server/reports.js'

/** Tests du générateur de rapports : node --test tests/*.test.js */

const post = (id, extra = {}) => ({
  id,
  title: `عنوان ${id} النفط`,
  summary: 'ارتفاع إنتاج النفط في الحقول الليبية',
  date: '2026-10-20T10:00:00Z',
  origin: 'بوابة الوسط',
  channel: 'site',
  media: 'article',
  lang: 'ar',
  category: 'économie',
  tone: 'neutral',
  url: `https://example.org/${id}`,
  ...extra,
})

const base = [
  post('a', { tone: 'positive', origin: 'Libya Observer', lang: 'en', date: '2026-10-18T08:00:00Z' }),
  post('b', { tone: 'negative', channel: 'x', media: 'social', engagement: { views: 100, reactions: 5 } }),
  post('c', { tone: '', category: 'politique', date: '2026-10-21T22:30:00Z' }),
  post('d'),
  post('e', { tone: 'negative', origin: 'Libya Observer' }),
]
const byId = new Map(base.map((it) => [it.id, it]))

test('sélection : seules les publications cochées, sans doublon, inconnues écartées', () => {
  const { items, missing } = pickSelected(['c', 'a', 'c', 'zzz', 'e'], byId)
  assert.deepEqual(
    items.map((it) => it.id),
    ['c', 'a', 'e'],
  )
  assert.deepEqual(missing, ['zzz'])
  assert.deepEqual(pickSelected('a', byId).items, [])
})

test('statistiques calculées sur la sélection seulement', () => {
  const { items } = pickSelected(['a', 'b', 'c'], byId)
  const s = reportStats(items.map(snapshot))
  assert.equal(s.total, 3)
  assert.deepEqual(s.tones, { positive: 1, neutral: 0, negative: 1, unknown: 1 })
  assert.deepEqual(s.sources, [
    { name: 'بوابة الوسط', count: 2 },
    { name: 'Libya Observer', count: 1 },
  ])
  assert.deepEqual(s.media, [
    { name: 'article', count: 2 },
    { name: 'social', count: 1 },
  ])
  assert.deepEqual(s.languages, [
    { name: 'ar', count: 2 },
    { name: 'en', count: 1 },
  ])
  assert.equal(s.from, '2026-10-18T08:00:00Z')
  assert.equal(s.to, '2026-10-21T22:30:00Z')
  // 22h30 UTC = 00h30 à Tripoli : le jour suit l'heure libyenne
  assert.deepEqual(
    s.days.map((d) => d.name),
    ['2026-10-18', '2026-10-20', '2026-10-22'],
  )
  assert.deepEqual(s.engagement, { posts: 1, views: 100, reactions: 5, shares: 0, comments: 0 })
  assert.ok(s.keywords.some((k) => k.name.includes('النفط') && k.count === 3))
  const sum = (rows) => rows.reduce((n, r) => n + r.count, 0)
  for (const key of ['sources', 'media', 'languages', 'topics', 'channels']) assert.equal(sum(s[key]), 3, key)
})

test('document : uniquement les publications sélectionnées, chiffres identiques aux statistiques', () => {
  const posts = pickSelected(['a', 'b'], byId).items.map(snapshot)
  const stats = reportStats(posts)
  const ai = cleanAi(
    {
      executive_summary: 'ملخص',
      sentiment_commentary: '',
      topics_commentary: '',
      sources_commentary: '',
      post_analyses: [
        { id: 'a', analysis: 'مهم' },
        { id: 'd', analysis: 'غير محدد' },
      ],
      findings: ['نتيجة'],
      recommendations: ['توصية'],
      conclusion: 'خاتمة',
    },
    posts,
  )
  assert.deepEqual(Object.keys(ai.posts), ['a'])
  const doc = buildDoc({ lang: 'ar', title: 'T', org: 'O', author: 'Me', logo: '/logo-npdc.png', posts, stats, ai, generatedAt: '2026-10-25T00:00:00Z' })
  const json = JSON.stringify(doc)
  assert.ok(json.includes('https://example.org/a') && json.includes('https://example.org/b'))
  for (const other of ['c', 'd', 'e']) assert.ok(!json.includes(`https://example.org/${other}`), other)
  assert.ok(!json.includes('غير محدد'))
  assert.ok(json.includes('عدد المنشورات المحللة: 2'))
  assert.equal(doc.content[0].type, 'image')
  // Le document généré passe tel quel le nettoyage de l'enregistrement
  assert.deepEqual(sanitizeDoc(doc), doc)
})

test('document sans IA : sections signalées, aucune interprétation inventée', () => {
  const posts = [snapshot(base[0])]
  const doc = buildDoc({ lang: 'en', title: '', org: '', author: 'Me', logo: '', posts, stats: reportStats(posts), ai: null, generatedAt: '2026-10-25T00:00:00Z' })
  const json = JSON.stringify(doc)
  assert.ok(json.includes('AI analysis was not available'))
  assert.ok(json.includes('Posts analysed: 1'))
})

test('nettoyage : liens javascript, images externes et nœuds inconnus retirés', () => {
  const dirty = {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { textAlign: 'right', onclick: 'x' }, content: [{ type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }, { type: 'bold' }] }] },
      { type: 'image', attrs: { src: 'https://evil.example/x.png' } },
      { type: 'image', attrs: { src: 'data:image/svg+xml;base64,PHN2Zz4=' } },
      { type: 'script', content: [{ type: 'text', text: 'x' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'b', marks: [{ type: 'textStyle', attrs: { color: 'red;background:url(x)', fontSize: '14px' } }] }] },
      { type: 'heading', attrs: { level: 9 }, content: [{ type: 'text', text: 'h' }] },
    ],
  }
  assert.deepEqual(sanitizeDoc(dirty), {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { textAlign: 'right' }, content: [{ type: 'text', text: 'a', marks: [{ type: 'bold' }] }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'b', marks: [{ type: 'textStyle', attrs: { fontSize: '14px' } }] }] },
      { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'h' }] },
    ],
  })
  assert.equal(sanitizeDoc({ type: 'paragraph' }), null)
  assert.equal(safeHref('https://ok.example/a'), 'https://ok.example/a')
  assert.equal(safeHref('data:text/html,x'), null)
  assert.equal(cleanMeta({ logo: 'https://evil.example/x.png' }).logo, '')
})

test('fichiers : logo, pièces jointes et destinataires vérifiés', () => {
  assert.equal(imageKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'png')
  assert.equal(imageKind(Buffer.from('<svg onload=alert(1)>')), '')
  assert.equal(attachmentKind(Buffer.from('%PDF-1.7 ...'), 'pdf'), 'pdf')
  assert.equal(attachmentKind(Buffer.from('<html>'), 'pdf'), '')
  assert.equal(attachmentKind(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]), 'docx'), 'docx')
  assert.deepEqual(parseRecipients('a@x.ly, B@x.ly; a@x.ly'), ['a@x.ly', 'b@x.ly'])
  assert.equal(parseRecipients('pas-une-adresse'), null)
  assert.equal(parseRecipients(''), null)
})
