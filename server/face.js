import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'

/**
 * التحقق بالوجه : empêche le partage d'un compte en vérifiant que la personne connectée est celle qui a enregistré
 * son visage sur ce compte. S'ajoute au mot de passe et à la double authentification, ne les remplace jamais.
 *
 * Parcours
 * - Inscription (première connexion après activation, ou nouveau compte) : explication, consentement explicite,
 *   caméra, défi de vivacité (regarder de face puis tourner la tête dans l'ordre demandé), contrôle de qualité
 *   (un seul visage, net, assez éclairé, assez grand), modèle de référence créé sur le serveur, chiffré.
 *   Autorisée seulement dans une session ouverte il y a moins de 15 minutes (mot de passe + double authentification),
 *   ou avec le mot de passe saisi à nouveau pour remplacer une inscription existante.
 * - Vérification à chaque nouvelle session : même capture, comparaison avec le modèle DU COMPTE CONNECTÉ seulement.
 *   Réussite : la session est marquée vérifiée. Échec : l'accès aux données reste fermé (FACE_REQUIRED).
 *
 * Protection des données
 * - Les images de la caméra ne sont jamais écrites : elles servent au calcul puis sont oubliées.
 * - Le modèle de référence (vecteur du visage) est chiffré en AES-256-GCM (clé FACE_KEY, ou clé générée dans
 *   data/face/key, lisible du seul service) dans data/face/templates.json. Aucune route ne le renvoie ; aucun journal
 *   ne le contient ; il est séparé de la photo de profil, qui ne peut pas servir de référence.
 * - Retrait du consentement : le modèle est supprimé ; un accès sans vérification ne peut alors être accordé que
 *   par une exception limitée dans le temps, donnée par le Super Admin, journalisée.
 *
 * Contre le contournement : défi à usage unique lié à la session (2 minutes), limite d'essais progressive
 * (5 échecs → 15 min, puis 30 min, 1 h… jusqu'à 4 h, jamais de blocage définitif), journal de sécurité sans donnée
 * biométrique, avertissement par e-mail à chaque changement d'inscription.
 *
 * Mise en service progressive : « off » (par défaut), « trial » (comptes listés seulement), « on » (tous les comptes).
 * Tant que le moteur de reconnaissance n'est pas installé, rien n'est exigé : personne ne peut être bloqué dehors.
 */

const CHALLENGE_MS = 2 * 60_000
const FRESH_MS = 15 * 60_000
const MAX_FAILS = 5
const BASE_LOCK = 15 * 60_000
const MAX_LOCK = 4 * 3600_000
const MAX_FRAMES = 8
// rodage : tous les comptes s'inscrivent à leur prochaine connexion, mais pendant RODAGE_DAYS un échec ne bloque pas
// (cause journalisée, alerte au Super Admin) ; à la fin, passage automatique au blocage (« on »)
const MODES = ['off', 'trial', 'rodage', 'on']
const RODAGE_DAYS = 7

let dir = ''
let confFile = ''
let templatesFile = ''
let diagFile = ''
let diag = [] // diagnostic du pilote : chiffres arrondis seulement (aucune image, aucun vecteur), 14 jours au plus
let key = null
// approveChange : remplacer un visage déjà inscrit exige l'accord du Super Admin (« اعتماد المشرف لتغيير الوجه »)
// Seuil de ressemblance : 0,363, valeur publiée par OpenCV pour SFace (cosinus). Chaque image de face doit le
// dépasser (au moins 2 images par vérification) : une seule image ressemblante par hasard ne suffit pas.
const THRESHOLD = 0.363
let conf = { mode: 'off', trial: [], exceptions: [], approveChange: true }
let templates = {}
let status = {} // compte → { enrolledAt, lastOkAt, lastFailAt, fails, lockUntil, locks } (sans donnée biométrique)
let engine = { ready: () => false, info: () => ({ ready: false, missing: ['models'] }) }
let hooks = { log: () => {}, notify: async () => {}, notifyAdmins: async () => {}, verifyPassword: () => false, verifySecondFactor: () => false, markSession: () => {}, sessionOf: () => null }
const challenges = new Map() // nonce → { token, email, steps, at, purpose }

export const setFaceEngine = (e) => (engine = e)

export function initFace(dataDir, h = {}) {
  dir = path.join(dataDir, 'face')
  confFile = path.join(dataDir, 'superadmin', 'face.json')
  templatesFile = path.join(dir, 'templates.json')
  diagFile = path.join(dir, 'pilot-diagnostics.json')
  try {
    diag = JSON.parse(fs.readFileSync(diagFile, 'utf8')).entries || []
  } catch {
    diag = []
  }
  hooks = { ...hooks, ...h }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  key = loadKey()
  if (!key) console.warn('التحقق بالوجه : FACE_KEY absente (fichier .env du service) ; aucune inscription possible')
  try {
    const c = JSON.parse(fs.readFileSync(confFile, 'utf8'))
    conf = { ...conf, ...c, mode: MODES.includes(c.mode) ? c.mode : 'off', trial: (c.trial || []).map(low), exceptions: c.exceptions || [], approveChange: c.approveChange !== false, rodageStart: c.rodageStart || null, diagOnUntil: c.diagOnUntil || null }
    // Mode « on » déjà actif sans fenêtre de diagnostic : 7 jours à partir de maintenant, une seule fois
    if (conf.mode === 'on' && !conf.diagOnUntil) {
      conf.diagOnUntil = new Date(Date.now() + DIAG_ON_DAYS * 86_400_000).toISOString()
      saveConf()
    }
  } catch {
    // Réglages par défaut : désactivé
    conf = { mode: 'off', trial: [], exceptions: [], approveChange: true, rodageStart: null }
  }
  try {
    const t = JSON.parse(fs.readFileSync(templatesFile, 'utf8'))
    templates = t.templates || {}
    status = t.status || {}
  } catch {
    templates = {}
    status = {}
  }
}

const low = (s) => String(s || '').trim().toLowerCase()

/**
 * Clé de chiffrement : uniquement FACE_KEY (fichier .env du service, hors du dossier des données et de ses
 * sauvegardes). Sans elle, aucun modèle n'est enregistré : jamais de modèle chiffré avec une clé posée à côté.
 */
function loadKey() {
  const k = Buffer.from(String(process.env.FACE_KEY || ''), 'base64')
  return k.length === 32 ? k : null
}
export const keyReady = () => Boolean(key)

function writeAtomic(file, text, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text, { mode })
  fs.renameSync(tmp, file)
}
const saveTemplates = () => writeAtomic(templatesFile, JSON.stringify({ templates, status }))
const saveConf = () => writeAtomic(confFile, JSON.stringify(conf, null, 1), 0o644)

/* ---------------------------------------------------------------- diagnostic du pilote */

const DIAG_DAYS = 14
const r2 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null)
/** Mode en vigueur : un rodage terminé devient « on » sans intervention */
export function effectiveMode(now = Date.now()) {
  if (conf.mode === 'rodage' && rodageEnds() && now >= Date.parse(rodageEnds())) return 'on'
  return conf.mode
}
export const rodageEnds = () => (conf.mode === 'rodage' && conf.rodageStart ? new Date(Date.parse(conf.rodageStart) + RODAGE_DAYS * 86_400_000).toISOString() : null)
const inRodage = (now = Date.now()) => effectiveMode(now) === 'rodage'
// Diagnostic : comptes du pilote en mode تجريبي, tous les comptes pendant le rodage, et tous les comptes pendant les
// 7 premiers jours du mode « on » (arrêt automatique ensuite ; mêmes garanties : chiffres arrondis seulement)
const DIAG_ON_DAYS = 7
const diagOnActive = (now = Date.now()) => effectiveMode(now) === 'on' && Boolean(conf.diagOnUntil) && now < Date.parse(conf.diagOnUntil)
const inPilot = (email) => (conf.mode === 'trial' && conf.trial.includes(low(email))) || inRodage() || diagOnActive()
function purgeDiag(now = Date.now()) {
  const keep = diag.filter((d) => now - Date.parse(d.at) < DIAG_DAYS * 86_400_000 && inPilot(d.email))
  if (keep.length !== diag.length || (!keep.length && fs.existsSync(diagFile))) {
    diag = keep
    if (diag.length) writeAtomic(diagFile, JSON.stringify({ entries: diag }))
    else fs.rmSync(diagFile, { force: true })
  }
}
/** Enregistré seulement pour un compte de la liste du pilote et seulement en mode « تجريبي » */
function recordDiag(email, kind, result, frames, sims, now = Date.now()) {
  if (!inPilot(email)) return
  diag.push({ at: new Date(now).toISOString(), email: low(email), kind, result, frames, similarity: sims?.map(r2) || [] })
  diag = diag.slice(-500)
  purgeDiag(now)
  writeAtomic(diagFile, JSON.stringify({ entries: diag }))
}
export const faceDiagnostics = () => (purgeDiag(), [...diag].reverse())

/* ---------------------------------------------------------------- chiffrement du modèle de référence */

export function seal(vector, email) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key, iv)
  // Le compte fait partie des données authentifiées : un modèle copié vers un autre compte ne se déchiffre pas
  c.setAAD(Buffer.from(low(email)))
  const data = Buffer.concat([c.update(Buffer.from(Float32Array.from(vector).buffer)), c.final()])
  return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') }
}

export function unseal(box, email) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'))
  d.setAAD(Buffer.from(low(email)))
  d.setAuthTag(Buffer.from(box.tag, 'base64'))
  const raw = Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()])
  return Array.from(new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4))
}

const norm = (v) => {
  const n = Math.hypot(...v) || 1
  return v.map((x) => x / n)
}
export const cosine = (a, b) => norm(a).reduce((s, x, i) => s + x * norm(b)[i], 0)

/* ---------------------------------------------------------------- politique */

const activeException = (email, now = Date.now()) => conf.exceptions.find((x) => low(x.email) === low(email) && Date.parse(x.until) > now)

/** La vérification est-elle exigée pour ce compte, maintenant ? */
export function faceRequired(email) {
  if (!engine.ready() || !key) return false
  if (activeException(email)) return false
  const mode = effectiveMode()
  if (mode === 'on' || mode === 'rodage') return true
  return mode === 'trial' && conf.trial.includes(low(email))
}

/** État pour l'interface du compte (jamais de donnée biométrique) */
export function faceStateOf(email, session) {
  const st = status[low(email)] || {}
  return {
    required: faceRequired(email),
    enrolled: Boolean(templates[low(email)]),
    verified: Boolean(session?.face),
    lockedUntil: st.lockUntil && st.lockUntil > Date.now() ? new Date(st.lockUntil).toISOString() : null,
    engine: engine.ready() && Boolean(key),
    changeApproved: Boolean(st.approvedUntil && st.approvedUntil > Date.now()),
    exceptionUntil: activeException(email)?.until || null,
    // Rodage : « لاحقاً » possible et un échec ne bloque pas, jusqu'à cette date
    soft: inRodage(),
    softUntil: inRodage() ? rodageEnds() : null,
  }
}

/** Contrôle d'accès appelé par requireAuth : '' si permis, sinon le code d'erreur */
const OPEN = /^\/(face|auth|support|platform|exports\/check)(\/|$)/
export function faceGate(email, session, p) {
  if (OPEN.test(p)) return ''
  if (!faceRequired(email)) return ''
  if (session?.face) return ''
  // Rodage : « لاحقاً » ou échec non bloquant pour cette session
  if (session?.faceSoft && inRodage()) return ''
  return 'FACE_REQUIRED'
}

/* ---------------------------------------------------------------- rodage : jamais bloquant, alertes au Super Admin */

const softAlerts = new Map() // compte → dernière alerte (une par 6 heures et par compte)
function softPass(email, token, cause, sims, now = Date.now()) {
  hooks.markSession(token, { faceSoft: now })
  // Écart net (toutes les images très loin du modèle) : signe probable d'un compte utilisé par une autre personne
  const sharing = cause === 'MISMATCH' && sims?.length && sims.every((s) => s < 0.2)
  hooks.log(sharing ? 'face_rodage_sharing' : 'face_rodage_pass', email, cause)
  const last = softAlerts.get(low(email)) || 0
  if (sharing || now - last > 6 * 3600_000) {
    softAlerts.set(low(email), now)
    hooks.notifyAdmins(
      sharing
        ? `تنبيه: احتمال استعمال الحساب ${email} من شخص آخر (الوجه لا يطابق الوجه المسجل إطلاقاً). فترة التجربة: لم يُمنع الدخول.`
        : `فترة تجربة التحقق بالوجه: لم ينجح التحقق للحساب ${email} (السبب: ${cause}). لم يُمنع الدخول.`,
    )?.catch?.(() => {})
  }
  return { soft: true }
}

/** « لاحقاً » pendant le rodage (pas de caméra, refus du consentement) : accès pour cette session, journalisé */
export function deferFace({ email, token, body, now = Date.now() }) {
  if (!inRodage(now)) return { status: 403, error: 'NOT_RODAGE' }
  const reason = ['nocamera', 'consent', 'later'].includes(body?.reason) ? body.reason : 'later'
  hooks.markSession(token, { faceSoft: now })
  hooks.log('face_deferred', email, reason)
  return { status: 200 }
}

/* ---------------------------------------------------------------- défi de vivacité */

// Deux images de face au moins (comparées chacune au modèle), et les deux côtés dans un ordre tiré au hasard
const STEP_SETS = [
  ['center', 'left', 'center', 'right'],
  ['center', 'right', 'center', 'left'],
  ['center', 'left', 'right', 'center'],
  ['center', 'right', 'left', 'center'],
]
const MIN_CENTER = 2

export function newChallenge(token, email, purpose, now = Date.now()) {
  for (const [n, c] of challenges) if (now - c.at > CHALLENGE_MS) challenges.delete(n)
  const nonce = crypto.randomBytes(18).toString('base64url')
  const steps = STEP_SETS[crypto.randomInt(STEP_SETS.length)]
  challenges.set(nonce, { token, email: low(email), steps, at: now, purpose })
  return { nonce, steps, expiresIn: CHALLENGE_MS / 1000 }
}

function takeChallenge(nonce, token, email, purpose, now = Date.now()) {
  const c = challenges.get(String(nonce || ''))
  challenges.delete(String(nonce || ''))
  if (!c || now - c.at > CHALLENGE_MS || c.token !== token || c.email !== low(email) || c.purpose !== purpose) return null
  return c
}

/* ---------------------------------------------------------------- analyse des images */

/** Images de la caméra : RGB brut 320×240 en base64 (aucun décodeur d'image nécessaire, rien n'est écrit) */
export function parseFrames(body) {
  const frames = Array.isArray(body?.frames) ? body.frames.slice(0, MAX_FRAMES) : []
  return frames
    .map((f) => {
      const w = Number(f?.w)
      const h = Number(f?.h)
      if (!(w >= 160 && w <= 640 && h >= 120 && h <= 480)) return null
      const buf = Buffer.from(String(f?.rgb || ''), 'base64')
      return buf.length === w * h * 3 ? { w, h, rgb: buf, step: String(f?.step || '') } : null
    })
    .filter(Boolean)
}

/**
 * Analyse commune à l'inscription et à la vérification : un seul visage par image, qualité, vivacité (défi de pose
 * dans l'ordre demandé, et score anti-fraude passif), puis vecteur moyen du visage. Renvoie { ok, code, vector }.
 */
// Causes détaillées (journal et diagnostic) → message montré à la personne : photo ou pose = un seul message générique
const USER_CODE = { SPOOF: 'LIVENESS', POSE: 'LIVENESS' }
export async function analyse(frames, steps) {
  if (frames.length < steps.length) return { ok: false, code: 'CAPTURE', cause: 'CAPTURE', frames: [] }
  const vectors = []
  const seen = []
  let cause = ''
  for (let i = 0; i < frames.length; i++) {
    let r
    try {
      r = await engine.analyse(frames[i])
    } catch (err) {
      // Panne du moteur (modèle absent, chargement, délai) : jamais un échec de la personne
      return { ok: false, code: 'ENGINE_ERROR', engineError: String(err?.message || err).slice(0, 120), frames: seen }
    }
    const want = steps[i] ?? 'center'
    seen.push({ asked: want, seen: r.pose || null, ratio: r2(r.ratio), live: r2(r.liveScore), faces: r.faces, quality: r.quality ?? null, width: r2(r.metrics?.width), lum: r2(r.metrics?.lum), sharp: r2(r.metrics?.sharp) })
    // Toutes les images sont analysées (diagnostic complet) ; la première cause d'échec est retenue
    if (!cause) {
      if (r.faces === 0) cause = 'NO_FACE'
      else if (r.faces > 1) cause = 'MULTI_FACE'
      else if (!r.quality) cause = 'QUALITY'
      else if (!r.live) cause = 'SPOOF'
      // Pose attendue pour cette image (le défi est imposé par le serveur, dans un ordre aléatoire)
      else if (r.pose !== want) cause = 'POSE'
    }
    if (!cause && r.pose === 'center' && r.vector) vectors.push(r.vector)
  }
  if (!cause && vectors.length < MIN_CENTER) cause = 'QUALITY'
  if (cause) return { ok: false, code: USER_CODE[cause] || cause, cause, frames: seen }
  const mean = norm(vectors[0].map((_, k) => vectors.reduce((s, v) => s + v[k], 0) / vectors.length))
  return { ok: true, vector: mean, vectors, frames: seen }
}

// Panne du moteur : journal, alerte au Super Admin (une fois par heure au plus), message clair, aucune pénalité
let engineAlertAt = 0
function engineFailed(email, detail, now = Date.now()) {
  hooks.log('face_engine_error', email, detail)
  if (now - engineAlertAt > 3600_000) {
    engineAlertAt = now
    hooks.notifyAdmins(`عطل في محرك التحقق بالوجه: ${detail}. لم تُحتسب أي محاولة فاشلة على المستخدمين.`)?.catch?.(() => {})
  }
  return { status: 503, error: 'ENGINE_ERROR' }
}

/* ---------------------------------------------------------------- essais et blocages */

function failed(email, now = Date.now()) {
  const k = low(email)
  const st = (status[k] ||= {})
  st.fails = (st.fails || 0) + 1
  st.lastFailAt = new Date(now).toISOString()
  if (st.fails >= MAX_FAILS) {
    st.locks = (st.locks || 0) + 1
    st.lockUntil = now + Math.min(BASE_LOCK * 2 ** (st.locks - 1), MAX_LOCK)
    st.fails = 0
  }
  saveTemplates()
  return st
}
const lockedUntil = (email, now = Date.now()) => {
  const st = status[low(email)]
  return st?.lockUntil && st.lockUntil > now ? st.lockUntil : 0
}

/* ---------------------------------------------------------------- inscription et vérification */

export async function enroll({ email, session, token, body, now = Date.now() }) {
  if (!engine.ready()) return { status: 503, error: 'ENGINE' }
  // Clé de chiffrement absente : aucun modèle ne peut être enregistré (message réservé au Super Admin)
  if (!key) return { status: 503, error: 'KEY' }
  if (body?.consent !== true) return { status: 400, error: 'CONSENT' }
  const k = low(email)
  const st0 = status[k] || {}
  // Remplacement : visage déjà inscrit, ou inscrit puis retiré (sinon un retrait suivi d'une nouvelle inscription
  // permettrait d'inscrire le visage d'un tiers). Mot de passe + code 2FA, et accord du Super Admin si exigé.
  const replacing = Boolean(templates[k] || st0.everEnrolled)
  if (replacing) {
    if (!hooks.verifyPassword(email, String(body?.password || ''))) return { status: 401, error: 'REAUTH' }
    if (!hooks.verifySecondFactor(email, String(body?.code || ''))) return { status: 401, error: 'REAUTH_2FA' }
    if (conf.approveChange && !(st0.approvedUntil > now)) {
      if (!st0.changeRequestedAt || now - Date.parse(st0.changeRequestedAt) > 3600_000) {
        status[k] = { ...st0, changeRequestedAt: new Date(now).toISOString() }
        saveTemplates()
        hooks.log('face_change_request', email, '')
        hooks.notifyAdmins(`طلب تغيير الوجه المسجل للحساب ${email} ينتظر اعتماد المشرف.`)?.catch?.(() => {})
      }
      return { status: 403, error: 'APPROVAL' }
    }
  } else if (!session || now - session.at > FRESH_MS) return { status: 401, error: 'REAUTH' }
  if (!inRodage(now) && lockedUntil(email, now)) return { status: 429, error: 'LOCKED', until: new Date(lockedUntil(email, now)).toISOString() }
  const ch = takeChallenge(body?.nonce, token, email, 'enroll', now)
  if (!ch) return { status: 400, error: 'CHALLENGE' }
  const r = await analyse(parseFrames(body), ch.steps)
  if (r.engineError) return engineFailed(email, r.engineError, now)
  recordDiag(email, 'enroll', r.ok ? 'OK' : r.cause, r.frames, null, now)
  if (!r.ok) {
    hooks.log('face_enroll_fail', email, r.cause)
    if (inRodage(now)) return { status: 422, error: r.code, ...softPass(email, token, r.cause, null, now) }
    failed(email, now)
    return { status: 422, error: r.code }
  }
  const replaced = replacing
  templates[k] = { ...seal(r.vector, email), at: new Date(now).toISOString(), consentAt: new Date(now).toISOString() }
  // Accord du Super Admin consommé : un seul changement par accord
  status[k] = { ...(status[k] || {}), enrolledAt: new Date(now).toISOString(), everEnrolled: true, fails: 0, lockUntil: 0, approvedUntil: 0, changeRequestedAt: null }
  saveTemplates()
  // L'inscription vaut vérification pour la session en cours
  hooks.markSession(token, { face: now })
  hooks.log(replaced ? 'face_reenroll' : 'face_enroll', email, '')
  hooks.notify(email, replaced ? 'reenroll' : 'enroll')?.catch?.(() => {})
  hooks.notifyAdmins(replaced ? `تم تغيير الوجه المسجل للحساب ${email}.` : `تم تسجيل وجه جديد للحساب ${email}.`)?.catch?.(() => {})
  return { status: 200 }
}

export async function verify({ email, token, body, now = Date.now() }) {
  if (!engine.ready()) return { status: 503, error: 'ENGINE' }
  const k = low(email)
  const box = templates[k]
  if (!box) return { status: 409, error: 'NOT_ENROLLED' }
  if (!inRodage(now) && lockedUntil(email, now)) return { status: 429, error: 'LOCKED', until: new Date(lockedUntil(email, now)).toISOString() }
  const ch = takeChallenge(body?.nonce, token, email, 'verify', now)
  if (!ch) return { status: 400, error: 'CHALLENGE' }
  const r = await analyse(parseFrames(body), ch.steps)
  if (r.engineError) return engineFailed(email, r.engineError, now)
  if (!r.ok) {
    recordDiag(email, 'verify', r.cause, r.frames, null, now)
    hooks.log('face_verify_fail', email, r.cause)
    if (inRodage(now)) return { status: 422, error: r.code, ...softPass(email, token, r.cause, null, now) }
    const st = failed(email, now)
    return { status: 422, error: st.lockUntil > now ? 'LOCKED' : r.code, ...(st.lockUntil > now ? { until: new Date(st.lockUntil).toISOString() } : {}) }
  }
  // Comparaison avec le modèle du compte connecté uniquement ; chaque image de face doit ressembler
  let ref
  try {
    ref = unseal(box, email)
  } catch {
    return engineFailed(email, 'TEMPLATE_UNREADABLE', now)
  }
  const sims = r.vectors.map((v) => cosine(v, ref))
  const same = sims.every((s) => s >= THRESHOLD)
  recordDiag(email, 'verify', same ? 'OK' : 'MISMATCH', r.frames, sims, now)
  if (!same) {
    hooks.log('face_mismatch', email, '')
    if (inRodage(now)) return { status: 422, error: 'MISMATCH', ...softPass(email, token, 'MISMATCH', sims, now) }
    const st = failed(email, now)
    return { status: 422, error: st.lockUntil > now ? 'LOCKED' : 'MISMATCH', ...(st.lockUntil > now ? { until: new Date(st.lockUntil).toISOString() } : {}) }
  }
  status[k] = { ...(status[k] || {}), lastOkAt: new Date(now).toISOString(), fails: 0 }
  saveTemplates()
  hooks.markSession(token, { face: now })
  hooks.log('face_ok', email, '')
  return { status: 200 }
}

/** Retrait du consentement par l'utilisateur (mot de passe exigé) : le modèle est effacé */
export function withdraw({ email, body }) {
  if (!hooks.verifyPassword(email, String(body?.password || ''))) return { status: 401, error: 'REAUTH' }
  const k = low(email)
  if (!templates[k]) return { status: 200 }
  delete templates[k]
  status[k] = { ...(status[k] || {}), enrolledAt: null, withdrawnAt: new Date().toISOString() }
  saveTemplates()
  hooks.log('face_withdraw', email, '')
  hooks.notify(email, 'withdraw')?.catch?.(() => {})
  hooks.notifyAdmins(`سحب المستخدم ${email} موافقته وحُذف نموذج وجهه.`)?.catch?.(() => {})
  return { status: 200 }
}

/* ---------------------------------------------------------------- Super Admin (jamais de donnée biométrique) */

export function faceAdmin() {
  return {
    mode: conf.mode,
    effectiveMode: effectiveMode(),
    rodageStart: conf.mode === 'rodage' ? conf.rodageStart : null,
    rodageEnds: rodageEnds(),
    diagnosticsUntil: diagOnActive() ? conf.diagOnUntil : inRodage() ? rodageEnds() : null,
    trial: conf.trial,
    approveChange: conf.approveChange,
    keyReady: Boolean(key),
    engine: engine.info(),
    exceptions: conf.exceptions.filter((x) => Date.parse(x.until) > Date.now()),
    accounts: Object.entries(status).map(([email, s]) => ({
      email,
      enrolled: Boolean(templates[email]),
      enrolledAt: s.enrolledAt || null,
      lastOkAt: s.lastOkAt || null,
      lastFailAt: s.lastFailAt || null,
      lockedUntil: s.lockUntil && s.lockUntil > Date.now() ? new Date(s.lockUntil).toISOString() : null,
      changeRequestedAt: s.changeRequestedAt || null,
      approvedUntil: s.approvedUntil && s.approvedUntil > Date.now() ? new Date(s.approvedUntil).toISOString() : null,
    })),
  }
}

export function setFacePolicy(body) {
  const mode = MODES.includes(body?.mode) ? body.mode : conf.mode
  const trial = Array.isArray(body?.trial) ? [...new Set(body.trial.map(low).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))].slice(0, 50) : conf.trial
  const approveChange = typeof body?.approveChange === 'boolean' ? body.approveChange : conf.approveChange
  // Début du rodage : compte à rebours de 7 jours (conservé si on réenregistre le même mode)
  const rodageStart = mode === 'rodage' ? (conf.mode === 'rodage' && conf.rodageStart ? conf.rodageStart : new Date().toISOString()) : null
  // Entrée en rodage : pauses et compteurs d'échecs effacés (personne ne reste bloqué par l'ancien mode)
  if (mode === 'rodage' && conf.mode !== 'rodage') {
    for (const st of Object.values(status)) Object.assign(st, { fails: 0, lockUntil: 0, locks: 0 })
    saveTemplates()
  }
  // Passage en « on » : diagnostic pendant 7 jours, puis arrêt automatique
  const diagOnUntil = mode === 'on' ? (conf.mode === 'on' && conf.diagOnUntil ? conf.diagOnUntil : new Date(Date.now() + DIAG_ON_DAYS * 86_400_000).toISOString()) : null
  conf = { ...conf, mode, trial, approveChange, rodageStart, diagOnUntil }
  saveConf()
  // Fin du pilote (mode changé ou compte retiré de la liste) : son diagnostic est effacé
  purgeDiag()
  return faceAdmin()
}

/** Exception limitée (72 h au plus) pour un utilisateur légitime qui ne peut pas passer la vérification */
export function addException(body, by) {
  const email = low(body?.email)
  const reason = String(body?.reason || '').trim().slice(0, 300)
  const hours = Math.max(1, Math.min(72, Number(body?.hours) || 24))
  if (!email || reason.length < 5) throw Object.assign(new Error('BAD_REQUEST'), { status: 400, code: 'BAD_REQUEST' })
  const x = { email, until: new Date(Date.now() + hours * 3600_000).toISOString(), reason, by, at: new Date().toISOString() }
  conf.exceptions = [...conf.exceptions.filter((e) => Date.parse(e.until) > Date.now() && low(e.email) !== email), x]
  saveConf()
  return x
}

/** Accord du Super Admin pour un changement de visage : valable 24 heures, pour un seul changement */
export function approveChange(email, now = Date.now()) {
  const k = low(email)
  status[k] = { ...(status[k] || {}), approvedUntil: now + 24 * 3600_000 }
  saveTemplates()
  return new Date(status[k].approvedUntil).toISOString()
}

/** Réinitialisation par le Super Admin : modèle effacé ; nouvelle inscription (mot de passe + 2FA) dans les 7 jours */
export function resetFace(email) {
  const k = low(email)
  const had = Boolean(templates[k])
  delete templates[k]
  status[k] = { ...(status[k] || {}), enrolledAt: null, fails: 0, lockUntil: 0, locks: 0, approvedUntil: Date.now() + 7 * 86_400_000 }
  saveTemplates()
  if (had) hooks.notify(email, 'reset')?.catch?.(() => {})
  return had
}

/* ---------------------------------------------------------------- guidage en direct pendant le défi */

const probes = new Map() // nonce → nombre de sondages (120 au plus par défi)
export async function probeFrame({ email, token, body, now = Date.now() }) {
  if (!engine.ready() || !key) return { status: 503, error: 'ENGINE' }
  const nonce = String(body?.nonce || '')
  const c = challenges.get(nonce)
  // Le défi doit être celui de cette session et de ce compte ; il n'est pas consommé
  if (!c || now - c.at > CHALLENGE_MS || c.token !== token || c.email !== low(email)) return { status: 400, error: 'CHALLENGE' }
  const n = (probes.get(nonce) || 0) + 1
  probes.set(nonce, n)
  if (n > 120) return { status: 429, error: 'TOO_MANY' }
  const [frame] = parseFrames({ frames: [body?.frame] })
  if (!frame) return { status: 400, error: 'CAPTURE' }
  try {
    const r = await engine.probe(frame)
    return { status: 200, body: { faces: r.faces, pose: r.pose || null } }
  } catch (err) {
    return engineFailed(email, String(err?.message || err).slice(0, 120), now)
  }
}

/* ---------------------------------------------------------------- routes de l'utilisateur connecté */

export function mountFace(app) {
  const big = express.json({ limit: '3mb' })
  const ctx = (req) => {
    const s = hooks.sessionOf(req)
    return { email: req.user.email, session: s?.session, token: s?.token }
  }
  app.get('/api/face/status', (req, res) => res.json(faceStateOf(req.user.email, ctx(req).session)))
  app.post('/api/face/challenge', express.json({ limit: '1kb' }), (req, res) => {
    if (!engine.ready()) return res.status(503).json({ error: 'ENGINE' })
    const { token, email } = ctx(req)
    const purpose = req.body?.purpose === 'enroll' ? 'enroll' : 'verify'
    res.json(newChallenge(token, email, purpose))
  })
  const send = (res, r) => res.status(r.status).json(r.status === 200 ? { ok: true } : { error: r.error, ...(r.until ? { until: r.until } : {}), ...(r.soft ? { soft: true } : {}) })
  app.post('/api/face/enroll', big, async (req, res) => send(res, await enroll({ ...ctx(req), body: req.body })))
  app.post('/api/face/verify', big, async (req, res) => send(res, await verify({ ...ctx(req), body: req.body })))
  app.post('/api/face/probe', express.json({ limit: '400kb' }), async (req, res) => {
    const r = await probeFrame({ ...ctx(req), body: req.body })
    res.status(r.status).json(r.body || { error: r.error })
  })
  app.post('/api/face/defer', express.json({ limit: '1kb' }), (req, res) => send(res, deferFace({ ...ctx(req), body: req.body })))
  app.post('/api/face/withdraw', express.json({ limit: '2kb' }), (req, res) => send(res, withdraw({ email: req.user.email, body: req.body })))
}
