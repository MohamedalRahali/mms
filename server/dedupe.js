import { norm as normName } from './entities.js'

/**
 * Clé de doublon : même adresse (sans paramètres de suivi, « www. » ni barre finale) ou même titre normalisé (120 premiers
 * caractères, signes et voyelles courtes ignorés). Les deux clés d'une fiche sont reliées : une copie qui partage
 * l'une ou l'autre retombe sur la même clé. Les titres trop courts (moins de 12 caractères) ne relient rien.
 */
export function dedupeKeyer() {
  const seen = new Map()
  // Paramètres de suivi retirés (utm_…, fbclid…) ; les autres sont gardés (une vidéo YouTube = ?v=…)
  const urlKey = (u) => {
    try {
      const x = new URL(String(u))
      for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|igshid|mc_|ref$|s$)/i.test(k)) x.searchParams.delete(k)
      x.hash = ''
      return `${x.host.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}${x.search}`.toLowerCase()
    } catch {
      return String(u || '').toLowerCase()
    }
  }
  const titleKey = (t) => normName(String(t || '')).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 120)
  return (it) => {
    const keys = [it.url && `u:${urlKey(it.url)}`, titleKey(it.title).length >= 12 && `t:${titleKey(it.title)}`].filter(Boolean)
    const known = keys.map((k) => seen.get(k)).find(Boolean)
    const id = known || it.id
    for (const k of keys) if (!seen.has(k)) seen.set(k, id)
    return id
  }
}

/** Publications sans doublons (première occurrence de chaque actualité, dans l'ordre reçu) */
export function uniqueItems(items) {
  const key = dedupeKeyer()
  const seen = new Set()
  return items.filter((it) => {
    const k = key(it)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// Réseaux sociaux : leurs auteurs sont des comptes, pas des médias (compteurs de sources séparés)
export const SOCIAL_CHANNELS = new Set(['x', 'twitter', 'bluesky', 'facebook', 'instagram', 'telegram', 'tiktok', 'reddit', 'mastodon', 'youtube', 'linkedin', 'threads'])

/** Sources distinctes : médias d'un côté, comptes de réseaux sociaux de l'autre */
export function sourceSplit(items) {
  const media = new Set()
  const accounts = new Set()
  for (const it of items) (SOCIAL_CHANNELS.has(it.channel) ? accounts : media).add(it.origin)
  return { media: media.size, accounts: accounts.size }
}
