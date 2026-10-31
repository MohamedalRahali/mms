import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Corrections de l'audit produit v5 (31/10/2026) : node --test tests/*.test.js */

const DAY = 86_400_000
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p))

test('IA (constat 1) : fournisseur, offre, conservation, région et conditions officielles par usage', async () => {
  const { aiDisclosure, aiBadge, aiDisclosureMarkdown, vertexRegion } = await import('../server/aiDisclosure.js')
  const status = { main: 'claude', economy: 'gemini', engines: [{ id: 'gemini', noReuse: true }] }
  const d = aiDisclosure('ar', status)
  assert.deepEqual(d.rows.map((r) => r.use), ['main', 'economy', 'veilleSort', 'veilleAudio'])
  const main = d.rows[0]
  assert.equal(main.vendor, 'Anthropic PBC')
  assert.ok(main.terms.some((t) => t.url.startsWith('https://www.anthropic.com/legal/commercial-terms')))
  assert.match(main.retention, /30/)
  assert.ok(d.rows.every((r) => r.region && r.offer && r.retention))
  assert.equal(aiBadge('en', status).product, 'Claude — Anthropic API')
  // Clé Gemini vue gratuite : signalée, sans clause de non-réutilisation
  const free = aiDisclosure('en', { main: 'gemini', economy: 'gemini', engines: [{ id: 'gemini', noReuse: false }] })
  assert.equal(free.rows[0].warning, true)
  assert.equal(free.rows[0].noReuse, '')
  assert.match(vertexRegion('europe-west8').en, /Milan/)
  assert.match(vertexRegion('me-central2').en, /Dammam/)
  assert.match(aiDisclosureMarkdown('en', status), /ai\.google\.dev\/gemini-api\/terms/)
  // Aucune certification affirmée
  assert.doesNotMatch(JSON.stringify(d), /ISO ?27001|SOC ?2|certifi[ée]/i)
})

test('compte partagé (constat 2) : lecture seule dès qu’un autre admin existe, compte nominatif créé sans mot de passe, activation à usage unique', async () => {
  const dir = tmp('mms-v5acc-')
  const auth = await import('../server/auth.js')
  auth.initAuth(dir)
  const at = await import('../server/auditTrail.js')
  at.initAuditTrail(dir)
  const pol = await import('../server/accountPolicy.js')
  pol._setMigFile(path.join(dir, 'migrations.json'))
  auth.writeUsers([
    { email: 'aroundexpressions@gmail.com', role: 'admin', salt: 's', hash: 'h' },
    { email: 'w.farhat@npdc.gov.ly', role: 'viewer', salt: 's', hash: 'h' },
  ])
  // Pas d'autre administrateur : rien ne change (personne n'est verrouillé dehors)
  assert.equal(pol.sharedReadOnly('aroundexpressions@gmail.com'), false)
  const seeded = pol.seedNominativeAdmin()
  assert.equal(seeded.created, 'belgacem.ounissi@aroundexpressions.com')
  assert.ok(fs.existsSync(path.join(dir, 'users-avant-nominative-admin-v5.json')))
  assert.equal(pol.seedNominativeAdmin().already, true)
  const b = auth.readUsers().find((u) => u.email === 'belgacem.ounissi@aroundexpressions.com')
  assert.equal(b.role, 'admin')
  assert.equal(b.pendingActivation, true)
  assert.equal(JSON.stringify(b).includes('password'), false)
  // Compte partagé en lecture seule ; le client n'est pas concerné
  assert.equal(pol.sharedReadOnly('aroundexpressions@gmail.com'), true)
  assert.equal(pol.sharedReadOnly('w.farhat@npdc.gov.ly'), false)
  const res = { code: 0, body: null, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }
  let passed = false
  pol.sharedGate({ method: 'POST', path: '/recordings', user: { email: 'aroundexpressions@gmail.com', role: 'admin' }, ip: '1.2.3.4' }, res, () => (passed = true))
  assert.equal(passed, false)
  assert.equal(res.body.error, 'SHARED_READONLY')
  pol.sharedGate({ method: 'GET', path: '/news', user: { email: 'aroundexpressions@gmail.com', role: 'admin' }, ip: '1.2.3.4' }, res, () => (passed = true))
  assert.equal(passed, true)
  // Usage signalé dans le journal (lignes marquées « shared »)
  assert.ok(at.auditQuery({ category: 'shared' }).length >= 1)
  assert.ok(at.sharedUsage().count >= 1)
  // Activation : lien à usage unique, mot de passe de 10 caractères au moins
  const { token } = pol.issueActivation('belgacem.ounissi@aroundexpressions.com', 'sa')
  assert.throws(() => pol.activateAccount(token, 'court'), /TOO_SHORT/)
  assert.equal(pol.activateAccount(token, 'un-mot-de-passe-long').email, 'belgacem.ounissi@aroundexpressions.com')
  assert.throws(() => pol.activateAccount(token, 'un-mot-de-passe-long'), /BAD_TOKEN/)
  const after = auth.readUsers().find((u) => u.email === 'belgacem.ounissi@aroundexpressions.com')
  assert.equal(after.pendingActivation, undefined)
  assert.equal(after.activation, undefined)
  // Rien n'est supprimé
  assert.equal(auth.readUsers().length, 3)
})

test('comparaison de périodes (constat 4, non-régression) : collecte quasi nulle avant le 18/10, pas de +73 % ni de ×16', async () => {
  const { comparePeriods, fairChange, coverageNote, buildBriefing } = await import('../server/insights.js')
  const now = Date.now()
  const items = []
  const add = (daysAgo, n, extra = {}) => {
    for (let k = 0; k < n; k++) items.push({ id: `${daysAgo}-${k}-${items.length}`, title: `t${items.length}`, date: new Date(now - daysAgo * DAY + 3600_000).toISOString(), origin: `s${k % 7}`, channel: 'site', category: 'politique', ...extra })
  }
  // Collecte : 2 à 15 fiches par jour avant (montée en charge / reprise clairsemée), puis 800 par jour depuis 10 jours
  for (let d = 30; d >= 11; d--) add(d, d > 13 ? 2 : 15)
  for (let d = 10; d >= 0; d--) add(d, 800)
  // « Algérie » : 1 fiche avant, 30 dans la période
  add(12, 1, { places: ['الجزائر'], category: 'international' })
  for (let d = 0; d < 6; d++) add(d, 5, { places: ['الجزائر'], category: 'international' })
  const cmp = comparePeriods(items, 14)
  assert.equal(cmp.coverage.partial, true)
  assert.ok(cmp.coverage.previous < 4, `jours couverts de la période précédente : ${cmp.coverage.previous}`)
  // La note est toujours là, dans la page comme dans le rapport exécutif
  assert.match(coverageNote(cmp.coverage, 'fr'), /لا تغطي/)
  const b = buildBriefing(items, 14)
  assert.match(b.coverageNote.ar, /لا تغطي إلا/)
  assert.match(b.coverageNote.en, /only covers/)
  // Pas de multiplicateur sur une base faible
  assert.equal(fairChange(30, 1, { days: 7, current: 7, previous: 7, partial: false }), 'new')
  assert.equal(fairChange(300, 12, { days: 7, current: 7, previous: 7, partial: false }), 'new')
  assert.equal(fairChange(120, 100, { days: 7, current: 7, previous: 7, partial: false }), 20)
  // Thème « دولي » découpé de la même façon que l'analyse
  assert.ok(cmp.categories.every((c) => c.name !== 'international'))
})

test('date de couverture complète (constat 10) : distincte des données partielles', async () => {
  const { historyOf } = await import('../server/radar.js')
  const now = Date.parse('2026-10-31T12:00:00Z')
  const at = (d, n) => Array.from({ length: n }, (_, k) => ({ date: `${d}T10:00:00Z`, id: `${d}${k}` }))
  const items = [...at('2026-10-01', 8), ...at('2026-10-10', 12)]
  for (let d = 18; d <= 30; d++) items.push(...at(`2026-10-${d}`, 900))
  const h = historyOf(items, now)
  assert.equal(h.since, '2026-10-18')
  assert.equal(h.partialSince, '2026-10-01')
})

test('classification commune (constat 8) : mêmes thèmes partout', async () => {
  const { categoryKey, fineCategory, categoryCounts } = await import('../server/classify.js')
  assert.equal(categoryKey({}), 'autre')
  assert.equal(fineCategory({ category: 'international', intl: 'maghreb' }), 'international.maghreb')
  assert.equal(fineCategory({ category: 'international' }), 'international.other')
  assert.deepEqual(categoryCounts([{ category: 'international', intl: 'europe' }, { category: '' }]).map((r) => r.name).sort(), ['autre', 'international.europe'])
})

test('revue de presse (constat 5) : médias et réseaux séparés, comptes anonymes exclus, fiabilité discriminante', async () => {
  const { initSourceMeta, reliabilityOf, anonymousHandle } = await import('../server/sourceMeta.js')
  initSourceMeta(tmp('mms-v5rel-'))
  const { splitReview } = await import('../server/review.js')
  assert.equal(anonymousHandle('@__Ghost__007_'), true)
  assert.equal(anonymousHandle('@Muratti39803483'), true)
  assert.equal(anonymousHandle('Mohamed Ali'), false)
  const items = [
    { id: '1', origin: 'العربي الجديد', channel: 'site', url: 'https://www.alaraby.co.uk/x', date: '2026-10-30T08:00:00Z' },
    { id: '2', origin: 'NewsFire.gr', channel: 'site', url: 'https://newsfire.gr/x', date: '2026-10-30T09:00:00Z' },
    { id: '3', origin: '@__Ghost__007_', channel: 'x', date: '2026-10-30T09:00:00Z' },
    { id: '4', origin: '@Muratti39803483', channel: 'x', date: '2026-10-30T09:00:00Z' },
    { id: '5', origin: 'Mohamed Ali', channel: 'x', date: '2026-10-30T09:00:00Z' },
    { id: '6', origin: 'وكالة', channel: 'site', url: 'https://lana.ly/a', date: '2026-10-30T10:00:00Z' },
  ]
  const levels = new Set(items.map(reliabilityOf))
  assert.ok(levels.size >= 4, 'au moins 4 niveaux distincts')
  const r = splitReview(items)
  assert.equal(r.excluded, 2)
  assert.deepEqual(r.social.map((x) => x.id), ['5'])
  // Agence d'abord, puis média établi, puis média en ligne
  assert.deepEqual(r.media.map((x) => x.id), ['6', '1', '2'])
})

test('veilles programmées (constat 6) : journée unique rendue glissante, doublons désactivés (jamais supprimés), sans destinataire signalé', async () => {
  const dir = tmp('mms-v5w-')
  const w = (id, name, from, to, extra = {}) => ({ id, name, rules: ['ليبيا AND النفط'], themes: [], scope: [], flux: '', from, to, recipients: [], enabled: true, createdAt: `2026-10-25T0${id}:00:00Z`, matches: [], notified: [], matchCount: 0, ...extra })
  fs.writeFileSync(
    path.join(dir, 'watches.json'),
    JSON.stringify({ watches: [w('1', 'نفط', '2026-10-25', '2026-10-25'), w('2', 'نفط', '2026-10-25', '2026-10-25'), w('3', 'أمن', '2026-10-20', '2026-12-31', { rules: ['أمن'] })] }),
  )
  const watches = await import('../server/watches.js')
  watches.startWatches(dir)
  const list = watches.listWatches()
  assert.equal(list.length, 3)
  const [a, b, c] = list
  assert.equal(a.to, null)
  assert.equal(a.previousTo, '2026-10-25')
  assert.equal(a.status, 'active')
  assert.equal(b.enabled, false)
  assert.equal(b.duplicateOf, '1')
  assert.equal(c.to, '2026-12-31')
  assert.equal(a.noRecipients, true)
  assert.ok(fs.existsSync(path.join(dir, 'watches.avant-audit-v5.json')))
  // Doublon refusé même avec une autre date de fin
  assert.throws(() => watches.createWatch({ name: 'نفط', rules: ['ليبيا AND النفط'], to: '2026-12-01' }, 'x@npdc.gov.ly'), /DUPLICATE/)
  // Destinataires npdc.gov.ly toujours permis
  const mp = await import('../server/mailPolicy.js')
  mp.initMailPolicy(dir)
  mp.setMailPolicy({ domains: ['aroundexpressions.com'] })
  assert.equal(mp.allowedRecipient('w.farhat@npdc.gov.ly'), true)
})

test('détails techniques (constat 7) : budget en heures, aucun montant en dollars pour le client', async () => {
  const { hoursOnly } = await import('../server/redact.js')
  const h = hoursOnly({ known: true, hours: 6, total: 4.32, remaining: 1.08, cap: 1.1, maxTotal: 15, target: { hours: 24 } })
  assert.equal(h.totalHours, 24)
  assert.equal(h.remainingHours, 6)
  assert.equal(JSON.stringify(h).includes('4.32'), false)
})

test('bruit (constat 8) : courses hippiques et publicités de laboratoire écartées, actualité santé gardée', async () => {
  const { noiseItem } = await import('../server/sourcePolicy.js')
  assert.equal(noiseItem({ title: 'نتائج سباق الخيل في ميدان طرابلس' }), 'racing')
  assert.equal(noiseItem({ title: 'مختبر النور للتحاليل الطبية: خصم 30% اتصلوا 0912345678' }), 'ad')
  assert.equal(noiseItem({ title: 'وزارة الصحة تفتتح مختبراً مركزياً للتحاليل في بنغازي' }), '')
  assert.equal(noiseItem({ title: 'رهان الحكومة على الحوار الوطني' }), '')
})

test('sujets émergents et entités (constat 8) : fragments écartés, médias jamais acteurs', async () => {
  const { isFragment } = await import('../server/radar.js')
  assert.equal(isFragment('a b', 'الوزراء اليوناني'), true)
  assert.equal(isFragment('a b', 'مصفاة الزاوية'), false)
  const { looksLikeMedia, resolveEntities } = await import('../server/entities.js')
  assert.equal(looksLikeMedia('ليبيان إكسبريس'), true)
  assert.equal(looksLikeMedia('عبد الحميد الدبيبة'), false)
  const r = resolveEntities({ people: [], orgs: ['ليبيان إكسبريس', 'المؤسسة الوطنية للنفط'], places: [] })
  assert.equal(r.orgs.includes('ليبيان إكسبريس'), false)
})

test('présence dans les réponses du modèle (constat 8) : même question dans l’heure non reposée', async () => {
  const { recentRun } = await import('../server/geo.js')
  const now = Date.now()
  const runs = [{ questionId: 'q1', question: 'من هو  رئيس الحكومة؟', at: new Date(now - 30_000).toISOString() }]
  assert.ok(recentRun({ id: 'q2', text: 'من هو رئيس الحكومة؟' }, runs, now))
  assert.equal(recentRun({ id: 'q3', text: 'سؤال آخر' }, runs, now), null)
  assert.equal(recentRun({ id: 'q1', text: 'x' }, [{ ...runs[0], at: new Date(now - 2 * 3600_000).toISOString() }], now), null)
})

test('journalistes (constat 11) : noms complets seulement, signature tirée du texte', async () => {
  const { plausibleName, bylineOf, directory } = await import('../server/journalists.js')
  assert.equal(plausibleName('aw'), false)
  assert.equal(plausibleName('hanan'), false)
  assert.equal(plausibleName('Hanan Saleh'), true)
  assert.equal(plausibleName('فريق التحرير'), false)
  assert.equal(bylineOf({ summary: 'بقلم: عبد الله الكبير — طرابلس' }), 'عبد الله الكبير')
  const d = directory([
    { id: '1', origin: 'X', author: 'aw', date: '2026-10-30', channel: 'site', category: 'politique' },
    { id: '2', origin: 'X', author: 'Hanan Saleh', date: '2026-10-30', channel: 'site', category: 'politique' },
  ])
  assert.deepEqual(d.journalists.map((j) => j.name), ['Hanan Saleh'])
  assert.equal(d.journalists[0].themes[0].name, 'politique')
})

test('portail (constat 13) : validateurs désignés, adresse publique', async () => {
  const pf = await import('../server/portalFeed.js')
  pf.initPortalFeed(tmp('mms-v5pf-'))
  assert.equal(pf.mayValidate('n@npdc.gov.ly'), true)
  pf.setValidators(['V@npdc.gov.ly', 'pas-une-adresse'], 'admin@npdc.gov.ly')
  assert.deepEqual(pf.portalValidators(), ['v@npdc.gov.ly'])
  assert.equal(pf.mayValidate('n@npdc.gov.ly'), false)
  assert.throws(() => pf.publishItem({ id: 'a', title: 't' }, {}, 'n@npdc.gov.ly'), /NOT_VALIDATOR/)
  assert.match(pf.publicPortalUrl(), /\/portal$/)
})

test('audiovisuel (constat 3) : « يعمل » seulement si la source produit des extraits, extraits/24 h par source', async () => {
  const { capturePart } = await import('../server/media.js')
  const now = Date.now()
  const rows = capturePart(
    [
      { id: 'a', name: 'راديو أ', sub: 'radio', state: 'ok' },
      { id: 'b', name: 'راديو ب', sub: 'radio', state: 'ok' },
      { id: 'c', name: 'قناة ج', sub: 'tv', state: 'ok', extracts24: 4 },
    ],
    [],
    '',
    [{ origin: 'راديو أ', media: 'broadcast', date: new Date(now - 3600_000).toISOString() }],
    now,
  )
  const by = Object.fromEntries(rows.map((r) => [r.id, r]))
  assert.equal(by.a.state, 'ok')
  assert.equal(by.a.last24, 1)
  assert.equal(by.b.state, 'silent')
  assert.equal(by.c.last24, 4)
})

test('conservation (constat 10) : extraits critiques et fiches alertées transmis à la veille', async () => {
  const { computeRetention } = await import('../server/retention.js')
  const now = Date.now()
  const it = { id: 'x', media: 'broadcast', importance: 3, audioWindow: 'radio/2026-10-30_0800', date: new Date(now - DAY).toISOString() }
  const r = computeRetention({ watches: [{ matches: [{ id: 'y', date: new Date(now).toISOString() }] }], byId: new Map([['x', it]]), now, previous: { fenetres: {}, enregistrements: {} } })
  assert.ok(r.fenetres['radio/2026-10-30_0800'])
  assert.deepEqual(r.refs, ['y'])
})
