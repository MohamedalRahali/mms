import fs from 'node:fs'
import path from 'node:path'

/**
 * Pays et portée (audience) de chaque source, réglés dans la console Super Admin (مصادر التغذية).
 *
 * - Stockage : data/superadmin/source-meta.json, { name: { country, reach } } ; une valeur absente = valeur par défaut.
 * - Pays par défaut : catalogue du collecteur (libyen: true → LY), sinon domaine du site (.ly, .tn, aljazeera.net…), sinon inconnu.
 * - Portée par défaut : estimation selon le canal (télévision, radio, site, réseau social…). C'est un ordre de grandeur,
 *   affiché comme « تقديري » tant que le Super Admin n'a pas saisi de chiffre.
 * - Fiabilité (high, medium, low) : réglée par le Super Admin ; par défaut, site officiel (.gov) → high, réseaux sociaux,
 *   forums, blogs et commentaires → low, autres médias et réseaux sociaux → medium.
 */

let file = ''
let meta = {}
let catalog = null
const guessMemo = new Map()

export const DEFAULT_REACH = { tv: 250_000, radio: 60_000, youtube: 30_000, site: 15_000, facebook: 20_000, x: 8000, twitter: 8000, telegram: 10_000, instagram: 10_000, tiktok: 15_000, linkedin: 5000, podcast: 4000, blog: 3000, forum: 1500, comment: 0 }
const FALLBACK_REACH = 10_000
const MAX_REACH = 1_000_000_000

// Domaines génériques (.com, .net) dont le pays est connu
const KNOWN_HOSTS = {
  'aljazeera.net': 'QA',
  'aljazeera.com': 'QA',
  'alarabiya.net': 'AE',
  'skynewsarabia.com': 'AE',
  'asharq.com': 'SA',
  'aawsat.com': 'GB',
  'alaraby.co.uk': 'GB',
  'bbc.com': 'GB',
  'bbc.co.uk': 'GB',
  'reuters.com': 'GB',
  'france24.com': 'FR',
  'rfi.fr': 'FR',
  'lemonde.fr': 'FR',
  'rt.com': 'RU',
  'cnn.com': 'US',
  'apnews.com': 'US',
  'aa.com.tr': 'TR',
  'trtarabi.com': 'TR',
  'dw.com': 'DE',
  'youm7.com': 'EG',
  'almasryalyoum.com': 'EG',
  'libyaobserver.ly': 'LY',
  'libyaherald.com': 'LY',
  'alwasat.ly': 'LY',
  'libyaalahrar.net': 'LY',
  'almarsad.co': 'LY',
  'libyaupdate.com': 'LY',
  'agenzianova.com': 'IT',
  'ansa.it': 'IT',
}
// ccTLD → code pays ISO (presque toujours identiques, sauf .uk)
const TLD_FIX = { uk: 'GB' }
const GENERIC = new Set(['com', 'net', 'org', 'info', 'io', 'co', 'tv', 'news', 'me', 'online', 'site', 'app', 'media', 'press', 'live', 'biz'])

export function initSourceMeta(dir) {
  file = path.join(dir, 'source-meta.json')
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).sources || {}
    meta = {}
    for (const [name, v] of Object.entries(saved)) {
      const row = cleanRow(v)
      if (row) meta[name] = row
    }
  } catch {
    meta = {}
  }
  guessMemo.clear()
}

function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ savedAt: new Date().toISOString(), sources: meta }, null, 2))
  fs.renameSync(tmp, file)
}

function cleanRow(v) {
  const country = /^[A-Z]{2}$/.test(String(v?.country || '').toUpperCase()) ? String(v.country).toUpperCase() : ''
  const n = Number(v?.reach)
  const reach = v?.reach === null || v?.reach === '' || v?.reach === undefined || !Number.isFinite(n) ? null : Math.min(Math.max(Math.round(n), 0), MAX_REACH)
  const reliability = RELIABILITY.includes(v?.reliability) ? v.reliability : ''
  return country || reach !== null || reliability ? { country, reach, ...(reliability ? { reliability } : {}) } : null
}

/** Réglage d'une source par le Super Admin ; pays '' et portée null = retour aux valeurs par défaut */
export function setSourceMeta(name, value) {
  const key = String(name || '').slice(0, 200)
  if (!key) return null
  // Champs absents de la demande : valeur enregistrée gardée (le pays et la portée se règlent sans toucher la fiabilité)
  const given = Object.fromEntries(Object.entries(value || {}).filter(([, v]) => v !== undefined))
  const row = cleanRow({ ...(meta[key] || {}), ...given })
  if (row) meta[key] = row
  else delete meta[key]
  guessMemo.delete(key)
  save()
  return meta[key] || null
}

export const sourceMetaOf = (name) => meta[name] || null

// Quatre niveaux (audit v5) : agence ou média établi > média en ligne > compte social identifié > compte anonyme ou
// non vérifié. « social » se place entre « medium » et « low ».
export const RELIABILITY = ['high', 'medium', 'social', 'low']
const SOCIAL = new Set(['x', 'twitter', 'bluesky', 'facebook', 'instagram', 'telegram', 'tiktok', 'mastodon', 'youtube', 'linkedin', 'threads'])
// Forums, blogs et commentaires : non vérifiés par nature
const LOW_CHANNELS = new Set(['reddit', 'blog', 'forum', 'comment'])
// Agences de presse et services publics d'information (fiabilité élevée par défaut, modifiable par le Super Admin)
const HIGH_HOSTS = ['reuters.com', 'apnews.com', 'afp.com', 'bbc.com', 'bbc.co.uk', 'dw.com', 'france24.com', 'rfi.fr', 'ansa.it', 'aa.com.tr', 'lana.ly', 'lana-news.ly', 'un.org', 'unsmil.unmissions.org']
// Chaînes et médias établis reconnaissables sur les réseaux (compte officiel d'un média = compte identifié de confiance)
const KNOWN_MEDIA = /الجزيرة|jazeera|العربية|arabiya|الحدث|hadath|سكاي نيوز|sky ?news|france ?24|فرانس ?24|bbc|بي بي سي|\bdw\b|reuters|رويترز|\bafp\b|\bap\b|الوسط|wasat|الأحرار|ahrar|\b218\b|الوطنية|wataniya|الرسمية|rasmia|النبأ|nabaa|libya ?observer|libya ?herald|libya ?review|العربي الجديد|alaraby|الشرق الأوسط|aawsat|anadolu|الأناضول|وكالة|agency|news agency/i

/**
 * Compte social anonyme : pseudonyme sans nom réel — pseudo par défaut à 6 chiffres ou plus (« @Muratti39803483 »),
 * soulignés en tête ou en fin (« @__Ghost__007_ »), mots d'anonymat (ghost, anon, shadow, مجهول…), ou poignée seule
 * faite surtout de chiffres et de symboles. Sans nombre d'abonnés ni badge vérifié dans les données, ce sont les seuls
 * indices fiables ; un compte d'un média connu ou un nom à plusieurs mots n'est jamais anonyme.
 */
export function anonymousHandle(name) {
  const raw = String(name || '').trim()
  if (!raw) return true
  if (KNOWN_MEDIA.test(raw)) return false
  const handle = raw.replace(/^@/, '').split(/\s*[·|(]\s*/)[0]
  // Nom affiché à plusieurs mots (« Mohamed Ali », « وزارة الخارجية ») : identifié
  if (/\s/.test(handle) && /\p{L}{2,}\s+\p{L}{2,}/u.test(handle)) return false
  if (/\d{6,}/.test(handle)) return true
  if (/^_|_$|__/.test(handle)) return true
  if (/ghost|anon|shadow|incognito|unknown|\bfake|مجهول|شبح|متخفي/i.test(handle)) return true
  const letters = (handle.match(/\p{L}/gu) || []).length
  return letters < Math.max(3, handle.length * 0.5)
}

/** Type de source : agency, established, online, social, anonymous, forum (indice de fiabilité, revue de presse) */
export function sourceTier(it) {
  const set = meta[it?.origin]?.reliability
  let host = ''
  try {
    host = new URL(it?.url || '').hostname.toLowerCase()
  } catch {
    host = ''
  }
  if (/(^|\.)gov(\.[a-z]{2})?$|\.gov\.|(^|\.)gouv\./.test(host) || HIGH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'agency'
  if (LOW_CHANNELS.has(it?.channel) || ['forum', 'comment'].includes(it?.media)) return 'forum'
  if (SOCIAL.has(it?.channel)) return set === 'high' || KNOWN_MEDIA.test(it?.origin || '') ? 'social' : anonymousHandle(it?.origin) ? 'anonymous' : 'social'
  // Médias établis : TV, radio, presse, ou site du catalogue de la veille (sources.yaml, choisi à la main)
  if (['tv', 'radio', 'press', 'presse'].includes(it?.channel) || readCatalog().has(it?.origin || '') || KNOWN_MEDIA.test(it?.origin || '')) return 'established'
  return 'online'
}

const TIER_LEVEL = { agency: 'high', established: 'high', online: 'medium', social: 'social', anonymous: 'low', forum: 'low' }

/** Fiabilité d'une source : réglage du Super Admin, sinon déduite du type de source (sourceTier) */
export function reliabilityOf(it) {
  const set = meta[it?.origin]?.reliability
  if (set) return set
  return TIER_LEVEL[sourceTier(it)] || 'medium'
}
export const reliabilityIsSet = (origin) => Boolean(meta[origin]?.reliability)

/** Catalogue du collecteur Libye : nom → { libyen, url } (lu une fois) */
function readCatalog() {
  if (catalog) return catalog
  catalog = new Map()
  const candidates = [process.env.LIBYE_SOURCES_FILE, '/opt/veille-libye/sources.yaml', file && path.resolve(path.dirname(file), '../../../veille-libye/veille-libye/sources.yaml')].filter(Boolean)
  const found = candidates.find((f) => fs.existsSync(f))
  if (!found) return catalog
  for (const line of fs.readFileSync(found, 'utf8').split('\n')) {
    const m = /^\s*-\s*\{(.*)\}\s*$/.exec(line)
    if (!m) continue
    const val = (k) => {
      const f = new RegExp(`(?:^|,)\\s*${k}:\\s*(?:"([^"]*)"|([^,}]*))`).exec(m[1])
      return f ? (f[1] ?? f[2] ?? '').trim() : ''
    }
    const name = val('nom')
    if (name) catalog.set(name, { libyen: val('libyen') === 'true', url: val('url') })
  }
  return catalog
}

/** Pays déduit de l'adresse d'un site, ou '' */
export function countryFromUrl(url) {
  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
  for (const [h, cc] of Object.entries(KNOWN_HOSTS)) if (host === h || host.endsWith(`.${h}`)) return cc
  const parts = host.split('.')
  const tld = parts[parts.length - 1]
  if (/^[a-z]{2}$/.test(tld) && !GENERIC.has(tld)) return TLD_FIX[tld] || tld.toUpperCase()
  return ''
}

/** Pays d'une fiche : réglage du Super Admin, sinon catalogue du collecteur, sinon domaine */
export function countryOf(it) {
  const origin = it?.origin || ''
  const set = meta[origin]?.country
  if (set) return set
  if (guessMemo.has(origin)) return guessMemo.get(origin) || countryFromUrl(it.url)
  const cat = readCatalog().get(origin)
  const guess = cat?.libyen ? 'LY' : cat?.url ? countryFromUrl(cat.url) : ''
  guessMemo.set(origin, guess)
  return guess || countryFromUrl(it.url)
}

/** Portée estimée par défaut, selon le canal de la fiche */
export function defaultReach(it) {
  const key = String(it?.subType || it?.channel || it?.media || '').toLowerCase()
  return DEFAULT_REACH[key] ?? DEFAULT_REACH[String(it?.media || '').toLowerCase()] ?? FALLBACK_REACH
}

/** Portée d'une fiche : chiffre saisi pour sa source, sinon estimation par canal */
export function reachOf(it) {
  const set = meta[it?.origin]?.reach
  return set ?? defaultReach(it)
}

export const reachIsSet = (origin) => meta[origin]?.reach != null
