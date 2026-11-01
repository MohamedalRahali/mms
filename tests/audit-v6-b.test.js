import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Corrections de l'audit produit v6 (31/10/2026), partie B : node --test tests/*.test.js */

const DAY = 86_400_000
const HOUR = 3_600_000
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p))
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

test('alertes (constat 1a) : mots-clés personnels sur le serveur, chaque compte ne voit que les siens', async () => {
  const aw = await import('../server/alertWords.js')
  const dir = tmp('mms-v6aw-')
  aw.initAlertWords(dir)
  assert.deepEqual(aw.wordsOf('a@npdc.gov.ly'), { words: [], known: false, updatedAt: null, migratedAt: null })
  aw.setWords('A@npdc.gov.ly', ['النفط', '  الدبيبة  ', 'النفط', ''])
  aw.setWords('b@npdc.gov.ly', ['الأمن'])
  // Adresse insensible à la casse ; doublons et vides retirés ; isolation entre comptes
  assert.deepEqual(aw.wordsOf('a@npdc.gov.ly').words, ['النفط', 'الدبيبة'])
  assert.deepEqual(aw.wordsOf('b@npdc.gov.ly').words, ['الأمن'])
  // Persistance : relu depuis data/alert-words.json
  aw.initAlertWords(dir)
  assert.deepEqual(aw.wordsOf('a@npdc.gov.ly').words, ['النفط', 'الدبيبة'])
  // Validation
  assert.throws(() => aw.setWords('a@npdc.gov.ly', 'النفط'), /BAD_WORDS/)
  assert.throws(() => aw.setWords('a@npdc.gov.ly', [42]), /BAD_WORDS/)
  assert.throws(() => aw.setWords('a@npdc.gov.ly', ['x'.repeat(aw.MAX_WORD_LEN + 1)]), /WORD_TOO_LONG/)
  assert.throws(() => aw.setWords('a@npdc.gov.ly', Array.from({ length: aw.MAX_WORDS + 1 }, (_, k) => `w${k}`)), /TOO_MANY_WORDS/)
  assert.throws(() => aw.setWords('', ['x']), /NO_USER/)
})

test('alertes (constat 1a) : migration du navigateur une seule fois, sans écraser une liste existante ; route liée à la session', async () => {
  const aw = await import('../server/alertWords.js')
  aw.initAlertWords(tmp('mms-v6mig-'))
  const first = aw.setWords('c@npdc.gov.ly', ['حقل الشرارة'], { migrate: true })
  assert.equal(first.migrated, true)
  assert.ok(first.migratedAt)
  // Deuxième migration (autre poste, ancien navigateur) : rien n'est remplacé
  const again = aw.setWords('c@npdc.gov.ly', ['autre'], { migrate: true })
  assert.equal(again.migrated, false)
  assert.deepEqual(aw.wordsOf('c@npdc.gov.ly').words, ['حقل الشرارة'])
  // Routes : le compte vient de la session, jamais d'un paramètre
  const routes = {}
  aw.mountAlertWords({ get: (p, h) => (routes[`GET ${p}`] = h), put: (p, _m, h) => (routes[`PUT ${p}`] = h) })
  const res = () => ({ code: 200, body: null, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } })
  const r1 = res()
  routes['GET /api/alert-words']({ user: { email: 'd@npdc.gov.ly' }, query: { email: 'c@npdc.gov.ly' } }, r1)
  assert.deepEqual(r1.body.words, [])
  const r2 = res()
  routes['PUT /api/alert-words']({ user: { email: 'd@npdc.gov.ly' }, body: { words: 'pas une liste' } }, r2)
  assert.equal(r2.code, 400)
  // Module « التنبيهات » exigé
  const { denialOf } = await import('../server/permissions.js')
  assert.equal(denialOf({ modules: ['news'], actions: [] }, 'GET', '/alert-words'), 'module:alerts')
  assert.equal(denialOf({ modules: ['alerts'], actions: [] }, 'PUT', '/alert-words'), '')
  // Interface : plus « محفوظة في هذا المتصفح », le libellé dit « محفوظة في حسابك »
  const i18n = read('src/lib/i18n.ts')
  assert.match(i18n, /محفوظة في حسابك/)
  assert.doesNotMatch(i18n, /alertsIntro:[^\n]*هذا المتصفح/)
  assert.match(read('src/lib/prefs.ts'), /\/api\/alert-words/)
})

test('veilles de départ (constat 1b) : créées une fois, sauvegarde, destinataires approuvés seulement, marquées audit-v6', async () => {
  const dir = tmp('mms-v6seed-')
  const old = { id: 'h1', name: 'متابعة الحكومة', rules: ['مجلس الوزراء OR وزارة OR وزير OR حكومة OR الحكومة'], themes: [], scope: [], flux: '', from: '2026-10-01', to: null, recipients: [], enabled: false, createdAt: '2026-10-01T00:00:00Z', matches: [], notified: [], matchCount: 0 }
  fs.writeFileSync(path.join(dir, 'watches.json'), JSON.stringify({ watches: [old] }))
  fs.writeFileSync(path.join(dir, 'watches-reparation-v5.json'), '{}')
  const mp = await import('../server/mailPolicy.js')
  mp.initMailPolicy(dir)
  const w = await import('../server/watches.js')
  w.startWatches(dir)
  const r = w.seedWatchesV6({ recipients: ['w.farhat@npdc.gov.ly', 'pirate@gmail.com', 'pas-une-adresse'] })
  // La veille « gouvernement » désactivée par un humain est équivalente : ni recréée ni réactivée, signalée
  assert.deepEqual(r.existing.map((e) => [e.key, e.existing.id, e.existing.enabled]), [['government', 'h1', false]])
  assert.deepEqual(r.created.map((c) => c.key), ['oil', 'security', 'pm_office', 'central_bank'])
  assert.ok(fs.existsSync(path.join(dir, 'watches.avant-audit-v6.json')))
  const list = w.listWatches()
  assert.equal(list.find((x) => x.id === 'h1').enabled, false)
  const seeded = list.filter((x) => x.seed === 'audit-v6')
  assert.equal(seeded.length, 4)
  for (const s of seeded) {
    // Destinataires : seulement ceux du rapport exécutif dans un domaine autorisé ; aucune adresse externe ajoutée
    assert.deepEqual(s.recipients, ['w.farhat@npdc.gov.ly'])
    assert.equal(s.to, null)
    assert.equal(s.flux, 'libye')
    assert.equal(s.enabled, true)
    assert.ok(s.notifyAfter)
  }
  const oil = seeded.find((s) => s.name === 'النفط')
  assert.ok(oil.rules.join(' ').includes('المؤسسة الوطنية للنفط') && oil.rules.join(' ').includes('الشرارة'))
  // Idempotente : deuxième démarrage, rien de plus
  assert.equal(w.seedWatchesV6({ recipients: ['w.farhat@npdc.gov.ly'] }), null)
  w.startWatches(dir)
  assert.equal(w.listWatches().filter((x) => x.seed === 'audit-v6').length, 4)
  // Même sans le fichier repère, une veille déjà semée n'est jamais recréée
  fs.unlinkSync(path.join(dir, 'watches-seed-v6.json'))
  const again = w.seedWatchesV6({ recipients: [] })
  assert.equal(again.created.length, 0)
  assert.equal(w.listWatches().filter((x) => x.seed === 'audit-v6').length, 4)
})

test('veilles de départ (constat 1b) : sans destinataire approuvé, créées quand même et signalées ; veille supprimée équivalente non recréée', async () => {
  const dir = tmp('mms-v6seed2-')
  fs.writeFileSync(path.join(dir, 'watches-reparation-v5.json'), '{}')
  delete process.env.TELEGRAM_BOT_TOKEN
  delete process.env.TELEGRAM_CHAT_ID
  const w = await import('../server/watches.js')
  w.startWatches(dir)
  const human = w.createWatch({ name: 'الأمن', rules: ['اشتباكات OR اغتيال'] }, 'analyste@npdc.gov.ly')
  assert.equal(w.deleteWatch(human.id, 'analyste@npdc.gov.ly'), true)
  const r = w.seedWatchesV6({ recipients: [] })
  assert.deepEqual(r.existing.map((e) => [e.key, e.existing.deleted]), [['security', true]])
  assert.equal(r.created.length, 4)
  assert.ok(r.created.every((c) => c.noRecipients))
  assert.ok(w.listWatches().filter((x) => x.seed === 'audit-v6').every((x) => x.noRecipients))
})

test('veilles (complément v6) : suppression réversible — archivée, masquée, restaurable désactivée', async () => {
  const dir = tmp('mms-v6del-')
  fs.writeFileSync(path.join(dir, 'watches-reparation-v5.json'), '{}')
  const w = await import('../server/watches.js')
  w.startWatches(dir)
  const a = w.createWatch({ name: 'نفط', rules: ['النفط AND ليبيا'] }, 'x@npdc.gov.ly')
  assert.equal(w.deleteWatch(a.id, 'x@npdc.gov.ly'), true)
  assert.equal(w.deleteWatch(a.id, 'x@npdc.gov.ly'), false)
  assert.equal(w.listWatches().length, 0)
  assert.equal(w.watchesFor({ email: 'x@npdc.gov.ly', role: 'admin' }).length, 0)
  assert.throws(() => w.guardWatch(a.id, { email: 'x@npdc.gov.ly', role: 'admin' }), /NO_WATCH/)
  // Rien n'est effacé : toujours dans watches.json, et copie complète dans watches-supprimees.json
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'watches.json'), 'utf8')).watches
  assert.equal(saved.length, 1)
  assert.equal(saved[0].deleted, true)
  assert.equal(saved[0].deletedBy, 'x@npdc.gov.ly')
  const archive = JSON.parse(fs.readFileSync(path.join(dir, 'watches-supprimees.json'), 'utf8')).watches
  assert.equal(archive[0].id, a.id)
  assert.deepEqual(w.deletedWatches().map((x) => [x.id, x.deletedBy]), [[a.id, 'x@npdc.gov.ly']])
  const back = w.restoreWatch(a.id, 'admin@npdc.gov.ly')
  assert.equal(back.enabled, false)
  assert.equal(w.listWatches().length, 1)
  assert.equal(w.deletedWatches().length, 0)
  assert.equal(w.restoreWatch(a.id), null)
  // Routes admin
  const idx = read('server/index.js')
  assert.match(idx, /app\.get\('\/api\/watches\/deleted'/)
  assert.match(idx, /app\.post\('\/api\/watches\/:id\/restore'/)
  assert.match(idx, /deleteWatch\(req\.params\.id, req\.user\?\.email\)/)
})

test('veilles (constat 1b) : essai à blanc sans envoi ni marquage ; deuxième passage réel sans doublon', async () => {
  const dir = tmp('mms-v6dry-')
  fs.writeFileSync(path.join(dir, 'watches-reparation-v5.json'), '{}')
  process.env.TELEGRAM_BOT_TOKEN = 'test'
  process.env.TELEGRAM_CHAT_ID = '1'
  const sent = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    sent.push(JSON.parse(opts.body).text)
    return { ok: true, status: 200 }
  }
  try {
    const w = await import('../server/watches.js')
    w.startWatches(dir)
    const watch = w.createWatch({ name: 'نفط ليبيا', rules: ['النفط'], alert: { channels: ['telegram'] } }, 'x@npdc.gov.ly')
    const now = Date.now()
    const items = [
      { id: 'i1', flux: 'libye', title: 'استئناف إنتاج النفط في حقل الشرارة', summary: '', origin: 'الوسط', date: new Date(now - HOUR).toISOString() },
      { id: 'i2', flux: 'libye', title: 'النفط الليبي: صادرات أكتوبر', summary: '', origin: 'ليبيا الأحرار', date: new Date(now - 2 * HOUR).toISOString() },
      { id: 'i3', flux: 'libye', title: 'مباراة كرة القدم', summary: '', origin: 'الوسط', date: new Date(now - HOUR).toISOString() },
    ]
    const dry = w.dryRunWatch(watch.id, items, now)
    assert.equal(dry.wouldSend, 2)
    assert.equal(dry.matching24h, 2)
    assert.deepEqual(dry.channels, ['telegram'])
    assert.equal(sent.length, 0)
    // Rien de marqué : un deuxième essai donne le même résultat
    assert.equal(w.dryRunWatch(watch.id, items, now).wouldSend, 2)
    assert.equal(w.listWatches().find((x) => x.id === watch.id).notifiedCount, 0)
    await w.runWatches({ items, now })
    assert.equal(sent.length, 1)
    await w.runWatches({ items, now: now + 60_000 })
    assert.equal(sent.length, 1, 'aucun doublon au deuxième passage')
    const after = w.dryRunWatch(watch.id, items, now)
    assert.equal(after.wouldSend, 0)
    assert.equal(after.reason, 'nothing_new')
    // Intervalle minimal entre deux envois : la nouvelle fiche attend
    w.setWatchAlert(watch.id, { everyMinutes: 60 })
    const more = [...items, { id: 'i4', flux: 'libye', title: 'تصدير النفط من ميناء السدرة', summary: '', origin: 'الوسط', date: new Date(now).toISOString() }]
    assert.equal(w.dryRunWatch(watch.id, more, now + 120_000).reason, 'interval')
    await w.runWatches({ items: more, now: now + 120_000 })
    assert.equal(sent.length, 1)
    await w.runWatches({ items: more, now: now + 2 * HOUR })
    assert.equal(sent.length, 2)
  } finally {
    globalThis.fetch = realFetch
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_CHAT_ID
  }
  // Route et bouton
  assert.match(read('server/index.js'), /app\.post\('\/api\/watches\/:id\/dry-run'/)
  assert.match(read('src/components/Watches.tsx'), /تجربة دون إرسال/)
})

test('compteurs (constat 2a) : le résumé IA porte sa période ; un résultat d’une autre période n’est pas affiché', () => {
  assert.match(read('server/ai.js'), /count: items\.length, days, flux/)
  const extras = read('src/components/Extras.tsx')
  assert.match(extras, /sameScope/)
  assert.match(extras, /latest\.current === query/)
})

test('compteurs (constat 2b) : jours couverts, un seul format pour la comparaison et le rapport exécutif', async () => {
  const { coveredDaysLabel, coverageNote, comparePeriods, buildBriefing } = await import('../server/insights.js')
  assert.equal(coveredDaysLabel(4.6, 7, 'ar'), '4,6 من 7 أيام')
  assert.equal(coveredDaysLabel(5, 7, 'ar'), '5 من 7 أيام')
  assert.equal(coveredDaysLabel(4.6, 7, 'en'), '4.6 of 7 days')
  assert.equal(coveredDaysLabel(12.25, 30, 'ar'), '12,3 من 30 يوماً')
  const now = Date.now()
  // Collecte commencée il y a 11,6 jours environ : la semaine précédente est partielle
  const items = []
  for (let h = 0; h < 11.6 * 24; h += 2) items.push({ id: `n${h}`, title: `خبر ${h}`, summary: '', origin: `مصدر ${h % 5}`, date: new Date(now - h * HOUR).toISOString(), category: 'politique', tone: 'neutral' })
  const cmp = comparePeriods(items, 7)
  const b = buildBriefing(items, 7)
  assert.ok(cmp.coverage.partial)
  assert.deepEqual(cmp.coverage.label, b.coverage.label)
  assert.equal(coverageNote(cmp.coverage, 'ar'), b.coverageNote.ar)
  assert.ok(b.coverageNote.ar.includes(cmp.coverage.label.ar))
  // Plus d'arrondi à l'entier côté écran (« 5 sur 7 ») ni de « X يوم من 7 » côté rapport
  assert.doesNotMatch(read('src/components/Pro.tsx'), /Math\.round\(data\.coverage\.previous\)/)
  assert.doesNotMatch(read('server/briefing.js'), /Math\.round\(coverage\.previous\)/)
})

test('compteurs (constat 2c) : « أخرى » réduit (mots plus riches, pliage alef/ta marbuta), prudence gardée, périmètre affiché', async () => {
  const { inferCategory } = await import('../server/classify.js')
  assert.equal(inferCategory('autre', 'انقطاع الكهرباء وطرح الأحمال في طرابلس', ''), 'énergie')
  assert.equal(inferCategory('autre', 'وزير الخارجية يلتقي السفير الإيطالي لبحث التعاون', ''), 'politique')
  assert.equal(inferCategory('autre', 'سعر صرف الدولار في السوق الموازية', ''), 'économie')
  assert.equal(inferCategory('autre', 'المجلس البلدي يناقش صيانة الطرق والصرف الصحي', ''), 'société')
  assert.equal(inferCategory('autre', 'اطلاق نار في مصراتة والقبض على مسلحين', ''), 'sécurité')
  // Sans indice sûr : reste « autre » (« محادثات » ne doit pas compter comme « حادث »)
  assert.equal(inferCategory('autre', 'محادثات بين الوفدين اليوم', ''), 'autre')
  assert.equal(inferCategory('autre', 'صورة جميلة من المدينة', ''), 'autre')
  // Même classification partout (portail et analyse : fineCategory) ; périmètre des comptes indiqué
  const { portalNews } = await import('../server/portal.js')
  const out = portalNews([{ id: 'p1', title: 't', summary: '', origin: 's', date: '2026-10-20T08:00:00Z', category: 'autre' }, { id: 'p2', title: 't', summary: '', origin: 's', date: '2026-10-30T08:00:00Z', category: 'politique' }], {}, { list: [{ id: 'p1', title: 't', summary: '', origin: 's', date: '2026-10-20T08:00:00Z', category: 'autre' }, { id: 'p2', title: 't', summary: '', origin: 's', date: '2026-10-30T08:00:00Z', category: 'politique' }], pinned: new Set() })
  assert.deepEqual(out.facets.scope, { total: 2, from: '2026-10-20T08:00:00Z', to: '2026-10-30T08:00:00Z' })
  assert.match(read('src/portal/Portal.tsx'), /الأعداد على كل الأخبار المنشورة/)
})

test('enregistrements (constat 2d) : échecs anciens ou remplacés rangés à part, rien supprimé', async () => {
  const { markPastFailures } = await import('../server/recordings.js')
  const now = Date.parse('2026-10-31T12:00:00Z')
  const rows = [
    { id: 'a', chaine: 'wasat', etat: 'echoue', debut: '2026-10-28T08:00:00Z', fin: '2026-10-28T09:00:00Z' },
    { id: 'b', chaine: '218', etat: 'echoue', debut: '2026-10-31T08:00:00Z', fin: '2026-10-31T09:00:00Z' },
    { id: 'c', chaine: '218', etat: 'termine', debut: '2026-10-31T10:00:00Z', fin: '2026-10-31T11:00:00Z' },
    { id: 'd', chaine: 'ahrar', etat: 'echoue', debut: '2026-10-31T08:00:00Z', fin: '2026-10-31T09:00:00Z' },
    { id: 'e', chaine: 'wasat', etat: 'termine', debut: '2026-10-25T08:00:00Z', fin: '2026-10-25T09:00:00Z' },
  ]
  const out = markPastFailures(rows, now)
  assert.equal(out.length, 5)
  assert.deepEqual(out.filter((r) => r.pastFailure).map((r) => [r.id, r.pastFailure]), [['a', 'old'], ['b', 'replaced']])
  assert.equal(out.find((r) => r.id === 'd').pastFailure, undefined)
  assert.match(read('src/components/Recordings.tsx'), /إخفاقات سابقة/)
})

test('journalistes (constat 3) : fragments et institutions écartés, vrais noms gardés, 2 signatures et média identifié', async () => {
  const { nameRejection, directory, directoryList } = await import('../server/journalists.js')
  for (const n of ['شؤون المرور والترخيص بمديرية', 'السجل المدني حي الأندلس', 'النائب العام', 'إلى إقرار البرلمان في', 'وزارة الداخلية الليبية', 'Ministry of Interior', 'Libya Observer Office']) assert.notEqual(nameRejection(n), '', n)
  for (const n of ['محمد الصادق', 'Sami Zaptia', 'عبد الرحمن البكوش', 'وليد بالحاج', 'سالم الفيتوري']) assert.equal(nameRejection(n), '', n)
  assert.equal(nameRejection('إلى إقرار البرلمان في'), 'fragment')
  const sig = (id, author, origin = 'بوابة الوسط') => ({ id, title: 'مقال', summary: '', origin, url: `https://alwasat.ly/${id}`, channel: 'site', media: 'article', author, date: '2026-10-30T08:00:00Z', category: 'politique' })
  const items = [
    sig('1', 'محمد الصادق'),
    sig('2', 'محمد الصادق'),
    sig('3', 'Sami Zaptia', 'Libya Herald'),
    sig('4', 'Sami Zaptia', 'Libya Herald'),
    sig('5', 'عبد الرحمن البكوش'),
    sig('6', 'عبد الرحمن البكوش'),
    sig('7', 'شؤون المرور والترخيص بمديرية'),
    sig('8', 'شؤون المرور والترخيص بمديرية'),
    sig('9', 'السجل المدني حي الأندلس'),
    sig('10', 'النائب العام'),
    sig('11', 'إلى إقرار البرلمان في'),
    // Une seule signature : écartée
    sig('12', 'خالد المحمودي'),
  ]
  const d = directory(items, Date.parse('2026-10-31T00:00:00Z'))
  assert.deepEqual(d.journalists.map((j) => j.name).sort(), ['Sami Zaptia', 'عبد الرحمن البكوش', 'محمد الصادق'].sort())
  assert.equal(d.excluded.length, 5)
  assert.equal(d.excluded.find((x) => x.name === 'خالد المحمودي').reason, 'signatures')
  // Compteur pour tous, liste avec la raison pour l'administrateur seulement
  const viewer = directoryList(items, { kind: 'journalist', libyan: '0' })
  assert.equal(viewer.counts.excluded, 5)
  assert.equal(viewer.excluded, undefined)
  const admin = directoryList(items, { kind: 'journalist', libyan: '0' }, { admin: true })
  assert.equal(admin.excluded.length, 5)
  assert.ok(admin.excluded.every((x) => x.reason))
})

test('fiabilité (constat 4a) : plateformes ouvertes plafonnées à « متوسطة » ou « حساب »', async () => {
  const sm = await import('../server/sourceMeta.js')
  sm.initSourceMeta(tmp('mms-v6rel-'))
  assert.equal(sm.reliabilityOf({ origin: 'Medium · Libya', url: 'https://medium.com/libya/a-1', channel: 'site' }), 'medium')
  assert.equal(sm.reliabilityOf({ origin: 'Libya Notes', url: 'https://libyanotes.substack.com/p/x', channel: 'site' }), 'medium')
  assert.equal(sm.reliabilityOf({ origin: 'blog', url: 'https://x.blogspot.com/2026/10/a.html', channel: 'site' }), 'medium')
  assert.equal(sm.reliabilityOf({ origin: 'Ali Salem', url: 'https://bsky.app/profile/ali', channel: 'bluesky' }), 'social')
  // Même réglée « عالية » par le Super Admin, une source sur medium.com ne dépasse pas « متوسطة »
  sm.setSourceMeta('Medium · Libya', { reliability: 'high' })
  assert.equal(sm.reliabilityOf({ origin: 'Medium · Libya', url: 'https://medium.com/libya/a-1', channel: 'site' }), 'medium')
  // Agence de presse inchangée
  assert.equal(sm.reliabilityOf({ origin: 'Reuters', url: 'https://www.reuters.com/world/x', channel: 'site' }), 'high')
})

test('bruit (constat 4b) : concours du Coran écartés des sujets émergents, sujet réel gardé', async () => {
  const { emergingTopics, isReligiousNoise } = await import('../server/radar.js')
  assert.equal(isReligiousNoise('الدولية للقرآن'), true)
  assert.equal(isReligiousNoise('مصفاة الزاوية'), false)
  const now = Date.parse('2026-10-31T12:00:00Z')
  const items = []
  const src = ['الوسط', 'الأحرار', '218', 'النبأ', 'المرصد']
  for (let k = 0; k < 6; k++) {
    items.push({ id: `q${k}`, title: 'انطلاق مسابقة ليبيا الدولية للقرآن الكريم وتكريم حفظة كتاب الله', summary: 'برعاية الهيئة العامة للأوقاف', origin: src[k % 5], date: new Date(now - k * HOUR).toISOString() })
    items.push({ id: `s${k}`, title: 'توقف ضخ النفط من ميناء السدرة بعد احتجاجات', summary: '', origin: src[k % 5], date: new Date(now - k * HOUR).toISOString() })
  }
  const labels = emergingTopics(items, { now, limit: 50 }).map((t) => t.label).join(' | ')
  assert.doesNotMatch(labels, /قرآن|القرآن|حفظة|الأوقاف/)
  assert.match(labels, /السدرة|النفط/)
})

test('présence dans les réponses du modèle (constat 4c) : questions identiques regroupées par jour, non reposées dans les 24 h', async () => {
  const { groupRuns, recentRun, questionKey } = await import('../server/geo.js')
  assert.equal(questionKey('ما هي الحكومة؟'), questionKey('  ما هى الحكومه '))
  const runs = [
    { id: 'r1', at: '2026-10-27T08:00:00Z', question: 'من هو رئيس الحكومة؟' },
    { id: 'r2', at: '2026-10-27T09:00:00Z', question: 'من هو رئيس الحكومه' },
    { id: 'r3', at: '2026-10-27T10:00:00Z', question: 'من هو  رئيس الحكومة ?' },
    { id: 'r4', at: '2026-10-28T10:00:00Z', question: 'من هو رئيس الحكومة؟' },
    { id: 'r5', at: '2026-10-27T11:00:00Z', question: 'ما هو دور المصرف المركزي؟' },
  ]
  const g = groupRuns(runs)
  assert.deepEqual(g.map((r) => [r.id, r.repeat]), [['r4', 1], ['r5', 1], ['r3', 3]])
  const now = Date.parse('2026-10-28T20:00:00Z')
  assert.equal(recentRun({ id: 'qx', text: 'من هو رئيس الحكومه؟' }, runs.slice(0, 4), now)?.id, 'r4')
  assert.equal(recentRun({ id: 'qx', text: 'من هو رئيس الحكومة؟' }, runs.slice(0, 3), now), null)
  assert.match(read('src/components/GeoPresence.tsx'), /r\.repeat/)
})
