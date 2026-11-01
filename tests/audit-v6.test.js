import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Corrections de l'audit produit v6 (31/10/2026) — comptes, IA, note de sécurité, portail : node --test tests/*.test.js */

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p))
const NAMES = /anthropic|claude|gemini|openai|chatgpt|whisper|vertex ai|google|gpt-4|haiku|sonnet/i
const STATUS = { main: 'claude', economy: 'gemini', engines: [] }

test('comptes du prestataire (constat 1) : domaines, compte partagé, actions après désactivation, rien modifié', async () => {
  const pol = await import('../server/accountPolicy.js')
  const users = [
    { email: 'aroundexpressions@gmail.com', role: 'admin', disabled: true, disabledAt: '2026-10-31T19:15:00.000Z' },
    { email: 'belgacem.ounissi@aroundexpressions.com', role: 'admin', totp: { secret: 'x' } },
    { email: 'belgacem.ounissi@atos.ai', role: 'admin' },
    { email: 'belgacem.ounissi@outlook.fr', role: 'viewer' },
    { email: 'w.farhat@npdc.gov.ly', role: 'admin' },
  ]
  const before = JSON.stringify(users)
  const rows = [
    { t: '2026-10-31T15:22:00.000Z', actor: 'aroundexpressions@gmail.com', action: 'login_ok', status: 200 },
    { t: '2026-10-31T15:59:00.000Z', actor: 'aroundexpressions@gmail.com', action: 'PUT portal-feed/config', status: 200 },
    { t: '2026-10-31T20:00:00.000Z', actor: 'aroundexpressions@gmail.com', action: 'login_disabled', status: 403 },
    { t: '2026-10-31T20:26:00.000Z', actor: 'belgacem.ounissi@aroundexpressions.com', action: 'login_ok', status: 200 },
    { t: '2026-10-30T10:00:00.000Z', actor: 'belgacem.ounissi@atos.ai', action: 'login_ok', status: 200 },
  ]
  const list = pol.providerAccounts(users, rows)
  assert.deepEqual(list.map((r) => r.email).sort(), ['aroundexpressions@gmail.com', 'belgacem.ounissi@aroundexpressions.com', 'belgacem.ounissi@atos.ai', 'belgacem.ounissi@outlook.fr'])
  const shared = list.find((r) => r.kind === 'shared')
  assert.equal(shared.email, 'aroundexpressions@gmail.com')
  // Connexion refusée après la désactivation : pas une action réussie
  assert.deepEqual(shared.afterDisabled, { count: 0, last: null })
  assert.equal(shared.lastLogin, '2026-10-31T15:22:00.000Z')
  const atos = list.find((r) => r.domain === 'atos.ai')
  assert.equal(atos.kind, 'provider')
  assert.ok(atos.sameLocal.includes('belgacem.ounissi@aroundexpressions.com'))
  // Même identifiant sur un domaine tiers : rattaché au prestataire
  assert.equal(pol.accountKind('belgacem.ounissi@outlook.fr', users).kind, 'provider')
  assert.equal(pol.accountKind('w.farhat@npdc.gov.ly', users).kind, 'client')
  // Une action réussie après la désactivation est comptée
  const leak = pol.providerAccounts(users, [...rows, { t: '2026-11-01T08:00:00.000Z', actor: 'aroundexpressions@gmail.com', action: 'GET x', status: 200 }])
  assert.equal(leak.find((r) => r.kind === 'shared').afterDisabled.count, 1)
  assert.equal(JSON.stringify(users), before, 'inventaire en lecture seule')
})

test('IA (constat 3) : fiche client neutre sans nom de fournisseur mais avec offre, non-entraînement, conservation et région', async () => {
  const { aiClientDisclosure, vertexReadiness } = await import('../server/aiDisclosure.js')
  const n = aiClientDisclosure('ar', 'neutral', STATUS)
  assert.equal(n.mode, 'neutral')
  assert.equal(NAMES.test(JSON.stringify(n)), false, 'aucun nom de fournisseur en mode neutre')
  assert.ok(n.rows.length >= 3)
  for (const r of n.rows) {
    assert.ok(r.offer && r.retention && r.region, r.use)
    assert.deepEqual(r.terms, [])
  }
  assert.match(n.rows.find((r) => r.use === 'main').retention, /30/)
  assert.match(n.rows.find((r) => r.use === 'economy').retention, /55/)
  assert.match(n.named, /اسم منتجنا وليس مزوّداً/)
  const en = aiClientDisclosure('en', 'neutral', STATUS)
  assert.equal(NAMES.test(JSON.stringify(en)), false)
  // Mode nommé (réglage Super Admin) : fournisseur réel et liens vers les conditions officielles
  const named = aiClientDisclosure('en', 'named', STATUS)
  assert.equal(named.rows.find((r) => r.use === 'main').vendor, 'Anthropic PBC')
  assert.ok(named.rows.every((r) => r.terms.every((t) => /^https:\/\//.test(t.url))))
  // Vertex AI : ce qui manque, précisément
  assert.deepEqual(vertexReadiness({}).missing, ['MMS_VERTEX_PROJECT', 'MMS_VERTEX_LOCATION (europe-west8 | me-central2)', 'GOOGLE_APPLICATION_CREDENTIALS'])
  const ok = vertexReadiness({ MMS_VERTEX_PROJECT: 'p', MMS_VERTEX_LOCATION: 'europe-west8', GOOGLE_APPLICATION_CREDENTIALS: '/opt/mms/vertex-sa.json' }, () => true)
  assert.equal(ok.ready, true)
  assert.match(vertexReadiness({ MMS_VERTEX_PROJECT: 'p', MMS_VERTEX_LOCATION: 'me-central2', GOOGLE_APPLICATION_CREDENTIALS: '/x.json' }, () => false).missing[0], /absent/)
})

test('note de sécurité (constat 11) : une source, 8 rubriques, sauvegardes en direct, neutre côté client', async () => {
  const { securityNote } = await import('../server/securityNote.js')
  for (const lang of ['ar', 'en']) {
    const n = securityNote(lang, { mode: 'neutral', backups: { count: 14, newest: 'mms-data-2026-11-01.tgz' }, status: STATUS })
    assert.equal(n.sections.length, 8)
    assert.equal(NAMES.test(n.markdown), false, `note ${lang} sans nom de fournisseur`)
    assert.match(n.markdown, /2026-11-01/)
    assert.match(n.markdown, /14/)
    assert.match(n.markdown, lang === 'ar' ? /التحقق بخطوتين/ : /Two-factor/)
    assert.match(n.markdown, /OVH/)
  }
  const named = securityNote('en', { mode: 'named', status: STATUS })
  assert.match(named.markdown, /Anthropic/)
  assert.match(named.markdown, /https:\/\/www\.anthropic\.com\/legal\/commercial-terms/)
  // Routes : fiche IA et note pour tous les comptes, réglage du mode dans la console Super Admin
  const idx = fs.readFileSync(path.join(import.meta.dirname, '..', 'server', 'index.js'), 'utf8')
  assert.match(idx, /app\.get\('\/api\/ai\/disclosure'/)
  assert.match(idx, /app\.get\('\/api\/security-note'/)
  const sa = fs.readFileSync(path.join(import.meta.dirname, '..', 'server', 'superadmin.js'), 'utf8')
  assert.match(sa, /settings\.aiDisclosure = ai/)
  assert.match(sa, /sa\.get\('\/security-note'/)
})

test('portail (constat 12) : date de lancement validée, liste de contrôle, rien publié automatiquement', async () => {
  const pf = await import('../server/portalFeed.js')
  pf.initPortalFeed(tmp('mms-v6pf-'))
  let c = pf.launchChecklist(0)
  assert.deepEqual(c.map((x) => [x.key, x.ok]), [['validators', false], ['published', false], ['date', false]])
  assert.throws(() => pf.setLaunch('31/12/2026', 'a@npdc.gov.ly'), /BAD_DATE/)
  assert.throws(() => pf.setLaunch('2026-13-45', 'a@npdc.gov.ly'), /BAD_DATE/)
  assert.equal(pf.setLaunch('2026-11-15', 'a@npdc.gov.ly').date, '2026-11-15')
  pf.setValidators(['w.farhat@npdc.gov.ly'], 'a@npdc.gov.ly')
  c = pf.launchChecklist(12)
  assert.ok(c.every((x) => x.ok))
  assert.equal(pf.feedState([]).launch.date, '2026-11-15')
  assert.equal(pf.feedState([]).published.length, 0)
  // Date effacée : retour « en attente de décision »
  assert.equal(pf.setLaunch('', 'a@npdc.gov.ly').date, '')
})

test('mur du direct (constat 4) : un flux de secours est joué quand YouTube n’a pas de direct', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'server', 'live.js'), 'utf8')
  assert.match(src, /flux_alternatifs/)
  assert.match(src, /if \(alt && yt\.live !== true\) return \{ \.\.\.base, mode: 'hls', src: alt/)
})

test('TV (constat 4) : bulletin pas encore extrait = « en attente », pas « sans extraits »', async () => {
  const { capturePart } = await import('../server/media.js')
  const ch = [
    { id: 'wataniya-tv', name: 'قناة الوطنية', sub: 'tv', state: 'ok', extracts24: 0, production: 'en_attente', nextSlot: '21:00' },
    { id: 'tanasuh-tv', name: 'قناة التناصح', sub: 'tv', state: 'ok', extracts24: 0, production: 'enregistre_sans_extrait' },
    { id: 'wasat-tv', name: 'قناة الوسط', sub: 'tv', state: 'ok', extracts24: 4, production: 'produit' },
  ]
  const r = capturePart(ch, [], 'tv', [])
  assert.equal(r.find((x) => x.id === 'wataniya-tv').state, 'waiting')
  assert.equal(r.find((x) => x.id === 'tanasuh-tv').state, 'silent')
  assert.equal(r.find((x) => x.id === 'wasat-tv').state, 'ok')
})

test('commentaires (constat 8) : un commentaire YouTube n’est pas écarté par le filtre des chaînes (sa source est son auteur)', async () => {
  const { excludedBySource } = await import('../server/sourcePolicy.js')
  const comment = { media: 'comment', channel: 'youtube', origin: 'Ahmed Ali', title: 'تحية للقناة', parent: { id: 'v1' } }
  assert.equal(excludedBySource(comment), false)
  // La vidéo d'une chaîne hors liste reste écartée, et ses commentaires avec elle (rattachement à une fiche visible)
  assert.equal(excludedBySource({ media: 'broadcast', channel: 'youtube', origin: 'Ahmed Ali', title: 'vlog' }), true)
})

test('comptes du prestataire : dernière action réussie, connexion refusée exclue', async () => {
  const pol = await import('../server/accountPolicy.js')
  const users = [{ email: 'aroundexpressions@gmail.com', role: 'admin', disabled: true, disabledAt: '2026-10-30T18:59:07.113Z' }]
  const rows = [
    { t: '2026-10-31T14:49:35.038Z', actor: 'aroundexpressions@gmail.com', action: 'PUT portal-feed/config', status: 200 },
    { t: '2026-11-01T09:00:00.000Z', actor: 'aroundexpressions@gmail.com', action: 'login_disabled', status: 403 },
  ]
  assert.equal(pol.providerAccounts(users, rows)[0].lastSuccess, '2026-10-31T14:49:35.038Z')
})
