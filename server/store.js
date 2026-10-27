import fs from 'node:fs'
import path from 'node:path'
import { demoItems } from './demo.js'

/**
 * Lit les sorties des veilles et les ramène à un seul format d'actualité :
 * { id, flux, title, summary, category, date, origin, channel, lang, url, image, broadcasts, live,
 *   tone, people, orgs, places, importance, engagement,
 *   media, subType, ref, mediaUrl, transcription, author, parent, thread }
 *
 * media : article | broadcast | podcast | blog | comment | forum | social. Les anciens fichiers n'ont pas
 * ce champ : il est déduit du canal (tv, radio, youtube -> broadcast ; réseaux -> social ; reddit -> forum).
 * Les commentaires (media comment) sont gardés à part et rattachés à leur publication (parent.id = ref) :
 * ils n'entrent ni dans la liste par défaut, ni dans les statistiques des publications, ni dans les veilles.
 *
 * - Mosaïque FM : <MOSAIQUE_DATA_DIR>/<AAAA-MM-JJ>/actualites.json (rapport consolidé de la nuit),
 *   ou à défaut news/<HH>.json (extraction heure par heure de la journée en cours).
 * - Libye : tout fichier .json de <LIBYE_DATA_DIR>, liste d'actualités ou { actualites: [...] }.
 */

const RELOAD_MS = 30_000
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const TUNIS = '+01:00'

let cache = { at: 0, items: [], all: [], comments: [], reactions: new Map(), byId: new Map(), lastUpdate: null, demo: false }

// Sources ou canaux coupés depuis la console Super Admin : retirés de toute la plateforme
let hidden = null
let signature = ''
let previous = new Map() // id → { json, obj } de la lecture précédente
// Référentiel des entités (server/entities.js) : variantes fusionnées, médias retirés des acteurs, à chaque lecture
let resolver = null
export function setEntityResolver(fn) {
  resolver = fn
  cache.at = 0
  signature = ''
}
export function setHidden(fn) {
  hidden = fn
  cache.at = 0
  signature = ''
}

/** Empreinte des fichiers des veilles (noms, tailles, dates) : on ne relit et ne réanalyse que s'ils ont changé */
function filesSignature() {
  const parts = [process.env.MMS_MOSAIQUE, process.env.MMS_DEMO]
  const scan = (dir, depth) => {
    let names
    try {
      names = fs.readdirSync(dir)
    } catch {
      return
    }
    for (const name of names.sort()) {
      const file = path.join(dir, name)
      try {
        const st = fs.statSync(file)
        if (st.isDirectory()) depth > 0 && scan(file, depth - 1)
        else if (name.endsWith('.json')) parts.push(`${file}:${st.size}:${st.mtimeMs}`)
      } catch {
        /* fichier disparu entre deux lectures */
      }
    }
  }
  if (process.env.MMS_MOSAIQUE === '1') scan(process.env.MOSAIQUE_DATA_DIR, 2)
  scan(process.env.LIBYE_DATA_DIR, 0)
  return parts.join('|')
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function listOf(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.actualites)) return data.actualites
  return []
}

const clean = (v) => (typeof v === 'string' ? v.trim() : '')
// Liens venant des sources : http(s) ou chemin du site seulement ; javascript:, data:, vbscript:… sont écartés
const webUrl = (v) => {
  const u = clean(v)
  return /^https?:\/\//i.test(u) || (u.startsWith('/') && !u.startsWith('//')) ? u : ''
}
const normCategory = (c) => clean(c).toLowerCase() || 'autre'

function langCode(l) {
  const v = clean(l).toLowerCase()
  if (v.startsWith('ar')) return 'ar'
  if (v.startsWith('fr')) return 'fr'
  if (v.startsWith('en') || v.startsWith('an')) return 'en'
  if (v.startsWith('mix')) return 'mixte'
  return v
}

// Tonalité et entités ajoutées par le tri IA de la veille (champs ton et entites), absentes des anciennes fiches
const TONES = {
  positif: 'positive',
  positive: 'positive',
  neutre: 'neutral',
  neutral: 'neutral',
  negatif: 'negative',
  négatif: 'negative',
  negative: 'negative',
}
const toneOf = (v) => TONES[clean(v).toLowerCase()] || ''

/** Portée et engagement d'un post (vues, réactions, partages, commentaires), quand la source les donne */
function engagementOf(e) {
  if (!e || typeof e !== 'object') return undefined
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : undefined)
  const out = { views: n(e.vues), reactions: n(e.reactions), shares: n(e.partages), comments: n(e.commentaires) }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return Object.keys(out).length ? out : undefined
}
export const MEDIA_TYPES = ['article', 'broadcast', 'podcast', 'blog', 'comment', 'forum', 'social']
const BROADCAST = new Set(['tv', 'radio', 'youtube'])
const SOCIAL = new Set(['x', 'facebook', 'instagram', 'tiktok', 'linkedin', 'telegram', 'bluesky', 'mastodon'])

/** Type de média de la fiche, déduit du canal quand le collecteur ne l'a pas donné */
export function mediaOf(media, channel) {
  const m = clean(media).toLowerCase()
  if (MEDIA_TYPES.includes(m)) return m
  if (BROADCAST.has(channel)) return 'broadcast'
  if (SOCIAL.has(channel)) return 'social'
  if (channel === 'reddit') return 'forum'
  if (channel === 'podcast') return 'podcast'
  return 'article'
}

/** Place d'un message dans un forum : { forum, topic, topicUrl, messageId, replyTo } */
function threadOf(f) {
  if (!f || typeof f !== 'object') return undefined
  const out = {
    forum: clean(f.forum),
    topic: clean(f.sujet),
    topicUrl: webUrl(f.sujet_url),
    messageId: clean(String(f.message_id ?? '')),
    replyTo: clean(String(f.reponse_a ?? '')),
  }
  return out.forum || out.topic || out.messageId ? out : undefined
}

const names = (v) => (Array.isArray(v) ? [...new Set(v.map(clean).filter(Boolean))].slice(0, 8) : [])

function hhmm(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(clean(v))
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '00:00'
}

function loadMosaique(dir, track) {
  const items = []
  if (!dir || !fs.existsSync(dir)) return items
  for (const day of fs.readdirSync(dir)) {
    if (!DAY_RE.test(day)) continue
    const dayDir = path.join(dir, day)
    const digest = path.join(dayDir, 'actualites.json')
    let rows = []
    let live = false
    if (fs.existsSync(digest)) {
      rows = listOf(readJson(digest))
      track(digest)
    } else {
      const newsDir = path.join(dayDir, 'news')
      if (!fs.existsSync(newsDir)) continue
      live = true
      for (const f of fs
        .readdirSync(newsDir)
        .filter((f) => f.endsWith('.json'))
        .sort()) {
        rows.push(...listOf(readJson(path.join(newsDir, f))))
        track(path.join(newsDir, f))
      }
    }
    rows.forEach((n, i) => {
      const time = hhmm(n.premiere_diffusion || n.heure)
      items.push({
        id: `mosaique-${day}-${i}`,
        flux: 'mosaique',
        title: clean(n.titre),
        summary: clean(n.resume),
        category: normCategory(n.categorie),
        date: new Date(`${day}T${time}:00${TUNIS}`).toISOString(),
        origin: 'Mosaïque FM',
        channel: 'radio',
        lang: langCode(n.langue) || 'fr',
        url: '',
        broadcasts: Number(n.nb_diffusions) || 1,
        live,
      })
    })
  }
  return items
}

function loadLibye(dir, track) {
  const items = []
  if (!dir || !fs.existsSync(dir)) return items
  for (const f of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const file = path.join(dir, f)
    track(file)
    // Les réactions (commentaires, réponses) ont leur propre identifiant : la numérotation des autres fiches
    // du fichier ne bouge pas quand un commentaire arrive
    let i = 0
    for (const n of listOf(readJson(file))) {
      const reaction = !!(n.parent && clean(n.parent.id) && clean(n.ref))
      const index = reaction ? -1 : i++
      const date = new Date(n.date || n.publie_le || '')
      if (Number.isNaN(date.getTime())) continue
      const channel = clean(n.canal).toLowerCase() || 'site'
      items.push({
        id: reaction ? `libye-r-${clean(n.ref)}` : `libye-${path.basename(f, '.json')}-${index}`,
        flux: 'libye',
        title: clean(n.titre),
        summary: clean(n.resume),
        category: normCategory(n.categorie),
        date: date.toISOString(),
        origin: clean(n.source) || 'Source libyenne',
        channel,
        lang: langCode(n.langue) || 'ar',
        url: webUrl(n.url),
        image: webUrl(n.image),
        broadcasts: 1,
        live: false,
        tone: toneOf(n.ton),
        people: names(n.entites?.personnes),
        orgs: names(n.entites?.organisations),
        places: names(n.entites?.lieux),
        importance: Math.min(Math.max(Number(n.importance) || 1, 1), 3),
        engagement: engagementOf(n.engagement),
        media: mediaOf(n.media, channel),
        subType: clean(n.sous_type).toLowerCase() || (BROADCAST.has(channel) ? channel : ''),
        ref: clean(n.ref),
        mediaUrl: webUrl(n.media_url),
        // Audio de l'extrait (tranche enregistrée), quand la veille le publie : lecteur et passages cliquables
        clipUrl: webUrl(n.clip_url),
        transcription: clean(n.transcription),
        author: clean(n.auteur),
        parent: n.parent && typeof n.parent === 'object' ? { id: clean(n.parent.id), url: webUrl(n.parent.url), title: clean(n.parent.titre) } : undefined,
        thread: threadOf(n.fil),
      })
    }
  }
  return items
}

const urlKey = (u) =>
  clean(u)
    .split('#')[0]
    .replace(/\/+$/, '')
    .replace(/^https?:\/\/(www\.)?/, '')

/**
 * Rattache commentaires et réponses de forum à leur publication : nombre sur la fiche parente
 * (comments, replies) et listes gardées dans reactions (clé : ref de la fiche parente)
 */
function linkReactions(items, comments) {
  const byRef = new Map()
  const byUrl = new Map()
  for (const it of items) {
    if (it.ref) byRef.set(it.ref, it)
    if (it.url && !it.parent) byUrl.set(urlKey(it.url), it)
  }
  const reactions = new Map()
  const add = (r) => {
    const parent = byRef.get(r.parent?.id) || (r.parent?.url && byUrl.get(urlKey(r.parent.url)))
    if (!parent || parent === r) return false
    const key = parent.ref || parent.id
    if (!reactions.has(key)) reactions.set(key, [])
    reactions.get(key).push(r)
    r.parentId = parent.id
    if (r.media === 'comment') parent.comments = (parent.comments || 0) + 1
    else parent.replies = (parent.replies || 0) + 1
    return true
  }
  const linked = comments.filter(add)
  for (const it of items) if (it.parent && it.media === 'forum') add(it)
  for (const list of reactions.values()) list.sort((a, b) => a.date.localeCompare(b.date))
  return { reactions, comments: linked }
}

/** Commentaires d'une publication, ou fil d'un sujet de forum, avec la profondeur de chaque réponse */
export function reactionsOf(it) {
  const root = it.parentId ? cache.byId.get(it.parentId) || it : it
  const list = cache.reactions.get(root.ref || root.id) || []
  const top = new Set([root.ref, root.thread?.messageId, ''].filter((v) => v != null))
  const depth = new Map()
  return list.map((r) => {
    const up = r.thread?.replyTo || ''
    const d = top.has(up) ? 0 : depth.has(up) ? Math.min(depth.get(up) + 1, 4) : 1
    if (r.thread?.messageId) depth.set(r.thread.messageId, d)
    return { id: r.id, media: r.media, author: r.author || r.origin, text: r.summary, date: r.date, url: r.url, tone: r.tone, engagement: r.engagement, depth: d }
  })
}

/** Premier message du sujet d'une réponse de forum */
export function parentOf(it) {
  return it.parentId ? cache.byId.get(it.parentId) : undefined
}

export function getItems() {
  if (Date.now() - cache.at < RELOAD_MS) return cache
  // Rien n'a changé depuis la dernière lecture : on garde les fiches déjà analysées (et leurs caches de recherche)
  // ; les actualités d'exemple, datées par rapport à maintenant, sont toujours régénérées
  const sig = filesSignature()
  if (sig === signature && process.env.MMS_DEMO !== '1') {
    cache.at = Date.now()
    return cache
  }
  signature = sig
  let latest = 0
  const track = (file) => {
    try {
      latest = Math.max(latest, fs.statSync(file).mtimeMs)
    } catch {
      /* fichier disparu entre deux lectures */
    }
  }
  const items = [
    // Mosaïque FM n'est plus suivie ; MMS_MOSAIQUE=1 la réactive
    ...(process.env.MMS_MOSAIQUE === '1' ? loadMosaique(process.env.MOSAIQUE_DATA_DIR, track) : []),
    ...loadLibye(process.env.LIBYE_DATA_DIR, track),
  ].filter((n) => n.title)
  // Fiche identique à la lecture précédente : on reprend l'objet d'avant (remis à l'état lu, les liens
  // commentaires/réponses étant recalculés plus bas), pour garder les caches liés à l'objet
  const next = new Map()
  for (let k = 0; k < items.length; k++) {
    const it = items[k]
    if (!it.id || next.has(it.id)) continue
    const json = JSON.stringify(it)
    const old = previous.get(it.id)
    if (old && old.json === json) {
      for (const key of Object.keys(old.obj)) if (!(key in it)) delete old.obj[key]
      items[k] = Object.assign(old.obj, it)
    }
    next.set(it.id, { json, obj: items[k] })
  }
  previous = next
  const demo = process.env.MMS_DEMO === '1'
  if (demo) items.push(...demoItems())
  if (resolver) resolver(items)
  items.sort((a, b) => b.date.localeCompare(a.date))
  // Commentaires à part : seuls ceux dont la publication est dans MMS sont gardés
  const editorial = items.filter((it) => it.media !== 'comment')
  const visible = hidden ? editorial.filter((it) => !hidden(it)) : editorial
  const { reactions, comments } = linkReactions(
    visible,
    items.filter((it) => it.media === 'comment' && (!hidden || !hidden(it))),
  )
  cache = {
    at: Date.now(),
    items: visible,
    all: editorial,
    comments,
    reactions,
    byId: new Map(visible.map((it) => [it.id, it])),
    lastUpdate: latest ? new Date(latest).toISOString() : demo ? new Date().toISOString() : null,
    demo,
  }
  return cache
}
