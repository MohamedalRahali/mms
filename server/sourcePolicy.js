import fs from 'node:fs'
import path from 'node:path'

/**
 * Politique des sources sociales et des forums (audit v3) : comptes automatiques (bots), comptes personnels et forums
 * inappropriés écartés ; « r/u/X » et « r/u_X » ramenés à un seul nom ; liste blanche facultative des forums.
 *
 * Réglage : data/superadmin/source-policy.json (console Super Admin) — { blocked: [...], forumAllow: [...] }.
 * Les règles par défaut ci-dessous s'appliquent toujours ; la liste blanche, si elle n'est pas vide, ne garde que
 * les forums listés (les autres canaux ne sont pas concernés).
 */

// Fils Reddit automatiques ou hors sujet relevés par l'audit v3, et motifs de comptes automatiques ou inappropriés
const DEFAULT_BLOCKED = ['r/AutoNewspaper', 'r/ALJAZEERAauto', 'r/MapPorn', 'r/MilitaryPorn', 'r/WhitePeopleTwitter']
const BOT_PATTERNS = [/^r\/\w*auto$/i, /^r\/auto\w*newspaper/i, /porn/i, /nsfw/i, /\bbot$/i, /_bot\b/i]

let file = ''
let policy = { blocked: [], forumAllow: [] }

export function initSourcePolicy(dir) {
  file = path.join(dir, 'source-policy.json')
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    policy = { blocked: list(saved.blocked), forumAllow: list(saved.forumAllow) }
  } catch {
    policy = { blocked: [], forumAllow: [] }
  }
}

const list = (v) =>
  (Array.isArray(v) ? v : String(v || '').split(/[\n,]+/))
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, 500)

export const sourcePolicy = () => ({ ...policy, defaults: DEFAULT_BLOCKED })

export function setSourcePolicy(body) {
  policy = { blocked: list(body?.blocked), forumAllow: list(body?.forumAllow) }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(policy, null, 2))
  return sourcePolicy()
}

/** Nom d'auteur ou de fil Reddit normalisé : « r/u/X », « r/u_X », « u/X » → « u/X » ; « R/Libya » → « r/Libya » */
export function canonicalOrigin(origin) {
  const o = String(origin || '').trim()
  const user = /^(?:r\/)?u[/_]([\w-]+)$/i.exec(o)
  if (user) return `u/${user[1]}`
  const sub = /^r\/([\w-]+)$/i.exec(o)
  if (sub) return `r/${sub[1]}`
  return o
}

const lower = (s) => String(s || '').toLowerCase()

/** Vrai si la fiche vient d'une source écartée : défauts, liste du Super Admin, comptes Reddit personnels, forums hors liste blanche */
export function excludedBySource(it) {
  const o = canonicalOrigin(it.origin)
  const lo = lower(o)
  if (DEFAULT_BLOCKED.some((b) => lower(b) === lo) || policy.blocked.some((b) => lower(canonicalOrigin(b)) === lo)) return true
  const social = it.channel === 'reddit' || it.media === 'forum' || it.media === 'social'
  if (social && BOT_PATTERNS.some((re) => re.test(o))) return true
  // Comptes personnels Reddit (u/…) : pas des médias, ni des forums
  if (it.channel === 'reddit' && lo.startsWith('u/')) return true
  if (policy.forumAllow.length && it.media === 'forum' && !policy.forumAllow.some((f) => lower(canonicalOrigin(f)) === lo)) return true
  return false
}
