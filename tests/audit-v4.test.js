import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Corrections de l'audit produit v4 (30/10/2026) : node --test tests/*.test.js */

const NOW = Date.parse('2026-10-30T12:00:00Z')
const H = 3_600_000

test('IA : moteur sans réutilisation des données, clé Gemini gratuite signalée', async () => {
  const keep = { ...process.env }
  for (const k of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'MMS_GEMINI_TIER', 'MMS_AI_PROVIDER', 'MMS_AI_ECONOMY_PROVIDER', 'MMS_LLM_BASE_URL', 'MMS_VERTEX_PROJECT', 'VERTEX_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'MMS_AI_ALLOW_FREE']) delete process.env[k]
  try {
    const ai = await import('../server/ai.js')
    assert.equal(ai.aiProvider(), '')
    assert.ok(ai.aiStatus().warnings.includes('NO_ENGINE'))
    // Clé Gemini seule, non déclarée payante : utilisée faute de mieux, mais signalée
    process.env.GEMINI_API_KEY = 'x'
    assert.equal(ai.aiProvider(), 'gemini')
    assert.equal(ai.noReuse('gemini'), false)
    assert.deepEqual(ai.aiStatus().warnings, ['GEMINI_TIER_UNKNOWN'])
    // Avec Claude : Claude pour tout, Gemini gratuit n'est plus pris pour les tâches de fond
    process.env.ANTHROPIC_API_KEY = 'y'
    assert.equal(ai.aiProvider(), 'claude')
    assert.equal(ai.economyProvider(), 'claude')
    assert.deepEqual(ai.aiStatus().warnings, [])
    // Clé Gemini déclarée payante : moteur économique ; modèle local prioritaire pour les tâches de fond
    process.env.MMS_GEMINI_TIER = 'paid'
    assert.equal(ai.economyProvider(), 'gemini')
    process.env.MMS_LLM_BASE_URL = 'http://127.0.0.1:11434/v1'
    assert.equal(ai.economyProvider(), 'local')
    assert.equal(ai.aiProvider(), 'claude')
    process.env.MMS_AI_PROVIDER = 'local'
    assert.equal(ai.aiProvider(), 'local')
    // Vertex AI : projet + compte de service
    process.env.MMS_VERTEX_PROJECT = 'p'
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/x.json'
    assert.equal(ai.engineConfigured('vertex'), true)
    assert.equal(ai.noReuse('vertex'), true)
  } finally {
    process.env = keep
  }
})

test("journal d'audit : catégories, chaîne d'empreintes, filtres", async () => {
  const at = await import('../server/auditTrail.js')
  assert.equal(at.categoryOf('POST', '/api/auth/login'), 'login')
  assert.equal(at.categoryOf('POST', '/api/recordings'), 'recording')
  assert.equal(at.categoryOf('POST', '/api/portal-feed/publish/x'), 'portal')
  assert.equal(at.categoryOf('PATCH', '/api/watches/a'), 'watch')
  assert.equal(at.categoryOf('GET', '/api/news/export.csv'), 'export')
  assert.equal(at.categoryOf('PUT', '/api/superadmin/users/a@b'), 'users')
  assert.equal(at.categoryOf('GET', '/api/news'), '', 'les lectures ne sont pas inscrites')
  assert.equal(at.categoryOf('POST', '/api/platform/activity'), '', 'battements de présence ignorés')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-audit-'))
  at.initAuditTrail(dir)
  at.recordAudit({ actor: 'a@b.ly', category: 'login', action: 'login_ok', ip: '::ffff:1.2.3.4' })
  at.recordAudit({ actor: 'c@d.ly', category: 'portal', action: 'POST portal-feed/publish/x', target: 'x' })
  at.recordAudit({ actor: 'a@b.ly', category: 'recording', action: 'POST recordings', status: 201 })
  assert.equal(at.verifyAudit(), -1)
  assert.deepEqual(at.auditQuery({ actor: 'a@b' }).map((r) => r.category), ['recording', 'login'])
  assert.equal(at.auditQuery({ category: 'portal' })[0].target, 'x')
  assert.equal(at.auditQuery({})[2].ip, '1.2.3.4')
  // Relu depuis le fichier, la chaîne reste valable ; un faux ajout la casse
  at.initAuditTrail(dir)
  assert.equal(at.auditSummary().intact, true)
  const file = path.join(dir, 'audit-trail.jsonl')
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
  const forged = JSON.parse(lines[1])
  forged.actor = 'pirate'
  lines[1] = JSON.stringify(forged)
  fs.writeFileSync(file, lines.join('\n') + '\n')
  at.initAuditTrail(dir)
  assert.equal(at.auditSummary().intact, false)
})

test('compte partagé : désactivé seulement si un admin nominatif connecté existe, jamais supprimé', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-acc-'))
  const auth = await import('../server/auth.js')
  auth.initAuth(dir)
  const { initAuditTrail } = await import('../server/auditTrail.js')
  initAuditTrail(dir)
  const pol = await import('../server/accountPolicy.js')
  pol._setMigFile(path.join(dir, 'migrations.json'))
  const users = [
    { email: 'aroundexpressions@gmail.com', role: 'analyst', salt: 's', hash: 'h' },
    { email: 'belgacem.ounissi@aroundexpressions.com', username: 'belgacem', role: 'admin', salt: 's', hash: 'h' },
  ]
  auth.writeUsers(users)
  // Double authentification pas encore activée (enrôlement commencé seulement) : on ne touche à rien
  auth.writeUsers([users[0], { ...users[1], totpPending: { secret: 'P' } }])
  assert.deepEqual(pol.nominativeAdmin(auth.readUsers()), { ok: false, reason: 'NOMINATIVE_NO_2FA', email: 'belgacem.ounissi@aroundexpressions.com' })
  let r = pol.applySharedAccountPolicy()
  assert.equal(r.done, false)
  assert.equal(auth.readUsers()[0].disabled, undefined)
  // N'importe quel administrateur nominatif avec la double authentification active suffit (pas seulement « belgacem »)
  auth.writeUsers([users[0], users[1], { email: 'operateur@aroundexpressions.com', role: 'admin', salt: 's', hash: 'h', totp: { secret: 'S' } }])
  assert.equal(pol.nominativeAdmin(auth.readUsers()).email, 'operateur@aroundexpressions.com')
  r = pol.applySharedAccountPolicy()
  assert.deepEqual(r.disabled, ['aroundexpressions@gmail.com'])
  const after = auth.readUsers()
  assert.equal(after.length, 3)
  assert.equal(after[0].disabled, true)
  assert.match(after[0].disabledReason, /Réactivable/)
  // Réactivé par le Super Admin : la règle ne revient pas
  auth.writeUsers([{ ...after[0], disabled: false }, after[1], after[2]])
  assert.equal(pol.applySharedAccountPolicy().already, true)
  assert.equal(auth.readUsers()[0].disabled, false)
})

test('revue de presse : un même fait repris par plusieurs médias une seule fois', async () => {
  const { dedupeStories } = await import('../server/radar.js')
  const it = (id, title, origin, extra = {}) => ({ id, title, summary: '', origin, channel: 'site', media: 'article', date: '2026-10-30T08:00:00Z', url: `https://${origin}.test/${id}`, ...extra })
  const items = [
    it('a', 'رئيس الوزراء اليوناني ميتسوتاكيس يبحث مع المنفي ملف الهجرة والحدود البحرية', 'وال', { importance: 2 }),
    it('b', 'ميتسوتاكيس يبحث مع المنفي ملف الهجرة والحدود البحرية في أثينا', 'الوسط'),
    it('c', 'Libyan Express: Brega oil company resumes exports from the port terminal', 'Libyan Express'),
    it('d', 'Libyan Express: Brega oil company resumes exports from the port terminal', 'Libyan Express', { url: 'https://libyan-express.test/c?utm_source=x' }),
    it('e', 'مباراة الأهلي والاتحاد في الدوري الليبي الممتاز', 'قناة'),
  ]
  const out = dedupeStories(items)
  assert.deepEqual(out.map((x) => x.id), ['a', 'c', 'e'])
  assert.deepEqual(out[0].also.map((x) => x.origin), ['الوسط'])
  assert.equal(out[1].dupes, 1)
})

test('sujets émergents : jours de la semaine écartés, un sujet une seule fois', async () => {
  const { emergingTopics } = await import('../server/radar.js')
  let n = 0
  const mk = (hoursAgo, title, extra = {}) => ({ id: `e${++n}`, title, summary: '', origin: `s${n % 5}`, channel: 'site', date: new Date(NOW - hoursAgo * H).toISOString(), ...extra })
  const items = []
  for (let k = 0; k < 6; k++) items.push(mk(2 + k, `مسعد بولس يلتقي وفداً يوم الخميس في طرابلس ${k}`, { people: ['مسعد بولس'] }))
  for (let k = 0; k < 5; k++) items.push(mk(3 + k, `السودان : تطورات جديدة على الحدود الخميس ${k}`, { places: ['السودان'] }))
  const topics = emergingTopics(items, { now: NOW })
  const labels = topics.map((t) => t.label)
  assert.ok(!labels.some((l) => /الخميس|خميس/.test(l)), 'pas de jour de la semaine')
  assert.equal(labels.filter((l) => /بولس/.test(l)).length, 1, 'مسعد بولس une seule fois')
  assert.equal(labels.filter((l) => /السودان/.test(l)).length, 1, 'السودان une seule fois')
})

test("histoires : un message court n'attire pas des centaines de fiches", async () => {
  const { storyIndex } = await import('../server/radar.js')
  const items = []
  // 300 fiches qui parlent toutes de « ليبيا » et « طرابلس » mais d'événements différents
  for (let k = 0; k < 300; k++)
    items.push({ id: `p${k}`, title: `ليبيا طرابلس حدث رقم${k} موضوع${k} تفصيل${k}`, summary: '', origin: `o${k % 9}`, channel: 'site', date: new Date(NOW - (k % 100) * H).toISOString() })
  items.push({ id: 'tweet', title: 'ليبيا طرابلس', summary: '', origin: 'u', channel: 'x', date: new Date(NOW - H).toISOString() })
  const idx = storyIndex(items, { now: NOW })
  const sizes = new Map()
  for (const story of idx.values()) sizes.set(story, (sizes.get(story) || 0) + 1)
  assert.ok(Math.max(0, ...sizes.values()) < 10, 'pas de regroupement géant')
  assert.equal(idx.has('tweet'), false)
})

test('activité inhabituelle : un média n’est pas un acteur', async () => {
  const { findSpikes } = await import('../server/intel.js')
  const items = []
  for (let k = 0; k < 8; k++) items.push({ id: `l${k}`, origin: 'Libyan Express', category: 'politique', orgs: ['Libyan Express'], people: ['عبد الحميد الدبيبة'], date: new Date(NOW - (k + 1) * H).toISOString() })
  const spikes = findSpikes(items, NOW)
  assert.equal(spikes.some((s) => s.name === 'Libyan Express'), false)
  assert.ok(spikes.some((s) => s.name === 'عبد الحميد الدبيبة'))
})

test('rapport exécutif : au plus 2 articles marquants par source', async () => {
  const { buildBriefing } = await import('../server/insights.js')
  const now = Date.now()
  const items = []
  const T = ['افتتاح مستشفى جديد في سبها', 'انقطاع الكهرباء عن أحياء بنغازي', 'ارتفاع أسعار الخبز في مصراتة', 'اجتماع اللجنة العسكرية المشتركة في سرت', 'تخريج دفعة من الشرطة في الزاوية', 'وصول شحنة أدوية إلى غدامس']
  for (let k = 0; k < 6; k++) items.push({ id: `x${k}`, title: T[k], summary: '', origin: 'المصدر الأول', channel: 'site', media: 'article', importance: 3, date: new Date(now - (k + 1) * H).toISOString(), url: `https://a.test/${k}` })
  items.push({ id: 'y', title: 'خبر من مصدر آخر عن الاقتصاد الليبي والنفط', summary: '', origin: 'المصدر الثاني', channel: 'site', media: 'article', importance: 1, date: new Date(now - H).toISOString(), url: 'https://b.test/y' })
  const b = buildBriefing(items, 7)
  const per = {}
  for (const it of b.top) per[it.origin] = (per[it.origin] || 0) + 1
  assert.equal(per['المصدر الأول'], 2)
  assert.equal(per['المصدر الثاني'], 1)
})

test('sources : forums Reddit en liste blanche, religion et divertissement écartés', async () => {
  const { excludedBySource } = await import('../server/sourcePolicy.js')
  const x = (origin, channel, title = '') => excludedBySource({ origin, channel, title, media: channel === 'reddit' ? 'forum' : 'social' })
  assert.equal(x('r/PredictionCodesMarket', 'reddit'), true)
  assert.equal(x('r/TrueChristianPolitics', 'reddit'), true)
  assert.equal(x('r/libya', 'reddit'), false)
  assert.equal(x('AwqafLibya', 'telegram'), true)
  assert.equal(x('Belal Elsanhoury', 'youtube'), true)
  assert.equal(x('قناة ليبيا الأحرار', 'youtube', 'نشرة الأخبار الرئيسية'), false)
  assert.equal(x('قناة ليبيا الأحرار', 'youtube', 'تلاوة خاشعة'), true)
})

test("erreurs : jamais le message brut d'un outil pour les non-administrateurs", async () => {
  const { publicError, redactErrors, isAdminReq } = await import('../server/redact.js')
  assert.equal(publicError('STREAM_DOWN|3|ERROR: [youtube] xyz: Sign in to confirm you’re not a bot. https://github.com/yt-dlp/yt-dlp/wiki'), 'YOUTUBE_BLOCKED')
  assert.equal(publicError('STREAM_DOWN|3|ffmpeg code 1'), 'STREAM_DOWN|3')
  assert.equal(publicError('capture : RuntimeError: ffmpeg code 8'), 'TECHNICAL')
  assert.equal(publicError('HTTP Error 404: Not Found'), 'STREAM_DOWN')
  const [r] = redactErrors([{ id: 'a', erreur: 'yt-dlp: ERROR https://github.com/yt-dlp/yt-dlp/issues' }])
  assert.equal(/github|yt-dlp/.test(r.erreur), false)
  assert.equal(isAdminReq({ user: { role: 'viewer' }, perms: { actions: [] } }), false)
  assert.equal(isAdminReq({ user: { role: 'admin' } }), true)
})

test('conservation : audio des fiches alertées gardé, entrées de plus de 90 jours retirées', async () => {
  const { computeRetention } = await import('../server/retention.js')
  const byId = new Map([
    ['a', { id: 'a', audioWindow: 'wasat-radio/2026-10-30_0800' }],
    ['b', { id: 'b' }],
  ])
  const out = computeRetention({
    watches: [{ matches: [{ id: 'a', date: '2026-10-30T08:10:00Z' }, { id: 'b', date: '2026-10-30T08:10:00Z' }] }],
    byId,
    rasdHits: { rec123: { w1: { count: 2 } } },
    now: NOW,
    previous: { fenetres: { 'old/2026-01-01_0800': '2026-01-01T08:00:00Z' }, enregistrements: {} },
  })
  assert.deepEqual(Object.keys(out.fenetres), ['wasat-radio/2026-10-30_0800'])
  assert.deepEqual(Object.keys(out.enregistrements), ['rec123'])
})

test('journalistes et médias libyens : signatures, médias, citations', async () => {
  const { directoryList, directoryEntry } = await import('../server/journalists.js')
  const items = [
    { id: '1', title: 'مقال أول', summary: '', origin: 'بوابة الوسط', url: 'https://alwasat.ly/news/1', channel: 'site', media: 'article', author: 'سالم الفيتوري', date: '2026-10-20T08:00:00Z' },
    { id: '2', title: 'مقال ثان', summary: '', origin: 'بوابة الوسط', url: 'https://alwasat.ly/news/2', channel: 'site', media: 'article', author: 'سالم الفيتوري', date: '2026-10-25T08:00:00Z' },
    { id: '3', title: 'نقلاً عن سالم الفيتوري', summary: '', origin: 'Reuters', url: 'https://reuters.com/x', channel: 'site', media: 'article', date: '2026-10-26T08:00:00Z' },
    { id: '4', title: 'تغريدة', summary: '', origin: 'u', channel: 'x', media: 'social', author: 'حساب', date: '2026-10-26T08:00:00Z' },
  ]
  const j = directoryList(items, { kind: 'journalist' })
  assert.deepEqual(j.rows.map((r) => [r.name, r.count, r.libyan]), [['سالم الفيتوري', 2, true]])
  const m = directoryList(items, { kind: 'media' })
  assert.deepEqual(m.rows.map((r) => r.name), ['بوابة الوسط'])
  const e = directoryEntry(items, 'journalist', 'سالم الفيتوري', NOW)
  assert.equal(e.publishedTotal, 2)
  assert.equal(e.citationsTotal, 1)
  assert.deepEqual(e.citedBy, ['Reuters'])
})

test('billets de blog : auteur déduit du lien quand le flux ne le donne pas', async () => {
  const { authorFromUrl } = await import('../server/store.js')
  assert.equal(authorFromUrl('https://medium.com/@ali.ben-salem/titre-123', 'blog'), 'Ali Ben Salem')
  assert.equal(authorFromUrl('https://libyaanalysis.substack.com/p/x', 'blog'), 'Libyaanalysis')
  assert.equal(authorFromUrl('https://medium.com/@x/y', 'article'), '')
})

test('budget de transcription réglable : coût de la cible de 24 h par jour', async () => {
  const rec = await import('../server/recordings.js')
  assert.equal(rec.dailyCostFor(24), 4.32)
  assert.equal(rec.TARGET_HOURS, 24)
})

test('revue validée par un analyste : heure limite de livraison le lendemain', async () => {
  const rv = await import('../server/reviewValidation.js')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-rv-'))
  rv.initReviewValidation(dir)
  // Revue du 29/10 due le 30/10 à 08:00 (Tripoli, UTC+2)
  assert.equal(rv.dueAt('2026-10-29'), '2026-10-30T06:00:00.000Z')
  assert.equal(rv.reviewStatus('2026-10-29', Date.parse('2026-10-30T05:00:00Z')).status, 'pending')
  assert.equal(rv.reviewStatus('2026-10-29', Date.parse('2026-10-30T07:00:00Z')).status, 'overdue')
  assert.equal(rv.validateReview('2026-10-29', 'w.farhat@npdc.gov.ly', {}, new Date('2026-10-30T05:30:00Z')).status, 'validated_on_time')
  assert.equal(rv.validateReview('2026-10-28', 'w.farhat@npdc.gov.ly', {}, new Date('2026-10-30T05:30:00Z')).status, 'validated_late')
  assert.throws(() => rv.setDeadline('25:00'), /BAD_DEADLINE/)
  rv.setDeadline('09:30')
  assert.equal(rv.dueAt('2026-10-29'), '2026-10-30T07:30:00.000Z')
})

test('IA : la facturation Gemini confirmée par le Super Admin vaut déclaration payante', async () => {
  const ai = await import('../server/ai.js')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-ai-'))
  const keep = { ...process.env }
  try {
    for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'MMS_GEMINI_TIER', 'MMS_AI_PROVIDER', 'MMS_AI_ECONOMY_PROVIDER', 'MMS_LLM_BASE_URL', 'MMS_VERTEX_PROJECT', 'VERTEX_API_KEY']) delete process.env[k]
    process.env.GEMINI_API_KEY = 'x'
    ai.initUsage(dir)
    assert.equal(ai.geminiTier(), 'unknown')
    ai.setGeminiPaid(true, 'superadmin')
    assert.equal(ai.geminiTier(), 'paid')
    assert.deepEqual(ai.aiStatus().warnings, [])
    ai.initUsage(dir)
    assert.equal(ai.geminiTier(), 'paid', 'gardé après redémarrage')
    ai.setGeminiPaid(false, 'superadmin')
    assert.equal(ai.geminiTier(), 'unknown')
  } finally {
    process.env = keep
  }
})

test("journal d'audit : l'étape du code à 6 chiffres porte le compte", async () => {
  const at = await import('../server/auditTrail.js')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-mfa-'))
  at.initAuditTrail(dir)
  const { EventEmitter } = await import('node:events')
  const run = (req) => {
    const res = Object.assign(new EventEmitter(), { statusCode: 200 })
    at.auditMiddleware(req, res, () => {})
    return res
  }
  // Étape 1 : mot de passe correct, code demandé ; étape 2 : code (sans identifiant dans la requête)
  const r1 = { method: 'POST', path: '/api/auth/login', body: { login: 'a@b.ly' }, ip: '1.1.1.1' }
  const res1 = run(r1)
  r1.auditActor = 'a@b.ly'
  r1.auditAction = 'mfa_asked'
  res1.emit('finish')
  const r2 = { method: 'POST', path: '/api/auth/mfa', body: { ticket: 't', code: '123456' }, ip: '1.1.1.1' }
  const res2 = run(r2)
  r2.auditActor = 'a@b.ly'
  res2.emit('finish')
  assert.deepEqual(at.auditQuery({}).map((r) => [r.actor, r.action]), [['a@b.ly', 'login_ok'], ['a@b.ly', 'mfa_asked']])
})

test('YouTube : chaînes d’information gardées, vlogs et chaînes religieuses écartés (noms relevés en production)', async () => {
  const sp = await import('../server/sourcePolicy.js')
  const x = (origin) => sp.excludedBySource({ origin, channel: 'youtube', title: 'نشرة' })
  for (const ok of ['Libya Al-Ahrar', 'قناة ليبيا الحدث - Libya Alhadath TV', 'فرانس 24 / FRANCE 24 Arabic', 'AlArabiya العربية', 'أثر الإخبارية - Athar News']) assert.equal(x(ok), false, ok)
  for (const ko of ['Naya Quran TV', 'Jason Veiga', 'Guns For Hire Podcast', 'Béton & Capital', 'History From Orbit']) assert.equal(x(ko), true, ko)
})

test('sujets émergents : variantes d’un même fait fusionnées (« وزراء اليونان » / « الوزراء اليوناني »)', async () => {
  const { emergingTopics } = await import('../server/radar.js')
  let n = 0
  const mk = (hoursAgo, title, extra = {}) => ({ id: `g${++n}`, title, summary: '', origin: `s${n % 6}`, channel: 'site', date: new Date(NOW - hoursAgo * H).toISOString(), ...extra })
  const items = []
  for (let k = 0; k < 4; k++) items.push(mk(2 + k, `رئيس الوزراء اليوناني يرفض الاتفاق البحري مع تركيا ${k}`))
  for (let k = 0; k < 4; k++) items.push(mk(3 + k, `وزراء اليونان يناقشون الاتفاق البحري الليبي ${k}`))
  for (let k = 0; k < 4; k++) items.push(mk(2 + k, `محفظة ليبيا أفريقيا للاستثمار تعلن نتائجها في طرابلس ${k}`))
  for (let k = 0; k < 3; k++) items.push(mk(3 + k, `الاستثمار في طرابلس : المحفظة والاستثماري الجديد ${k}`))
  const labels = emergingTopics(items, { now: NOW }).map((t) => t.label)
  assert.ok(labels.filter((l) => /يونان/.test(l)).length <= 1, labels.join(' | '))
  assert.ok(labels.filter((l) => /استثمار/.test(l)).length <= 1, labels.join(' | '))
})

test('alertes intelligentes : une seule alerte par sujet (titres relevés en production le 30/10)', async () => {
  const { dedupeAlerts } = await import('../server/radar.js')
  const a = (kind, label) => ({ kind, label, level: 2, detail: {} })
  const out = dedupeAlerts([
    a('negative', 'تركيا'),
    a('spike', 'كيرياكوس ميتسوتاكيس'),
    a('emerging', 'وزراء اليونان'),
    a('story', 'رئيس وزراء اليونان يصف الاتفاق البحري الليبي التركي بغير القانوني'),
    a('story', 'ميتسوتاكيس: الاتفاق البحري الليبي التركي الذي أقره مجلس النواب غير قانوني'),
    a('story', 'ميتسوتاكيس: الاتفاق البحري الليبي التركي باطل وندعو طرابلس للتفاوض المباشر'),
    a('story', 'عمومية «لايكو» تعتمد هيكلًا تنظيميًا معدلًا وتصادق على قوائم 2014-2020'),
  ])
  assert.deepEqual(out.map((x) => x.kind), ['negative', 'spike', 'story', 'story'])
  assert.equal(out[2].detail.related, 3)
})
