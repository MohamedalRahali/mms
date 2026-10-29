import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Double authentification (التحقق بخطوتين) : codes à 6 chiffres renouvelés toutes les 30 s (TOTP, RFC 6238),
 * compatibles avec Google Authenticator, Microsoft Authenticator, FreeOTP… et 10 codes de secours à usage unique.
 * Règle réglée dans la console Super Admin (data/superadmin/mfa.json) : obligatoire pour les administrateurs
 * (par défaut), ou pour tous. Personne n'est bloqué dehors : un compte concerné qui n'a pas encore activé la double
 * authentification est conduit à l'activer à la connexion, et le Super Admin peut la réinitialiser.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP = 30
const DIGITS = 6

export function base32Encode(buf) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text) {
  const clean = String(text || '').toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out = []
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export const newSecret = () => base32Encode(crypto.randomBytes(20))

/** Code TOTP pour un pas de temps donné */
export function totpAt(secret, step) {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(step))
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest()
  const o = h[h.length - 1] & 15
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 10 ** DIGITS).padStart(DIGITS, '0')
}

export const stepOf = (t = Date.now()) => Math.floor(t / 1000 / STEP)

/**
 * Vérifie un code (décalage d'horloge de ±1 pas toléré). Renvoie le pas accepté, ou -1.
 * lastStep : dernier pas déjà utilisé par ce compte, refusé (un code ne sert qu'une fois).
 */
export function verifyTotp(secret, code, { now = Date.now(), lastStep = -1 } = {}) {
  const c = String(code || '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(c)) return -1
  const s = stepOf(now)
  for (const k of [s, s - 1, s + 1]) {
    if (k <= lastStep) continue
    const a = Buffer.from(totpAt(secret, k))
    if (crypto.timingSafeEqual(a, Buffer.from(c))) return k
  }
  return -1
}

/** Adresse otpauth:// à ouvrir dans l'application d'authentification (ou à saisir à la main avec la clé) */
export const otpauthUri = (secret, account, issuer = 'MMS Radar') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=${DIGITS}&period=${STEP}`

const hashCode = (code) => crypto.createHash('sha256').update(String(code).replace(/[\s-]/g, '').toUpperCase()).digest('hex')

/** 10 codes de secours (affichés une fois) et leurs empreintes (gardées) */
export function recoveryCodes(n = 10) {
  const codes = Array.from({ length: n }, () => {
    const raw = base32Encode(crypto.randomBytes(6)).slice(0, 10)
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
  return { codes, hashes: codes.map(hashCode) }
}

/** Consomme un code de secours : renvoie la liste d'empreintes restante, ou null si le code est inconnu */
export function useRecovery(hashes, code) {
  const h = hashCode(code)
  const list = Array.isArray(hashes) ? hashes : []
  if (!list.includes(h)) return null
  return list.filter((x) => x !== h)
}

/* ---------------------------------------------------------------- règle (console Super Admin) */

let file = ''
// Règle par défaut depuis le 29/10/2026 (consigne d'Around) : obligatoire pour tous les comptes. Transition sans
// blocage : un compte sans double authentification est invité à l'activer à sa prochaine connexion (écran
// MFA_SETUP : QR code, vérification, codes de secours) ; le Super Admin peut réinitialiser un compte perdu.
let policy = { requireAdmins: true, requireAll: true }
const POLICY_VERSION = 2

export function initMfaPolicy(dir) {
  file = path.join(dir, 'mfa.json')
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    // Règle enregistrée avant la version 2 (obligatoire pour les administrateurs seulement) : passe à « tous »
    const all = saved.version >= POLICY_VERSION ? saved.requireAll === true : true
    policy = { requireAdmins: saved.requireAdmins !== false, requireAll: all }
  } catch {
    // Pas de règle enregistrée : obligatoire pour tous
    policy = { requireAdmins: true, requireAll: true }
  }
}

export const mfaPolicy = () => ({ ...policy })

export function setMfaPolicy(p) {
  policy = { requireAdmins: p?.requireAdmins !== false, requireAll: p?.requireAll === true }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ ...policy, version: POLICY_VERSION, savedAt: new Date().toISOString() }, null, 2))
  return mfaPolicy()
}

/** La double authentification est-elle exigée pour ce compte ? */
export const mfaRequired = (user) => policy.requireAll || (policy.requireAdmins && (user?.role || 'admin') === 'admin')
