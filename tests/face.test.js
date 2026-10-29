import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as face from '../server/face.js'

/**
 * التحقق بالوجه : tout le parcours avec un moteur de test (visages simulés par un vecteur par personne). Le vrai
 * moteur (modèles YuNet, SFace, MiniFASNet) se branche à la place sans changer ces règles.
 */

const W = 160
const H = 120
// Une « image » de test porte dans son premier octet la personne, la pose, et des drapeaux (photo, flou, 2 visages)
const PEOPLE = { alice: 1, bob: 2 }
const POSES = ['center', 'left', 'right']
function frame(person, pose, flags = {}) {
  const rgb = Buffer.alloc(W * H * 3)
  rgb[0] = PEOPLE[person] ?? 0
  rgb[1] = POSES.indexOf(pose)
  rgb[2] = (flags.photo ? 1 : 0) | (flags.blur ? 2 : 0) | (flags.two ? 4 : 0)
  return { w: W, h: H, rgb: rgb.toString('base64') }
}
const vec = (p) => Array.from({ length: 128 }, (_, k) => Math.sin((k + 1) * p * 1.7) + (k % 7) * 0.01 * p)
const fakeEngine = (ready = true) => ({
  ready: () => ready,
  info: () => ({ ready, missing: [] }),
  analyse: async (f) => {
    const [p, pose, fl] = f.rgb
    if (!p) return { faces: 0 }
    if (fl & 4) return { faces: 2 }
    return { faces: 1, quality: !(fl & 2), live: !(fl & 1), pose: POSES[pose], vector: vec(p).map((x, k) => x + ((k * 13) % 5) * 0.001) }
  },
})

const sessions = new Map()
const notices = []
const admins = []
const logs = []
let dir
const TEST_KEY = Buffer.alloc(32, 7).toString('base64')
function setup(engineReady = true, withKey = true) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'face-'))
  if (withKey) process.env.FACE_KEY = TEST_KEY
  else delete process.env.FACE_KEY
  face.setFaceEngine(fakeEngine(engineReady))
  face.initFace(dir, {
    log: (t, e, d) => logs.push([t, e, d]),
    notify: async (e, w) => notices.push([e, w]),
    notifyAdmins: async (text) => admins.push(text),
    verifyPassword: (e, p) => p === `pw-${e}`,
    verifySecondFactor: (e, c) => c === '123456',
    markSession: (t, patch) => Object.assign(sessions.get(t), patch),
    sessionOf: () => null,
  })
  face.setFacePolicy({ mode: 'on', trial: [] })
}
const login = (email, token, at = Date.now()) => {
  sessions.set(token, { email, at })
  return sessions.get(token)
}
const capture = (person, steps, flags) => steps.map((s) => frame(person, s, flags))
async function doEnroll(email, token, person, extra = {}) {
  const ch = face.newChallenge(token, email, 'enroll')
  return face.enroll({ email, token, session: sessions.get(token), body: { consent: true, nonce: ch.nonce, frames: capture(person, ch.steps, extra.flags), ...extra.body } })
}
async function doVerify(email, token, person, flags, steps) {
  const ch = face.newChallenge(token, email, 'verify')
  return face.verify({ email, token, body: { nonce: ch.nonce, frames: capture(person, steps || ch.steps, flags) } })
}

test('1-2-3. inscription (compte existant ou nouveau) puis vérification réussie, session marquée', async () => {
  setup()
  const s = login('alice@x.test', 't1')
  assert.equal(face.faceGate('alice@x.test', s, '/news'), 'FACE_REQUIRED')
  assert.equal(face.faceGate('alice@x.test', s, '/face/enroll'), '')
  assert.equal((await doEnroll('alice@x.test', 't1', 'alice')).status, 200)
  assert.ok(s.face)
  assert.equal(face.faceGate('alice@x.test', s, '/news'), '')
  assert.deepEqual(notices.at(-1), ['alice@x.test', 'enroll'])
  // 14. Nouvelle session : vérification demandée à nouveau, puis réussie
  const s2 = login('alice@x.test', 't2')
  assert.equal(face.faceGate('alice@x.test', s2, '/news'), 'FACE_REQUIRED')
  assert.equal((await doVerify('alice@x.test', 't2', 'alice')).status, 200)
  assert.equal(face.faceGate('alice@x.test', s2, '/news'), '')
})

test('4. une autre personne est refusée ; 5. image vide, deux visages, image floue refusées', async () => {
  setup()
  login('alice@x.test', 'a1')
  await doEnroll('alice@x.test', 'a1', 'alice')
  login('alice@x.test', 'a2')
  assert.equal((await doVerify('alice@x.test', 'a2', 'bob')).error, 'MISMATCH')
  assert.equal((await doVerify('alice@x.test', 'a2', 'nobody')).error, 'NO_FACE')
  assert.equal((await doVerify('alice@x.test', 'a2', 'alice', { two: true })).error, 'MULTI_FACE')
  assert.equal((await doVerify('alice@x.test', 'a2', 'alice', { blur: true })).error, 'QUALITY')
  assert.ok(!sessions.get('a2').face)
})

test('8. vivacité : photo ou écran refusés, pose hors de l’ordre demandé refusée, défi à usage unique', async () => {
  setup()
  login('alice@x.test', 'l1')
  await doEnroll('alice@x.test', 'l1', 'alice')
  login('alice@x.test', 'l2')
  assert.equal((await doVerify('alice@x.test', 'l2', 'alice', { photo: true })).error, 'LIVENESS')
  // Vidéo enregistrée : les poses ne suivent pas l'ordre tiré au hasard pour ce défi
  assert.equal((await doVerify('alice@x.test', 'l2', 'alice', {}, ['center', 'center', 'center', 'center'])).error, 'LIVENESS')
  const ch = face.newChallenge('l2', 'alice@x.test', 'verify')
  const body = { nonce: ch.nonce, frames: capture('alice', ch.steps) }
  assert.equal((await face.verify({ email: 'alice@x.test', token: 'l2', body })).status, 200)
  assert.equal((await face.verify({ email: 'alice@x.test', token: 'l2', body })).error, 'CHALLENGE')
})

test('9. échecs répétés : blocage temporaire progressif, jamais définitif', async () => {
  setup()
  login('alice@x.test', 'r1')
  await doEnroll('alice@x.test', 'r1', 'alice')
  login('alice@x.test', 'r2')
  let r
  for (let i = 0; i < 5; i++) r = await doVerify('alice@x.test', 'r2', 'bob')
  assert.equal(r.error, 'LOCKED')
  const until = Date.parse(r.until)
  assert.ok(until - Date.now() <= 15 * 60_000 + 1000)
  assert.equal((await doVerify('alice@x.test', 'r2', 'alice')).error, 'LOCKED')
  // Après le délai, l'utilisateur légitime passe
  const ch = face.newChallenge('r2', 'alice@x.test', 'verify', until + 1000)
  const ok = await face.verify({ email: 'alice@x.test', token: 'r2', now: until + 1000, body: { nonce: ch.nonce, frames: capture('alice', ch.steps) } })
  assert.equal(ok.status, 200)
  assert.ok(logs.some(([t]) => t === 'face_mismatch'))
})

test('10. le modèle d’un compte ne sert jamais à un autre ; défi lié à la session et au compte', async () => {
  setup()
  login('alice@x.test', 'c1')
  await doEnroll('alice@x.test', 'c1', 'alice')
  login('bob@x.test', 'c2')
  // Bob présente le visage d'Alice sur son propre compte (non inscrit) : rien à comparer
  assert.equal((await doVerify('bob@x.test', 'c2', 'alice')).error, 'NOT_ENROLLED')
  // Défi demandé par Alice, utilisé dans la session de Bob : refusé
  const ch = face.newChallenge('c1', 'alice@x.test', 'verify')
  assert.equal((await face.verify({ email: 'alice@x.test', token: 'c2', body: { nonce: ch.nonce, frames: capture('alice', ch.steps) } })).error, 'CHALLENGE')
  // Modèle chiffré copié vers un autre compte : ne se déchiffre pas
  const box = face.seal(vec(1), 'alice@x.test')
  assert.throws(() => face.unseal(box, 'bob@x.test'))
})

test('11. remplacer un visage inscrit exige le mot de passe ; 2FA et mot de passe restent exigés à la connexion', async () => {
  setup()
  login('alice@x.test', 'e1')
  await doEnroll('alice@x.test', 'e1', 'alice')
  assert.equal((await doEnroll('alice@x.test', 'e1', 'bob')).error, 'REAUTH')
  assert.equal((await doEnroll('alice@x.test', 'e1', 'bob', { body: { password: 'faux' } })).error, 'REAUTH')
  // Mot de passe seul : refusé ; mot de passe + code 2FA : il faut encore l'accord du Super Admin
  assert.equal((await doEnroll('alice@x.test', 'e1', 'alice', { body: { password: 'pw-alice@x.test' } })).error, 'REAUTH_2FA')
  assert.equal((await doEnroll('alice@x.test', 'e1', 'alice', { body: { password: 'pw-alice@x.test', code: '000000' } })).error, 'REAUTH_2FA')
  assert.equal((await doEnroll('alice@x.test', 'e1', 'alice', { body: { password: 'pw-alice@x.test', code: '123456' } })).error, 'APPROVAL')
  assert.ok(admins.some((t) => t.includes('ينتظر اعتماد المشرف')))
  assert.ok(face.faceAdmin().accounts.find((a) => a.email === 'alice@x.test').changeRequestedAt)
  face.approveChange('alice@x.test')
  assert.equal((await doEnroll('alice@x.test', 'e1', 'alice', { body: { password: 'pw-alice@x.test', code: '123456' } })).status, 200)
  assert.deepEqual(notices.at(-1), ['alice@x.test', 'reenroll'])
  assert.ok(admins.at(-1).includes('تم تغيير الوجه'))
  // L'accord ne sert qu'une fois
  assert.equal((await doEnroll('alice@x.test', 'e1', 'bob', { body: { password: 'pw-alice@x.test', code: '123456' } })).error, 'APPROVAL')
  // Première inscription dans une session vieille de plus de 15 minutes : nouvelle connexion exigée
  login('carol@x.test', 'e2', Date.now() - 20 * 60_000)
  assert.equal((await doEnroll('carol@x.test', 'e2', 'alice')).error, 'REAUTH')
  // Sans consentement explicite : rien n'est capturé
  login('dan@x.test', 'e3')
  const ch = face.newChallenge('e3', 'dan@x.test', 'enroll')
  assert.equal((await face.enroll({ email: 'dan@x.test', token: 'e3', session: sessions.get('e3'), body: { nonce: ch.nonce, frames: [] } })).error, 'CONSENT')
})

test('13. secours : exception limitée (72 h max) et journalisée ; 15. retrait et chiffrement au repos', async () => {
  setup()
  login('alice@x.test', 'x1')
  await doEnroll('alice@x.test', 'x1', 'alice')
  assert.throws(() => face.addException({ email: 'alice@x.test', hours: 10, reason: '' }, 'sa'))
  const x = face.addException({ email: 'alice@x.test', hours: 500, reason: 'caméra en panne' }, 'sa')
  assert.ok(Date.parse(x.until) - Date.now() <= 72 * 3600_000 + 1000)
  assert.equal(face.faceRequired('alice@x.test'), false)
  // Fichier des modèles : aucun nombre du vecteur en clair, aucune image
  const raw = fs.readFileSync(path.join(dir, 'face', 'templates.json'), 'utf8')
  assert.ok(!raw.includes(String(vec(1)[0]).slice(0, 8)))
  assert.ok(!/rgb|image|jpeg/i.test(raw))
  assert.equal(face.withdraw({ email: 'alice@x.test', body: { password: 'faux' } }).error, 'REAUTH')
  assert.equal(face.withdraw({ email: 'alice@x.test', body: { password: 'pw-alice@x.test' } }).status, 200)
  assert.equal(face.faceStateOf('alice@x.test').enrolled, false)
  // Vue Super Admin : statut seulement, aucune donnée biométrique
  assert.ok(!JSON.stringify(face.faceAdmin()).includes('"data"'))
})

test('mise en service : rien n’est exigé si le moteur manque, ni en mode off, et en mode تجريبي seulement pour la liste', () => {
  setup(false)
  assert.equal(face.faceRequired('alice@x.test'), false)
  assert.equal(face.faceGate('alice@x.test', {}, '/news'), '')
  setup(true)
  face.setFacePolicy({ mode: 'off' })
  assert.equal(face.faceRequired('alice@x.test'), false)
  face.setFacePolicy({ mode: 'trial', trial: ['AroundExpressions@gmail.com'] })
  assert.equal(face.faceRequired('aroundexpressions@gmail.com'), true)
  assert.equal(face.faceRequired('alice@x.test'), false)
})

test('partage de compte : retrait puis nouvelle inscription = remplacement (2FA + accord) ; Super Admin averti', async () => {
  setup()
  login('alice@x.test', 'w1')
  await doEnroll('alice@x.test', 'w1', 'alice')
  assert.ok(admins.at(-1).includes('تم تسجيل وجه جديد'))
  assert.equal(face.withdraw({ email: 'alice@x.test', body: { password: 'pw-alice@x.test' } }).status, 200)
  // Même dans une session toute neuve, le visage d'un tiers ne peut pas être inscrit sans 2FA et accord
  login('alice@x.test', 'w2')
  assert.equal((await doEnroll('alice@x.test', 'w2', 'bob')).error, 'REAUTH')
  assert.equal((await doEnroll('alice@x.test', 'w2', 'bob', { body: { password: 'pw-alice@x.test', code: '123456' } })).error, 'APPROVAL')
  // Réinitialisation par le Super Admin : nouvelle inscription permise (toujours avec mot de passe + 2FA)
  face.resetFace('alice@x.test')
  assert.equal((await doEnroll('alice@x.test', 'w2', 'alice', { body: { password: 'pw-alice@x.test', code: '123456' } })).status, 200)
})

test('clé FACE_KEY absente : aucune inscription, rien n’est exigé, aucun fichier de clé créé', async () => {
  setup(true, false)
  assert.equal(face.keyReady(), false)
  assert.equal(face.faceRequired('alice@x.test'), false)
  login('alice@x.test', 'k1')
  assert.equal((await doEnroll('alice@x.test', 'k1', 'alice')).error, 'KEY')
  assert.equal(fs.existsSync(path.join(dir, 'face', 'key')), false)
  assert.equal(face.faceAdmin().keyReady, false)
  process.env.FACE_KEY = TEST_KEY
})

test('panne du moteur : jamais comptée comme un échec, jamais de pause, Super Admin alerté', async () => {
  setup()
  login('alice@x.test', 'p1')
  await doEnroll('alice@x.test', 'p1', 'alice')
  login('alice@x.test', 'p2')
  const broken = { ready: () => true, info: () => ({ ready: true, missing: [] }), analyse: async () => { throw new Error('ENGINE_TIMEOUT') } }
  face.setFaceEngine(broken)
  admins.length = 0
  for (let i = 0; i < 8; i++) assert.equal((await doVerify('alice@x.test', 'p2', 'alice')).error, 'ENGINE_ERROR')
  assert.equal(face.faceStateOf('alice@x.test').lockedUntil, null)
  assert.equal(admins.length, 1)
  assert.ok(logs.some(([t, , d]) => t === 'face_engine_error' && d === 'ENGINE_TIMEOUT'))
  // Moteur réparé : la personne passe tout de suite
  face.setFaceEngine(fakeEngine(true))
  assert.equal((await doVerify('alice@x.test', 'p2', 'alice')).status, 200)
})

test('plusieurs images de face doivent toutes ressembler au modèle', async () => {
  setup()
  login('alice@x.test', 'm1')
  await doEnroll('alice@x.test', 'm1', 'alice')
  login('alice@x.test', 'm2')
  const ch = face.newChallenge('m2', 'alice@x.test', 'verify')
  // Une image de face d'Alice, l'autre de Bob : refusé
  let first = true
  const frames = ch.steps.map((s) => {
    if (s !== 'center') return frame('alice', s)
    const f = frame(first ? 'alice' : 'bob', s)
    first = false
    return f
  })
  assert.equal((await face.verify({ email: 'alice@x.test', token: 'm2', body: { nonce: ch.nonce, frames } })).error, 'MISMATCH')
})
